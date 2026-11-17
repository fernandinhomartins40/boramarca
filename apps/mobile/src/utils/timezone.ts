import type { DateOnly } from '@boramarca/shared';

/**
 * The app shows days and times in the salon's timezone, not the phone's (a store reviewer abroad
 * must see the same "hoje" as the salon). Set from GET /me and GET /agenda (src/data/api.ts).
 */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

let zone = DEFAULT_TIMEZONE;
let parts = formatterFor(zone);

function formatterFor(timeZone: string) {
  // `format` (not formatToParts) is the most widely supported Intl call, Hermes included
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const salonTimezone = () => zone;

/** Ignores an unknown zone name (keeps the current one). */
export function setSalonTimezone(timeZone: string): void {
  if (timeZone === zone) return;
  try {
    parts = formatterFor(timeZone);
    zone = timeZone;
  } catch {
    // RangeError: invalid time zone
  }
}

/** Salon wall clock at instant `t` as UTC milliseconds ("11/16/2026, 14:20:05"). */
function wallUtc(t: number): number {
  const m = /(\d+)\/(\d+)\/(\d+),? (\d+):(\d+):(\d+)/.exec(parts.format(t));
  if (!m) return t - new Date(t).getTimezoneOffset() * 60_000;
  const [, mo, d, y, h, mi, s] = m.map(Number) as number[];
  return Date.UTC(y!, mo! - 1, d!, h! % 24, mi!, s!, t % 1000);
}

/**
 * A Date whose *local* fields (getHours, date-fns `format`, `differenceInCalendarDays`…) read the
 * salon's wall clock at `at`. Use it only to read/format, never to send to the API.
 */
export function salonClock(at: string | number | Date = Date.now()): Date {
  const w = new Date(wallUtc(new Date(at).getTime()));
  // shortcut: a wall time inside the phone's own DST gap shifts by 1 h; fine for a calendar view
  return new Date(
    w.getUTCFullYear(),
    w.getUTCMonth(),
    w.getUTCDate(),
    w.getUTCHours(),
    w.getUTCMinutes(),
    w.getUTCSeconds(),
    w.getUTCMilliseconds(),
  );
}

/** The instant of minute `minute` of `date` in the salon (minutes past 1440 roll over). */
export function salonInstant(date: DateOnly, minute: number): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const target = Date.UTC(y!, mo! - 1, d!, 0, minute);
  // two passes settle the offset also next to a DST change of the salon's zone
  let t = target - (wallUtc(target) - target);
  t = target - (wallUtc(t) - t);
  return new Date(t);
}
