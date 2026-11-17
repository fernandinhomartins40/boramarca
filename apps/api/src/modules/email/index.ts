import type { FastifyPluginAsync } from 'fastify';
import { EMAIL_CONFIRMED_PAGE, routes } from '@boramarca/shared';
import { route } from '../../lib/route';
import { confirmEmail, resendConfirmation } from './service';

/** POST /me/email/resend and GET /email/confirm (the link in the e-mail). */
const email: FastifyPluginAsync = async (app) => {
  const e = routes.email;

  route(app, e.resendConfirmation, async (req) => {
    await resendConfirmation(app.messaging.core, req.scope.professionalId);
    return { ok: true as const };
  });

  route(
    app,
    e.confirm,
    async (req, reply) => {
      const status = await confirmEmail(app.messaging.core, req.query.token);
      const site = app.config.PUBLIC_SITE_URL.replace(/\/$/, '');
      return reply
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .redirect(`${site}${EMAIL_CONFIRMED_PAGE}?status=${status}`, 302) as never;
    },
    { config: { rateLimit: { max: app.config.RATE_LIMIT_OTP_MAX, timeWindow: '10 minutes' } } },
  );
};

export default email;
