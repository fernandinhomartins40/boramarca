import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@boramarca/shared';

export const healthPayload = (): HealthResponse => ({
  status: 'ok',
  version: process.env.npm_package_version ?? '0.0.0',
  time: new Date().toISOString(),
});

/** GET /v1/health (the root GET /health is registered in app.ts for proxies and Docker). */
const health: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => healthPayload());
};

export default health;
