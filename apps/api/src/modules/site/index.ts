import type { FastifyPluginAsync } from 'fastify';
import { routes } from '@boramarca/shared';
import { leads } from '../../db/schema';
import { route } from '../../lib/route';

/** POST /leads: contact form of the public site (no auth, per-IP limit, honeypot in the schema). */
const site: FastifyPluginAsync = async (app) => {
  route(
    app,
    routes.site.createLead,
    async (req) => {
      // `website` is the honeypot: the contract rejects any non-empty value (400).
      const { name, phone, profession, message, source } = req.body;
      const [row] = await app.db
        .insert(leads)
        .values({ name, phone, profession, message, source })
        .returning({ id: leads.id });
      req.log.info({ leadId: row!.id, source }, 'lead received');
      return { ok: true as const, id: row!.id };
    },
    { config: { rateLimit: { max: app.config.RATE_LIMIT_LEADS_MAX, timeWindow: '10 minutes' } } },
  );
};

export default site;
