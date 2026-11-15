import type { WhatsAppStatus } from '@boramarca/shared';
import { parseEvolutionWebhook } from './evolution-webhook';
import { toProviderNumber } from './phone';
import {
  WhatsAppGatewayError,
  type CreateSessionOptions,
  type GatewayStatus,
  type WebhookEvent,
  type WhatsAppGateway,
} from './types';

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

/** Virtual time: `sleep` advances the clock instead of waiting. */
export class FakeClock implements Clock {
  private t: number;
  constructor(start: Date | string = '2026-01-05T12:00:00.000Z') {
    this.t = new Date(start).getTime();
  }
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
  set(date: Date | string) {
    this.t = new Date(date).getTime();
  }
  async sleep(ms: number) {
    this.t += ms;
  }
}

interface FakeSession {
  status: WhatsAppStatus;
  phone: string | null;
  options: CreateSessionOptions;
  qrCount: number;
  connectAt: number | null;
}

export interface SentRecord {
  instance: string;
  toPhone: string;
  text: string;
  at: Date;
  providerMessageId: string;
}

export interface PresenceRecord {
  instance: string;
  toPhone: string;
  durationMs: number;
  at: Date;
}

export interface FakeInbound {
  fromPhone: string;
  text?: string;
  /** Sends an audio message instead of text. */
  audio?: { base64: string; mimetype?: string; seconds?: number };
  pushName?: string;
  group?: boolean;
  fromMe?: boolean;
}

/**
 * In-memory gateway for tests and the store demo account. Webhooks are produced in the real
 * Evolution format and delivered to `onWebhook` handlers, so `parseWebhook` runs as in production.
 */
export class FakeGateway implements WhatsAppGateway {
  readonly clock: Clock;
  readonly sent: SentRecord[] = [];
  readonly presences: PresenceRecord[] = [];
  private readonly sessions = new Map<string, FakeSession>();
  private readonly handlers: ((body: unknown) => void | Promise<void>)[] = [];
  private readonly autoConnectMs: number | null;
  private readonly demoPhone: string;
  private seq = 0;
  /** Next `sendText` calls fail with this error (one per entry). */
  readonly failNextSends: Error[] = [];

  constructor(opts: { clock?: Clock; autoConnectMs?: number | null; demoPhone?: string } = {}) {
    this.clock = opts.clock ?? new FakeClock();
    this.autoConnectMs = opts.autoConnectMs ?? null;
    this.demoPhone = opts.demoPhone ?? '+5511900000000';
  }

  onWebhook(handler: (body: unknown) => void | Promise<void>) {
    this.handlers.push(handler);
  }

  private async emit(instance: string, event: string, data: unknown) {
    const body = { event, instance, data, date_time: this.clock.now().toISOString() };
    for (const h of this.handlers) await h(body);
    return body;
  }

  private session(instance: string): FakeSession {
    const s = this.sessions.get(instance);
    if (!s) throw new WhatsAppGatewayError(`Instância ${instance} não existe`, 'not_found', 404);
    // Demo mode: the "scan" happens by itself some time after the QR/pairing code was shown.
    if (s.connectAt !== null && this.clock.now().getTime() >= s.connectAt) {
      s.connectAt = null;
      s.status = 'connected';
      s.phone ??= this.demoPhone;
    }
    return s;
  }

  async createSession(instance: string, options: CreateSessionOptions) {
    const existing = this.sessions.get(instance);
    if (existing) existing.options = options;
    else
      this.sessions.set(instance, {
        status: 'disconnected',
        phone: null,
        options,
        qrCount: 0,
        connectAt: null,
      });
  }

  private startPairing(s: FakeSession) {
    if (s.status === 'connected')
      throw new WhatsAppGatewayError('O número já está conectado', 'provider_error');
    s.status = 'waiting_qr';
    s.qrCount++;
    if (this.autoConnectMs !== null)
      s.connectAt ??= this.clock.now().getTime() + this.autoConnectMs;
  }

