import type { DecisionAnswerResponse, DecisionView } from '@boramarca/shared';
import { mockDecisions } from '@/data/decisions';
import { createBalcaoController } from '../controller';
import {
  SilentTextToSpeech,
  SimulatedSpeechToText,
  SimulatedVolume,
  SimulatedWakeWord,
} from '../engines';
import {
  ANSWER_TIMEOUT_MS,
  initialSnapshot,
  interpretAnswer,
  shortQuestion,
  transition,
  type BalcaoEvent,
  type BalcaoSnapshot,
} from '../machine';

const beatriz = mockDecisions[0]!; // options sim / nao
const diego = mockDecisions[3]!; // options empurrar / remarcar
const other: DecisionView = { ...beatriz, id: 'other-id', question: 'Outra?' };

function run(events: BalcaoEvent[], from: BalcaoSnapshot = initialSnapshot) {
  return events.reduce((acc, e) => transition(acc.snapshot, e), {
    snapshot: from,
    effects: [],
  } as ReturnType<typeof transition>);
}
const types = (r: ReturnType<typeof transition>) => r.effects.map((e) => e.type);
const asking = run([{ type: 'DECISION', decision: beatriz }, { type: 'SPEECH_DONE' }]).snapshot;

describe('transitions (pure)', () => {
  it('parado → ativado on wake word, listening with a deadline', () => {
    const r = transition(initialSnapshot, { type: 'WAKE' });
    expect(r.snapshot.status).toBe('ativado');
    expect(r.effects).toEqual([{ type: 'listen' }, { type: 'startTimer', ms: ANSWER_TIMEOUT_MS }]);
  });

  it('ativado → ouvindo → pensando (ask voice.ts) → falando → parado', () => {
    let r = run([{ type: 'WAKE' }, { type: 'LISTENING' }]);
    expect(r.snapshot.status).toBe('ouvindo');
    r = transition(r.snapshot, { type: 'PARTIAL', text: 'quem é' });
    expect(r.snapshot.caption).toBe('quem é');
    r = transition(r.snapshot, { type: 'HEARD', text: 'quem é o próximo?' });
    expect(r.snapshot.status).toBe('pensando');
    expect(r.effects).toContainEqual({ type: 'ask', text: 'quem é o próximo?' });
    expect(types(r)).toEqual(expect.arrayContaining(['clearTimer', 'stopListening']));
    r = transition(r.snapshot, { type: 'REPLY', speech: 'O próximo é Rafael.' });
    expect(r.snapshot).toMatchObject({ status: 'falando', phrase: 'O próximo é Rafael.' });
    expect(r.effects).toEqual([{ type: 'speak', text: 'O próximo é Rafael.', chime: false }]);
    r = transition(r.snapshot, { type: 'BOUNDARY', charIndex: 5 });
    expect(r.snapshot.spokenTo).toBe(5);
    r = transition(r.snapshot, { type: 'SPEECH_DONE' });
    expect(r.snapshot).toEqual(initialSnapshot);
  });

  it('nothing said after the wake word → back to parado', () => {
    const r = run([{ type: 'WAKE' }, { type: 'LISTENING' }, { type: 'TIMEOUT' }]);
    expect(r.snapshot.status).toBe('parado');
    expect(types(r)).toContain('stopListening');
  });

  it('wake word is ignored while busy', () => {
    const r = transition(asking, { type: 'WAKE' });
    expect(r.snapshot).toBe(asking);
    expect(r.effects).toEqual([]);
  });

  it('proactive: new decision → falando with the chime before the question', () => {
    const r = transition(initialSnapshot, { type: 'DECISION', decision: beatriz });
    expect(r.snapshot).toMatchObject({ status: 'falando', decision: beatriz, repeated: false });
    expect(r.effects).toEqual([{ type: 'speak', text: beatriz.question, chime: true }]);
  });

  it('falando (question) → esperando_resposta with the 12 s deadline', () => {
    const r = run([{ type: 'DECISION', decision: beatriz }, { type: 'SPEECH_DONE' }]);
    expect(r.snapshot.status).toBe('esperando_resposta');
    expect(r.effects).toEqual([{ type: 'listen' }, { type: 'startTimer', ms: 12_000 }]);
  });

  it('spoken "sim" → pensando with an answer via voice', () => {
    const r = transition(asking, { type: 'HEARD', text: 'Sim' });
    expect(r.snapshot.status).toBe('pensando');
    expect(r.effects).toContainEqual({
      type: 'answer',
      decisionId: beatriz.id,
      answer: { optionId: 'sim' },
      via: 'voice',
    });
  });

  it('tapping Não → answer via app', () => {
    const r = transition(asking, { type: 'TAP', choice: 'no' });
    expect(r.effects).toContainEqual({
      type: 'answer',
      decisionId: beatriz.id,
      answer: { optionId: 'nao' },
      via: 'app',
    });
  });

  it('tapping while the question is read stops the speech and answers', () => {
    const reading = transition(initialSnapshot, { type: 'DECISION', decision: beatriz }).snapshot;
    const r = transition(reading, { type: 'TAP', choice: 'yes' });
    expect(r.snapshot.status).toBe('pensando');
    expect(types(r)).toEqual(['stopSpeaking', 'answer']);
  });

  it('first timeout repeats the question once, shorter', () => {
    const r = transition(asking, { type: 'TIMEOUT' });
    expect(r.snapshot).toMatchObject({ status: 'falando', repeated: true });
    expect(r.effects).toContainEqual({
      type: 'speak',
      text: 'Posso marcar a Beatriz? Sim ou não?',
      chime: false,
    });
    const back = transition(r.snapshot, { type: 'SPEECH_DONE' });
    expect(back.snapshot.status).toBe('esperando_resposta');
    expect(back.effects).toContainEqual({ type: 'startTimer', ms: ANSWER_TIMEOUT_MS });
  });

  it('second timeout → parado, the decision stays pending (no answer effect)', () => {
    const r = run([{ type: 'TIMEOUT' }, { type: 'SPEECH_DONE' }, { type: 'TIMEOUT' }], asking);
    expect(r.snapshot.status).toBe('parado');
    expect(r.snapshot.decision).toBeNull();
    expect(types(r)).not.toContain('answer');
  });

  it('pensando → falando with the confirmation, then parado', () => {
    const r = run(
      [
        { type: 'HEARD', text: 'pode' },
        { type: 'REPLY', speech: 'Pronto. Já avisei Beatriz.' },
        { type: 'SPEECH_DONE' },
      ],
      asking,
    );
    expect(r.snapshot.status).toBe('parado');
  });

  it('decisions arriving while busy are queued and read next, without duplicates', () => {
    let r = transition(asking, { type: 'DECISION', decision: other });
    r = transition(r.snapshot, { type: 'DECISION', decision: other });
    r = transition(r.snapshot, { type: 'DECISION', decision: beatriz });
    expect(r.snapshot.queue).toEqual([other]);
    r = run(
      [{ type: 'TAP', choice: 'yes' }, { type: 'REPLY', speech: 'Ok.' }, { type: 'SPEECH_DONE' }],
      r.snapshot,
    );
    expect(r.snapshot).toMatchObject({ status: 'falando', decision: other, queue: [] });
    expect(r.effects).toContainEqual({ type: 'speak', text: 'Outra?', chime: true });
  });

  it('STOP resets from any state and stops everything', () => {
    const r = transition({ ...asking, queue: [other] }, { type: 'STOP' });
    expect(r.snapshot).toEqual(initialSnapshot);
    expect(types(r)).toEqual(['clearTimer', 'stopListening', 'stopSpeaking']);
  });
});

