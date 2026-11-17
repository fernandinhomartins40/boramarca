import { z } from 'zod';
import { DateOnly, IsoDateTime } from './common';
import { Plan } from './salon';

/**
 * Subscription of the salon (docs/COBRANCA.md). Free sign-up, TRIAL_DAYS of trial without a card,
 * then the owner subscribes on the web panel (Asaas: Pix, boleto or card on the invoice).
 * Money is always integer cents; the Asaas client converts at the border.
 */
export const TRIAL_DAYS = 14;
/** Yearly = pay 10 months, get 12. */
export const YEARLY_MONTHS_CHARGED = 10;

/** Price per professional per month (cents). `null` = not sold yet ("fale conosco"). */
export const PLAN_PRICE_CENTS: Record<Plan, number | null> = {
  essencial: 4900,
  maos_livres: 7900,
  salao: 9900,
  premium: null,
};
/** Plans charged per professional of the team (`seats`); the others are one professional. */
export const PER_SEAT_PLANS: readonly Plan[] = ['salao'];
export const MAX_SEATS = 50;

export const BillingCycle = z.enum(['monthly', 'yearly']);
export type BillingCycle = z.infer<typeof BillingCycle>;
export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Mensal',
  yearly: 'Anual',
};

export const SubscriptionStatus = z.enum(['trial', 'active', 'past_due', 'canceled', 'expired']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Teste grátis',
  active: 'Em dia',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
  expired: 'Expirada',
};

/** Value of EACH charge of the cycle, from the table. `null` = plan not sold. */
export function planValueCents(plan: Plan, cycle: BillingCycle, seats = 1): number | null {
  const month = PLAN_PRICE_CENTS[plan];
  if (month == null) return null;
  const people = PER_SEAT_PLANS.includes(plan) ? seats : 1;
  return month * people * (cycle === 'yearly' ? YEARLY_MONTHS_CHARGED : 1);
}

/** What the salon row carries for the automation check (API) — kept here so it is one rule. */
export interface SubscriptionState {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  asaasSubscriptionId: string | null;
  /** `YYYY-MM-DD`: next charge; for a canceled subscription, the end of what was paid. */
  nextDueDate: string | null;
}

