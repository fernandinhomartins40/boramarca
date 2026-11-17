import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import autoload from '@fastify/autoload';
import { randomBytes } from 'node:crypto';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { RequestVerifier } from '@boramarca/alexa';
import { API_PREFIX } from '@boramarca/shared';
import type { Config } from './config';
import { AppError, registerErrorHandler } from './lib/errors';
import { loggerOptions } from './lib/logger';
import auth from './plugins/auth';
import type { OtpSender } from './modules/auth/otp';
import infra from './plugins/infra';
import messaging, { type MessagingOverrides } from './plugins/messaging';
import { healthPayload } from './modules/health';

const here = dirname(fileURLToPath(import.meta.url));

export interface AppOverrides extends MessagingOverrides {
  otpSender?: OtpSender;
  now?: () => Date;
  /** Alexa request verifier (tests: own CA and clock). Default: Amazon's real checks. */
  alexaVerifier?: RequestVerifier;
  /** HTTP used by the Voice Monkey client (tests: simulated). */
  voiceMonkeyFetch?: typeof fetch;
  /** Skill budget for the API calls (default 6 s; tests on a loaded machine use more). */
  alexaTimeoutMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    alexaOverrides: Pick<AppOverrides, 'alexaVerifier' | 'voiceMonkeyFetch' | 'alexaTimeoutMs'>;
  }
}

/** Swagger UI at /v1/docs and the spec at /v1/openapi.json (generated from @boramarca/shared). */
async function registerDocs(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: { title: 'Bora Marca API', version: process.env.npm_package_version ?? '0.0.0' },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: `${API_PREFIX}/docs` });
  app.get(`${API_PREFIX}/openapi.json`, { schema: { hide: true } }, async () => app.swagger());
}

/** `overrides` lets tests swap the OTP sender, WhatsApp gateway, LLM, push and clock. */
export async function buildApp(config: Config, overrides: AppOverrides = {}) {
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : loggerOptions(config.LOG_LEVEL),
    trustProxy: config.TRUST_PROXY,
    // Autoload imports every module (ASK SDK included): 10 s default is short on a busy host.
    pluginTimeout: 120_000,
  });

  // Zod schemas from @boramarca/shared validate input, serialize output and feed OpenAPI.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  // @fastify/cors 11 allows only GET,HEAD,POST by default: the panel and site use PATCH/PUT/DELETE.
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(infra, { config, now: overrides.now });
  await app.register(auth, { otpSender: overrides.otpSender });
  // Per-IP limits only on routes that ask for them (config.rateLimit); counters live in Redis so
  // every API instance shares them. Tests get their own namespace per app.
  await app.register(rateLimit, {
    global: false,
    redis: app.redis,
    nameSpace: `bm-rl:${config.NODE_ENV === 'test' ? randomBytes(4).toString('hex') : 'v1'}:`,
    skipOnError: true,
    errorResponseBuilder: (_req, ctx) =>
      new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Espere um pouco e tente de novo.', {
        retryAfterSeconds: Math.ceil(ctx.ttl / 1000),
      }),
  });
  await app.register(messaging, { overrides });
  app.decorate('alexaOverrides', {
    alexaVerifier: overrides.alexaVerifier,
    voiceMonkeyFetch: overrides.voiceMonkeyFetch,
    alexaTimeoutMs: overrides.alexaTimeoutMs,
  });
  await app.register(websocket);
  // B7: the API description is for development; production does not publish it.
  if (config.NODE_ENV !== 'production') await registerDocs(app);

  // Unversioned liveness probe for Docker/Caddy.
  app.get('/health', async () => healthPayload(config));

  // Each folder in src/modules is a Fastify plugin mounted under /v1 (see src/modules/README.md).
  await app.register(autoload, {
    dir: join(here, 'modules'),
    options: { prefix: API_PREFIX },
    // A folder with an index file loads only that file; tests are never loaded.
    ignorePattern: /\.(test|spec)\.ts$/,
    // Paths come from plan section 9, not from folder names.
    dirNameRoutePrefix: false,
    forceESM: true,
  });

  return app;
}
