// Alexa (plan section 14): the skill endpoint, account linking (OAuth 2.0 + PKCE) and the Voice
// Monkey announcement of new Decisions. The skill itself lives in packages/alexa; this module
// injects the same voice and decision functions the app routes use.
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  authorizeRedirectUrl,
  createAlexaRequestHandler,
  createAlexaSkill,
  createDecisionAnnouncer,
  createRequestVerifier,
  createVoiceMonkeyClient,
  parseAuthorizeRequest,
  parseTokenRequest,
} from '@boramarca/alexa';
import {
  API_PREFIX,
  routes,
  type AlexaOAuthAuthorizeQuery,
  type AlexaSettingsResponse,
  type DecisionView,
} from '@boramarca/shared';
import { alexaSettings } from '../../db/schema';
import { audit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { route } from '../../lib/route';
import { open, parseKey, seal } from '../../lib/secret-box';
import { verifyLogin } from '../auth/login';
import { requestOtp } from '../auth/otp';
import { createVoice } from '../voice/service';
import { linkPage, PAGE_HEADERS, type PageState } from './page';
import { createAlexaStore } from './store';

/** "(11) 98765-4321" → "+5511987654321"; null when it cannot be a phone. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const e164 = raw.trim().startsWith('+')
    ? `+${digits}`
    : digits.length === 10 || digits.length === 11
      ? `+55${digits}`
      : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

const OAUTH_KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'scope',
  'code_challenge',
  'code_challenge_method',
] as const;
const oauthFields = (q: AlexaOAuthAuthorizeQuery) =>
  Object.fromEntries(
    OAUTH_KEYS.flatMap((k) => (q[k] === undefined ? [] : [[k, String(q[k])]])),
  ) as Record<string, string>;

const alexa: FastifyPluginAsync = async (app) => {
  const a = routes.alexa;
  const { db, config } = app;
  const store = createAlexaStore(db, app.now);
  const voice = createVoice(app);
  const key = config.DATA_ENCRYPTION_KEY ? parseKey(config.DATA_ENCRYPTION_KEY) : null;
  const client =
    config.ALEXA_OAUTH_CLIENT_ID && config.ALEXA_OAUTH_CLIENT_SECRET
      ? { clientId: config.ALEXA_OAUTH_CLIENT_ID, clientSecret: config.ALEXA_OAUTH_CLIENT_SECRET }
      : null;
  const warn = (msg: string, err?: unknown) => app.log.warn({ err }, msg);

  // ---- POST /alexa/skill: signature over the exact bytes, so the body stays raw (Buffer).
  const handle = config.ALEXA_SKILL_ID
    ? createAlexaRequestHandler({
        skill: createAlexaSkill({
          skillId: config.ALEXA_SKILL_ID,
          timeoutMs: app.alexaOverrides.alexaTimeoutMs,
          ports: {
            professionalIdFromToken: (token) => store.professionalIdFromToken(token),
            voiceCommand: (pid, body, signal) => voice.command(pid, body, signal),
            listDecisions: (pid, status, limit) => app.messaging.decisions.list(pid, status, limit),
            answerDecision: (pid, id, body) =>
              app.messaging.decisions.answer(pid, id, { ...body, via: 'alexa' }),
          },
        }),
        verify: app.alexaOverrides.alexaVerifier ?? createRequestVerifier(),
        log: warn,
      })
    : null;
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    );
    scope.route({
      method: a.skill.method,
      url: a.skill.path,
      handler: async (req, reply) => {
        if (!handle) return reply.code(503).send({ error: 'alexa not configured' });
        const r = await handle(req.body as Buffer, req.headers);
        return reply.code(r.status).send(r.body);
      },
    });
  });

  // ---- Account linking. The login page posts back to the same URL (form-urlencoded, no JS).
  const page = (reply: FastifyReply, status: number, s: PageState) =>
    reply
      .code(status)
      .headers(PAGE_HEADERS)
      .send(linkPage(`${API_PREFIX}${a.oauthAuthorize.path}`, s));
  const unavailable = 'Vínculo com a Alexa indisponível no momento. Tente mais tarde.';
  const badRequest = 'Pedido de vínculo inválido. Comece de novo pelo app Alexa.';

  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
    );

    scope.get(a.oauthAuthorize.path, async (req, reply) => {
      if (!client) return page(reply, 503, { oauth: null, step: 'phone', error: unavailable });
      // On failure never redirect: the redirect_uri may be hostile.
      const q = parseAuthorizeRequest(req.query, client);
      if (!q.ok) return page(reply, 400, { oauth: null, step: 'phone', error: badRequest });
      return page(reply, 200, { oauth: oauthFields(q.value), step: 'phone' });
    });

    scope.post(
      a.oauthAuthorize.path,
      { config: { rateLimit: { max: config.RATE_LIMIT_OTP_MAX, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const b = (req.body ?? {}) as Record<string, string | undefined>;
        if (!client) return page(reply, 503, { oauth: null, step: 'phone', error: unavailable });
        const q = parseAuthorizeRequest(
          Object.fromEntries(OAUTH_KEYS.flatMap((k) => (b[k] === undefined ? [] : [[k, b[k]]]))),
          client,
        );
        if (!q.ok) return page(reply, 400, { oauth: null, step: 'phone', error: badRequest });
        const oauth = oauthFields(q.value);
        if (b.step === 'restart') return page(reply, 200, { oauth, step: 'phone' });
        const phone = normalizePhone(b.phone ?? '');
        if (!phone)
          return page(reply, 400, {
            oauth,
            step: 'phone',
            phone: b.phone,
            error: 'Confira o número: DDD e celular.',
          });
        try {
          if (b.step !== 'code') {
            await requestOtp(db, config, app.otpSender, phone, 'login');
            return page(reply, 200, { oauth, step: 'code', phone });
          }
          const { scope: s } = await verifyLogin(app, phone, b.code ?? '', {
            createAccount: false,
          });
          const code = await store.issueCode(s.professionalId, q.value);
          await audit(db, s.professionalId, 'professional', 'alexa.link_authorized');
          return reply
            .code(303)
            .header('cache-control', 'no-store')
            .header('location', authorizeRedirectUrl(q.value.redirect_uri, code, q.value.state))
            .send();
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          // A code was already sent a moment ago: go on to typing it.
          const step = b.step === 'code' || err.code === 'OTP_TOO_SOON' ? 'code' : 'phone';
          return page(reply, err.statusCode, { oauth, step, phone, error: err.message });
        }
      },
    );

    // Called by Amazon's servers (many users per IP): no per-IP limit; secrets are 256-bit random.
    scope.post(a.oauthToken.path, async (req, reply) => {
      reply.header('cache-control', 'no-store').header('pragma', 'no-cache');
      if (!client)
        return reply
          .code(503)
          .send({ error: 'invalid_request', error_description: 'indisponível' });
      const t = parseTokenRequest(req.headers.authorization, req.body, client);
      if (!t.ok) {
        if (t.error.error === 'invalid_client') reply.header('www-authenticate', 'Basic');
        return reply.code(t.error.error === 'invalid_client' ? 401 : 400).send(t.error);
      }
      const v = t.value;
      const tokens =
        v.grant_type === 'authorization_code'
          ? await store.exchangeCode(v.code, v.redirect_uri, v.code_verifier)
          : await store.refresh(v.refresh_token);
      if (!tokens)
        return reply
          .code(400)
          .send({ error: 'invalid_grant', error_description: 'código ou token inválido' });
      return tokens;
    });
  });

  // ---- Per-professional settings (the Voice Monkey token is write-only, encrypted at rest).
  async function settingsView(pid: string): Promise<AlexaSettingsResponse> {
    const [s] = await db.select().from(alexaSettings).where(eq(alexaSettings.professionalId, pid));
    return {
      linked: await store.isLinked(pid),
      voiceMonkeyEnabled: s?.voiceMonkeyEnabled ?? false,
      voiceMonkeyDevice: s?.voiceMonkeyDevice ?? null,
      voiceMonkeyTokenSet: Boolean(s?.voiceMonkeyTokenEnc),
    };
  }

  route(app, a.settings, async (req) => settingsView(req.scope.professionalId));

  route(app, a.updateSettings, async (req) => {
    const pid = req.scope.professionalId;
    const { voiceMonkeyToken, voiceMonkeyEnabled, voiceMonkeyDevice } = req.body;
    let voiceMonkeyTokenEnc: string | null | undefined;
    if (voiceMonkeyToken) {
      if (!key)
        throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED', 'Não deu para guardar o token agora');
      voiceMonkeyTokenEnc = seal(key, voiceMonkeyToken);
    } else if (voiceMonkeyToken === null) voiceMonkeyTokenEnc = null;
    const set = {
      voiceMonkeyEnabled,
      voiceMonkeyDevice,
      voiceMonkeyTokenEnc,
      updatedAt: new Date(),
    };
    await db
      .insert(alexaSettings)
      .values({ professionalId: pid, ...set })
      .onConflictDoUpdate({ target: alexaSettings.professionalId, set });
    await audit(db, pid, 'professional', 'alexa.settings_updated', {
      voiceMonkeyEnabled,
      tokenChanged: voiceMonkeyToken !== undefined,
    });
    return settingsView(pid);
  });

  // ---- Proactive announcement: off unless the professional turned it on with a device.
  async function announce(d: DecisionView) {
    const [s] = await db
      .select()
      .from(alexaSettings)
      .where(eq(alexaSettings.professionalId, d.professionalId));
    if (!s?.voiceMonkeyEnabled || !s.voiceMonkeyDevice) return;
    const token =
      s.voiceMonkeyTokenEnc && key ? open(key, s.voiceMonkeyTokenEnc) : config.VOICE_MONKEY_TOKEN;
    if (!token) return;
    createDecisionAnnouncer({
      client: createVoiceMonkeyClient({ token, fetch: app.alexaOverrides.voiceMonkeyFetch }),
      settingsFor: async () => ({
        linked: true,
        voiceMonkeyEnabled: true,
        voiceMonkeyDevice: s.voiceMonkeyDevice,
      }),
      log: warn,
    })(d);
  }
  // Fire-and-forget: the Decision flow never waits for the Echo.
  const off = app.messaging.decisions.onCreated((d) => {
    void announce(d).catch((err: unknown) => warn('voice monkey announce failed', err));
  });
  app.addHook('onClose', async () => {
    off();
  });
};

export default alexa;
