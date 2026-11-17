import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { TRIAL_DAYS, type OtpPurpose } from '@boramarca/shared';
import { ensureReviewAccount } from '../../db/seed-review';
import { otpCodes, professionals, salons } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { Scope } from '../../plugins/auth';
import { phoneProvenBySms } from '../signup/phone';
import { consumeOtp, isReviewPhone } from './otp';

const accountNotFound = () =>
  new AppError(404, 'ACCOUNT_NOT_FOUND', 'Não existe conta com este número.');

/**
 * Dev code (123456) only: it matches any purpose, so pick `delete_account` when only that one is
 * pending (the deletion page asks for it first; checking a number then creates nothing).
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
): Promise<{ scope: Scope; isNewUser: boolean; purpose: OtpPurpose }> {
  const { db } = app;
  if (isReviewPhone(app.config, phone)) {
    await consumeOtp(app, phone, code, ['login']);
    return loginProvenPhone(app, phone, 'login', opts);
  }
  // Whichever pending code the person typed (a login code asked meanwhile must not block deletion).
  const purposes: OtpPurpose[] = !opts.createAccount
    ? ['login']
    : (await pendingPurpose(app, phone)) === 'delete_account'
      ? ['delete_account', 'login']
      : ['login', 'delete_account'];
  const purpose = await consumeOtp(app, phone, code, purposes);
  // Spent either way (the dev code 123456 skips the row); DELETE /me asks for a fresh one.
  if (purpose === 'delete_account')
    await db.delete(otpCodes).where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose)));
  return loginProvenPhone(app, phone, purpose, opts);
}

/**
 * The phone is proven (our code, or a Firebase phone sign-in): find the professional, activate a
 * team invite, or create a salon of one on the first login.
 */
export async function loginProvenPhone(
  app: FastifyInstance,
  phone: string,
  purpose: OtpPurpose,
  opts: { createAccount: boolean },
): Promise<{ scope: Scope; isNewUser: boolean; purpose: OtpPurpose }> {
  const { db } = app;
  if (isReviewPhone(app.config, phone)) {
    const r = await ensureReviewAccount(db, phone, app.now());
    return { scope: r, isNewUser: false, purpose };
  }
  let [p] = await db.select().from(professionals).where(eq(professionals.phone, phone));
  // A team invite becomes active when its person first proves the number (M11).
  if (p && !p.joinedAt && purpose === 'login')
    [p] = await db
      .update(professionals)
      .set({ joinedAt: app.now() })
      .where(eq(professionals.id, p!.id))
      .returning();
  if (p) await phoneProvenBySms(app.messaging.core, p);
  const isNewUser = !p;
  if (!p) {
    if (!opts.createAccount || purpose === 'delete_account') throw accountNotFound();
    // First login: a salon of one, owned by this professional. The quick sign-up fills it in.
    p = await db.transaction(async (tx) => {
      const trialEndsAt = new Date(app.now().getTime() + TRIAL_DAYS * 86_400_000);
      const [s] = await tx.insert(salons).values({ name: 'Meu espaço', trialEndsAt }).returning();
      const [created] = await tx
        .insert(professionals)
        .values({
          salonId: s!.id,
          role: 'owner',
          name: 'Profissional',
          phone,
          phoneVerifiedAt: app.now(),
        })
        .onConflictDoNothing({ target: professionals.phone })
        .returning();
      if (!created) throw new AppError(409, 'CONFLICT', 'Tente de novo');
      return created;
    });
  }
  return {
    scope: { professionalId: p!.id, salonId: p!.salonId, role: p!.role },
    isNewUser,
    purpose,
  };
}
