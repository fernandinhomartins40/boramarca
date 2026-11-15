// POST /leads (site contact form) and each /auth/otp/* route are limited per IP (counters in Redis).
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomPhone, testApp } from './test/helpers';

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp({ RATE_LIMIT_LEADS_MAX: '2', RATE_LIMIT_OTP_MAX: '3' });
});
afterAll(() => app.close());

const lead = (extra: object = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/leads',
    payload: { name: 'Rita', phone: randomPhone(), message: 'Quero conhecer', ...extra },
  });

it('POST /leads stores the contact, rejects the honeypot and limits per IP', async () => {
  const ok = await lead();
  expect(ok.statusCode, ok.body).toBe(200);
  expect(ok.json()).toMatchObject({ ok: true });
  expect((await lead({ website: 'http://spam' })).statusCode).toBe(400);
  const third = await lead();
  expect(third.statusCode).toBe(429);
  expect(third.json()).toMatchObject({ code: 'RATE_LIMITED' });
  // Another IP has its own counter.
  const other = await app.inject({
    method: 'POST',
    url: '/v1/leads',
    remoteAddress: '10.1.2.3',
    payload: { name: 'Rui', phone: randomPhone() },
  });
  expect(other.statusCode).toBe(200);
});

it('/auth/otp/request and /verify are limited per IP', async () => {
  const ip = '10.9.9.9';
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, payload, remoteAddress: ip });
  expect((await post('/v1/auth/otp/request', { phone: randomPhone() })).statusCode).toBe(200);
  expect((await post('/v1/auth/otp/request', { phone: randomPhone() })).statusCode).toBe(200);
  expect((await post('/v1/auth/otp/request', { phone: randomPhone() })).statusCode).toBe(200);
  const blocked = await post('/v1/auth/otp/request', { phone: randomPhone() });
  expect(blocked.statusCode).toBe(429);
  expect(blocked.json().code).toBe('RATE_LIMITED');
  // verify has its own counter.
  expect(
    (await post('/v1/auth/otp/verify', { phone: randomPhone(), code: '123456' })).statusCode,
  ).toBe(200);
});
