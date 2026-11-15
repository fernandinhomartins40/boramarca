import {
  WHATSAPP_WEBHOOK_SECRET_HEADER,
  type WhatsAppPairingCodeResponse,
  type WhatsAppQrResponse,
} from '@boramarca/shared';
import { mapEvolutionState, parseEvolutionWebhook } from './evolution-webhook';
import { jidToE164, toProviderNumber } from './phone';
import {
  WhatsAppGatewayError,
  type CreateSessionOptions,
  type GatewayStatus,
  type WebhookEvent,
  type WhatsAppGateway,
} from './types';

/** Events the product consumes (Evolution names them in UPPER_SNAKE when configuring). */
export const EVOLUTION_WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];

/** WhatsApp rotates the QR about every 20 s. */
const QR_TTL_MS = 20_000;
const PAIRING_TTL_MS = 60_000;
const CONNECT_POLLS = 5;

export interface EvolutionGatewayOptions {
  /** e.g. `http://localhost:8085` (env `EVOLUTION_BASE_URL`). */
  baseUrl: string;
  /** Global key (env `EVOLUTION_API_KEY`), sent as the `apikey` header. */
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Per-request timeout; sendPresence blocks for the typing time. */
  timeoutMs?: number;
}

type Json = Record<string, unknown>;

/**
 * Adapter for the official Evolution API image, pinned at v2.3.7 (routes checked against the
 * source shipped in that image): /instance/create, /instance/connect, /instance/fetchInstances,
 * /instance/logout, /instance/delete, /webhook/set, /message/sendText, /chat/sendPresence.
 */
export class EvolutionGateway implements WhatsAppGateway {
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;

