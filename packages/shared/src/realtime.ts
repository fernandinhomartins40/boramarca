import { z } from 'zod';
import { IsoDateTime } from './common';
import { AiStatus } from './ai';
import { AppointmentView } from './appointments';
import { ConversationView, Message } from './conversations';
import { DecisionView } from './decisions';
import { WhatsAppStatusResponse } from './whatsapp';

/**
 * `WS /realtime?token=<accessToken>`: server -> client events, one JSON object per frame,
 * discriminated by `type`. Events are scoped to the authenticated professional.
 */
export const RealtimeQuery = z.object({ token: z.string().min(1) });
export type RealtimeQuery = z.infer<typeof RealtimeQuery>;

const event = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ type: z.literal(type), at: IsoDateTime, data });

export const RealtimeEvent = z.discriminatedUnion('type', [
  event('decision.created', z.object({ decision: DecisionView })),
  event('decision.resolved', z.object({ decision: DecisionView })),
  event(
    'appointment.changed',
    z.object({
      change: z.enum(['created', 'updated', 'rescheduled', 'cancelled', 'status']),
      appointment: AppointmentView,
    }),
  ),
  event('message.created', z.object({ conversationId: z.uuid(), message: Message })),
  event('conversation.updated', z.object({ conversation: ConversationView })),
  event('whatsapp.status', WhatsAppStatusResponse),
  event('ai.status', AiStatus),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEvent>;
export type RealtimeEventType = RealtimeEvent['type'];
export type RealtimeEventOf<T extends RealtimeEventType> = Extract<RealtimeEvent, { type: T }>;

export const REALTIME_EVENT_TYPES = RealtimeEvent.options.map(
  (o) => o.shape.type.value,
) as RealtimeEventType[];
