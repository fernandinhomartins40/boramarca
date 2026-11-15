import type { z } from 'zod';
import { API_PREFIX, ApiError, type RouteContract } from '@boramarca/shared';
import { API_URL } from './site';

/** Error thrown by `callApi`; `message` is pt-BR and safe to show. */
export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Body<C extends RouteContract> = C['body'] extends z.ZodType ? z.input<C['body']> : never;

/** Calls one route of `@boramarca/shared` routes (no path params needed by the site). */
export async function callApi<C extends RouteContract>(
  route: C,
  opts: { body?: Body<C>; token?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<z.output<C['response']>> {
  let res: Response;
  try {
    res = await fetchImpl(`${API_URL}${API_PREFIX}${route.path}`, {
      method: route.method,
      headers: {
        ...(opts.body !== undefined && { 'content-type': 'application/json' }),
        ...(opts.token && { authorization: `Bearer ${opts.token}` }),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiCallError(0, 'NETWORK', 'Sem conexão com o servidor. Tente de novo em instantes.');
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiError.safeParse(json);
    if (err.success)
      throw new ApiCallError(res.status, err.data.code, err.data.message, err.data.details);
    throw new ApiCallError(res.status, 'UNKNOWN', 'Algo deu errado. Tente de novo em instantes.');
  }
  return json as z.output<C['response']>;
}

/** First zod issue message per field, for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? '');
    out[k] ??= i.message;
  }
  return out;
}

/** "(11) 98765-4321" → "+5511987654321". Numbers typed with "+" keep their country code. */
export function toE164(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (input.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}
