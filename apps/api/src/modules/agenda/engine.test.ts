import { describe, expect, it } from 'vitest';
import { checkSlot, computeFreeSlots, countFittingSlots, type DayInput } from './engine';
import { dayBounds, utcToZoned, zonedToUtc } from '../../lib/time';

const TZ = 'America/Sao_Paulo';
const DATE = '2030-03-04';
const t = (hhmm: string, date = DATE) => zonedToUtc(date, hhmm, TZ).getTime();
const iv = (a: string, b: string) => ({ start: t(a), end: t(b) });
const local = (ms: number) => {
  const z = utcToZoned(new Date(ms), TZ);
  return `${String(Math.floor(z.minutes / 60)).padStart(2, '0')}:${String(z.minutes % 60).padStart(2, '0')}`;
};

const day = (over: Partial<DayInput> = {}): DayInput => ({
  date: DATE,
  timezone: TZ,
  workingHours: { start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
  timeOff: [],
  busy: [iv('14:00', '14:50')],
  ...over,
});

describe('time helpers', () => {
  it('converts local wall time in the salon timezone to UTC', () => {
    expect(zonedToUtc(DATE, '14:00', TZ).toISOString()).toBe('2030-03-04T17:00:00.000Z');
    expect(dayBounds(DATE, TZ)).toEqual({
      start: new Date('2030-03-04T03:00:00.000Z'),
      end: new Date('2030-03-05T03:00:00.000Z'),
    });
  });
});

describe('checkSlot (plan section 4)', () => {
  it('accepts a free slot inside working hours', () => {
    expect(checkSlot(day(), iv('09:00', '09:50'))).toBeNull();
    expect(checkSlot(day(), iv('14:50', '15:40'))).toBeNull(); // back-to-back is fine: [start, end)
  });
  it('partial overlap with another appointment', () => {
    expect(checkSlot(day(), iv('13:30', '14:20'))).toBe('CONFLICT');
    expect(checkSlot(day(), iv('14:40', '15:30'))).toBe('CONFLICT');
  });
  it('outside working hours', () => {
    expect(checkSlot(day(), iv('07:00', '07:50'))).toBe('OUTSIDE_WORKING_HOURS');
    expect(checkSlot(day(), iv('18:00', '18:50'))).toBe('OUTSIDE_WORKING_HOURS');
    expect(checkSlot(day({ workingHours: null }), iv('09:00', '09:50'))).toBe(
      'OUTSIDE_WORKING_HOURS',
    );
  });
  it('inside lunch', () => {
    expect(checkSlot(day(), iv('11:30', '12:20'))).toBe('DURING_LUNCH');
    expect(checkSlot(day(), iv('12:10', '13:00'))).toBe('DURING_LUNCH');
  });
  it('service that does not fit before closing', () => {
    expect(checkSlot(day(), iv('17:30', '18:20'))).toBe('DOES_NOT_FIT');
  });
  it('time off blocks, even for a fit-in', () => {
    const d = day({ timeOff: [iv('09:00', '10:00')] });
    expect(checkSlot(d, iv('09:30', '10:20'))).toBe('TIME_OFF');
    expect(checkSlot(d, iv('09:30', '10:20'), true)).toBe('TIME_OFF');
  });
  it('a fit-in may go over lunch or after hours but never over another appointment', () => {
    expect(checkSlot(day(), iv('12:00', '12:50'), true)).toBeNull();
    expect(checkSlot(day(), iv('18:00', '18:50'), true)).toBeNull();
    expect(checkSlot(day(), iv('14:30', '15:20'), true)).toBe('CONFLICT');
  });
});

describe('computeFreeSlots', () => {
  it('respects hours, lunch, busy and total duration', () => {
    const slots = computeFreeSlots(day(), 50).map((s) => local(s.start));
    expect(slots[0]).toBe('08:00');
    expect(slots).toContain('11:00'); // 11:00–11:50 fits before lunch
    expect(slots).not.toContain('11:30'); // would run into lunch
    expect(slots).not.toContain('12:00');
    expect(slots).toContain('13:00');
    expect(slots).not.toContain('13:30'); // would overlap 14:00
    expect(slots).not.toContain('14:00');
    expect(slots).toContain('14:50'); // start of the free window after the appointment
    expect(slots).toContain('15:00');
    expect(slots.at(-1)).toBe('17:00'); // 17:00–17:50 is the last that fits before 18:00
  });
  it('skips the past', () => {
    const slots = computeFreeSlots(day(), 50, { now: t('15:10') }).map((s) => local(s.start));
    expect(slots[0]).toBe('15:10');
    expect(slots).not.toContain('15:00');
  });
  it('a day off has no slots', () => {
    expect(computeFreeSlots(day({ workingHours: null }), 30)).toEqual([]);
  });
  it('counts how many more appointments fit ("2 vagas")', () => {
    // Marina's afternoon in the reference: busy until 15:50, free 15:50–19:00 => 3 × 50 min.
    const d = day({
      workingHours: { start: '13:00', end: '19:00', lunchStart: null, lunchEnd: null },
      busy: [iv('13:00', '15:50'), iv('18:00', '18:50')],
    });
    expect(countFittingSlots(d, 50)).toBe(2); // 15:50–18:00 = 130 min => 2; 18:50–19:00 => 0
  });
});

describe('day rollover in the salon timezone', () => {
  // 22:00–23:59 in São Paulo is already the next day in UTC.
  const night = day({
    workingHours: { start: '20:00', end: '23:59', lunchStart: null, lunchEnd: null },
    busy: [],
  });
  it('late-evening slots belong to the local date even though UTC is the next day', () => {
    const slots = computeFreeSlots(night, 50);
    expect(new Date(slots[0]!.start).toISOString()).toBe('2030-03-04T23:00:00.000Z');
    const last = slots.at(-1)!;
    expect(new Date(last.start).toISOString()).toBe('2030-03-05T02:00:00.000Z'); // 23:00 local
    expect(utcToZoned(new Date(last.start), TZ).date).toBe(DATE);
  });
  it('a service that would cross local midnight does not fit', () => {
    expect(checkSlot(night, iv('23:30', '23:59'))).toBeNull();
    expect(checkSlot(night, { start: t('23:30'), end: t('23:30') + 50 * 60_000 })).toBe(
      'DOES_NOT_FIT',
    );
  });
  it('an appointment from the previous evening does not block the next morning', () => {
    const next = day({
      date: '2030-03-05',
      busy: [{ start: t('23:00'), end: t('23:50') }], // previous local day, 02:00Z on the 5th
    });
    expect(
      checkSlot(next, { start: t('08:00', '2030-03-05'), end: t('08:50', '2030-03-05') }),
    ).toBeNull();
  });
});
