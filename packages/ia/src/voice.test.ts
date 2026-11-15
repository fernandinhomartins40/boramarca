import { describe, expect, it } from 'vitest';
import { VOICE_SAMPLE_QUESTIONS } from '@boramarca/shared';
import { FakeLlm, toolReply } from './fake-llm';
import { interpretVoiceCommand, type VoiceDaySummary } from './voice';
import { at, NOW, TZ } from './fixtures';

const day: VoiceDaySummary = {
  now: NOW,
  timezone: TZ,
  appointments: [
    { startsAt: at('13:00'), clientFirstName: 'Ana', serviceNames: ['Corte'], status: 'done' },
    {
      startsAt: at('14:00'),
      clientFirstName: 'Bia',
      serviceNames: ['Barba'],
      status: 'in_service',
    },
    {
      startsAt: at('15:00'),
      clientFirstName: 'Fulano',
      serviceNames: ['Corte'],
      status: 'confirmed',
    },
    {
      startsAt: at('16:30'),
      clientFirstName: 'Caio',
      serviceNames: ['Corte', 'Barba'],
      status: 'scheduled',
    },
    {
      startsAt: at('17:00'),
      clientFirstName: 'Duda',
      serviceNames: ['Corte'],
      status: 'cancelled',
    },
  ],
  freeSlots: [at('13:30'), at('15:30'), at('16:00'), at('17:00')],
  unreadMessages: [
    { clientFirstName: 'Gabi', count: 2 },
    { clientFirstName: 'Leo', count: 1 },
  ],
};

describe('interpretVoiceCommand', () => {
  it('answers the 4 core questions deterministically, without the LLM', async () => {
    const llm = new FakeLlm();
    const answers = await Promise.all(
      VOICE_SAMPLE_QUESTIONS.map((q) => interpretVoiceCommand(q, day, { llm })),
    );
    expect(answers).toEqual([
      { intent: 'remaining_clients', speech: 'Você ainda tem 3 clientes hoje.' },
      { intent: 'free_slots', speech: 'Tem vaga às 15h30, 16h e 17h.' },
      { intent: 'next_client', speech: 'O próximo é Fulano, às 15h, corte.' },
      { intent: 'new_messages', speech: 'Gabi e Leo mandaram mensagem.' },
    ]);
    expect(llm.requests).toHaveLength(0);
  });

  it('handles empty days', async () => {
    const empty = { ...day, appointments: [], freeSlots: [], unreadMessages: [] };
    expect((await interpretVoiceCommand('quem é o próximo?', empty)).speech).toBe(
      'Não tem mais ninguém marcado hoje.',
    );
    expect((await interpretVoiceCommand('tem horário vago?', empty)).speech).toBe(
      'Não tem horário vago hoje.',
    );
    expect((await interpretVoiceCommand('alguém mandou mensagem?', empty)).speech).toBe(
      'Ninguém mandou mensagem nova.',
    );
    expect((await interpretVoiceCommand('quantos clientes ainda tenho hoje?', empty)).speech).toBe(
      'Você não tem mais clientes hoje.',
    );
  });

  it('uses the LLM only for other questions', async () => {
    const llm = new FakeLlm([
      {
        when: /faturei/,
        reply: toolReply({
          name: 'responder_voz',
          arguments: { intent: 'unknown', speech: 'Isso eu ainda não sei responder.' },
        }),
      },
    ]);
    expect(await interpretVoiceCommand('quanto eu faturei hoje?', day, { llm })).toEqual({
      intent: 'unknown',
      speech: 'Isso eu ainda não sei responder.',
    });
    expect(await interpretVoiceCommand('quanto eu faturei hoje?', day)).toEqual({
      intent: 'unknown',
      speech: 'Não entendi. Pode repetir?',
    });
  });
});
