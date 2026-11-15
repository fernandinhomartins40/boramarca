import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { routes } from '@boramarca/shared';
import { devices } from '../../db/schema';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';

/** POST /devices (upsert by push token) and DELETE /devices/:id. */
const devicesModule: FastifyPluginAsync = async (app) => {
  const d = routes.devices;

  route(app, d.register, async (req) => {
    const pid = req.scope.professionalId;
    // A token that moved to another account (logout/login) now belongs to this one.
    const [row] = await app.db
      .insert(devices)
      .values({ professionalId: pid, ...req.body })
      .onConflictDoUpdate({
        target: devices.pushToken,
        set: { professionalId: pid, platform: req.body.platform },
      })
      .returning();
    await audit(app.db, pid, 'professional', 'device.registered', {
      deviceId: row!.id,
      platform: row!.platform,
    });
    return wire(row!);
  });

  route(app, d.remove, async (req) => {
    const pid = req.scope.professionalId;
    const [row] = await app.db
      .delete(devices)
      .where(and(eq(devices.id, req.params.id), eq(devices.professionalId, pid)))
      .returning({ id: devices.id });
    if (!row) throw notFound('Aparelho');
    await audit(app.db, pid, 'professional', 'device.removed', { deviceId: row.id });
    return { ok: true as const };
  });
};

export default devicesModule;
