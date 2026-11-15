// The only door in and out of WhatsApp (plan section 7). See README.md.
export { SEND_GUARD_DEFAULTS, WHATSAPP_WEBHOOK_SECRET_HEADER } from '@boramarca/shared';
export * from './types';
export { jidToE164, toProviderNumber } from './phone';
export { parseEvolutionWebhook, mapEvolutionState } from './evolution-webhook';
export {
  EvolutionGateway,
  EVOLUTION_WEBHOOK_EVENTS,
  type EvolutionGatewayOptions,
} from './evolution-gateway';
export {
  FakeGateway,
  FakeClock,
  type Clock,
  type FakeInbound,
  type SentRecord,
  type PresenceRecord,
} from './fake-gateway';
export * from './guard';
export * from './outbox';
export * from './sender';
export { readEvolutionConfig, type EvolutionConfig } from './env';
export const PACKAGE_NAME = '@boramarca/whatsapp';
