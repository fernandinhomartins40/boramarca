import { z } from 'zod';
import { SEND_GUARD_DEFAULTS } from '@boramarca/shared';

export type SendGuardConfig = { -readonly [K in keyof typeof SEND_GUARD_DEFAULTS]: number };

const int = (def: number) => z.coerce.number().int().positive().default(def);

/** Env vars that override `SEND_GUARD_DEFAULTS` (plan section 7). */
const GuardEnv = z
  .object({
    WA_GUARD_PER_MINUTE: int(SEND_GUARD_DEFAULTS.perMinute),
    WA_GUARD_PER_DAY: int(SEND_GUARD_DEFAULTS.perDay),
    WA_GUARD_TYPING_MIN_SECONDS: int(SEND_GUARD_DEFAULTS.typingMinSeconds),
    WA_GUARD_TYPING_MAX_SECONDS: int(SEND_GUARD_DEFAULTS.typingMaxSeconds),
    WA_GUARD_MAX_CHARS: int(SEND_GUARD_DEFAULTS.maxChars),
    WA_GUARD_MAX_PARTS: int(SEND_GUARD_DEFAULTS.maxParts),
    WA_GUARD_DROP_QUEUED_AFTER_MINUTES: int(SEND_GUARD_DEFAULTS.dropQueuedAfterMinutes),
  })
  .refine((e) => e.WA_GUARD_TYPING_MIN_SECONDS <= e.WA_GUARD_TYPING_MAX_SECONDS, {
    message: 'WA_GUARD_TYPING_MIN_SECONDS deve ser <= WA_GUARD_TYPING_MAX_SECONDS',
  });

/** Reads the guard config from env (empty strings count as unset). Throws on invalid values. */
export function readSendGuardConfig(
  env: Record<string, string | undefined> = process.env,
): SendGuardConfig {
  const clean = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const e = GuardEnv.parse(clean);
  return {
    perMinute: e.WA_GUARD_PER_MINUTE,
    perDay: e.WA_GUARD_PER_DAY,
    typingMinSeconds: e.WA_GUARD_TYPING_MIN_SECONDS,
    typingMaxSeconds: e.WA_GUARD_TYPING_MAX_SECONDS,
    maxChars: e.WA_GUARD_MAX_CHARS,
    maxParts: e.WA_GUARD_MAX_PARTS,
    dropQueuedAfterMinutes: e.WA_GUARD_DROP_QUEUED_AFTER_MINUTES,
  };
}

/** What the message is for. Waitlist offers have stricter rules (plan section 8). */
export type SendPurpose = 'reply' | 'reminder' | 'notice' | 'waitlist_offer';

export interface SendIntent {
  instance: string;
  /** E.164. */
  toPhone: string;
  text: string;
  purpose: SendPurpose;
  /** When the message was produced (enqueued). Older than the limit is dropped. */
  queuedAt: Date;
}

/** Facts about the recipient, read from the database by the API (never from the caller's say-so). */
export interface RecipientFacts {
  /** The person has sent at least one message to this number ("escreveu primeiro"). */
  hasInboundMessage: boolean;
  /** Client with a past (attended) appointment with this professional. */
  hasPastAppointment: boolean;
  /** `waitlist_entries.opted_in_at` of an active entry, or null. */
  waitlistOptedInAt: Date | null;
  /** For `waitlist_offer`: another person already holds an active offer for this slot. */
  waitlistSlotHasOtherActiveOffer?: boolean;
}

export interface GuardContext {
  now: Date;
  sessionConnected: boolean;
  recipient: RecipientFacts;
  /** Messages already sent by this instance in the current minute / day. */
  sentLastMinute: number;
  sentToday: number;
}

export type BlockReason =
  | 'empty_text'
  | 'text_too_long'
  | 'recipient_not_allowed'
  | 'waitlist_not_opted_in'
  | 'waitlist_slot_busy'
  | 'stale_message'
  | 'session_disconnected'
  | 'link_shortener'
  | 'rate_limit_minute'
  | 'rate_limit_day';

/** Blocks that can succeed later (the outbox may hold and retry). */
export const RETRYABLE_REASONS: ReadonlySet<BlockReason> = new Set([
  'session_disconnected',
  'rate_limit_minute',
]);

