import { z } from 'zod';
import type { WhatsAppStatus } from '@boramarca/shared';
import { jidToE164 } from './phone';
import type { IgnoredReason, InboundKind, WebhookEvent } from './types';

// Evolution API v2.3.7 webhook body: { event, instance, data, destination, date_time, sender, server_url, apikey }.
const Envelope = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.unknown(),
  date_time: z.string().optional(),
});

const UpsertData = z.object({
  key: z.object({
    remoteJid: z.string(),
    remoteJidAlt: z.string().nullish(),
    fromMe: z.boolean(),
    id: z.string(),
  }),
  pushName: z.string().nullish(),
  message: z.record(z.string(), z.unknown()).nullish(),
  messageType: z.string().nullish(),
  messageTimestamp: z.coerce.number(),
});

const ConnectionData = z.object({
  state: z.string(),
  statusReason: z.coerce.number().nullish(),
  wuid: z.string().nullish(),
  profileName: z.string().nullish(),
  profilePictureUrl: z.string().nullish(),
});

const QrData = z.object({
  qrcode: z.object({ code: z.string().nullish(), pairingCode: z.string().nullish() }).optional(),
});

const MediaFields = z.object({
  url: z.string().nullish(),
  mimetype: z.string().nullish(),
  seconds: z.coerce.number().nullish(),
  caption: z.string().nullish(),
});

const KIND_BY_TYPE: Record<string, InboundKind> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  audioMessage: 'audio',
  imageMessage: 'image',
  videoMessage: 'video',
  documentMessage: 'document',
  stickerMessage: 'sticker',
};

/** Evolution/Baileys connection state -> product status. */
export function mapEvolutionState(state: string | null | undefined): WhatsAppStatus {
  switch (state) {
    case 'open':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'refused':
      return 'error';
    default:
      return 'disconnected';
  }
}

const isoOr = (value: string | undefined): string => {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/** Turns a raw Evolution webhook body (untrusted) into a domain event. Never throws. */
export function parseEvolutionWebhook(body: unknown): WebhookEvent {
  const env = Envelope.safeParse(body);
  if (!env.success) return { type: 'ignored', instance: null, event: null };
  const { event, instance, data, date_time } = env.data;
  const ignored: WebhookEvent = { type: 'ignored', instance, event };

  if (event === 'connection.update') {
    const d = ConnectionData.safeParse(data);
    if (!d.success) return ignored;
    const status = mapEvolutionState(d.data.state);
    return {
      type: 'connection',
      instance,
      status,
      phone: status === 'connected' ? jidToE164(d.data.wuid) : null,
      profileName: d.data.profileName ?? null,
      profilePictureUrl: d.data.profilePictureUrl ?? null,
      reasonCode: d.data.statusReason ?? null,
      timestamp: isoOr(date_time),
    };
  }

  if (event === 'qrcode.updated') {
    const d = QrData.safeParse(data);
    if (!d.success) return ignored;
    return {
      type: 'qr',
      instance,
      qr: d.data.qrcode?.code ?? null,
      pairingCode: d.data.qrcode?.pairingCode ?? null,
      timestamp: isoOr(date_time),
    };
  }

  if (event !== 'messages.upsert') return ignored;
  const d = UpsertData.safeParse(data);
  if (!d.success) return ignored;
  const { key, message, messageType, pushName, messageTimestamp } = d.data;

  const type = messageType ?? Object.keys(message ?? {})[0] ?? '';
  const kind = KIND_BY_TYPE[type] ?? 'other';
  const content = MediaFields.safeParse(message?.[type]);
  const media = content.success ? content.data : {};
  const conversation = typeof message?.conversation === 'string' ? message.conversation : null;
  const base64 = typeof message?.base64 === 'string' ? message.base64 : null;

  // LID-addressed chats carry the phone JID in remoteJidAlt.
  const fromPhone = jidToE164(key.remoteJid) ?? jidToE164(key.remoteJidAlt);
  const text = kind === 'text' ? conversation : (media.caption ?? null);

  let reason: IgnoredReason | null = null;
  if (key.remoteJid.endsWith('@broadcast')) reason = 'status';
  else if (key.remoteJid.endsWith('@g.us')) reason = 'group';
  else if (key.fromMe) reason = 'fromMe';
  else if (!fromPhone) reason = 'unknown_sender';
  else if (kind !== 'text' && kind !== 'audio') reason = 'unsupported';
  else if (kind === 'text' && !text?.trim()) reason = 'unsupported';

  return {
    type: 'message',
    instance,
    kind,
    providerMessageId: key.id,
    fromPhone,
    pushName: pushName ?? null,
    text,
    audio:
      kind === 'audio'
        ? {
            url: media.url ?? null,
            base64,
            mimetype: media.mimetype ?? null,
            seconds: media.seconds ?? null,
          }
        : null,
    timestamp: new Date(messageTimestamp * 1000).toISOString(),
    ignored: reason !== null,
    ignoredReason: reason,
  };
}
