import { z } from 'zod';
import { IsoDateTime } from './common';

/** How the AI talks to clients. */
export const AiTone = z.enum(['descontraido', 'simpatico', 'formal']);
export type AiTone = z.infer<typeof AiTone>;

export const AI_TONE_LABELS: Record<AiTone, string> = {
  descontraido: 'Descontraído',
  simpatico: 'Simpático',
  formal: 'Mais formal',
};

/**
 * `professionals.autonomy` (plan section 6): what the AI may do without asking.
 * `change_other_client` is locked: it always asks. The schema only accepts `false`,
 * so any attempt to turn it on fails validation (the API must also reject it).
 */
export const Autonomy = z.object({
  answer_price_address: z.boolean(),
  confirm_reminders: z.boolean(),
  book_free_slot_known_client: z.boolean(),
  cancel_on_request: z.boolean(),
  change_other_client: z.literal(false),
});
export type Autonomy = z.infer<typeof Autonomy>;

export const DEFAULT_AUTONOMY: Autonomy = {
  answer_price_address: true,
  confirm_reminders: true,
  book_free_slot_known_client: false,
  cancel_on_request: true,
  change_other_client: false,
};

/** Keys the professional can toggle (the locked one is not here). */
export const AUTONOMY_EDITABLE_KEYS = [
  'answer_price_address',
  'confirm_reminders',
  'book_free_slot_known_client',
  'cancel_on_request',
] as const;
export const AUTONOMY_LOCKED_KEYS = ['change_other_client'] as const;

/** Partial update used by `PATCH /ai/settings`; `.strict()` rejects `change_other_client`. */
export const AutonomyPatch = z
  .object({
    answer_price_address: z.boolean(),
    confirm_reminders: z.boolean(),
    book_free_slot_known_client: z.boolean(),
    cancel_on_request: z.boolean(),
  })
  .partial()
  .strict();
export type AutonomyPatch = z.infer<typeof AutonomyPatch>;

// ---- Routes: POST /ai/pause, POST /ai/resume, PATCH /ai/settings, POST /messages/preview

/** `until: null` means "até eu voltar" (no end). */
export const AiPauseRequest = z.object({
  until: IsoDateTime.nullable(),
});
export type AiPauseRequest = z.infer<typeof AiPauseRequest>;

export const AiStatus = z.object({
  aiEnabled: z.boolean(),
  aiPausedUntil: IsoDateTime.nullable(),
  /** True when paused with no end date. */
  pausedIndefinitely: z.boolean(),
});
export type AiStatus = z.infer<typeof AiStatus>;

export const AiSettingsPatch = z
  .object({
    aiEnabled: z.boolean(),
    aiTone: AiTone,
    autonomy: AutonomyPatch,
  })
  .partial()
  .strict();
export type AiSettingsPatch = z.infer<typeof AiSettingsPatch>;

export const AiSettings = z.object({
  aiEnabled: z.boolean(),
  aiPausedUntil: IsoDateTime.nullable(),
  aiTone: AiTone,
  autonomy: Autonomy,
});
export type AiSettings = z.infer<typeof AiSettings>;

/** Message templates the preview endpoint can render. */
export const MessagePreviewKind = z.enum([
  'booking_confirmation',
  'reschedule',
  'cancellation',
  'delay_notice',
  'reminder',
  'waitlist_offer',
  'welcome',
  'decision_answer',
  'tone_sample',
]);
export type MessagePreviewKind = z.infer<typeof MessagePreviewKind>;

export const MessagePreviewRequest = z.object({
  kind: MessagePreviewKind,
  tone: AiTone.optional(),
  appointmentId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  decisionId: z.uuid().optional(),
  /** Extra values for the template (e.g. `{ delayMinutes: 15, slotStartsAt: "..." }`). */
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type MessagePreviewRequest = z.infer<typeof MessagePreviewRequest>;

export const MessagePreviewResponse = z.object({
  text: z.string(),
});
export type MessagePreviewResponse = z.infer<typeof MessagePreviewResponse>;
