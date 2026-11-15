import type { WorkingHours } from '@boramarca/shared';

/** Pure date/number helpers for the owner panel. Dates are `YYYY-MM-DD` in the salon timezone. */

const parts = (d: Date, tz: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );

/** Today's date in the salon timezone. */
export function todayIn(tz: string, now = new Date()): string {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:mm" of an ISO instant in the salon timezone. */
export function timeIn(iso: string, tz: string): string {
  const p = parts(new Date(iso), tz);
  return `${p.hour}:${p.minute}`;
}

/** "HH:mm" → minutes since midnight. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** Minutes since midnight of an ISO instant in the salon timezone. */
export const minutesIn = (iso: string, tz: string) => toMinutes(timeIn(iso, tz));

const utc = (date: string) => new Date(`${date}T12:00:00Z`);

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export const weekdayOf = (date: string) => utc(date).getUTCDay();

/** The Monday-to-Sunday week that contains `date`. */
export function weekDates(date: string): string[] {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Terça, 10 nov" */
export function dayLabel(date: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).formatToParts(utc(date));
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  const weekday = cap(get('weekday').replace('-feira', ''));
  return `${weekday}, ${get('day')} ${get('month').replace('.', '')}`;
}

/** "15 de jan. de 2025" */
export const longDate = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'medium' }).format(new Date(iso));

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export const WEEKDAY_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;
/** Weekdays in the order the panel shows them (Monday first). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** "YYYY-MM" of `date`, then the `n - 1` months before it, oldest first. */
export function monthsBack(month: string, n: number): string[] {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y!, m! - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
/** "2026-11" → "Nov/26" */
export const monthShort = (month: string) =>
  `${cap(MONTHS[Number(month.slice(5)) - 1]!)}/${month.slice(2, 4)}`;
/** "2026-11" → "Novembro 2026" */
export const monthLong = (month: string) =>
  `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/\s/g, ' ');

export const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** "+5511988776655" → "(11) 98877-6655"; other numbers stay as they are. */
export function formatPhone(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** "Seg – Sex · 09:00 – 19:00" for the team list (hours of the first working day). */
export function weekSummary(hours: Pick<WorkingHours, 'weekday' | 'start' | 'end'>[]): string {
  if (!hours.length) return 'Sem horário definido';
  const days = WEEK_ORDER.filter((d) => hours.some((h) => h.weekday === d));
  const idx = days.map((d) => WEEK_ORDER.indexOf(d));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  const label =
    days.length === 1
      ? WEEKDAY_SHORT[days[0]!]
      : contiguous
        ? `${WEEKDAY_SHORT[days[0]!]} – ${WEEKDAY_SHORT[days.at(-1)!]}`
        : days.map((d) => WEEKDAY_SHORT[d]).join(', ');
  const first = hours.find((h) => h.weekday === days[0])!;
  return `${label} · ${first.start} – ${first.end}`;
}
