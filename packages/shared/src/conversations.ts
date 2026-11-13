import { z } from 'zod';
import { EntityBase, Id, IsoDateTime, PhoneE164, paginated } from './common';

export const ConversationHandler = z.enum(['ai', 'human']);
export type ConversationHandler = z.infer<typeof ConversationHandler>;

export const Conversation = EntityBase.extend({
  professionalId: Id,
  clientId: Id,
  handler: ConversationHandler,
  unreadCount: z.number().int().nonnegative(),
  lastMessageAt: IsoDateTime.nullable(),
});
export type Conversation = z.infer<typeof Conversation>;

export const MessageDirection = z.enum(['in', 'out']);
export type MessageDirection = z.infer<typeof MessageDirection>;
export const MessageAuthor = z.enum(['client', 'ai', 'professional']);
export type MessageAuthor = z.infer<typeof MessageAuthor>;
export const MessageKind = z.enum(['text', 'audio']);
export type MessageKind = z.infer<typeof MessageKind>;

export const Message = EntityBase.extend({
  conversationId: Id,
  direction: MessageDirection,
  author: MessageAuthor,
  kind: MessageKind,
  text: z.string().nullable(),
  /** Audio transcription (kind = audio). */
  transcription: z.string().nullable(),
  /** "Entendi como: pedido de horário para sábado de manhã". */
  aiNote: z.string().nullable(),
  providerMessageId: z.string().nullable(),
});
export type Message = z.infer<typeof Message>;

/** Conversation list item. */
export const ConversationView = Conversation.extend({
  clientName: z.string(),
  clientPhone: PhoneE164,
  lastMessagePreview: z.string().nullable(),
  lastMessageAuthor: MessageAuthor.nullable(),
  nextAppointmentAt: IsoDateTime.nullable(),
});
export type ConversationView = z.infer<typeof ConversationView>;

// ---- GET /conversations
export const ConversationFilter = z.enum(['all', 'ai', 'human', 'unread']);
export type ConversationFilter = z.infer<typeof ConversationFilter>;
export const ConversationListQuery = z.object({
  filter: ConversationFilter.default('all'),
  search: z.string().trim().max(120).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ConversationListQuery = z.infer<typeof ConversationListQuery>;
export const ConversationListResponse = paginated(ConversationView);
export type ConversationListResponse = z.infer<typeof ConversationListResponse>;

// ---- GET /conversations/:id/messages (newest first; marks the conversation as read)
export const MessageListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MessageListQuery = z.infer<typeof MessageListQuery>;
export const MessageListResponse = paginated(Message);
export type MessageListResponse = z.infer<typeof MessageListResponse>;

// ---- POST /conversations/:id/messages (sent as the professional, through the send guard)
export const SendMessageBody = z.object({ text: z.string().trim().min(1).max(1000) });
export type SendMessageBody = z.infer<typeof SendMessageBody>;
export const SendMessageResponse = Message;
export type SendMessageResponse = z.infer<typeof SendMessageResponse>;

// ---- POST /conversations/:id/handoff ("IA respondendo" switch: human = "Deixa que eu respondo")
export const HandoffBody = z.object({ handler: ConversationHandler });
export type HandoffBody = z.infer<typeof HandoffBody>;
export const HandoffResponse = ConversationView;
export type HandoffResponse = z.infer<typeof HandoffResponse>;

export const QUICK_REPLIES = [
  'Pode vir',
  'Estou sem horário hoje',
  'Te mando os horários livres',
] as const;
