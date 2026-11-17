import { z } from 'zod';
import { Profession } from './salon';
import { OtpCodeValue } from './auth';

/**
 * Free sign-up and login with a 6-digit code by E-MAIL (works without SMS). docs/COBRANCA.md,
 * "Cadastro grátis". Same protections as the SMS code: only its hash is kept, 10 min, 5 tries,
 * per-IP and per-destination limits, and the answers never tell whether a phone/e-mail exists.
 */
export const EMAIL_CODE_TTL_SECONDS = 10 * 60;
export const EMAIL_CODE_RESEND_SECONDS = 60;

/** Brazilian mobile in E.164: +55 + DDD + 9 digits starting with 9. */
export const BrMobileE164 = z
  .string()
  .regex(/^\+55[1-9]\d9\d{8}$/, 'Celular com DDD, como (11) 91234-5678');

/** Trimmed and lower-cased before the format check. */
export const SignupEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Confira o e-mail'));

// ---- POST /auth/signup/request: the code goes to the e-mail. If the phone or the e-mail already
// has an account, the e-mail gets a "você já tem conta" notice instead (same answer here).
export const SignupRequestBody = z.object({
  name: z.string().trim().min(1, 'Seu nome').max(120),
  salonName: z.string().trim().min(1, 'O nome do seu negócio').max(120),
  profession: Profession,
  phone: BrMobileE164,
  email: SignupEmail,
});
export type SignupRequestBody = z.infer<typeof SignupRequestBody>;

export const EmailCodeResponse = z.object({
  ok: z.literal(true),
  expiresInSeconds: z.number().int(),
  retryAfterSeconds: z.number().int(),
  /** Masked destination, e.g. `m***@gmail.com`. */
  email: z.string(),
});
export type EmailCodeResponse = z.infer<typeof EmailCodeResponse>;

// ---- POST /auth/signup/verify: creates the salon (14-day trial) and the owner with the e-mail
// already confirmed and the phone "not verified". Answers like /auth/otp/verify (isNewUser: true).
export const SignupVerifyBody = z.object({ email: SignupEmail, code: OtpCodeValue });
export type SignupVerifyBody = z.infer<typeof SignupVerifyBody>;

// ---- POST /auth/email-code/request: login code to the account's CONFIRMED e-mail. For a phone
// with no such account nothing is sent, and the masked e-mail is a decoy (same answer shape).
export const EmailCodeRequestBody = z.object({ phone: BrMobileE164 });
export type EmailCodeRequestBody = z.infer<typeof EmailCodeRequestBody>;

// ---- POST /auth/email-code/verify: never creates an account.
export const EmailCodeVerifyBody = z.object({ phone: BrMobileE164, code: OtpCodeValue });
export type EmailCodeVerifyBody = z.infer<typeof EmailCodeVerifyBody>;
