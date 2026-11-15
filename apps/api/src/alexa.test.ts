// Alexa wiring (plan section 14): signed skill requests, account linking end to end, settings and
// the Voice Monkey announcement. No Amazon, no internet: test CA, simulated HTTP.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequestVerifier } from '@boramarca/alexa';
import { buildApp } from './app';
import { alexaSettings, professionals } from './db/schema';
import { loadPro } from './lib/core';
import { captureSender, randomPhone, seedProfessional, testConfig } from './test/helpers';
import { waitFor } from './test/connected';

vi.setConfig({ testTimeout: 180_000 });

const SKILL_ID = 'amzn1.ask.skill.00000000-0000-4000-8000-000000000001';
const CLIENT_ID = 'alexa-skill';
const CLIENT_SECRET = 'test-client-secret-0123456789';
const REDIRECT = 'https://pitangui.amazon.com/api/skill/link/M2TESTVENDOR';
const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-test.pem';
const DAY = 86_400_000;

/** Test CA → Alexa leaf certificate (SAN echo-api.amazon.com), generated offline. */
function makeCert(cn: string, issuer?: { cert: forge.pki.Certificate; key: string }, san?: string) {
  const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = kp.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(
    kp.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  cert.serialNumber = '01' + randomBytes(7).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - DAY);
  cert.validity.notAfter = new Date(Date.now() + 30 * DAY);
  const subject = [{ name: 'commonName', value: cn }];
  cert.setSubject(subject);
  cert.setIssuer(issuer ? issuer.cert.subject.attributes : subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: !issuer, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyCertSign: !issuer, critical: true },
    ...(san ? [{ name: 'subjectAltName', altNames: [{ type: 2, value: san }] }] : []),
  ]);
  cert.sign(forge.pki.privateKeyFromPem(issuer?.key ?? key), forge.md.sha256.create());
  return { cert, key, pem: forge.pki.certificateToPem(cert) };
}
const root = makeCert('Test Root CA');
const leaf = makeCert('echo-api.amazon.com', root, 'echo-api.amazon.com');

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../packages/alexa/test/fixtures/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
/** A recorded request with our access token and a fresh timestamp, signed by the test leaf. */
function signed(name: string, accessToken: string | null) {
  const f = fixture(name);
  for (const u of [f.session?.user, f.context?.System?.user])
    if (u) {
      if (accessToken) u.accessToken = accessToken;
      else delete u.accessToken;
    }
  f.request.timestamp = new Date().toISOString();
  const raw = JSON.stringify(f);
  return {
    raw,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      signaturecertchainurl: CERT_URL,
      'signature-256': sign('sha256', Buffer.from(raw), leaf.key).toString('base64'),
    },
  };
}
const speechOf = (body: { response: { outputSpeech?: { ssml?: string } } }) =>
  body.response.outputSpeech?.ssml?.replace(/<\/?speak>/g, '') ?? '';

const fetchText = vi.fn(async () => leaf.pem);
const vmFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
  Response.json({ success: true }),
);
const { sender, codes } = captureSender();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(
    testConfig({
      ALEXA_SKILL_ID: SKILL_ID,
      ALEXA_OAUTH_CLIENT_ID: CLIENT_ID,
      ALEXA_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
      DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    }),
    {
      otpSender: sender,
      alexaVerifier: createRequestVerifier({ fetchText, trustedRoots: [root.pem] }),
      voiceMonkeyFetch: vmFetch as unknown as typeof fetch,
      alexaTimeoutMs: 60_000,
    },
  );
  await app.ready();
});
afterAll(() => app.close());

const skill = (r: ReturnType<typeof signed>) =>
  app.inject({ method: 'POST', url: '/v1/alexa/skill', payload: r.raw, headers: r.headers });
const form = (url: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url,
    payload: new URLSearchParams(body).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
  });
const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;

