import { describe, expect, it } from 'vitest';
import {
  authorizeRedirectUrl,
  parseAuthorizeRequest,
  parseTokenRequest,
  readAlexaConfig,
  verifyPkce,
} from '../src';

const client = { clientId: 'alexa-skill', clientSecret: 's3cr3t-s3cr3t-s3cr3t' };
// RFC 7636 appendix B
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const REDIRECT = 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA';

const authorize = (over: Record<string, string> = {}) => ({
  response_type: 'code',
  client_id: 'alexa-skill',
  redirect_uri: REDIRECT,
  state: 'abc123',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  ...over,
});

describe('authorization request', () => {
  it('accepts what Alexa sends', () => {
    expect(parseAuthorizeRequest(authorize(), client)).toMatchObject({
      ok: true,
      value: { state: 'abc123' },
    });
  });
  it.each([
    ['client', { client_id: 'other' }, 'unauthorized_client'],
    ['redirect', { redirect_uri: 'https://evil.com/api/skill/link/X' }, 'invalid_request'],
    ['response type', { response_type: 'token' }, 'invalid_request'],
    ['missing PKCE', { code_challenge: '' }, 'invalid_request'],
  ])('rejects bad %s', (_n, over, error) => {
    expect(parseAuthorizeRequest(authorize(over), client)).toMatchObject({
      ok: false,
      error: { error },
    });
  });
  it('redirects back with state and code', () => {
    const u = new URL(authorizeRedirectUrl(REDIRECT, 'code-1', 'abc 123'));
    expect(u.origin + u.pathname).toBe(REDIRECT);
    expect(u.searchParams.get('state')).toBe('abc 123');
    expect(u.searchParams.get('code')).toBe('code-1');
  });
});

describe('PKCE', () => {
  it('S256 (RFC 7636 vector)', () => {
    expect(verifyPkce(VERIFIER, CHALLENGE, 'S256')).toBe(true);
    expect(verifyPkce(VERIFIER + 'x', CHALLENGE, 'S256')).toBe(false);
  });
  it('plain', () => expect(verifyPkce(VERIFIER, VERIFIER, 'plain')).toBe(true));
});

describe('token request', () => {
  const code = {
    grant_type: 'authorization_code',
    code: 'c1',
    redirect_uri: REDIRECT,
    code_verifier: VERIFIER,
  };
  const basic = (id: string, secret: string) =>
    `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

  it('client credentials in HTTP Basic', () => {
    expect(parseTokenRequest(basic(client.clientId, client.clientSecret), code, client).ok).toBe(
      true,
    );
  });
  it('client credentials in the body', () => {
    const r = parseTokenRequest(
      undefined,
      { ...code, client_id: client.clientId, client_secret: client.clientSecret },
      client,
    );
    expect(r.ok).toBe(true);
  });
  it('refresh token grant', () => {
    const r = parseTokenRequest(
      basic(client.clientId, client.clientSecret),
      { grant_type: 'refresh_token', refresh_token: 'r1' },
      client,
    );
    expect(r).toMatchObject({ ok: true, value: { grant_type: 'refresh_token' } });
  });
  it.each([
    ['wrong secret', basic(client.clientId, 'nope'), code, 'invalid_client'],
    ['no credentials', undefined, code, 'invalid_client'],
    ['malformed basic', 'Basic !!!', code, 'invalid_client'],
    [
      'bad grant',
      basic(client.clientId, client.clientSecret),
      { grant_type: 'password' },
      'unsupported_grant_type',
    ],
    [
      'missing code',
      basic(client.clientId, client.clientSecret),
      { ...code, code: undefined },
      'invalid_request',
    ],
    [
      'foreign redirect',
      basic(client.clientId, client.clientSecret),
      { ...code, redirect_uri: 'https://evil.com/x' },
      'invalid_grant',
    ],
  ])('rejects: %s', (_n, auth, body, error) => {
    expect(parseTokenRequest(auth, body, client)).toMatchObject({ ok: false, error: { error } });
  });
});

describe('readAlexaConfig', () => {
  it('reads env and treats empty Voice Monkey token as off', () => {
    const cfg = readAlexaConfig({
      ALEXA_SKILL_ID: 'amzn1.ask.skill.abc',
      ALEXA_OAUTH_CLIENT_ID: 'alexa-skill',
      ALEXA_OAUTH_CLIENT_SECRET: client.clientSecret,
      VOICE_MONKEY_TOKEN: '',
    });
    expect(cfg.VOICE_MONKEY_TOKEN).toBeUndefined();
  });
  it('throws when the skill id is missing', () => expect(() => readAlexaConfig({})).toThrow());
});
