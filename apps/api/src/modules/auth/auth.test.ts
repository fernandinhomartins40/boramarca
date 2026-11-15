import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeResponse, OtpVerifyResponse } from '@boramarca/shared';
import { otpCodes, refreshFamilies } from '../../db/schema';
import { captureSender, randomPhone, testApp } from '../../test/helpers';
import { OTP_MAX_ATTEMPTS, OTP_MAX_FAILURES_PER_WINDOW } from './otp';

const { sender, codes } = captureSender();
let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp({ RATE_LIMIT_OTP_MAX: '1000' }, sender); // many tries in one file
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

describe('security review fixes', () => {
  const requestFor = (phone: string, purpose: 'login' | 'delete_account') =>
    post('/v1/auth/otp/request', { phone, purpose });

  it('M1: the delete_account code works while a login code is pending; B1: it opens only deletion', async () => {
    // Someone with an account; then a login code is asked for the number (anyone can do that).
    const phone = randomPhone();
    await verify(phone, '123456');
    await requestFor(phone, 'delete_account');
    const del = codes.get(phone)!;
    await requestFor(phone, 'login');
    const v = await verify(phone, del);
    expect(v.statusCode, v.body).toBe(200);
    const t = OtpVerifyResponse.parse(v.json());
    const auth = { authorization: `Bearer ${t.accessToken}` };
    // Restricted session: no profile, no refresh, but the deletion flow works.
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth })).statusCode).toBe(
      403,
    );
    expect((await post('/v1/auth/refresh', { refreshToken: t.refreshToken })).statusCode).toBe(401);
    // The login code is still there and still works.
    expect((await verify(phone, codes.get(phone)!)).statusCode).toBe(200);
  });

  it('M2: parallel wrong tries cannot pass the per-code limit', async () => {
    const phone = randomPhone();
    await request(phone);
    const good = codes.get(phone)!;
    const bad = good === '000000' ? '111111' : '000000';
    const many = await Promise.all(Array.from({ length: 12 }, () => verify(phone, bad)));
    const invalid = many.filter((r) => r.json().code === 'OTP_INVALID');
    expect(invalid.length).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
    const [row] = await app.db.select().from(otpCodes).where(eq(otpCodes.phone, phone));
    expect(row!.attempts).toBe(OTP_MAX_ATTEMPTS);
    expect((await verify(phone, good)).json().code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('M2: a new code does not reset the per-phone limit', async () => {
    const phone = randomPhone();
    const wrong = (c: string) => (c === '000000' ? '111111' : '000000');
    for (let round = 0; round < 2; round++) {
      await app.db.delete(otpCodes).where(eq(otpCodes.phone, phone)); // skip the 60 s cooldown
      await request(phone);
      for (let i = 0; i < OTP_MAX_FAILURES_PER_WINDOW / 2; i++)
        await verify(phone, wrong(codes.get(phone)!));
    }
    await app.db.delete(otpCodes).where(eq(otpCodes.phone, phone));
    await request(phone);
    const r = await verify(phone, codes.get(phone)!); // even the right code: locked for a while
    expect(r.statusCode).toBe(429);
    expect(r.json().code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('M3: refresh rotates; reusing an old one ends the session; logout ends it', async () => {
    const t0 = OtpVerifyResponse.parse((await verify(randomPhone(), '123456')).json());
    const r1 = await post('/v1/auth/refresh', { refreshToken: t0.refreshToken });
    expect(r1.statusCode).toBe(200);
    const t1 = r1.json();
    // The used token is spent. Right after the rotation that is a race (two tabs): only 401.
    expect((await post('/v1/auth/refresh', { refreshToken: t0.refreshToken })).statusCode).toBe(
      401,
    );
    // Later, reusing it (a stolen copy) also kills the newer one.
    await app.db
      .update(refreshFamilies)
      .set({ updatedAt: new Date(Date.now() - 60_000) })
      .where(
        eq(
          refreshFamilies.professionalId,
          MeResponse.parse(
            (
              await app.inject({
                method: 'GET',
                url: '/v1/me',
                headers: { authorization: `Bearer ${t1.accessToken}` },
              })
            ).json(),
          ).professional.id,
        ),
      );
    expect((await post('/v1/auth/refresh', { refreshToken: t0.refreshToken })).statusCode).toBe(
      401,
    );
    expect((await post('/v1/auth/refresh', { refreshToken: t1.refreshToken })).statusCode).toBe(
      401,
    );

    const s0 = OtpVerifyResponse.parse((await verify(randomPhone(), '123456')).json());
    const s1 = (await post('/v1/auth/refresh', { refreshToken: s0.refreshToken })).json();
    const s2 = (await post('/v1/auth/refresh', { refreshToken: s1.refreshToken })).json();
    expect(s2.refreshToken).toEqual(expect.any(String));
    const out = await post('/v1/auth/logout', { refreshToken: s2.refreshToken });
    expect(out.json()).toEqual({ ok: true });
    expect((await post('/v1/auth/refresh', { refreshToken: s2.refreshToken })).statusCode).toBe(
      401,
    );
    // Logging out twice, or with garbage, is still ok.
    expect((await post('/v1/auth/logout', { refreshToken: 'x' })).json()).toEqual({ ok: true });
  });
});

describe('auth in production', () => {
  let prod: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => {
    prod = await testApp({
      NODE_ENV: 'production',
      REVIEW_PHONE: '+5511900009999',
      REVIEW_OTP: '424242',
      RATE_LIMIT_OTP_MAX: '1000', // production apps share one per-IP counter across test runs
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
  it('B2: wrong review codes are counted and lock the review phone', async () => {
    const review = await testApp({
      NODE_ENV: 'production',
      REVIEW_PHONE: '+5511900008888',
      REVIEW_OTP: '424242',
      RATE_LIMIT_OTP_MAX: '1000',
    });
    try {
      const try_ = (code: string) =>
        review.inject({
          method: 'POST',
          url: '/v1/auth/otp/verify',
          payload: { phone: '+5511900008888', code },
        });
      for (let i = 0; i < OTP_MAX_FAILURES_PER_WINDOW; i++)
        expect((await try_('000000')).json().code).toBe('OTP_INVALID');
      expect((await try_('424242')).json().code).toBe('OTP_TOO_MANY_ATTEMPTS');
    } finally {
      await review.redis.del(
        `otp:fail:${createHmac('sha256', 'a'.repeat(32)).update('+5511900008888').digest('hex')}`,
      );
      await review.close();
    }
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
