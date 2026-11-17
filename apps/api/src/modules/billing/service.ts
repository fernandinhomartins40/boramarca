// Subscription rules shared by the routes, the webhook and the hourly job (docs/COBRANCA.md).
import { and, eq, inArray, lte } from 'drizzle-orm';
import { automationAllowed } from '@boramarca/shared';
import { billingPayments, salons } from '../../db/schema';
import type { Core } from '../../lib/core';
import { addDays, todayIn } from '../../lib/time';

export const BILLING_JOB = 'billing-expire';
export const BILLING_CRON = '0 * * * *';

// shortcut: "today" in São Paulo for every salon (due dates are a calendar day); use each salon
// timezone if the product ever serves salons outside Brasília time.
export const billingDay = (now: Date, plusDays = 0) =>
  addDays(todayIn('America/Sao_Paulo', now), plusDays);

/**
 * Marks `expired`: trial over without a subscription, canceled past what was paid, and charges
 * overdue for BILLING_GRACE_DAYS or more. Idempotent: hourly job and right after PAYMENT_OVERDUE.
 */
export async function expireSubscriptions(core: Core, salonId?: string) {
  const { db } = core;
  const now = core.now();
  // shortcut: loads every salon still able to expire; move the rule into SQL past a few thousand.
  const rows = await db
    .select()
    .from(salons)
    .where(
      and(
        inArray(salons.subscriptionStatus, ['trial', 'canceled', 'past_due']),
        salonId ? eq(salons.id, salonId) : undefined,
      ),
    );
  const graceLimit = billingDay(now, -core.config.BILLING_GRACE_DAYS);
  let expired = 0;
  for (const s of rows) {
    let expire = !automationAllowed(s, now);
    if (!expire && s.subscriptionStatus === 'past_due') {
      const [late] = await db
        .select({ id: billingPayments.id })
        .from(billingPayments)
        .where(
          and(
            eq(billingPayments.salonId, s.id),
            eq(billingPayments.status, 'OVERDUE'),
            lte(billingPayments.dueDate, graceLimit),
          ),
        )
        .limit(1);
      expire = Boolean(late);
    }
    if (!expire) continue;
    const done = await db
      .update(salons)
      .set({ subscriptionStatus: 'expired' })
      .where(and(eq(salons.id, s.id), eq(salons.subscriptionStatus, s.subscriptionStatus)))
      .returning({ id: salons.id });
    if (!done.length) continue;
    expired++;
    core.log.warn(
      { salonId: s.id, from: s.subscriptionStatus },
      'assinatura expirada: automação pausada',
    );
  }
  return expired;
}
