import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { automationAllowed, routes, type MeResponse } from '@boramarca/shared';
import { professionals, refreshFamilies, salons } from '../../db/schema';
import { audit } from '../../lib/audit';
import { AppError, notFound } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';
import { setEmail } from '../email/service';
import { deleteAccount } from './account';
import { verifyFirebaseIdToken } from './firebase';
import { loginProvenPhone, verifyLogin } from './login';
import { consumeOtp, OTP_TTL_SECONDS, requestOtp } from './otp';

/** GET /me payload; also used after PATCH. */
export async function loadMe(app: FastifyInstance, professionalId: string): Promise<MeResponse> {
  const [row] = await app.db
    .select({ p: professionals, s: salons })
    .from(professionals)
    .innerJoin(salons, eq(salons.id, professionals.salonId))
    .where(eq(professionals.id, professionalId));
  if (!row) throw notFound('Profissional');
  return {
    professional: wire(row.p),
    salon: wire(row.s),
    billing: {
      status: row.s.subscriptionStatus,
      trialEndsAt: row.s.trialEndsAt?.toISOString() ?? null,
      automationPaused: !automationAllowed(row.s, app.now()),
    },
  };
}

/** A refresh token reused this soon after its rotation is a race, not theft: no revocation. */
const REFRESH_RACE_MS = 30_000;