/** Runs the whole linking flow for `phone`; returns the token response. */
async function link(phone: string) {
  const verifier = randomBytes(40).toString('base64url');
  const oauth = {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    state: 'state-xyz',
    scope: 'agenda',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  };
  const get = await app.inject({
    method: 'GET',
    url: `/v1/alexa/oauth/authorize?${new URLSearchParams(oauth)}`,
  });
  expect(get.statusCode).toBe(200);
  expect(get.headers['x-frame-options']).toBe('DENY');
  expect(get.body).toContain('name="phone"');
  expect(get.body).toContain('data:image/svg+xml;base64,'); // kit logo

  const local = phone.replace('+55', ''); // typed like a person would
  const step1 = await form('/v1/alexa/oauth/authorize', { ...oauth, step: 'phone', phone: local });
  expect(step1.statusCode).toBe(200);
  expect(step1.body).toContain('name="code"');
  const step2 = await form('/v1/alexa/oauth/authorize', {
    ...oauth,
    step: 'code',
    phone,
    code: codes.get(phone)!,
  });
  expect(step2.statusCode).toBe(303);
  const loc = new URL(step2.headers.location as string);
  expect(`${loc.origin}${loc.pathname}`).toBe(REDIRECT);
  expect(loc.searchParams.get('state')).toBe('state-xyz');
  const code = loc.searchParams.get('code')!;

  const exchange = (v: string) =>
    form(
      '/v1/alexa/oauth/token',
      { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: v },
      { authorization: basic },
    );
  return { code, verifier, exchange };
}

describe('POST /v1/alexa/skill', () => {
  it('rejects unsigned or tampered requests with 400', async () => {
    const r = signed('clientes-restantes', null);
    const noSig = await app.inject({
      method: 'POST',
      url: '/v1/alexa/skill',
      payload: r.raw,
      headers: { 'content-type': 'application/json' },
    });
    expect(noSig.statusCode).toBe(400);
    const tampered = await app.inject({
      method: 'POST',
      url: '/v1/alexa/skill',
      payload: r.raw.replace('ClientesRestantes', 'ProximoCliente'),
      headers: r.headers,
    });
    expect(tampered.statusCode).toBe(400);
  });

  it('a signed request without linking asks to link the account', async () => {
    const res = await skill(signed('clientes-restantes', 'unknown-token'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(speechOf(body)).toContain('vincule sua conta');
    expect(body.response.card.type).toBe('LinkAccount');
  });
});

describe('account linking → skill', () => {
  it('authorize → code → token → the skill knows the professional; answers via alexa', async () => {
    const pro = await seedProfessional(app.db);
    const { exchange } = await link(pro.phone);

    expect((await exchange('x'.repeat(43))).json().error).toBe('invalid_grant'); // wrong PKCE
    // The failed try spent the code (single use): link again.
    const again = await link(pro.phone);
    const tok = await again.exchange(again.verifier);
    expect(tok.statusCode).toBe(200);
    const t = tok.json();
    expect(t.token_type).toBe('Bearer');
    expect(t.expires_in).toBeGreaterThanOrEqual(3600);
    expect((await again.exchange(again.verifier)).json().error).toBe('invalid_grant'); // reused

    const agenda = await skill(signed('clientes-restantes', t.access_token));
    expect(agenda.statusCode).toBe(200);
    expect(speechOf(agenda.json())).not.toContain('vincule');

    // Refresh: new access token, the old one stops working.
    const ref = await form(
      '/v1/alexa/oauth/token',
      { grant_type: 'refresh_token', refresh_token: t.refresh_token },
      { authorization: basic },
    );
    const t2 = ref.json();
    expect(t2.access_token).not.toBe(t.access_token);
    expect(speechOf((await skill(signed('clientes-restantes', t.access_token))).json())).toContain(
      'vincule',
    );

    // A pending decision answered by "sim" on the Echo is recorded as via alexa.
    const d = await app.messaging.decisions.create({
      pro: await loadPro(app.db, pro.professionalId),
      conversationId: null,
      clientId: null,
      type: 'duvida',
      question: 'Pode abrir mais cedo amanhã?',
      options: [
        { id: 'sim', label: 'Sim', action: null },
        { id: 'nao', label: 'Não', action: null },
      ],
      proposedAction: null,
    });
    const yes = await skill(signed('sim', t2.access_token));
    expect(yes.statusCode).toBe(200);
    const [view] = await app.messaging.decisions.list(pro.professionalId, 'resolved', 5);
    expect(view!.id).toBe(d.id);
    expect(view!.resolvedVia).toBe('alexa');

    const settings = await app.inject({
      method: 'GET',
      url: '/v1/alexa/settings',
      headers: { authorization: `Bearer ${token(pro)}` },
    });
    expect(settings.json().linked).toBe(true);
  });

  it('token endpoint: wrong client secret is 401 invalid_client', async () => {
    const r = await form(
      '/v1/alexa/oauth/token',
      { grant_type: 'refresh_token', refresh_token: 'x' },
      {
        authorization: `Basic ${Buffer.from(`${CLIENT_ID}:wrong-secret-123456`).toString('base64')}`,
      },
    );
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe('invalid_client');
  });

  it('authorize: bad redirect_uri shows an error without redirecting; unknown phone creates nothing', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: `/v1/alexa/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: 'https://evil.example/cb',
        state: 's',
        code_challenge: 'c'.repeat(43),
      })}`,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.headers.location).toBeUndefined();

    const phone = randomPhone();
    const oauth = {
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      state: 's',
      code_challenge: 'c'.repeat(43),
    };
    await form('/v1/alexa/oauth/authorize', { ...oauth, step: 'phone', phone });
    const r = await form('/v1/alexa/oauth/authorize', {
      ...oauth,
      step: 'code',
      phone,
      code: codes.get(phone)!,
    });
    expect(r.statusCode).toBe(404);
    expect(r.body).toContain('Não existe conta com este número');
    expect(await app.db.select().from(professionals).where(eq(professionals.phone, phone))).toEqual(
      [],
    );
  });
});

