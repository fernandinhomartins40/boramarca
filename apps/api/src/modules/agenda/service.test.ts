import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@boramarca/shared';
import { createDb } from '../../db/client';
import { appointmentEvents, appointments, auditLog, clients } from '../../db/schema';
import { createMemoryEventBus } from '../../lib/event-bus';
import { zonedToUtc } from '../../lib/time';
import { TEST_DATABASE_URL } from '../../test/env';
import { randomPhone, seedProfessional } from '../../test/helpers';
import { createAgenda, type SlotFreedHookEvent } from './service';

const TZ = 'America/Sao_Paulo';
const DATE = '2030-03-04';
const at = (hhmm: string, date = DATE) => zonedToUtc(date, hhmm, TZ).toISOString();

const { db, sql } = createDb(TEST_DATABASE_URL);
const bus = createMemoryEventBus();
const agenda = createAgenda({ db, bus, now: () => new Date('2030-01-01T00:00:00Z') });
afterAll(() => sql.end());

let pro: Awaited<ReturnType<typeof seedProfessional>>;
let clientId: string;
const ctx = () => ({ professionalId: pro.professionalId, actor: 'professional' as const });
const book = (startsAt: string, extra: { isFitIn?: boolean } = {}) =>
  agenda.book(ctx(), { clientId, serviceIds: [pro.serviceId], startsAt, ...extra });

beforeAll(async () => {
  pro = await seedProfessional(db);
  const [c] = await db
    .insert(clients)
    .values({ professionalId: pro.professionalId, name: 'Ana Paula', phone: randomPhone() })
    .returning();
  clientId = c!.id;
  await book(at('14:00'));
});

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'OK',
    (e: { code?: string }) => e.code,
  );

