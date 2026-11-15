import { describe, expect, it } from 'vitest';
import { AiTone } from '@boramarca/shared';
import { renderMessage, type MessageKind } from './texts';
import { at, NOW, TZ } from './fixtures';

const base = {
  now: NOW,
  timezone: TZ,
  clientFirstName: 'Fulano',
  startsAt: at('16:00'),
  serviceName: 'Corte',
};
const KINDS: MessageKind[] = [
  'booking_confirmation',
  'reschedule',
  'cancellation',
  'delay_notice',
  'reminder',
  'waitlist_offer',
  'welcome',
  'decision_answer',
  'tone_sample',
  'hold',
  'decision_expired',
];

describe('renderMessage', () => {
  it('renders every kind in every tone, with distinct tones', () => {
    for (const kind of KINDS) {
      const texts = AiTone.options.map((tone) => renderMessage(kind, tone, base));
      texts.forEach((t) => expect(t.length).toBeGreaterThan(5));
      if (kind !== 'hold') expect(new Set(texts).size).toBe(3);
    }
  });
  it('reminder asks to reply 1; hold is the fixed neutral text', () => {
    for (const tone of AiTone.options) {
      expect(renderMessage('reminder', tone, base)).toContain('Responda 1 para confirmar');
      expect(renderMessage('hold', tone, base)).toBe('Já te confirmo!');
    }
  });
  it('formats relative days and the delay', () => {
    expect(renderMessage('booking_confirmation', 'simpatico', base)).toBe(
      'Prontinho, Fulano! Seu horário está marcado para hoje às 16h (Corte). Até lá!',
    );
    expect(
      renderMessage('reminder', 'formal', { ...base, startsAt: '2026-11-15T12:00:00.000Z' }),
    ).toContain('amanhã às 9h');
    expect(renderMessage('delay_notice', 'descontraido', { ...base, delayMinutes: 15 })).toBe(
      'Oi, Fulano! Tô com uns 15 min de atraso. Seu horário de hoje às 16h fica para hoje às 16h15, beleza?',
    );
    expect(
      renderMessage('cancellation', 'formal', { ...base, startsAt: '2026-11-18T13:00:00.000Z' }),
    ).toContain('quarta, 18/11, às 10h');
  });
});
