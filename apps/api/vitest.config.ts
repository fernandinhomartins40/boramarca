import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests (A1+) use DATABASE_URL_TEST / REDIS_URL_TEST from the docker infra.
    env: { NODE_ENV: 'test' },
  },
});