describe('agenda motor against Postgres', () => {
  it('books with services copy, history, audit and a realtime event', async () => {
    const events: RealtimeEvent[] = [];
    const off = bus.subscribe(pro.professionalId, (e) => events.push(e));
    const v = await book(at('09:00'));
    off();
    expect(v).toMatchObject({ status: 'scheduled', priceCents: 15000, clientName: 'Ana Paula' });
    expect(v.endsAt).toBe(at('09:50'));
    expect(v.services).toEqual([
      { serviceId: pro.serviceId, name: 'Sessão', durationMin: 50, priceCents: 15000 },
    ]);
    const hist = await db
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, v.id));
    expect(hist.map((h) => [h.type, h.description])).toEqual([['booked', 'Você marcou']]);
    const audit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.professionalId, pro.professionalId),
          eq(auditLog.action, 'appointment.booked'),
        ),
      );
    expect(audit.some((a) => a.payload.appointmentId === v.id)).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'appointment.changed',
        data: { change: 'created', appointment: v },
      }),
    ]);
  });

  it('rejects partial overlap', async () => {
    expect(await code(book(at('13:30')))).toBe('CONFLICT');
    expect(await code(book(at('14:30')))).toBe('CONFLICT');
    expect(await code(book(at('13:20'), { isFitIn: true }))).toBe('CONFLICT');
  });
  it('rejects outside working hours', async () => {
    expect(await code(book(at('07:00')))).toBe('OUTSIDE_WORKING_HOURS');
  });
  it('rejects inside lunch', async () => {
    expect(await code(book(at('12:15')))).toBe('DURING_LUNCH');
  });
  it('rejects a service that does not fit before closing', async () => {
    expect(await code(book(at('17:30')))).toBe('DOES_NOT_FIT');
  });

  it('two simultaneous bookings for the same time: only one wins (DB constraint)', async () => {
    const results = await Promise.allSettled([
      book(at('16:00')),
      book(at('16:00')),
      book(at('16:20')),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed.map((f) => (f.reason as { code: string }).code)).toEqual([
      'CONFLICT',
      'CONFLICT',
    ]);
  });

  it('the exclusion constraint itself refuses overlap when the motor is bypassed', async () => {
    const row = {
      professionalId: pro.professionalId,
      clientId,
      origin: 'professional' as const,
      priceCents: 0,
      startsAt: new Date(at('14:10')),
      endsAt: new Date(at('14:30')),
    };
    const err = await db
      .insert(appointments)
      .values(row)
      .then(
        () => null,
        (e: { cause?: { code?: string } }) => e.cause?.code,
      );
    expect(err).toBe('23P01');
    // Inactive statuses do not hold the slot.
    await db.insert(appointments).values({ ...row, status: 'cancelled' });
  });

  it('cancel frees the slot, fires onSlotFreed and allows rebooking', async () => {
    const freed: SlotFreedHookEvent[] = [];
    const off = agenda.onSlotFreed((e) => void freed.push(e));
    const v = await book(at('10:00'));
    const c = await agenda.cancel(ctx(), v.id, { reason: 'Cliente pediu' });
    off();
    expect(c).toMatchObject({ status: 'cancelled', cancelReason: 'Cliente pediu' });
    expect(freed).toEqual([
      expect.objectContaining({
        appointmentId: v.id,
        startsAt: at('10:00'),
        endsAt: at('10:50'),
        reason: 'cancelled',
        offerToWaitlist: true,
        serviceIds: [pro.serviceId],
      }),
    ]);
    expect(await code(agenda.cancel(ctx(), v.id))).toBe('INVALID_STATUS');
    expect((await book(at('10:00'))).status).toBe('scheduled');
  });

  it('reschedule moves the appointment, ignores itself and frees the old time', async () => {
    const freed: SlotFreedHookEvent[] = [];
    const off = agenda.onSlotFreed((e) => void freed.push(e));
    const v = await book(at('15:00'));
    const moved = await agenda.reschedule(ctx(), v.id, { startsAt: at('15:10') }); // overlaps its own old time
    off();
    expect(moved.startsAt).toBe(at('15:10'));
    expect(freed[0]).toMatchObject({ reason: 'rescheduled', startsAt: at('15:00') });
    expect(await code(agenda.reschedule(ctx(), v.id, { startsAt: at('14:00') }))).toBe('CONFLICT');
    const detail = await agenda.getAppointment(pro.professionalId, v.id);
    expect(detail.events.map((e) => e.description)).toEqual([
      'Você marcou',
      'Você remarcou de 15:00 para 15:10',
    ]);
  });

  it('status flow: confirm, arrive, done; no-show; invalid moves are 409', async () => {
    const v = await book(at('11:00'));
    expect((await agenda.confirm({ ...ctx(), actor: 'client' }, v.id)).status).toBe('confirmed');
    expect((await agenda.markArrived(ctx(), v.id)).status).toBe('in_service');
    expect(await code(agenda.markNoShow(ctx(), v.id))).toBe('INVALID_STATUS');
    expect((await agenda.markDone(ctx(), v.id)).status).toBe('done');
    const w = await book(at('08:00'));
    expect((await agenda.markNoShow(ctx(), w.id)).status).toBe('no_show');
    const hist = await agenda.getAppointment(pro.professionalId, v.id);
    expect(hist.events.map((e) => e.type)).toEqual(['booked', 'confirmed', 'arrived', 'done']);
  });

  it('day view and slots in the salon timezone', async () => {
    const day = await agenda.getDay(pro.professionalId, DATE);
    expect(day.timezone).toBe(TZ);
    expect(day.workingHours).toMatchObject({ start: '08:00', end: '18:00' });
    expect(day.appointments.map((a) => a.startsAt)).toEqual(
      [...day.appointments.map((a) => a.startsAt)].sort(),
    );
    expect(day.appointments.some((a) => a.status === 'cancelled')).toBe(true);
    const slots = await agenda.findFreeSlots(pro.professionalId, DATE, 50);
    expect(slots.map((s) => s.startsAt)).not.toContain(at('14:00'));
    const afternoon = await agenda.findFreeSlots(pro.professionalId, DATE, 50, { period: 'manha' });
    expect(afternoon.every((s) => s.startsAt < at('12:00'))).toBe(true);
  });

  it('virada de dia: a late booking lands on the local date, not the UTC one', async () => {
    const night = await seedProfessional(db, { start: '20:00', end: '23:59', lunch: null });
    const [c] = await db
      .insert(clients)
      .values({ professionalId: night.professionalId, name: 'Rafael', phone: randomPhone() })
      .returning();
    const nctx = { professionalId: night.professionalId, actor: 'ai' as const };
    const v = await agenda.book(nctx, {
      clientId: c!.id,
      serviceIds: [night.serviceId],
      startsAt: at('22:30'),
    });
    expect(v.startsAt).toBe('2030-03-05T01:30:00.000Z');
    expect(v.origin).toBe('ai');
    expect((await agenda.getDay(night.professionalId, DATE)).appointments.map((a) => a.id)).toEqual(
      [v.id],
    );
    expect((await agenda.getDay(night.professionalId, '2030-03-05')).appointments).toEqual([]);
    expect(
      await code(
        agenda.book(nctx, {
          clientId: c!.id,
          serviceIds: [night.serviceId],
          startsAt: at('23:30'),
        }),
      ),
    ).toBe('DOES_NOT_FIT');
    const slots = await agenda.findFreeSlots(night.professionalId, DATE, 50);
    expect(slots.map((s) => s.startsAt)).not.toContain(at('22:30'));
    expect(slots.at(-1)?.startsAt).toBe(at('21:30')); // 22:30 taken until 23:20; 23:20 + 50 > 23:59
  });

  it('newClient with an existing phone reuses the client', async () => {
    const [c] = await db.select().from(clients).where(eq(clients.id, clientId));
    const v = await agenda.book(ctx(), {
      newClient: { name: 'Outro nome', phone: c!.phone },
      serviceIds: [pro.serviceId],
      startsAt: at('13:00', '2030-03-06'),
    });
    expect(v.clientId).toBe(clientId);
  });
});
