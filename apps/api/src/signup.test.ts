// Free sign-up and login by e-mail code (docs/COBRANCA.md, "Cadastro grátis"): code in the mail,
// account with e-mail confirmed + 14-day trial + phone not verified, no duplicates, no enumeration,
// tries limit, and the phone verified later by SMS (e-mail re-confirmed) or by the WhatsApp pairing.
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm } from '@boramarca/ia';
import { buildApp } from './app';
import { professionals, salons } from './db/schema';
import type { Mail } from './lib/mail/mailer';
import { FakePush } from './modules/devices/push';
import { samePhone } from './modules/signup/phone';
import { connectedPro, waitFor } from './test/connected';
import { testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 120_000 });

const sent: Mail[] = [];
const gw = testGateway();
const now = new Date('2030-03-14T12:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  // NODE_ENV=production: the dev code 123456 must not work here.
  app = await buildApp(
    testConfig({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'p'.repeat(32),
      JWT_REFRESH_SECRET: 'q'.repeat(32),
      WHATSAPP_WEBHOOK_SECRET: 'test-webhook-secret-0123456789',
    }),
    {
      gateway: gw,
      llm: new FakeLlm(),
      push: new FakePush(),
      now: () => now,
      mailTransport: { deliver: async (m) => void sent.push(m) },
    },
  );
});
afterAll(() => app.close());

const phone = () => `+55119${String(randomInt(0, 1e8)).padStart(8, '0')}`;
const email = () => `nova${randomInt(1e9)}@exemplo.com`;
const post = (url: string, payload: object) =>
  app.inject({
    method: 'POST',
    url: `/v1${url}`,
    payload,
    remoteAddress: `10.9.${randomInt(255)}.${randomInt(255)}`,
  });
const codeIn = async (to: string) => {
  const m = await waitFor(() => sent.find((x) => x.to === to && /é o seu código/.test(x.subject)));
  sent.splice(sent.indexOf(m), 1);
  return /^(\d{6}) /.exec(m.subject)![1]!;
};
const form = (over: object = {}) => ({
  name: 'Joana Lima',
  salonName: 'Studio Joana',
  profession: 'manicure',
  phone: phone(),
  email: email(),
  ...over,
});

describe('sign-up by e-mail code', () => {
  it('creates the account with the e-mail confirmed, a 14-day trial and the phone not verified', async () => {
    const f = form();
    const r = await post('/auth/signup/request', f);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      ok: true,
      email: expect.stringMatching(/^n\*\*\*@exemplo\.com$/),
    });
    const code = await codeIn(f.email);
    expect(
      (
        await post('/auth/signup/verify', {
          email: f.email,
          code: '123456' === code ? '654321' : '123456',
        })
      ).statusCode,
    ).toBe(400);
    const v = await post('/auth/signup/verify', { email: f.email, code });
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json()).toMatchObject({ isNewUser: true, accessToken: expect.any(String) });
    const [p] = await app.db.select().from(professionals).where(eq(professionals.phone, f.phone));
    expect(p).toMatchObject({
      name: 'Joana Lima',
      role: 'owner',
      professions: ['manicure'],
      email: f.email,
      phoneVerifiedAt: null,
    });
    expect(p!.emailVerifiedAt).toBeTruthy();
    const [s] = await app.db.select().from(salons).where(eq(salons.id, p!.salonId));
    expect(s).toMatchObject({
      name: 'Studio Joana',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(now.getTime() + 14 * 86_400_000),
    });
    await waitFor(() => sent.find((m) => m.to === f.email && /confirmado/.test(m.subject)));
    // The code works once.
    expect((await post('/auth/signup/verify', { email: f.email, code })).statusCode).toBe(400);
  });

  it('no second account with the same phone or e-mail, and the answer does not tell', async () => {
    const f = form();
    await post('/auth/signup/request', f);
    expect(
      (await post('/auth/signup/verify', { email: f.email, code: await codeIn(f.email) }))
        .statusCode,
    ).toBe(200);
    const again = form({ phone: f.phone });
    const r = await post('/auth/signup/request', again);
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json()).sort()).toEqual([
      'email',
      'expiresInSeconds',
      'ok',
      'retryAfterSeconds',
    ]);
    await waitFor(() => sent.find((m) => m.to === again.email && /já tem conta/.test(m.subject)));
    expect(sent.some((m) => m.to === again.email && /código/.test(m.subject))).toBe(false);
    // An account (made elsewhere, no cooldown pending) with this e-mail confirmed.
    const taken = email();
    const [sal] = await app.db.insert(salons).values({ name: 'Outro' }).returning();
    await app.db.insert(professionals).values({
      salonId: sal!.id,
      role: 'owner',
      name: 'Outra',
      phone: phone(),
      email: taken,
      emailVerifiedAt: now,
    });
    await post('/auth/signup/request', form({ email: taken }));
    await waitFor(() => sent.find((m) => m.to === taken && /já tem conta/.test(m.subject)));
    // Asking again right away: cooldown, whether or not a code was sent.
    expect((await post('/auth/signup/request', again)).statusCode).toBe(429);
  });

  it('a code dies after 5 wrong tries', async () => {
    const f = form();
    await post('/auth/signup/request', f);
    const code = await codeIn(f.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      expect((await post('/auth/signup/verify', { email: f.email, code: wrong })).statusCode).toBe(
        400,
      );
    expect((await post('/auth/signup/verify', { email: f.email, code })).statusCode).toBe(429);
  });

  it('rejects a phone that is not a Brazilian mobile', async () => {
    expect((await post('/auth/signup/request', form({ phone: '+551133334444' }))).statusCode).toBe(
      400,
    );
  });
});

