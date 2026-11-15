import { z } from 'zod';

const AlexaEnv = z.object({
  ALEXA_SKILL_ID: z.string().startsWith('amzn1.ask.skill.'),
  /** Optional: without it, the Voice Monkey announcement is off for everyone. */
  VOICE_MONKEY_TOKEN: z.string().min(1).optional(),
  ALEXA_OAUTH_CLIENT_ID: z.string().min(1),
  ALEXA_OAUTH_CLIENT_SECRET: z.string().min(16),
});
export type AlexaConfig = z.infer<typeof AlexaEnv>;

/** Same names as `packages/alexa/.env.example`. Throws a readable error when one is missing. */
export function readAlexaConfig(
  env: Record<string, string | undefined> = process.env,
): AlexaConfig {
  return AlexaEnv.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
}
