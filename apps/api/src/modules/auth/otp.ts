import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { OtpPurpose } from '@boramarca/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { otpCodes } from '../../db/schema';
import { AppError } from '../../lib/errors';

/** Delivers the 6-digit code to the phone. Real SMS provider: see docs/pendencias/A1.md. */
export interface OtpSender {
  send(phone: string, code: string, purpose: OtpPurpose): Promise<void>;
}

/** Development sender: writes the code to the log (never the phone). */
export const logOtpSender = (log: { info: (o: object, m: string) => void }): OtpSender => ({
  async send(_phone, code, purpose) {
    // Dev only (production never uses this sender). In the message: the logger censors `code` keys.
    log.info({ purpose }, `OTP de desenvolvimento: ${code} (ou 123456)`);
  },
});

/** Production without a provider: refuse instead of silently dropping codes. */
export const unavailableOtpSender: OtpSender = {
  async send() {
    throw new AppError(503, 'OTP_UNAVAILABLE', 'Envio de código indisponível no momento');
  },
};

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;
export const DEV_OTP = '123456';

const hash = (secret: string, phone: string, purpose: OtpPurpose, code: string) =>
  createHmac('sha256', secret).update(`${purpose}:${phone}:${code}`).digest('hex');

/** The store review account (plan section 9): fixed phone + code, on only when both are set. */
export const isReviewPhone = (config: Config, phone: string) =>
  Boolean(config.REVIEW_PHONE && config.REVIEW_OTP && phone === config.REVIEW_PHONE);

/** Creates (or replaces) the code for phone+purpose and sends it. */
export async function requestOtp(
  db: Db,
  config: Config,
  sender: OtpSender,
  phone: string,
  purpose: OtpPurpose,
) {
  // The reviewer types REVIEW_OTP: nothing to send (and no SMS provider needed for the review).
  if (isReviewPhone(config, phone))
    return {
      ok: true as const,
      expiresInSeconds: OTP_TTL_SECONDS,
      retryAfterSeconds: OTP_RESEND_SECONDS,
    };
  const [prev] = await db
    .select({ sentAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose)));
  const waited = prev ? (Date.now() - prev.sentAt.getTime()) / 1000 : Infinity;
  if (waited < OTP_RESEND_SECONDS) {
    const retryAfterSeconds = Math.ceil(OTP_RESEND_SECONDS - waited);
    throw new AppError(
      429,
      'OTP_TOO_SOON',
      `Espere ${retryAfterSeconds}s para pedir outro código`,
      {
        retryAfterSeconds,
      },
    );
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const values = {
    codeHash: hash(config.JWT_ACCESS_SECRET, phone, purpose, code),
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    attempts: 0,
    createdAt: new Date(), // "sent at": drives the resend cooldown
  };
  await db
    .insert(otpCodes)
    .values({ phone, purpose, ...values })
    .onConflictDoUpdate({ target: [otpCodes.phone, otpCodes.purpose], set: values });
  await sender.send(phone, code, purpose);
  return {
    ok: true as const,
    expiresInSeconds: OTP_TTL_SECONDS,
    retryAfterSeconds: OTP_RESEND_SECONDS,
  };
}

/** Wrong codes per phone per window, across every code sent (a new code does not reset it). */
export const OTP_MAX_FAILURES_PER_WINDOW = 10;
export const OTP_FAILURE_WINDOW_SECONDS = 60 * 60;

export interface OtpDeps {
  db: Db;
  config: Config;
  redis: Redis;
}

const tooMany = () =>
  new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Muitas tentativas. Peça um novo código.');

/**
 * Checks and consumes a code against every pending purpose in `purposes`; returns the one that
 * matched. Outside production `123456` always works (`purposes[0]`); `REVIEW_PHONE` + `REVIEW_OTP`
 * (store review account) work in any environment. Throws pt-BR AppErrors.
 * Each try is counted before comparing (atomic, so parallel tries cannot pass the limit), per code
 * (OTP_MAX_ATTEMPTS) and per phone in a window that survives new codes (also the review phone).
 */
export async function consumeOtp(
  { db, config, redis }: OtpDeps,
  phone: string,
  code: string,
  purposes: readonly OtpPurpose[],
): Promise<OtpPurpose> {
  if (config.NODE_ENV !== 'production' && code === DEV_OTP) return purposes[0]!;
  const failKey = `otp:fail:${createHmac('sha256', config.JWT_ACCESS_SECRET).update(phone).digest('hex')}`;
  const failures = Number(await redis.get(failKey)) || 0;
  if (failures >= OTP_MAX_FAILURES_PER_WINDOW) throw tooMany();
  const fail = async () => {
    const n = await redis.incr(failKey);
    if (n === 1) await redis.expire(failKey, OTP_FAILURE_WINDOW_SECONDS);
  };
  if (isReviewPhone(config, phone)) {
    if (code === config.REVIEW_OTP) return purposes[0]!;
    await fail();
    throw new AppError(400, 'OTP_INVALID', 'Código errado. Confira e tente de novo.');
  }

  const t = new Date();
  // The try is counted first; a row that already used its tries is not returned.
  const rows = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(
      and(
        eq(otpCodes.phone, phone),
        inArray(otpCodes.purpose, [...purposes]),
        gt(otpCodes.expiresAt, t),
        lt(otpCodes.attempts, OTP_MAX_ATTEMPTS),
      ),
    )
    .returning();
  const got = (purpose: OtpPurpose) =>
    Buffer.from(hash(config.JWT_ACCESS_SECRET, phone, purpose, code), 'hex');
  const match = rows.find((r) => timingSafeEqual(Buffer.from(r.codeHash, 'hex'), got(r.purpose)));
  if (match) {
    await db.delete(otpCodes).where(eq(otpCodes.id, match.id));
    return match.purpose;
  }
  await fail();
  if (!rows.length) {
    const [live] = await db
      .select({ id: otpCodes.id })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          inArray(otpCodes.purpose, [...purposes]),
          gt(otpCodes.expiresAt, t),
        ),
      )
      .limit(1);
    if (live) throw tooMany();
    throw new AppError(400, 'OTP_EXPIRED', 'Código expirado. Peça um novo.');
  }
  throw new AppError(400, 'OTP_INVALID', 'Código errado. Confira e tente de novo.', {
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - Math.min(...rows.map((r) => r.attempts))),
  });
}
