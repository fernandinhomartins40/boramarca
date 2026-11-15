import { z } from 'zod';

const EvolutionEnv = z.object({
  EVOLUTION_BASE_URL: z.url(),
  EVOLUTION_API_KEY: z.string().min(1),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(16),
  /** Base URL Evolution uses to reach the API; the webhook is `${PUBLIC_API_URL}/v1/webhooks/whatsapp/:instance`. */
  PUBLIC_API_URL: z.url(),
});

export type EvolutionConfig = z.infer<typeof EvolutionEnv>;

/** Same variable names as apps/api/.env.example. Throws a readable error when one is missing. */
export function readEvolutionConfig(
  env: Record<string, string | undefined> = process.env,
): EvolutionConfig {
  return EvolutionEnv.parse(env);
}
