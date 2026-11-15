// Pure scheduling rules (plan section 4): no database, no clock, no IA. Times are epoch ms (UTC).
import { zonedToUtc } from '../../lib/time';

export interface Interval {
  start: number;
  end: number;
}

export interface DayHours {
  start: string;
  end: string;
  lunchStart: string | null;
  lunchEnd: string | null;
}

/** Everything that decides availability on one calendar day of the salon timezone. */
export interface DayInput {
  date: string;
  timezone: string;
  /** null = day off. */
  workingHours: DayHours | null;
  timeOff: Interval[];
  /** Active appointments (scheduled, confirmed, in_service). */
  busy: Interval[];
}

export const SLOT_PROBLEMS = {
  OUTSIDE_WORKING_HOURS: 'Fora do horário de atendimento',
  DOES_NOT_FIT: 'O serviço não cabe antes do fim do expediente',
  DURING_LUNCH: 'Esse horário cai no almoço',
  TIME_OFF: 'Esse horário está bloqueado (folga)',
  CONFLICT: 'Já tem atendimento nesse horário',
} as const;
export type SlotProblem = keyof typeof SLOT_PROBLEMS;

const MIN = 60_000;
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

function subtract(from: Interval[], cut: Interval[]): Interval[] {
  let out = from;
  for (const c of cut) {
    out = out.flatMap((i) => {
      if (!overlaps(i, c)) return [i];
      const parts: Interval[] = [];
      if (i.start < c.start) parts.push({ start: i.start, end: c.start });
      if (c.end < i.end) parts.push({ start: c.end, end: i.end });
      return parts;
    });
  }
  return out;
}

const at = (day: DayInput, hhmm: string) => zonedToUtc(day.date, hhmm, day.timezone).getTime();

function lunch(day: DayInput): Interval | null {
  const h = day.workingHours;
  return h?.lunchStart && h.lunchEnd
    ? { start: at(day, h.lunchStart), end: at(day, h.lunchEnd) }
    : null;
}

/** Working hours minus lunch. */
export function openIntervals(day: DayInput): Interval[] {
  const h = day.workingHours;
  if (!h) return [];
  const l = lunch(day);
  return subtract([{ start: at(day, h.start), end: at(day, h.end) }], l ? [l] : []);
}

/** Open time minus time off and active appointments. */
export const freeIntervals = (day: DayInput): Interval[] =>
  subtract(openIntervals(day), [...day.timeOff, ...day.busy]);

/**
 * Start times where `durationMin` fits. Candidates are the start of each free window and the
 * `stepMin` grid (from local midnight) after it; nothing before `now`.
 */
export function computeFreeSlots(
  day: DayInput,
  durationMin: number,
  opts: { stepMin?: number; now?: number } = {},
): Interval[] {
  const step = (opts.stepMin ?? 30) * MIN;
  const dur = durationMin * MIN;
  const midnight = zonedToUtc(day.date, 0, day.timezone).getTime();
  const out: Interval[] = [];
  for (const w of freeIntervals(day)) {
    const from = Math.max(w.start, opts.now ?? -Infinity);
    let t = from;
    while (t + dur <= w.end) {
      if (t >= w.start) out.push({ start: t, end: t + dur });
      t = midnight + (Math.floor((t - midnight) / step) + 1) * step;
    }
  }
  return out;
}

/** How many more back-to-back appointments of `durationMin` fit in the day ("2 vagas"). */
export function countFittingSlots(day: DayInput, durationMin: number, now?: number): number {
  const dur = durationMin * MIN;
  return freeIntervals(day).reduce((n, w) => {
    const len = w.end - Math.max(w.start, now ?? -Infinity);
    return n + Math.max(0, Math.floor(len / dur));
  }, 0);
}

/**
 * Why `[start, end)` cannot be booked, or null when it can. A fit-in (`isFitIn`) may go outside
 * working hours and over lunch, but never over time off or another appointment.
 */
export function checkSlot(day: DayInput, slot: Interval, isFitIn = false): SlotProblem | null {
  if (!isFitIn) {
    const h = day.workingHours;
    if (!h) return 'OUTSIDE_WORKING_HOURS';
    const open = at(day, h.start);
    const close = at(day, h.end);
    if (slot.start < open || slot.start >= close) return 'OUTSIDE_WORKING_HOURS';
    if (slot.end > close) return 'DOES_NOT_FIT';
    const l = lunch(day);
    if (l && overlaps(slot, l)) return 'DURING_LUNCH';
  }
  if (day.timeOff.some((t) => overlaps(slot, t))) return 'TIME_OFF';
  if (day.busy.some((b) => overlaps(slot, b))) return 'CONFLICT';
  return null;
}
