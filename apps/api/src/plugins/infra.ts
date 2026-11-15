import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import type { Config } from '../config';
import { createDb, type Db } from '../db/client';
import { createRedisEventBus, type EventBus } from '../lib/event-bus';
import { createAgenda, type Agenda } from '../modules/agenda/service';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    redis: Redis;
    /** Realtime events per professional (Redis pub/sub). */
    bus: EventBus;
    /** Agenda motor (plan section 4), shared by routes, workers and AI tools. */
    agenda: Agenda;
  }
}

/** Decorates the app with config, Drizzle, Redis, the event bus and the agenda. Connections are lazy. */
export default fp<{ config: Config }>(async (app, { config }) => {
  const { db, sql } = createDb(config.DATABASE_URL);
  // maxRetriesPerRequest: null is what BullMQ requires for connections it reuses.
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
  const bus = createRedisEventBus(config.REDIS_URL);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('redis', redis);
  app.decorate('bus', bus);
  app.decorate('agenda', createAgenda({ db, bus, log: app.log }));
  app.addHook('onClose', async () => {
    await bus.close();
    await sql.end({ timeout: 5 });
    if (redis.status === 'ready') await redis.quit();
    else redis.disconnect();
  });
});
