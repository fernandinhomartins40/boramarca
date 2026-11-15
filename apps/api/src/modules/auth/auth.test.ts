import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeResponse, OtpVerifyResponse } from '@boramarca/shared';
import { otpCodes } from '../../db/schema';
import { captureSender, randomPhone, testApp } from '../../test/helpers';
import { OTP_MAX_ATTEMPTS } from './otp';

const { sender, codes } = captureSender();
let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp({}, sender);
});
afterAll(() => app.close());

const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
const request = (phone: string) => post('/v1/auth/otp/request', { phone });
const verify = (phone: string, code: string) => post('/v1/auth/otp/verify', { phone, code });

describe('auth: OTP + JWT', () => {
  it('request -> verify creates salon + owner on first login, then logs in again', async () => {
    const phone = randomPhone();
    const r = await request(phone);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, expiresInSeconds: 600, retryAfterSeconds: 60 });
    const code = codes.get(phone)!;
    expect(code).toMatch(/^\d{6}$/);
    const [row] = await app.db.select().from(otpCodes).where(eq(otpCodes.phone, phone));
    expect(row!.codeHash).not.toContain(code); // only the hash is stored

    const v = await verify(phone, code);
    expect(v.statusCode).toBe(200);
    const tokens = OtpVerifyResponse.parse(v.json());
    expect(tokens.isNewUser).toBe(true);

    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    const body = MeResponse.parse(me.json());
    expect(body.professional).toMatchObject({ phone, role: 'owner' });
    expect(body.salon.timezone).toBe('America/Sao_Paulo');

    // Code is single use.
    expect((await verify(phone, code)).json().code).toBe('OTP_EXPIRED');
    // Second login (dev code) finds the same account.
    const again = OtpVerifyResponse.parse((await verify(phone, '123456')).json());
    expect(again.isNewUser).toBe(false);
  });

  it('resend cooldown', async () => {
    const phone = randomPhone();
    await request(phone);
    const r = await request(phone);
    expect(r.statusCode).toBe(429);
    expect(r.json().code).toBe('OTP_TOO_SOON');
  });

  it('wrong codes count attempts and lock after the limit', async () => {
    const phone = randomPhone();
    await request(phone);
    const good = codes.get(phone)!;
    const bad = good === '000000' ? '111111' : '000000';
    const first = await verify(phone, bad);
    expect(first.statusCode).toBe(400);
    expect(first.json()).toMatchObject({
      code: 'OTP_INVALID',
      details: { attemptsLeft: OTP_MAX_ATTEMPTS - 1 },
    });
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) await verify(phone, bad);
    const locked = await verify(phone, good);
    expect(locked.statusCode).toBe(429);
    expect(locked.json().code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('expired code is refused', async () => {
    const phone = randomPhone();
    await request(phone);
    await app.db
      .update(otpCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(otpCodes.phone, phone));
    expect((await verify(phone, codes.get(phone)!)).json().code).toBe('OTP_EXPIRED');
  });

  it('refresh issues new tokens; an access token is not a refresh token', async () => {
    const t = OtpVerifyResponse.parse((await verify(randomPhone(), '123456')).json());
    const r = await post('/v1/auth/refresh', { refreshToken: t.refreshToken });
    expect(r.statusCode).toBe(200);
    expect(r.json().accessToken).toEqual(expect.any(String));
    const bad = await post('/v1/auth/refresh', { refreshToken: t.accessToken });
    expect(bad.statusCode).toBe(401);
    // ...and a refresh token is not an access token.
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${t.refreshToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('PATCH /me updates profile and salon name', async () => {
    const t = OtpVerifyResponse.parse((await verify(randomPhone(), '123456')).json());
    const r = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${t.accessToken}` },
      payload: { name: 'Marina', professions: ['fisioterapeuta'], salonName: 'Espaço Aurora' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      professional: { name: 'Marina', professions: ['fisioterapeuta'] },
      salon: { name: 'Espaço Aurora' },
    });
    const locked = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${t.accessToken}` },
      payload: { autonomy: { change_other_client: true } },
    });
    expect(locked.statusCode).toBe(400); // not part of PATCH /me (strict)
  });

  it('rejects requests without a token', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('auth in production', () => {
  let prod: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => {
    prod = await testApp({
      NODE_ENV: 'production',
      REVIEW_PHONE: '+5511900009999',
      REVIEW_OTP: '424242',
    });
  });
  afterAll(() => prod.close());

  it('123456 is refused', async () => {
    const r = await prod.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: randomPhone(), code: '123456' },
    });
    expect(r.statusCode).toBe(400);
  });
  it('without an SMS provider, requesting a code fails loudly (503)', async () => {
    const r = await prod.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: randomPhone() },
    });
    expect(r.statusCode).toBe(503);
  });
  it('the store review account (REVIEW_PHONE/REVIEW_OTP) works', async () => {
    const r = await prod.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '+5511900009999', code: '424242' },
    });
    expect(r.statusCode).toBe(200);
  });
});
