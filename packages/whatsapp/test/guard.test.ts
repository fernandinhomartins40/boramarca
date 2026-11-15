import { describe, expect, it } from 'vitest';
import {
  SEND_GUARD_DEFAULTS,
  containsLinkShortener,
  decideOutbox,
  evaluateSend,
  partitionOutbox,
  readSendGuardConfig,
  splitText,
  typingDelayMs,
  type GuardContext,
  type SendIntent,
} from '../src';
import * as pkg from '../src';

const now = new Date('2026-01-05T14:05:00Z');
const config = { ...SEND_GUARD_DEFAULTS };

const intent = (over: Partial<SendIntent> = {}): SendIntent => ({
  instance: 'bm-1',
  toPhone: '+5511987654321',
  text: 'Tenho sábado às 9h. Pode ser?',
  purpose: 'reply',
  queuedAt: now,
  ...over,
});

const ctx = (
  over: Partial<GuardContext> = {},
  recipient: Partial<GuardContext['recipient']> = {},
): GuardContext => ({
  now,
  sessionConnected: true,
  sentLastMinute: 0,
  sentToday: 0,
  ...over,
  recipient: {
    hasInboundMessage: true,
    hasPastAppointment: false,
    waitlistOptedInAt: null,
    ...recipient,
  },
});

const rngs = [() => 0, () => 0.5, () => 0.999999];

describe('who may receive', () => {
  it('blocks a number that never wrote, never came and is not on the waitlist', () => {
    expect(evaluateSend(intent(), ctx({}, { hasInboundMessage: false }))).toEqual({
      allowed: false,
      reason: 'recipient_not_allowed',
      retryable: false,
    });
  });

  it('blocks a stranger for every purpose', () => {
    for (const purpose of ['reply', 'reminder', 'notice', 'waitlist_offer'] as const) {
      const d = evaluateSend(intent({ purpose }), ctx({}, { hasInboundMessage: false }));
      expect(d.allowed).toBe(false);
    }
  });

  it('allows who wrote first, a client with a past appointment, or an opted-in waitlist entry', () => {
    expect(evaluateSend(intent(), ctx()).allowed).toBe(true);
    expect(
      evaluateSend(intent(), ctx({}, { hasInboundMessage: false, hasPastAppointment: true }))
        .allowed,
    ).toBe(true);
    expect(
      evaluateSend(
        intent(),
        ctx({}, { hasInboundMessage: false, waitlistOptedInAt: new Date('2026-01-01') }),
      ).allowed,
    ).toBe(true);
  });

  it('waitlist offers require opt-in and one person at a time per slot', () => {
    const offer = intent({ purpose: 'waitlist_offer' });
    expect(evaluateSend(offer, ctx())).toMatchObject({ reason: 'waitlist_not_opted_in' });
    const optedIn = { waitlistOptedInAt: new Date('2026-01-01') };
    expect(
      evaluateSend(offer, ctx({}, { ...optedIn, waitlistSlotHasOtherActiveOffer: true })),
    ).toMatchObject({
      reason: 'waitlist_slot_busy',
    });
    // Unknown (undefined) is treated as busy: the caller must check.
    expect(evaluateSend(offer, ctx({}, optedIn))).toMatchObject({ reason: 'waitlist_slot_busy' });
    expect(
      evaluateSend(offer, ctx({}, { ...optedIn, waitlistSlotHasOtherActiveOffer: false })).allowed,
    ).toBe(true);
  });

  it('the package has no bulk-send function', () => {
    const names = Object.keys(pkg).join(' ');
    expect(names).not.toMatch(/bulk|broadcast|mass|massa|sendMany|sendAll/i);
  });
});

describe('rate limits per instance', () => {
  it('8 per minute', () => {
    expect(evaluateSend(intent(), ctx({ sentLastMinute: 7 })).allowed).toBe(true);
    expect(evaluateSend(intent(), ctx({ sentLastMinute: 8 }))).toEqual({
      allowed: false,
      reason: 'rate_limit_minute',
      retryable: true,
    });
  });

  it('200 per day', () => {
    expect(evaluateSend(intent(), ctx({ sentToday: 199 })).allowed).toBe(true);
    expect(evaluateSend(intent(), ctx({ sentToday: 200 }))).toMatchObject({
      reason: 'rate_limit_day',
      retryable: false,
    });
  });

  it('a 2-part message counts as 2', () => {
    const long = intent({ text: 'a'.repeat(300) + ' ' + 'b'.repeat(300) });
    expect(evaluateSend(long, ctx({ sentLastMinute: 7 }))).toMatchObject({
      reason: 'rate_limit_minute',
    });
    expect(evaluateSend(long, ctx({ sentToday: 199 }))).toMatchObject({ reason: 'rate_limit_day' });
  });
});