const token = (p: { professionalId: string; salonId: string }) =>
  app.issueTokens({ professionalId: p.professionalId, salonId: p.salonId, role: 'owner' })
    .accessToken;

describe('Voice Monkey announcement', () => {
  it('announces a new decision with the professional’s own token, stored encrypted', async () => {
    const pro = await seedProfessional(app.db);
    const auth = { authorization: `Bearer ${token(pro)}` };
    const vmToken = 'vm-token-of-this-professional-123';
    const patch = await app.inject({
      method: 'PATCH',
      url: '/v1/alexa/settings',
      headers: auth,
      payload: {
        voiceMonkeyEnabled: true,
        voiceMonkeyDevice: 'eco-balcao',
        voiceMonkeyToken: vmToken,
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toEqual({
      linked: false,
      voiceMonkeyEnabled: true,
      voiceMonkeyDevice: 'eco-balcao',
      voiceMonkeyTokenSet: true,
    });
    expect(patch.body).not.toContain(vmToken);
    const [row] = await app.db
      .select()
      .from(alexaSettings)
      .where(eq(alexaSettings.professionalId, pro.professionalId));
    expect(row!.voiceMonkeyTokenEnc).not.toContain(vmToken);

    vmFetch.mockClear();
    await app.messaging.decisions.create({
      pro: await loadPro(app.db, pro.professionalId),
      conversationId: null,
      clientId: null,
      type: 'duvida',
      question: 'Encaixo a Beatriz às 16h?',
      options: [{ id: 'sim', label: 'Sim', action: null }],
      proposedAction: null,
    });
    await waitFor(() => vmFetch.mock.calls.length > 0, 10_000);
    const [url, init] = vmFetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api-v3.voicemonkey.io/announce');
    const sent = JSON.parse(String(init!.body));
    expect(sent).toMatchObject({ token: vmToken, device: 'eco-balcao', language: 'pt-BR' });
    expect(sent.speech).toContain('Encaixo a Beatriz às 16h?');

    // Turned off: nothing goes out.
    await app.inject({
      method: 'PATCH',
      url: '/v1/alexa/settings',
      headers: auth,
      payload: { voiceMonkeyEnabled: false },
    });
    vmFetch.mockClear();
    await app.messaging.decisions.create({
      pro: await loadPro(app.db, pro.professionalId),
      conversationId: null,
      clientId: null,
      type: 'duvida',
      question: 'Outra?',
      options: [{ id: 'sim', label: 'Sim', action: null }],
      proposedAction: null,
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(vmFetch).not.toHaveBeenCalled();
  });
});
