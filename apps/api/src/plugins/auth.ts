import jwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthTokens, ProfessionalRole } from '@boramarca/shared';
import { AppError } from '../lib/errors';
import { logOtpSender, unavailableOtpSender, type OtpSender } from '../modules/auth/otp';

/** The authenticated professional: every query is filtered by it (isolation). */
export interface Scope {
  professionalId: string;
  salonId: string;
  role: ProfessionalRole;
}

interface TokenPayload {
  sub: string;
  sid: string;
  role: ProfessionalRole;
  typ: 'access' | 'refresh';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    requireOwner: (req: FastifyRequest) => Promise<void>;
    issueTokens: (scope: Scope) => AuthTokens;
    /** Verifies a refresh token; throws 401. */
    verifyRefresh: (token: string) => Scope;
    /** Verifies an access token (WebSocket query string); throws 401. */
    verifyAccess: (token: string) => Scope;
    otpSender: OtpSender;
  }
  interface FastifyRequest {
    scope: Scope;
  }
}

const toScope = (p: TokenPayload): Scope => ({
  professionalId: p.sub,
  salonId: p.sid,
  role: p.role,
});
const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Sessão expirada. Entre de novo.');

/** Short access JWT + longer refresh JWT signed with a different secret. */
export default fp<{ otpSender?: OtpSender }>(async (app, opts) => {
  const c = app.config;
  app.decorate(
    'otpSender',
    opts.otpSender ?? (c.NODE_ENV === 'production' ? unavailableOtpSender : logOtpSender(app.log)),
  );
  await app.register(jwt, { secret: c.JWT_ACCESS_SECRET, sign: { expiresIn: c.JWT_ACCESS_TTL } });
  app.decorateRequest('scope', null as unknown as Scope);

  const verify = (token: string, typ: TokenPayload['typ'], key?: string) => {
    try {
      const p = app.jwt.verify<TokenPayload>(token, key ? { key } : {});
      if (p.typ !== typ) throw unauthorized();
      return toScope(p);
    } catch {
      throw unauthorized();
    }
  };

  app.decorate('verifyAccess', (token: string) => verify(token, 'access'));
  app.decorate('verifyRefresh', (token: string) => verify(token, 'refresh', c.JWT_REFRESH_SECRET));

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    req.scope = app.verifyAccess(header.slice(7));
  });
  app.decorate('requireOwner', async (req: FastifyRequest) => {
    await app.authenticate(req);
    if (req.scope.role !== 'owner')
      throw new AppError(403, 'FORBIDDEN', 'Só o dono do espaço pode fazer isso');
  });

  app.decorate('issueTokens', (s: Scope): AuthTokens => {
    const payload = { sub: s.professionalId, sid: s.salonId, role: s.role };
    const accessToken = app.jwt.sign({ ...payload, typ: 'access' });
    const refreshToken = app.jwt.sign(
      { ...payload, typ: 'refresh' },
      { key: c.JWT_REFRESH_SECRET, expiresIn: c.JWT_REFRESH_TTL },
    );
    const exp = (t: string) =>
      new Date(app.jwt.decode<{ exp: number }>(t)!.exp * 1000).toISOString();
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: exp(accessToken),
      refreshTokenExpiresAt: exp(refreshToken),
    };
  });
});