describe('size and splitting', () => {
  it('up to 500 chars goes as one message', () => {
    const d = evaluateSend(intent({ text: 'x'.repeat(500) }), ctx());
    expect(d.allowed && d.parts.length).toBe(1);
  });

  it('longer text becomes at most 2 messages of up to 500 chars, cut at a sentence', () => {
    const s1 = 'Primeira frase com bastante conteúdo. '.repeat(10).trim(); // 379 chars
    const s2 = 'Segunda parte do texto vem aqui. '.repeat(8).trim();
    const d = evaluateSend(intent({ text: `${s1} ${s2}` }), ctx());
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.parts).toHaveLength(2);
    for (const p of d.parts) expect(p.text.length).toBeLessThanOrEqual(500);
    expect(d.parts[0]?.text.endsWith('.')).toBe(true);
    expect(d.parts.map((p) => p.text).join(' ')).toBe(`${s1} ${s2}`);
  });

  it('prefers a paragraph break', () => {
    const parts = splitText(`${'a '.repeat(150).trim()}\n\n${'b '.repeat(150).trim()}`, 500, 2);
    expect(parts).toEqual(['a '.repeat(150).trim(), 'b '.repeat(150).trim()]);
  });

  it('cuts hard when there is no space at all', () => {
    expect(splitText('x'.repeat(700), 500, 2)?.map((p) => p.length)).toEqual([500, 200]);
  });

  it('blocks text that does not fit in 2 messages, and empty text', () => {
    expect(evaluateSend(intent({ text: 'palavra '.repeat(200) }), ctx())).toMatchObject({
      reason: 'text_too_long',
    });
    expect(evaluateSend(intent({ text: '   ' }), ctx())).toMatchObject({ reason: 'empty_text' });
  });
});

describe('typing delay', () => {
  it('stays within 2–8 s for any size and random value', () => {
    for (const len of [1, 50, 250, 499, 500]) {
      for (const rng of rngs) {
        const ms = typingDelayMs(len, config, rng);
        expect(ms).toBeGreaterThanOrEqual(2000);
        expect(ms).toBeLessThanOrEqual(8000);
      }
    }
  });

  it('grows with the text and varies with the rng', () => {
    const mid = () => 0.5;
    expect(typingDelayMs(450, config, mid)).toBeGreaterThan(typingDelayMs(50, config, mid));
    expect(typingDelayMs(250, config, () => 0)).toBeLessThan(
      typingDelayMs(250, config, () => 0.99),
    );
  });

  it('each allowed part carries its delay', () => {
    const d = evaluateSend(intent(), ctx(), config, () => 0.5);
    expect(d.allowed && d.parts[0]?.typingMs).toBe(
      typingDelayMs(intent().text.length, config, () => 0.5),
    );
  });
});

describe('links', () => {
  it.each([
    'veja bit.ly/abc',
    'https://tinyurl.com/x9',
    'link: HTTPS://Bit.Ly/x',
    'acesse cutt.ly/a',
    'www.t.co/x',
  ])('blocks shortener in "%s"', (text) => {
    expect(containsLinkShortener(text)).toBe(true);
    expect(evaluateSend(intent({ text }), ctx())).toMatchObject({ reason: 'link_shortener' });
  });

  it.each([
    'https://boramarca.com.br/agendar',
    'maps.google.com/?q=rua',
    'Rua Bit, 10',
    'habit.lyrics',
  ])('allows "%s"', (text) => {
    expect(containsLinkShortener(text)).toBe(false);
  });
});

describe('session and queue age', () => {
  it('session down blocks as retryable', () => {
    expect(evaluateSend(intent(), ctx({ sessionConnected: false }))).toEqual({
      allowed: false,
      reason: 'session_disconnected',
      retryable: true,
    });
  });

  it('messages older than 30 minutes are dropped, even with the session down', () => {
    const old = intent({ queuedAt: new Date(now.getTime() - 30 * 60_000 - 1) });
    expect(evaluateSend(old, ctx())).toMatchObject({ reason: 'stale_message', retryable: false });
    expect(evaluateSend(old, ctx({ sessionConnected: false }))).toMatchObject({
      reason: 'stale_message',
    });
    expect(
      evaluateSend(intent({ queuedAt: new Date(now.getTime() - 30 * 60_000) }), ctx()).allowed,
    ).toBe(true);
  });
});

describe('outbox rule', () => {
  const at = (minAgo: number) => ({
    queuedAt: new Date(now.getTime() - minAgo * 60_000),
    id: minAgo,
  });

  it('holds while disconnected, sends when connected, drops after 30 min', () => {
    expect(decideOutbox(at(5), { now, sessionConnected: false })).toBe('hold');
    expect(decideOutbox(at(5), { now, sessionConnected: true })).toBe('send');
    expect(decideOutbox(at(31), { now, sessionConnected: true })).toBe('drop');
    expect(decideOutbox(at(31), { now, sessionConnected: false })).toBe('drop');
  });

  it('partitions a backlog oldest first', () => {
    const p = partitionOutbox([at(1), at(45), at(10)], { now, sessionConnected: true });
    expect(p.send.map((i) => i.id)).toEqual([10, 1]);
    expect(p.drop.map((i) => i.id)).toEqual([45]);
    expect(p.hold).toEqual([]);
  });
});

describe('readSendGuardConfig', () => {
  it('defaults to SEND_GUARD_DEFAULTS', () => {
    expect(readSendGuardConfig({})).toEqual(SEND_GUARD_DEFAULTS);
    expect(readSendGuardConfig({ WA_GUARD_PER_MINUTE: '' })).toEqual(SEND_GUARD_DEFAULTS);
  });

  it('reads overrides and rejects invalid values', () => {
    expect(
      readSendGuardConfig({ WA_GUARD_PER_MINUTE: '5', WA_GUARD_PER_DAY: '100' }),
    ).toMatchObject({
      perMinute: 5,
      perDay: 100,
    });
    expect(() => readSendGuardConfig({ WA_GUARD_PER_MINUTE: 'abc' })).toThrow();
    expect(() => readSendGuardConfig({ WA_GUARD_PER_MINUTE: '0' })).toThrow();
    expect(() => readSendGuardConfig({ WA_GUARD_TYPING_MIN_SECONDS: '9' })).toThrow();
  });
});
