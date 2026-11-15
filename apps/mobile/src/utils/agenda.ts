import { format } from 'date-fns';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type AgendaResponse,
  type AppointmentStatus,
  type AppointmentView,
  type DateOnly,
  type WorkingHours,
} from '@boramarca/shared';

/**
 * Agenda rules (prompt 04): no overlap, inside working hours, outside lunch, a slot is free only if
 * the total duration of the chosen services fits. Plus the timeline and "Agora / Próximo" of the
 * Agenda do dia (prompt 03). Pure functions over minutes of the day, in the device timezone (the
 * same convention as the mock; the API works in the salon timezone). Tests: agenda.test.ts.
 */

/** [start, end) in minutes since midnight. */
export interface Interval {
  start: number;
  end: number;
}

export type DayHours = Pick<WorkingHours, 'start' | 'end' | 'lunchStart' | 'lunchEnd'>;

export interface DayRules {
  /** null = day off. */
  hours: DayHours | null;
  /** Appointments and time off that hold time. */
  busy: Interval[];
}

export type BookingProblem = 'closed' | 'outside_hours' | 'lunch' | 'overlap';

/** Statuses that hold their time: the active ones plus `done` (that time was used). */
const HOLDS_TIME: readonly AppointmentStatus[] = [...ACTIVE_APPOINTMENT_STATUSES, 'done'];
const ACTIVE: readonly AppointmentStatus[] = ACTIVE_APPOINTMENT_STATUSES;

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function minuteOfDay(at: string | Date): number {
  const d = typeof at === 'string' ? new Date(at) : at;
  return d.getHours() * 60 + d.getMinutes();
}

export const dateOnly = (at: string | Date): DateOnly =>
  format(typeof at === 'string' ? new Date(at) : at, 'yyyy-MM-dd');

/** ISO instant for minute `m` of `date` (device timezone). */
export function atMinute(date: DateOnly, m: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y!, mo! - 1, d!, Math.floor(m / 60), m % 60).toISOString();
}

/** "14:00". */
export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const totalDuration = (services: readonly { durationMin: number }[]) =>
  services.reduce((sum, s) => sum + s.durationMin, 0);

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Time held on `date` by appointments (cancelled/no-show free their slot). */
export function busyIntervals(
  appointments: readonly AppointmentView[],
  date: DateOnly,
  ignoreId?: string,
): Interval[] {
  return appointments
    .filter(
      (a) => a.id !== ignoreId && HOLDS_TIME.includes(a.status) && dateOnly(a.startsAt) === date,
    )
    .map((a) => ({ start: minuteOfDay(a.startsAt), end: minuteOfDay(a.endsAt) || 24 * 60 }));
}

/** Why `[start, start + duration)` can't be booked, or null when it can. */
export function checkBooking(
  day: DayRules,
  start: number,
  duration: number,
): BookingProblem | null {
  const { hours } = day;
  if (!hours) return 'closed';
  const slot = { start, end: start + duration };
  if (start < toMinutes(hours.start) || slot.end > toMinutes(hours.end)) return 'outside_hours';
  if (
    hours.lunchStart &&
    hours.lunchEnd &&
    overlaps(slot, { start: toMinutes(hours.lunchStart), end: toMinutes(hours.lunchEnd) })
  )
    return 'lunch';
  if (day.busy.some((b) => overlaps(slot, b))) return 'overlap';
  return null;
}

export const BOOKING_PROBLEM_TEXT: Record<BookingProblem, string> = {
  closed: 'Você não atende nesse dia',
  outside_hours: 'Fica fora do seu horário de atendimento',
  lunch: 'Bate com o seu almoço',
  overlap: 'Já tem cliente nesse horário',
};

/** Starts (every `step` min) where the whole `duration` fits. */
export function freeStarts(day: DayRules, duration: number, step = 10): number[] {
  if (!day.hours || duration <= 0) return [];
  const out: number[] = [];
  for (let s = toMinutes(day.hours.start); s + duration <= toMinutes(day.hours.end); s += step) {
    if (!checkBooking(day, s, duration)) out.push(s);
  }
  return out;
}

/** How many `slotMin` slots still fit, packed from the start of each gap ("2 vagas"). */
export function countFreeSlots(day: DayRules, slotMin: number): number {
  let count = 0;
  let last = -Infinity;
  for (const s of freeStarts(day, slotMin)) {
    if (s >= last + slotMin) {
      count++;
      last = s;
    }
  }
  return count;
}

