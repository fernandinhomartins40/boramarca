import { format } from 'date-fns';
import { DataError } from '../errors';

/**
 * Knobs for the mock layer. `latency` gives the 300–600 ms fake delay of prompt 00 (off under Jest);
 * `failNext` makes the next mock call reject, to see the error state of a screen.
 */
export const mockControl = {
  latency: process.env.NODE_ENV !== 'test',
  failNext: false,
};

/** Resolves with a deep copy of `value` after the fake delay (callers can't mutate the store). */
export async function reply<T>(value: T): Promise<T> {
  if (mockControl.latency) {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
  }
  if (mockControl.failNext) {
    mockControl.failNext = false;
    throw new DataError({
      statusCode: 503,
      code: 'MOCK_FAILURE',
      message: 'Sem conexão. Tente de novo.',
    });
  }
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function fail(statusCode: number, code: string, message: string): never {
  throw new DataError({ statusCode, code, message });
}

/** Deterministic v4-shaped UUID for fixtures. */
export const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

let seq = 0xf000;
export const newId = () => uid(seq++);

export const nowIso = () => new Date().toISOString();
export const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
export const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** ISO instant for `HH:mm` on today + `dayOffset`, in the device timezone (demo data). */
export function todayAt(hhmm: string, dayOffset = 0): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

/** `YYYY-MM-DD` of an ISO instant in the device timezone. */
export const dateOf = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');
export const today = () => format(new Date(), 'yyyy-MM-dd');

/** EntityBase fields. */
export const base = (id: string, createdMinutesAgo = 60 * 24 * 30) => ({
  id,
  createdAt: minutesAgo(createdMinutesAgo),
  updatedAt: minutesAgo(createdMinutesAgo),
});
