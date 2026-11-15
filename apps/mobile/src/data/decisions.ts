import type {
  DecisionAnswerBody,
  DecisionAnswerResponse,
  DecisionListResponse,
  DecisionOption,
  DecisionTakeOverResponse,
  DecisionView,
  Id,
} from '@boramarca/shared';
import { applyMockAgendaAction } from './agenda';
import { mockConversations } from './conversations';
import { clientName, firstName, ids, professional } from './mock/fixtures';
import {
  base,
  fail,
  minutesAgo,
  minutesFromNow,
  newId,
  nowIso,
  reply,
  todayAt,
  uid,
} from './mock/util';

/**
 * AI decisions (prompt 05). Owner: agent C2; api implementation: D1.
 * Screens never call `answer` directly: they go through `handleDecisionAction` (src/features/decisions).
 */
export interface DecisionsData {
  /** Pending: most urgent first. Resolved: also returns expired ones. */
  list(status: 'pending' | 'resolved'): Promise<DecisionListResponse>;
  answer(id: Id, body: DecisionAnswerBody): Promise<DecisionAnswerResponse>;
  /** "Deixa que eu respondo". */
  takeOver(id: Id): Promise<DecisionTakeOverResponse>;
}

const c = ids.client;
const sessao = ids.service.sessao;
const conv = (n: number) => uid(0x300 + n);

function decision(
  n: number,
  clientId: string,
  conversationN: number,
  fields: Pick<DecisionView, 'type' | 'question' | 'options'> & {
    lines: [author: 'client' | 'ai', text: string, minutesAgo: number][];
    extra?: Record<string, unknown>;
    ageMin: number;
    deadlineMin: number;
  },
): DecisionView {
  const name = clientName(clientId)!;
  return {
    ...base(uid(0x500 + n), fields.ageMin),
    professionalId: ids.professional,
    conversationId: conv(conversationN),
    clientId,
    type: fields.type,
    question: fields.question,
    context: {
      clientFirstName: firstName(name),
      messages: fields.lines.map(([author, text, ago]) => ({ author, text, at: minutesAgo(ago) })),
      extra: fields.extra,
    },
    options: fields.options,
    proposedAction: fields.options[0]?.action ?? null,
    status: 'pending',
    deadlineAt: minutesFromNow(fields.deadlineMin),
    timeoutNotifiedAt: null,
    resolvedVia: null,
    resolvedOption: null,
    resolvedText: null,
    clientName: name,
  };
}

const no = (label = 'Não'): DecisionOption => ({ id: 'nao', label, action: null });

/** One decision of each of the five types, plus history (references 04 and 06). */
export const mockDecisions: DecisionView[] = [
  decision(1, c.beatriz, 3, {
    type: 'encaixe',
    question: 'O horário das 16h vagou. Posso marcar a Beatriz?',
    options: [
      {
        id: 'sim',
        label: 'Sim, pode marcar',
        action: {
          name: 'marcar',
          arguments: { serviceIds: [sessao], startsAt: todayAt('16:00'), isFitIn: true },
        },
      },
      no(),
    ],
    lines: [
      ['client', 'Tem horário hoje à tarde?', 4],
      ['ai', 'Vou ver aqui e já te falo!', 3],
    ],
    extra: { freedSlot: todayAt('16:00'), reason: 'Ela pediu para vir hoje à tarde.' },
    ageMin: 2,
    deadlineMin: 8,
  }),
  decision(2, c.rafaelAlmeida, 2, {
    type: 'remarcar',
    question: 'Pode passar das 15h para as 17h?',
    options: [
      {
        id: 'sim',
        label: 'Sim, pode',
        action: {
          name: 'remarcar',
          arguments: { appointmentId: uid(0x207), startsAt: todayAt('17:00') },
        },
      },
      no(),
    ],
    lines: [['client', 'Pode remarcar meu horário para mais tarde? Das 15h para as 17h.', 6]],
    ageMin: 5,
    deadlineMin: 5,
  }),
  decision(3, c.juliana, 5, {
    type: 'novo_horario',
    question: 'Juliana quer um retorno amanhã. Tenho 10h ou 16h. Qual ofereço?',
    options: [
      {
        id: '10h',
        label: '10h',
        action: {
          name: 'marcar',
          arguments: { serviceIds: [sessao], startsAt: todayAt('10:00', 1), isFitIn: false },
        },
      },
      {
        id: '16h',
        label: '16h',
        action: {
          name: 'marcar',
          arguments: { serviceIds: [sessao], startsAt: todayAt('16:00', 1), isFitIn: false },
        },
      },
      no('Nenhum'),
    ],
    lines: [['client', 'Quero agendar um retorno.', 9]],
    ageMin: 8,
    deadlineMin: 2,
  }),
  decision(4, c.diego, 7, {
    type: 'atraso',
    question: 'Diego disse que vai atrasar 20 min. Empurro ou remarco?',
    options: [
      {
        id: 'empurrar',
        label: 'Empurro 20 min',
        action: {
          name: 'remarcar',
          arguments: { appointmentId: uid(0x209), startsAt: todayAt('18:20') },
        },
      },
      { id: 'remarcar', label: 'Remarco', action: null },
    ],
    lines: [['client', 'Vou me atrasar uns 20 minutos, desculpa!', 1]],
    ageMin: 1,
    deadlineMin: 9,
  }),
  decision(5, c.camila, 8, {
    type: 'duvida',
    question: 'Uma cliente perguntou se você faz pilates. Faz?',
    options: [
      {
        id: 'sim',
        label: 'Sim, faço',
        action: {
          name: 'responder_cliente',
          arguments: { text: 'Faço sim! Quer que eu veja um horário?' },
        },
      },
      no('Não faço'),
    ],
    lines: [['client', 'Você faz pilates também?', 12]],
    ageMin: 11,
    deadlineMin: 6,
  }),
  {
    ...decision(6, c.lucas, 6, {
      type: 'encaixe',
      question: 'Posso marcar o Lucas às 17h30?',
      options: [{ id: 'sim', label: 'Sim', action: null }, no()],
      lines: [['client', 'Consigo um horário amanhã de manhã?', 120]],
      ageMin: 130,
      deadlineMin: -120,
    }),
    status: 'resolved',
    resolvedVia: 'voice',
    resolvedOption: 'sim',
  },
  {
    ...decision(7, c.anaPaula, 1, {
      type: 'novo_horario',
      question: 'Ana Paula quer consulta nesta semana. Ofereço quinta 9h?',
      options: [{ id: 'sim', label: 'Sim', action: null }, no()],
      lines: [['client', 'Quero agendar uma consulta para esta semana.', 200]],
      ageMin: 210,
      deadlineMin: -200,
    }),
    status: 'expired',
    resolvedVia: 'timeout',
    timeoutNotifiedAt: minutesAgo(200),
  },
];

