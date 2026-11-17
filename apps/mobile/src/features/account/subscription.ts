import { AUTOMATION_PAUSED_MESSAGE, type MeBilling } from '@boramarca/shared';

/** Store rule: no payment link inside the app (iOS and Android alike) — only this text. */
export const SUBSCRIBE_HINT = 'Para assinar, acesse boramarca.com.br/painel';

/** One line about the subscription for Ajustes → Conta (GET /me `billing`). */
export function subscriptionLine(b: MeBilling | undefined, now = new Date()): string {
  if (!b) return SUBSCRIBE_HINT;
  if (b.automationPaused) return AUTOMATION_PAUSED_MESSAGE;
  switch (b.status) {
    case 'trial': {
      if (!b.trialEndsAt) return 'Teste grátis';
      const days = Math.max(0, Math.ceil((Date.parse(b.trialEndsAt) - now.getTime()) / 86_400_000));
      return days === 1 ? 'Teste grátis: falta 1 dia' : `Teste grátis: faltam ${days} dias`;
    }
    case 'active':
      return 'Assinatura em dia';
    case 'past_due':
      return 'Pagamento atrasado';
    case 'canceled':
      return 'Assinatura cancelada';
    default:
      return AUTOMATION_PAUSED_MESSAGE;
  }
}
