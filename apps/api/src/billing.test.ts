// Subscription billing (docs/COBRANCA.md) against the Docker Postgres/Redis with a fake Asaas
// (swappable fetch): subscribe/change/cancel, webhook (token, duplicates, shared account), the
// hourly expiry and the AI/reminders pausing when the subscription does not allow automation.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm } from '@boramarca/ia';
import { automationAllowed, isValidCpfCnpj, planValueCents } from '@boramarca/shared';
import { buildApp } from './app';
import { auditLog, billingPayments, professionals, salons } from './db/schema';
import { zonedToUtc } from './lib/time';
import { reminderJobId } from './modules/agenda/reminders';
import { billingDay, expireSubscriptions } from './modules/billing/service';
import { FakePush } from './modules/devices/push';
import { connectedPro, waitFor, WEBHOOK_SECRET } from './test/connected';
import { seedProfessional, testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 180_000 });

const TZ = 'America/Sao_Paulo';
const DATE = '2030-03-13';
const at = (hhmm: string, date = DATE) => zonedToUtc(date, hhmm, TZ);
const DAY = 86_400_000;
const TOKEN = 'w'.repeat(40);
const CPF = '529.982.247-25';
let now = at('09:00');

/** Fake Asaas: records every call and answers like the real API (ids, reais). */
function fakeAsaas() {
  const calls: { method: string; path: string; body?: Record<string, unknown>; key?: string }[] =
    [];
  let seq = 0;
  const subs = new Map<string, { value: number; nextDueDate: string }>();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://asaas.test/v3', '');
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ method, path, body, key: (init?.headers as Record<string, string>).access_token });
    if (method === 'POST' && path === '/customers')
      return json({ id: `cus_${++seq}_${Date.now()}` });
    if (method === 'PUT' && path.startsWith('/customers/')) return json({ id: path.split('/')[2] });
    if (method === 'POST' && path === '/subscriptions') {
      const id = `sub_${++seq}_${Date.now()}`;
      subs.set(id, { value: body!.value as number, nextDueDate: body!.nextDueDate as string });
      return json({ id, ...subs.get(id) });
    }
    const m = /^\/subscriptions\/([^/]+)(\/payments)?$/.exec(path);
    if (m && method === 'GET' && m[2]) {
      const s = subs.get(m[1]!)!;
      return json({
        data: [
          {
            id: `pay_${m[1]}`,
            value: s.value,
            dueDate: s.nextDueDate,
            status: 'PENDING',
            invoiceUrl: `https://asaas.test/i/${m[1]}`,
          },
        ],
      });
    }
    if (m && method === 'PUT')
      return json({ id: m[1], value: body!.value, nextDueDate: '2030-04-01' });
    if (m && method === 'DELETE') return json({ id: m[1], deleted: true });
    return json({ errors: [{ description: 'rota desconhecida' }] }, 404);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const asaas = fakeAsaas();
const gw = testGateway();
const llm = new FakeLlm();
let app: Awaited<ReturnType<typeof buildApp>>;
let off: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(
    testConfig({
      ASAAS_API_KEY: '$aact_test',
      ASAAS_API_URL: 'https://asaas.test/v3',
      ASAAS_WEBHOOK_TOKEN: TOKEN,
      WHATSAPP_WEBHOOK_SECRET: WEBHOOK_SECRET,
      WA_GUARD_TYPING_MIN_SECONDS: '1',
      WA_GUARD_TYPING_MAX_SECONDS: '1',
    }),
    { gateway: gw, llm, push: new FakePush(), asaasFetch: asaas.fetchImpl, now: () => now },
  );
  off = await buildApp(testConfig(), { gateway: testGateway(), now: () => now });
});
afterAll(async () => {
  await app.close();
  await off.close();
});

/** Owner of a salon in trial (ends in 14 days) and a team member. */
async function trialOwner() {
  const o = await seedProfessional(app.db);
  await app.db
    .update(salons)
    .set({ subscriptionStatus: 'trial', trialEndsAt: new Date(now.getTime() + 14 * DAY) })
    .where(eq(salons.id, o.salonId));
  const auth = (role: 'owner' | 'professional' = 'owner') => ({
    authorization: `Bearer ${app.issueTokens({ professionalId: o.professionalId, salonId: o.salonId, role }).accessToken}`,
  });
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
    a = app,
  ) => a.inject({ method, url, payload, headers: auth() });
  const salon = async () =>
    (await app.db.select().from(salons).where(eq(salons.id, o.salonId)))[0]!;
  return { ...o, auth, call, salon };
}

