import { and, asc, count, eq, gte, ilike, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { routes, type TeamMember } from '@boramarca/shared';
import {
  aiDecisions,
  appointments,
  clients,
  conversations,
  kitLeads,
  messages,
  professionals,
  salons,
  whatsappSessions,
  workingHours,
} from '../../db/schema';
import { audit } from '../../lib/audit';
import { AppError, notFound, pgCode, PG_UNIQUE } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';
import { addDays, todayIn, zonedToUtc } from '../../lib/time';
import { removeTeamMember } from '../auth/account';
import { lastServiceName, lastVisitAt, noShowCount, onWaitlist, visitsCount } from '../clients';
import { monthDates, salonReports } from './reports';

/** A cell that a spreadsheet could run as a formula is prefixed with ' (CSV injection). */
const csvCell = (v: string | number | boolean | null) => {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string' && !/^\+\d+$/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Owner panel (`/salon/*`, role owner, scoped to the owner's salon) + POST /kit-leads. */
const salon: FastifyPluginAsync = async (app) => {
  const s = routes.salon;
  const db = app.db;

  const teamIds = async (salonId: string) =>
    (
      await db
        .select({ id: professionals.id })
        .from(professionals)
        .where(eq(professionals.salonId, salonId))
    ).map((r) => r.id);

  async function members(salonId: string, id?: string): Promise<TeamMember[]> {
    const rows = await db
      .select({
        p: professionals,
        whatsappStatus: whatsappSessions.status,
        servicesCount: sql<number>`(select count(*)::int from services s where s.professional_id = ${professionals.id} and s.active)`,
      })
      .from(professionals)
      .leftJoin(whatsappSessions, eq(whatsappSessions.professionalId, professionals.id))
      .where(and(eq(professionals.salonId, salonId), id ? eq(professionals.id, id) : undefined))
      .orderBy(asc(professionals.createdAt));
    const hours = rows.length
      ? await db
          .select()
          .from(workingHours)
          .where(
            inArray(
              workingHours.professionalId,
              rows.map((r) => r.p.id),
            ),
          )
          .orderBy(asc(workingHours.weekday))
      : [];
    return rows.map((r) => ({
      id: r.p.id,
      name: r.p.name,
      phone: r.p.phone,
      role: r.p.role,
      professions: r.p.professions,
      servicesCount: r.servicesCount,
      whatsappStatus: r.whatsappStatus ?? 'disconnected',
      workingHours: hours.filter((h) => h.professionalId === r.p.id).map(wire),
    }));
  }
  const member = async (salonId: string, id: string) => {
    const [m] = await members(salonId, id);
    if (!m) throw notFound('Profissional');
    return m;
  };
  const uniquePhone = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      if (pgCode(err) === PG_UNIQUE)
        throw new AppError(409, 'PHONE_TAKEN', 'Esse telefone já tem uma conta no Bora Marca');
      throw err;
    }
  };

  route(app, s.day, async (req) => {
    const team = await members(req.scope.salonId);
    const [sal] = await db.select().from(salons).where(eq(salons.id, req.scope.salonId));
    const days = await Promise.all(team.map((m) => app.agenda.getDay(m.id, req.query.date)));
    const pending = (
      await Promise.all(team.map((m) => app.messaging.decisions.list(m.id, 'pending', 50)))
    )
      .flat()
      .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
    return {
      date: req.query.date,
      timezone: sal!.timezone,
      columns: team.map((m, i) => ({
        professional: { id: m.id, name: m.name, role: m.role },
        workingHours: days[i]!.workingHours,
        appointments: days[i]!.appointments,
      })),
      pendingDecisions: pending,
    };
  });

  route(app, s.reports, async (req) => salonReports(db, req.scope.salonId, req.query.month));

  route(app, s.team.list, async (req) => ({ items: await members(req.scope.salonId) }));
  route(app, s.team.get, async (req) => member(req.scope.salonId, req.params.id));
  route(app, s.team.create, async (req) => {
    const [p] = await uniquePhone(() =>
      db
        .insert(professionals)
        .values({ ...req.body, salonId: req.scope.salonId, role: 'professional' })
        .returning(),
    );
    await audit(db, req.scope.professionalId, 'professional', 'salon.team_added', {
      memberId: p!.id,
    });
    return member(req.scope.salonId, p!.id);
  });
  route(app, s.team.update, async (req) => {
    await member(req.scope.salonId, req.params.id);
    if (Object.keys(req.body).length)
      await uniquePhone(() =>
        db
          .update(professionals)
          .set(req.body)
          .where(
            and(eq(professionals.id, req.params.id), eq(professionals.salonId, req.scope.salonId)),
          ),
      );
    return member(req.scope.salonId, req.params.id);
  });
  // Removing someone erases their data like an account deletion (WhatsApp instance included).
  route(app, s.team.remove, async (req) => {
    await removeTeamMember(app.messaging.core, req.scope.salonId, req.params.id);
    await audit(db, req.scope.professionalId, 'professional', 'salon.team_removed', {
      memberId: req.params.id,
    });
    return { ok: true as const };
  });

  route(app, s.clients, async (req, reply) => {
    const { search, inactiveDays, professionalId, format, limit } = req.query;
    const ids = await teamIds(req.scope.salonId);
    if (professionalId && !ids.includes(professionalId)) throw notFound('Profissional');
    const filters: (SQL | undefined)[] = [
      inArray(clients.professionalId, professionalId ? [professionalId] : ids),
    ];
    if (search) {
      const digits = search.replace(/\D/g, '');
      filters.push(
        or(
          ilike(clients.name, `%${search}%`),
          digits ? like(clients.phone, `%${digits}%`) : undefined,
        ),
      );
    }
    if (req.query.onWaitlist !== undefined)
      filters.push(req.query.onWaitlist ? sql`${onWaitlist}` : sql`not ${onWaitlist}`);
    if (inactiveDays)
      filters.push(sql`${lastVisitAt} < now() - make_interval(days => ${inactiveDays})`);
    const csv = format === 'csv';
    // shortcut: offset cursor, as in /clients; the CSV export always has every row.
    const offset = csv ? 0 : Number(req.query.cursor ?? 0) || 0;
    const q = db
      .select({
        c: clients,
        professionalName: professionals.name,
        lastVisitAt,
        lastServiceName,
        visitsCount,
        noShowCount,
        onWaitlist,
      })
      .from(clients)
      .innerJoin(professionals, eq(professionals.id, clients.professionalId))
      .where(and(...filters))
      .orderBy(asc(clients.name), asc(clients.id));
    const rows = csv ? await q : await q.limit(limit + 1).offset(offset);
    const items = rows
      .slice(0, csv ? rows.length : limit)
      .map(({ c, lastVisitAt: lv, ...agg }) => ({
        ...wire(c),
        ...agg,
        lastVisitAt: lv ? lv.toISOString() : null,
      }));
    if (csv) {
      await audit(db, req.scope.professionalId, 'professional', 'salon.clients_exported', {
        rows: items.length,
      });
      const header = [
        'nome',
        'telefone',
        'profissional',
        'ultima_visita',
        'ultimo_servico',
        'visitas',
        'faltas',
        'lista_de_espera',
      ];
      const lines = items.map((i) =>
        [
          i.name,
          i.phone,
          i.professionalName,
          i.lastVisitAt,
          i.lastServiceName,
          i.visitsCount,
          i.noShowCount,
          i.onWaitlist ? 'sim' : 'nao',
        ]
          .map(csvCell)
          .join(','),
      );
      // The CSV bypasses the JSON serializer of the contract (same columns).
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="clientes.csv"')
        .serializer((p: unknown) => p as string)
        .send(`\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`) as never;
    }
    return { items, nextCursor: rows.length > limit ? String(offset + limit) : null };
  });

  /** Professional id of a row of `table` in the owner's salon; 404 otherwise (isolation). */
  async function ownerOf(
    table: typeof aiDecisions | typeof appointments,
    id: string,
    salonId: string,
  ): Promise<string> {
    const [row] = await db
      .select({ pid: table.professionalId })
      .from(table)
      .innerJoin(professionals, eq(professionals.id, table.professionalId))
      .where(and(eq(table.id, id), eq(professionals.salonId, salonId)));
    if (!row) throw notFound(table === aiDecisions ? 'Decisão' : 'Agendamento');
    return row.pid;
  }

  // Same service as POST /decisions/:id/answer, on behalf of the professional; audited as the owner.
  route(app, s.answerDecision, async (req) => {
    const pid = await ownerOf(aiDecisions, req.params.id, req.scope.salonId);
    const r = await app.messaging.decisions.answer(pid, req.params.id, req.body);
    await audit(db, pid, 'professional', 'salon.decision_answered_by_owner', {
      decisionId: req.params.id,
      ownerId: req.scope.professionalId,
    });
    return r;
  });

  // Drag to reschedule in the panel: the agenda motor checks the slot of that professional.
  route(app, s.rescheduleAppointment, async (req) => {
    const pid = await ownerOf(appointments, req.params.id, req.scope.salonId);
    const { notifyClient, messageText } = req.body;
    const r = await app.agenda.reschedule(
      { professionalId: pid, actor: 'professional' },
      req.params.id,
      {
        ...req.body,
        notice: { notifyClient, messageText },
      },
    );
    await audit(db, pid, 'professional', 'salon.appointment_rescheduled_by_owner', {
      appointmentId: req.params.id,
      ownerId: req.scope.professionalId,
    });
    return r;
  });

  route(app, s.plan, async (req) => {
    const salonId = req.scope.salonId;
    const [sal] = await db.select().from(salons).where(eq(salons.id, salonId));
    const ids = await teamIds(salonId);
    const today = todayIn(sal!.timezone, app.now());
    const month = today.slice(0, 7);
    const next = addDays(monthDates(month).at(-1)!, 1);
    const from = zonedToUtc(`${month}-01`, 0, sal!.timezone);
    const to = zonedToUtc(next, 0, sal!.timezone);
    const [[m], [d], [a], [k]] = await Promise.all([
      db
        .select({ n: count() })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(
          and(
            inArray(conversations.professionalId, ids),
            gte(messages.createdAt, from),
            lt(messages.createdAt, to),
          ),
        ),
      db
        .select({ n: count() })
        .from(aiDecisions)
        .where(
          and(
            inArray(aiDecisions.professionalId, ids),
            gte(aiDecisions.createdAt, from),
            lt(aiDecisions.createdAt, to),
          ),
        ),
      db
        .select({ n: count() })
        .from(appointments)
        .where(
          and(
            inArray(appointments.professionalId, ids),
            gte(appointments.createdAt, from),
            lt(appointments.createdAt, to),
          ),
        ),
      db.select({ n: count() }).from(kitLeads).where(inArray(kitLeads.professionalId, ids)),
    ]);
    return {
      plan: sal!.plan,
      activeProfessionals: ids.length,
      usage: {
        messagesThisMonth: m?.n ?? 0,
        decisionsThisMonth: d?.n ?? 0,
        appointmentsThisMonth: a?.n ?? 0,
      },
      kitInterestSent: (k?.n ?? 0) > 0,
    };
  });

  route(app, s.kitLead, async (req) => {
    const [row] = await db
      .insert(kitLeads)
      .values({ professionalId: req.scope.professionalId, note: req.body.note })
      .returning();
    await audit(db, req.scope.professionalId, 'professional', 'kit_lead.created', {
      kitLeadId: row!.id,
    });
    return wire(row!);
  });
};

export default salon;
