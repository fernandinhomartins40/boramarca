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
  /** Firebase project (Authentication by phone = the SMS provider). Unset: POST /auth/firebase is 503. */
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
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
  /** Behind a reverse proxy (Caddy): trust X-Forwarded-For so per-IP limits see the real client. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Per-IP limits, per 10 minutes: public site form (POST /leads) and each /auth/otp/* route. */
  RATE_LIMIT_LEADS_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_OTP_MAX: z.coerce.number().int().min(1).default(30),
  /** Alexa (packages/alexa/.env.example). Without the three, the skill and linking answer 503. */
  ALEXA_SKILL_ID: z.string().startsWith('amzn1.ask.skill.').optional(),
  ALEXA_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  ALEXA_OAUTH_CLIENT_SECRET: z.string().min(16).optional(),
  /** Fallback Voice Monkey v3 token for professionals who did not save their own. */
  VOICE_MONKEY_TOKEN: z.string().min(1).optional(),
  /** 32 bytes, base64: encrypts secrets stored per professional (Voice Monkey token). */
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((s) => Buffer.from(s, 'base64').length === 32, '32 bytes em base64')
    .optional(),
  /** Transactional e-mail (lib/mail). Without the key mails are only logged. */
  VELOMAIL_API_URL: z.url().default('https://www.velomail.com.br/api/emails/send'),
  VELOMAIL_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default('Bora Marca <nao-responda@boramarca.com.br>'),
  MAIL_REPLY_TO: z.email().default('contato@boramarca.com.br'),
  /** Team inbox for new site leads/contact messages; unset = no notice. */
  MAIL_OPS_TO: z.email().optional(),
  /** Public addresses used in e-mail links (PUBLIC_API_URL is the internal one Evolution calls). */
  PUBLIC_SITE_URL: z.url().default('https://boramarca.com.br'),
  PUBLIC_API_BASE_URL: z.url().default('https://api.boramarca.com.br'),
  /** Subscription billing (docs/COBRANCA.md). Without the key: billing writes answer 503. */
  ASAAS_API_URL: z.url().default('https://api.asaas.com/v3'),
  ASAAS_API_KEY: z.string().min(1).optional(),
  /** Same token registered on the Asaas webhook (header asaas-access-token). */
  ASAAS_WEBHOOK_TOKEN: z.string().min(32).max(255).optional(),
  /** Days a charge may stay overdue before the AI and the reminders pause. */
  BILLING_GRACE_DAYS: z.coerce.number().int().min(0).max(60).default(7),
});

export type Config = z.infer<typeof Env>;

/** Validates env vars once at startup; fails fast with a readable list of problems. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty strings in .env mean "unset".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = Env.superRefine((c, ctx) => {
    if (c.NODE_ENV !== 'production') return;
    // B6: an .env.prod copied from the example must not boot (anyone could forge JWTs).
    const bad = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'WHATSAPP_WEBHOOK_SECRET'] as const)
      if (c[k]?.includes('change-me')) bad(k, 'troque o valor de exemplo');
    if (c.JWT_ACCESS_SECRET === c.JWT_REFRESH_SECRET)
      bad('JWT_REFRESH_SECRET', 'precisa ser diferente de JWT_ACCESS_SECRET');
    if (c.WHATSAPP_WEBHOOK_SECRET && c.WHATSAPP_WEBHOOK_SECRET.length < 16)
      bad('WHATSAPP_WEBHOOK_SECRET', 'use 16 caracteres ou mais');
  }).safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