const urgency = (a: DecisionView, b: DecisionView) => a.deadlineAt.localeCompare(b.deadlineAt);

function find(id: Id) {
  return mockDecisions.find((d) => d.id === id) ?? fail(404, 'NOT_FOUND', 'Decisão não encontrada');
}

/** Adds a new pending decision (dev menu "Simular decisão nova"). */
export function pushMockDecision(): DecisionView {
  const d = decision(0x50 + mockDecisions.length, c.rafaelFerreira, 6, {
    type: 'encaixe',
    question: 'Rafael quer horário hoje. Posso marcar às 16h50?',
    options: [
      {
        id: 'sim',
        label: 'Sim, pode marcar',
        action: {
          name: 'marcar',
          arguments: { serviceIds: [sessao], startsAt: todayAt('16:50'), isFitIn: true },
        },
      },
      no(),
    ],
    lines: [['client', 'Tem um horário pra hoje?', 0]],
    ageMin: 0,
    deadlineMin: 10,
  });
  d.id = newId();
  mockDecisions.push(d);
  return d;
}

export const mockDecisionsData: DecisionsData = {
  async list(status) {
    const items = mockDecisions
      .filter((d) => (status === 'pending' ? d.status === 'pending' : d.status !== 'pending'))
      .sort(status === 'pending' ? urgency : (a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return reply({ items });
  },
  async answer(id, body) {
    const d = find(id);
    if (d.status !== 'pending') fail(409, 'ALREADY_RESOLVED', 'Essa decisão já foi resolvida');
    const option = 'optionId' in body ? d.options.find((o) => o.id === body.optionId) : undefined;
    if ('optionId' in body && !option) fail(400, 'INVALID_OPTION', 'Opção inválida');
    const appointment = option?.action ? applyMockAgendaAction(option.action, d.clientId) : null;
    Object.assign(d, {
      status: 'resolved',
      resolvedVia: body.via,
      resolvedOption: option?.id ?? null,
      resolvedText: 'text' in body ? body.text : null,
      updatedAt: nowIso(),
    });
    const who = d.context.clientFirstName;
    const yes = option ? option.id !== 'nao' : true;
    const sent = yes
      ? `Olá, ${who}! Seu agendamento foi confirmado. Nos vemos lá!`
      : `Oi, ${who}! Hoje não consigo, mas te aviso se vagar um horário.`;
    return reply({
      decision: d,
      spokenConfirmation: yes ? `Pronto. Já avisei ${who}.` : 'Tudo bem, não marquei.',
      // same rule as the API: null when "Não mostrar prévia de novo" is on
      clientMessagePreview: professional.skipMessagePreview ? null : sent,
      appointment,
    });
  },
  async takeOver(id) {
    const d = find(id);
    if (d.status !== 'pending') fail(409, 'ALREADY_RESOLVED', 'Essa decisão já foi resolvida');
    Object.assign(d, {
      status: 'resolved',
      resolvedVia: 'app',
      resolvedOption: 'take_over',
      resolvedText: 'Deixa que eu respondo',
      updatedAt: nowIso(),
    });
    // like the API: the conversation goes to "Com você"
    const conversation = mockConversations.find((v) => v.id === d.conversationId);
    if (conversation) conversation.handler = 'human';
    return reply({ decision: d, conversationId: d.conversationId });
  },
};
