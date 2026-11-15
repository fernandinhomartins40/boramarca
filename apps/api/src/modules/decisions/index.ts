import type { FastifyPluginAsync } from 'fastify';
import { routes } from '@boramarca/shared';
import { route } from '../../lib/route';

/** GET /decisions, POST /decisions/:id/answer, POST /decisions/:id/take-over. */
const decisions: FastifyPluginAsync = async (app) => {
  const d = routes.decisions;
  const svc = () => app.messaging.decisions;

  route(app, d.list, async (req) => ({
    items: await svc().list(req.scope.professionalId, req.query.status, req.query.limit),
  }));
  route(app, d.answer, async (req) =>
    svc().answer(req.scope.professionalId, req.params.id, req.body),
  );
  route(app, d.takeOver, async (req) => svc().takeOver(req.scope.professionalId, req.params.id));
};

export default decisions;