/** End of a due date (São Paulo, UTC-3: Brazil has no DST). */
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999-03:00`);

/**
 * THE check "assinatura permite automação": the AI answering on WhatsApp by itself, waitlist offers
 * and automatic reminders. The agenda and the app keep working either way.
 * - expired: no;
 * - trial: until `trialEndsAt` (or past it while a subscription waits for its 1st payment);
 * - canceled: until the end of what was paid (`nextDueDate`) or of the trial;
 * - active / past_due: yes (past_due becomes expired after BILLING_GRACE_DAYS, hourly job).
 */
export function automationAllowed(s: SubscriptionState, now: Date): boolean {
  switch (s.subscriptionStatus) {
    case 'expired':
      return false;
    case 'trial':
      return Boolean(s.asaasSubscriptionId) || !s.trialEndsAt || s.trialEndsAt > now;
    case 'canceled': {
      const until = s.nextDueDate ? endOfDay(s.nextDueDate) : s.trialEndsAt;
      return Boolean(until && until > now);
    }
    default:
      return true;
  }
}

export const AUTOMATION_PAUSED_MESSAGE = 'Seu teste terminou — assine para a IA voltar a atender';

// ---- CPF / CNPJ (check digits; CNPJ also in the alphanumeric format of 2026)
function cpfOk(d: string) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    return ((s * 10) % 11) % 10;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
function cnpjOk(c: string) {
  if (/^(\d)\1{13}$/.test(c)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += (c.charCodeAt(i) - 48) * (((len - 1 - i) % 8) + 2);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
export const isValidCpfCnpj = (v: string) =>
  (/^\d{11}$/.test(v) && cpfOk(v)) || (/^[0-9A-Z]{12}\d{2}$/.test(v) && cnpjOk(v));

/** Accepts dots, dashes and slashes; keeps only digits (and CNPJ letters). */
export const CpfCnpj = z
  .string()
  .transform((v) => v.replace(/[\s./-]/g, '').toUpperCase())
  .refine(isValidCpfCnpj, 'CPF ou CNPJ inválido');

// ---- Owner routes (/billing*)
/** Plans the owner can subscribe to on the panel (Premium is "fale conosco"). */
export const SellablePlan = Plan.exclude(['premium']);
export type SellablePlan = z.infer<typeof SellablePlan>;

export const BillingPlanChoice = z.object({
  plan: SellablePlan,
  cycle: BillingCycle,
  /** Professionals charged (plan Salão); ignored by the other plans. */
  seats: z.number().int().min(1).max(MAX_SEATS).default(1),
});
export type BillingPlanChoice = z.infer<typeof BillingPlanChoice>;

export const SubscribeBody = BillingPlanChoice.extend({
  cpfCnpj: CpfCnpj,
  /** Where the Asaas sends the invoices. */
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Confira o e-mail')),
});
export type SubscribeBody = z.infer<typeof SubscribeBody>;

export const BillingPayment = z.object({
  id: z.string(),
  valueCents: z.number().int(),
  dueDate: DateOnly,
  /** Asaas status: PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, DELETED… */
  status: z.string(),
  invoiceUrl: z.string().nullable(),
  paidAt: DateOnly.nullable(),
});
export type BillingPayment = z.infer<typeof BillingPayment>;

export const BillingSummary = z.object({
  /** False when the server has no ASAAS_API_KEY: subscribe/change/cancel answer 503. */
  enabled: z.boolean(),
  status: SubscriptionStatus,
  plan: Plan,
  cycle: BillingCycle.nullable(),
  seats: z.number().int(),
  valueCents: z.number().int().nullable(),
  trialEndsAt: IsoDateTime.nullable(),
  trialDaysLeft: z.number().int().nullable(),
  automationPaused: z.boolean(),
  subscribed: z.boolean(),
  /** Active without a subscription (demo and accounts from before billing). */
  exempt: z.boolean(),
  nextDueDate: DateOnly.nullable(),
  openInvoiceUrl: z.string().nullable(),
  cpfCnpj: z.string().nullable(),
  email: z.string().nullable(),
  payments: z.array(BillingPayment),
});
export type BillingSummary = z.infer<typeof BillingSummary>;

/** Short state in GET /me (app and panel banners), for every role. */
export const MeBilling = z.object({
  status: SubscriptionStatus,
  trialEndsAt: IsoDateTime.nullable(),
  automationPaused: z.boolean(),
});
export type MeBilling = z.infer<typeof MeBilling>;

// ---- POST /webhooks/asaas (public; header asaas-access-token)
const AsaasDate = z
  .string()
  .transform((v) => v.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1').slice(0, 10))
  .pipe(DateOnly);
/** Only the fields used; the Asaas may add others. Values in reais (decimal). */
export const AsaasWebhookBody = z.object({
  id: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  payment: z
    .object({
      id: z.string().min(1).max(100),
      customer: z.string().min(1).max(100),
      subscription: z.string().max(100).nullish(),
      value: z.number().min(0).max(1_000_000),
      dueDate: AsaasDate,
      status: z.string().min(1).max(50),
      invoiceUrl: z.string().max(500).nullish(),
      confirmedDate: AsaasDate.nullish(),
      paymentDate: AsaasDate.nullish(),
      clientPaymentDate: AsaasDate.nullish(),
      deleted: z.boolean().nullish(),
    })
    .optional(),
  subscription: z
    .object({
      id: z.string().min(1).max(100),
      customer: z.string().min(1).max(100),
      nextDueDate: AsaasDate.nullish(),
    })
    .optional(),
});
export type AsaasWebhookBody = z.infer<typeof AsaasWebhookBody>;
/** The route takes any JSON object: a body out of format is answered 200 `ignored` (shared account). */
export const AsaasWebhookRequest = z.record(z.string(), z.unknown());
export const AsaasWebhookResponse = z.object({
  received: z.literal(true),
  ignored: z.boolean().optional(),
  duplicate: z.boolean().optional(),
});
export type AsaasWebhookResponse = z.infer<typeof AsaasWebhookResponse>;
