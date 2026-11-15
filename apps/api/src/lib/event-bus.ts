import { Redis } from 'ioredis';
import type { RealtimeEvent, RealtimeEventOf, RealtimeEventType } from '@boramarca/shared';

/**
 * Realtime events scoped to one professional. `publish` from anywhere (routes, the agenda engine,
 * B1's workers); the WebSocket route `subscribe`s per connected professional.
 */
export interface EventBus {
  publish(professionalId: string, event: RealtimeEvent): Promise<void>;
  /** Returns the unsubscribe function. */
  subscribe(professionalId: string, listener: (event: RealtimeEvent) => void): () => void;
  close(): Promise<void>;
}

/** Builds an event with `at = now`. */
export const realtimeEvent = <T extends RealtimeEventType>(
  type: T,
  data: RealtimeEventOf<T>['data'],
): RealtimeEventOf<T> => ({ type, at: new Date().toISOString(), data }) as RealtimeEventOf<T>;

function localFanout() {
  const listeners = new Map<string, Set<(e: RealtimeEvent) => void>>();
  return {
    listeners,
    emit(professionalId: string, event: RealtimeEvent) {
      for (const l of listeners.get(professionalId) ?? []) l(event);
    },
    add(professionalId: string, l: (e: RealtimeEvent) => void) {
      const set = listeners.get(professionalId) ?? new Set();
      set.add(l);
      listeners.set(professionalId, set);
      return () => {
        set.delete(l);
        if (set.size === 0) listeners.delete(professionalId);
      };
    },
  };
}

/** Single-process bus (tests, scripts). */
export function createMemoryEventBus(): EventBus {
  const fan = localFanout();
  return {
    publish: async (id, e) => fan.emit(id, e),
    subscribe: (id, l) => fan.add(id, l),
    close: async () => fan.listeners.clear(),
  };
}

const CHANNEL = 'boramarca:rt:';

/**
 * Redis pub/sub bus: events published by any process (API, workers) reach the WebSockets of
 * every API instance. The subscriber connection opens on the first `subscribe`.
 */
export function createRedisEventBus(redisUrl: string): EventBus {
  const fan = localFanout();
  const pub = new Redis(redisUrl, { lazyConnect: true });
  let sub: Redis | null = null;
  const ensureSub = () => {
    if (sub) return;
    sub = new Redis(redisUrl);
    void sub.psubscribe(`${CHANNEL}*`);
    sub.on('pmessage', (_p, channel, raw) => {
      fan.emit(channel.slice(CHANNEL.length), JSON.parse(raw) as RealtimeEvent);
    });
  };
  return {
    async publish(id, e) {
      await pub.publish(CHANNEL + id, JSON.stringify(e));
    },
    subscribe(id, l) {
      ensureSub();
      return fan.add(id, l);
    },
    async close() {
      fan.listeners.clear();
      for (const c of [pub, sub]) {
        if (!c) continue;
        if (c.status === 'ready') await c.quit();
        else c.disconnect();
      }
    },
  };
}
