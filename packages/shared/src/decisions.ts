import { z } from 'zod';
import { EntityBase, Id, IsoDateTime } from './common';
import { MessageAuthor } from './conversations';
import { AgendaActionCall, DecisionTypeForTool } from './ai-tools';
import { AppointmentView } from './appointments';

export const DecisionType = DecisionTypeForTool;
export type DecisionType = z.infer<typeof DecisionType>;

export const DecisionStatus = z.enum(['pending', 'resolved', 'expired']);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const DecisionVia = z.enum(['voice', 'notification', 'app', 'alexa', 'timeout']);
export type DecisionVia = z.infer<typeof DecisionVia>;

/** Channels a human can answer through (`timeout` is set only by the system). */
export const AnswerVia = DecisionVia.exclude(['timeout']);
export type AnswerVia = z.infer<typeof AnswerVia>;

/** One suggested answer. `action` is what the backend runs if chosen (null = just reply / decline). */
export const DecisionOption = z.object({
  id: z.string().min(1).max(40),
  /** Button label: "Sim", "Não", "10h", "Empurro 20 min". */
  label: z.string().min(1).max(60),
  action: AgendaActionCall.nullable(),
});
export type DecisionOption = z.infer<typeof DecisionOption>;

/** Excerpt shown under "Ver conversa" (last messages, first name only). */
export const DecisionContext = z.object({
  clientFirstName: z.string(),
  messages: z.array(z.object({ author: MessageAuthor, text: z.string(), at: IsoDateTime })).max(10),
  /** Free-form extra data (freed slot, requested service...). */
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type DecisionContext = z.infer<typeof DecisionContext>;

export const AiDecision = EntityBase.extend({
  professionalId: Id,
  conversationId: Id.nullable(),
  clientId: Id.nullable(),
  type: DecisionType,
  /** Short question, also what is spoken: "Marco o Fulano às 15h?" */
  question: z.string().min(1).max(300),
  context: DecisionContext,
  options: z.array(DecisionOption).min(1).max(3),
  proposedAction: AgendaActionCall.nullable(),
  status: DecisionStatus,
  deadlineAt: IsoDateTime,
  timeoutNotifiedAt: IsoDateTime.nullable(),
  resolvedVia: DecisionVia.nullable(),
  resolvedOption: z.string().nullable(),
  resolvedText: z.string().nullable(),
});
export type AiDecision = z.infer<typeof AiDecision>;

export const DecisionView = AiDecision.extend({
  clientName: z.string().nullable(),
});
export type DecisionView = z.infer<typeof DecisionView>;

/** pt-BR labels for resolved decisions ("Você, por voz"). */
export const DECISION_VIA_LABELS: Record<DecisionVia, string> = {
  voice: 'Você, por voz',
  notification: 'Você, na notificação',
  app: 'Você, no app',
  alexa: 'Você, pela Alexa',
  timeout: 'Expirou — IA avisou o cliente',
};

// ---- GET /decisions?status=
export const DecisionListQuery = z.object({
  status: z.enum(['pending', 'resolved']).default('pending'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type DecisionListQuery = z.infer<typeof DecisionListQuery>;
/** Pending: most urgent first. "resolved" also returns `expired` ones. */
export const DecisionListResponse = z.object({ items: z.array(DecisionView) });
export type DecisionListResponse = z.infer<typeof DecisionListResponse>;

// ---- POST /decisions/:id/answer — the single entry point for voice, notification, app and Alexa
export const DecisionAnswerBody = z.union([
  z.object({ optionId: z.string().min(1), via: AnswerVia }),
  /** Free text ("pode, mas marca daqui 15 minutos") is turned into an action by the AI. */
  z.object({ text: z.string().trim().min(1).max(500), via: AnswerVia }),
]);
export type DecisionAnswerBody = z.infer<typeof DecisionAnswerBody>;

export const DecisionAnswerResponse = z.object({
  decision: DecisionView,
  /** Sentence to speak back: "Marquei o Fulano às 14h20". */
  spokenConfirmation: z.string(),
  /** Message that went (or will go) to the client; null when preview is off or nothing is sent. */
  clientMessagePreview: z.string().nullable(),
  appointment: AppointmentView.nullable(),
});
export type DecisionAnswerResponse = z.infer<typeof DecisionAnswerResponse>;

// ---- POST /decisions/:id/take-over ("Deixa que eu respondo")
export const DecisionTakeOverResponse = z.object({
  decision: DecisionView,
  conversationId: Id.nullable(),
});
export type DecisionTakeOverResponse = z.infer<typeof DecisionTakeOverResponse>;

/** Default answer window before the neutral "Já te confirmo!" goes out. */
export const DEFAULT_DECISION_DEADLINE_MINUTES = 10;
export const DECISION_TIMEOUT_CLIENT_MESSAGE = 'Já te confirmo!';
