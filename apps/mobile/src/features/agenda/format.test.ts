import { dayPhrase, dayTitle, formatPhone, money, spokenTime, toE164 } from './format';
import { bookingMessage } from './messages';
import { atMinute } from '@/utils/agenda';

// salon time (America/Sao_Paulo), whatever the machine's timezone
const now = new Date(atMinute('2026-11-10', 14 * 60 + 48));

it('formats days, times, money and phones in pt-BR', () => {
  expect(dayTitle('2026-11-10', now)).toBe('Hoje, terça, 10 de novembro');
  expect(dayTitle('2026-11-12', now)).toBe('Quinta, 12 de novembro');
  expect(dayPhrase(atMinute('2026-11-11', 9 * 60), now)).toBe('amanhã');
  expect(spokenTime(atMinute('2026-11-10', 16 * 60))).toBe('16h');
  expect(spokenTime(atMinute('2026-11-10', 16 * 60 + 30))).toBe('16h30');
  expect(money(120000)).toBe('R$ 1.200');
  expect(money(7250)).toBe('R$ 72,50');
  expect(formatPhone('+5511988776655')).toBe('(11) 98877-6655');
  expect(toE164('(11) 91234-5678')).toBe('+5511912345678');
  expect(toE164('1234')).toBeNull();
});

it('booking message says what, when and to whom', () => {
  const at = atMinute('2026-11-10', 16 * 60);
  expect(bookingMessage('Beatriz Lima', 'sessão de fisioterapia', at, now)).toBe(
    'Olá, Beatriz! Seu agendamento de sessão de fisioterapia está confirmado para hoje, às 16h.',
  );
});
