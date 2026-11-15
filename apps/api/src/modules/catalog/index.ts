import { and, asc, eq, gt, inArray, lt, max, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { routes, TimeOffCreate, WorkingHoursCreate } from '@boramarca/shared';
import { services, timeOff, workingHours } from '../../db/schema';
import { AppError, notFound, pgCode, PG_UNIQUE } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';

const weekdayTaken = () =>
  new AppError(409, 'WEEKDAY_TAKEN', 'Esse dia da semana já tem horário cadastrado');

/** Cadastro: CRUD of /services (+ reorder), /working-hours (+ replace week), /time-off. */
const catalog: FastifyPluginAsync = async (app) => {
  const db = app.db;

  // ---- services
  const s = routes.services;
  const own = (pid: string, id: string) =>
    and(eq(services.id, id), eq(services.professionalId, pid));
  const listServices = async (pid: string, includeInactive = true) =>
    (
      await db
        .select()
        .from(services)
        .where(
          and(
            eq(services.professionalId, pid),
            includeInactive ? undefined : eq(services.active, true),
          ),
        )
        .orderBy(asc(services.position), asc(services.createdAt))
    ).map(wire);

  route(app, s.list, async (req) => ({
    items: await listServices(req.scope.professionalId, req.query.includeInactive),
  }));
  route(app, s.create, async (req) => {
    const pid = req.scope.professionalId;
    let position = req.body.position;
    if (position === undefined) {
      const [m] = await db
        .select({ m: max(services.position) })
        .from(services)
        .where(eq(services.professionalId, pid));
      position = m?.m === null || m?.m === undefined ? 0 : m.m + 1;
    }
    const [row] = await db
      .insert(services)
      .values({ ...req.body, position, professionalId: pid })
      .returning();
    return wire(row!);
  });
  route(app, s.get, async (req) => {
    const [row] = await db
      .select()
      .from(services)
      .where(own(req.scope.professionalId, req.params.id));
    if (!row) throw notFound('Serviço');
    return wire(row);
  });
  route(app, s.update, async (req) => {
    const [row] = await db
      .update(services)
      .set(req.body)
      .where(own(req.scope.professionalId, req.params.id))
      .returning();
    if (!row) throw notFound('Serviço');
    return wire(row);
  });
  route(app, s.remove, async (req) => {
    const [row] = await db
      .delete(services)
      .where(own(req.scope.professionalId, req.params.id))
      .returning({ id: services.id });
    if (!row) throw notFound('Serviço');
    return { ok: true as const };
  });
  route(app, s.reorder, async (req) => {
    const pid = req.scope.professionalId;
    const ids = req.body.ids;
    const current = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.professionalId, pid));
    const mine = new Set(current.map((r) => r.id));
    if (
      ids.length !== mine.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !mine.has(id))
    )
      throw new AppError(400, 'REORDER_MISMATCH', 'Envie todos os seus serviços, cada um uma vez');
    await db
      .update(services)
      .set({
        position: sql`(array_position(${sql.param(ids)}::uuid[], ${services.id}) - 1)`,
      })
      .where(and(eq(services.professionalId, pid), inArray(services.id, ids)));
    return { items: await listServices(pid) };
  });

  // ---- working hours
  const w = routes.workingHours;
  const ownWh = (pid: string, id: string) =>
    and(eq(workingHours.id, id), eq(workingHours.professionalId, pid));
  const listWh = async (pid: string) =>
    (
      await db
        .select()
        .from(workingHours)
        .where(eq(workingHours.professionalId, pid))
        .orderBy(asc(workingHours.weekday))
    ).map(wire);
  const uniqueWeekday = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      if (pgCode(err) === PG_UNIQUE) throw weekdayTaken();
      throw err;
    }
  };

  route(app, w.list, async (req) => ({ items: await listWh(req.scope.professionalId) }));
  route(app, w.create, async (req) =>
    uniqueWeekday(async () => {
      const [row] = await db
        .insert(workingHours)
        .values({ ...req.body, professionalId: req.scope.professionalId })
        .returning();
      return wire(row!);
    }),
  );
  route(app, w.get, async (req) => {
    const [row] = await db
      .select()
      .from(workingHours)
      .where(ownWh(req.scope.professionalId, req.params.id));
    if (!row) throw notFound('Horário');
    return wire(row);
  });
  route(app, w.update, async (req) => {
    const where = ownWh(req.scope.professionalId, req.params.id);
    const [cur] = await db.select().from(workingHours).where(where);
    if (!cur) throw notFound('Horário');
    // Validate the merged row with the same rules as create (end after start, lunch inside).
    const merged = WorkingHoursCreate.safeParse({
      weekday: cur.weekday,
      start: cur.start,
      end: cur.end,
      lunchStart: cur.lunchStart,
      lunchEnd: cur.lunchEnd,
      ...req.body,
    });
    if (!merged.success)
      throw new AppError(400, 'VALIDATION', merged.error.issues[0]?.message ?? 'Horário inválido');
    return uniqueWeekday(async () => {
      const [row] = await db.update(workingHours).set(merged.data).where(where).returning();
      return wire(row!);
    });
  });
  route(app, w.remove, async (req) => {
    const [row] = await db
      .delete(workingHours)
      .where(ownWh(req.scope.professionalId, req.params.id))
      .returning({ id: workingHours.id });
    if (!row) throw notFound('Horário');
    return { ok: true as const };
  });
  route(app, w.replace, async (req) => {
    const pid = req.scope.professionalId;
    const days = req.body.items.map((i) => i.weekday);
    if (new Set(days).size !== days.length) throw weekdayTaken();
    await db.transaction(async (tx) => {
      await tx.delete(workingHours).where(eq(workingHours.professionalId, pid));
      if (req.body.items.length)
        await tx
          .insert(workingHours)
          .values(req.body.items.map((i) => ({ ...i, professionalId: pid })));
    });
    return { items: await listWh(pid) };
  });

  // ---- time off
  const t = routes.timeOff;
  const ownOff = (pid: string, id: string) =>
    and(eq(timeOff.id, id), eq(timeOff.professionalId, pid));

  route(app, t.list, async (req) => {
    const { from, to } = req.query;
    const rows = await db
      .select()
      .from(timeOff)
      .where(
        and(
          eq(timeOff.professionalId, req.scope.professionalId),
          to ? lt(timeOff.startsAt, new Date(to)) : undefined,
          from ? gt(timeOff.endsAt, new Date(from)) : undefined,
        ),
      )
      .orderBy(asc(timeOff.startsAt));
    return { items: rows.map(wire) };
  });
  route(app, t.create, async (req) => {
    const [row] = await db
      .insert(timeOff)
      .values({
        professionalId: req.scope.professionalId,
        startsAt: new Date(req.body.startsAt),
        endsAt: new Date(req.body.endsAt),
        reason: req.body.reason,
      })
      .returning();
    return wire(row!);
  });
  route(app, t.get, async (req) => {
    const [row] = await db
      .select()
      .from(timeOff)
      .where(ownOff(req.scope.professionalId, req.params.id));
    if (!row) throw notFound('Folga');
    return wire(row);
  });
  route(app, t.update, async (req) => {
    const where = ownOff(req.scope.professionalId, req.params.id);
    const [cur] = await db.select().from(timeOff).where(where);
    if (!cur) throw notFound('Folga');
    const merged = TimeOffCreate.safeParse({ ...wire(cur), ...req.body });
    if (!merged.success)
      throw new AppError(400, 'VALIDATION', merged.error.issues[0]?.message ?? 'Período inválido');
    const [row] = await db
      .update(timeOff)
      .set({
        startsAt: new Date(merged.data.startsAt),
        endsAt: new Date(merged.data.endsAt),
        reason: merged.data.reason,
      })
      .where(where)
      .returning();
    return wire(row!);
  });
  route(app, t.remove, async (req) => {
    const [row] = await db
      .delete(timeOff)
      .where(ownOff(req.scope.professionalId, req.params.id))
      .returning({ id: timeOff.id });
    if (!row) throw notFound('Folga');
    return { ok: true as const };
  });
};

export default catalog;
