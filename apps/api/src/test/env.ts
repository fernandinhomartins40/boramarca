// Integration tests run against the Docker infra (infra/docker-compose.yml): Postgres
// database boramarca_test and Redis db 1. Override with DATABASE_URL_TEST / REDIS_URL_TEST.
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://boramarca:boramarca@localhost:5440/boramarca_test';
export const TEST_REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6390/1';
