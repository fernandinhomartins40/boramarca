import { describe, expect, it } from 'vitest';
import { AI_TOOL_NAMES } from '@boramarca/shared';
import { buildContext } from './context';
import { FakeLlm, toolReply } from './fake-llm';
import { AI_TOOLS, interpretClientMessage } from './interpret-client';
import { interpretProfessionalAnswer } from './professional-answer';
import { renderMessage } from './texts';
import { at, IDS, makeInput, NOW, TZ } from './fixtures';

const reply = (text: string) => toolReply({ name: 'responder_cliente', arguments: { text } });

describe('AI_TOOLS', () => {
  it('has one OpenAI function per tool, with JSON Schema parameters', () => {
    expect(AI_TOOLS.map((t) => t.function.name)).toEqual(AI_TOOL_NAMES);
    const marcar = AI_TOOLS.find((t) => t.function.name === 'marcar')!;
    expect(marcar.function.parameters).toMatchObject({
      type: 'object',
      required: ['serviceIds', 'startsAt'],
    });
  });
});

describe('interpretClientMessage', () => {
  it('returns validated calls and the "Entendi como" note', async () => {
    const llm = new FakeLlm([
      {
        when: /preço/,
        reply: { ...reply('O corte é R$ 50.'), content: 'Entendi como: pergunta de preço' },
      },
    ]);
    const res = await interpretClientMessage(
      buildContext(makeInput('qual o preço do corte?')),
      llm,
    );
    expect(res.note).toBe('Entendi como: pergunta de preço');
    expect(res.calls).toEqual([
      { name: 'responder_cliente', arguments: { text: 'O corte é R$ 50.' } },
    ]);
  });

  it('builds a note from the tools when the model sends no text', async () => {
    const llm = new FakeLlm([], {
      fallback: toolReply({ name: 'cancelar', arguments: { appointmentId: IDS.apptCarlos } }),
    });
    const res = await interpretClientMessage(buildContext(makeInput('cancela')), llm);
    expect(res.note).toBe('Entendi como: cancelamento');
  });

  it('retries once on invalid output and accepts the corrected answer', async () => {
    const llm = new FakeLlm([
      { when: /inválida/, reply: reply('Tem sim!') },
      {
        when: /horário/,
        reply: toolReply({
          name: 'marcar',
          arguments: { serviceIds: ['corte'], startsAt: 'amanhã' },
        }),
      },
    ]);
    const res = await interpretClientMessage(buildContext(makeInput('tem horário?')), llm);
    expect(llm.requests).toHaveLength(2);
    expect(res.calls[0]?.name).toBe('responder_cliente');
  });

  it('falls back to perguntar_ao_profissional after two invalid answers', async () => {
    const llm = new FakeLlm([], {
      fallback: { content: 'claro, marquei!', toolCalls: [], model: 'fake' },
    });
    const res = await interpretClientMessage(buildContext(makeInput('tem horário?')), llm);
    expect(llm.requests).toHaveLength(2);
    expect(res.calls).toHaveLength(1);
    expect(res.calls[0]).toMatchObject({
      name: 'perguntar_ao_profissional',
      arguments: { type: 'duvida', proposedAction: null },
    });
  });

  it('rejects unknown tools and bad JSON', async () => {
    const llm = new FakeLlm([], {
      fallback: {
        content: null,
        toolCalls: [
          { name: 'apagar_banco', arguments: '{}' },
          { name: 'marcar', arguments: '{oops' },
        ],
        model: 'fake',
      },
    });
    const res = await interpretClientMessage(buildContext(makeInput('x')), llm);
    expect(res.calls[0]?.name).toBe('perguntar_ao_profissional');
  });

  it('falls back to perguntar_ao_profissional when the model is down', async () => {
    const llm = new FakeLlm([], { fallback: new Error('down') });
    const res = await interpretClientMessage(buildContext(makeInput('oi')), llm);
    expect(res.calls[0]?.name).toBe('perguntar_ao_profissional');
  });

  it('a symptom never becomes a record (note, question, reason)', async () => {
    const llm = new FakeLlm([
      {
        when: /dor/,
        reply: toolReply(
          [
            {
              name: 'responder_cliente',
              arguments: { text: 'Sinto muito! Vou ver um horário para hoje e já te falo.' },
            },
            {
              name: 'perguntar_ao_profissional',
              arguments: {
                type: 'novo_horario',
                question: 'Fulano está com dor de dente forte e inchaço, marco às 16h?',
                options: [{ id: 'sim', label: 'Sim', action: null }],
                proposedAction: {
                  name: 'marcar',
                  arguments: { serviceIds: [IDS.corte], startsAt: at('16:00') },
                },
              },
            },
          ],
          'Entendi como: dor de dente com inchaço, quer horário hoje',
        ),
      },
    ]);
    const res = await interpretClientMessage(
      buildContext(
        makeInput('to com muita dor no dente e inchou, tem horário hoje?', {
          professions: ['dentista'],
        }),
      ),
      llm,
    );
    const stored = JSON.stringify({
      note: res.note,
      calls: res.calls.filter((c) => c.name !== 'responder_cliente'),
    });
    expect(stored).not.toMatch(/dor|inch/i);
    expect(res.calls.map((c) => c.name)).toEqual([
      'responder_cliente',
      'perguntar_ao_profissional',
    ]);
  });
});

