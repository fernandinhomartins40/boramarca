// Timezone helpers on top of Intl (no extra dependency). Dates are stored in UTC; calendar dates
// (`YYYY-MM-DD`) and clock times (`HH:mm`) are in the salon timezone.

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Offset of `tz` at instant `ms`, in minutes (e.g. -180 for America/Sao_Paulo). */
export function tzOffsetMinutes(ms: number, tz: string): number {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
    offsetFormatters.set(tz, f);
  }
  const name = f.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0; // "GMT" alone means UTC
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Local wall time (`date` + `HH:mm`, minutes may exceed 24h for "next midnight") to a UTC Date. */
export function zonedToUtc(date: string, time: string | number, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const minutes = typeof time === 'number' ? time : toMinutes(time);
  const guess = Date.UTC(y, mo - 1, d, 0, minutes);
  let ms = guess - tzOffsetMinutes(guess, tz) * 60_000;
  // Second pass fixes the guess when it falls on the other side of a DST change.
  ms = guess - tzOffsetMinutes(ms, tz) * 60_000;
  return new Date(ms);
}

/** UTC instant to `{ date, minutes }` in the timezone. */
export function utcToZoned(at: Date, tz: string): { date: string; minutes: number } {
  const local = new Date(at.getTime() + tzOffsetMinutes(at.getTime(), tz) * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** 0 = Sunday, for a calendar date. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Local [00:00, next 00:00) of a calendar date, in UTC. */
export function dayBounds(date: string, tz: string): { start: Date; end: Date } {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: zonedToUtc(date, 0, tz),
    end: zonedToUtc(next.toISOString().slice(0, 10), 0, tz),
  };
}

/** Today's calendar date in the timezone. */
export const todayIn = (tz: string, now = new Date()) => utcToZoned(now, tz).date;

/** Calendar date `n` days after `date` (negative goes back). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
