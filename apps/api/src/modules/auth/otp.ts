import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
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
    log.info({ purpose, code }, 'OTP de desenvolvimento (use este código ou 123456)');
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

/** Creates (or replaces) the code for phone+purpose and sends it. */
export async function requestOtp(
  db: Db,
  config: Config,
  sender: OtpSender,
  phone: string,
  purpose: OtpPurpose,
) {
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

/**
 * Checks and consumes a code. Outside production `123456` always works; `REVIEW_PHONE` +
 * `REVIEW_OTP` (store review account) work in any environment. Throws pt-BR AppErrors.
 * Also used by `DELETE /me` (C1) with purpose `delete_account`.
 */
export async function consumeOtp(
  db: Db,
  config: Config,
  phone: string,
  code: string,
  purpose: OtpPurpose,
): Promise<void> {
  if (config.NODE_ENV !== 'production' && code === DEV_OTP) return;
  if (
    config.REVIEW_PHONE &&
    config.REVIEW_OTP &&
    phone === config.REVIEW_PHONE &&
    code === config.REVIEW_OTP
  )
    return;

  const where = and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose));
  const [row] = await db.select().from(otpCodes).where(where);
  if (!row || row.expiresAt.getTime() < Date.now())
    throw new AppError(400, 'OTP_EXPIRED', 'Código expirado. Peça um novo.');
  if (row.attempts >= OTP_MAX_ATTEMPTS)
    throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Muitas tentativas. Peça um novo código.');

  const expected = Buffer.from(row.codeHash, 'hex');
  const got = Buffer.from(hash(config.JWT_ACCESS_SECRET, phone, purpose, code), 'hex');
  if (!timingSafeEqual(expected, got)) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, row.id));
    throw new AppError(400, 'OTP_INVALID', 'Código errado. Confira e tente de novo.', {
      attemptsLeft: OTP_MAX_ATTEMPTS - row.attempts - 1,
    });
  }
  await db.delete(otpCodes).where(eq(otpCodes.id, row.id));
}
