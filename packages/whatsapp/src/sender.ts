import { SEND_GUARD_DEFAULTS } from '@boramarca/shared';
import {
  evaluateSend,
  type BlockReason,
  type RecipientFacts,
  type SendGuardConfig,
  type SendIntent,
} from './guard';
import type { WhatsAppGateway } from './types';

/** Shape of the `audit_log` row the API writes (it adds professionalId and actor). */
export interface SendAuditEntry {
  action: 'whatsapp.send_blocked';
  payload: {
    instance: string;
    reason: BlockReason;
    purpose: SendIntent['purpose'];
    toPhone: string;
    textLength: number;
    queuedAt: string;
  };
}

/** What the API provides; the package never touches the database. */
export interface SenderPorts {
  /** Read from the database (messages, appointments, waitlist_entries). */
  recipientFacts(intent: SendIntent): Promise<RecipientFacts>;
  /** Last known session status (kept current by connection.update webhooks). */
  sessionConnected(instance: string): Promise<boolean>;
  /** Per-instance counters for the current minute and day (e.g. Redis INCR + EXPIRE). */
  getCounters(instance: string, now: Date): Promise<{ lastMinute: number; today: number }>;
  /** Called once per WhatsApp message actually sent. */
  incrementCounters(instance: string, now: Date): Promise<void>;
  audit(entry: SendAuditEntry): Promise<void>;
}

export interface SenderClock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export type SendResult =
  | { status: 'sent'; providerMessageIds: string[]; parts: string[] }
  | { status: 'blocked'; reason: BlockReason; retryable: boolean }
  /** Gateway error mid-way; `providerMessageIds` lists the parts that did go out. */
  | { status: 'failed'; error: Error; providerMessageIds: string[] };

export interface Sender {
  send(intent: SendIntent): Promise<SendResult>;
}

const realClock: SenderClock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * The single outbound path: guard -> "digitando" -> text, part by part. Send one message per
 * instance at a time (e.g. BullMQ concurrency 1 per instance) so the counters stay exact.
 */
export function createSender(deps: {
  gateway: WhatsAppGateway;
  ports: SenderPorts;
  config?: SendGuardConfig;
  clock?: SenderClock;
  rng?: () => number;
}): Sender {
  const { gateway, ports } = deps;
  const config = deps.config ?? { ...SEND_GUARD_DEFAULTS };
  const clock = deps.clock ?? realClock;
  const rng = deps.rng ?? Math.random;

  return {
    async send(intent) {
      const now = clock.now();
      const [recipient, sessionConnected, counters] = await Promise.all([
        ports.recipientFacts(intent),
        ports.sessionConnected(intent.instance),
        ports.getCounters(intent.instance, now),
      ]);
      const decision = evaluateSend(
        intent,
        {
          now,
          sessionConnected,
          recipient,
          sentLastMinute: counters.lastMinute,
          sentToday: counters.today,
        },
        config,
        rng,
      );

      if (!decision.allowed) {
        await ports.audit({
          action: 'whatsapp.send_blocked',
          payload: {
            instance: intent.instance,
            reason: decision.reason,
            purpose: intent.purpose,
            toPhone: intent.toPhone,
            textLength: intent.text.length,
            queuedAt: intent.queuedAt.toISOString(),
          },
        });
        return { status: 'blocked', reason: decision.reason, retryable: decision.retryable };
      }

      const providerMessageIds: string[] = [];
      try {
        for (const part of decision.parts) {
          try {
            await gateway.sendPresence(intent.instance, intent.toPhone, part.typingMs);
          } catch {
            // No typing indicator, but keep the human pace before the text.
            await clock.sleep(part.typingMs);
          }
          const { providerMessageId } = await gateway.sendText(
            intent.instance,
            intent.toPhone,
            part.text,
          );
          providerMessageIds.push(providerMessageId);
          await ports.incrementCounters(intent.instance, clock.now());
        }
      } catch (error) {
        return { status: 'failed', error: error as Error, providerMessageIds };
      }
      return { status: 'sent', providerMessageIds, parts: decision.parts.map((p) => p.text) };
    },
  };
}
