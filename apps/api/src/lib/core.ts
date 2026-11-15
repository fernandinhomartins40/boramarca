import { eq } from 'drizzle-orm';
import type { LlmClient, Transcriber } from '@boramarca/ia';
import type { WhatsAppGateway } from '@boramarca/whatsapp';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { professionals, salons } from '../db/schema';
import type { Agenda } from '../modules/agenda/service';
import type { PushSender } from '../modules/devices/push';
import type { EventBus } from './event-bus';
import { notFound } from './errors';
import type { Queues } from './queues';

export interface Log {
  error(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
}

/** What the messaging services share (built once in plugins/messaging.ts). */
export interface Core {
  db: Db;
  bus: EventBus;
  agenda: Agenda;
  config: Config;
  now: () => Date;
  log: Log;
  gateway: WhatsAppGateway;
  /** null = AI unavailable (production without LLM_PRIMARY_*): messages only reach the app. */
  llm: LlmClient | null;
  transcriber: Transcriber | null;
  push: PushSender;
  queues: Queues;
}

export async function loadPro(db: Db, professionalId: string) {
  const [row] = await db
    .select({ p: professionals, salon: salons })
    .from(professionals)
    .innerJoin(salons, eq(salons.id, professionals.salonId))
    .where(eq(professionals.id, professionalId));
  if (!row) throw notFound('Profissional');
  return row;
}
export type ProRow = Awaited<ReturnType<typeof loadPro>>;

/** AI answers clients: switched on and not paused (a timed pause ends by itself). */
export function aiActive(p: { aiEnabled: boolean; aiPausedUntil: Date | null }, now: Date) {
  return p.aiPausedUntil ? p.aiPausedUntil <= now : p.aiEnabled;
}
