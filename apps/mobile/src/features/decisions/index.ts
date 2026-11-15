import { useEffect, useState } from 'react';
import type { AnswerVia, DecisionAnswerResponse, Id } from '@boramarca/shared';
import { data } from '@/data';
import { onSimulation } from '@/dev/simulations';

/**
 * Decisions (prompt 05). Owner: agent C2.
 * `handleDecisionAction` is the single path to answer a decision: the tab, the notification action
 * and the voice (Modo Balcão) all call it (plan section 11). C2 adds preview, toast and refresh.
 */
export function handleDecisionAction(
  decisionId: Id,
  answer: { optionId: string } | { text: string },
  via: AnswerVia,
): Promise<DecisionAnswerResponse> {
  return data.decisions.answer(decisionId, { ...answer, via });
}

const REFRESH_MS = 30_000;

/** Pending count for the Decisões tab badge. Refreshes every 30 s and on the dev simulation. */
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
    const off = onSimulation('decision-new', load);
    return () => {
      alive = false;
      clearInterval(timer);
      off();
    };
  }, []);
  return count;
}
