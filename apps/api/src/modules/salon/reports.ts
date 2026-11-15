// Owner panel reports (plan section 8): recovered fit-ins and their value, no-show rate,
// occupancy per professional and the weekday x hour heatmap, for one month in the salon timezone.
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { SalonReportsResponse } from '@boramarca/shared';
import type { Db } from '../../db/client';
import { appointments, professionals, salons, timeOff, workingHours } from '../../db/schema';
import { addDays, toMinutes, utcToZoned, weekdayOf, zonedToUtc } from '../../lib/time';

const MIN = 60_000;
/** Statuses that occupy the professional's time. */
const OCCUPYING = ['scheduled', 'confirmed', 'in_service', 'done'] as const;

/** Every calendar date of `YYYY-MM`. */
export function monthDates(month: string) {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

const rate = (num: number, den: number) => (den > 0 ? Math.min(1, num / den) : 0);

export async function salonReports(
  db: Db,
  salonId: string,
  month: string,
): Promise<SalonReportsResponse> {
  const [salon] = await db.select().from(salons).where(eq(salons.id, salonId));
  const tz = salon!.timezone;
  const dates = monthDates(month);
  const from = zonedToUtc(dates[0]!, 0, tz);
  const to = zonedToUtc(addDays(dates.at(-1)!, 1), 0, tz);

  const team = await db
    .select({ id: professionals.id, name: professionals.name })
    .from(professionals)
    .where(eq(professionals.salonId, salonId))
    .orderBy(professionals.createdAt);
  const ids = team.map((t) => t.id);
  if (!ids.length)
    return {
      month,
      recoveredFitInsCount: 0,
      recoveredValueCents: 0,
      noShowRate: 0,
      occupancyByProfessional: [],
      heatmap: [],
    };

  const [appts, hours, off] = await Promise.all([
    db
      .select({
        professionalId: appointments.professionalId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        priceCents: appointments.priceCents,
        // Recovered = fit-in, or a slot the waitlist filled (accepted offer for that client and time).
        // Qualified by hand: drizzle leaves columns unqualified in single-table selects.
        recovered: sql<boolean>`(appointments.is_fit_in or exists(select 1 from waitlist_offers o join waitlist_entries e on e.id = o.entry_id where o.status = 'accepted' and e.client_id = appointments.client_id and o.slot_starts_at = appointments.starts_at))`,
      })
      .from(appointments)
      .where(
        and(
          inArray(appointments.professionalId, ids),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
        ),
      ),
    db.select().from(workingHours).where(inArray(workingHours.professionalId, ids)),
    db
      .select()
      .from(timeOff)
      .where(and(inArray(timeOff.professionalId, ids), lt(timeOff.startsAt, to))),
  ]);

  // Available minutes, per professional and per weekday x hour bucket.
  const avail = new Map<string, number>();
  const bucketAvail = new Map<number, number>();
  for (const p of ids) {
    const offs = off.filter((o) => o.professionalId === p);
    let total = 0;
    for (const date of dates) {
      const wd = weekdayOf(date);
      const wh = hours.find((h) => h.professionalId === p && h.weekday === wd);
      if (!wh) continue;
      const start = toMinutes(wh.start);
      const end = toMinutes(wh.end);
      const lunch =
        wh.lunchStart && wh.lunchEnd ? [toMinutes(wh.lunchStart), toMinutes(wh.lunchEnd)] : null;
      const base = zonedToUtc(date, 0, tz).getTime();
      for (let m = start; m < end; m++) {
        if (lunch && m >= lunch[0]! && m < lunch[1]!) continue;
        const t = base + m * MIN; // shortcut: ignores a DST shift inside the day (Brazil has none)
        if (offs.some((o) => o.startsAt.getTime() <= t && o.endsAt.getTime() > t)) continue;
        total++;
        const key = wd * 24 + Math.floor(m / 60);
        bucketAvail.set(key, (bucketAvail.get(key) ?? 0) + 1);
      }
    }
    avail.set(p, total);
  }

  const booked = new Map<string, number>();
  const bucketBooked = new Map<number, number>();
  let recoveredCount = 0;
  let recoveredValue = 0;
  let done = 0;
  let noShow = 0;
  for (const a of appts) {
    if (a.status === 'done') done++;
    if (a.status === 'no_show') noShow++;
    if (!(OCCUPYING as readonly string[]).includes(a.status)) continue;
    if (a.recovered) {
      recoveredCount++;
      recoveredValue += a.priceCents;
    }
    const minutes = Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / MIN);
    booked.set(a.professionalId, (booked.get(a.professionalId) ?? 0) + minutes);
    for (let i = 0; i < minutes; i++) {
      const z = utcToZoned(new Date(a.startsAt.getTime() + i * MIN), tz);
      const key = weekdayOf(z.date) * 24 + Math.floor(z.minutes / 60);
      bucketBooked.set(key, (bucketBooked.get(key) ?? 0) + 1);
    }
  }

  return {
    month,
    recoveredFitInsCount: recoveredCount,
    recoveredValueCents: recoveredValue,
    noShowRate: rate(noShow, done + noShow),
    occupancyByProfessional: team.map((t) => ({
      professionalId: t.id,
      name: t.name,
      occupancyRate: rate(booked.get(t.id) ?? 0, avail.get(t.id) ?? 0),
    })),
    heatmap: [...bucketAvail.entries()]
      .sort(([a], [b]) => a - b)
      .map(([key, minutes]) => ({
        weekday: Math.floor(key / 24),
        hour: key % 24,
        occupancyRate: rate(bucketBooked.get(key) ?? 0, minutes),
      })),
  };
}
