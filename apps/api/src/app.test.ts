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

describe('production safety (B6, B7)', () => {
  const prod = (over: Record<string, string> = {}) =>
    loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@localhost:5440/none',
      REDIS_URL: 'redis://localhost:6390/1',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
      ...over,
    });

  it('refuses example secrets, equal JWT secrets and a short webhook secret', () => {
    expect(() =>
      prod({ JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => prod({ JWT_REFRESH_SECRET: 'x'.repeat(32) })).toThrow(/JWT_REFRESH_SECRET/);
    expect(() => prod({ WHATSAPP_WEBHOOK_SECRET: 'curto' })).toThrow(/WHATSAPP_WEBHOOK_SECRET/);
    expect(() => prod({ WHATSAPP_WEBHOOK_SECRET: 'change-me-webhook-secret' })).toThrow(
      /WHATSAPP_WEBHOOK_SECRET/,
    );
    expect(prod({ WHATSAPP_WEBHOOK_SECRET: 'w'.repeat(24) }).NODE_ENV).toBe('production');
    // Outside production the examples still work (local .env).
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgres://u:p@localhost:5440/none',
        REDIS_URL: 'redis://localhost:6390/1',
        JWT_ACCESS_SECRET: 'change-me-'.repeat(4),
        JWT_REFRESH_SECRET: 'change-me-'.repeat(4),
      }),
    ).not.toThrow();
  });

  it('does not publish the API docs in production', async () => {
    const app = await buildApp({ ...prod(), LOG_LEVEL: 'silent' });
    try {
      for (const url of ['/v1/docs', '/v1/openapi.json'])
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
