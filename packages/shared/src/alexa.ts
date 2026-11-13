import { z } from 'zod';

/**
 * `POST /alexa/skill` receives the Alexa Skills Kit request envelope (validated by the Amazon
 * signature, not by JWT). Only the fields the API routes on are typed; the rest passes through
 * and `packages/alexa` (ask-sdk-core) handles it.
 */
export const AlexaSkillRequest = z.looseObject({
  version: z.string(),
  session: z.looseObject({}).optional(),
  context: z.looseObject({}).optional(),
  request: z.looseObject({
    type: z.string(),
    requestId: z.string(),
    timestamp: z.string(),
    locale: z.string().optional(),
  }),
});
export type AlexaSkillRequest = z.infer<typeof AlexaSkillRequest>;

export const AlexaSkillResponse = z.looseObject({
  version: z.string(),
  response: z.looseObject({}),
});
export type AlexaSkillResponse = z.infer<typeof AlexaSkillResponse>;

/** Per-professional Alexa / Voice Monkey settings (proactive announcement of new decisions). */
export const AlexaSettings = z.object({
  linked: z.boolean(),
  voiceMonkeyEnabled: z.boolean(),
  /** Voice Monkey device/routine name; the API token stays in env vars, never here. */
  voiceMonkeyDevice: z.string().max(100).nullable(),
});
export type AlexaSettings = z.infer<typeof AlexaSettings>;

/** Max time to answer Alexa (plan section 14). */
export const ALEXA_RESPONSE_BUDGET_MS = 8000;
