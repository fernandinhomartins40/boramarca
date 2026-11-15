import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type ConversationView,
  type Message,
} from '@boramarca/shared';
import type { Db } from '../../db/client';
import { clients, conversations, type messages } from '../../db/schema';
import { realtimeEvent, type EventBus } from '../../lib/event-bus';
import { wire } from '../../lib/serialize';

const active = sql.raw(ACTIVE_APPOINTMENT_STATUSES.map((s) => `'${s}'`).join(','));
const lastText = sql<
  string | null
>`(select coalesce(m.text, m.transcription) from messages m where m.conversation_id = conversations.id order by m.created_at desc limit 1)`;
const lastAuthor = sql<
  'client' | 'ai' | 'professional' | null
>`(select m.author from messages m where m.conversation_id = conversations.id order by m.created_at desc limit 1)`;
const nextAppt = sql<
  string | null
>`(select to_char(min(a.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from appointments a where a.client_id = conversations.client_id and a.status in (${active}) and a.starts_at > now())`;

export const conversationColumns = {
  c: conversations,
  clientName: clients.name,
  clientPhone: clients.phone,
  lastMessagePreview: lastText,
  lastMessageAuthor: lastAuthor,
  nextAppointmentAt: nextAppt,
};

export function toConversationView(r: {
  c: typeof conversations.$inferSelect;
  clientName: string;
  clientPhone: string;
  lastMessagePreview: string | null;
  lastMessageAuthor: ConversationView['lastMessageAuthor'];
  nextAppointmentAt: string | null;
}): ConversationView {
  const { c, lastMessagePreview, ...rest } = r;
  return {
    ...wire(c),
    ...rest,
    lastMessagePreview: lastMessagePreview?.slice(0, 120) ?? null,
  };
}

export async function conversationViews(db: Db, professionalId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select(conversationColumns)
    .from(conversations)
    .innerJoin(clients, eq(clients.id, conversations.clientId))
    .where(and(eq(conversations.professionalId, professionalId), inArray(conversations.id, ids)));
  return rows.map(toConversationView);
}

export const messageWire = (m: typeof messages.$inferSelect): Message => wire(m);

/** `message.created` + `conversation.updated` (also used when a message changes: the app upserts by id). */
export async function publishMessage(
  db: Db,
  bus: EventBus,
  professionalId: string,
  m: typeof messages.$inferSelect,
) {
  await bus
    .publish(
      professionalId,
      realtimeEvent('message.created', {
        conversationId: m.conversationId,
        message: messageWire(m),
      }),
    )
    .catch(() => {});
  await publishConversation(db, bus, professionalId, m.conversationId);
}

export async function publishConversation(
  db: Db,
  bus: EventBus,
  professionalId: string,
  conversationId: string,
) {
  const [v] = await conversationViews(db, professionalId, [conversationId]);
  if (v)
    await bus
      .publish(professionalId, realtimeEvent('conversation.updated', { conversation: v }))
      .catch(() => {});
  return v;
}
