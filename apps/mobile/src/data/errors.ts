import type { ApiError } from '@boramarca/shared';

/**
 * Error thrown by every data implementation (mock and api). `message` is pt-BR and safe to show;
 * `code` matches the API error codes (e.g. `INVALID_CODE`, `OWNER_HAS_TEAM`).
 */
export class DataError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(body: ApiError) {
    super(body.message);
    this.name = 'DataError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }
}
