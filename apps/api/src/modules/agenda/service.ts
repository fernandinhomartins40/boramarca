// Agenda motor (plan section 4) on top of the pure rules in engine.ts. Every function is scoped to
// one professional, validates conflicts, writes appointment_events + audit_log and publishes
// `appointment.changed`. The API routes, B1's message worker and the AI tools all call these.
import { and, asc, eq, gt, gte, inArray, lt, ne } from 'drizzle-orm';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type Actor,
  type AgendaResponse,
  type AppointmentDetail,
  type AppointmentEventType,
  type AppointmentStatus,
  type AppointmentView,
  type ClientCreate,
  type DayPeriod,
  type Slot,
} from '@boramarca/shared';
import type { Db } from '../../db/client';
import {
  appointmentEvents,
  appointments,
  appointmentServices,
  auditLog,
  clients,
  professionals,
  salons,
  services,
  timeOff,
  workingHours,
} from '../../db/schema';
import { AppError, notFound, pgCode, PG_EXCLUSION } from '../../lib/errors';
import { realtimeEvent, type EventBus } from '../../lib/event-bus';
import { wire } from '../../lib/serialize';
import { dayBounds, utcToZoned, weekdayOf } from '../../lib/time';
import {
  checkSlot,
  computeFreeSlots,
  countFittingSlots,
  SLOT_PROBLEMS,
  type DayInput,
  type Interval,
} from './engine';

/** Who is acting, always on behalf of one professional (the isolation boundary). */
export interface AgendaCtx {
  professionalId: string;
  actor: Actor;
}

/** "Avisar o cliente" options from the app; the agenda only forwards them to listeners. */
export interface ClientNotice {
  notifyClient: boolean;
  messageText?: string;
}

export type AppointmentChange = 'created' | 'updated' | 'rescheduled' | 'cancelled' | 'status';

export interface AppointmentChangedHookEvent {
  professionalId: string;
  change: AppointmentChange;
  appointment: AppointmentView;
  actor: Actor;
  notice: ClientNotice | null;
  /** Set on `rescheduled`. */
  previous: { startsAt: string; endsAt: string } | null;
}

/** A booked interval became free (cancel or reschedule). C1 plugs the waitlist here. */
export interface SlotFreedHookEvent {
  professionalId: string;
  appointmentId: string;
  serviceIds: string[];
  startsAt: string;
  endsAt: string;
  reason: 'cancelled' | 'rescheduled';
  offerToWaitlist: boolean;
}

