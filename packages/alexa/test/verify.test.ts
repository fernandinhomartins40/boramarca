import { generateKeyPairSync, sign } from 'node:crypto';
import forge from 'node-forge';
import { describe, expect, it, vi } from 'vitest';
import {
  createAlexaRequestHandler,
  createAlexaSkill,
  createRequestVerifier,
  isValidCertUrl,
} from '../src';
import { SKILL_ID, fakePorts, fixture, speech } from './helpers';

const NOW = new Date('2026-11-14T13:00:00Z');
const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-12.pem';
const DAY = 86_400_000;

/** Test CA → leaf with the given SAN, all generated offline. */
function makeCert(opts: {
  cn: string;
  san?: string;
  issuer?: { cert: forge.pki.Certificate; key: string };
  ca?: boolean;
  from?: Date;
  to?: Date;
}) {
  const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = kp.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(
    kp.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(8)).replace(/^[89a-f]/, '1');
  cert.validity.notBefore = opts.from ?? new Date(NOW.getTime() - DAY);
  cert.validity.notAfter = opts.to ?? new Date(NOW.getTime() + 365 * DAY);
  const subject = [{ name: 'commonName', value: opts.cn }];
  cert.setSubject(subject);
  cert.setIssuer(opts.issuer ? opts.issuer.cert.subject.attributes : subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: !!opts.ca, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyCertSign: !!opts.ca, critical: true },
    ...(opts.san ? [{ name: 'subjectAltName', altNames: [{ type: 2, value: opts.san }] }] : []),
  ]);
  cert.sign(forge.pki.privateKeyFromPem(opts.issuer?.key ?? keyPem), forge.md.sha256.create());
  return { cert, key: keyPem, pem: forge.pki.certificateToPem(cert) };
}

const root = makeCert({ cn: 'Test Root CA', ca: true });
const inter = makeCert({ cn: 'Test Intermediate', ca: true, issuer: root });
const leaf = makeCert({ cn: 'echo-api.amazon.com', san: 'echo-api.amazon.com', issuer: inter });
const CHAIN = leaf.pem + inter.pem;

const body = (ts = NOW) =>
  JSON.stringify({
    ...fixture('clientes-restantes'),
    request: { ...fixture('clientes-restantes').request, timestamp: ts.toISOString() },
  });
const signWith = (raw: string, key = leaf.key) =>
  sign('sha256', Buffer.from(raw), key).toString('base64');
const headers = (raw: string, over: Record<string, string> = {}) => ({
  signaturecertchainurl: CERT_URL,
  'signature-256': signWith(raw),
  ...over,
});

function setup(chain = CHAIN, now = NOW) {
  const fetchText = vi.fn(async () => chain);
  const verify = createRequestVerifier({ fetchText, now: () => now, trustedRoots: [root.pem] });
  const handle = createAlexaRequestHandler({
    skill: createAlexaSkill({ skillId: SKILL_ID, ports: fakePorts() }),
    verify,
  });
  return { fetchText, verify, handle };
}

