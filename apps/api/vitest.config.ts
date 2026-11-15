import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests use DATABASE_URL_TEST / REDIS_URL_TEST from the docker infra
    // (defaults in src/test/env.ts). The schema is recreated once per run.
    env: { NODE_ENV: 'test' },
    globalSetup: ['src/test/global-setup.ts'],
    // Run @fastify/autoload through vite so its dynamic import() of src/modules gets TS resolution.
    server: { deps: { inline: ['@fastify/autoload'] } },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
