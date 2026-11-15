// The send module: every WhatsApp message leaves through `outbox.enqueue` -> BullMQ `outbound`
// -> `createSender` (guard + "digitando" + text). Nothing else in the API may call
// gateway.sendText/sendPresence (plan section 1, rule 3; enforced by ESLint).
import { and, eq, gt, inArray, max, ne, sql } from 'drizzle-orm';
import type { Job } from 'bullmq';
import {
  createSender,
  decideOutbox,
  readSendGuardConfig,
  type RecipientFacts,
  type SendIntent,
  type SendPurpose,
} from '@boramarca/whatsapp';
import type { MessageAuthor } from '@boramarca/shared';
import {
  appointments,
  clients,
  conversations,
  messages,
  waitlistEntries,
  waitlistOffers,
  whatsappSessions,
} from '../../db/schema';
import { audit } from '../../lib/audit';
import type { Core } from '../../lib/core';
import { notFound } from '../../lib/errors';
import { delayJob, withKeyLock } from '../../lib/queues';
import { publishMessage } from '../conversations/views';

export interface OutboundJob {
  professionalId: string;
  messageId: string;
  toPhone: string;
  text: string;
  purpose: SendPurpose;
  /** ISO; messages older than the guard limit are dropped. */
  queuedAt: string;
  /** Waitlist offers only: the slot offered (one active offer per slot). */
  waitlistSlotStartsAt?: string;
}

export interface EnqueueInput {
  professionalId: string;
  clientId: string;
  text: string;
  purpose: SendPurpose;
  author: Exclude<MessageAuthor, 'client'>;
  /** Required for `purpose: 'waitlist_offer'` (C1 extension point). */
  waitlistSlotStartsAt?: string;
}

const HOLD_MS = 15_000;
const RETRY_MS = 10_000;

/** Past attended appointment: the guard lets these clients receive messages. */
export const hadPastAppointment = (clientId: string, now: Date) =>
  sql<boolean>`exists(select 1 from ${appointments} a where a.client_id = ${clientId} and (a.status = 'done' or (a.status in ('confirmed','in_service') and a.starts_at < ${now.toISOString()}::timestamptz)))`;