const hook = (payload: object, token = TOKEN) =>
  app.inject({
    method: 'POST',
    url: '/v1/webhooks/asaas',
    payload,
    headers: token ? { 'asaas-access-token': token } : {},
  });

describe('shared rules', () => {
  it('validates CPF/CNPJ check digits and prices from the table', () => {
    expect(isValidCpfCnpj('52998224725')).toBe(true);
    expect(isValidCpfCnpj('52998224724')).toBe(false);
    expect(isValidCpfCnpj('11111111111')).toBe(false);
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
    expect(isValidCpfCnpj('11222333000182')).toBe(false);
    expect(planValueCents('essencial', 'monthly')).toBe(4900);
    expect(planValueCents('maos_livres', 'yearly')).toBe(79000);
    expect(planValueCents('salao', 'monthly', 3)).toBe(29700);
    expect(planValueCents('essencial', 'monthly', 3)).toBe(4900);
    expect(planValueCents('premium', 'monthly')).toBeNull();
    const base = { asaasSubscriptionId: null, nextDueDate: null };
    const past = new Date(now.getTime() - 1000);
    expect(
      automationAllowed({ ...base, subscriptionStatus: 'trial', trialEndsAt: past }, now),
    ).toBe(false);
    expect(
      automationAllowed(
        { ...base, subscriptionStatus: 'trial', trialEndsAt: past, asaasSubscriptionId: 'sub' },
        now,
      ),
    ).toBe(true);
    expect(
      automationAllowed(
        { ...base, subscriptionStatus: 'canceled', trialEndsAt: null, nextDueDate: '2030-03-13' },
        now,
      ),
    ).toBe(true);
    expect(
      automationAllowed(
        { ...base, subscriptionStatus: 'canceled', trialEndsAt: null, nextDueDate: '2030-03-12' },
        now,
      ),
    ).toBe(false);
    expect(
      automationAllowed({ ...base, subscriptionStatus: 'expired', trialEndsAt: null }, now),
    ).toBe(false);
    expect(
      automationAllowed({ ...base, subscriptionStatus: 'past_due', trialEndsAt: null }, now),
    ).toBe(true);
  });
});

