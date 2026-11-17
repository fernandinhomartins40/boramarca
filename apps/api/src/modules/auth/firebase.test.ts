import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import forge from 'node-forge';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MeResponse, OtpVerifyResponse } from '@boramarca/shared';
import { randomPhone, testApp } from '../../test/helpers';
import { FIREBASE_CERTS_URL, resetFirebaseKeys } from './firebase';

const PROJECT = 'boramarca-test';
const KID = 'kid-1';
const REVIEW = '+5511900000099';

function keyPair() {
  const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    priv: kp.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    pub: kp.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
const good = keyPair();
const other = keyPair();

/** Self-signed certificate like the ones Google publishes for securetoken. */
function certPem(k: { priv: string; pub: string }) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(k.pub);
  cert.serialNumber = '01' + randomBytes(7).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const subject = [{ name: 'commonName', value: 'securetoken.system.gserviceaccount.com' }];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(forge.pki.privateKeyFromPem(k.priv), forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(over: Record<string, unknown> = {}, key = good.priv) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'firebase-uid',
    iat: now - 10,
    exp: now + 3600,
    auth_time: now - 10,
    phone_number: randomPhone(),
    firebase: { sign_in_provider: 'phone', identities: {} },
    ...over,
  };
  const head = `${b64({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64(claims)}`;
  const sig = createSign('RSA-SHA256').update(head).sign(key).toString('base64url');
  return { token: `${head}.${sig}`, phone: claims.phone_number as string };
}

let app: Awaited<ReturnType<typeof testApp>>;
const fetchMock = vi.fn(async (url: string | URL) => {
  if (String(url) !== FIREBASE_CERTS_URL) return new Response('', { status: 404 });
  return new Response(JSON.stringify({ [KID]: certPem(good) }), {
    headers: { 'cache-control': 'public, max-age=3600', 'content-type': 'application/json' },
  });
});
beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  app = await testApp({
    FIREBASE_PROJECT_ID: PROJECT,
    RATE_LIMIT_OTP_MAX: '1000',
    REVIEW_PHONE: REVIEW,
    REVIEW_OTP: '424242',
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
});
afterEach(() => resetFirebaseKeys());

const login = (token: string, purpose?: string) =>
  app.inject({ method: 'POST', url: '/v1/auth/firebase', payload: { idToken: token, purpose } });

describe('POST /auth/firebase', () => {
  it('a valid phone token creates the account, then logs into it again', async () => {
    const { token, phone } = idToken();
    const r = await login(token);
    expect(r.statusCode).toBe(200);
    const t = OtpVerifyResponse.parse(r.json());
    expect(t.isNewUser).toBe(true);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${t.accessToken}` },
    });
    expect(MeResponse.parse(me.json()).professional).toMatchObject({ phone, role: 'owner' });
    const again = OtpVerifyResponse.parse(
      (await login(idToken({ phone_number: phone }).token)).json(),
    );
    expect(again.isNewUser).toBe(false);
    // Certificates are cached (Cache-Control max-age) within a test.
    resetFirebaseKeys();
    fetchMock.mockClear();
    await login(idToken().token);
    await login(idToken().token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong audience', { aud: 'outro-projeto' }],
    ['wrong issuer', { iss: 'https://securetoken.google.com/outro-projeto' }],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['no phone_number', { phone_number: undefined }],
    ['not a phone sign-in', { firebase: { sign_in_provider: 'password' } }],
  ])('refuses a token with %s', async (_name, over) => {
    const r = await login(idToken(over).token);
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe('FIREBASE_TOKEN_INVALID');
  });

  it('refuses a token signed by another key, and garbage', async () => {
    expect((await login(idToken({}, other.priv).token)).statusCode).toBe(401);
    expect((await login('nao.e.token')).statusCode).toBe(401);
  });

  it('delete_account: never creates an account; its session deletes with a fresh token', async () => {
    const none = await login(idToken().token, 'delete_account');
    expect(none.json().code).toBe('ACCOUNT_NOT_FOUND');

    const { token, phone } = idToken();
    await login(token); // the account exists
    const s = OtpVerifyResponse.parse(
      (await login(idToken({ phone_number: phone }).token, 'delete_account')).json(),
    );
    const del = (idTok: string) =>
      app.inject({
        method: 'DELETE',
        url: '/v1/me',
        headers: { authorization: `Bearer ${s.accessToken}` },
        payload: { idToken: idTok, origin: 'web' },
      });
    // Another phone's token does not confirm this account's deletion.
    expect((await del(idToken().token)).json().code).toBe('OTP_INVALID');
    const ok = await del(idToken({ phone_number: phone }).token);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().ok).toBe(true);
  });

  it('otp/request tells the client to use Firebase, except for the review account', async () => {
    const req = (phone: string) =>
      app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone } });
    expect((await req(randomPhone())).json()).toMatchObject({ ok: true, provider: 'firebase' });
    const review = (await req(REVIEW)).json();
    expect(review.ok).toBe(true);
    expect(review.provider).toBeUndefined();
  });

  it('health says Firebase login is on', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json().firebaseAuth).toBe(true);
  });
});

describe('without FIREBASE_PROJECT_ID', () => {
  it('answers 503 and health says off', async () => {
    const off = await testApp();
    try {
      const r = await off.inject({
        method: 'POST',
        url: '/v1/auth/firebase',
        payload: { idToken: idToken().token },
      });
      expect(r.statusCode).toBe(503);
      expect((await off.inject({ method: 'GET', url: '/health' })).json().firebaseAuth).toBe(false);
    } finally {
      await off.close();
    }
  });
});
