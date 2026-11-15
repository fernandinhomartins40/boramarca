// Routes and behaviour asked for by the app, panel and site agents (wave 4).
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';
import { clients, conversations, professionals } from './db/schema';
import { captureSender, randomPhone, seedProfessional, testConfig } from './test/helpers';

const { sender, codes } = captureSender();
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp(testConfig(), { otpSender: sender });
  await app.ready();
});
afterAll(() => app.close());

const bearer = (p: { professionalId: string; salonId: string }) => ({
  authorization: `Bearer ${app.issueTokens({ professionalId: p.professionalId, salonId: p.salonId, role: 'owner' }).accessToken}`,
});

it('GET /conversations/:id returns one conversation, only to its professional', async () => {
  const pro = await seedProfessional(app.db);
  const other = await seedProfessional(app.db);
  const [c] = await app.db
    .insert(clients)
    .values({ professionalId: pro.professionalId, name: 'Beatriz Lima', phone: randomPhone() })
    .returning();
  const [conv] = await app.db
    .insert(conversations)
    .values({ professionalId: pro.professionalId, clientId: c!.id, unreadCount: 2 })
    .returning();
  const own = await app.inject({
    method: 'GET',
    url: `/v1/conversations/${conv!.id}`,
    headers: bearer(pro),
  });
  expect(own.statusCode).toBe(200);
  expect(own.json()).toMatchObject({ id: conv!.id, clientName: 'Beatriz Lima', unreadCount: 2 });
  const theirs = await app.inject({
    method: 'GET',
    url: `/v1/conversations/${conv!.id}`,
    headers: bearer(other),
  });
  expect(theirs.statusCode).toBe(404);
});

const otp = (phone: string, purpose: 'login' | 'delete_account') =>
  app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone, purpose } });
const verify = (phone: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    payload: { phone, code: codes.get(phone)! },
  });

it('verify after a delete_account code: unknown number is 404 and creates no account', async () => {
  const phone = randomPhone();
  expect((await otp(phone, 'delete_account')).statusCode).toBe(200);
  const r = await verify(phone);
  expect(r.statusCode).toBe(404);
  expect(r.json().code).toBe('ACCOUNT_NOT_FOUND');
  expect(await app.db.select().from(professionals).where(eq(professionals.phone, phone))).toEqual(
    [],
  );
});

it('verify after a delete_account code: existing account logs in; DELETE /me needs a fresh code', async () => {
  const pro = await seedProfessional(app.db);
  await otp(pro.phone, 'delete_account');
  const r = await verify(pro.phone);
  expect(r.statusCode).toBe(200);
  expect(r.json().isNewUser).toBe(false);
  const del = await app.inject({
    method: 'DELETE',
    url: '/v1/me',
    headers: { authorization: `Bearer ${r.json().accessToken}` },
    payload: { code: codes.get(pro.phone)!, origin: 'web' },
  });
  expect(del.statusCode).toBe(400); // the code was spent on the login
});

it('a login code still creates the account on first login (app flow unchanged)', async () => {
  const phone = randomPhone();
  await otp(phone, 'login');
  const r = await verify(phone);
  expect(r.statusCode).toBe(200);
  expect(r.json().isNewUser).toBe(true);
});