describe('owner routes', () => {
  it('shows the trial; only the owner; 503 without ASAAS_API_KEY', async () => {
    now = at('09:00');
    const o = await trialOwner();
    const r = await o.call('GET', '/v1/billing');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      status: 'trial',
      trialDaysLeft: 14,
      automationPaused: false,
      subscribed: false,
      enabled: true,
    });
    expect(
      (await app.inject({ method: 'GET', url: '/v1/billing', headers: o.auth('professional') }))
        .statusCode,
    ).toBe(403);
    const body = { plan: 'essencial', cycle: 'monthly', cpfCnpj: CPF, email: 'dona@exemplo.com' };
    const disabled = await o.call('POST', '/v1/billing/subscription', body, off);
    expect(disabled.statusCode).toBe(503);
    expect(disabled.json().code).toBe('BILLING_DISABLED');
    expect((await o.call('GET', '/v1/billing', undefined, off)).json().enabled).toBe(false);
    // GET /me carries the short state for the banners, and never the Asaas ids.
    const me = (await o.call('GET', '/v1/me')).json();
    expect(me.billing).toEqual({
      status: 'trial',
      trialEndsAt: expect.any(String),
      automationPaused: false,
    });
    expect(JSON.stringify(me)).not.toContain('asaas');
  });

  it('subscribes in the trial (1st charge when it ends), changes and cancels', async () => {
    now = at('09:00');
    const o = await trialOwner();
    expect(
      (
        await o.call('POST', '/v1/billing/subscription', {
          plan: 'salao',
          cycle: 'yearly',
          seats: 3,
          cpfCnpj: '123.456.789-00',
          email: 'x@y.com',
        })
      ).statusCode,
    ).toBe(400);
    const from = asaas.calls.length;
    const r = await o.call('POST', '/v1/billing/subscription', {
      plan: 'salao',
      cycle: 'yearly',
      seats: 3,
      cpfCnpj: CPF,
      email: 'Dona@Exemplo.com',
    });
    expect(r.statusCode, r.body).toBe(200);
    const trialEnd = billingDay(new Date(now.getTime() + 14 * DAY));
    const [cust, sub] = asaas.calls.slice(from);
    expect(cust).toMatchObject({
      method: 'POST',
      path: '/customers',
      key: '$aact_test',
      body: { cpfCnpj: '52998224725', email: 'dona@exemplo.com', externalReference: o.salonId },
    });
    expect(sub).toMatchObject({
      method: 'POST',
      path: '/subscriptions',
      body: {
        billingType: 'UNDEFINED',
        cycle: 'YEARLY',
        value: 2970,
        nextDueDate: trialEnd,
        externalReference: o.salonId,
      },
    });
    expect(r.json()).toMatchObject({
      status: 'trial',
      plan: 'salao',
      cycle: 'yearly',
      seats: 3,
      valueCents: 297000,
      subscribed: true,
      nextDueDate: trialEnd,
      openInvoiceUrl: expect.stringContaining('https://asaas.test/i/'),
      cpfCnpj: '52998224725',
    });
    expect(r.json().payments).toHaveLength(1);
    // A second subscription is refused.
    expect(
      (
        await o.call('POST', '/v1/billing/subscription', {
          plan: 'essencial',
          cycle: 'monthly',
          cpfCnpj: CPF,
          email: 'a@b.com',
        })
      ).statusCode,
    ).toBe(409);

    const c = await o.call('PATCH', '/v1/billing/subscription', {
      plan: 'essencial',
      cycle: 'monthly',
    });
    expect(c.statusCode, c.body).toBe(200);
    expect(asaas.calls.at(-1)).toMatchObject({
      method: 'PUT',
      body: { value: 49, cycle: 'MONTHLY', updatePendingPayments: true },
    });
    expect(c.json()).toMatchObject({ plan: 'essencial', valueCents: 4900, seats: 1 });

    const d = await o.call('DELETE', '/v1/billing/subscription');
    expect(d.statusCode, d.body).toBe(200);
    expect(asaas.calls.at(-1)?.method).toBe('DELETE');
    // Canceled in the trial: the automation keeps going until the trial ends.
    expect(d.json()).toMatchObject({
      status: 'canceled',
      subscribed: false,
      automationPaused: false,
      openInvoiceUrl: null,
    });
    expect((await o.call('DELETE', '/v1/billing/subscription')).statusCode).toBe(409);
  });
});

