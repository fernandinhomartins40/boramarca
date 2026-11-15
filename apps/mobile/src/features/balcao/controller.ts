import type { DecisionAnswerResponse, DecisionView, VoiceCommandResponse } from '@boramarca/shared';
import type { BalcaoEngines } from './engines';
import {
  initialSnapshot,
  transition,
  type BalcaoEffect,
  type BalcaoEvent,
  type BalcaoSnapshot,
  type DecisionAnswer,
} from './machine';

export interface BalcaoDeps {
  engines: BalcaoEngines;
  /** handleDecisionAction (the single path to answer a decision). */
  answer(
    decisionId: string,
    answer: DecisionAnswer,
    via: 'voice' | 'app',
  ): Promise<DecisionAnswerResponse>;
  /** data.voice.command (questions after the wake word). */
  ask(text: string): Promise<VoiceCommandResponse>;
  onChange(snapshot: BalcaoSnapshot): void;
}

export interface BalcaoController {
  send(event: BalcaoEvent): void;
  wake(): void;
  hear(text: string): void;
  decision(decision: DecisionView): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly snapshot: BalcaoSnapshot;
}

const errorSpeech = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'Não consegui agora. Tenta pela aba Decisões.';

/** Runs the pure machine against the engines. No React: the screen and the tests both drive it. */
export function createBalcaoController(deps: BalcaoDeps): BalcaoController {
  const { engines } = deps;
  let snapshot = initialSnapshot;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // bumps on STOP and on every new speech so late callbacks from an old run are dropped
  let speechRun = 0;
  let running = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function run(effect: BalcaoEffect) {
    switch (effect.type) {
      case 'speak': {
        const id = ++speechRun;
        void (async () => {
          if (effect.chime) await engines.chime();
          if (id !== speechRun) return;
          await engines.textToSpeech.speak(effect.text, (charIndex) => {
            if (id === speechRun) send({ type: 'BOUNDARY', charIndex });
          });
          if (id === speechRun) send({ type: 'SPEECH_DONE' });
        })();
        return;
      }
      case 'stopSpeaking':
        speechRun++;
        void engines.textToSpeech.stop().catch(() => undefined);
        return;
      case 'listen':
        void engines.speechToText
          .start({
            onPartial: (text) => send({ type: 'PARTIAL', text }),
            onResult: (text) => send({ type: 'HEARD', text }),
          })
          .then(() => send({ type: 'LISTENING' }))
          .catch(() => send({ type: 'TIMEOUT' }));
        return;
      case 'stopListening':
        void engines.speechToText.stop().catch(() => undefined);
        return;
      case 'startTimer':
        clearTimer();
        timer = setTimeout(() => {
          timer = null;
          send({ type: 'TIMEOUT' });
        }, effect.ms);
        return;
      case 'clearTimer':
        clearTimer();
        return;
      case 'answer':
        deps
          .answer(effect.decisionId, effect.answer, effect.via)
          .then((r) => send({ type: 'REPLY', speech: r.spokenConfirmation }))
          .catch((e: unknown) => send({ type: 'REPLY', speech: errorSpeech(e) }));
        return;
      case 'ask':
        deps
          .ask(effect.text)
          .then((r) => send({ type: 'REPLY', speech: r.speech }))
          .catch((e: unknown) => send({ type: 'REPLY', speech: errorSpeech(e) }));
        return;
    }
  }

  function send(event: BalcaoEvent) {
    if (!running && event.type !== 'STOP') return;
    const next = transition(snapshot, event);
    if (next.snapshot !== snapshot) {
      snapshot = next.snapshot;
      deps.onChange(snapshot);
    }
    next.effects.forEach(run);
  }

  return {
    send,
    wake: () => send({ type: 'WAKE' }),
    hear: (text) => {
      send({ type: 'PARTIAL', text });
      send({ type: 'HEARD', text });
    },
    decision: (decision) => send({ type: 'DECISION', decision }),
    async start() {
      running = true;
      await engines.wakeWord.start(() => send({ type: 'WAKE' }));
    },
    async stop() {
      send({ type: 'STOP' });
      running = false;
      await engines.wakeWord.stop().catch(() => undefined);
    },
    get snapshot() {
      return snapshot;
    },
  };
}