describe('request verification', () => {
  it('accepts a signed, fresh request and runs the skill', async () => {
    const { handle } = setup();
    const raw = body();
    const r = await handle(raw, headers(raw));
    expect(r.status).toBe(200);
    expect(speech(r.body as never)).toContain('quantos clientes ainda tenho hoje');
  });

  it('downloads the chain once', async () => {
    const { handle, fetchText } = setup();
    const raw = body();
    await handle(raw, headers(raw));
    await handle(raw, headers(raw));
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('header names are case-insensitive and Buffers work', async () => {
    const { handle } = setup();
    const raw = body();
    const r = await handle(Buffer.from(raw), {
      SignatureCertChainUrl: CERT_URL,
      'Signature-256': signWith(raw),
    });
    expect(r.status).toBe(200);
  });

  type Case = (raw: string) => [string, Record<string, string>];
  it.each<[string, Case, string]>([
    [
      'tampered body',
      (raw) => [raw.replace('ClientesRestantes', 'ProximoCliente'), headers(raw)],
      'bad signature',
    ],
    [
      'missing signature',
      (raw) => [raw, { signaturecertchainurl: CERT_URL }],
      'missing signature headers',
    ],
    [
      'missing cert url',
      (raw) => [raw, { 'signature-256': signWith(raw) }],
      'missing signature headers',
    ],
    [
      'signed by another key',
      (raw) => [raw, headers(raw, { 'signature-256': signWith(raw, inter.key) })],
      'bad signature',
    ],
    [
      'bad cert url',
      (raw) => [raw, headers(raw, { signaturecertchainurl: 'https://evil.com/echo.api/c.pem' })],
      'invalid certificate URL',
    ],
  ])('rejects: %s', async (_n, make, error) => {
    const { handle, fetchText } = setup();
    const [raw, h] = make(body());
    const r = await handle(raw, h);
    expect(r).toEqual({ status: 400, body: { error } });
    if (error === 'invalid certificate URL') expect(fetchText).not.toHaveBeenCalled();
  });

  it('timestamp: 150 s ok, 151 s rejected (both directions)', async () => {
    const { handle } = setup();
    for (const [offset, status] of [
      [150_000, 200],
      [-150_000, 200],
      [151_000, 400],
      [-151_000, 400],
    ] as const) {
      const raw = body(new Date(NOW.getTime() + offset));
      const r = await handle(raw, headers(raw));
      expect(r.status).toBe(status);
      if (status === 400) expect(r.body).toEqual({ error: 'stale timestamp' });
    }
  });

  it('rejects an expired signing certificate', async () => {
    const old = makeCert({
      cn: 'echo-api.amazon.com',
      san: 'echo-api.amazon.com',
      issuer: inter,
      from: new Date(NOW.getTime() - 30 * DAY),
      to: new Date(NOW.getTime() - DAY),
    });
    const { handle } = setup(old.pem + inter.pem);
    const raw = body();
    expect(
      (await handle(raw, headers(raw, { 'signature-256': signWith(raw, old.key) }))).body,
    ).toEqual({
      error: 'certificate out of date',
    });
  });

  it('rejects a certificate without the Alexa SAN', async () => {
    const other = makeCert({ cn: 'echo-api.amazon.com', san: 'example.com', issuer: inter });
    const { handle } = setup(other.pem + inter.pem);
    const raw = body();
    expect(
      (await handle(raw, headers(raw, { 'signature-256': signWith(raw, other.key) }))).body,
    ).toEqual({
      error: 'certificate SAN mismatch',
    });
  });

  it('rejects a chain that does not end on a trusted root', async () => {
    const rogueRoot = makeCert({ cn: 'Test Root CA', ca: true });
    const rogueLeaf = makeCert({ cn: 'x', san: 'echo-api.amazon.com', issuer: rogueRoot });
    const { handle } = setup(rogueLeaf.pem + rogueRoot.pem);
    const raw = body();
    expect(
      (await handle(raw, headers(raw, { 'signature-256': signWith(raw, rogueLeaf.key) }))).body,
    ).toEqual({
      error: 'untrusted certificate chain',
    });
  });

  it('rejects a chain whose "intermediate" is not a CA', async () => {
    const notCa = makeCert({ cn: 'Not a CA', issuer: root });
    const l = makeCert({ cn: 'x', san: 'echo-api.amazon.com', issuer: notCa });
    const { handle } = setup(l.pem + notCa.pem);
    const raw = body();
    expect(
      (await handle(raw, headers(raw, { 'signature-256': signWith(raw, l.key) }))).body,
    ).toEqual({
      error: 'broken certificate chain',
    });
  });

  it('rejects a request for another skill id (signature ok)', async () => {
    const { verify } = setup();
    const handle = createAlexaRequestHandler({
      skill: createAlexaSkill({ skillId: 'amzn1.ask.skill.other', ports: fakePorts() }),
      verify,
    });
    const raw = body();
    expect((await handle(raw, headers(raw))).status).toBe(400);
  });
});

describe('isValidCertUrl (Amazon examples)', () => {
  it.each([
    ['https://s3.amazonaws.com/echo.api/echo-api-cert.pem', true],
    ['https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem', true],
    ['https://s3.amazonaws.com/echo.api/../echo.api/echo-api-cert.pem', true],
    ['HTTPS://s3.amazonaws.com/echo.api/echo-api-cert.pem', true],
    ['https://S3.AMAZONAWS.COM/echo.api/echo-api-cert.pem', true],
    ['http://s3.amazonaws.com/echo.api/echo-api-cert.pem', false],
    ['https://notamazon.com/echo.api/echo-api-cert.pem', false],
    ['https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem', false],
    ['https://s3.amazonaws.com/invalid.path/echo-api-cert.pem', false],
    ['https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => expect(isValidCertUrl(url)).toBe(ok));
});
