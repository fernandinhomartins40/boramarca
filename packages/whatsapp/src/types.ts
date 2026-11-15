import type {
  WhatsAppPairingCodeResponse,
  WhatsAppQrResponse,
  WhatsAppStatus,
} from '@boramarca/shared';

/** Why an inbound webhook message is not handled by the product (plan section 5, step 1). */
export type IgnoredReason = 'group' | 'status' | 'fromMe' | 'unsupported' | 'unknown_sender';

export type InboundKind = 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'other';

export interface InboundAudio {
  /** Encrypted WhatsApp CDN url (needs the media key); prefer `base64` when present. */
  url: string | null;
  /** Decrypted file, sent by Evolution when the webhook has `base64: true`. */
  base64: string | null;
  mimetype: string | null;
  seconds: number | null;
}

export interface InboundMessageEvent {
  type: 'message';
  instance: string;
  kind: InboundKind;
  providerMessageId: string;
  /** E.164; null when the sender cannot be resolved to a phone (e.g. group, status, LID only). */
  fromPhone: string | null;
  pushName: string | null;
  text: string | null;
  audio: InboundAudio | null;
  /** ISO-8601 UTC. */
  timestamp: string;
  ignored: boolean;
  ignoredReason: IgnoredReason | null;
}

export interface ConnectionEvent {
  type: 'connection';
  instance: string;
  status: WhatsAppStatus;
  /** E.164 of the connected number (only on `connected`). */
  phone: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
  /** Provider reason code (e.g. 401 = logged out on the phone). */
  reasonCode: number | null;
  timestamp: string;
}

export interface QrEvent {
  type: 'qr';
  instance: string;
  /** Null when the QR limit was reached (the session must be restarted). */
  qr: string | null;
  pairingCode: string | null;
  timestamp: string;
}

/** Any webhook we do not act on (other events, malformed bodies). */
export interface IgnoredEvent {
  type: 'ignored';
  instance: string | null;
  event: string | null;
}

export type WebhookEvent = InboundMessageEvent | ConnectionEvent | QrEvent | IgnoredEvent;

export interface GatewayStatus {
  status: WhatsAppStatus;
  phone: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
}

export interface CreateSessionOptions {
  /** Where the provider posts webhooks for this instance. */
  webhookUrl: string;
  /** Sent back in the `x-boramarca-webhook-secret` header on every webhook. */
  webhookSecret: string;
}

/**
 * The only door in and out of WhatsApp. `sendText`/`sendPresence` exist for the sender
 * (`createSender`) only: application code must never call them directly (plan section 1, rule 3).
 * There is deliberately no bulk/broadcast method.
 */
export interface WhatsAppGateway {
  /** Creates the instance with the webhook configured; idempotent (reconfigures the webhook if it exists). */
  createSession(instance: string, options: CreateSessionOptions): Promise<void>;
  getQrCode(instance: string): Promise<WhatsAppQrResponse>;
  /** `phone` in E.164; the code is typed on the same phone ("Conectar com número"). */
  getPairingCode(instance: string, phone: string): Promise<WhatsAppPairingCodeResponse>;
  getStatus(instance: string): Promise<GatewayStatus>;
  /** Logs the number out; the instance stays and can pair again. */
  disconnect(instance: string): Promise<void>;
  /** Removes the instance and its stored session (account deletion). */
  deleteInstance(instance: string): Promise<void>;
  sendText(instance: string, toPhone: string, text: string): Promise<{ providerMessageId: string }>;
  /** Shows "digitando..." for `durationMs` and resolves when it is over. */
  sendPresence(instance: string, toPhone: string, durationMs: number): Promise<void>;
  parseWebhook(body: unknown): WebhookEvent;
}

export class WhatsAppGatewayError extends Error {
  constructor(
    message: string,
    readonly code:
      'not_found' | 'not_connected' | 'pairing_unavailable' | 'provider_error' | 'network_error',
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'WhatsAppGatewayError';
  }
}
