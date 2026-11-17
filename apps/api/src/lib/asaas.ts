// Thin HTTP client of the Asaas (subscription billing, docs/COBRANCA.md).
// Money: integer cents on our side; reais (decimal) only here, at the border.
import type { BillingCycle } from '@boramarca/shared';
import type { Config } from '../config';
import type { Log } from './core';
import { AppError } from './errors';

type AsaasErrors = { errors?: { code?: string; description?: string }[] };

export const toCents = (reais: number) => Math.round(reais * 100);
const CYCLE = { monthly: 'MONTHLY', yearly: 'YEARLY' } as const;

type Customer = { name: string; cpfCnpj: string; email: string };
type Subscription = { id: string; value: number; nextDueDate: string };
type SubscriptionInput = { valueCents: number; cycle: BillingCycle; description: string };
export type AsaasPayment = {
  id: string;
  value: number;
  dueDate: string;
  status: string;
  invoiceUrl?: string | null;
};

/** `fetchImpl` is swappable: tests use a fake Asaas, never the network. */
export function createAsaas(
  config: Config,
  log: Log,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
) {
  async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: object,
  ) {
    if (!config.ASAAS_API_KEY)
      throw new AppError(
        503,
        'BILLING_DISABLED',
        'Assinatura indisponível no momento. Tente mais tarde.',
      );
    let res: Response;
    try {
      res = await fetchImpl(config.ASAAS_API_URL.replace(/\/$/, '') + path, {
        method,
        headers: {
          access_token: config.ASAAS_API_KEY,
          'content-type': 'application/json',
          'user-agent': 'boramarca',
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      log.error({ err, method, path }, 'asaas: sem resposta');
      throw new AppError(
        502,
        'BILLING_PROVIDER',
        'O Asaas não respondeu. Tente de novo em instantes.',
      );
    }
    const json = (await res.json().catch(() => null)) as (T & AsaasErrors) | null;
    if (!res.ok || !json) {
      log.warn(
        { method, path, status: res.status, errors: json?.errors },
        'asaas: operação recusada',
      );
      const description = json?.errors?.[0]?.description;
      throw new AppError(
        502,
        'BILLING_PROVIDER',
        description ? `Asaas: ${description}` : `O Asaas recusou a operação (HTTP ${res.status}).`,
      );
    }
    return json as T;
  }

  return {
    enabled: () => Boolean(config.ASAAS_API_KEY),
    createCustomer: (c: Customer & { externalReference: string }) =>
      request<{ id: string }>('POST', '/customers', c),
    updateCustomer: (id: string, c: Customer) =>
      request<{ id: string }>('PUT', `/customers/${id}`, c),
    /** billingType UNDEFINED: the payer picks Pix, boleto or card on the invoice. */
    createSubscription: (
      s: SubscriptionInput & { customer: string; nextDueDate: string; externalReference: string },
    ) =>
      request<Subscription>('POST', '/subscriptions', {
        customer: s.customer,
        billingType: 'UNDEFINED',
        value: s.valueCents / 100,
        nextDueDate: s.nextDueDate,
        cycle: CYCLE[s.cycle],
        description: s.description,
        externalReference: s.externalReference,
      }),
    /** Charges already generated (best effort right after subscribing; the webhook covers it). */
    subscriptionPayments: (id: string) =>
      request<{ data: AsaasPayment[] }>('GET', `/subscriptions/${id}/payments`),
    /** Applies to the next charges and to the pending ones already generated. */
    updateSubscription: (id: string, s: SubscriptionInput) =>
      request<Subscription>('PUT', `/subscriptions/${id}`, {
        value: s.valueCents / 100,
        cycle: CYCLE[s.cycle],
        description: s.description,
        updatePendingPayments: true,
      }),
    /** The Asaas also removes the pending/overdue charges of the subscription; paid ones stay. */
    deleteSubscription: (id: string) =>
      request<{ id: string; deleted: boolean }>('DELETE', `/subscriptions/${id}`),
  };
}
export type Asaas = ReturnType<typeof createAsaas>;
