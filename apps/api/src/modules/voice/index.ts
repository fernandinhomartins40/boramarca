import { and, asc, eq, gt } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  firstName,
  interpretVoiceCommand,
  spokenTimeOf,
  type VoiceDaySummary,
} from '@boramarca/ia';
import { routes } from '@boramarca/shared';
import { clients, conversations, services } from '../../db/schema';
import { loadPro } from '../../lib/core';
import { route } from '../../lib/route';
import { addDays, todayIn } from '../../lib/time';

const joinNames = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const reais = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** POST /voice/command and GET /voice/summary (plan sections 8 and 9; target: 3 s). */
const voice: FastifyPluginAsync = async (app) => {
  const v = routes.voice;
  const db = app.db;

  /** Today's agenda already summarized: first names only, no phones. */
  async function daySummary(pid: string): Promise<VoiceDaySummary> {
    const pro = await loadPro(db, pid);
    const tz = pro.salon.timezone;
    const date = todayIn(tz, app.now());
    const [day, [shortest], unread] = await Promise.all([
      app.agenda.getDay(pid, date),
      db
        .select({ d: services.durationMin })
        .from(services)
        .where(and(eq(services.professionalId, pid), eq(services.active, true)))
        .orderBy(asc(services.durationMin))
        .limit(1),
      db
        .select({ name: clients.name, count: conversations.unreadCount })
        .from(conversations)
        .innerJoin(clients, eq(clients.id, conversations.clientId))
        .where(and(eq(conversations.professionalId, pid), gt(conversations.unreadCount, 0))),
    ]);
    const free = await app.agenda.findFreeSlots(pid, date, shortest?.d ?? 30);
    return {
      now: app.now().toISOString(),
      timezone: tz,
      appointments: day.appointments.map((a) => ({
        startsAt: a.startsAt,
        clientFirstName: firstName(a.clientName),
        serviceNames: a.services.map((s) => s.name),
        status: a.status,
      })),
      freeSlots: free.map((s) => s.startsAt),
      unreadMessages: unread.map((u) => ({ clientFirstName: firstName(u.name), count: u.count })),
    };
  }

  route(app, v.command, async (req) => {
    const pid = req.scope.professionalId;
    if (req.body.decisionId) {
      const r = await app.messaging.decisions.answer(pid, req.body.decisionId, {
        text: req.body.text,
        via: 'voice',
      });
      return {
        intent: 'answer_decision' as const,
        speech: r.spokenConfirmation,
        decisionId: r.decision.id,
      };
    }
    const day = await daySummary(pid);
    const a = await interpretVoiceCommand(req.body.text, day, {
      llm: app.messaging.core.llm ?? undefined,
    });
    return { intent: a.intent, speech: a.speech, decisionId: null };
  });

  route(app, v.summary, async (req) => {
    const pid = req.scope.professionalId;
    const { moment } = req.query;
    const pro = await loadPro(db, pid);
    const tz = pro.salon.timezone;
    const day = await app.agenda.getDay(pid, todayIn(tz, app.now()));
    const pending = await app.messaging.decisions.list(pid, 'pending', 50);
    const active = day.appointments.filter((a) =>
      ['scheduled', 'confirmed', 'in_service'].includes(a.status),
    );
    const decisions =
      pending.length === 0
        ? ''
        : pending.length === 1
          ? ' Tem 1 decisão esperando você.'
          : ` Tem ${pending.length} decisões esperando você.`;
    let speech: string;
    if (moment === 'open') {
      const first = active[0];
      speech =
        active.length === 0
          ? 'Bom dia! Você não tem clientes marcados hoje.'
          : `Bom dia! Hoje você tem ${active.length} ${active.length === 1 ? 'cliente' : 'clientes'}. ` +
            `O primeiro é ${firstName(first!.clientName)}, às ${spokenTimeOf(first!.startsAt, tz)}.`;
      speech += decisions;
    } else {
      const done = day.appointments.filter((a) => a.status === 'done');
      const total = done.reduce((n, a) => n + a.priceCents, 0);
      const noShows = day.appointments.filter((a) => a.status === 'no_show').length;
      const tomorrow = await app.agenda.getDay(pid, addDays(todayIn(tz, app.now()), 1));
      const next = tomorrow.appointments.filter((a) =>
        ['scheduled', 'confirmed'].includes(a.status),
      );
      speech =
        done.length === 0
          ? 'Hoje você não concluiu atendimentos.'
          : `Hoje você atendeu ${joinNames(done.length, 'cliente', 'clientes')}, somando ${reais(total)}.`;
      if (noShows) speech += ` ${joinNames(noShows, 'falta', 'faltas')}.`;
      speech +=
        next.length === 0
          ? ' Amanhã ainda não tem ninguém marcado.'
          : ` Amanhã você tem ${joinNames(next.length, 'cliente', 'clientes')}, o primeiro às ${spokenTimeOf(next[0]!.startsAt, tz)}.`;
      speech += decisions;
    }
    return { moment, speech };
  });
};

export default voice;
