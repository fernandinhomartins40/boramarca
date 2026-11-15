import type { WorkingHours, WorkingHoursCreate } from '@boramarca/shared';
import { WorkingHoursReplaceBody } from '@boramarca/shared';

/** "R$ 150,00" (or "R$ 150" with `short` when there are no cents). */
export function formatPrice(cents: number, short = false): string {
  const reais = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cc = (cents % 100).toString().padStart(2, '0');
  return short && cc === '00' ? `R$ ${reais}` : `R$ ${reais},${cc}`;
}

/** "150", "150,50", "R$ 1.500,00" → cents. `null` when it is not a price. */
export function parsePrice(text: string): number | null {
  const clean = text.replace(/R\$|\s|\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** 50 → "50 min", 60 → "1h", 90 → "1h30". */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

/** Typing mask for clock times: "0930" → "09:30". */
export function maskTime(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

/** 0 = Sunday ... 6 = Saturday (Date#getDay), as in the shared `Weekday`. */
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
/** Monday first, the order people read a work week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** The quick sign-up and Ajustes edit one schedule for all chosen days. */
export interface Week {
  days: number[];
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
}

export const DEFAULT_WEEK: Week = {
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '19:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
};

export function weekToWorkingHours(w: Week): WorkingHoursCreate[] {
  const hasLunch = !!(w.lunchStart || w.lunchEnd);
  return [...w.days]
    .sort((a, b) => a - b)
    .map((weekday) => ({
      weekday,
      start: w.start,
      end: w.end,
      lunchStart: hasLunch ? w.lunchStart : null,
      lunchEnd: hasLunch ? w.lunchEnd : null,
    }));
}

/** First problem with the week, in pt-BR, or null when it can be saved. */
export function validateWeek(w: Week): string | null {
  if (w.days.length === 0) return 'Escolha pelo menos um dia.';
  const parsed = WorkingHoursReplaceBody.safeParse({ items: weekToWorkingHours(w) });
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Confira os horários.');
}

// shortcut: one schedule for every day (what the sign-up and reference 11 show). A week with
// different hours per day is shown and saved with the first day's hours; upgrade to a per-day
// editor when someone needs it.
export function workingHoursToWeek(list: WorkingHours[]): Week {
  const first = list[0];
  if (!first) return { ...DEFAULT_WEEK, days: [] };
  return {
    days: list.map((w) => w.weekday),
    start: first.start,
    end: first.end,
    lunchStart: first.lunchStart ?? '',
    lunchEnd: first.lunchEnd ?? '',
  };
}

const hour = (hhmm: string) => (hhmm.endsWith(':00') ? `${hhmm.slice(0, 2)}h` : hhmm);

/** "Seg a Sex, das 09h às 19h" + "Almoço das 12h às 13h". */
export function describeWeek(w: Week): { days: string; lunch: string | null } {
  if (w.days.length === 0) return { days: 'Nenhum dia de atendimento', lunch: null };
  const ordered = WEEK_ORDER.filter((d) => w.days.includes(d));
  const idx = ordered.map((d) => WEEK_ORDER.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === (idx[i - 1] ?? 0) + 1);
  const names = ordered.map((d) => WEEKDAY_SHORT[d]);
  const days =
    consecutive && names.length > 2 ? `${names[0]} a ${names[names.length - 1]}` : names.join(', ');
  return {
    days: `${days}, das ${hour(w.start)} às ${hour(w.end)}`,
    lunch:
      w.lunchStart && w.lunchEnd ? `Almoço das ${hour(w.lunchStart)} às ${hour(w.lunchEnd)}` : null,
  };
}

/** pt-BR message of any error thrown by the data layer. */
export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente de novo.';
}
