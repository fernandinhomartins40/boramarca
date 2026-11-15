// Store review account (plan section 9): REVIEW_PHONE + REVIEW_OTP open a solo space with sample
// data and the simulated WhatsApp. Evolution is configured here (as in production) and must never
// be called for this account.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { DEFAULT_TIMEZONE } from '@boramarca/shared';
import { EvolutionGateway } from '@boramarca/whatsapp';
import { buildApp } from './app';
import { ensureReviewAccount, REVIEW_SALON_NAME } from './db/seed-review';
import { professionals } from './db/schema';
import { todayIn, weekdayOf, zonedToUtc } from './lib/time';
import type { RoutingGateway } from './modules/whatsapp/gateway';
import { waitFor } from './test/connected';
import { captureSender, randomPhone, seedProfessional, testConfig } from './test/helpers';

vi.setConfig({ testTimeout: 180_000 });

const REVIEW_PHONE = randomPhone();
const REVIEW_OTP = '246810';
const EVOLUTION = 'http://evolution.invalid:8085';

const evolutionCalls = vi.spyOn(
  EvolutionGateway.prototype as unknown as { request: () => Promise<unknown> },
  'request',
);
const fetchSpy = vi.spyOn(globalThis, 'fetch');
const { sender, codes } = captureSender();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(
    testConfig({
      EVOLUTION_BASE_URL: EVOLUTION,
      EVOLUTION_API_KEY: 'evolution-key-not-used',
      REVIEW_PHONE,
      REVIEW_OTP,
    }),
    { otpSender: sender },
  );
  await app.ready();
});
afterAll(() => app.close());

async function login(code = REVIEW_OTP) {
  const req = await app.inject({
    method: 'POST',
    url: '/v1/auth/otp/request',
    payload: { phone: REVIEW_PHONE },
  });
  expect(req.statusCode).toBe(200);
  return app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    payload: { phone: REVIEW_PHONE, code },
  });
}

it('logs in, sees sample data, gets and answers a decision, all on the simulated WhatsApp', async () => {
  expect((await login('000000')).statusCode).toBe(400);
  const res = await login();
  expect(res.statusCode).toBe(200);
  expect(res.json().isNewUser).toBe(false);
  expect(codes.has(REVIEW_PHONE)).toBe(false); // nothing is sent for the review phone
  const token = res.json().accessToken as string;
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  const me = (await call('GET', '/v1/me')).json();
  expect(me.salon.name).toBe(REVIEW_SALON_NAME);
  const pid = me.professional.id as string;
  const today = todayIn(DEFAULT_TIMEZONE, new Date());
  const agenda = (await call('GET', `/v1/agenda?date=${today}`)).json();
  expect(agenda.appointments.length).toBe(5);
  const pending = (await call('GET', '/v1/decisions?status=pending')).json().items;
  expect(pending).toHaveLength(1);

  // Connect the simulated WhatsApp (instance demo-<id>).
  expect((await call('POST', '/v1/whatsapp/session', { riskAccepted: true })).statusCode).toBe(200);
  expect((await call('GET', '/v1/whatsapp/qr')).statusCode).toBe(200);
  const demo = (app.messaging.gateway as RoutingGateway).demo;
  const instance = `demo-${pid}`;
  await demo.simulateConnect(instance);
  expect((await call('GET', '/v1/whatsapp/status')).json().status).toBe('connected');

  // A client writes: the (simulated) AI turns it into a new Decision.
  await demo.injectInbound(instance, { fromPhone: '+5511999900001', text: 'Tem horário amanhã?' });
  await waitFor(async () => {
    const items = (await call('GET', '/v1/decisions?status=pending')).json().items;
    return items.length === 2;
  });

  // Answer the sample one ("Beatriz pode vir amanhã às 10h?" → Sim): booked and confirmed to her.
  const ans = await call('POST', `/v1/decisions/${pending[0].id}/answer`, {
    optionId: 'sim',
    via: 'app',
  });
  expect(ans.statusCode, ans.body).toBe(200);
  expect(ans.json().appointment).not.toBeNull();
  await waitFor(() =>
    demo.sent.some((s) => s.instance === instance && s.toPhone === '+5511999900000'),
  );

  // Evolution never touched: neither the gateway nor any HTTP call to it.
  expect(evolutionCalls).not.toHaveBeenCalled();
  expect(fetchSpy.mock.calls.filter(([u]) => String(u).startsWith(EVOLUTION))).toEqual([]);

  // Idempotent: logging in again keeps the same account and what the reviewer did.
  const again = await login();
  expect(app.verifyAccess(again.json().accessToken).professionalId).toBe(pid);

  // Deleting it (as the stores require) works; the next login recreates it with fresh data.
  const del = await call('DELETE', '/v1/me', { code: REVIEW_OTP, origin: 'app' });
  expect(del.statusCode, del.body).toBe(200);
  const fresh = await login();
  expect(fresh.statusCode).toBe(200);
  const newPid = app.verifyAccess(fresh.json().accessToken).professionalId;
  expect(newPid).not.toBe(pid);
  const freshAgenda = await app.inject({
    method: 'GET',
    url: `/v1/agenda?date=${today}`,
    headers: { authorization: `Bearer ${fresh.json().accessToken}` },
  });
  expect(freshAgenda.json().appointments.length).toBe(5);
  expect(evolutionCalls).not.toHaveBeenCalled();
});

it('the review code never opens an account that is not the review one', async () => {
  const other = await buildApp(
    testConfig({ REVIEW_PHONE: (await seedProfessional(app.db)).phone, REVIEW_OTP }),
  );
  try {
    const [p] = await other.db
      .select()
      .from(professionals)
      .where(eq(professionals.phone, other.config.REVIEW_PHONE!));
    const r = await other.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: p!.phone, code: REVIEW_OTP },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('REVIEW_PHONE_IN_USE');
  } finally {
    await other.close();
  }
});

it('the review account has hours, a full day and a pending decision on Saturday and Sunday', async () => {
  for (const [day, hhmm] of [
    ['2030-03-09', '07:00'],
    ['2030-03-10', '15:30'],
  ] as const) {
    expect([6, 0]).toContain(weekdayOf(day));
    const r = await ensureReviewAccount(
      app.db,
      randomPhone(),
      zonedToUtc(day, hhmm, DEFAULT_TIMEZONE),
    );
    const agenda = await app.agenda.getDay(r.professionalId, day);
    expect(agenda.workingHours).not.toBeNull();
    expect(agenda.appointments).toHaveLength(5);
    expect(await app.messaging.decisions.list(r.professionalId, 'pending', 5)).toHaveLength(1);
  }
});
