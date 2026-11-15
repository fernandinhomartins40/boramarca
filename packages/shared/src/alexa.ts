import { z } from 'zod';

/**
 * `POST /alexa/skill` receives the Alexa Skills Kit request envelope (validated by the Amazon
 * signature, not by JWT). Only the fields the API routes on are typed; the rest passes through
 * and `packages/alexa` (ask-sdk-core) handles it.
 */
export const AlexaSkillRequest = z.looseObject({
  version: z.string(),
  session: z.looseObject({}).optional(),
  context: z.looseObject({}).optional(),
  request: z.looseObject({
    type: z.string(),
    requestId: z.string(),
    timestamp: z.string(),
    locale: z.string().optional(),
  }),
});
export type AlexaSkillRequest = z.infer<typeof AlexaSkillRequest>;

export const AlexaSkillResponse = z.looseObject({
  version: z.string(),
  response: z.looseObject({}),
});
export type AlexaSkillResponse = z.infer<typeof AlexaSkillResponse>;

/** Per-professional Alexa / Voice Monkey settings (proactive announcement of new decisions). */
export const AlexaSettings = z.object({
  linked: z.boolean(),
  voiceMonkeyEnabled: z.boolean(),
  /** Voice Monkey device/routine name; the API token stays in env vars, never here. */
  voiceMonkeyDevice: z.string().max(100).nullable(),
});
export type AlexaSettings = z.infer<typeof AlexaSettings>;

/** Max time to answer Alexa (plan section 14). */
export const ALEXA_RESPONSE_BUDGET_MS = 8000;

// ---- Account linking (OAuth 2.0 authorization code grant + PKCE, as Alexa requires).
// The API hosts both endpoints; `packages/alexa` validates them (see its README).

/** Query Alexa sends to the authorization URI. */
export const AlexaOAuthAuthorizeQuery = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  state: z.string().min(1).max(2000),
  scope: z.string().optional(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.enum(['S256', 'plain']).default('S256'),
});
export type AlexaOAuthAuthorizeQuery = z.infer<typeof AlexaOAuthAuthorizeQuery>;

/** Form body Alexa posts to the token URI (client credentials may come in Basic auth instead). */
export const AlexaOAuthTokenRequest = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string().min(1),
    redirect_uri: z.url(),
    code_verifier: z.string().min(43).max(128),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(1),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
  }),
]);
export type AlexaOAuthTokenRequest = z.infer<typeof AlexaOAuthTokenRequest>;

/** RFC 6749 §5.1. Alexa requires `expires_in` >= 3600 and a refresh token that outlives it. */
export const AlexaOAuthTokenResponse = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().min(3600),
  refresh_token: z.string(),
});
export type AlexaOAuthTokenResponse = z.infer<typeof AlexaOAuthTokenResponse>;

/** RFC 6749 §5.2. Return `invalid_grant` only to break the link: Alexa then unlinks the account. */
export const AlexaOAuthError = z.object({
  error: z.enum([
    'invalid_request',
    'invalid_client',
    'invalid_grant',
    'unauthorized_client',
    'unsupported_grant_type',
  ]),
  error_description: z.string().optional(),
});
export type AlexaOAuthError = z.infer<typeof AlexaOAuthError>;
