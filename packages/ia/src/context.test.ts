import { describe, expect, it } from 'vitest';
import { buildContext, maskPii } from './context';
import { FakeLlm, toolReply } from './fake-llm';
import { interpretClientMessage } from './interpret-client';
import { at, IDS, makeInput, NOW } from './fixtures';

const PHONE_PATTERNS = [/\+?55\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}/, /\d{8,}/, /\d{4,5}[-\s]\d{4}/];

describe('maskPii', () => {
  it('masks phones, e-mails and long numbers, keeps times and prices', () => {
    const out = maskPii(
      'me liga +55 11 91234-5678 ou (11) 3456-7890, email ana@x.com.br, cpf 123.456.789-00, cartão 4111111111111111, às 14:30, R$ 50,00',
    );
    expect(out).not.toMatch(/91234|3456-7890|ana@|123\.456|4111/);
    expect(out).toContain('14:30');
    expect(out).toContain('R$ 50,00');
  });
});

describe('buildContext', () => {
  it('never sends a phone, even inside message bodies, and only the first name', async () => {
    const input = makeInput('meu número novo é 11 98765-4321, anota aí. Tem horário?', {
      clientName: 'Fulano de Tal',
      history: [
        { author: 'client', text: 'oi, aqui é o Fulano de Tal, +5511912345678', at: NOW },
        { author: 'ai', text: 'Oi, Fulano!', at: NOW },
        {
          author: 'client',
          text: 'meu whats reserva: (21) 99999-8888 e e-mail fulano@gmail.com',
          at: NOW,
        },
      ],
    });
    const ctx = buildContext(input);
    const llm = new FakeLlm([], {
      fallback: toolReply({ name: 'responder_cliente', arguments: { text: 'Tem sim!' } }),
    });
    await interpretClientMessage(ctx, llm);
    // Ids are UUIDs (digits by design); everything else must be free of phone-like numbers.
    const sent = llm
      .sentText()
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>');
    for (const p of PHONE_PATTERNS) expect(sent).not.toMatch(p);
    for (const digits of ['5511912345678', '11987654321', '21999998888'])
      expect(sent.replace(/\D/g, '')).not.toContain(digits);
    expect(sent).not.toContain('fulano@gmail.com');
    expect(sent).not.toContain('de Tal');
    expect(sent).not.toContain('Pereira'); // other clients: first name only
    expect(sent).toContain('Fulano');
  });

  it('starts with the fixed system prompt and ends with the new message', () => {
    const a = buildContext(makeInput('oi'));
    const b = buildContext(makeInput('tchau', { professions: ['dentista'] }));
    expect(a.messages[0]).toEqual(b.messages[0]);
    expect(a.messages.at(-1)?.content).toBe('oi');
    expect(b.meta.isHealth).toBe(true);
    expect(String(b.messages[1]?.content)).toContain('Conta de saúde: sim');
  });

  it('marks transcribed audio', () => {
    const ctx = buildContext(
      makeInput('tem horário amanhã?', {
        message: { text: 'tem horário amanhã?', transcribedFromAudio: true },
      }),
    );
    expect(ctx.messages.at(-1)?.content).toBe('(áudio transcrito) tem horário amanhã?');
  });

  it('other clients of the day go out only as busy times; this client keeps the details', () => {
    const input = makeInput('qual o endereço?', { professions: ['psicologo'] });
    input.day.appointments[0]!.serviceNames = ['Sessão de psicoterapia'];
    input.day.appointments.push({
      id: IDS.apptFulano,
      clientId: IDS.fulano,
      clientName: 'Fulano de Tal',
      startsAt: at('16:00'),
      endsAt: at('16:50'),
      serviceNames: ['Avaliação'],
      status: 'scheduled',
    });
    const sent = buildContext(input)
      .messages.map((m) => String(m.content))
      .join(' ');
    for (const leak of [
      'Ana',
      'Carlos',
      'psicoterapia',
      IDS.ana,
      IDS.carlos,
      IDS.apptAna,
      IDS.apptCarlos,
    ])
      expect(sent).not.toContain(leak);
    expect(sent).toContain('13h–13h30 | ocupado');
    expect(sent).toContain('15h–15h30 | ocupado');
    expect(sent).toContain(`Avaliação | scheduled | appointmentId ${IDS.apptFulano}`);
  });
});
