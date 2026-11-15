import { expect } from 'vitest';
import { WHATSAPP_WEBHOOK_SECRET_HEADER } from '@boramarca/shared';
import type { FakeGateway } from '@boramarca/whatsapp';
import type { buildApp } from '../app';
import { clients } from '../db/schema';
import { randomPhone, seedProfessional } from './helpers';

export const WEBHOOK_SECRET = 'test-webhook-secret-0123456789';
type App = Awaited<ReturnType<typeof buildApp>>;

export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false> | T | null | undefined | false,
  ms = 90_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** A professional with WhatsApp connected on the FakeGateway, plus HTTP and webhook helpers. */
export async function connectedPro(
  app: App,
  gw: FakeGateway,
  opts: Parameters<typeof seedProfessional>[1] = {},
) {
  const pro = await seedProfessional(app.db, opts);
  const token = app.issueTokens({
    professionalId: pro.professionalId,
    salonId: pro.salonId,
    role: 'owner',
  }).accessToken;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  expect((await call('POST', '/v1/whatsapp/session', { riskAccepted: true })).statusCode).toBe(200);
  const instance = `bm-${pro.professionalId}`;
  await call('GET', '/v1/whatsapp/qr');
  await gw.simulateConnect(instance, randomPhone());
  // Reading the status stores "connected" (the override gateway does not deliver webhooks).
  expect((await call('GET', '/v1/whatsapp/status')).json().status).toBe('connected');
  const receive = async (fromPhone: string, text: string, pushName?: string) => {
    const body = await gw.injectInbound(instance, { fromPhone, text, pushName });
    const r = await app.inject({
      method: 'POST',
      url: `/v1/webhooks/whatsapp/${instance}`,
      payload: body as object,
      headers: { [WHATSAPP_WEBHOOK_SECRET_HEADER]: WEBHOOK_SECRET },
    });
    expect(r.statusCode).toBe(200);
  };
  const sentTo = (phone: string) =>
    gw.sent.filter((s) => s.instance === instance && s.toPhone === phone);
  const addClient = async (name: string, phone = randomPhone()) => {
    const [c] = await app.db
      .insert(clients)
      .values({ professionalId: pro.professionalId, name, phone })
      .returning();
    return c!;
  };
  return { ...pro, token, call, instance, receive, sentTo, addClient };
}