describe('PDF example flow (page 8), AI level', () => {
  it('Carlos cancels at 14:02, Fulano asks at 14:05, "pode, mas marca daqui 15 minutos" → 14h20', async () => {
    const marcar15 = {
      name: 'marcar' as const,
      arguments: { serviceIds: [IDS.corte], startsAt: at('15:00') },
    };
    const llm = new FakeLlm([
      {
        when: /não vou conseguir ir/,
        reply: toolReply(
          [
            { name: 'cancelar', arguments: { appointmentId: IDS.apptCarlos } },
            {
              name: 'responder_cliente',
              arguments: {
                text: 'Tranquilo, Carlos! Cancelei seu horário de hoje às 15h. Quer remarcar?',
              },
            },
          ],
          'Entendi como: cancelamento do horário de hoje às 15h',
        ),
      },
      {
        when: /hoje à tarde/,
        reply: (req) => {
          // The model sees the freed 15h slot in the context.
          expect(String(req.messages[1]?.content)).toContain('Vagas livres hoje: 14h30, 15h');
          return toolReply(
            {
              name: 'perguntar_ao_profissional',
              arguments: {
                type: 'novo_horario',
                question:
                  'Fulano quer horário hoje à tarde. O Carlos das 15h desmarcou. Posso marcar o Fulano às 15h?',
                options: [
                  { id: 'sim', label: 'Sim', action: marcar15 },
                  { id: 'nao', label: 'Não', action: null },
                ],
                proposedAction: marcar15,
                holdingReply: 'Vou ver aqui e já te falo!',
              },
            },
            'Entendi como: pedido de horário para hoje à tarde',
          );
        },
      },
    ]);

    // 1–2. Carlos (14:02)
    const carlos = makeInput('não vou conseguir ir hoje às 15h', {
      now: at('14:02'),
      client: {
        id: IDS.carlos,
        name: 'Carlos Pereira',
        isKnown: true,
        upcoming: [{ id: IDS.apptCarlos, startsAt: at('15:00'), serviceNames: ['Corte'] }],
      },
    });
    const r1 = await interpretClientMessage(buildContext(carlos), llm);
    expect(r1.calls.map((c) => c.name)).toEqual(['cancelar', 'responder_cliente']);

    // 3–4. Fulano (14:05): the freed 15h is free in the agenda now
    const fulano = makeInput('tem horário hoje à tarde?');
    fulano.day.appointments = fulano.day.appointments.map((a) =>
      a.id === IDS.apptCarlos ? { ...a, status: 'cancelled' as const } : a,
    );
    fulano.day.freeSlots = [at('14:30'), at('15:00'), at('16:00')];
    const r2 = await interpretClientMessage(buildContext(fulano), llm);
    expect(r2.note).toBe('Entendi como: pedido de horário para hoje à tarde');
    const ask = r2.calls[0];
    if (ask?.name !== 'perguntar_ao_profissional') throw new Error('expected a Decision');

    // 5. The professional answers by voice (deterministic parser, no LLM needed)
    const answer = await interpretProfessionalAnswer(
      {
        type: ask.arguments.type,
        question: ask.arguments.question,
        options: ask.arguments.options,
        proposedAction: ask.arguments.proposedAction,
      },
      'Pode, mas marca daqui 15 minutos.',
      { now: NOW, timezone: TZ },
    );
    expect(answer).toMatchObject({
      kind: 'accept',
      optionId: 'sim',
      source: 'rule',
      action: { name: 'marcar', arguments: { startsAt: at('14:20') } },
    });

    // 6. Message to Fulano
    expect(
      renderMessage('booking_confirmation', 'descontraido', {
        now: NOW,
        timezone: TZ,
        clientFirstName: 'Fulano',
        startsAt: at('14:20'),
      }),
    ).toBe('Fechado, Fulano! Te espero hoje às 14h20.');
    // 7. No answer in time → neutral message, in any tone
    expect(renderMessage('hold', 'formal', { now: NOW, timezone: TZ })).toBe('Já te confirmo!');
  });
});
