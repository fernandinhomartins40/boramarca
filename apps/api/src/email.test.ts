// Transactional e-mail: templates (escaping), Velomail transport (no network without a key),
// confirmation link (valid, expired, reused), deletion receipt and the team notice for site leads.
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm } from '@boramarca/ia';
import { buildApp } from './app';
import { professionals } from './db/schema';
import { velomailTransport, type Mail } from './lib/mail/mailer';
import { mailTemplates } from './lib/mail/templates';
import { FakePush } from './modules/devices/push';
import { waitFor } from './test/connected';
import { captureSender, seedProfessional, testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 120_000 });

const OPS = 'time@boramarca.com.br';
const sent: Mail[] = [];
const { sender, codes } = captureSender();
let clock = new Date('2030-03-14T12:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(
    testConfig({ MAIL_OPS_TO: OPS, PUBLIC_API_BASE_URL: 'https://api.exemplo.test' }),
    {
      gateway: testGateway(),
      llm: new FakeLlm(),
      push: new FakePush(),
      otpSender: sender,
      now: () => clock,
      mailTransport: { deliver: async (m) => void sent.push(m) },
    },
  );
});
afterAll(() => app.close());

const uniqueEmail = () => `pro${randomInt(1e9)}@exemplo.com`;
const mailTo = (to: string, subject: RegExp) =>
  waitFor(() => sent.find((m) => m.to === to && subject.test(m.subject)));
const tokenIn = (m: Mail) => /token=([\w-]+)/.exec(m.text)![1]!;

async function pro() {
  const p = await seedProfessional(app.db);
  const token = app.issueTokens({
    professionalId: p.professionalId,
    salonId: p.salonId,
    role: 'owner',
  }).accessToken;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  return { ...p, call };
}
const confirm = (token: string) =>
  app.inject({ method: 'GET', url: `/v1/email/confirm?token=${token}` });
const status = (r: { headers: Record<string, unknown> }) =>
  new URL(String(r.headers.location)).searchParams.get('status');

describe('templates', () => {
  const t = mailTemplates({
    site: 'https://boramarca.com.br',
    support: 'contato@boramarca.com.br',
  });

  it('escapes user data in the HTML and keeps the plain-text version', () => {
    const m = t.newLead({
      name: '<script>alert(1)</script> "Ana"',
      phone: '+5511987654321',
      profession: 'manicure',
      message: '<img src=x onerror=alert(1)>',
      source: 'site_contato',
      receivedAt: new Date('2030-03-14T12:30:00Z'),
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;Ana&quot;');
    expect(m.text).toContain('Mensagem: <img src=x onerror=alert(1)>');
    expect(m.text).toContain('Profissão: Manicure');
    expect(m.text).toContain('Recebido em: 14/03/2030 às 09:30');
  });

  it('every template has the logo PNG with alt text, width 600 and a text version', () => {
    const all = [
      t.confirmEmail({ name: 'Marina', url: 'https://x/?token=a&b=1', ttlHours: 24 }),
      t.welcome({ name: 'Marina Costa' }),
      t.accountDeleted({ name: 'Marina', completedAt: new Date() }),
    ];
    for (const m of all) {
      expect(m.html).toContain('src="https://boramarca.com.br/email/logo-horizontal-negativo.png"');
      expect(m.html).toContain('alt="Bora Marca"');
      expect(m.html).toContain('width="600"');
      expect(m.text.length).toBeGreaterThan(100);
    }
    expect(all[0]!.html).toContain('href="https://x/?token=a&amp;b=1"');
    expect(all[0]!.text).toContain('https://x/?token=a&b=1');
  });
});

describe('Velomail transport', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const mail = { to: 'ana@exemplo.com', subject: 'Oi', html: '<p>Oi</p>', text: 'segredo' };

  it('without a key nothing goes to the network (body logged only outside production)', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await velomailTransport(testConfig(), log, fetchImpl).deliver(mail);
    const prod = testConfig({ NODE_ENV: 'production', WHATSAPP_WEBHOOK_SECRET: 'x'.repeat(20) });
    await velomailTransport(prod, log, fetchImpl).deliver(mail);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ to: 'a***@exemplo.com', body: 'segredo' });
    expect(log.warn.mock.calls[1]![0]).not.toHaveProperty('body');
  });

  it('with a key posts the documented JSON and fails on non-2xx (so the job retries)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    const config = testConfig({ VELOMAIL_API_KEY: 'chave' });
    await velomailTransport(config, log, fetchImpl).deliver(mail);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://www.velomail.com.br/api/emails/send');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer chave');
    expect(JSON.parse(String(init!.body))).toEqual({
      from: 'nao-responda@boramarca.com.br',
      reply_to: 'contato@boramarca.com.br',
      to: 'ana@exemplo.com',
      subject: 'Oi',
      html: '<p>Oi</p>',
      text: 'segredo',
      tracking_enabled: false,
    });
    // A "Name <address>" MAIL_FROM still sends the bare address (Velomail rejects the other form).
    const named = testConfig({ VELOMAIL_API_KEY: 'chave', MAIL_FROM: 'Bora Marca <oi@boramarca.com.br>' });
    await velomailTransport(named, log, fetchImpl).deliver(mail);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body)).from).toBe('oi@boramarca.com.br');
    fetchImpl.mockResolvedValueOnce(new Response('quota', { status: 429 }));
    await expect(velomailTransport(config, log, fetchImpl).deliver(mail)).rejects.toThrow('429');
  });
});

