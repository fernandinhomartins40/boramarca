import { AUTOMATION_PAUSED_MESSAGE } from '@boramarca/shared';
import { SUBSCRIBE_HINT, subscriptionLine } from './subscription';

const now = new Date('2026-11-10T12:00:00Z');

it('describes the subscription without any payment link', () => {
  const trial = {
    status: 'trial' as const,
    trialEndsAt: '2026-11-19T12:00:00Z',
    automationPaused: false,
  };
  expect(subscriptionLine(trial, now)).toBe('Teste grátis: faltam 9 dias');
  expect(subscriptionLine({ ...trial, trialEndsAt: '2026-11-11T00:00:00Z' }, now)).toBe(
    'Teste grátis: falta 1 dia',
  );
  expect(
    subscriptionLine({ status: 'expired', trialEndsAt: null, automationPaused: true }, now),
  ).toBe(AUTOMATION_PAUSED_MESSAGE);
  expect(
    subscriptionLine({ status: 'active', trialEndsAt: null, automationPaused: false }, now),
  ).toBe('Assinatura em dia');
  expect(subscriptionLine(undefined, now)).toBe(SUBSCRIBE_HINT);
  expect(SUBSCRIBE_HINT).not.toMatch(/https?:/);
});
