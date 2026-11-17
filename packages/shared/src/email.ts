import { z } from 'zod';

/**
 * Optional e-mail of the professional (transactional mail through Velomail). Set it with
 * `PATCH /me { email }`; the API mails a single-use confirmation link valid for 24 h. Until it is
 * confirmed no other mail goes to it; changing it starts the confirmation again.
 */
export const EMAIL_CONFIRM_TTL_HOURS = 24;

/** `POST /me/email/resend`: at most one link per minute. */
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;

// ---- GET /email/confirm?token=… (public link from the e-mail). Always answers with a redirect to
// the site page `/email-confirmado?status=<EmailConfirmStatus>`.
export const EmailConfirmQuery = z.object({ token: z.string().max(200).default('') });
export type EmailConfirmQuery = z.infer<typeof EmailConfirmQuery>;

export const EmailConfirmStatus = z.enum(['ok', 'expirado', 'invalido']);
export type EmailConfirmStatus = z.infer<typeof EmailConfirmStatus>;

/** Site page the confirmation link redirects to. */
export const EMAIL_CONFIRMED_PAGE = '/email-confirmado';

export type EmailState = 'none' | 'pending' | 'verified';

/** What the account screens show: no e-mail, "aguardando confirmação" or "confirmado". */
export function emailState(p: {
  email: string | null;
  emailVerifiedAt: string | null;
}): EmailState {
  if (!p.email) return 'none';
  return p.emailVerifiedAt ? 'verified' : 'pending';
}