describe('e-mail confirmation', () => {
  it('PATCH /me sends a single-use link; confirming sends the welcome mail', async () => {
    const p = await pro();
    const email = uniqueEmail();
    const r = await p.call('PATCH', '/v1/me', { email: `  ${email.toUpperCase()} `.trim() });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().professional).toMatchObject({ email, emailVerifiedAt: null });
    expect(r.body).not.toContain('emailToken');

    const link = await mailTo(email, /Confirme/);
    expect(link.text).toContain('https://api.exemplo.test/v1/email/confirm?token=');
    // No welcome before confirming.
    expect(sent.filter((m) => m.to === email)).toHaveLength(1);

    const token = tokenIn(link);
    const ok = await confirm(token);
    expect(ok.statusCode).toBe(302);
    expect(ok.headers.location).toBe('https://boramarca.com.br/email-confirmado?status=ok');
    await mailTo(email, /Boas-vindas/);
    const me = (await p.call('GET', '/v1/me')).json().professional;
    expect(me.emailVerifiedAt).toBe(clock.toISOString());

    // Reused link.
    expect(status(await confirm(token))).toBe('invalido');
    expect(status(await confirm('nao-existe'))).toBe('invalido');
    expect(status(await app.inject({ method: 'GET', url: '/v1/email/confirm' }))).toBe('invalido');
    expect(sent.filter((m) => m.to === email)).toHaveLength(2);

    // Resend makes no sense once confirmed; changing the address starts over.
    expect((await p.call('POST', '/v1/me/email/resend')).json().code).toBe(
      'EMAIL_ALREADY_VERIFIED',
    );
    const other = uniqueEmail();
    const changed = (await p.call('PATCH', '/v1/me', { email: other })).json().professional;
    expect(changed).toMatchObject({ email: other, emailVerifiedAt: null });
    await mailTo(other, /Confirme/);
  });

  it('an expired link is refused; resend has a cooldown and issues a new link', async () => {
    const p = await pro();
    const email = uniqueEmail();
    await p.call('PATCH', '/v1/me', { email });
    const first = tokenIn(await mailTo(email, /Confirme/));

    const tooSoon = await p.call('POST', '/v1/me/email/resend');
    expect(tooSoon.statusCode).toBe(429);

    clock = new Date(clock.getTime() + 25 * 3600_000);
    expect(status(await confirm(first))).toBe('expirado');
    const resent = await p.call('POST', '/v1/me/email/resend');
    expect(resent.statusCode, resent.body).toBe(200);
    await waitFor(() => sent.filter((m) => m.to === email).length === 2);
    const second = tokenIn(sent.filter((m) => m.to === email)[1]!);
    expect(second).not.toBe(first);
    expect(status(await confirm(first))).toBe('invalido');
    expect(status(await confirm(second))).toBe('ok');
  });

  it('removing the e-mail clears it; invalid addresses are refused', async () => {
    const p = await pro();
    expect((await p.call('PATCH', '/v1/me', { email: 'nao-e-email' })).statusCode).toBe(400);
    await p.call('PATCH', '/v1/me', { email: uniqueEmail() });
    const r = (await p.call('PATCH', '/v1/me', { email: null })).json().professional;
    expect(r).toMatchObject({ email: null, emailVerifiedAt: null });
    const [row] = await app.db
      .select()
      .from(professionals)
      .where(eq(professionals.id, p.professionalId));
    expect(row).toMatchObject({ emailTokenHash: null, emailTokenExpiresAt: null });
  });
});

describe('account deletion receipt', () => {
  it('goes to the confirmed address, captured before the account is erased', async () => {
    const p = await pro();
    const email = uniqueEmail();
    await p.call('PATCH', '/v1/me', { email });
    expect(status(await confirm(tokenIn(await mailTo(email, /Confirme/))))).toBe('ok');

    const req = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: p.phone, purpose: 'delete_account' },
    });
    expect(req.statusCode, req.body).toBe(200);
    const del = await p.call('DELETE', '/v1/me', { code: codes.get(p.phone), origin: 'app' });
    expect(del.statusCode, del.body).toBe(200);

    const receipt = await mailTo(email, /excluída/);
    expect(receipt.text).toContain('O que foi apagado');
    expect(receipt.text).toMatch(/Excluída em: \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/);
    const left = await app.db.select().from(professionals).where(eq(professionals.email, email));
    expect(left).toEqual([]);
  });

  it('an unconfirmed address gets nothing', async () => {
    const p = await pro();
    const email = uniqueEmail();
    await p.call('PATCH', '/v1/me', { email });
    await mailTo(email, /Confirme/);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: p.phone, purpose: 'delete_account' },
    });
    const del = await p.call('DELETE', '/v1/me', { code: codes.get(p.phone), origin: 'app' });
    expect(del.statusCode, del.body).toBe(200);
    await new Promise((r) => setTimeout(r, 500));
    expect(sent.filter((m) => m.to === email)).toHaveLength(1);
  });
});

describe('site lead notice', () => {
  it('mails the team (MAIL_OPS_TO) with the lead, escaped', async () => {
    const name = `Joana <b>${randomInt(1e6)}</b>`;
    const r = await app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: { name, phone: '+5511987654321', message: 'Quero saber mais' },
    });
    expect(r.statusCode, r.body).toBe(200);
    const m = await waitFor(() => sent.find((x) => x.to === OPS && x.subject.includes(name)));
    expect(m.subject).toBe(`Nova mensagem pelo site: ${name}`);
    expect(m.html).not.toContain(name);
    expect(m.text).toContain('Mensagem: Quero saber mais');
  });
});
