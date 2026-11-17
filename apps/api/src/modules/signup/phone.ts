// "Celular não verificado" (e-mail sign-up) until an SMS code or the WhatsApp pairing proves it.
import { and, eq, isNull } from 'drizzle-orm';
import { professionals } from '../../db/schema';
import type { Core } from '../../lib/core';
import { resendConfirmation } from '../email/service';

/** Brazilian numbers with and without the 9th digit are the same line (old WhatsApp ids lack it). */
export const samePhone = (a: string, b: string) => {
  const k = (p: string) => p.replace(/^\+55(\d{2})9(\d{8})$/, '+55$1$2');
  return k(a) === k(b);
};

/**
 * The phone was proven by an SMS code. If it was never proven before, the account may have been
 * signed up by someone else with this number: its e-mail must be confirmed again (a new link goes
 * out), so whoever typed that e-mail cannot keep logging in by e-mail code.
 */
export async function phoneProvenBySms(
  core: Core,
  p: { id: string; phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null },
) {
  if (p.phoneVerifiedAt) return;
  const resetEmail = Boolean(p.emailVerifiedAt);
  await core.db
    .update(professionals)
    .set({ phoneVerifiedAt: core.now(), ...(resetEmail && { emailVerifiedAt: null }) })
    .where(and(eq(professionals.id, p.id), isNull(professionals.phoneVerifiedAt)));
  if (resetEmail)
    await resendConfirmation(core, p.id).catch((err: unknown) =>
      core.log.warn({ err, professionalId: p.id }, 'novo link de confirmação não enviado'),
    );
}

/** WhatsApp connected on this account: the number paired is the account's own → verified. */
export async function phoneProvenByWhatsApp(core: Core, professionalId: string, paired: string) {
  const [p] = await core.db
    .select({ phone: professionals.phone, verified: professionals.phoneVerifiedAt })
    .from(professionals)
    .where(eq(professionals.id, professionalId));
  if (!p || p.verified || !samePhone(p.phone, paired)) return;
  await core.db
    .update(professionals)
    .set({ phoneVerifiedAt: core.now() })
    .where(and(eq(professionals.id, professionalId), isNull(professionals.phoneVerifiedAt)));
}
