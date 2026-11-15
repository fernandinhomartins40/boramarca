// Account linking storage: one-time codes (5 min) and tokens, kept only as SHA-256 hashes.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { ALEXA_ACCESS_TOKEN_TTL_S, verifyPkce } from '@boramarca/alexa';
import type { AlexaOAuthAuthorizeQuery, AlexaOAuthTokenResponse } from '@boramarca/shared';
import type { Db } from '../../db/client';
import { alexaOauthCodes, alexaTokens } from '../../db/schema';

export const ALEXA_CODE_TTL_MS = 5 * 60_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

export function createAlexaStore(db: Db, now: () => Date) {
  const expiresIn = (ms: number) => new Date(now().getTime() + ms);

  return {
    async issueCode(professionalId: string, q: AlexaOAuthAuthorizeQuery) {
      const code = secret('bmc');
      await db.insert(alexaOauthCodes).values({
        professionalId,
        codeHash: sha(code),
        redirectUri: q.redirect_uri,
        codeChallenge: q.code_challenge,
        codeChallengeMethod: q.code_challenge_method,
        expiresAt: expiresIn(ALEXA_CODE_TTL_MS),
      });
      return code;
    },

    /** Single use (deleted on first try), same redirect_uri, PKCE. null → `invalid_grant`. */
    async exchangeCode(code: string, redirectUri: string, verifier: string) {
      const [row] = await db
        .delete(alexaOauthCodes)
        .where(eq(alexaOauthCodes.codeHash, sha(code)))
        .returning();
      if (
        !row ||
        row.expiresAt <= now() ||
        row.redirectUri !== redirectUri ||
        !verifyPkce(verifier, row.codeChallenge, row.codeChallengeMethod)
      )
        return null;
      return this.issueTokens(row.professionalId);
    },

    async issueTokens(professionalId: string): Promise<AlexaOAuthTokenResponse> {
      const access = secret('bma');
      const refresh = secret('bmr');
      await db.insert(alexaTokens).values({
        professionalId,
        accessTokenHash: sha(access),
        accessExpiresAt: expiresIn(ALEXA_ACCESS_TOKEN_TTL_S * 1000),
        refreshTokenHash: sha(refresh),
      });
      return {
        access_token: access,
        token_type: 'Bearer',
        expires_in: ALEXA_ACCESS_TOKEN_TTL_S,
        refresh_token: refresh,
      };
    },

    /** New access token, same refresh token. null (unknown/unlinked) → `invalid_grant`. */
    async refresh(refreshToken: string): Promise<AlexaOAuthTokenResponse | null> {
      const access = secret('bma');
      const [row] = await db
        .update(alexaTokens)
        .set({
          accessTokenHash: sha(access),
          accessExpiresAt: expiresIn(ALEXA_ACCESS_TOKEN_TTL_S * 1000),
        })
        .where(eq(alexaTokens.refreshTokenHash, sha(refreshToken)))
        .returning();
      if (!row) return null;
      return {
        access_token: access,
        token_type: 'Bearer',
        expires_in: ALEXA_ACCESS_TOKEN_TTL_S,
        refresh_token: refreshToken,
      };
    },

    async professionalIdFromToken(accessToken: string): Promise<string | null> {
      const [row] = await db
        .select({ pid: alexaTokens.professionalId })
        .from(alexaTokens)
        .where(
          and(
            eq(alexaTokens.accessTokenHash, sha(accessToken)),
            gt(alexaTokens.accessExpiresAt, now()),
          ),
        );
      return row?.pid ?? null;
    },

    async isLinked(professionalId: string) {
      const [row] = await db
        .select({ id: alexaTokens.id })
        .from(alexaTokens)
        .where(eq(alexaTokens.professionalId, professionalId))
        .limit(1);
      return Boolean(row);
    },
  };
}
