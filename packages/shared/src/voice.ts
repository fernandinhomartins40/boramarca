import { z } from 'zod';
import { Id } from './common';

// ---- POST /voice/command — text recognized on the device; answer to be spoken (target: 3 s)
export const VoiceCommandBody = z.object({
  text: z.string().trim().min(1).max(500),
  /** Set when the professional is answering a decision that was just spoken. */
  decisionId: Id.optional(),
});
export type VoiceCommandBody = z.infer<typeof VoiceCommandBody>;

export const VoiceIntent = z.enum([
  'remaining_clients',
  'free_slots',
  'next_client',
  'new_messages',
  'answer_decision',
  'unknown',
]);
export type VoiceIntent = z.infer<typeof VoiceIntent>;

export const VoiceCommandResponse = z.object({
  intent: VoiceIntent,
  /** Sentence to speak, pt-BR. */
  speech: z.string(),
  /** Decision answered by this command, if any. */
  decisionId: Id.nullable(),
});
export type VoiceCommandResponse = z.infer<typeof VoiceCommandResponse>;

// ---- GET /voice/summary?moment=open|close
export const VoiceSummaryMoment = z.enum(['open', 'close']);
export type VoiceSummaryMoment = z.infer<typeof VoiceSummaryMoment>;
export const VoiceSummaryQuery = z.object({ moment: VoiceSummaryMoment });
export type VoiceSummaryQuery = z.infer<typeof VoiceSummaryQuery>;
export const VoiceSummaryResponse = z.object({
  moment: VoiceSummaryMoment,
  speech: z.string(),
});
export type VoiceSummaryResponse = z.infer<typeof VoiceSummaryResponse>;

/** Questions that must work by voice (plan section 9). */
export const VOICE_SAMPLE_QUESTIONS = [
  'quantos clientes ainda tenho hoje?',
  'tem horário vago?',
  'quem é o próximo?',
  'alguém mandou mensagem?',
] as const;
