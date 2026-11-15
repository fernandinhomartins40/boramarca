import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ApiError } from '@boramarca/shared';

/** Business error: `message` is pt-BR and safe to show; `code` is stable for clients. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Registro') =>
  new AppError(404, 'NOT_FOUND', `${what} não encontrado`);

/** Postgres error code (drizzle wraps driver errors in `cause`). */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = typeof e?.code === 'string' ? e.code : e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}
export const PG_UNIQUE = '23505';
export const PG_EXCLUSION = '23P01';

/** Every 4xx/5xx goes out as `ApiError`. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    let body: ApiError;
    if (err instanceof AppError) {
      body = {
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        details: err.details,
      };
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      body = {
        statusCode: 400,
        code: 'VALIDATION',
        message: 'Confira os dados enviados',
        details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      };
    } else if (err.statusCode === 401) {
      body = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Sessão expirada. Entre de novo.' };
    } else if (err.statusCode && err.statusCode < 500) {
      body = { statusCode: err.statusCode, code: err.code ?? 'BAD_REQUEST', message: err.message };
    } else {
      req.log.error({ err }, 'unhandled error');
      body = { statusCode: 500, code: 'INTERNAL', message: 'Algo deu errado. Tente de novo.' };
    }
    return reply.status(body.statusCode).send(body);
  });
}
