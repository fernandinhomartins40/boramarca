import { z } from 'zod';
import { EntityBase, Id } from './common';

export const Actor = z.enum(['ai', 'professional', 'client', 'system']);
export type Actor = z.infer<typeof Actor>;

/** `audit_log`: every action, including blocks by the send guard. */
export const AuditLogEntry = EntityBase.extend({
  professionalId: Id.nullable(),
  actor: Actor,
  action: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;
