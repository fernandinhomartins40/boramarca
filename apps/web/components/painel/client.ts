import type { z } from 'zod';
import { API_PREFIX, ApiError, AuthTokens, routes, type RouteContract } from '@boramarca/shared';
import { ApiCallError } from '@/lib/api';
import { API_URL } from '@/lib/site';

/** Owner panel API client: path params, query string, bearer token and one refresh on expiry. */

export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens | null): void;
}

const KEY = 'boramarca.painel.sessao';

// shortcut: tokens live in localStorage (readable by any script on the origin); move to an
// httpOnly cookie behind a same-origin proxy if the panel ever loads third-party scripts.
export const browserStore: TokenStore = {
  get() {
    try {
      const parsed = AuthTokens.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  set(tokens) {
    try {
      if (tokens) localStorage.setItem(KEY, JSON.stringify(tokens));
      else localStorage.removeItem(KEY);
    } catch {
      // Private mode / blocked storage: the session just won't survive a reload.
    }
  },
};

type In<S> = S extends z.ZodType ? z.input<S> : never;
export interface CallOpts<C extends RouteContract> {
  params?: In<C['params']>;
  query?: In<C['query']>;
  body?: In<C['body']>;
}

export const SESSION_EXPIRED = 'SESSION_EXPIRED';

/** `/salon/team/:id` + { id } → `/salon/team/<id>`; query values that are undefined are dropped. */
export function buildUrl(
  base: string,
  path: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
): string {
  const p = path.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(String(params?.[k])));
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `${base}${API_PREFIX}${p}${s ? `?${s}` : ''}`;
}

async function toError(res: Response): Promise<ApiCallError> {
  const err = ApiError.safeParse(await res.json().catch(() => null));
  if (err.success)
    return new ApiCallError(res.status, err.data.code, err.data.message, err.data.details);
  return new ApiCallError(res.status, 'UNKNOWN', 'Algo deu errado. Tente de novo em instantes.');
}

export function createClient(
  store: TokenStore,
  {
    fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
    baseUrl = API_URL,
    onExpired = () => {},
    now = () => Date.now(),
  }: {
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    onExpired?: () => void;
    now?: () => number;
  } = {},
) {
  let refreshing: Promise<AuthTokens | null> | null = null;

  const send = async (url: string, init: RequestInit) => {
    try {
      return await fetchImpl(url, init);
    } catch {
      throw new ApiCallError(
        0,
        'NETWORK',
        'Sem conexão com o servidor. Tente de novo em instantes.',
      );
    }
  };

  /** One refresh at a time; null when the refresh token is gone or rejected. */
  function refresh(): Promise<AuthTokens | null> {
    refreshing ??= (async () => {
      const current = store.get();
      if (!current) return null;
      const res = await send(buildUrl(baseUrl, routes.auth.refresh.path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        // 5xx/network: keep the session, the next call retries.
        if (res.status >= 500) throw await toError(res);
        // Another tab may have rotated the refresh token first: use what it saved.
        const saved = store.get();
        return saved && saved.refreshToken !== current.refreshToken ? saved : null;
      }
      const tokens = AuthTokens.parse(await res.json());
      store.set(tokens);
      return tokens;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  const expired = () => {
    store.set(null);
    onExpired();
    return new ApiCallError(401, SESSION_EXPIRED, 'Sua sessão terminou. Entre de novo.');
  };

  /** Raw response (used for the CSV export). Throws ApiCallError on non-2xx. */
  async function raw<C extends RouteContract>(route: C, opts: CallOpts<C> = {}): Promise<Response> {
    const url = buildUrl(
      baseUrl,
      route.path,
      opts.params as Record<string, unknown>,
      opts.query as Record<string, unknown>,
    );
    const go = (token?: string) =>
      send(url, {
        method: route.method,
        headers: {
          ...(opts.body !== undefined && { 'content-type': 'application/json' }),
          ...(token && { authorization: `Bearer ${token}` }),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

    if (route.auth === 'public') {
      const res = await go();
      if (!res.ok) throw await toError(res);
      return res;
    }
    let tokens = store.get();
    if (!tokens) throw expired();
    // Renew a little before the access token expires, so a call never races the clock.
    if (Date.parse(tokens.accessTokenExpiresAt) - now() < 30_000) {
      tokens = await refresh();
      if (!tokens) throw expired();
    }
    let res = await go(tokens.accessToken);
    if (res.status === 401) {
      tokens = await refresh();
      if (!tokens) throw expired();
      res = await go(tokens.accessToken);
      if (res.status === 401) throw expired();
    }
    if (!res.ok) throw await toError(res);
    return res;
  }

  async function call<C extends RouteContract>(
    route: C,
    opts: CallOpts<C> = {},
  ): Promise<z.output<C['response']>> {
    const res = await raw(route, opts);
    return (await res.json()) as z.output<C['response']>;
  }

  return { call, raw, store };
}

export type PanelClient = ReturnType<typeof createClient>;
