// Which WhatsApp gateway the API talks to. Part of the send module: together with send.ts it is
// the only code allowed to touch gateway.sendText/sendPresence (ESLint rule in eslint.config.mjs).
import {
  EvolutionGateway,
  FakeGateway,
  parseEvolutionWebhook,
  WhatsAppGatewayError,
  type WhatsAppGateway,
} from '@boramarca/whatsapp';
import type { Config } from '../../config';

/** Instances of the store review account always use the simulated WhatsApp (plan section 9). */
export const DEMO_INSTANCE_PREFIX = 'demo-';

const realClock = {
  now: () => new Date(),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

/** Demo gateway: the "scan" happens by itself 5 s after the QR or pairing code is shown. */
export const createDemoGateway = () => new FakeGateway({ autoConnectMs: 5000, clock: realClock });

/** Evolution when configured; otherwise the simulated gateway (never in production). */
export function createPrimaryGateway(config: Config): WhatsAppGateway | FakeGateway {
  if (config.EVOLUTION_BASE_URL && config.EVOLUTION_API_KEY)
    return new EvolutionGateway({
      baseUrl: config.EVOLUTION_BASE_URL,
      apiKey: config.EVOLUTION_API_KEY,
    });
  // Production never fakes WhatsApp: without Evolution every call fails with 502 (the review
  // account still works through the demo gateway).
  if (config.NODE_ENV === 'production') return unconfiguredGateway;
  return createDemoGateway();
}

const fail = async (): Promise<never> => {
  throw new WhatsAppGatewayError('Evolution API não configurada', 'provider_error');
};
const unconfiguredGateway: WhatsAppGateway = {
  createSession: fail,
  getQrCode: fail,
  getPairingCode: fail,
  getStatus: fail,
  disconnect: fail,
  deleteInstance: fail,
  sendText: fail,
  sendPresence: fail,
  parseWebhook: parseEvolutionWebhook,
};

/** Sends demo instances to the fake, everything else to the real gateway. */
export class RoutingGateway implements WhatsAppGateway {
  constructor(
    private readonly real: WhatsAppGateway,
    readonly demo: FakeGateway,
  ) {}
  private pick(instance: string) {
    return instance.startsWith(DEMO_INSTANCE_PREFIX) ? this.demo : this.real;
  }
  createSession: WhatsAppGateway['createSession'] = (i, o) => this.pick(i).createSession(i, o);
  getQrCode: WhatsAppGateway['getQrCode'] = (i) => this.pick(i).getQrCode(i);
  getPairingCode: WhatsAppGateway['getPairingCode'] = (i, p) => this.pick(i).getPairingCode(i, p);
  getStatus: WhatsAppGateway['getStatus'] = (i) => this.pick(i).getStatus(i);
  disconnect: WhatsAppGateway['disconnect'] = (i) => this.pick(i).disconnect(i);
  deleteInstance: WhatsAppGateway['deleteInstance'] = (i) => this.pick(i).deleteInstance(i);
  sendText: WhatsAppGateway['sendText'] = (i, to, t) => this.pick(i).sendText(i, to, t);
  sendPresence: WhatsAppGateway['sendPresence'] = (i, to, ms) =>
    this.pick(i).sendPresence(i, to, ms);
  // Both speak the Evolution webhook format.
  parseWebhook: WhatsAppGateway['parseWebhook'] = (b) => this.real.parseWebhook(b);
}