describe('login by e-mail code', () => {
  it('sends the code to the confirmed e-mail; an unknown phone gets the same answer and nothing', async () => {
    const f = form();
    await post('/auth/signup/request', f);
    await post('/auth/signup/verify', { email: f.email, code: await codeIn(f.email) });
    const r = await post('/auth/email-code/request', { phone: f.phone });
    expect(r.json()).toMatchObject({ ok: true, email: 'n***@exemplo.com' });
    const code = await codeIn(f.email);
    const v = await post('/auth/email-code/verify', { phone: f.phone, code });
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json().isNewUser).toBe(false);

    const ghost = phone();
    const g = await post('/auth/email-code/request', { phone: ghost });
    expect(g.statusCode).toBe(200);
    expect(g.json().email).toMatch(/^[a-z]\*\*\*@/);
    // Same cooldown as a real account.
    expect((await post('/auth/email-code/request', { phone: ghost })).statusCode).toBe(429);
    expect(
      (await post('/auth/email-code/verify', { phone: ghost, code: '123456' })).statusCode,
    ).toBe(400);
    expect(
      await app.db.select().from(professionals).where(eq(professionals.phone, ghost)),
    ).toHaveLength(0);
  });

  it('SMS proof of an e-mail sign-up verifies the phone and asks to confirm the e-mail again', async () => {
    const f = form();
    await post('/auth/signup/request', f);
    await post('/auth/signup/verify', { email: f.email, code: await codeIn(f.email) });
    const { loginProvenPhone } = await import('./modules/auth/login');
    await loginProvenPhone(app, f.phone, 'login', { createAccount: true });
    const [p] = await app.db.select().from(professionals).where(eq(professionals.phone, f.phone));
    expect(p!.phoneVerifiedAt).toBeTruthy();
    expect(p!.emailVerifiedAt).toBeNull();
    await waitFor(() =>
      sent.find((m) => m.to === f.email && /Confirme seu e-mail/.test(m.subject)),
    );
  });

  it('the WhatsApp pairing of the same number verifies the phone', async () => {
    expect(samePhone('+5511987654321', '+551187654321')).toBe(true);
    expect(samePhone('+5511987654321', '+5511987654320')).toBe(false);
    const t = await connectedPro(app, gw);
    // connectedPro pairs a random number: not this account's phone.
    let [p] = await app.db
      .select()
      .from(professionals)
      .where(eq(professionals.id, t.professionalId));
    expect(p!.phoneVerifiedAt).toBeNull();
    const instance = `bm-${t.professionalId}`;
    await gw.simulateConnect(instance, t.phone);
    expect((await t.call('GET', '/v1/whatsapp/status')).json().status).toBe('connected');
    [p] = await app.db.select().from(professionals).where(eq(professionals.id, t.professionalId));
    expect(p!.phoneVerifiedAt).toBeTruthy();
  });
});
