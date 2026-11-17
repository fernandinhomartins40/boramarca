// Subscription of the salon through the Asaas: flow and rules in docs/COBRANCA.md.
import { createHash, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  AsaasWebhookBody,
  automationAllowed,
  BILLING_CYCLE_LABELS,
  PER_SEAT_PLANS,
  PLAN_LABELS,
  planValueCents,
  routes,
  type BillingPlanChoice,
  type BillingSummary,
} from '@boramarca/shared';
import { billingEvents, billingPayments, salons } from '../../db/schema';
import type { AsaasPayment } from '../../lib/asaas';
import { toCents } from '../../lib/asaas';
import { AppError, notFound } from '../../lib/errors';
import { route } from '../../lib/route';
import { addDays } from '../../lib/time';
import { billingDay, expireSubscriptions } from './service';

const OPEN = ['PENDING', 'OVERDUE'];
const PAID_EVENTS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
const DAY_MS = 86_400_000;
const sha = (s: string) => createHash('sha256').update(s).digest();

type Choice = {
  plan: BillingPlanChoice['plan'];
  cycle: BillingPlanChoice['cycle'];
  seats: number;
  valueCents: number;
};
/** The owner always pays the table price: the value never comes from the body. */
const tableChoice = (b: BillingPlanChoice): Choice => {
  const seats = PER_SEAT_PLANS.includes(b.plan) ? b.seats : 1;
  return {
    plan: b.plan,
    cycle: b.cycle,
    seats,
    valueCents: planValueCents(b.plan, b.cycle, seats)!,
  };
};
const describe = (c: Choice) =>
  `Bora Marca — plano ${PLAN_LABELS[c.plan]} (${BILLING_CYCLE_LABELS[c.cycle].toLowerCase()}${
    c.seats > 1 ? `, ${c.seats} profissionais` : ''
  })`;
const later = (a: string, b: string | null) => (b && b > a ? b : a);

