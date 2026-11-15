import { SEND_GUARD_DEFAULTS } from '@boramarca/shared';
import type { SendGuardConfig, SendIntent } from './guard';

export type OutboxAction = 'send' | 'hold' | 'drop';

/**
 * What to do with a queued outbound message (plan section 7): while the session is down it is
 * held; after `dropQueuedAfterMinutes` it is dropped (and audited), even after reconnecting.
 * The physical queue (BullMQ `outbound`) lives in the API; this is its decision rule.
 */
export function decideOutbox(
  item: Pick<SendIntent, 'queuedAt'>,
  state: { now: Date; sessionConnected: boolean },
  config: Pick<SendGuardConfig, 'dropQueuedAfterMinutes'> = SEND_GUARD_DEFAULTS,
): OutboxAction {
  if (state.now.getTime() - item.queuedAt.getTime() > config.dropQueuedAfterMinutes * 60_000) {
    return 'drop';
  }
  return state.sessionConnected ? 'send' : 'hold';
}

/** Splits a backlog (oldest first) into what to send now, keep holding and drop. */
export function partitionOutbox<T extends Pick<SendIntent, 'queuedAt'>>(
  items: readonly T[],
  state: { now: Date; sessionConnected: boolean },
  config: Pick<SendGuardConfig, 'dropQueuedAfterMinutes'> = SEND_GUARD_DEFAULTS,
): Record<OutboxAction, T[]> {
  const out: Record<OutboxAction, T[]> = { send: [], hold: [], drop: [] };
  for (const item of [...items].sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())) {
    out[decideOutbox(item, state, config)].push(item);
  }
  return out;
}
