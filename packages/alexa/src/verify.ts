import { X509Certificate, verify as verifySig } from 'node:crypto';
import { rootCertificates } from 'node:tls';

/**
 * Amazon's request checks for skills hosted as a web service (not Lambda):
 * https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
 * Any failure → the API answers 400 and drops the request.
 */
export class AlexaVerificationError extends Error {}

export const ALEXA_TIMESTAMP_TOLERANCE_MS = 150_000;
export const ALEXA_CERT_SAN = 'echo-api.amazon.com';

type Headers = Record<string, string | string[] | undefined>;

export interface VerifierOptions {
  /** Downloads the PEM chain. Default: global `fetch`. */
  fetchText?: (url: string) => Promise<string>;
  now?: () => Date;
  /** PEM roots the chain must end on. Default: Node's bundled Mozilla CA store. */
  trustedRoots?: readonly string[];
}

const header = (h: Headers, name: string) => {
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key ? h[key] : undefined;
  return Array.isArray(v) ? v[0] : v;
};

/** URL rules from Amazon's doc, applied after normalizing `..`, `.` and duplicate slashes. */
export function isValidCertUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw); // WHATWG URL resolves dot segments and lowercases scheme/host
  } catch {
    return false;
  }
  const path = u.pathname.replace(/\/{2,}/g, '/');
  return (
    u.protocol === 'https:' &&
    u.hostname === 's3.amazonaws.com' &&
    path.startsWith('/echo.api/') &&
    (u.port === '' || u.port === '443')
  );
}

const splitPem = (pem: string) =>
  pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];

/** Leaf in date with the Alexa SAN, each cert signed by the next, last one signed by (or being) a trusted root. */
export function checkChain(
  pem: string,
  now: Date,
  roots: readonly X509Certificate[],
): X509Certificate {
  const certs = splitPem(pem).map((p) => new X509Certificate(p));
  const [leaf] = certs;
  if (!leaf) throw new AlexaVerificationError('empty certificate chain');
  for (const c of certs)
    if (now < new Date(c.validFrom) || now > new Date(c.validTo))
      throw new AlexaVerificationError('certificate out of date');
  if (!leaf.checkHost(ALEXA_CERT_SAN, { subject: 'never' }))
    throw new AlexaVerificationError('certificate SAN mismatch');
  for (let i = 0; i < certs.length - 1; i++) {
    const issuer = certs[i + 1]!;
    if (!issuer.ca || !certs[i]!.checkIssued(issuer) || !certs[i]!.verify(issuer.publicKey))
      throw new AlexaVerificationError('broken certificate chain');
  }
  const top = certs[certs.length - 1]!;
  const trusted = roots.some(
    (r) =>
      r.fingerprint256 === top.fingerprint256 || (top.checkIssued(r) && top.verify(r.publicKey)),
  );
  if (!trusted) throw new AlexaVerificationError('untrusted certificate chain');
  return leaf;
}

/**
 * Returns `verify(rawBody, headers)` → the parsed request envelope, or throws `AlexaVerificationError`.
 * `rawBody` must be the exact bytes Amazon sent (the signature covers them).
 */
export function createRequestVerifier(opts: VerifierOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const fetchText =
    opts.fetchText ??
    (async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new AlexaVerificationError(`certificate download failed: ${r.status}`);
      return r.text();
    });
  let roots: X509Certificate[] | undefined;
  const cache = new Map<string, string>(); // shortcut: unbounded, but Amazon uses a handful of URLs

  return async function verify(rawBody: string | Buffer, headers: Headers): Promise<unknown> {
    const certUrl = header(headers, 'signaturecertchainurl');
    const signature = header(headers, 'signature-256');
    if (!certUrl || !signature) throw new AlexaVerificationError('missing signature headers');
    if (!isValidCertUrl(certUrl)) throw new AlexaVerificationError('invalid certificate URL');

    let pem = cache.get(certUrl);
    if (!pem) {
      pem = await fetchText(certUrl);
      cache.set(certUrl, pem);
    }
    roots ??= (opts.trustedRoots ?? rootCertificates).map((p) => new X509Certificate(p));
    let leaf: X509Certificate;
    try {
      leaf = checkChain(pem, now(), roots);
    } catch (e) {
      cache.delete(certUrl); // chain may have rotated; download again next time
      throw e;
    }

    const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    if (!verifySig('sha256', body, leaf.publicKey, Buffer.from(signature, 'base64')))
      throw new AlexaVerificationError('bad signature');

    let envelope: { request?: { timestamp?: unknown } };
    try {
      envelope = JSON.parse(body.toString('utf8'));
    } catch {
      throw new AlexaVerificationError('invalid JSON');
    }
    const ts = Date.parse(String(envelope.request?.timestamp));
    if (!Number.isFinite(ts) || Math.abs(now().getTime() - ts) > ALEXA_TIMESTAMP_TOLERANCE_MS)
      throw new AlexaVerificationError('stale timestamp');
    return envelope;
  };
}
export type RequestVerifier = ReturnType<typeof createRequestVerifier>;
