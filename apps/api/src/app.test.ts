import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponse } from '@boramarca/shared';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://u:p@localhost:5440/none',
  REDIS_URL: 'redis://localhost:6390/1',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
});

describe('app', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp(config);
  });
  afterAll(() => app.close());

  it.each(['/health', '/v1/health'])(
    'GET %s returns 200 without touching db/redis',
    async (url) => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(HealthResponse.parse(res.json()).status).toBe('ok');
    },
  );

  it.each(['DELETE', 'PATCH', 'PUT'])(
    'CORS preflight allows %s from a configured origin',
    async (m) => {
      const origin = config.CORS_ORIGINS[0]!;
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/v1/me',
        headers: { origin, 'access-control-request-method': m },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(String(res.headers['access-control-allow-methods'])).toContain(m);
    },
  );
});

describe('config', () => {
  it('rejects missing required vars', () => {
    expect(() => loadConfig({})).toThrow(/Configuração inválida/);
  });
});
