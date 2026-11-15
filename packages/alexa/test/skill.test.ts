import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_SAMPLE_QUESTIONS } from '@boramarca/shared';
import { SPEECH, answerBody, createAlexaSkill } from '../src';
import { D1, D2, PRO, SKILL_ID, fakePorts, fixture, speech } from './helpers';

const setup = (over = {}) => {
  const ports = fakePorts(over);
  const skill = createAlexaSkill({ skillId: SKILL_ID, ports });
  return { ports, invoke: (name: string) => skill.invoke(fixture(name)) };
};
const notApi = (code: string) => Object.assign(new Error(code), { code });

describe('agenda intents', () => {
  it.each([
    ['clientes-restantes', VOICE_SAMPLE_QUESTIONS[0]],
    ['horarios-vagos', VOICE_SAMPLE_QUESTIONS[1]],
    ['proximo-cliente', VOICE_SAMPLE_QUESTIONS[2]],
    ['novas-mensagens', VOICE_SAMPLE_QUESTIONS[3]],
  ])('%s → voiceCommand("%s")', async (name, text) => {
    const { ports, invoke } = setup();
    const r = await invoke(name);
    expect(ports.voiceCommand).toHaveBeenCalledWith(PRO, { text }, expect.any(AbortSignal));
    expect(speech(r)).toBe(`resposta para: ${text}`);
    expect(r.response.shouldEndSession).toBe(true);
  });
});

describe('launch', () => {
  it('reads the most urgent pending decision and keeps the mic open', async () => {
    const { invoke } = setup();
    const r = await invoke('launch');
    expect(speech(r)).toBe(`Você tem uma decisão. ${D1.question}`);
    expect(r.sessionAttributes).toEqual({ decisionId: D1.id });
    expect(r.response.shouldEndSession).toBe(false);
  });

  it('welcomes when nothing is pending', async () => {
    const { invoke } = setup({ listDecisions: vi.fn(async () => []) });
    expect(speech(await invoke('launch'))).toBe(SPEECH.welcome);
  });

  it('asks to link the account (no token)', async () => {
    const { ports, invoke } = setup();
    const r = await invoke('launch-unlinked');
    expect(r.response.card).toEqual({ type: 'LinkAccount' });
    expect(speech(r)).toBe(SPEECH.linkAccount);
    expect(ports.professionalIdFromToken).not.toHaveBeenCalled();
  });

  it('asks to link the account (token revoked)', async () => {
    const { invoke } = setup({ professionalIdFromToken: vi.fn(async () => null) });
    expect((await invoke('clientes-restantes')).response.card).toEqual({ type: 'LinkAccount' });
  });
});

describe('answering a decision', () => {
  it('free text goes to the API as text, via alexa', async () => {
    const { ports, invoke } = setup();
    const r = await invoke('responder-decisao');
    expect(ports.answerDecision).toHaveBeenCalledWith(PRO, D1.id, {
      text: 'pode, mas marca daqui 15 minutos',
      via: 'alexa',
    });
    expect(speech(r)).toBe('Marquei o Fulano às 15h.');
  });

  it('"sim, para daqui 15 minutos" keeps the yes', async () => {
    const { ports, invoke } = setup();
    await invoke('responder-sim');
    expect(ports.answerDecision).toHaveBeenCalledWith(PRO, D1.id, {
      text: 'sim, para daqui 15 minutos',
      via: 'alexa',
    });
  });

  it('yes answers the decision read in this session, by option (no AI)', async () => {
    const { ports, invoke } = setup();
    await invoke('sim');
    expect(ports.answerDecision).toHaveBeenCalledWith(PRO, D2.id, {
      optionId: 'opt-sim',
      via: 'alexa',
    });
  });

  it('no picks the "Não" option', async () => {
    const { ports, invoke } = setup();
    await invoke('nao');
    expect(ports.answerDecision).toHaveBeenCalledWith(PRO, D1.id, {
      optionId: 'opt-nao',
      via: 'alexa',
    });
  });

  it('nothing pending', async () => {
    const { ports, invoke } = setup({ listDecisions: vi.fn(async () => []) });
    expect(speech(await invoke('sim'))).toBe(SPEECH.noDecision);
    expect(ports.answerDecision).not.toHaveBeenCalled();
  });

  it('not understood → asks again with the mic open', async () => {
    const { invoke } = setup({
      answerDecision: vi.fn().mockRejectedValue(notApi('ANSWER_NOT_UNDERSTOOD')),
    });
    const r = await invoke('responder-decisao');
    expect(speech(r)).toBe(SPEECH.notUnderstood);
    expect(r.response.shouldEndSession).toBe(false);
  });

  it('already resolved elsewhere', async () => {
    const { invoke } = setup({
      answerDecision: vi.fn().mockRejectedValue(notApi('DECISION_CLOSED')),
    });
    expect(speech(await invoke('sim'))).toBe(SPEECH.closed);
  });

  it('unexpected API error → generic sentence', async () => {
    const { invoke } = setup({ answerDecision: vi.fn().mockRejectedValue(new Error('db down')) });
    expect(speech(await invoke('sim'))).toBe(SPEECH.error);
  });

  it('answerBody falls back to text when no option matches', () => {
    const only = { ...D1, options: [{ id: 'x', label: '10h', action: null }] };
    expect(answerBody(only, 'sim')).toEqual({ text: 'sim', via: 'alexa' });
  });
});

