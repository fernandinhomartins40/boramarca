import type {
  ConversationListQuery,
  ConversationListResponse,
  ConversationView,
  HandoffBody,
  HandoffResponse,
  Id,
  Message,
  MessageListQuery,
  MessageListResponse,
  SendMessageBody,
  SendMessageResponse,
} from '@boramarca/shared';
import { mockAppointments } from './agenda';
import { clients, ids } from './mock/fixtures';
import { fail, minutesAgo, newId, nowIso, reply, uid } from './mock/util';

/** WhatsApp conversations (prompt 06). Owner: agent C2; api implementation: D1. */
export interface ConversationsData {
  list(query?: Partial<ConversationListQuery>): Promise<ConversationListResponse>;
  /** Newest first; marks the conversation as read. */
  messages(id: Id, query?: Partial<MessageListQuery>): Promise<MessageListResponse>;
  /** Sent as the professional (goes through the send guard on the API). */
  send(id: Id, body: SendMessageBody): Promise<SendMessageResponse>;
  /** "IA respondendo" switch: `human` = "Deixa que eu respondo", `ai` = "Devolver para a IA". */
  handoff(id: Id, body: HandoffBody): Promise<HandoffResponse>;
}

type Line = [author: Message['author'], text: string, minutesAgo: number, extra?: Partial<Message>];

const c = ids.client;
/** Reference 07-conversas: six conversations (IA cuidando, áudio, com você, cancelamento). */
const seed: [
  n: number,
  clientId: string,
  handler: 'ai' | 'human',
  unread: number,
  lines: Line[],
][] = [
  [1, c.anaPaula, 'ai', 1, [['client', 'Quero agendar uma consulta para esta semana.', 172]]],
  [
    2,
    c.rafaelAlmeida,
    'ai',
    0,
    [
      ['client', 'Pode remarcar meu horário para quinta?', 206],
      ['ai', 'Vou ver com a Marina e já te falo!', 205],
    ],
  ],
  [
    3,
    c.beatriz,
    'ai',
    0,
    [
      ['client', 'Tem horário hoje à tarde?', 109],
      ['ai', 'Tenho às 16h. Pode ser?', 108],
      [
        'client',
        '',
        105,
        {
          kind: 'audio',
          text: null,
          transcription: 'Pode sim, às quatro está ótimo.',
          aiNote: 'Pedido de horário identificado',
        },
      ],
      ['ai', 'Seu horário está confirmado para hoje às 16h.', 104],
    ],
  ],
  [
    4,
    c.carlos,
    'human',
    0,
    [
      ['client', 'Vou precisar desmarcar as 17h, surgiu um imprevisto.', 5],
      ['professional', 'Sem problema, Carlos! Quer remarcar?', 4],
      ['client', 'Vocês têm horário na próxima semana?', 3],
    ],
  ],
  [5, c.juliana, 'ai', 0, [['client', 'Quero agendar um retorno.', 233]]],
  [6, c.lucas, 'ai', 2, [['client', 'Consigo um horário amanhã de manhã?', 255]]],
  [7, c.diego, 'ai', 1, [['client', 'Vou me atrasar uns 20 minutos, desculpa!', 1]]],
  [8, c.camila, 'ai', 1, [['client', 'Você faz pilates também?', 12]]],
];

export const mockMessages = new Map<string, Message[]>();
export const mockConversations: ConversationView[] = seed.map(
  ([n, clientId, handler, unread, lines]) => {
    const id = uid(0x300 + n);
    const client = clients.find((x) => x.id === clientId)!;
    const msgs = lines.map(([author, text, ago, extra], i): Message => ({
      id: uid(0x4000 + n * 0x10 + i),
      createdAt: minutesAgo(ago),
      updatedAt: minutesAgo(ago),
      conversationId: id,
      direction: author === 'client' ? 'in' : 'out',
      author,
      kind: 'text',
      text,
      transcription: null,
      aiNote: null,
      providerMessageId: null,
      ...extra,
    }));
    mockMessages.set(id, msgs);
    const last = msgs[msgs.length - 1]!;
    return {
      id,
      createdAt: msgs[0]!.createdAt,
      updatedAt: last.createdAt,
      professionalId: ids.professional,
      clientId,
      handler,
      unreadCount: unread,
      lastMessageAt: last.createdAt,
      clientName: client.name,
      clientPhone: client.phone,
      lastMessagePreview: last.text || last.transcription,
      lastMessageAuthor: last.author,
      nextAppointmentAt: null,
    };
  },
);

function find(id: Id) {
  return (
    mockConversations.find((x) => x.id === id) ?? fail(404, 'NOT_FOUND', 'Conversa não encontrada')
  );
}

function withNext(v: ConversationView): ConversationView {
  const next = mockAppointments
    .filter(
      (a) =>
        a.clientId === v.clientId &&
        ['scheduled', 'confirmed'].includes(a.status) &&
        a.startsAt > nowIso(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return { ...v, nextAppointmentAt: next?.startsAt ?? null };
}

export const mockConversationsData: ConversationsData = {
  async list(query = {}) {
    const filter = query.filter ?? 'all';
    const search = query.search?.trim().toLowerCase();
    const items = mockConversations
      .filter(
        (v) => filter === 'all' || (filter === 'unread' ? v.unreadCount > 0 : v.handler === filter),
      )
      .filter(
        (v) =>
          !search || v.clientName.toLowerCase().includes(search) || v.clientPhone.includes(search),
      )
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
      .map(withNext);
    return reply({ items, nextCursor: null });
  },
  async messages(id) {
    find(id).unreadCount = 0;
    const items = [...(mockMessages.get(id) ?? [])].reverse();
    return reply({ items, nextCursor: null });
  },
  async send(id, body) {
    const v = find(id);
    const at = nowIso();
    const m: Message = {
      id: newId(),
      createdAt: at,
      updatedAt: at,
      conversationId: id,
      direction: 'out',
      author: 'professional',
      kind: 'text',
      text: body.text,
      transcription: null,
      aiNote: null,
      providerMessageId: null,
    };
    mockMessages.get(id)!.push(m);
    Object.assign(v, {
      lastMessageAt: at,
      updatedAt: at,
      lastMessagePreview: body.text,
      lastMessageAuthor: 'professional',
    });
    return reply(m);
  },
  async handoff(id, body) {
    const v = find(id);
    v.handler = body.handler;
    v.updatedAt = nowIso();
    return reply(withNext(v));
  },
};
