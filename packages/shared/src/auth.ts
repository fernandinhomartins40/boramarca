import { z } from 'zod';
import { MeBilling } from './billing';
import { EntityBase, IsoDateTime, PhoneE164 } from './common';
import { Professional, Profession, QuietHours, Salon } from './salon';

export const OtpCodeValue = z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos');

/** What the code will be used for. `delete_account` codes only work on `DELETE /me`. */
export const OtpPurpose = z.enum(['login', 'delete_account']);
export type OtpPurpose = z.infer<typeof OtpPurpose>;

/** `otp_codes` table (the code itself is never stored, only its hash). */
export const OtpCode = EntityBase.extend({
  phone: PhoneE164,
  codeHash: z.string(),
  purpose: OtpPurpose,
  expiresAt: IsoDateTime,
  attempts: z.number().int().nonnegative(),
});
export type OtpCode = z.infer<typeof OtpCode>;

// ---- POST /auth/otp/request
export const OtpRequestBody = z.object({
  phone: PhoneE164,
  purpose: OtpPurpose.default('login'),
});
export type OtpRequestBody = z.infer<typeof OtpRequestBody>;

export const OtpRequestResponse = z.object({
  ok: z.literal(true),
  expiresInSeconds: z.number().int(),
  retryAfterSeconds: z.number().int(),
  /**
   * `firebase`: nothing was sent; the client signs in with Firebase Authentication by phone and
   * calls `POST /auth/firebase`. Absent: the code goes by our own sender (or is the review code).
   */
  provider: z.literal('firebase').optional(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponse>;

// ---- POST /auth/otp/verify
export const OtpVerifyBody = z.object({
  phone: PhoneE164,
  code: OtpCodeValue,
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;

// ---- POST /auth/firebase (Firebase Authentication by phone as the SMS provider; 503 when the
// API has no FIREBASE_PROJECT_ID). Same answer and rules as /auth/otp/verify: `delete_account`
// gives the restricted deletion session and never creates an account.
export const FirebaseLoginBody = z.object({
  /** Firebase ID token (`getIdToken()`) right after the phone sign-in. */
  idToken: z.string().min(1).max(4096),
  purpose: OtpPurpose.default('login'),
});
export type FirebaseLoginBody = z.infer<typeof FirebaseLoginBody>;

export const AuthTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: IsoDateTime,
  refreshTokenExpiresAt: IsoDateTime,
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const OtpVerifyResponse = AuthTokens.extend({
  /** True when the phone had no account: the app goes to the quick sign-up. */
  isNewUser: z.boolean(),
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponse>;

// ---- POST /auth/refresh (rotates: each refresh token works once; reusing an old one ends the
// session) and POST /auth/logout. A `delete_account` code gives a session that only works on
// `DELETE /me` and `GET /salon/team`, and does not refresh.
export const RefreshBody = z.object({ refreshToken: z.string().min(1) });
export type RefreshBody = z.infer<typeof RefreshBody>;
export const RefreshResponse = AuthTokens;
export type RefreshResponse = z.infer<typeof RefreshResponse>;

// ---- GET /me
export const MeResponse = z.object({
  professional: Professional,
  salon: Salon,
  /** Subscription state for the banners (billing.ts). Absent on mocks and old servers. */
  billing: MeBilling.optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;

// ---- PATCH /me (profile; AI settings go through PATCH /ai/settings, waitlist rule through PATCH /waitlist/rule)
export const MePatch = z
  .object({
    name: z.string().trim().min(1).max(120),
    professions: z.array(Profession).min(1),
    address: z.string().max(300).nullable(),
    salonName: z.string().trim().min(1).max(120),
    reminderLeadMinutes: z.number().int().min(0).max(10080),
    welcomeMessage: z.string().max(500).nullable(),
    quietHours: QuietHours.nullable(),
    skipMessagePreview: z.boolean(),
    voiceRate: z.number().min(0.5).max(2),
    /** null removes it; a new address gets a confirmation link (email.ts). */
    email: z.email('Confira o e-mail').max(254).nullable(),
  })
  .partial()
  .strict();
export type MePatch = z.infer<typeof MePatch>;
export const MePatchResponse = MeResponse;
