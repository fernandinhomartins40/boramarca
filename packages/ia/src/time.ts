// Timezone helpers on top of Intl (no date library): the salon timezone decides "hoje" and "16h30".

export interface ZonedParts {
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES_PT = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

export function zonedParts(iso: string | Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
  };
}

/** Local wall-clock time in `timeZone` → UTC ISO string. */
export function zonedToUtc(date: string, hour: number, minute: number, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wall;
  // Two passes settle DST edges.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const [py, pm, pd] = p.date.split('-').map(Number) as [number, number, number];
    const seen = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    guess += wall - seen;
  }
  return new Date(guess).toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setUTCSeconds(0, 0);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

/** "15h", "14h20". */
export function spokenTime(hour: number, minute: number): string {
  return minute === 0 ? `${hour}h` : `${hour}h${String(minute).padStart(2, '0')}`;
}

export function spokenTimeOf(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return spokenTime(p.hour, p.minute);
}

/** "hoje às 14h20", "amanhã às 9h", "sábado, 15/11, às 10h". */
export function formatWhen(iso: string, now: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  const today = zonedParts(now, timeZone).date;
  const tomorrow = zonedParts(new Date(new Date(now).getTime() + 86_400_000), timeZone).date;
  const time = spokenTime(p.hour, p.minute);
  if (p.date === today) return `hoje às ${time}`;
  if (p.date === tomorrow) return `amanhã às ${time}`;
  const [, mm, dd] = p.date.split('-');
  return `${WEEKDAY_NAMES_PT[p.weekday]}, ${dd}/${mm}, às ${time}`;
}