export interface SendPart {
  text: string;
  /** How long to show "digitando..." before this part. */
  typingMs: number;
}

export type GuardDecision =
  | { allowed: true; parts: SendPart[] }
  | { allowed: false; reason: BlockReason; retryable: boolean };

/** Shortener hosts (bit.ly, tinyurl and similar). */
export const LINK_SHORTENERS = [
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'v.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
  'short.io',
  'tiny.cc',
  'rb.gy',
  't.ly',
  'bl.ink',
  's.id',
  'lnkd.in',
  'shorte.st',
  'adf.ly',
  'encurtador.com.br',
  'encurta.net',
  'l.ead.me',
];

const hostRe = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;

export function containsLinkShortener(text: string): boolean {
  for (const m of text.matchAll(hostRe)) {
    const host = m[0]
      .replace(/^https?:\/\//i, '')
      .toLowerCase()
      .replace(/^www\./, '');
    if (LINK_SHORTENERS.some((s) => host === s || host.endsWith(`.${s}`))) return true;
  }
  return false;
}

/**
 * Splits at the last paragraph break, sentence end or space before `maxChars`.
 * Returns null when the text does not fit in `maxParts` parts.
 */
export function splitText(text: string, maxChars: number, maxParts: number): string[] | null {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    if (parts.length === maxParts - 1) return null;
    const window = rest.slice(0, maxChars + 1);
    const candidates = [
      window.lastIndexOf('\n\n'),
      Math.max(...['. ', '! ', '? ', '.\n', '!\n', '?\n'].map((p) => window.lastIndexOf(p))) + 1,
      window.search(/\s\S*$/),
    ];
    const at = candidates.find((i) => i > maxChars / 2) ?? maxChars;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.length > maxParts ? null : parts;
}

/** 2–8 s, proportional to the part length, with ±1 s random variation (rng in [0, 1)). */
export function typingDelayMs(length: number, config: SendGuardConfig, rng: () => number): number {
  const min = config.typingMinSeconds * 1000;
  const max = config.typingMaxSeconds * 1000;
  const base = min + (max - min) * Math.min(1, length / config.maxChars);
  const jitter = (rng() * 2 - 1) * 1000;
  return Math.round(Math.min(max, Math.max(min, base + jitter)));
}

const block = (reason: BlockReason): GuardDecision => ({
  allowed: false,
  reason,
  retryable: RETRYABLE_REASONS.has(reason),
});

/**
 * The send guard (plan section 7). Pure: same input, same decision. Every outbound WhatsApp
 * message goes through it via `createSender`; there is no bulk-send function anywhere.
 */
export function evaluateSend(
  intent: SendIntent,
  ctx: GuardContext,
  config: SendGuardConfig = { ...SEND_GUARD_DEFAULTS },
  rng: () => number = Math.random,
): GuardDecision {
  const text = intent.text.trim();
  if (!text) return block('empty_text');
  const chunks = splitText(text, config.maxChars, config.maxParts);
  if (!chunks) return block('text_too_long');

  const r = ctx.recipient;
  if (intent.purpose === 'waitlist_offer') {
    // Offers go only to who asked, one person at a time per slot.
    if (!r.waitlistOptedInAt) return block('waitlist_not_opted_in');
    if (r.waitlistSlotHasOtherActiveOffer !== false) return block('waitlist_slot_busy');
  } else if (!r.hasInboundMessage && !r.hasPastAppointment && !r.waitlistOptedInAt) {
    return block('recipient_not_allowed');
  }

  const ageMs = ctx.now.getTime() - intent.queuedAt.getTime();
  if (ageMs > config.dropQueuedAfterMinutes * 60_000) return block('stale_message');
  if (!ctx.sessionConnected) return block('session_disconnected');
  if (containsLinkShortener(text)) return block('link_shortener');
  if (ctx.sentToday + chunks.length > config.perDay) return block('rate_limit_day');
  if (ctx.sentLastMinute + chunks.length > config.perMinute) return block('rate_limit_minute');

  return {
    allowed: true,
    parts: chunks.map((t) => ({ text: t, typingMs: typingDelayMs(t.length, config, rng) })),
  };
}