describe('webhook', () => {
  async function subscribed() {
    now = at('09:00');
    const o = await trialOwner();
    expect(
      (
        await o.call('POST', '/v1/billing/subscription', {
          plan: 'essencial',
          cycle: 'monthly',
          cpfCnpj: CPF,
          email: 'a@b.com',
        })
      ).statusCode,
    ).toBe(200);
    const s = await o.salon();
    const payment = (id: string, over: object = {}) => ({
      id,
      customer: s.asaasCustomerId,
      subscription: s.asaasSubscriptionId,
      value: 49,
      dueDate: '2030-03-27',
      status: 'PENDING',
      invoiceUrl: 'https://asaas.test/i/x',
      ...over,
    });
    return { ...o, s, payment };
  }

  it('rejects a wrong or missing token; ignores other customers, one-off charges and odd bodies', async () => {
    const { payment } = await subscribed();
    const evt = { id: `evt_${Date.now()}_a`, event: 'PAYMENT_CREATED', payment: payment('pay_a') };
    expect((await hook(evt, 'errado')).statusCode).toBe(401);
    expect((await hook(evt, '')).statusCode).toBe(401);
    const other = await hook({
      id: `evt_${Date.now()}_b`,
      event: 'PAYMENT_RECEIVED',
      payment: { ...payment('pay_b'), customer: 'cus_de_outro_negocio' },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json()).toEqual({ received: true, ignored: true });
    const oneOff = await hook({
      id: `evt_${Date.now()}_c`,
      event: 'PAYMENT_RECEIVED',
      payment: payment('pay_c', { subscription: null }),
    });
    expect(oneOff.json()).toEqual({ received: true, ignored: true });
    expect((await hook({ event: 'ACCOUNT_STATUS_UPDATED', foo: 1 })).json()).toEqual({
      received: true,
      ignored: true,
    });
  });

  it('payment confirmed -> active; a duplicate event is not reprocessed', async () => {
    const o = await subscribed();
    const evt = {
      id: `evt_${Date.now()}_p`,
      event: 'PAYMENT_CONFIRMED',
      payment: o.payment('pay_p', { status: 'CONFIRMED', confirmedDate: '2030-03-13' }),
    };
    const r = await hook(evt);
    expect(r.json()).toEqual({ received: true });
    expect((await o.salon()).subscriptionStatus).toBe('active');
    const [row] = await app.db
      .select()
      .from(billingPayments)
      .where(eq(billingPayments.asaasId, 'pay_p'));
    expect(row).toMatchObject({ valueCents: 4900, status: 'CONFIRMED', paidAt: '2030-03-13' });
    // Redelivery: answered as duplicate, the state is untouched even if it changed meanwhile.
    await app.db
      .update(salons)
      .set({ subscriptionStatus: 'past_due' })
      .where(eq(salons.id, o.salonId));
    expect((await hook(evt)).json()).toEqual({ received: true, duplicate: true });
    expect((await o.salon()).subscriptionStatus).toBe('past_due');
  });

  it('overdue -> past_due; past the grace days -> expired; paying brings it back', async () => {
    const o = await subscribed();
    await hook({
      id: `evt_${Date.now()}_o1`,
      event: 'PAYMENT_OVERDUE',
      payment: o.payment('pay_o', { status: 'OVERDUE', dueDate: '2030-03-10' }),
    });
    expect((await o.salon()).subscriptionStatus).toBe('past_due');
    expect(await expireSubscriptions(app.messaging.core, o.salonId)).toBe(0);
    now = at('09:00', '2030-03-18'); // 8 days after the due date (grace 7)
    expect(await expireSubscriptions(app.messaging.core, o.salonId)).toBe(1);
    expect((await o.salon()).subscriptionStatus).toBe('expired');
    await hook({
      id: `evt_${Date.now()}_o2`,
      event: 'PAYMENT_RECEIVED',
      payment: o.payment('pay_o', {
        status: 'RECEIVED',
        dueDate: '2030-03-10',
        paymentDate: '2030-03-18',
      }),
    });
    expect((await o.salon()).subscriptionStatus).toBe('active');
  });
});

describe('trial over', () => {
  it('expires without a subscription: the AI stops answering by itself, reminders pause, banner state', async () => {
    now = at('09:00');
    const t = await connectedPro(app, gw);
    await app.db
      .update(salons)
      .set({ subscriptionStatus: 'trial', trialEndsAt: new Date(now.getTime() - 1000) })
      .where(eq(salons.id, t.salonId));
    expect(await expireSubscriptions(app.messaging.core, t.salonId)).toBe(1);
    expect((await t.call('GET', '/v1/me')).json().billing).toMatchObject({
      status: 'expired',
      automationPaused: true,
    });

    const asked = llm.requests.length;
    const c = await t.addClient('Carla Dias');
    await t.receive(c.phone, 'Oi, tem horário amanhã?', 'Carla');
    await waitFor(async () =>
      (
        await app.db
          .select()
          .from(auditLog)
          .where(
            and(eq(auditLog.professionalId, t.professionalId), eq(auditLog.action, 'ai.skipped')),
          )
      ).find((a) => a.payload.reason === 'subscription_inactive'),
    );
    expect(llm.requests.length).toBe(asked);
    expect(t.sentTo(c.phone)).toHaveLength(0);

    // The agenda still works; the reminder job runs but sends nothing.
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const a = await app.agenda.book(ctx, {
      clientId: c.id,
      serviceIds: [t.serviceId],
      startsAt: at('15:00').toISOString(),
    });
    const job = await app.messaging.core.queues.queues.reminders.getJob(reminderJobId(a.id));
    now = at('13:00');
    expect(await app.messaging.reminders.process(job!)).toEqual({ status: 'paused' });
    expect(t.sentTo(c.phone)).toHaveLength(0);
  });

  it('a first login starts a 14-day trial from the app clock', async () => {
    now = at('09:00');
    const phone = `+55119${String(Date.now()).slice(-8)}`;
    await app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone } });
    const v = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone, code: '123456' },
    });
    expect(v.statusCode, v.body).toBe(200);
    const [p] = await app.db.select().from(professionals).where(eq(professionals.phone, phone));
    const [s] = await app.db.select().from(salons).where(eq(salons.id, p!.salonId));
    expect(s).toMatchObject({
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(now.getTime() + 14 * DAY),
    });
  });
});
