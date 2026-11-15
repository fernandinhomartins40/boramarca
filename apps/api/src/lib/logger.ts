// Structured logs without personal data (plan section 16): phones, message text, codes and tokens
// are censored wherever they appear (top level or one level down), and request URLs lose their
// query string (/realtime?token=, /whatsapp/pairing-code?phone=, /alexa/oauth/authorize?state=).
import type { FastifyServerOptions } from 'fastify';
import { stdSerializers } from 'pino';

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

interface DbErrorLike {
  name?: string;
  message?: string;
  stack?: string;
  query?: unknown;
  params?: unknown;
  code?: unknown;
  constraint_name?: unknown;
  cause?: DbErrorLike;
}

/** The stack without its first line(s): those repeat the message (with the query's values). */
const framesOnly = (stack?: string) => {
  const i = stack?.indexOf('\n    at ') ?? -1;
  return i >= 0 ? stack!.slice(i + 1) : undefined;
};

/**
 * `err` serializer (M9). A failed query (drizzle's DrizzleQueryError, postgres.js PostgresError)
 * carries the bound values (`params`, the message "Failed query: ... params: ...", the `detail`
 * "Key (phone)=(+55...)"): only the SQL text, the Postgres code (`pgCode`: `code` is censored) and the stack frames are logged.
 */
export function serializeErr(err: unknown) {
  const e = err as DbErrorLike;
  const pg = e?.name === 'PostgresError' ? e : e?.cause?.name === 'PostgresError' ? e.cause : null;
  const isQuery = e?.name === 'DrizzleQueryError' || (e && 'params' in e && 'query' in e);
  if (!pg && !isQuery) return stdSerializers.err(err as Error);
  return {
    type: e.name ?? 'Error',
    message: isQuery ? 'Failed query' : 'Database error',
    query: typeof e.query === 'string' ? e.query : undefined,
    pgCode: typeof pg?.code === 'string' ? pg.code : undefined,
    constraint: typeof pg?.constraint_name === 'string' ? pg.constraint_name : undefined,
    stack: framesOnly(e.stack) ?? '',
  };
}

export function loggerOptions(level: string) {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      err: serializeErr,
      req: (req: ReqLike) => ({
        method: req.method,
        url: req.url?.split('?')[0],
        remoteAddress: req.ip,
      }),
    },
  } satisfies FastifyServerOptions['logger'];
}
