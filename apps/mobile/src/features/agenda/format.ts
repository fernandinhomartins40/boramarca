import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { DateOnly } from '@boramarca/shared';

/** pt-BR labels of the agenda screens. All take `now` so tests are deterministic. */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const parseDate = (date: DateOnly) => new Date(`${date}T12:00:00`);
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Hoje, terça, 10 de novembro" · "Amanhã, ..." · "Quinta, 12 de novembro". */
export function dayTitle(date: DateOnly, now: Date): string {
  const d = parseDate(date);
  const long = format(d, "EEEE, d 'de' MMMM", { locale: ptBR }).replace('-feira', '');
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return `Hoje, ${long}`;
  if (diff === 1) return `Amanhã, ${long}`;
  if (diff === -1) return `Ontem, ${long}`;
  return cap(long);
}

export const shiftDate = (date: DateOnly, days: number): DateOnly =>
  format(addDays(parseDate(date), days), 'yyyy-MM-dd');

/** "14:00". */
export const clock = (iso: string) => format(new Date(iso), 'HH:mm');

/** "16h" / "16h30" (messages to clients). */
export function spokenTime(iso: string): string {
  const d = new Date(iso);
  return d.getMinutes() ? format(d, "H'h'mm") : format(d, "H'h'");
}

/** "hoje" · "amanhã" · "quinta, 14/11". */
export function dayPhrase(iso: string, now: Date): string {
  const d = new Date(iso);
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return format(d, 'EEEE, dd/MM', { locale: ptBR }).replace('-feira', '');
}

/** "R$ 1.200" · "R$ 150" · "R$ 72,50". */
export function money(cents: number): string {
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = cents % 100;
  return `R$ ${whole}${rest ? `,${String(rest).padStart(2, '0')}` : ''}`;
}

/** "há 18 dias" · "hoje" · "ontem". */
export function daysAgo(iso: string, now: Date): string {
  const n = differenceInCalendarDays(now, new Date(iso));
  if (n <= 0) return 'hoje';
  if (n === 1) return 'ontem';
  return `há ${n} dias`;
}

/** "+5511988776655" → "(11) 98877-6655". */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

/** What the person typed → E.164 (Brazil by default), or null when it isn't a phone. */
export function toE164(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `+${d}`;
  return null;
}

/** Link that opens the WhatsApp chat with the client (wa.me works on both platforms). */
export const whatsappUrl = (e164: string) => `https://wa.me/${e164.replace(/\D/g, '')}`;

/** "1 atendimento" / "8 atendimentos". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
