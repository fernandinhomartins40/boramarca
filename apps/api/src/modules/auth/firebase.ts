// Firebase Authentication (phone) as the SMS provider: the client signs in with Firebase, sends us
// the ID token, and we check it here (RS256 against Google's public certificates), as in
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
import { createVerify, X509Certificate, type KeyObject } from 'node:crypto';
import { PhoneE164 } from '@boramarca/shared';
import { AppError } from '../../lib/errors';

export const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cache: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

/** Test hook: forget the cached certificates. */
export const resetFirebaseKeys = () => void (cache = null);

/** Google rotates the keys; the response's Cache-Control max-age says how long they are good. */
async function publicKeys(): Promise<Map<string, KeyObject>> {
  if (cache && cache.expiresAt > Date.now()) return cache.keys;
  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) throw unavailable();
  const pems = (await res.json()) as Record<string, string>;
  const keys = new Map(
    Object.entries(pems).map(([kid, pem]) => [kid, new X509Certificate(pem).publicKey]),
  );
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 0);
  cache = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

const unavailable = () =>
  new AppError(503, 'OTP_UNAVAILABLE', 'Envio de código indisponível no momento');
const invalid = () =>
  new AppError(401, 'FIREBASE_TOKEN_INVALID', 'Não deu para confirmar o código. Tente de novo.');

const part = (s: string | undefined) => {
  try {
    return JSON.parse(Buffer.from(s ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw invalid();
  }
};

/** Small clock skew allowed between Google and this server. */
const SKEW_S = 60;

/** Checks a Firebase ID token from a phone sign-in; returns the proven phone (E.164). Throws 401. */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
): Promise<{ phone: string; authTime: number }> {
  const [h, p, sig] = token.split('.');
  const header = part(h);
  const claims = part(p);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !sig) throw invalid();
  // An unknown kid may be a key rotated in after our cache: refetch once.
  let key = (await publicKeys()).get(header.kid);
  if (!key) {
    resetFirebaseKeys();
    key = (await publicKeys()).get(header.kid);
  }
  if (!key) throw invalid();
  const ok = createVerify('RSA-SHA256')
    .update(`${h}.${p}`)
    .verify(key, Buffer.from(sig, 'base64url'));
  if (!ok) throw invalid();

  const now = Math.floor(Date.now() / 1000);
  const num = (k: string) => (typeof claims[k] === 'number' ? (claims[k] as number) : NaN);
  const firebase = claims.firebase as { sign_in_provider?: unknown } | undefined;
  const phone = PhoneE164.safeParse(claims.phone_number);
  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    !(num('exp') > now - SKEW_S) ||
    !(num('iat') <= now + SKEW_S) ||
    !(num('auth_time') <= now + SKEW_S) ||
    firebase?.sign_in_provider !== 'phone' ||
    !phone.success
  )
    throw invalid();
  return { phone: phone.data, authTime: num('auth_time') };
}