export function createOutbox(core: Core) {
  const { db, queues, gateway, now } = core;
  const guard = readSendGuardConfig(core.config as unknown as Record<string, string | undefined>);
  const redis = queues.redis;
  const counterKey = (instance: string, d: Date, unit: 'm' | 'd') =>
    // shortcut: the daily window is the UTC day, not the salon's; fine for a 200/day cap.
    `wa:cnt:${instance}:${unit}:${d.toISOString().slice(0, unit === 'm' ? 16 : 10)}`;

  async function recipientFacts(
    professionalId: string,
    intent: SendIntent,
    slot: string | undefined,
  ): Promise<RecipientFacts> {
    const [c] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.professionalId, professionalId), eq(clients.phone, intent.toPhone)));
    if (!c)
      return {
        hasInboundMessage: false,
        hasPastAppointment: false,
        waitlistOptedInAt: null,
        waitlistSlotHasOtherActiveOffer: false,
      };
    const t = now();
    const [facts] = await db
      .select({
        inbound: sql<boolean>`exists(select 1 from ${messages} m join ${conversations} cv on cv.id = m.conversation_id where cv.client_id = ${c.id} and m.direction = 'in')`,
        past: hadPastAppointment(c.id, t),
        optedIn: max(waitlistEntries.optedInAt),
      })
      .from(clients)
      .leftJoin(
        waitlistEntries,
        and(
          eq(waitlistEntries.clientId, clients.id),
          inArray(waitlistEntries.status, ['waiting', 'offered']),
        ),
      )
      .where(eq(clients.id, c.id))
      .groupBy(clients.id);
    // Passed explicitly: false unless another person holds an active offer for this same slot.
    let otherOffer = false;
    if (intent.purpose === 'waitlist_offer') {
      if (!slot) otherOffer = true;
      else {
        const [o] = await db
          .select({ id: waitlistOffers.id })
          .from(waitlistOffers)
          .innerJoin(waitlistEntries, eq(waitlistEntries.id, waitlistOffers.entryId))
          .where(
            and(
              eq(waitlistEntries.professionalId, professionalId),
              ne(waitlistEntries.clientId, c.id),
              eq(waitlistOffers.status, 'sent'),
              gt(waitlistOffers.expiresAt, t),
              eq(waitlistOffers.slotStartsAt, new Date(slot)),
            ),
          )
          .limit(1);
        otherOffer = Boolean(o);
      }
    }
    return {
      hasInboundMessage: Boolean(facts?.inbound),
      hasPastAppointment: Boolean(facts?.past),
      waitlistOptedInAt: facts?.optedIn ?? null,
      waitlistSlotHasOtherActiveOffer: otherOffer,
    };
  }

  async function sessionOf(professionalId: string) {
    const [s] = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.professionalId, professionalId));
    return s ?? null;
  }

  async function markMessage(
    professionalId: string,
    messageId: string,
    set: Partial<typeof messages.$inferInsert>,
  ) {
    const [m] = await db.update(messages).set(set).where(eq(messages.id, messageId)).returning();
    if (m) await publishMessage(db, core.bus, professionalId, m);
  }

  /**
   * Records the outgoing message in the conversation and queues it. Returns null (and audits)
   * when the professional has no WhatsApp session at all.
   */
  async function enqueue(input: EnqueueInput) {
    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.professionalId, input.professionalId)));
    if (!client) throw notFound('Cliente');
    const session = await sessionOf(input.professionalId);
    if (!session) {
      await audit(db, input.professionalId, 'system', 'whatsapp.send_skipped', {
        reason: 'no_session',
        clientId: client.id,
        purpose: input.purpose,
      });
      return null;
    }
    const at = now();
    const [conv] = await db
      .insert(conversations)
      .values({ professionalId: input.professionalId, clientId: client.id, lastMessageAt: at })
      .onConflictDoUpdate({
        target: [conversations.professionalId, conversations.clientId],
        set: { lastMessageAt: at },
      })
      .returning();
    const [m] = await db
      .insert(messages)
      .values({
        conversationId: conv!.id,
        direction: 'out',
        author: input.author,
        kind: 'text',
        text: input.text,
        createdAt: at,
      })
      .returning();
    const job: OutboundJob = {
      professionalId: input.professionalId,
      messageId: m!.id,
      toPhone: client.phone,
      text: input.text,
      purpose: input.purpose,
      queuedAt: at.toISOString(),
      waitlistSlotStartsAt: input.waitlistSlotStartsAt,
    };
    await queues.queues.outbound.add('send', job, { jobId: m!.id });
    await audit(
      db,
      input.professionalId,
      input.author === 'ai' ? 'ai' : 'professional',
      'whatsapp.queued',
      {
        messageId: m!.id,
        clientId: client.id,
        purpose: input.purpose,
        textLength: input.text.length,
      },
    );
    await publishMessage(db, core.bus, input.professionalId, m!);
    return m!;
  }

  /** Outbound worker: one send per instance at a time (Redis lock), so the counters are exact. */
  async function process(job: Job<OutboundJob>, token?: string) {
    const data = job.data;
    const session = await sessionOf(data.professionalId);
    if (!session) {
      await markMessage(data.professionalId, data.messageId, {
        aiNote: 'Não enviada: WhatsApp desconectado',
      });
      return { status: 'no_session' };
    }
    const instance = session.instanceName;
    return withKeyLock(redis, `wa:lock:${instance}`, job, token, async () => {
      const intent: SendIntent = {
        instance,
        toPhone: data.toPhone,
        text: data.text,
        purpose: data.purpose,
        queuedAt: new Date(data.queuedAt),
      };
      const connected = session.status === 'connected';
      const action = decideOutbox(intent, { now: now(), sessionConnected: connected }, guard);
      if (action === 'hold') return delayJob(job, token, HOLD_MS);
      const sender = createSender({
        gateway,
        config: guard,
        clock: { now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
        ports: {
          recipientFacts: (i) => recipientFacts(data.professionalId, i, data.waitlistSlotStartsAt),
          sessionConnected: async () => connected,
          getCounters: async (i, t) => {
            const [m, d] = await redis.mget(counterKey(i, t, 'm'), counterKey(i, t, 'd'));
            return { lastMinute: Number(m ?? 0), today: Number(d ?? 0) };
          },
          incrementCounters: async (i, t) => {
            await redis
              .multi()
              .incr(counterKey(i, t, 'm'))
              .expire(counterKey(i, t, 'm'), 120)
              .incr(counterKey(i, t, 'd'))
              .expire(counterKey(i, t, 'd'), 90_000)
              .exec();
          },
          audit: (e) => audit(db, data.professionalId, 'system', e.action, e.payload),
        },
      });
      // decideOutbox said 'drop' -> the guard blocks it as stale_message (and audits it).
      const result = await sender.send(intent);
      if (result.status === 'sent') {
        await markMessage(data.professionalId, data.messageId, {
          providerMessageId: result.providerMessageIds[0] ?? null,
        });
        await audit(db, data.professionalId, 'system', 'whatsapp.sent', {
          messageId: data.messageId,
          parts: result.parts.length,
          purpose: data.purpose,
        });
        return { status: 'sent' };
      }
      if (result.status === 'blocked') {
        if (result.retryable)
          return delayJob(
            job,
            token,
            result.reason === 'session_disconnected' ? HOLD_MS : RETRY_MS,
          );
        await markMessage(data.professionalId, data.messageId, {
          aiNote: `Não enviada: ${result.reason}`,
        });
        return { status: 'blocked', reason: result.reason };
      }
      if (result.providerMessageIds.length > 0) {
        // Part of it went out: never resend (the client would get it twice).
        await markMessage(data.professionalId, data.messageId, {
          providerMessageId: result.providerMessageIds[0],
          aiNote: 'Enviada em parte',
        });
        return { status: 'partial' };
      }
      throw result.error; // BullMQ retries with backoff
    });
  }

  return { enqueue, process, sessionOf };
}
export type Outbox = ReturnType<typeof createOutbox>;
