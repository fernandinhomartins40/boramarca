import { useEffect, useState } from 'react';
import { data } from '@/data';
import { onSimulation } from '@/dev/simulations';
import { handleDecisionAction } from '@/features/decisions';
import { createBalcaoController, type BalcaoController } from './controller';
import { getBalcaoEngines } from './engines';
import { initialSnapshot } from './machine';
import { useBalcaoStore } from './store';

// shortcut: polling until the app has the realtime channel (decision.created); swap for it then.
const POLL_MS = 15_000;
const VOLUME_MS = 30_000;

/**
 * Runs Modo Balcão while the screen is mounted: wake word, new-decision watch, volume check and
 * the `active` flag in useBalcaoStore. Returns the controller (dev panel, Sim/Não buttons).
 */
export function useBalcao(): BalcaoController {
  const [controller] = useState(() =>
    createBalcaoController({
      engines: getBalcaoEngines(),
      answer: (id, answer, via) => handleDecisionAction(id, answer, via),
      ask: (text) => data.voice.command({ text }),
      onChange: (snapshot) => useBalcaoStore.setState({ snapshot }),
    }),
  );

  useEffect(() => {
    const engines = getBalcaoEngines();
    let alive = true;
    let seen: Set<string> | null = null;

    const poll = async () => {
      const res = await data.decisions.list('pending').catch(() => null);
      if (!alive || !res) return;
      const { items } = res;
      // the first load only marks what is already pending: those are in the Decisões tab
      const first = seen === null;
      seen ??= new Set();
      for (const d of items) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        if (!first) controller.decision(d);
      }
    };
    const checkVolume = () =>
      engines.volume
        .getVolume()
        .then((volume) => alive && useBalcaoStore.setState({ volume }))
        .catch(() => undefined);

    useBalcaoStore.setState({ active: true, snapshot: initialSnapshot });
    void controller.start().then(poll);
    void checkVolume();
    const pollTimer = setInterval(poll, POLL_MS);
    const volumeTimer = setInterval(checkVolume, VOLUME_MS);
    const offWake = onSimulation('wake-word', controller.wake);
    const offDecision = onSimulation('decision-new', () => void poll());

    return () => {
      alive = false;
      clearInterval(pollTimer);
      clearInterval(volumeTimer);
      offWake();
      offDecision();
      void controller.stop();
      useBalcaoStore.setState({ active: false, snapshot: initialSnapshot });
    };
  }, [controller]);

  return controller;
}
