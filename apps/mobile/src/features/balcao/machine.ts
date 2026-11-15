import type { DecisionView } from '@boramarca/shared';

/**
 * Modo Balcão state machine (prompt 07). Pure: `transition(snapshot, event)` returns the next
 * snapshot plus the effects to run; `controller.ts` runs them against the voice engines.
 *
 * parado → ativado (wake word) → ouvindo → pensando → falando → parado
 * proativo: Decisão nova → falando (aviso + pergunta) → esperando_resposta (12 s, repete uma vez)
 *           → pensando (handleDecisionAction) → falando (confirmação) → parado
 */
export type BalcaoStateName =
  'parado' | 'ativado' | 'ouvindo' | 'pensando' | 'falando' | 'esperando_resposta';

export const ANSWER_TIMEOUT_MS = 12_000;

export interface BalcaoSnapshot {
  status: BalcaoStateName;
  /** Decision being asked (falando/esperando_resposta) or answered (pensando). */
  decision: DecisionView | null;
  /** The question was already repeated once (prompt 07: only one repeat). */
  repeated: boolean;
  /** Decisions that arrived while busy, read in order afterwards. */
  queue: DecisionView[];
  /** Text being spoken (falando). */
  phrase: string;
  /** Character index reached by the speech, for the karaoke highlight. */
  spokenTo: number;
  /** Live caption of what the professional is saying. */
  caption: string;
}

export type DecisionAnswer = { optionId: string } | { text: string };

export type BalcaoEvent =
  | { type: 'WAKE' }
  | { type: 'DECISION'; decision: DecisionView }
  | { type: 'LISTENING' }
  | { type: 'PARTIAL'; text: string }
  | { type: 'HEARD'; text: string }
  | { type: 'TAP'; choice: 'yes' | 'no' }
  | { type: 'TIMEOUT' }
  | { type: 'REPLY'; speech: string }
  | { type: 'BOUNDARY'; charIndex: number }
  | { type: 'SPEECH_DONE' }
  | { type: 'STOP' };

export type BalcaoEffect =
  | { type: 'speak'; text: string; chime?: boolean }
  | { type: 'stopSpeaking' }
  | { type: 'listen' }
  | { type: 'stopListening' }
  | { type: 'startTimer'; ms: number }
  | { type: 'clearTimer' }
  | { type: 'answer'; decisionId: string; answer: DecisionAnswer; via: 'voice' | 'app' }
  | { type: 'ask'; text: string };

export interface Transition {
  snapshot: BalcaoSnapshot;
  effects: BalcaoEffect[];
}

