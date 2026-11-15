import type { Actor } from '@boramarca/shared';
import type { Db, Tx } from '../db/client';
import { auditLog } from '../db/schema';

/** One `audit_log` row. Payloads never carry message content (only ids, lengths, reasons). */
export async function audit(
  x: Db | Tx,
  professionalId: string | null,
  actor: Actor,
  action: string,
  payload: Record<string, unknown> = {},
) {
  await x.insert(auditLog).values({ professionalId, actor, action, payload });
}
