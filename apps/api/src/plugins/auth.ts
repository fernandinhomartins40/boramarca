import { randomUUID } from 'node:crypto';
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
  /** Login session (refresh rotation family) and generation of this refresh token. */
  fam?: string;
  gen?: number;
  /** Restricted session: a `delete_account` code only opens the deletion flow (B1). */
  scp?: 'delete_account';
  exp?: number;
}

export interface TokenOptions {
  fam?: string;
  gen?: number;
  scp?: 'delete_account';
}

/** What a restricted (`scp: delete_account`) access token may call: the deletion flow only. */
const DELETE_FLOW = new Set(['DELETE /v1/me', 'GET /v1/salon/team']);

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
    issueTokens: (scope: Scope, opts?: TokenOptions) => AuthTokens;
    /** Verifies a refresh token; throws 401. */
    verifyRefresh: (
      token: string,
    ) => Scope & Required<Pick<TokenPayload, 'fam' | 'gen'>> & TokenPayload;
    /** Verifies a full access token (WebSocket query string); throws 401. `exp` in ms. */
    verifyAccess: (token: string) => Scope & { exp: number };
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
    let p: TokenPayload;
    try {
      p = app.jwt.verify<TokenPayload>(token, key ? { key } : {});
    } catch {
      throw unauthorized();
    }
    if (p.typ !== typ) throw unauthorized();
    return p;
  };

  app.decorate('verifyAccess', (token: string) => {
    const p = verify(token, 'access');
    if (p.scp) throw unauthorized();
    return { ...toScope(p), exp: (p.exp ?? 0) * 1000 };
  });
  app.decorate('verifyRefresh', (token: string) => {
    const p = verify(token, 'refresh', c.JWT_REFRESH_SECRET);
    // Restricted sessions do not refresh; tokens from before rotation have no family.
    if (p.scp || !p.fam || typeof p.gen !== 'number') throw unauthorized();
    return { ...p, ...toScope(p), fam: p.fam, gen: p.gen };
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const p = verify(header.slice(7), 'access');
    if (p.scp && !DELETE_FLOW.has(`${req.method} ${req.routeOptions.url}`))
      throw new AppError(403, 'FORBIDDEN', 'Entre pelo app para usar a conta');
    req.scope = toScope(p);
  });
  app.decorate('requireOwner', async (req: FastifyRequest) => {
    await app.authenticate(req);
    if (req.scope.role !== 'owner')
      throw new AppError(403, 'FORBIDDEN', 'Só o dono do espaço pode fazer isso');
  });

  app.decorate('issueTokens', (s: Scope, o: TokenOptions = {}): AuthTokens => {
    const payload = {
      sub: s.professionalId,
      sid: s.salonId,
      role: s.role,
      ...(o.scp && { scp: o.scp }),
    };
    const accessToken = app.jwt.sign({ ...payload, typ: 'access' });
    const refreshToken = app.jwt.sign(
      { ...payload, typ: 'refresh', fam: o.fam ?? randomUUID(), gen: o.gen ?? 0 },
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
