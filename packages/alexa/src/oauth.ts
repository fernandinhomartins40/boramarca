import { createHash, timingSafeEqual } from 'node:crypto';
import {
  AlexaOAuthAuthorizeQuery,
  AlexaOAuthTokenRequest,
  type AlexaOAuthError,
} from '@boramarca/shared';

/**
 * Account linking checks (authorization code grant + PKCE). The API owns storage (codes, tokens)
 * and the login page; these functions validate what Amazon sends.
 * https://developer.amazon.com/en-US/docs/alexa/account-linking/requirements-account-linking.html
 */

/** Alexa redirect URLs (one per region); shown in the console as `.../api/skill/link/{vendorId}`. */
export const ALEXA_REDIRECT_PREFIXES = [
  'https://pitangui.amazon.com/api/skill/link/',
  'https://layla.amazon.com/api/skill/link/',
  'https://alexa.amazon.co.jp/api/skill/link/',
] as const;

/** Access token lifetime Amazon accepts (>= 1 h); refresh tokens must outlive it (>= 180 days or never). */
export const ALEXA_ACCESS_TOKEN_TTL_S = 3600;

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: AlexaOAuthError };
const fail = (error: AlexaOAuthError['error'], error_description: string) =>
  ({ ok: false, error: { error, error_description } }) as const;

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const isAlexaRedirectUri = (uri: string) =>
  ALEXA_REDIRECT_PREFIXES.some((p) => uri.startsWith(p)) && !uri.includes('#');

/**
 * Validates the authorization request. On failure do NOT redirect (the redirect_uri may be hostile):
 * show the error on the login page.
 */
export function parseAuthorizeRequest(
  query: unknown,
  client: Pick<OAuthClient, 'clientId'>,
): Result<AlexaOAuthAuthorizeQuery> {
  const q = AlexaOAuthAuthorizeQuery.safeParse(query);
  if (!q.success) return fail('invalid_request', 'parâmetros inválidos');
  if (!sameString(q.data.client_id, client.clientId))
    return fail('unauthorized_client', 'client_id desconhecido');
  if (!isAlexaRedirectUri(q.data.redirect_uri))
    return fail('invalid_request', 'redirect_uri não permitido');
  return { ok: true, value: q.data };
}

/** Where to send the browser after the professional logs in and the API stores the code. */
export function authorizeRedirectUrl(redirectUri: string, code: string, state: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('code', code);
  return u.toString();
}

/** RFC 7636. A mismatch must be answered with `invalid_grant`. */
export function verifyPkce(verifier: string, challenge: string, method: 'S256' | 'plain'): boolean {
  const computed =
    method === 'S256' ? createHash('sha256').update(verifier).digest('base64url') : verifier;
  return sameString(computed, challenge);
}

/**
 * Validates the token request: client credentials (HTTP Basic or in the body, whichever the console
 * is set to) and the grant. Respond 401 for `invalid_client`, 400 for the rest.
 */
export function parseTokenRequest(
  authorization: string | undefined,
  body: unknown,
  client: OAuthClient,
): Result<AlexaOAuthTokenRequest> {
  const t = AlexaOAuthTokenRequest.safeParse(body);
  if (!t.success) {
    const g = (body as { grant_type?: unknown } | null)?.grant_type;
    return g === 'authorization_code' || g === 'refresh_token'
      ? fail('invalid_request', 'parâmetros inválidos')
      : fail('unsupported_grant_type', 'grant_type não suportado');
  }
  let id = t.data.client_id;
  let secret = t.data.client_secret;
  if (authorization?.startsWith('Basic ')) {
    const raw = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const i = raw.indexOf(':');
    // RFC 6749 §2.3.1: both parts are form-urlencoded before base64
    const dec = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
    try {
      [id, secret] = i < 0 ? [undefined, undefined] : [dec(raw.slice(0, i)), dec(raw.slice(i + 1))];
    } catch {
      [id, secret] = [undefined, undefined];
    }
  }
  if (
    !id ||
    !secret ||
    !sameString(id, client.clientId) ||
    !sameString(secret, client.clientSecret)
  )
    return fail('invalid_client', 'credenciais do cliente inválidas');
  if (t.data.grant_type === 'authorization_code' && !isAlexaRedirectUri(t.data.redirect_uri))
    return fail('invalid_grant', 'redirect_uri não confere');
  return { ok: true, value: t.data };
}