describe('built-in intents', () => {
  it.each([
    ['ajuda', SPEECH.help, false],
    ['parar', SPEECH.bye, true],
    ['cancelar', SPEECH.bye, true],
    ['inicio', SPEECH.bye, true],
    ['fallback', `${SPEECH.fallback} ${SPEECH.help}`, false],
  ])('%s', async (name, text, ends) => {
    const r = await setup().invoke(name);
    expect(speech(r)).toBe(text);
    expect(r.response.shouldEndSession).toBe(ends);
  });

  it('session ended → empty response', async () => {
    const r = await setup().invoke('session-ended');
    expect(r.response.outputSpeech).toBeUndefined();
  });

  it('rejects a request for another skill', async () => {
    const skill = createAlexaSkill({ skillId: 'amzn1.ask.skill.other', ports: fakePorts() });
    await expect(skill.invoke(fixture('launch'))).rejects.toThrow();
  });
});

describe('8-second contingency', () => {
  afterEach(() => vi.useRealTimers());
  const never = () => new Promise<never>(() => {});

  it('slow agenda answer → fallback sentence and the AI call is aborted', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const { invoke } = setup({
      voiceCommand: vi.fn((_p, _b, s: AbortSignal) => ((signal = s), never())),
    });
    const p = invoke('proximo-cliente');
    await vi.advanceTimersByTimeAsync(5999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(speech(r)).toBe(SPEECH.slowAgenda);
    expect(r.response.shouldEndSession).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it('slow decision answer → tells it is still processing', async () => {
    vi.useFakeTimers();
    const { invoke } = setup({ answerDecision: vi.fn(never) });
    const p = invoke('responder-decisao');
    await vi.advanceTimersByTimeAsync(6000);
    expect(speech(await p)).toBe(SPEECH.slowAnswer);
  });

  it('the budget is shared by every call of the request', async () => {
    vi.useFakeTimers();
    const slowToken = vi.fn(
      (t: string) => new Promise<string>((ok) => setTimeout(() => ok(t && PRO), 4000)),
    );
    const { invoke } = setup({ professionalIdFromToken: slowToken, voiceCommand: vi.fn(never) });
    const p = invoke('clientes-restantes');
    await vi.advanceTimersByTimeAsync(6000); // 4 s token + 2 s left for the agenda
    expect(speech(await p)).toBe(SPEECH.slowAgenda);
  });

  it('a slow account lookup also falls back', async () => {
    vi.useFakeTimers();
    const { invoke } = setup({ professionalIdFromToken: vi.fn(never) });
    const p = invoke('launch');
    await vi.advanceTimersByTimeAsync(6000);
    expect(speech(await p)).toBe(SPEECH.slowAgenda);
  });
});