/** POST /auth/otp/{request,verify}, POST /auth/{refresh,logout}, GET/PATCH/DELETE /me. */
const auth: FastifyPluginAsync = async (app) => {
  const a = routes.auth;

  // Per-IP limit (each of request/verify) on top of the per-phone cooldown/attempts (code enumeration, SMS cost).
  const otpLimit = {
    config: {
      rateLimit: { max: app.config.RATE_LIMIT_OTP_MAX, timeWindow: '10 minutes' },
    },
  };

  route(
    app,
    a.otpRequest,
    async (req) => requestOtp(app.db, app.config, app.otpSender, req.body.phone, req.body.purpose),
    otpLimit,
  );

  route(
    app,
    a.otpVerify,
    async (req) => {
      const { scope, isNewUser, purpose } = await verifyLogin(app, req.body.phone, req.body.code, {
        createAccount: true,
      });
      return {
        ...app.issueTokens(scope, purpose === 'delete_account' ? { scp: 'delete_account' } : {}),
        isNewUser,
      };
    },
    otpLimit,
  );

  const firebasePhone = (idToken: string) => {
    const projectId = app.config.FIREBASE_PROJECT_ID;
    if (!projectId)
      throw new AppError(503, 'OTP_UNAVAILABLE', 'Envio de código indisponível no momento');
    return verifyFirebaseIdToken(idToken, projectId);
  };

  // Firebase did the SMS; from the proven phone on it is the same path as /auth/otp/verify.
  route(
    app,
    a.firebaseLogin,
    async (req) => {
      const { phone } = await firebasePhone(req.body.idToken);
      const { scope, isNewUser, purpose } = await loginProvenPhone(app, phone, req.body.purpose, {
        createAccount: req.body.purpose === 'login',
      });
      return {
        ...app.issueTokens(scope, purpose === 'delete_account' ? { scp: 'delete_account' } : {}),
        isNewUser,
      };
    },
    otpLimit,
  );

  const expired = () => new AppError(401, 'UNAUTHORIZED', 'Sessão expirada. Entre de novo.');
  /** Ends a login session: every refresh token of the family stops working. */
  const revoke = async (fam: string, professionalId: string, exp: Date) => {
    await app.db
      .insert(refreshFamilies)
      .values({ id: fam, professionalId, gen: -1, revokedAt: new Date(), expiresAt: exp })
      .onConflictDoUpdate({ target: refreshFamilies.id, set: { revokedAt: new Date() } });
  };

  // Rotation (M3): each refresh token works once. Reusing an older one (stolen copy, or the
  // thief already used it) ends the whole session, for both holders.
  route(app, a.refresh, async (req) => {
    const t = app.verifyRefresh(req.body.refreshToken);
    // Re-read role/salon: they may have changed, and a deleted account must not refresh.
    const [p] = await app.db
      .select()
      .from(professionals)
      .where(eq(professionals.id, t.professionalId));
    if (!p) throw expired();
    const next = app.issueTokens(
      { professionalId: p.id, salonId: p.salonId, role: p.role },
      { fam: t.fam, gen: t.gen + 1 },
    );
    const expiresAt = new Date(next.refreshTokenExpiresAt);
    const [ok] =
      t.gen === 0
        ? await app.db
            .insert(refreshFamilies)
            .values({ id: t.fam, professionalId: p.id, gen: 1, expiresAt })
            .onConflictDoNothing()
            .returning({ id: refreshFamilies.id })
        : await app.db
            .update(refreshFamilies)
            .set({ gen: t.gen + 1, expiresAt })
            .where(
              and(
                eq(refreshFamilies.id, t.fam),
                eq(refreshFamilies.gen, t.gen),
                isNull(refreshFamilies.revokedAt),
              ),
            )
            .returning({ id: refreshFamilies.id });
    if (!ok) {
      // Two requests racing with the same token (two tabs, a retry): the loser just gets 401.
      const [row] = await app.db
        .select()
        .from(refreshFamilies)
        .where(eq(refreshFamilies.id, t.fam));
      const race =
        row &&
        !row.revokedAt &&
        row.gen === t.gen + 1 &&
        Date.now() - row.updatedAt.getTime() < REFRESH_RACE_MS;
      if (race) throw expired();
      await revoke(t.fam, p.id, expiresAt);
      await audit(app.db, p.id, 'system', 'auth.refresh_reused', { family: t.fam });
      throw expired();
    }
    return next;
  });

  route(app, a.logout, async (req) => {
    let t: ReturnType<typeof app.verifyRefresh> | null = null;
    try {
      t = app.verifyRefresh(req.body.refreshToken);
    } catch {
      // Unknown or expired: nothing left to end.
    }
    const [p] = t
      ? await app.db
          .select({ id: professionals.id })
          .from(professionals)
          .where(eq(professionals.id, t.professionalId))
      : [];
    if (t && p) await revoke(t.fam, p.id, new Date((t.exp ?? 0) * 1000));
    return { ok: true as const };
  });

  route(app, a.me, async (req) => loadMe(app, req.scope.professionalId));

  // Needs a fresh code (purpose delete_account) sent to the account's own phone.
  route(app, a.deleteMe, async (req) => {
    const [p] = await app.db
      .select({ phone: professionals.phone })
      .from(professionals)
      .where(eq(professionals.id, req.scope.professionalId));
    if (!p) throw notFound('Profissional');
    const { code, idToken } = req.body;
    return deleteAccount(app.messaging.core, req.scope.professionalId, req.body, async () => {
      if (idToken) {
        // A fresh Firebase sign-in of this account's own phone stands for the deletion code.
        const t = await firebasePhone(idToken);
        if (t.phone !== p.phone || Date.now() / 1000 - t.authTime > OTP_TTL_SECONDS)
          throw new AppError(400, 'OTP_INVALID', 'Código errado. Confira e tente de novo.');
      } else if (code) await consumeOtp(app, p.phone, code, ['delete_account']);
      else throw new AppError(400, 'OTP_INVALID', 'Informe o código de exclusão.');
    });
  });

  route(app, a.updateMe, async (req) => {
    const { salonName, email, ...fields } = req.body;
    if (email !== undefined) await setEmail(app.messaging.core, req.scope.professionalId, email);
    if (salonName !== undefined) {
      if (req.scope.role !== 'owner')
        throw new AppError(403, 'FORBIDDEN', 'Só o dono pode mudar o nome do espaço');
      await app.db.update(salons).set({ name: salonName }).where(eq(salons.id, req.scope.salonId));
    }
    if (Object.keys(fields).length > 0)
      await app.db
        .update(professionals)
        .set(fields)
        .where(eq(professionals.id, req.scope.professionalId));
    return loadMe(app, req.scope.professionalId);
  });
};

export default auth;