export interface AgendaDeps {
  db: Db;
  bus: EventBus;
  /** Errors thrown by hooks are logged here (the agenda change is already committed). */
  log?: { error: (obj: object, msg: string) => void };
  now?: () => Date;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;

const ACTIVE = [...ACTIVE_APPOINTMENT_STATUSES];
const MIN = 60_000;

const PERIOD_RANGE: Record<DayPeriod, [number, number]> = {
  manha: [0, 12 * 60],
  tarde: [12 * 60, 18 * 60],
  noite: [18 * 60, 24 * 60],
};

const WHO: Record<Actor, string> = {
  ai: 'A IA',
  professional: 'Você',
  client: 'O cliente',
  system: 'O sistema',
};

const hhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
const ddmmHhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

export function createAgenda(deps: AgendaDeps) {
  const { db, bus } = deps;
  const now = deps.now ?? (() => new Date());
  const changedHooks = new Set<(e: AppointmentChangedHookEvent) => unknown>();
  const freedHooks = new Set<(e: SlotFreedHookEvent) => unknown>();

  async function runHooks<E>(hooks: Set<(e: E) => unknown>, e: E) {
    for (const h of hooks) {
      try {
        await h(e);
      } catch (err) {
        (deps.log ?? { error: (o: object, m: string) => console.error(m, o) }).error(
          { err },
          'agenda hook failed',
        );
      }
    }
  }

  async function loadProfessional(x: Exec, professionalId: string) {
    const [p] = await x
      .select({ id: professionals.id, timezone: salons.timezone })
      .from(professionals)
      .innerJoin(salons, eq(salons.id, professionals.salonId))
      .where(eq(professionals.id, professionalId));
    if (!p) throw notFound('Profissional');
    return p;
  }

  /** Availability inputs for a local date, widened to cover `extra` (a slot that may cross midnight). */
  async function loadDay(
    x: Exec,
    professionalId: string,
    timezone: string,
    date: string,
    opts: { extra?: Interval; excludeAppointmentId?: string } = {},
  ): Promise<DayInput> {
    const b = dayBounds(date, timezone);
    const from = new Date(Math.min(b.start.getTime(), opts.extra?.start ?? Infinity));
    const to = new Date(Math.max(b.end.getTime(), opts.extra?.end ?? -Infinity));
    const [wh] = await x
      .select()
      .from(workingHours)
      .where(
        and(
          eq(workingHours.professionalId, professionalId),
          eq(workingHours.weekday, weekdayOf(date)),
        ),
      );
    const off = await x
      .select({ startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
      .from(timeOff)
      .where(
        and(
          eq(timeOff.professionalId, professionalId),
          lt(timeOff.startsAt, to),
          gt(timeOff.endsAt, from),
        ),
      );
    const busy = await x
      .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.professionalId, professionalId),
          inArray(appointments.status, ACTIVE),
          lt(appointments.startsAt, to),
          gt(appointments.endsAt, from),
          opts.excludeAppointmentId ? ne(appointments.id, opts.excludeAppointmentId) : undefined,
        ),
      );
    const iv = (r: { startsAt: Date; endsAt: Date }) => ({
      start: r.startsAt.getTime(),
      end: r.endsAt.getTime(),
    });
    return { date, timezone, workingHours: wh ?? null, timeOff: off.map(iv), busy: busy.map(iv) };
  }

