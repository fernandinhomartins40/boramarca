import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import autoload from '@fastify/autoload';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { API_PREFIX } from '@boramarca/shared';
import type { Config } from './config';
import infra from './plugins/infra';
import { healthPayload } from './modules/health';

const here = dirname(fileURLToPath(import.meta.url));

export async function buildApp(config: Config) {
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL },
  });

  await app.register(cors, { origin: config.CORS_ORIGINS });
  await app.register(infra, { config });

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
