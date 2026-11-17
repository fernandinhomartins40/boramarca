import {
  AUTOMATION_PAUSED_MESSAGE,
  routes,
  type BillingPlanChoice,
  type BillingSummary,
  type SubscribeBody,
} from '@boramarca/shared';
import type { PanelClient } from './client';

/** Owner panel writes. The salon routes cover every professional, the owner included. */

export const answerDecision = (
  api: PanelClient,
  id: string,
  answer: { optionId: string } | { text: string },
) => api.call(routes.salon.answerDecision, { params: { id }, body: { ...answer, via: 'app' } });

/** Same-day move: shifts the start by the minutes between the old and the new time of day. */
export function movedStart(startsAt: string, fromMinutes: number, toMinutes: number): string {
  // shortcut: a minute delta ignores a DST jump inside the day (Brazil has none); convert the
  // wall time with the salon timezone if the panel ever serves zones with DST.
  return new Date(Date.parse(startsAt) + (toMinutes - fromMinutes) * 60_000).toISOString();
}

export const rescheduleAppointment = (
  api: PanelClient,
  id: string,
  startsAt: string,
  notifyClient: boolean,
) =>
  api.call(routes.salon.rescheduleAppointment, {
    params: { id },
    body: { startsAt, notifyClient },
  });

/** Account e-mail: empty removes it; a new address gets a confirmation link. */
export const saveEmail = (api: PanelClient, value: string) =>
  api.call(routes.auth.updateMe, { body: { email: value.trim().toLowerCase() || null } });

export const resendEmailConfirmation = (api: PanelClient) =>
  api.call(routes.email.resendConfirmation);

// ---- Subscription (docs/COBRANCA.md)
export const subscribe = (api: PanelClient, body: SubscribeBody) =>
  api.call(routes.billing.subscribe, { body });
export const changePlan = (api: PanelClient, body: BillingPlanChoice) =>
  api.call(routes.billing.change, { body });
export const cancelSubscription = (api: PanelClient) => api.call(routes.billing.cancel);

/** One line about the subscription for the top of the Plano screen. */
export function subscriptionHeadline(b: BillingSummary): string {
  if (b.automationPaused) return AUTOMATION_PAUSED_MESSAGE;
  if (b.exempt) return 'Conta liberada, sem cobrança.';
  switch (b.status) {
    case 'trial':
      if (b.subscribed) return 'Assinatura feita: a primeira cobrança vence no fim do teste.';
      return b.trialDaysLeft === 1
        ? 'Teste grátis: falta 1 dia.'
        : `Teste grátis: faltam ${b.trialDaysLeft ?? 0} dias.`;
    case 'active':
      return 'Assinatura em dia.';
    case 'past_due':
      return 'Pagamento atrasado. Pague a fatura para não pausar a IA.';
    case 'canceled':
      return 'Assinatura cancelada. A IA atende até o fim do período.';
    default:
      return AUTOMATION_PAUSED_MESSAGE;
  }
}
