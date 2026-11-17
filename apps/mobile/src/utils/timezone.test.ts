import { dayTitle, clock } from '@/features/agenda/format';
import { listTime } from '@/features/conversations/format';
import { pauseUntil } from '@/features/settings/aiStore';
import { atMinute, buildTimeline, dateOnly, minuteOfDay } from './agenda';
import { DEFAULT_TIMEZONE, salonClock, salonInstant, salonTimezone, setSalonTimezone } from './timezone';

// A store reviewer abroad: the phone is in London (GMT) or Kiribati (UTC+14), the salon in São Paulo.
const deviceTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = deviceTz;
});
afterEach(() => setSalonTimezone(DEFAULT_TIMEZONE));

// 21:27 of Monday 16/11/2026 in São Paulo = 00:27 of the 17th in London = 14:27 of the 17th in Kiribati
const NOW = new Date('2026-11-17T00:27:00.000Z');

describe.each(['Europe/London', 'Pacific/Kiritimati', 'America/Sao_Paulo'])('phone in %s', (tz) => {
  beforeAll(() => {
    process.env.TZ = tz;
  });

  it('"hoje" and "agora" are the salon\'s', () => {
    expect(dateOnly(NOW)).toBe('2026-11-16');
    expect(minuteOfDay(NOW)).toBe(21 * 60 + 27);
    expect(clock(NOW.toISOString())).toBe('21:27');
    expect(dayTitle('2026-11-16', NOW)).toBe('Hoje, segunda, 16 de novembro');
    expect(dayTitle('2026-11-17', NOW)).toBe('Amanhã, terça, 17 de novembro');
  });

  it('a salon time goes to the API as the right instant', () => {
    expect(atMinute('2026-11-16', 14 * 60 + 20)).toBe('2026-11-16T17:20:00.000Z');
    expect(salonInstant('2026-11-16', 24 * 60).toISOString()).toBe('2026-11-17T03:00:00.000Z');
    expect(pauseUntil('tomorrow', NOW)).toBe('2026-11-17T03:00:00.000Z');
  });

  it('the timeline puts "agora" at 21:27 of the 16th', () => {
    const rows = buildTimeline(
      {
        date: '2026-11-16',
        timezone: DEFAULT_TIMEZONE,
        workingHours: null,
        timeOff: [],
        appointments: [],
        summary: { appointmentsCount: 0, freeSlotsCount: 0, expectedRevenueCents: 0 },
      },
      NOW,
      30,
    );
    expect(rows).toEqual([{ kind: 'now', key: 'now', start: 21 * 60 + 27 }]);
  });
});

describe('salon timezone from the API', () => {
  it('follows the salon zone and ignores an unknown name', () => {
    process.env.TZ = 'Europe/London';
    setSalonTimezone('Asia/Tokyo');
    expect(salonTimezone()).toBe('Asia/Tokyo');
    expect(dateOnly(NOW)).toBe('2026-11-17');
    expect(salonClock(NOW).getHours()).toBe(9);
    setSalonTimezone('Mars/Olympus');
    expect(salonTimezone()).toBe('Asia/Tokyo');
  });

  it('"Ontem" in the conversation list counts salon days', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    jest.useFakeTimers({ now: NOW });
    try {
      // 23:50 of the 15th in São Paulo is yesterday there, though the 16th in Kiribati
      expect(listTime('2026-11-16T02:50:00.000Z')).toBe('Ontem');
      expect(listTime('2026-11-16T12:00:00.000Z')).toBe('09:00');
    } finally {
      jest.useRealTimers();
    }
  });
});
