import { describe, expect, it, vi } from 'vitest';
import { AUTOMATION_PAUSED_MESSAGE, type AuthTokens, type BillingSummary } from '@boramarca/shared';
import { cancelSubscription, subscribe, subscriptionHeadline } from './actions';
import { createClient } from './client';

const NOW = Date.parse('2026-11-10T17:00:00Z');
const tokens: AuthTokens = {
  accessToken: 'a1',
  refreshToken: 'r1',
  accessTokenExpiresAt: new Date(NOW + 600_000).toISOString(),
  refreshTokenExpiresAt: new Date(NOW + 86_400_000).toISOString(),
};
const summary = (over: Partial<BillingSummary> = {}): BillingSummary => ({
  enabled: true,
  status: 'trial',
  plan: 'essencial',
  cycle: null,
  seats: 1,
  valueCents: null,
  trialEndsAt: '2026-11-20T17:00:00.000Z',
  trialDaysLeft: 10,
  automationPaused: false,
  subscribed: false,
  exempt: false,
  nextDueDate: null,
  openInvoiceUrl: null,
  cpfCnpj: null,
  email: null,
  payments: [],
  ...over,
});

describe('subscriptionHeadline', () => {
  it('says what matters for each state', () => {
    expect(subscriptionHeadline(summary())).toBe('Teste grátis: faltam 10 dias.');
    expect(subscriptionHeadline(summary({ trialDaysLeft: 1 }))).toBe('Teste grátis: falta 1 dia.');
    expect(subscriptionHeadline(summary({ status: 'expired', automationPaused: true }))).toBe(
      AUTOMATION_PAUSED_MESSAGE,
    );
    expect(subscriptionHeadline(summary({ status: 'active', exempt: true }))).toBe(
      'Conta liberada, sem cobrança.',
    );
    expect(subscriptionHeadline(summary({ status: 'past_due' }))).toContain('atrasado');
  });
});

describe('billing actions', () => {
  it('subscribe posts the plan and the payer; cancel sends DELETE without a body', async () => {
    const fetchMock = vi.fn(async () => Response.json(summary()));
    const store = { get: () => tokens, set: () => {} };
    const api = createClient(store, {
      fetchImpl: fetchMock,
      baseUrl: 'http://api',
      now: () => NOW,
    });
    const body = {
      plan: 'salao' as const,
      cycle: 'yearly' as const,
      seats: 2,
      cpfCnpj: '52998224725',
      email: 'a@b.com',
    };
    await subscribe(api, body);
    expect(fetchMock).toHaveBeenLastCalledWith('http://api/v1/billing/subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer a1' },
      body: JSON.stringify(body),
    });
    await cancelSubscription(api);
    expect(fetchMock).toHaveBeenLastCalledWith('http://api/v1/billing/subscription', {
      method: 'DELETE',
      headers: { authorization: 'Bearer a1' },
      body: undefined,
    });
  });
});
