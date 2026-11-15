import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { routes, type MeResponse } from '@boramarca/shared';
import { professionals, salons } from '../../db/schema';
import { AppError, notFound } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';
import { deleteAccount } from './account';
import { consumeOtp, requestOtp } from './otp';

/** GET /me payload; also used after PATCH. */
export async function loadMe(app: FastifyInstance, professionalId: string): Promise<MeResponse> {
  const [row] = await app.db
    .select({ p: professionals, s: salons })
    .from(professionals)
    .innerJoin(salons, eq(salons.id, professionals.salonId))
    .where(eq(professionals.id, professionalId));
  if (!row) throw notFound('Profissional');
  return { professional: wire(row.p), salon: wire(row.s) };
}

/** POST /auth/otp/{request,verify}, POST /auth/refresh, GET/PATCH/DELETE /me. */
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
      const { phone, code } = req.body;
      await consumeOtp(app.db, app.config, phone, code, 'login');
      let [p] = await app.db.select().from(professionals).where(eq(professionals.phone, phone));
      const isNewUser = !p;
      if (!p) {
        // First login: a salon of one, owned by this professional. The quick sign-up fills it in.
        p = await app.db.transaction(async (tx) => {
          const [s] = await tx.insert(salons).values({ name: 'Meu espaço' }).returning();
          const [created] = await tx
            .insert(professionals)
            .values({ salonId: s!.id, role: 'owner', name: 'Profissional', phone })
            .onConflictDoNothing({ target: professionals.phone })
            .returning();
          if (!created) throw new AppError(409, 'CONFLICT', 'Tente de novo');
          return created;
        });
      }
      const tokens = app.issueTokens({ professionalId: p.id, salonId: p.salonId, role: p.role });
      return { ...tokens, isNewUser };
    },
    otpLimit,
  );

  route(app, a.refresh, async (req) => {
    const s = app.verifyRefresh(req.body.refreshToken);
    // Re-read role/salon: they may have changed, and a deleted account must not refresh.
    const [p] = await app.db
      .select()
      .from(professionals)
      .where(eq(professionals.id, s.professionalId));
    if (!p) throw new AppError(401, 'UNAUTHORIZED', 'Sessão expirada. Entre de novo.');
    return app.issueTokens({ professionalId: p.id, salonId: p.salonId, role: p.role });
  });

  route(app, a.me, async (req) => loadMe(app, req.scope.professionalId));

  // Needs a fresh code (purpose delete_account) sent to the account's own phone.
  route(app, a.deleteMe, async (req) => {
    const [p] = await app.db
      .select({ phone: professionals.phone })
      .from(professionals)
      .where(eq(professionals.id, req.scope.professionalId));
    if (!p) throw notFound('Profissional');
    return deleteAccount(app.messaging.core, req.scope.professionalId, req.body, () =>
      consumeOtp(app.db, app.config, p.phone, req.body.code, 'delete_account'),
    );
  });

  route(app, a.updateMe, async (req) => {
    const { salonName, ...fields } = req.body;
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