  constructor(private readonly opts: EvolutionGatewayOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => new Date());
  }

  private async request<T = Json>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T }> {
    const route = `${method} ${path.split('?')[0]}`; // the query may carry a phone: keep it out of errors
    let res: Response;
    try {
      res = await this.fetch(this.opts.baseUrl.replace(/\/+$/, '') + path, {
        method,
        headers: { apikey: this.opts.apiKey, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
    } catch {
      throw new WhatsAppGatewayError(`Evolution indisponível (${route})`, 'network_error');
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data: data as T };
  }

  private fail(route: string, status: number): never {
    throw new WhatsAppGatewayError(
      `Evolution respondeu ${status} em ${route}`,
      status === 404 ? 'not_found' : 'provider_error',
      status,
    );
  }

  private webhookConfig(options: CreateSessionOptions) {
    return {
      url: options.webhookUrl,
      byEvents: false,
      // Audio arrives decrypted in the webhook, so the API never fetches media from WhatsApp.
      base64: true,
      headers: { [WHATSAPP_WEBHOOK_SECRET_HEADER]: options.webhookSecret },
      events: EVOLUTION_WEBHOOK_EVENTS,
    };
  }

  async createSession(instance: string, options: CreateSessionOptions): Promise<void> {
    const created = await this.request('POST', '/instance/create', {
      instanceName: instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
      groupsIgnore: true,
      readMessages: false,
      readStatus: false,
      alwaysOnline: false,
      rejectCall: false,
      syncFullHistory: false,
      webhook: this.webhookConfig(options),
    });
    if (created.status === 201 || created.status === 200) return;
    // 403 = name already in use: keep the instance (and its session), refresh the webhook.
    if (created.status !== 403) this.fail('POST /instance/create', created.status);
    const set = await this.request('POST', `/webhook/set/${encodeURIComponent(instance)}`, {
      webhook: { enabled: true, ...this.webhookConfig(options) },
    });
    if (set.status >= 300) this.fail('POST /webhook/set', set.status);
  }

  /** GET /instance/connect, retried while Evolution is still generating the QR/pairing code. */
  private async connect(instance: string, number: string | null, pick: (d: Json) => string | null) {
    const path = `/instance/connect/${encodeURIComponent(instance)}${number ? `?number=${number}` : ''}`;
    for (let i = 0; i < CONNECT_POLLS; i++) {
      const { status, data } = await this.request('GET', path);
      if (status >= 300) this.fail('GET /instance/connect', status);
      const state = (data?.instance as Json | undefined)?.state;
      if (state === 'open') {
        throw new WhatsAppGatewayError('O número já está conectado', 'provider_error', status);
      }
      const value = data ? pick(data) : null;
      if (value) return value;
      await this.sleep(1000);
    }
    return null;
  }

  async getQrCode(instance: string): Promise<WhatsAppQrResponse> {
    const qr = await this.connect(instance, null, (d) =>
      typeof d.code === 'string' ? d.code : null,
    );
    if (!qr) throw new WhatsAppGatewayError('QR code ainda não gerado', 'provider_error');
    return { qr, expiresAt: new Date(this.now().getTime() + QR_TTL_MS).toISOString() };
  }

  async getPairingCode(instance: string, phone: string): Promise<WhatsAppPairingCodeResponse> {
    const raw = await this.connect(instance, toProviderNumber(phone), (d) =>
      typeof d.pairingCode === 'string' ? d.pairingCode : null,
    );
    const code = raw?.replace(/[^0-9A-Za-z]/g, '').toUpperCase() ?? '';
    if (code.length !== 8) {
      // Evolution ignores `number` while a QR session is already "connecting".
      throw new WhatsAppGatewayError(
        'Código de pareamento indisponível; desconecte e tente de novo',
        'pairing_unavailable',
      );
    }
    return { code, expiresAt: new Date(this.now().getTime() + PAIRING_TTL_MS).toISOString() };
  }

  async getStatus(instance: string): Promise<GatewayStatus> {
    const { status, data } = await this.request<Json[]>(
      'GET',
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
    );
    if (status >= 300) this.fail('GET /instance/fetchInstances', status);
    const row = Array.isArray(data) ? data[0] : undefined;
    if (!row) this.fail('GET /instance/fetchInstances', 404);
    const mapped = mapEvolutionState(row.connectionStatus as string);
    return {
      status: mapped,
      phone: mapped === 'connected' ? jidToE164(row.ownerJid as string | null) : null,
      profileName: (row.profileName as string | null) ?? null,
      profilePictureUrl: (row.profilePicUrl as string | null) ?? null,
    };
  }

  async disconnect(instance: string): Promise<void> {
    const { status } = await this.request(
      'DELETE',
      `/instance/logout/${encodeURIComponent(instance)}`,
    );
    // 400 = "instance is not connected": already disconnected.
    if (status >= 300 && status !== 400) this.fail('DELETE /instance/logout', status);
  }

  async deleteInstance(instance: string): Promise<void> {
    const { status } = await this.request(
      'DELETE',
      `/instance/delete/${encodeURIComponent(instance)}`,
    );
    if (status >= 300 && status !== 404) this.fail('DELETE /instance/delete', status);
  }

  async sendText(instance: string, toPhone: string, text: string) {
    const { status, data } = await this.request(
      'POST',
      `/message/sendText/${encodeURIComponent(instance)}`,
      {
        number: toProviderNumber(toPhone),
        text,
        linkPreview: false,
      },
    );
    if (status >= 300) this.fail('POST /message/sendText', status);
    const id = (data?.key as Json | undefined)?.id;
    if (typeof id !== 'string') this.fail('POST /message/sendText', status);
    return { providerMessageId: id };
  }

  async sendPresence(instance: string, toPhone: string, durationMs: number): Promise<void> {
    // Evolution keeps "composing" for `delay` ms and only then answers.
    const { status } = await this.request(
      'POST',
      `/chat/sendPresence/${encodeURIComponent(instance)}`,
      {
        number: toProviderNumber(toPhone),
        presence: 'composing',
        delay: Math.round(durationMs),
      },
    );
    if (status >= 300) this.fail('POST /chat/sendPresence', status);
  }

  parseWebhook(body: unknown): WebhookEvent {
    return parseEvolutionWebhook(body);
  }
}