  /** Active services of this professional, in the given order; 400 if any id is unknown. */
  async function resolveServices(x: Exec, professionalId: string, serviceIds: string[]) {
    const rows = await x
      .select()
      .from(services)
      .where(
        and(
          eq(services.professionalId, professionalId),
          inArray(services.id, serviceIds),
          eq(services.active, true),
        ),
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const list = serviceIds.map((id) => byId.get(id));
    if (list.some((s) => !s)) throw new AppError(400, 'UNKNOWN_SERVICE', 'Serviço não encontrado');
    const items = list as (typeof rows)[number][];
    return {
      items,
      durationMin: items.reduce((n, s) => n + s.durationMin, 0),
      priceCents: items.reduce((n, s) => n + s.priceCents, 0),
    };
  }

  async function assertFree(
    x: Exec,
    professionalId: string,
    timezone: string,
    slot: Interval,
    isFitIn: boolean,
    excludeAppointmentId?: string,
  ) {
    const date = utcToZoned(new Date(slot.start), timezone).date;
    const day = await loadDay(x, professionalId, timezone, date, {
      extra: slot,
      excludeAppointmentId,
    });
    const problem = checkSlot(day, slot, isFitIn);
    if (problem) throw new AppError(409, problem, SLOT_PROBLEMS[problem]);
  }

  /** The DB exclusion constraint is the final word when two bookings race. */
  async function guardOverlap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (pgCode(err) === PG_EXCLUSION)
        throw new AppError(409, 'CONFLICT', 'Esse horário acabou de ser ocupado');
      throw err;
    }
  }

  async function record(
    x: Exec,
    ctx: AgendaCtx,
    appointmentId: string,
    type: AppointmentEventType,
    description: string,
    payload: Record<string, unknown> = {},
  ) {
    await x
      .insert(appointmentEvents)
      .values({ appointmentId, type, description, actor: ctx.actor });
    await x.insert(auditLog).values({
      professionalId: ctx.professionalId,
      actor: ctx.actor,
      action: `appointment.${type}`,
      payload: { appointmentId, ...payload },
    });
  }

  async function views(x: Exec, professionalId: string, ids: string[]): Promise<AppointmentView[]> {
    if (ids.length === 0) return [];
    const rows = await x
      .select({ a: appointments, clientName: clients.name })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .where(and(eq(appointments.professionalId, professionalId), inArray(appointments.id, ids)))
      .orderBy(asc(appointments.startsAt));
    const items = await x
      .select()
      .from(appointmentServices)
      .where(inArray(appointmentServices.appointmentId, ids))
      .orderBy(asc(appointmentServices.createdAt));
    return rows.map(({ a, clientName }) => ({
      ...wire(a),
      clientName,
      services: items
        .filter((s) => s.appointmentId === a.id)
        .map(({ serviceId, name, durationMin, priceCents }) => ({
          serviceId,
          name,
          durationMin,
          priceCents,
        })),
    }));
  }

  async function view(x: Exec, professionalId: string, id: string) {
    const [v] = await views(x, professionalId, [id]);
    if (!v) throw notFound('Agendamento');
    return v;
  }

  async function lockOwn(tx: Tx, professionalId: string, id: string) {
    const [a] = await tx
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, id), eq(appointments.professionalId, professionalId)))
      .for('update');
    if (!a) throw notFound('Agendamento');
    return a;
  }

  async function announce(
    ctx: AgendaCtx,
    change: AppointmentChange,
    appointment: AppointmentView,
    notice: ClientNotice | null = null,
    previous: AppointmentChangedHookEvent['previous'] = null,
  ) {
    await bus
      .publish(ctx.professionalId, realtimeEvent('appointment.changed', { change, appointment }))
      .catch((err: unknown) => deps.log?.error({ err }, 'realtime publish failed'));
    await runHooks(changedHooks, {
      professionalId: ctx.professionalId,
      change,
      appointment,
      actor: ctx.actor,
      notice,
      previous,
    });
  }

  async function freed(e: SlotFreedHookEvent) {
    if (new Date(e.endsAt) > now()) await runHooks(freedHooks, e);
  }

  // ---------------------------------------------------------------- reads

  /** Free start times for `durationMin` on a local date (`buscar_vagas`, GET /slots). */
  async function findFreeSlots(
    professionalId: string,
    date: string,
    durationMin: number,
    opts: { period?: DayPeriod; stepMin?: number } = {},
  ): Promise<Slot[]> {
    const p = await loadProfessional(db, professionalId);
    const day = await loadDay(db, professionalId, p.timezone, date);
    const range = opts.period && PERIOD_RANGE[opts.period];
    return computeFreeSlots(day, durationMin, { stepMin: opts.stepMin, now: now().getTime() })
      .filter((s) => {
        if (!range) return true;
        const m = utcToZoned(new Date(s.start), p.timezone).minutes;
        return m >= range[0] && m < range[1];
      })
      .map((s) => ({
        startsAt: new Date(s.start).toISOString(),
        endsAt: new Date(s.end).toISOString(),
      }));
  }

  /** Total duration of the given services (400 if any is unknown/inactive). */
  async function servicesDuration(professionalId: string, serviceIds: string[]) {
    return (await resolveServices(db, professionalId, serviceIds)).durationMin;
  }

  /** GET /agenda?date= (`listar_agenda`). Cancelled ones are included for the timeline. */
  async function getDay(professionalId: string, date: string): Promise<AgendaResponse> {
    const p = await loadProfessional(db, professionalId);
    const day = await loadDay(db, professionalId, p.timezone, date);
    const b = dayBounds(date, p.timezone);
    const [wh] = await db
      .select()
      .from(workingHours)
      .where(
        and(
          eq(workingHours.professionalId, professionalId),
          eq(workingHours.weekday, weekdayOf(date)),
        ),
      );
    const off = await db
      .select()
      .from(timeOff)
      .where(
        and(
          eq(timeOff.professionalId, professionalId),
          lt(timeOff.startsAt, b.end),
          gt(timeOff.endsAt, b.start),
        ),
      )
      .orderBy(asc(timeOff.startsAt));
    const ids = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.professionalId, professionalId),
          gte(appointments.startsAt, b.start),
          lt(appointments.startsAt, b.end),
        ),
      );
    const list = await views(
      db,
      professionalId,
      ids.map((r) => r.id),
    );
    const counted = list.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');
    const [shortest] = await db
      .select({ d: services.durationMin })
      .from(services)
      .where(and(eq(services.professionalId, professionalId), eq(services.active, true)))
      .orderBy(asc(services.durationMin))
      .limit(1);
    return {
      date,
      timezone: p.timezone,
      workingHours: wh ? wire(wh) : null,
      timeOff: off.map(wire),
      appointments: list,
      summary: {
        appointmentsCount: counted.length,
        freeSlotsCount: countFittingSlots(day, shortest?.d ?? 30, now().getTime()),
        expectedRevenueCents: counted.reduce((n, a) => n + a.priceCents, 0),
      },
    };
  }

  /** GET /appointments/:id: view + client + short history. */
  async function getAppointment(professionalId: string, id: string): Promise<AppointmentDetail> {
    const v = await view(db, professionalId, id);
    const [client] = await db.select().from(clients).where(eq(clients.id, v.clientId));
    const events = await db
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, id))
      .orderBy(asc(appointmentEvents.createdAt));
    return { ...v, client: wire(client!), events: events.map(wire) };
  }

  /** GET /clients/:id/appointments: the client's history, newest first. */
  async function clientAppointments(professionalId: string, clientId: string) {
    const [c] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.professionalId, professionalId)));
    if (!c) throw notFound('Cliente');
    const ids = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(eq(appointments.professionalId, professionalId), eq(appointments.clientId, clientId)),
      );
    const list = await views(
      db,
      professionalId,
      ids.map((r) => r.id),
    );
    return list.reverse();
  }

  /** Short history entry written by other modules (reminder, delay notice). */
  async function addEvent(
    ctx: AgendaCtx,
    appointmentId: string,
    type: AppointmentEventType,
    description: string,
  ) {
    await record(db, ctx, appointmentId, type, description);
  }

  // ---------------------------------------------------------------- writes

  /** Books a client (existing `clientId` or `newClient`) at `startsAt` for the given services. */
  async function book(
    ctx: AgendaCtx,
    input: {
      clientId?: string;
      newClient?: ClientCreate;
      serviceIds: string[];
      startsAt: string | Date;
      isFitIn?: boolean;
      notice?: ClientNotice;
    },
  ): Promise<AppointmentView> {
    const isFitIn = input.isFitIn ?? false;
    const id = await guardOverlap(() =>
      db.transaction(async (tx) => {
        const p = await loadProfessional(tx, ctx.professionalId);
        const svc = await resolveServices(tx, ctx.professionalId, input.serviceIds);
        const clientId = await resolveClient(tx, ctx, input);
        const start = new Date(input.startsAt);
        const slot = { start: start.getTime(), end: start.getTime() + svc.durationMin * MIN };
        await assertFree(tx, ctx.professionalId, p.timezone, slot, isFitIn);
        const [a] = await tx
          .insert(appointments)
          .values({
            professionalId: ctx.professionalId,
            clientId,
            startsAt: start,
            endsAt: new Date(slot.end),
            origin: ctx.actor === 'ai' ? 'ai' : 'professional',
            isFitIn,
            priceCents: svc.priceCents,
          })
          .returning({ id: appointments.id });
        await tx.insert(appointmentServices).values(
          svc.items.map((s) => ({
            appointmentId: a!.id,
            serviceId: s.id,
            name: s.name,
            durationMin: s.durationMin,
            priceCents: s.priceCents,
          })),
        );
        const description =
          ctx.actor === 'ai'
            ? 'Marcado pela IA via WhatsApp'
            : `${WHO[ctx.actor]} marcou${isFitIn ? ' (encaixe)' : ''}`;
        await record(tx, ctx, a!.id, 'booked', description, {
          startsAt: start.toISOString(),
          isFitIn,
        });
        return a!.id;
      }),
    );
    const v = await view(db, ctx.professionalId, id);
    await announce(ctx, 'created', v, input.notice ?? null);
    return v;
  }

  async function resolveClient(
    tx: Tx,
    ctx: AgendaCtx,
    input: { clientId?: string; newClient?: ClientCreate },
  ): Promise<string> {
    if (input.clientId) {
      const [c] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.professionalId, ctx.professionalId)));
      if (!c) throw notFound('Cliente');
      return c.id;
    }
    if (!input.newClient) throw new AppError(400, 'CLIENT_REQUIRED', 'Escolha um cliente');
    // Same phone = same client: reuse instead of failing on the unique index.
    const [c] = await tx
      .insert(clients)
      .values({
        professionalId: ctx.professionalId,
        name: input.newClient.name,
        phone: input.newClient.phone,
        preferences: input.newClient.preferences ?? { notes: [] },
        origin: ctx.actor === 'ai' || ctx.actor === 'client' ? 'whatsapp' : 'manual',
      })
      .onConflictDoUpdate({
        target: [clients.professionalId, clients.phone],
        set: { updatedAt: new Date() },
      })
      .returning({ id: clients.id });
    return c!.id;
  }

  /** Moves an active appointment (and optionally changes its services). Status goes back to scheduled. */
  async function reschedule(
    ctx: AgendaCtx,
    id: string,
    input: { startsAt: string | Date; serviceIds?: string[]; notice?: ClientNotice },
  ): Promise<AppointmentView> {
    const result = await guardOverlap(() =>
      db.transaction(async (tx) => {
        const p = await loadProfessional(tx, ctx.professionalId);
        const a = await lockOwn(tx, ctx.professionalId, id);
        if (a.status !== 'scheduled' && a.status !== 'confirmed')
          throw new AppError(409, 'INVALID_STATUS', 'Esse agendamento não pode ser remarcado');
        const svc = input.serviceIds
          ? await resolveServices(tx, ctx.professionalId, input.serviceIds)
          : null;
        const durationMs = svc ? svc.durationMin * MIN : a.endsAt.getTime() - a.startsAt.getTime();
        const start = new Date(input.startsAt);
        const slot = { start: start.getTime(), end: start.getTime() + durationMs };
        await assertFree(tx, ctx.professionalId, p.timezone, slot, a.isFitIn, a.id);
        await tx
          .update(appointments)
          .set({
            startsAt: start,
            endsAt: new Date(slot.end),
            status: 'scheduled',
            ...(svc && { priceCents: svc.priceCents }),
          })
          .where(eq(appointments.id, a.id));
        if (svc) {
          await tx.delete(appointmentServices).where(eq(appointmentServices.appointmentId, a.id));
          await tx.insert(appointmentServices).values(
            svc.items.map((s) => ({
              appointmentId: a.id,
              serviceId: s.id,
              name: s.name,
              durationMin: s.durationMin,
              priceCents: s.priceCents,
            })),
          );
        }
        const sameDay =
          utcToZoned(a.startsAt, p.timezone).date === utcToZoned(start, p.timezone).date;
        const fmt = sameDay ? hhmm : ddmmHhmm;
        await record(
          tx,
          ctx,
          a.id,
          'rescheduled',
          `${WHO[ctx.actor]} remarcou de ${fmt(a.startsAt, p.timezone)} para ${fmt(start, p.timezone)}`,
          { from: a.startsAt.toISOString(), to: start.toISOString() },
        );
        const serviceIds = (
          await tx
            .select({ id: appointmentServices.serviceId })
            .from(appointmentServices)
            .where(eq(appointmentServices.appointmentId, a.id))
        ).flatMap((r) => (r.id ? [r.id] : []));
        return {
          previous: { startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() },
          serviceIds,
        };
      }),
    );
    const v = await view(db, ctx.professionalId, id);
    await announce(ctx, 'rescheduled', v, input.notice ?? null, result.previous);
    await freed({
      professionalId: ctx.professionalId,
      appointmentId: id,
      serviceIds: result.serviceIds,
      ...result.previous,
      reason: 'rescheduled',
      offerToWaitlist: true,
    });
    return v;
  }

  /** Generic status move with its history entry. */
  async function transition(
    ctx: AgendaCtx,
    id: string,
    from: readonly AppointmentStatus[],
    to: AppointmentStatus,
    type: AppointmentEventType,
    description: string,
    extra: { cancelReason?: string } = {},
  ) {
    return db.transaction(async (tx) => {
      const a = await lockOwn(tx, ctx.professionalId, id);
      if (!from.includes(a.status))
        throw new AppError(409, 'INVALID_STATUS', 'Esse agendamento não está mais nesse estado');
      await tx
        .update(appointments)
        .set({
          status: to,
          ...(extra.cancelReason !== undefined && { cancelReason: extra.cancelReason }),
        })
        .where(eq(appointments.id, a.id));
      await record(tx, ctx, a.id, type, description, { from: a.status, to });
      return a;
    });
  }

  async function cancel(
    ctx: AgendaCtx,
    id: string,
    input: { reason?: string; offerToWaitlist?: boolean; notice?: ClientNotice } = {},
  ): Promise<AppointmentView> {
    const reason = input.reason?.trim() || null;
    const a = await transition(
      ctx,
      id,
      ACTIVE,
      'cancelled',
      'cancelled',
      `${WHO[ctx.actor]} cancelou${reason ? `: ${reason}` : ''}`,
      { cancelReason: reason ?? undefined },
    );
    const v = await view(db, ctx.professionalId, id);
    await announce(ctx, 'cancelled', v, input.notice ?? null);
    await freed({
      professionalId: ctx.professionalId,
      appointmentId: id,
      serviceIds: v.services.flatMap((s) => (s.serviceId ? [s.serviceId] : [])),
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      reason: 'cancelled',
      offerToWaitlist: input.offerToWaitlist ?? true,
    });
    return v;
  }

  const statusAction =
    (
      from: readonly AppointmentStatus[],
      to: AppointmentStatus,
      type: AppointmentEventType,
      verb: string,
    ) =>
    async (ctx: AgendaCtx, id: string): Promise<AppointmentView> => {
      await transition(ctx, id, from, to, type, `${WHO[ctx.actor]} ${verb}`);
      const v = await view(db, ctx.professionalId, id);
      await announce(ctx, 'status', v);
      return v;
    };

  return {
    findFreeSlots,
    servicesDuration,
    getDay,
    getAppointment,
    clientAppointments,
    addEvent,
    book,
    reschedule,
    cancel,
    /** Reminder answered "1" (`confirmar_presenca`) or the professional confirmed. */
    confirm: statusAction(['scheduled'], 'confirmed', 'confirmed', 'confirmou a presença'),
    markArrived: statusAction(
      ['scheduled', 'confirmed'],
      'in_service',
      'arrived',
      'registrou a chegada',
    ),
    markDone: statusAction(
      ['scheduled', 'confirmed', 'in_service'],
      'done',
      'done',
      'concluiu o atendimento',
    ),
    markNoShow: statusAction(['scheduled', 'confirmed'], 'no_show', 'no_show', 'marcou falta'),
    /** Runs after every committed change (B1/C1: client message, reminder jobs). Returns unsubscribe. */
    onAppointmentChanged(fn: (e: AppointmentChangedHookEvent) => unknown) {
      changedHooks.add(fn);
      return () => changedHooks.delete(fn);
    },
    /** Runs when a future interval is freed by cancel/reschedule (C1: waitlist). Returns unsubscribe. */
    onSlotFreed(fn: (e: SlotFreedHookEvent) => unknown) {
      freedHooks.add(fn);
      return () => freedHooks.delete(fn);
    },
  };
}

export type Agenda = ReturnType<typeof createAgenda>;