  async getQrCode(instance: string) {
    const s = this.session(instance);
    this.startPairing(s);
    const qr = `fake-qr:${instance}:${s.qrCount}`;
    await this.emit(instance, 'qrcode.updated', {
      qrcode: { instance, pairingCode: null, code: qr },
    });
    return { qr, expiresAt: new Date(this.clock.now().getTime() + 20_000).toISOString() };
  }

  async getPairingCode(instance: string, phone: string) {
    const s = this.session(instance);
    this.startPairing(s);
    s.phone = phone;
    const code = `BORA${String(s.qrCount).padStart(4, '0')}`;
    return { code, expiresAt: new Date(this.clock.now().getTime() + 60_000).toISOString() };
  }

  async getStatus(instance: string): Promise<GatewayStatus> {
    const s = this.session(instance);
    return {
      status: s.status,
      phone: s.status === 'connected' ? s.phone : null,
      profileName: s.status === 'connected' ? 'Demonstração' : null,
      profilePictureUrl: null,
    };
  }

  /** Simulates the professional scanning the QR (or typing the pairing code). */
  async simulateConnect(instance: string, phone?: string) {
    const s = this.session(instance);
    s.status = 'connected';
    s.connectAt = null;
    s.phone = phone ?? s.phone ?? this.demoPhone;
    await this.emit(instance, 'connection.update', {
      instance,
      state: 'open',
      statusReason: 200,
      wuid: `${toProviderNumber(s.phone)}@s.whatsapp.net`,
      profileName: 'Demonstração',
      profilePictureUrl: null,
    });
  }

  /** Simulates the session dropping (phone offline, logged out on the phone: 401). */
  async simulateDrop(instance: string, reasonCode = 428) {
    const s = this.session(instance);
    s.status = 'disconnected';
    await this.emit(instance, 'connection.update', {
      instance,
      state: 'close',
      statusReason: reasonCode,
    });
  }

  async disconnect(instance: string) {
    const s = this.session(instance);
    s.status = 'disconnected';
    s.connectAt = null;
  }

  async deleteInstance(instance: string) {
    this.sessions.delete(instance);
  }

  async sendText(instance: string, toPhone: string, text: string) {
    const s = this.session(instance);
    const failure = this.failNextSends.shift();
    if (failure) throw failure;
    if (s.status !== 'connected') {
      throw new WhatsAppGatewayError('Sessão desconectada', 'not_connected');
    }
    const providerMessageId = `FAKE${String(++this.seq).padStart(8, '0')}`;
    this.sent.push({ instance, toPhone, text, at: this.clock.now(), providerMessageId });
    return { providerMessageId };
  }

  async sendPresence(instance: string, toPhone: string, durationMs: number) {
    if (this.session(instance).status !== 'connected') {
      throw new WhatsAppGatewayError('Sessão desconectada', 'not_connected');
    }
    this.presences.push({ instance, toPhone, durationMs, at: this.clock.now() });
    await this.clock.sleep(durationMs);
  }

  /** Delivers an inbound message as Evolution would (messages.upsert) and returns the raw body. */
  async injectInbound(instance: string, msg: FakeInbound) {
    this.session(instance);
    const digits = toProviderNumber(msg.fromPhone);
    const remoteJid = msg.group ? `120363000000000000@g.us` : `${digits}@s.whatsapp.net`;
    const message = msg.audio
      ? {
          audioMessage: {
            url: null,
            mimetype: msg.audio.mimetype ?? 'audio/ogg; codecs=opus',
            seconds: msg.audio.seconds ?? 3,
            ptt: true,
          },
          base64: msg.audio.base64,
        }
      : { conversation: msg.text ?? '' };
    return this.emit(instance, 'messages.upsert', {
      key: {
        remoteJid,
        fromMe: msg.fromMe ?? false,
        id: `FAKEIN${String(++this.seq).padStart(8, '0')}`,
        ...(msg.group ? { participant: `${digits}@s.whatsapp.net` } : {}),
      },
      pushName: msg.pushName ?? 'Cliente',
      message,
      messageType: msg.audio ? 'audioMessage' : 'conversation',
      messageTimestamp: Math.floor(this.clock.now().getTime() / 1000),
    });
  }

  parseWebhook(body: unknown): WebhookEvent {
    return parseEvolutionWebhook(body);
  }
}
