import type { ApiError } from '@boramarca/shared';

/** Clearer text for the 409s the professional can hit from the app (API message as fallback). */
const MESSAGES: Record<string, string> = {
  CLIENT_NEVER_WROTE:
    'Só entra na lista de espera quem já falou com você pelo WhatsApp. Peça para a pessoa mandar uma mensagem antes.',
  NOT_STARTED:
    'Esse atendimento ainda não começou. Dá para marcar "chegou" ou "concluído" a partir do horário marcado.',
  PHONE_LOCKED:
    'O telefone de um profissional não pode ser trocado. Para usar outro número, crie uma conta nova com ele.',
};

/**
 * Error thrown by every data implementation (mock and api). `message` is pt-BR and safe to show;
 * `code` matches the API error codes (e.g. `INVALID_CODE`, `OWNER_HAS_TEAM`).
 */
export class DataError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(body: ApiError) {
    super(MESSAGES[body.code] ?? body.message);
    this.name = 'DataError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }
}