export const initialSnapshot: BalcaoSnapshot = {
  status: 'parado',
  decision: null,
  repeated: false,
  queue: [],
  phrase: '',
  spokenTo: 0,
  caption: '',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const YES = new Set(['sim', 'pode', 'claro', 'isso', 'ok', 'beleza', 'marca', 'confirma', 'bora']);

/** "sim"/"pode" → first option; short "não" → the "nao" option; anything else goes as free text. */
export function interpretAnswer(text: string, decision: DecisionView): DecisionAnswer {
  const words = norm(text);
  const no = decision.options.find((o) => o.id === 'nao');
  if (words.length && words.every((w) => YES.has(w))) return { optionId: decision.options[0]!.id };
  if (no && words[0] === 'nao' && words.length <= 3) return { optionId: no.id };
  return { text: text.trim() };
}

export function tapAnswer(choice: 'yes' | 'no', decision: DecisionView): DecisionAnswer {
  if (choice === 'yes') return { optionId: decision.options[0]!.id };
  const no = decision.options.find((o) => o.id === 'nao');
  return no ? { optionId: no.id } : { text: 'não' };
}

/** Last sentence + "Sim ou não?": the shorter repeat of the question. */
export function shortQuestion(question: string): string {
  const sentences = question.split(/(?<=[.?!])\s+/).filter(Boolean);
  return `${sentences[sentences.length - 1] ?? question} Sim ou não?`;
}

function speak(
  s: BalcaoSnapshot,
  text: string,
  patch: Partial<BalcaoSnapshot> = {},
  chime = false,
): Transition {
  return {
    snapshot: { ...s, status: 'falando', phrase: text, spokenTo: 0, caption: '', ...patch },
    effects: [{ type: 'speak', text, chime }],
  };
}

function askDecision(s: BalcaoSnapshot, decision: DecisionView, queue: DecisionView[]): Transition {
  return speak(s, decision.question, { decision, repeated: false, queue }, true);
}

/** Back to parado, or straight to the next queued decision. */
function idle(s: BalcaoSnapshot, effects: BalcaoEffect[] = []): Transition {
  const [next, ...rest] = s.queue;
  const base = { ...initialSnapshot, queue: rest };
  if (!next) return { snapshot: { ...initialSnapshot }, effects };
  const t = askDecision(base, next, rest);
  return { snapshot: t.snapshot, effects: [...effects, ...t.effects] };
}

const stay = (s: BalcaoSnapshot): Transition => ({ snapshot: s, effects: [] });

export function transition(s: BalcaoSnapshot, e: BalcaoEvent): Transition {
  if (e.type === 'STOP') {
    return {
      snapshot: { ...initialSnapshot },
      effects: [{ type: 'clearTimer' }, { type: 'stopListening' }, { type: 'stopSpeaking' }],
    };
  }
  if (e.type === 'DECISION') {
    const known = s.decision?.id === e.decision.id || s.queue.some((d) => d.id === e.decision.id);
    if (known) return stay(s);
    if (s.status === 'parado') return askDecision(s, e.decision, s.queue);
    return stay({ ...s, queue: [...s.queue, e.decision] });
  }

  switch (s.status) {
    case 'parado':
      if (e.type === 'WAKE') {
        return {
          snapshot: { ...s, status: 'ativado', caption: '' },
          effects: [{ type: 'listen' }, { type: 'startTimer', ms: ANSWER_TIMEOUT_MS }],
        };
      }
      return stay(s);

    case 'ativado':
    case 'ouvindo':
      if (e.type === 'LISTENING') return stay({ ...s, status: 'ouvindo' });
      if (e.type === 'PARTIAL') return stay({ ...s, status: 'ouvindo', caption: e.text });
      if (e.type === 'HEARD') {
        return {
          snapshot: { ...s, status: 'pensando', caption: e.text },
          effects: [
            { type: 'clearTimer' },
            { type: 'stopListening' },
            { type: 'ask', text: e.text },
          ],
        };
      }
      if (e.type === 'TIMEOUT') return idle(s, [{ type: 'stopListening' }]);
      return stay(s);

    case 'esperando_resposta': {
      const d = s.decision!;
      if (e.type === 'PARTIAL') return stay({ ...s, caption: e.text });
      if (e.type === 'HEARD' || e.type === 'TAP') {
        const answer = e.type === 'HEARD' ? interpretAnswer(e.text, d) : tapAnswer(e.choice, d);
        return {
          snapshot: { ...s, status: 'pensando', caption: e.type === 'HEARD' ? e.text : '' },
          effects: [
            { type: 'clearTimer' },
            { type: 'stopListening' },
            { type: 'answer', decisionId: d.id, answer, via: e.type === 'HEARD' ? 'voice' : 'app' },
          ],
        };
      }
      if (e.type === 'TIMEOUT') {
        // second silence: leave it pending in the Decisões tab
        if (s.repeated) return idle(s, [{ type: 'stopListening' }]);
        const t = speak(s, shortQuestion(d.question), { repeated: true });
        return { snapshot: t.snapshot, effects: [{ type: 'stopListening' }, ...t.effects] };
      }
      return stay(s);
    }

    case 'pensando':
      if (e.type === 'REPLY') return speak(s, e.speech, { decision: null });
      return stay(s);

    case 'falando':
      if (e.type === 'BOUNDARY') return stay({ ...s, spokenTo: e.charIndex });
      if (e.type === 'TAP' && s.decision) {
        // tapping while the question is still being read
        return {
          snapshot: { ...s, status: 'pensando' },
          effects: [
            { type: 'stopSpeaking' },
            {
              type: 'answer',
              decisionId: s.decision.id,
              answer: tapAnswer(e.choice, s.decision),
              via: 'app',
            },
          ],
        };
      }
      if (e.type === 'SPEECH_DONE') {
        if (s.decision) {
          return {
            snapshot: {
              ...s,
              status: 'esperando_resposta',
              spokenTo: s.phrase.length,
              caption: '',
            },
            effects: [{ type: 'listen' }, { type: 'startTimer', ms: ANSWER_TIMEOUT_MS }],
          };
        }
        return idle(s);
      }
      return stay(s);
  }
}
