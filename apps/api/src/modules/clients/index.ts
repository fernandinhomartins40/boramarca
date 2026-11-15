import { and, asc, desc, eq, ilike, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { ACTIVE_APPOINTMENT_STATUSES, routes } from '@boramarca/shared';
import { appointments, clients } from '../../db/schema';
import { AppError, notFound, pgCode, PG_UNIQUE } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';

const phoneTaken = () => new AppError(409, 'PHONE_TAKEN', 'Já existe um cliente com esse telefone');
const uniquePhone = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (err) {
    if (pgCode(err) === PG_UNIQUE) throw phoneTaken();
    throw err;
  }
};

// Per-client aggregates over appointments ("done" counts as a visit). Plain SQL with aliases:
// drizzle leaves columns unqualified in single-table selects, which would be ambiguous here.
const visitsCount = sql<number>`(select count(*)::int from appointments a where a.client_id = clients.id and a.status = 'done')`;
const noShowCount = sql<number>`(select count(*)::int from appointments a where a.client_id = clients.id and a.status = 'no_show')`;
const lastVisitAt =
  sql<Date | null>`(select max(a.starts_at) from appointments a where a.client_id = clients.id and a.status = 'done')`.mapWith(
    appointments.startsAt,
  );
const lastServiceName = sql<
  string | null
>`(select s.name from appointment_services s join appointments a on a.id = s.appointment_id where a.client_id = clients.id and a.status = 'done' order by a.starts_at desc, s.created_at limit 1)`;
const onWaitlist = sql<boolean>`exists(select 1 from waitlist_entries w where w.client_id = clients.id and w.status in ('waiting', 'offered'))`;

/** CRUD /clients + GET /clients/:id/stats, always scoped to the authenticated professional. */
const clientsModule: FastifyPluginAsync = async (app) => {
  const db = app.db;
  const c = routes.clients;
  const own = (pid: string, id: string) => and(eq(clients.id, id), eq(clients.professionalId, pid));

  route(app, c.list, async (req) => {
    const { search, sort, inactiveDays, limit } = req.query;
    // shortcut: offset cursor; switch to keyset pagination if client lists reach thousands.
    const offset = Number(req.query.cursor ?? 0) || 0;
    const filters: (SQL | undefined)[] = [eq(clients.professionalId, req.scope.professionalId)];
    if (search) {
      const digits = search.replace(/\D/g, '');
      filters.push(
        or(
          ilike(clients.name, `%${search}%`),
          digits ? like(clients.phone, `%${digits}%`) : undefined,
        ),
      );
    }
    if (inactiveDays)
      filters.push(sql`${lastVisitAt} < now() - make_interval(days => ${inactiveDays})`);
    const order =
      sort === 'name'
        ? [asc(clients.name)]
        : sort === 'frequent'
          ? [desc(visitsCount), asc(clients.name)]
          : [sql`${lastVisitAt} desc nulls last`, desc(clients.createdAt)];
    const rows = await db
      .select({ c: clients, lastVisitAt, lastServiceName, visitsCount, noShowCount, onWaitlist })
      .from(clients)
      .where(and(...filters))
      .orderBy(...order)
      .limit(limit + 1)
      .offset(offset);
    const page = rows.slice(0, limit);
    return {
      items: page.map(({ c: row, lastVisitAt: lv, ...agg }) => ({
        ...wire(row),
        ...agg,
        lastVisitAt: lv ? lv.toISOString() : null,
      })),
      nextCursor: rows.length > limit ? String(offset + limit) : null,
    };
  });

  route(app, c.create, async (req) =>
    uniquePhone(async () => {
      const [row] = await db
        .insert(clients)
        .values({
          ...req.body,
          preferences: req.body.preferences ?? { notes: [] },
          professionalId: req.scope.professionalId,
          origin: 'manual',
        })
        .returning();
      return wire(row!);
    }),
  );

  route(app, c.get, async (req) => {
    const [row] = await db
      .select()
      .from(clients)
      .where(own(req.scope.professionalId, req.params.id));
    if (!row) throw notFound('Cliente');
    return wire(row);
  });

  route(app, c.update, async (req) =>
    uniquePhone(async () => {
      const [row] = await db
        .update(clients)
        .set(req.body)
        .where(own(req.scope.professionalId, req.params.id))
        .returning();
      if (!row) throw notFound('Cliente');
      return wire(row);
    }),
  );

  // Deleting a client erases their appointments and conversations too (cascade).
  route(app, c.remove, async (req) => {
    const [row] = await db
      .delete(clients)
      .where(own(req.scope.professionalId, req.params.id))
      .returning({ id: clients.id });
    if (!row) throw notFound('Cliente');
    return { ok: true as const };
  });

  route(app, c.stats, async (req) => {
    const id = req.params.id;
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(own(req.scope.professionalId, id));
    if (!client) throw notFound('Cliente');
    const visits = await db
      .select({ startsAt: appointments.startsAt, priceCents: appointments.priceCents })
      .from(appointments)
      .where(and(eq(appointments.clientId, id), eq(appointments.status, 'done')))
      .orderBy(asc(appointments.startsAt));
    const [agg] = await db
      .select({
        noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
        next: sql<Date | null>`min(${appointments.startsAt}) filter (where ${inArray(
          appointments.status,
          [...ACTIVE_APPOINTMENT_STATUSES],
        )} and ${appointments.startsAt} > now())`.mapWith(appointments.startsAt),
      })
      .from(appointments)
      .where(eq(appointments.clientId, id));
    const n = visits.length;
    const first = visits[0];
    const last = visits[n - 1];
    const DAY = 86_400_000;
    return {
      clientId: id,
      visitsCount: n,
      averageTicketCents: n ? Math.round(visits.reduce((s, v) => s + v.priceCents, 0) / n) : 0,
      noShowCount: agg?.noShows ?? 0,
      averageIntervalDays:
        n >= 2 && first && last
          ? Math.round(
              ((last.startsAt.getTime() - first.startsAt.getTime()) / DAY / (n - 1)) * 10,
            ) / 10
          : null,
      lastVisitAt: last ? last.startsAt.toISOString() : null,
      nextAppointmentAt: agg?.next ? agg.next.toISOString() : null,
    };
  });
};

export default clientsModule;
