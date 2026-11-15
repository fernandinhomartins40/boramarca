import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  EVOLUTION_BASE_URL: z.url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_API_URL: z.url().optional(),
  REVIEW_PHONE: z.string().optional(),
  REVIEW_OTP: z.string().optional(),
  // Send guard (packages/whatsapp readSendGuardConfig), LLM and transcription (packages/ia
  // create*FromEnv): validated by those packages; kept here so the whole env is in one place.
  WA_GUARD_PER_MINUTE: z.string().optional(),
  WA_GUARD_PER_DAY: z.string().optional(),
  WA_GUARD_TYPING_MIN_SECONDS: z.string().optional(),
  WA_GUARD_TYPING_MAX_SECONDS: z.string().optional(),
  WA_GUARD_MAX_CHARS: z.string().optional(),
  WA_GUARD_MAX_PARTS: z.string().optional(),
  WA_GUARD_DROP_QUEUED_AFTER_MINUTES: z.string().optional(),
  LLM_PRIMARY_BASE_URL: z.string().optional(),
  LLM_PRIMARY_API_KEY: z.string().optional(),
  LLM_PRIMARY_MODEL: z.string().optional(),
  LLM_FALLBACK_BASE_URL: z.string().optional(),
  LLM_FALLBACK_API_KEY: z.string().optional(),
  LLM_FALLBACK_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.string().optional(),
  TRANSCRIBE_BASE_URL: z.string().optional(),
  TRANSCRIBE_API_KEY: z.string().optional(),
  TRANSCRIBE_MODEL: z.string().optional(),
  TRANSCRIBE_LANGUAGE: z.string().optional(),
  /** `expo` (default in production) or `fake` (default elsewhere: notifications go to the log). */
  PUSH_PROVIDER: z.enum(['expo', 'fake']).optional(),
  /** Only when "enhanced push security" is on in the Expo project. */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Minutes the professional has to answer a Decision before the neutral reply goes out. */
  DECISION_DEADLINE_MINUTES: z.coerce.number().int().min(1).max(240).optional(),
});

export type Config = z.infer<typeof Env>;

/** Validates env vars once at startup; fails fast with a readable list of problems. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty strings in .env mean "unset".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = Env.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
