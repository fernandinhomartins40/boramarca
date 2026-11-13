import { z } from 'zod';
import { EntityBase, Id, IsoDateTime, PhoneE164 } from './common';

export const WhatsAppProvider = z.enum(['baileys', 'cloud']);
export type WhatsAppProvider = z.infer<typeof WhatsAppProvider>;

export const WhatsAppStatus = z.enum([
  'disconnected',
  'waiting_qr',
  'connecting',
  'connected',
  'error',
]);
export type WhatsAppStatus = z.infer<typeof WhatsAppStatus>;

export const WhatsAppSession = EntityBase.extend({
  professionalId: Id,
  instanceName: z.string(),
  provider: WhatsAppProvider,
  status: WhatsAppStatus,
  phone: PhoneE164.nullable(),
});
export type WhatsAppSession = z.infer<typeof WhatsAppSession>;

// ---- POST /whatsapp/session
export const WhatsAppSessionCreate = z.object({
  /** Needed for the pairing-code flow (same phone). */
  phone: PhoneE164.optional(),
  /** The professional ticked "Entendi e quero conectar" (unofficial connection risk). */
  riskAccepted: z.literal(true),
});
export type WhatsAppSessionCreate = z.infer<typeof WhatsAppSessionCreate>;

// ---- GET /whatsapp/status (also the response of POST /whatsapp/session)
export const WhatsAppStatusResponse = z.object({
  status: WhatsAppStatus,
  phone: PhoneE164.nullable(),
  profileName: z.string().nullable(),
  profilePictureUrl: z.url().nullable(),
  /** pt-BR reason when `status = error`. */
  errorMessage: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type WhatsAppStatusResponse = z.infer<typeof WhatsAppStatusResponse>;

// ---- GET /whatsapp/qr
export const WhatsAppQrResponse = z.object({
  /** Raw string to encode as a QR code on the device. */
  qr: z.string(),
  expiresAt: IsoDateTime,
});
export type WhatsAppQrResponse = z.infer<typeof WhatsAppQrResponse>;

// ---- GET /whatsapp/pairing-code?phone=
export const WhatsAppPairingCodeQuery = z.object({ phone: PhoneE164 });
export type WhatsAppPairingCodeQuery = z.infer<typeof WhatsAppPairingCodeQuery>;
export const WhatsAppPairingCodeResponse = z.object({
  /** 8 characters, shown spaced ("ABCD-EFGH"). */
  code: z.string().length(8),
  expiresAt: IsoDateTime,
});
export type WhatsAppPairingCodeResponse = z.infer<typeof WhatsAppPairingCodeResponse>;

// ---- DELETE /whatsapp/session -> OkResponse

// ---- POST /webhooks/whatsapp/:instance (no JWT; validated by secret header)
export const WhatsAppWebhookParams = z.object({ instance: z.string().min(1) });
export type WhatsAppWebhookParams = z.infer<typeof WhatsAppWebhookParams>;
/** Raw provider payload; `packages/whatsapp` `parseWebhook` turns it into domain events. */
export const WhatsAppWebhookBody = z.unknown();
export const WHATSAPP_WEBHOOK_SECRET_HEADER = 'x-boramarca-webhook-secret';

/** Default send-guard limits (plan section 7); overridable by env vars in the API. */
export const SEND_GUARD_DEFAULTS = {
  perMinute: 8,
  perDay: 200,
  typingMinSeconds: 2,
  typingMaxSeconds: 8,
  maxChars: 500,
  maxParts: 2,
  dropQueuedAfterMinutes: 30,
} as const;
