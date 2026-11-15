import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import autoload from '@fastify/autoload';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { API_PREFIX } from '@boramarca/shared';
import type { Config } from './config';
import { registerErrorHandler } from './lib/errors';
import auth from './plugins/auth';
import type { OtpSender } from './modules/auth/otp';
import infra from './plugins/infra';
import { healthPayload } from './modules/health';

const here = dirname(fileURLToPath(import.meta.url));

/** `overrides` lets tests (and a future SMS provider) swap the OTP sender. */
export async function buildApp(config: Config, overrides: { otpSender?: OtpSender } = {}) {
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL },
  });

  // Zod schemas from @boramarca/shared validate input, serialize output and feed OpenAPI.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(cors, { origin: config.CORS_ORIGINS });
  await app.register(infra, { config });
  await app.register(auth, { otpSender: overrides.otpSender });
  await app.register(websocket);
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

  // Unversioned liveness probe for Docker/Caddy.
  app.get('/health', async () => healthPayload());

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
