import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { routes } from '@boramarca/shared';
import { route } from '../../lib/route';
import type { AgendaCtx } from './service';

export { createAgenda, type Agenda, type AgendaCtx } from './service';

/** GET /agenda, GET /slots, POST /appointments, GET /appointments/:id and status actions. */
const agenda: FastifyPluginAsync = async (app) => {
  const a = routes.agenda;
  const ag = app.agenda;
  const ctx = (req: Pick<FastifyRequest, 'scope'>): AgendaCtx => ({
    professionalId: req.scope.professionalId,
    actor: 'professional',
  });
  const notice = (b: { notifyClient: boolean; messageText?: string }) => ({
    notifyClient: b.notifyClient,
    messageText: b.messageText,
  });

  route(app, a.day, async (req) => ag.getDay(req.scope.professionalId, req.query.date));

  route(app, a.slots, async (req) => {
    const pid = req.scope.professionalId;
    const durationMin = await ag.servicesDuration(pid, req.query.serviceIds);
    return {
      date: req.query.date,
      durationMin,
      slots: await ag.findFreeSlots(pid, req.query.date, durationMin),
    };
  });

  route(app, a.create, async (req) => {
    const v = await ag.book(ctx(req), { ...req.body, notice: notice(req.body) });
    return ag.getAppointment(req.scope.professionalId, v.id);
  });

  route(app, a.get, async (req) => ag.getAppointment(req.scope.professionalId, req.params.id));

  route(app, a.reschedule, async (req) =>
    ag.reschedule(ctx(req), req.params.id, { ...req.body, notice: notice(req.body) }),
  );
  route(app, a.cancel, async (req) =>
    ag.cancel(ctx(req), req.params.id, { ...req.body, notice: notice(req.body) }),
  );
  route(app, a.arrive, async (req) => ag.markArrived(ctx(req), req.params.id));
  route(app, a.done, async (req) => ag.markDone(ctx(req), req.params.id));
  route(app, a.noShow, async (req) => ag.markNoShow(ctx(req), req.params.id));
};

export default agenda;