const billing: FastifyPluginAsync = async (app) => {
  const b = routes.billing;
  const { db } = app;
  const core = () => app.messaging.core;

  async function loadSalon(id: string) {
    const [s] = await db.select().from(salons).where(eq(salons.id, id));
    if (!s) throw notFound('Espaço');
    return s;
  }

  async function summary(salonId: string): Promise<BillingSummary> {
    const s = await loadSalon(salonId);
    const now = app.now();
    const rows = await db
      .select()
      .from(billingPayments)
      .where(and(eq(billingPayments.salonId, salonId), ne(billingPayments.status, 'DELETED')))
      .orderBy(desc(billingPayments.dueDate))
      .limit(36);
    const open = rows
      .filter((p) => OPEN.includes(p.status))
      .sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1))[0];
    const subscribed = Boolean(s.asaasSubscriptionId);
    return {
      enabled: core().asaas.enabled(),
      status: s.subscriptionStatus,
      plan: s.plan,
      cycle: subscribed ? s.billingCycle : null,
      seats: s.billingSeats,
      valueCents: subscribed ? s.billingValueCents : null,
      trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
      trialDaysLeft:
        s.subscriptionStatus === 'trial' && s.trialEndsAt
          ? Math.max(0, Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / DAY_MS))
          : null,
      automationPaused: !automationAllowed(s, now),
      subscribed,
      exempt: s.subscriptionStatus === 'active' && !subscribed,
      nextDueDate: open?.dueDate ?? s.nextDueDate,
      openInvoiceUrl: open?.invoiceUrl ?? null,
      cpfCnpj: s.billingCpfCnpj,
      email: s.billingEmail,
      payments: rows.map((p) => ({
        id: p.id,
        valueCents: p.valueCents,
        dueDate: p.dueDate,
        status: p.status,
        invoiceUrl: p.invoiceUrl,
        paidAt: p.paidAt,
      })),
    };
  }

  /** One billing operation per salon at a time: a double click does not create two subscriptions. */
  async function locked<T>(salonId: string, fn: () => Promise<T>): Promise<T> {
    const key = `billing:lock:${salonId}`;
    if (!(await app.redis.set(key, '1', 'EX', 60, 'NX')))
      throw new AppError(
        409,
        'CONFLICT',
        'Outra operação da assinatura está em andamento. Aguarde.',
      );
    try {
      return await fn();
    } finally {
      await app.redis.del(key);
    }
  }

  const mirror = (salonId: string, p: AsaasPayment, paidAt: string | null = null) => {
    const data = {
      valueCents: toCents(p.value),
      dueDate: p.dueDate.slice(0, 10),
      status: p.status,
      invoiceUrl: p.invoiceUrl ?? null,
      paidAt,
    };
    return db
      .insert(billingPayments)
      .values({ salonId, asaasId: p.id, ...data })
      .onConflictDoUpdate({ target: billingPayments.asaasId, set: data });
  };

  route(app, b.get, async (req) => summary(req.scope.salonId));

  route(app, b.subscribe, async (req) => {
    const sid = req.scope.salonId;
    const { cpfCnpj, email, ...plan } = req.body;
    const choice = tableChoice(plan);
    const { asaas } = core();
    if (!asaas.enabled())
      throw new AppError(
        503,
        'BILLING_DISABLED',
        'Assinatura indisponível no momento. Tente mais tarde.',
      );
    await locked(sid, async () => {
      const s = await loadSalon(sid);
      if (s.asaasSubscriptionId)
        throw new AppError(
          409,
          'CONFLICT',
          'Você já tem uma assinatura. Troque o plano ou cancele antes.',
        );
      const customer = { name: s.name, cpfCnpj, email };
      let customerId = s.asaasCustomerId;
      if (customerId) await asaas.updateCustomer(customerId, customer);
      else customerId = (await asaas.createCustomer({ ...customer, externalReference: sid })).id;
      // Saved before the subscription: if it fails, the retry does not duplicate the customer.
      await db
        .update(salons)
        .set({ asaasCustomerId: customerId, billingCpfCnpj: cpfCnpj, billingEmail: email })
        .where(eq(salons.id, sid));

      const now = app.now();
      const inTrial = s.subscriptionStatus === 'trial' && s.trialEndsAt && s.trialEndsAt > now;
      // Trial respected: the 1st charge is due when the trial ends (or when what was paid ends).
      let due = billingDay(now);
      if (inTrial) due = later(due, billingDay(s.trialEndsAt!));
      if (s.subscriptionStatus === 'canceled') due = later(due, s.nextDueDate);
      const status =
        s.subscriptionStatus !== 'canceled'
          ? s.subscriptionStatus
          : !automationAllowed(s, now)
            ? 'expired'
            : inTrial
              ? 'trial'
              : 'active';
      const sub = await asaas.createSubscription({
        customer: customerId,
        valueCents: choice.valueCents,
        cycle: choice.cycle,
        nextDueDate: due,
        description: describe(choice),
        externalReference: sid,
      });
      await db
        .update(salons)
        .set({
          asaasSubscriptionId: sub.id,
          plan: choice.plan,
          billingCycle: choice.cycle,
          billingSeats: choice.seats,
          billingValueCents: choice.valueCents,
          nextDueDate: due,
          subscriptionStatus: status,
        })
        .where(eq(salons.id, sid));
      // Best effort: mirror the 1st charge now so the invoice opens at once (PAYMENT_CREATED does
      // the same upsert later). A failure here does not undo the subscription.
      try {
        for (const p of (await asaas.subscriptionPayments(sub.id)).data) await mirror(sid, p);
      } catch (err) {
        req.log.warn(
          { err, salonId: sid },
          'cobrança: 1ª fatura ainda não espelhada (chega pelo webhook)',
        );
      }
    });
    return summary(sid);
  });

  route(app, b.change, async (req) => {
    const sid = req.scope.salonId;
    const choice = tableChoice(req.body);
    await locked(sid, async () => {
      const s = await loadSalon(sid);
      if (!s.asaasSubscriptionId)
        throw new AppError(409, 'NO_SUBSCRIPTION', 'Você ainda não tem assinatura.');
      const sub = await core().asaas.updateSubscription(s.asaasSubscriptionId, {
        valueCents: choice.valueCents,
        cycle: choice.cycle,
        description: describe(choice),
      });
      if (toCents(sub.value) !== choice.valueCents)
        throw new AppError(
          502,
          'BILLING_PROVIDER',
          'O Asaas não aplicou o novo valor. Tente de novo ou fale com a gente.',
        );
      await db
        .update(salons)
        .set({
          plan: choice.plan,
          billingCycle: choice.cycle,
          billingSeats: choice.seats,
          billingValueCents: choice.valueCents,
        })
        .where(eq(salons.id, sid));
    });
    return summary(sid);
  });

  // The automation keeps working until the end of the trial or of what was paid (nextDueDate).
  route(app, b.cancel, async (req) => {
    const sid = req.scope.salonId;
    await locked(sid, async () => {
      const s = await loadSalon(sid);
      if (!s.asaasSubscriptionId)
        throw new AppError(409, 'NO_SUBSCRIPTION', 'Você ainda não tem assinatura.');
      await core().asaas.deleteSubscription(s.asaasSubscriptionId);
      await db.transaction(async (tx) => {
        await tx
          .update(salons)
          .set({
            asaasSubscriptionId: null,
            subscriptionStatus: s.subscriptionStatus === 'expired' ? 'expired' : 'canceled',
          })
          .where(eq(salons.id, sid));
        // The Asaas removes the open charges together with the subscription.
        await tx
          .update(billingPayments)
          .set({ status: 'DELETED' })
          .where(and(eq(billingPayments.salonId, sid), inArray(billingPayments.status, OPEN)));
      });
    });
    await expireSubscriptions(core(), sid);
    return summary(sid);
  });

  // ---- POST /webhooks/asaas (public; authenticated by the Asaas token)
  route(app, b.webhook, async (req) => {
    const token = app.config.ASAAS_WEBHOOK_TOKEN;
    const got = req.headers['asaas-access-token'];
    // Hash both sides: timingSafeEqual needs equal lengths, and the token length does not leak.
    if (!token || typeof got !== 'string' || !timingSafeEqual(sha(got), sha(token)))
      throw new AppError(401, 'UNAUTHORIZED', 'Token do webhook inválido');
    const ok = { received: true as const };
    // A body out of format (another business of the shared account, say) -> 200 + log: resending
    // would not fix it, and errors in a row pause the webhook queue at the Asaas for everyone.
    const parsed = AsaasWebhookBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn(
        { event: req.body.event, issue: parsed.error.issues[0] },
        'cobrança: webhook ignorado (formato)',
      );
      return { ...ok, ignored: true };
    }
    const evt = parsed.data;
    const customer = evt.payment?.customer ?? evt.subscription?.customer;
    const [s] = customer
      ? await db.select().from(salons).where(eq(salons.asaasCustomerId, customer))
      : [];
    // Shared Asaas account: a customer that is not ours, or a one-off charge, is ignored with 200.
    if (!s || (evt.payment && !evt.payment.subscription)) return { ...ok, ignored: true };
    const [seen] = await db
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(eq(billingEvents.id, evt.id));
    if (seen) return { ...ok, duplicate: true };

    await db.transaction(async (tx) => {
      // Simultaneous redelivery: the PK fails, everything rolls back, the Asaas retries (-> duplicate).
      await tx.insert(billingEvents).values({ id: evt.id, event: evt.event });
      const p = evt.payment;
      if (p) {
        const paid = p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate ?? null;
        const status = p.deleted || evt.event === 'PAYMENT_DELETED' ? 'DELETED' : p.status;
        const data = {
          valueCents: toCents(p.value),
          dueDate: p.dueDate,
          status,
          invoiceUrl: p.invoiceUrl ?? null,
          paidAt: paid,
        };
        await tx
          .insert(billingPayments)
          .values({ salonId: s.id, asaasId: p.id, ...data })
          .onConflictDoUpdate({ target: billingPayments.asaasId, set: data });
        if (p.subscription === s.asaasSubscriptionId) {
          const open = await tx
            .select({ status: billingPayments.status })
            .from(billingPayments)
            .where(and(eq(billingPayments.salonId, s.id), inArray(billingPayments.status, OPEN)));
          const overdue = open.some((o) => o.status === 'OVERDUE');
          let next = s.subscriptionStatus;
          if (PAID_EVENTS.includes(evt.event)) next = overdue ? 'past_due' : 'active';
          else if (overdue && (next === 'trial' || next === 'active')) next = 'past_due';
          else if (!overdue && next === 'past_due') next = 'active';
          // shortcut: a paid charge covers one cycle from its due date; SUBSCRIPTION_UPDATED corrects it.
          const covered = PAID_EVENTS.includes(evt.event)
            ? addDays(p.dueDate, s.billingCycle === 'yearly' ? 365 : 30)
            : null;
          await tx
            .update(salons)
            .set({
              subscriptionStatus: next,
              nextDueDate: covered ? later(covered, s.nextDueDate) : s.nextDueDate,
            })
            .where(eq(salons.id, s.id));
        }
      }
      const sub = evt.subscription;
      if (sub && sub.id === s.asaasSubscriptionId) {
        const keep = s.subscriptionStatus === 'expired' ? 'expired' : 'canceled';
        if (evt.event === 'SUBSCRIPTION_DELETED')
          await tx
            .update(salons)
            .set({ subscriptionStatus: keep, asaasSubscriptionId: null })
            .where(eq(salons.id, s.id));
        else if (evt.event === 'SUBSCRIPTION_INACTIVATED')
          await tx.update(salons).set({ subscriptionStatus: keep }).where(eq(salons.id, s.id));
        else if (sub.nextDueDate)
          await tx.update(salons).set({ nextDueDate: sub.nextDueDate }).where(eq(salons.id, s.id));
      }
    });
    if (evt.event === 'PAYMENT_OVERDUE') await expireSubscriptions(core(), s.id);
    if (/REFUND|CHARGEBACK|SUBSCRIPTION_(DELETED|INACTIVATED)/.test(evt.event))
      req.log.warn({ event: evt.event, salonId: s.id }, 'cobrança: evento que pede atenção');
    return ok;
  });
};

export default billing;