// ---- Agenda do dia (prompt 03)

export interface NowAndNext {
  current: AppointmentView | null;
  /** 0..1 of the current service. */
  progress: number | null;
  next: AppointmentView | null;
  /** Whole minutes until `next` starts. */
  minutesToNext: number | null;
}

/** Who is being served now and who comes next (`appointments` of today). */
export function nowAndNext(appointments: readonly AppointmentView[], now: Date): NowAndNext {
  const t = now.getTime();
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current =
    sorted.find((a) => a.status === 'in_service') ??
    sorted.find(
      (a) => ACTIVE.includes(a.status) && Date.parse(a.startsAt) <= t && t < Date.parse(a.endsAt),
    ) ??
    null;
  const next =
    sorted.find(
      (a) =>
        a !== current &&
        (a.status === 'scheduled' || a.status === 'confirmed') &&
        Date.parse(a.startsAt) > t,
    ) ?? null;
  const progress = current
    ? Math.min(
        1,
        Math.max(
          0,
          (t - Date.parse(current.startsAt)) /
            (Date.parse(current.endsAt) - Date.parse(current.startsAt)),
        ),
      )
    : null;
  return {
    current,
    progress,
    next,
    minutesToNext: next ? Math.ceil((Date.parse(next.startsAt) - t) / 60_000) : null,
  };
}

/** "em 12 min", "em 1h", "em 2h10". */
export function relativeIn(minutes: number): string {
  if (minutes < 60) return `em ${Math.max(0, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `em ${h}h${String(m).padStart(2, '0')}` : `em ${h}h`;
}

export type TimelineRow =
  | { kind: 'appointment'; key: string; start: number; appointment: AppointmentView; past: boolean }
  /** Cancelled recently: "Carlos · Cancelou há 3 min" (recém-vagou). */
  | { kind: 'freed'; key: string; start: number; appointment: AppointmentView; minutesAgo: number }
  | { kind: 'free'; key: string; start: number }
  | { kind: 'lunch'; key: string; start: number; end: number }
  | { kind: 'now'; key: string; start: number };

/** A cancellation counts as "recém-vagou" for this long. */
export const FREED_WINDOW_MIN = 60;

/**
 * Rows of the day timeline: appointments (cancelled ones only while recent), free slots on a grid
 * (every hour, or 30 min for short services), lunch and the "agora" line (today only).
 */
export function buildTimeline(day: AgendaResponse, now: Date, slotMin: number): TimelineRow[] {
  const today = dateOnly(now);
  const isToday = day.date === today;
  const isPast = day.date < today;
  const nowMin = minuteOfDay(now);
  const rows: TimelineRow[] = [];
  const freedStarts = new Set<number>();

  for (const a of day.appointments) {
    const start = minuteOfDay(a.startsAt);
    if (a.status === 'cancelled') {
      const ago = Math.floor((now.getTime() - Date.parse(a.updatedAt)) / 60_000);
      const upcoming = isToday ? start > nowMin : !isPast;
      if (upcoming && ago >= 0 && ago <= FREED_WINDOW_MIN) {
        rows.push({ kind: 'freed', key: a.id, start, appointment: a, minutesAgo: ago });
        freedStarts.add(start);
      }
      continue;
    }
    const past = isPast || (isToday && Date.parse(a.endsAt) <= now.getTime());
    rows.push({ kind: 'appointment', key: a.id, start, appointment: a, past });
  }

  const hours = day.workingHours;
  if (hours) {
    const rules: DayRules = { hours, busy: busyIntervals(day.appointments, day.date) };
    const step = slotMin <= 30 ? 30 : 60;
    const first = Math.ceil(toMinutes(hours.start) / step) * step;
    for (let s = first; s + slotMin <= toMinutes(hours.end); s += step) {
      if (isPast || (isToday && s < nowMin) || freedStarts.has(s)) continue;
      if (!checkBooking(rules, s, slotMin)) rows.push({ kind: 'free', key: `free-${s}`, start: s });
    }
    if (hours.lunchStart && hours.lunchEnd) {
      const start = toMinutes(hours.lunchStart);
      rows.push({ kind: 'lunch', key: 'lunch', start, end: toMinutes(hours.lunchEnd) });
    }
  }

  rows.sort((a, b) => a.start - b.start);
  if (isToday) {
    const at = rows.findIndex((r) => r.start > nowMin);
    rows.splice(at === -1 ? rows.length : at, 0, { kind: 'now', key: 'now', start: nowMin });
  }
  return rows;
}
