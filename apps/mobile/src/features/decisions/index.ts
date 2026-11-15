import { useEffect, useState } from 'react';
import type { AnswerVia, DecisionAnswerResponse, Id } from '@boramarca/shared';
import { data } from '@/data';
import { onSimulation } from '@/dev/simulations';

export * from './format';

const changed = new Set<() => void>();

/** Called after any decision changes (answer, take over, new one): screens and badge reload. */
export function onDecisionsChanged(handler: () => void): () => void {
  changed.add(handler);
  return () => changed.delete(handler);
}

export function emitDecisionsChanged() {
  changed.forEach((h) => h());
}

/**
 * Decisions (prompt 05). Owner: agent C2.
 * `handleDecisionAction` is the single path to answer a decision: the tab, the agenda strip, the
 * notification action and the voice (Modo Balcão) all call it (plan section 11).
 */
export async function handleDecisionAction(
  decisionId: Id,
  answer: { optionId: string } | { text: string },
  via: AnswerVia,
): Promise<DecisionAnswerResponse> {
  const r = await data.decisions.answer(decisionId, { ...answer, via });
  emitDecisionsChanged();
  return r;
}

const REFRESH_MS = 30_000;

/** Pending count for the Decisões tab badge. Refreshes every 30 s, on changes and on the dev simulation. */
export function usePendingDecisionsCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      data.decisions
        .list('pending')
        .then((r) => alive && setCount(r.items.length))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, REFRESH_MS);
    const offSim = onSimulation('decision-new', load);
    const offChanged = onDecisionsChanged(load);
    return () => {
      alive = false;
      clearInterval(timer);
      offSim();
      offChanged();
    };
  }, []);
  return count;
}
