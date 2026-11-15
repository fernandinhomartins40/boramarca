import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { firstName, renderMessage } from '@boramarca/ia';
import { routes } from '@boramarca/shared';
import { loadPro } from '../../lib/core';
import { AppError } from '../../lib/errors';
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
  route(app, a.confirm, async (req) => ag.confirm(ctx(req), req.params.id));

  // "Estou atrasado": message to the client through the send guard + history entry.
  route(app, a.delayNotice, async (req) => {
    const pid = req.scope.professionalId;
    const appt = await ag.getAppointment(pid, req.params.id);
    if (!['scheduled', 'confirmed'].includes(appt.status))
      throw new AppError(409, 'INVALID_STATUS', 'Esse agendamento não está mais ativo');
    const pro = await loadPro(app.db, pid);
    const { delayMinutes } = req.body;
    const text =
      req.body.messageText ??
      renderMessage('delay_notice', pro.p.aiTone, {
        now: app.now().toISOString(),
        timezone: pro.salon.timezone,
        clientFirstName: firstName(appt.clientName),
        startsAt: appt.startsAt,
        delayMinutes,
      });
    const m = await app.messaging.outbox.enqueue({
      professionalId: pid,
      clientId: appt.clientId,
      text,
      purpose: 'notice',
      author: 'professional',
    });
    if (!m) throw new AppError(409, 'NO_SESSION', 'Conecte o WhatsApp primeiro');
    await ag.addEvent(
      ctx(req),
      appt.id,
      'delay_notice_sent',
      `Você avisou atraso de ${delayMinutes} min`,
    );
    return { ok: true as const, sentText: text };
  });
};

export default agenda;
