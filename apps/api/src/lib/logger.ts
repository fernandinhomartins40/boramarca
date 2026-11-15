// Structured logs without personal data (plan section 16): phones, message text, codes and tokens
// are censored wherever they appear (top level or one level down), and request URLs lose their
// query string (/realtime?token=, /whatsapp/pairing-code?phone=, /alexa/oauth/authorize?state=).
import type { FastifyServerOptions } from 'fastify';

const SECRET_KEYS = [
  'phone',
  'toPhone',
  'fromPhone',
  'clientPhone',
  'text',
  'transcription',
  'code',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'code_verifier',
  'client_secret',
  'voiceMonkeyToken',
  'authorization',
  'cookie',
];

export const REDACT_PATHS = [
  ...SECRET_KEYS.flatMap((k) => [k, `*.${k}`]),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-boramarca-webhook-secret"]',
  'req.headers["signature-256"]',
];

interface ReqLike {
  method?: string;
  url?: string;
  ip?: string;
  routeOptions?: { url?: string };
}

export function loggerOptions(level: string) {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      req: (req: ReqLike) => ({
        method: req.method,
        url: req.url?.split('?')[0],
        remoteAddress: req.ip,
      }),
    },
  } satisfies FastifyServerOptions['logger'];
}
