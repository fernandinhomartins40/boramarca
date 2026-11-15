import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { OtpPurpose } from '@boramarca/shared';
import { ensureReviewAccount } from '../../db/seed-review';
import { otpCodes, professionals, salons } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { Scope } from '../../plugins/auth';
import { consumeOtp, isReviewPhone } from './otp';

const accountNotFound = () =>
  new AppError(404, 'ACCOUNT_NOT_FOUND', 'Não existe conta com este número.');

/**
 * Which code the person asked for: `delete_account` when only that one is pending. The account
 * deletion page asks for it first, so checking a number that has no account creates nothing.
 */
async function pendingPurpose(app: FastifyInstance, phone: string): Promise<OtpPurpose> {
  const rows = await app.db
    .select({ purpose: otpCodes.purpose })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gt(otpCodes.expiresAt, new Date())));
  const purposes = new Set(rows.map((r) => r.purpose));
  return !purposes.has('login') && purposes.has('delete_account') ? 'delete_account' : 'login';
}

/**
 * Phone + code → the professional. `createAccount`: first login creates a salon of one (the app);
 * otherwise (Alexa linking) an unknown phone is 404. The review account is (re)created here.
 */
export async function verifyLogin(
  app: FastifyInstance,
  phone: string,
  code: string,
  opts: { createAccount: boolean },
): Promise<{ scope: Scope; isNewUser: boolean }> {
  const { db, config } = app;
  if (isReviewPhone(config, phone)) {
    await consumeOtp(db, config, phone, code, 'login');
    const r = await ensureReviewAccount(db, phone, app.now());
    return { scope: r, isNewUser: false };
  }
  const purpose = opts.createAccount ? await pendingPurpose(app, phone) : 'login';
  await consumeOtp(db, config, phone, code, purpose);
  // Spent either way (the dev code 123456 skips the row); DELETE /me asks for a fresh one.
  if (purpose === 'delete_account')
    await db.delete(otpCodes).where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose)));

  let [p] = await db.select().from(professionals).where(eq(professionals.phone, phone));
  const isNewUser = !p;
  if (!p) {
    if (!opts.createAccount || purpose === 'delete_account') throw accountNotFound();
    // First login: a salon of one, owned by this professional. The quick sign-up fills it in.
    p = await db.transaction(async (tx) => {
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
  return { scope: { professionalId: p.id, salonId: p.salonId, role: p.role }, isNewUser };
}
