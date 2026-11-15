// BullMQ queues of plan sections 5 and 8: `inbound` (webhook -> AI), `outbound` (send guard),
// `decisions` (deadline and expiry jobs), `reminders` (one delayed job per appointment) and
// `waitlist` (offer expiry). Workers run inside the API process.
import { DelayedError, Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAMES = ['inbound', 'outbound', 'decisions', 'reminders', 'waitlist'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export type Processor = (job: Job, token?: string) => Promise<unknown>;

export function createQueues(redisUrl: string, prefix: string) {
  const conns: Redis[] = [];
  // maxRetriesPerRequest: null is required by BullMQ workers.
  const conn = () => {
    const c = new Redis(redisUrl, { maxRetriesPerRequest: null });
    conns.push(c);
    return c;
  };
  const jobDefaults = {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  };
  const queues = Object.fromEntries(
    QUEUE_NAMES.map((n) => [
      n,
      new Queue(n, { connection: conn(), prefix, defaultJobOptions: jobDefaults }),
    ]),
  ) as Record<QueueName, Queue>;
  const workers: Worker[] = [];
  /** Plain connection for locks and counters. */
  const redis = conn();

  return {
    queues,
    redis,
    startWorker(
      name: QueueName,
      processor: Processor,
      concurrency: number,
      onError: (e: unknown) => void,
    ) {
      const w = new Worker(name, processor, { connection: conn(), prefix, concurrency });
      w.on('failed', (_job, err) => onError(err));
      w.on('error', onError);
      workers.push(w);
      return w;
    },
    async close() {
      await Promise.allSettled(workers.map((w) => w.close()));
      await Promise.allSettled(Object.values(queues).map((q) => q.close()));
      for (const c of conns) {
        if (c.status === 'ready') await c.quit().catch(() => c.disconnect());
        else c.disconnect();
      }
    },
  };
}
export type Queues = ReturnType<typeof createQueues>;

/** Puts the job back for a little while without spending an attempt. */
export async function delayJob(job: Job, token: string | undefined, ms: number): Promise<never> {
  await job.moveToDelayed(Date.now() + ms, token);
  throw new DelayedError();
}

/**
 * Runs `fn` holding a Redis lock on `key` (one job per WhatsApp instance or per conversation at a
 * time). When another job holds it, this one is delayed and retried shortly after.
 */
export async function withKeyLock<T>(
  redis: Redis,
  key: string,
  job: Job,
  token: string | undefined,
  fn: () => Promise<T>,
  ttlMs = 120_000,
): Promise<T> {
  const owner = `${job.id}:${Date.now()}`;
  const ok = await redis.set(key, owner, 'PX', ttlMs, 'NX');
  if (!ok) return delayJob(job, token, 300 + Math.floor(Math.random() * 700));
  try {
    return await fn();
  } finally {
    if ((await redis.get(key)) === owner) await redis.del(key);
  }
}
