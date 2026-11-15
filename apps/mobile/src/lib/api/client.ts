import type { z } from 'zod';
import {
  API_PREFIX,
  ApiError,
  routes,
  type AuthTokens,
  type RouteContract,
} from '@boramarca/shared';
import { DataError } from '@/data/errors';

/**
 * HTTP client of the api data layer (plan section 9). Every call goes through a route of
 * `routes` (packages/shared): method, path and response schema come from the contract.
 * - Bearer access token on `jwt`/`owner` routes;
 * - on 401, one `POST /auth/refresh` shared by every call waiting at that moment, then one retry;
 * - refresh rejected (401) = session over: `tokens.expired()` (the guard goes to Boas-vindas);
 * - every failure becomes a `DataError` with a pt-BR message.
 */

/** Where the tokens live (app: useSession + expo-secure-store; tests/script: memory). */
export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens): void;
  /** The refresh token was rejected: forget the session. */
  expired(): void;
}

export interface ApiClientOptions {
  /** EXPO_PUBLIC_API_URL, without `/v1` (e.g. http://10.0.2.2:3333). */
  baseUrl: string;
  tokens: TokenStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | undefined>;
type In<S> = S extends z.ZodType ? z.input<S> : never;
export type RouteInput<C extends RouteContract> = {
  params?: Record<string, string>;
  query?: Query;
} & (C['body'] extends z.ZodType ? { body: In<C['body']> } : { body?: undefined });
export type RouteOutput<C extends RouteContract> = z.output<C['response']>;

export interface ApiClient {
  call<C extends RouteContract>(route: C, input?: RouteInput<C>): Promise<RouteOutput<C>>;
  /** Single-flight refresh. Resolves with the new access token, or null when the session is over. */
  refresh(): Promise<string | null>;
  accessToken(): string | null;
  refreshToken(): string | null;
  baseUrl: string;
}

const NETWORK = (): DataError =>
  new DataError({ statusCode: 0, code: 'NETWORK', message: 'Sem conexão. Tente de novo.' });
const EXPIRED = (): DataError =>
  new DataError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Sessão expirada. Entre de novo.',
  });

export function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>,
  query?: Query,
) {
  const filled = path.replace(/:(\w+)/g, (_, k: string) => {
    const v = params?.[k];
    if (v === undefined) throw new Error(`parâmetro ${k} faltando em ${path}`);
    return encodeURIComponent(v);
  });
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}${filled}${qs ? `?${qs}` : ''}`;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let refreshing: Promise<string | null> | null = null;

  async function send(method: string, url: string, body: unknown, token: string | null) {
    if (!opts.baseUrl)
      throw new DataError({
        statusCode: 0,
        code: 'CONFIG',
        message: 'Endereço da API não configurado (EXPO_PUBLIC_API_URL).',
      });
    const headers: Record<string, string> = { Accept: 'application/json' };
    // Fastify rejects an empty body sent as JSON: only declare it when there is one.
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      return await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      });
    } catch {
      throw NETWORK();
    } finally {
      clearTimeout(timer);
    }
  }

  async function readJson(res: Response): Promise<unknown> {
    const text = await res.text().catch(() => '');
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  async function toError(res: Response): Promise<DataError> {
    const parsed = ApiError.safeParse(await readJson(res));
    if (parsed.success) return new DataError(parsed.data);
    return new DataError({
      statusCode: res.status,
      code: `HTTP_${res.status}`,
      message: 'Algo deu errado. Tente de novo.',
    });
  }

  function refresh(): Promise<string | null> {
    refreshing ??= (async () => {
      const refreshToken = opts.tokens.get()?.refreshToken;
      if (!refreshToken) return null;
      const route = routes.auth.refresh;
      const res = await send(
        route.method,
        buildUrl(opts.baseUrl, route.path),
        { refreshToken },
        null,
      );
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw await toError(res);
      const tokens = route.response.safeParse(await readJson(res));
      if (!tokens.success) throw invalid(tokens.error);
      opts.tokens.set(tokens.data);
      return tokens.data.accessToken;
    })()
      .then((token) => {
        if (!token) opts.tokens.expired();
        return token;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function call<C extends RouteContract>(
    route: C,
    input?: RouteInput<C>,
  ): Promise<RouteOutput<C>> {
    const url = buildUrl(opts.baseUrl, route.path, input?.params, input?.query);
    const authed = route.auth !== 'public';
    // a refresh already running means the current token is dead: wait for the new one
    const token = authed ? ((await refreshing) ?? opts.tokens.get()?.accessToken ?? null) : null;
    let res = await send(route.method, url, input?.body, token);
    if (authed && res.status === 401) {
      const fresh = await refresh();
      if (!fresh) throw EXPIRED();
      res = await send(route.method, url, input?.body, fresh);
      if (res.status === 401) {
        opts.tokens.expired();
        throw EXPIRED();
      }
    }
    if (!res.ok) throw await toError(res);
    const body = await readJson(res);
    const parsed = route.response.safeParse(body);
    if (!parsed.success) throw invalid(parsed.error);
    return parsed.data as RouteOutput<C>;
  }

  return {
    call,
    refresh,
    accessToken: () => opts.tokens.get()?.accessToken ?? null,
    refreshToken: () => opts.tokens.get()?.refreshToken ?? null,
    baseUrl: opts.baseUrl,
  };
}

function invalid(error: z.ZodError): DataError {
  return new DataError({
    statusCode: 0,
    code: 'INVALID_RESPONSE',
    message: 'O servidor respondeu algo inesperado. Atualize o app e tente de novo.',
    details: error.issues,
  });
}