describe('answers and phrasing', () => {
  it('interprets short yes/no and keeps anything else as free text', () => {
    expect(interpretAnswer('Pode!', beatriz)).toEqual({ optionId: 'sim' });
    expect(interpretAnswer('não', beatriz)).toEqual({ optionId: 'nao' });
    expect(interpretAnswer('pode, mas marca daqui 15 minutos', beatriz)).toEqual({
      text: 'pode, mas marca daqui 15 minutos',
    });
    // no "nao" option: the AI reads the text
    expect(interpretAnswer('não', diego)).toEqual({ text: 'não' });
  });

  it('shortQuestion keeps the last sentence', () => {
    expect(shortQuestion('O horário das 16h vagou. Posso marcar a Beatriz?')).toBe(
      'Posso marcar a Beatriz? Sim ou não?',
    );
  });
});

describe('controller with the simulated engines and fake timers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup() {
    const engines = {
      wakeWord: new SimulatedWakeWord(),
      speechToText: new SimulatedSpeechToText(),
      textToSpeech: new SilentTextToSpeech(),
      volume: new SimulatedVolume(),
      chime: jest.fn(async () => undefined),
    };
    const answer = jest.fn(
      async () => ({ spokenConfirmation: 'Pronto. Já avisei Beatriz.' }) as DecisionAnswerResponse,
    );
    const ask = jest.fn(async (text: string) => ({
      intent: 'next_client' as const,
      speech: `R: ${text}`,
      decisionId: null,
    }));
    const states: string[] = [];
    const c = createBalcaoController({
      engines,
      answer,
      ask,
      onChange: (s) => states.push(s.status),
    });
    return { c, engines, answer, ask, states };
  }
  const flush = () => jest.advanceTimersByTimeAsync(0);

  it('proactive flow: chime → question → "sim" → handleDecisionAction(voice) → confirmation', async () => {
    const { c, engines, answer, states } = setup();
    await c.start();
    c.decision(beatriz);
    await flush();
    expect(engines.chime).toHaveBeenCalledTimes(1);
    expect(c.snapshot.status).toBe('esperando_resposta');
    expect(engines.speechToText.say('sim')).toBe(true);
    await flush();
    expect(answer).toHaveBeenCalledWith(beatriz.id, { optionId: 'sim' }, 'voice');
    expect(engines.textToSpeech.spoken).toEqual([beatriz.question, 'Pronto. Já avisei Beatriz.']);
    expect(c.snapshot.status).toBe('parado');
    expect(states).toEqual(
      expect.arrayContaining(['falando', 'esperando_resposta', 'pensando', 'parado']),
    );
  });

  it('12 s without answer: repeats once, then gives up after another 12 s', async () => {
    const { c, engines, answer } = setup();
    await c.start();
    c.decision(beatriz);
    await flush();
    await jest.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS - 1);
    expect(c.snapshot.status).toBe('esperando_resposta');
    await jest.advanceTimersByTimeAsync(1);
    expect(engines.textToSpeech.spoken).toEqual([
      beatriz.question,
      shortQuestion(beatriz.question),
    ]);
    expect(c.snapshot).toMatchObject({ status: 'esperando_resposta', repeated: true });
    await jest.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS);
    expect(c.snapshot.status).toBe('parado');
    expect(engines.textToSpeech.spoken).toHaveLength(2);
    expect(engines.chime).toHaveBeenCalledTimes(1);
    expect(answer).not.toHaveBeenCalled();
  });

  it('wake word flow asks voice.ts and speaks the reply', async () => {
    const { c, engines, ask } = setup();
    await c.start();
    engines.wakeWord.trigger();
    await flush();
    expect(c.snapshot.status).toBe('ouvindo');
    engines.speechToText.say('quem é o próximo?');
    await flush();
    expect(ask).toHaveBeenCalledWith('quem é o próximo?');
    expect(engines.textToSpeech.spoken).toEqual(['R: quem é o próximo?']);
    expect(c.snapshot.status).toBe('parado');
  });

  it('a failed answer is spoken, not swallowed', async () => {
    const { c, answer, engines } = setup();
    answer.mockRejectedValueOnce(new Error('Essa decisão já foi resolvida'));
    await c.start();
    c.decision(beatriz);
    await flush();
    c.send({ type: 'TAP', choice: 'yes' });
    await flush();
    expect(answer).toHaveBeenCalledWith(beatriz.id, { optionId: 'sim' }, 'app');
    expect(engines.textToSpeech.spoken).toContain('Essa decisão já foi resolvida');
  });

  it('stop() drops late callbacks and stops the wake word', async () => {
    const { c, engines } = setup();
    await c.start();
    c.decision(beatriz);
    await flush();
    await c.stop();
    engines.wakeWord.trigger();
    await jest.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS * 3);
    expect(c.snapshot).toEqual(initialSnapshot);
  });
});
