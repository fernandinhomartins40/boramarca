import { describe, expect, it } from 'vitest';
import type { AgendaActionCall, ProfessionalAnswer } from '@boramarca/shared';
import { FakeLlm, toolReply } from './fake-llm';
import { interpretProfessionalAnswer, type DecisionForAnswer } from './professional-answer';
import { at, IDS, NOW, TZ } from './fixtures';

const marcar15: AgendaActionCall = {
  name: 'marcar',
  arguments: { serviceIds: [IDS.corte], startsAt: at('15:00'), isFitIn: false },
};
const decision: DecisionForAnswer = {
  type: 'novo_horario',
  question: 'Posso marcar o Fulano às 15h?',
  options: [
    { id: 'sim', label: 'Sim', action: marcar15 },
    { id: 'nao', label: 'Não', action: null },
  ],
  proposedAction: marcar15,
};
const opts = { now: NOW, timezone: TZ };
const startsAt = (a: ProfessionalAnswer) =>
  a.kind === 'accept' && a.action?.name === 'marcar' ? a.action.arguments.startsAt : null;
const run = (text: string) => interpretProfessionalAnswer(decision, text, opts);

describe('interpretProfessionalAnswer (deterministic)', () => {
  it('"pode, mas marca daqui 15 minutos" → accept at now + 15 (14h05 → 14h20)', async () => {
    const a = await run('pode, mas marca daqui 15 minutos');
    expect(a).toMatchObject({ kind: 'accept', optionId: 'sim', source: 'rule' });
    expect(startsAt(a)).toBe(at('14:20'));
  });
  it('"sim" → accept the proposed action', async () => {
    expect(await run('Sim')).toEqual({
      kind: 'accept',
      optionId: 'sim',
      action: marcar15,
      source: 'rule',
    });
    expect(await run('pode sim!')).toMatchObject({ kind: 'accept', action: marcar15 });
  });
  it('"não" → decline', async () => {
    expect(await run('não')).toEqual({
      kind: 'decline',
      optionId: 'nao',
      action: null,
      source: 'rule',
    });
    expect(await run('Não dá hoje')).toMatchObject({ kind: 'decline' });
  });
  it('"deixa que eu respondo" → take over', async () => {
    expect(await run('Deixa que eu respondo')).toEqual({ kind: 'take_over', source: 'rule' });
  });
  it('"pode às 16h30" → accept at 16:30 of the proposed day', async () => {
    expect(startsAt(await run('pode às 16h30'))).toBe(at('16:30'));
    expect(startsAt(await run('marca 17:00'))).toBe(at('17:00'));
    expect(startsAt(await run('pode às 16'))).toBe(at('16:00'));
  });
  it('shifts relative to the proposed time or to now', async () => {
    expect(startsAt(await run('empurra 20 min'))).toBe(at('15:20'));
    expect(startsAt(await run('marca 10 minutos depois'))).toBe(at('15:10'));
    expect(startsAt(await run('daqui meia hora'))).toBe(at('14:35'));
    expect(startsAt(await run('daqui a 1 hora'))).toBe(at('15:05'));
  });
  it('"não, marca às 16h" is a counter-proposal, not a plain decline', async () => {
    expect(await run('não, marca às 16h')).toEqual({ kind: 'unknown', source: 'rule' });
  });
  it('unclear text without an LLM → unknown', async () => {
    expect(await run('hmm vou pensar no caso dele')).toEqual({ kind: 'unknown', source: 'rule' });
  });
});

describe('interpretProfessionalAnswer (LLM fallback)', () => {
  it('uses the LLM for unusual answers', async () => {
    const llm = new FakeLlm([
      {
        when: /encaixa/,
        reply: toolReply({
          name: 'interpretar_resposta',
          arguments: { kind: 'accept', startsAt: at('17:10') },
        }),
      },
    ]);
    const a = await interpretProfessionalAnswer(decision, 'encaixa ele depois do último', {
      ...opts,
      llm,
    });
    expect(a).toMatchObject({ kind: 'accept', source: 'llm' });
    expect(startsAt(a)).toBe(at('17:10'));
  });
  it('does not call the LLM for the common answers', async () => {
    const llm = new FakeLlm();
    await interpretProfessionalAnswer(decision, 'sim', { ...opts, llm });
    expect(llm.requests).toHaveLength(0);
  });
  it('invalid LLM output → unknown', async () => {
    const llm = new FakeLlm([], {
      fallback: toolReply({ name: 'interpretar_resposta', arguments: { kind: 'talvez' } }),
    });
    expect(
      await interpretProfessionalAnswer(decision, 'vê aí o que acha melhor', { ...opts, llm }),
    ).toEqual({
      kind: 'unknown',
      source: 'llm',
    });
  });
});
