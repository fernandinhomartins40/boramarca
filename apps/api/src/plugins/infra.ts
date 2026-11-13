import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import type { Config } from '../config';
import { createDb, type Db } from '../db/client';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    redis: Redis;
  }
}

/** Decorates the app with config, Drizzle and Redis. Connections are lazy and closed on shutdown. */
export default fp<{ config: Config }>(async (app, { config }) => {
  const { db, sql } = createDb(config.DATABASE_URL);
  // maxRetriesPerRequest: null is what BullMQ requires for connections it reuses.
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    await sql.end({ timeout: 5 });
    if (redis.status === 'ready') await redis.quit();
    else redis.disconnect();
  });
});
