import { eq, inArray } from 'drizzle-orm';
import { devices } from '../../db/schema';
import { audit } from '../../lib/audit';
import type { Core } from '../../lib/core';
import type { PushMessage } from './push';

/** Push to every device of a professional. Never throws: a failed push must not stop the flow. */
export function createNotifier(core: Pick<Core, 'db' | 'push' | 'log'>) {
  return async function notify(professionalId: string, kind: string, message: PushMessage) {
    try {
      const rows = await core.db
        .select({ token: devices.pushToken })
        .from(devices)
        .where(eq(devices.professionalId, professionalId));
      const tokens = rows.map((r) => r.token);
      if (tokens.length > 0) {
        const { invalidTokens } = await core.push.send(tokens, message);
        if (invalidTokens.length)
          await core.db.delete(devices).where(inArray(devices.pushToken, invalidTokens));
      }
      await audit(core.db, professionalId, 'system', 'notification.sent', {
        kind,
        devices: tokens.length,
      });
    } catch (err) {
      core.log.error({ err }, 'push notification failed');
    }
  };
}
export type Notify = ReturnType<typeof createNotifier>;
