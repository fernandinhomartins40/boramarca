import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, routes, WHATSAPP_WEBHOOK_SECRET_HEADER } from '@boramarca/shared';
import { WhatsAppGatewayError } from '@boramarca/whatsapp';
import { whatsappSessions } from '../../db/schema';
import { audit } from '../../lib/audit';
import { loadPro } from '../../lib/core';
import { AppError } from '../../lib/errors';
import { realtimeEvent } from '../../lib/event-bus';
import { route } from '../../lib/route';
import { phoneProvenByWhatsApp } from '../signup/phone';
import { DEMO_INSTANCE_PREFIX } from './gateway';
import { statusResponse } from './inbound';

const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** Gateway failures as API errors (pt-BR, no provider details). */
async function gw<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof WhatsAppGatewayError)) throw err;
    if (err.code === 'not_found')
      throw new AppError(404, 'NO_SESSION', 'Conecte o WhatsApp primeiro');
    if (err.code === 'pairing_unavailable')
      throw new AppError(409, 'PAIRING_UNAVAILABLE', 'Desconecte e tente o código de novo');
    throw new AppError(502, 'WHATSAPP_UNAVAILABLE', 'O WhatsApp não respondeu. Tente de novo.');
  }
}

/** WhatsApp session per professional + the provider webhook (plan sections 5 and 9). */
const whatsapp: FastifyPluginAsync = async (app) => {
  const w = routes.whatsapp;
  const { db, config } = app;
  const gateway = () => app.messaging.gateway;

  const sessionOf = async (pid: string) => {
    const [s] = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.professionalId, pid));
    return s ?? null;
  };
  const requireSession = async (pid: string) => {
    const s = await sessionOf(pid);
    if (!s) throw new AppError(404, 'NO_SESSION', 'Conecte o WhatsApp primeiro');
    return s;
  };
  const setStatus = async (id: string, set: Partial<typeof whatsappSessions.$inferInsert>) => {
    const [s] = await db
      .update(whatsappSessions)
      .set(set)
      .where(eq(whatsappSessions.id, id))
      .returning();
    await app.bus
      .publish(s!.professionalId, realtimeEvent('whatsapp.status', statusResponse(s!)))
      .catch(() => {});
    return s!;
  };

  route(app, w.createSession, async (req) => {
    const pid = req.scope.professionalId;
    const isDemo =
      Boolean(config.REVIEW_PHONE) && (await loadPro(db, pid)).p.phone === config.REVIEW_PHONE;
    const instanceName = `${isDemo ? DEMO_INSTANCE_PREFIX : 'bm-'}${pid}`;
    const [s] = await db
      .insert(whatsappSessions)
      .values({ professionalId: pid, instanceName, phone: req.body.phone ?? null })
      .onConflictDoUpdate({
        target: whatsappSessions.professionalId,
        // instanceName too: the review account must stay on the simulated WhatsApp.
        set: {
          instanceName,
          updatedAt: new Date(),
          ...(req.body.phone && { phone: req.body.phone }),
        },
      })
      .returning();
    const secret = config.WHATSAPP_WEBHOOK_SECRET;
    if (!secret && config.NODE_ENV === 'production')
      throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'WhatsApp indisponível no momento');
    await gw(() =>
      gateway().createSession(s!.instanceName, {
        webhookUrl: `${config.PUBLIC_API_URL ?? 'http://localhost:3333'}${API_PREFIX}/webhooks/whatsapp/${s!.instanceName}`,
        webhookSecret: secret ?? 'dev-webhook-secret',
      }),
    );
    await audit(db, pid, 'professional', 'whatsapp.session_created', {
      riskAccepted: true,
      demo: isDemo,
    });
    return statusResponse(s!);
  });

  route(app, w.qr, async (req) => {
    const s = await requireSession(req.scope.professionalId);
    const qr = await gw(() => gateway().getQrCode(s.instanceName));
    await setStatus(s.id, { status: 'waiting_qr' });
    await audit(db, s.professionalId, 'professional', 'whatsapp.qr_requested');
    return qr;
  });

  route(app, w.pairingCode, async (req) => {
    const s = await requireSession(req.scope.professionalId);
    const code = await gw(() => gateway().getPairingCode(s.instanceName, req.query.phone));
    await setStatus(s.id, { status: 'waiting_qr', phone: req.query.phone });
    await audit(db, s.professionalId, 'professional', 'whatsapp.pairing_code_requested');
    return code;
  });

  route(app, w.status, async (req) => {
    const s = await sessionOf(req.scope.professionalId);
    if (!s) return statusResponse(null);
    try {
      const g = await gateway().getStatus(s.instanceName);
      const changed = g.status !== s.status || (g.phone && g.phone !== s.phone);
      const row = changed
        ? await setStatus(s.id, { status: g.status, ...(g.phone && { phone: g.phone }) })
        : s;
      if (changed && g.status === 'connected' && g.phone)
        await phoneProvenByWhatsApp(app.messaging.core, s.professionalId, g.phone);
      return statusResponse(row, g);
    } catch {
      return statusResponse(s);
    }
  });

  route(app, w.deleteSession, async (req) => {
    const s = await requireSession(req.scope.professionalId);
    await gw(() => gateway().disconnect(s.instanceName));
    await setStatus(s.id, { status: 'disconnected' });
    await audit(db, s.professionalId, 'professional', 'whatsapp.disconnected');
    return { ok: true as const };
  });

  // Provider webhook: authenticated by the shared secret, answered at once, deduplicated by
  // provider message id when stored. Audio comes as base64, hence the larger body limit.
  route(
    app,
    w.webhook,
    async (req) => {
      const secret = config.WHATSAPP_WEBHOOK_SECRET;
      const got = req.headers[WHATSAPP_WEBHOOK_SECRET_HEADER];
      if (!secret) throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook desativado');
      if (typeof got !== 'string' || !sameSecret(got, secret))
        throw new AppError(401, 'UNAUTHORIZED', 'Segredo do webhook inválido');
      try {
        await app.messaging.inbound.handleWebhook(req.params.instance, req.body);
      } catch (err) {
        // Never make the provider retry because of our own bug; it is logged.
        req.log.error({ err }, 'webhook handling failed');
      }
      return { ok: true as const };
    },
    { bodyLimit: 25 * 1024 * 1024 },
  );
};

export default whatsapp;
