// The voice command behind POST /voice/command and the Alexa skill (same function, plan section 14).
import { and, asc, eq, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  firstName,
  interpretVoiceCommand,
  type LlmClient,
  type VoiceDaySummary,
} from '@boramarca/ia';
import type { VoiceCommandBody, VoiceCommandResponse } from '@boramarca/shared';
import { clients, conversations, services } from '../../db/schema';
import { loadPro } from '../../lib/core';
import { todayIn } from '../../lib/time';

export function createVoice(app: FastifyInstance) {
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

  /** `signal` (Alexa's 8 s budget) is passed down to the AI call, which then stops. */
  async function command(
    pid: string,
    body: VoiceCommandBody,
    signal?: AbortSignal,
  ): Promise<VoiceCommandResponse> {
    if (body.decisionId) {
      const r = await app.messaging.decisions.answer(pid, body.decisionId, {
        text: body.text,
        via: 'voice',
      });
      return {
        intent: 'answer_decision' as const,
        speech: r.spokenConfirmation,
        decisionId: r.decision.id,
      };
    }
    const day = await daySummary(pid);
    const llm = app.messaging.core.llm;
    const withSignal: LlmClient | undefined =
      llm && signal ? { complete: (req) => llm.complete({ ...req, signal }) } : (llm ?? undefined);
    const a = await interpretVoiceCommand(body.text, day, { llm: withSignal });
    return { intent: a.intent, speech: a.speech, decisionId: null };
  }

  return { daySummary, command };
}
