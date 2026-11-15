import type { AgendaResponse, AppointmentStatus, AppointmentView } from '@boramarca/shared';
import {
  atMinute,
  busyIntervals,
  buildTimeline,
  checkBooking,
  countFreeSlots,
  freeStarts,
  nowAndNext,
  relativeIn,
  toMinutes,
  totalDuration,
  type DayRules,
} from './agenda';

const DATE = '2026-11-10';
const hours = { start: '08:00', end: '19:00', lunchStart: '12:00', lunchEnd: '13:00' };
const at = (hm: string) => atMinute(DATE, toMinutes(hm));

function appt(
  id: string,
  start: string,
  status: AppointmentStatus = 'confirmed',
  durationMin = 50,
  updatedAt = at('08:00'),
): AppointmentView {
  const startsAt = at(start);
  return {
    id,
    createdAt: startsAt,
    updatedAt,
    professionalId: 'p',
    clientId: 'c',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString(),
    status,
    origin: 'ai',
    isFitIn: false,
    priceCents: 15000,
    cancelReason: null,
    clientName: id,
    services: [{ serviceId: 's', name: 'Fisioterapia', durationMin, priceCents: 15000 }],
  };
}

const rules = (appointments: AppointmentView[]): DayRules => ({
  hours,
  busy: busyIntervals(appointments, DATE),
});

describe('checkBooking', () => {
  const day = rules([appt('ana', '14:00')]);

  it('refuses a partial overlap with another appointment', () => {
    expect(checkBooking(day, toMinutes('13:30'), 50)).toBe('overlap');
    expect(checkBooking(day, toMinutes('14:40'), 50)).toBe('overlap');
  });

  it('allows touching the end of the previous appointment', () => {
    expect(checkBooking(day, toMinutes('14:50'), 50)).toBeNull();
    expect(checkBooking(day, toMinutes('13:10'), 50)).toBeNull();
  });

  it('refuses outside working hours', () => {
    expect(checkBooking(day, toMinutes('07:30'), 50)).toBe('outside_hours');
    expect(checkBooking(day, toMinutes('19:00'), 30)).toBe('outside_hours');
  });

  it('refuses a service that does not fit before closing', () => {
    expect(checkBooking(day, toMinutes('18:30'), 50)).toBe('outside_hours');
    expect(checkBooking(day, toMinutes('18:10'), 50)).toBeNull();
  });

  it('refuses the lunch break, also when it only crosses it', () => {
    expect(checkBooking(day, toMinutes('12:00'), 30)).toBe('lunch');
    expect(checkBooking(day, toMinutes('11:30'), 50)).toBe('lunch');
  });

  it('refuses a day off', () => {
    expect(checkBooking({ hours: null, busy: [] }, toMinutes('10:00'), 50)).toBe('closed');
  });
});

describe('free slots', () => {
  it('only lists starts where the total duration fits', () => {
    const day = rules([appt('ana', '14:00'), appt('rafael', '16:00')]);
    const total = totalDuration([{ durationMin: 50 }, { durationMin: 50 }]);
    const starts = freeStarts(day, total);
    // 14:50–16:00 is only 70 min: no 100-min slot there
    expect(starts.filter((s) => s >= toMinutes('14:50') && s < toMinutes('16:00'))).toEqual([]);
    expect(starts).toContain(toMinutes('16:50'));
    expect(starts).not.toContain(toMinutes('11:00')); // would cross lunch
    expect(freeStarts(day, 50)).toContain(toMinutes('15:00'));
  });

  it('cancelled and no-show appointments free their time', () => {
    const day = rules([appt('carlos', '17:00', 'cancelled'), appt('x', '09:00', 'no_show')]);
    expect(checkBooking(day, toMinutes('17:00'), 50)).toBeNull();
    expect(checkBooking(day, toMinutes('09:00'), 50)).toBeNull();
  });

  it('counts the slots left in the reference day (2 vagas)', () => {
    const day = rules([
      ...['08:00', '09:00', '10:00', '11:00', '13:00'].map((h) => appt(h, h, 'done')),
      appt('ana', '14:00', 'in_service'),
      appt('rafael', '15:00'),
      appt('carlos', '17:00', 'cancelled'),
      appt('diego', '18:00'),
    ]);
    expect(countFreeSlots(day, 50)).toBe(2);
    expect(countFreeSlots({ hours, busy: [] }, 50)).toBe(11);
  });
});

describe('nowAndNext', () => {
  const list = [
    appt('ana', '14:00', 'in_service'),
    appt('rafael', '15:00'),
    appt('diego', '18:00'),
  ];

  it('shows who is being served and how long until the next one', () => {
    const r = nowAndNext(list, new Date(at('14:48')));
    expect(r.current?.id).toBe('ana');
    expect(r.next?.id).toBe('rafael');
    expect(r.minutesToNext).toBe(12);
    expect(r.progress).toBeCloseTo(48 / 50);
  });

  it('is free until the next one when nobody is in service', () => {
    const r = nowAndNext([appt('rafael', '15:00')], new Date(at('13:20')));
    expect(r.current).toBeNull();
    expect(r.next?.id).toBe('rafael');
    expect(relativeIn(r.minutesToNext!)).toBe('em 1h40');
  });

  it('ignores cancelled appointments', () => {
    const r = nowAndNext([appt('carlos', '17:00', 'cancelled')], new Date(at('16:00')));
    expect(r.next).toBeNull();
  });
});

describe('buildTimeline', () => {
  const day = (appointments: AppointmentView[]): AgendaResponse => ({
    date: DATE,
    timezone: 'America/Sao_Paulo',
    workingHours: {
      ...hours,
      id: 'w',
      createdAt: '',
      updatedAt: '',
      professionalId: 'p',
      weekday: 2,
    },
    timeOff: [],
    appointments,
    summary: { appointmentsCount: 0, freeSlotsCount: 0, expectedRevenueCents: 0 },
  });

  it('matches reference 04: appointments, now line, free 16:00, Carlos just cancelled', () => {
    const now = new Date(at('14:48'));
    const rows = buildTimeline(
      day([
        appt('ana', '14:00', 'in_service'),
        appt('rafael', '15:00'),
        appt(
          'carlos',
          '17:00',
          'cancelled',
          50,
          new Date(now.getTime() - 3 * 60_000).toISOString(),
        ),
        appt('diego', '18:00'),
      ]),
      now,
      50,
    );
    const after = rows.slice(rows.findIndex((r) => r.kind === 'appointment'));
    expect(after.map((r) => r.kind)).toEqual([
      'appointment',
      'now',
      'appointment',
      'free',
      'freed',
      'appointment',
    ]);
    const freed = rows.find((r) => r.kind === 'freed');
    expect(freed?.kind === 'freed' && freed.minutesAgo).toBe(3);
  });

  it('an empty future day is all free slots plus lunch, without the now line', () => {
    const rows = buildTimeline(day([]), new Date(atMinute('2026-11-09', 600)), 50);
    expect(rows.filter((r) => r.kind === 'free')).toHaveLength(10);
    expect(rows.some((r) => r.kind === 'lunch')).toBe(true);
    expect(rows.some((r) => r.kind === 'now')).toBe(false);
  });

  it('a past day has no free slots and marks appointments as past', () => {
    const rows = buildTimeline(
      day([appt('ana', '14:00', 'done')]),
      new Date('2026-11-20T12:00'),
      50,
    );
    expect(rows.filter((r) => r.kind === 'free')).toHaveLength(0);
    expect(rows.find((r) => r.kind === 'appointment')).toMatchObject({ past: true });
  });
});
