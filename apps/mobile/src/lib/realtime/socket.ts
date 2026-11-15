import { API_PREFIX, RealtimeEvent, type RealtimeEventType } from '@boramarca/shared';

/**
 * `WS /v1/realtime?token=<accessToken>` (packages/shared/src/realtime.ts; apps/api realtime module).
 * Server -> client only. Reconnects with backoff (1 s, 2 s, 4 s… up to 30 s); close code 4401
 * (token rejected) refreshes the token first. Invalid frames are ignored.
 */

/** Close code of apps/api when the token is missing or invalid. */
export const WS_UNAUTHORIZED = 4401;
// shared has no constant for the WS path (only HTTP routes): realtime.ts documents `WS /realtime`
const REALTIME_PATH = '/realtime';

/** The part of the WebSocket API used here (global WebSocket in React Native and Node 22+). */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(code?: number): void;
}

export interface RealtimeOptions {
  baseUrl: string;
  accessToken: () => string | null;
  /** New access token, or null when the session is over (then the socket stops). */
  refresh: () => Promise<string | null>;
  createSocket?: (url: string) => SocketLike;
  /** Called after every successful (re)connection: screens reload what they may have missed. */
  onOpen?: () => void;
  maxDelayMs?: number;
}

type Handler = (event: RealtimeEvent) => void;

export function realtimeUrl(baseUrl: string, token: string) {
  const ws = baseUrl.replace(/\/+$/, '').replace(/^http/, 'ws');
  return `${ws}${API_PREFIX}${REALTIME_PATH}?token=${encodeURIComponent(token)}`;
}

export function createRealtime(opts: RealtimeOptions) {
  const createSocket =
    opts.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const maxDelay = opts.maxDelayMs ?? 30_000;
  const handlers = new Map<Handler, RealtimeEventType[] | null>();
  let socket: SocketLike | null = null;
  let running = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emit(raw: unknown) {
    let json: unknown;
    try {
      json = JSON.parse(String(raw));
    } catch {
      return;
    }
    const parsed = RealtimeEvent.safeParse(json);
    if (!parsed.success) return;
    handlers.forEach((types, h) => {
      if (types && !types.includes(parsed.data.type)) return;
      try {
        h(parsed.data);
      } catch {
        // one broken subscriber must not stop the others
      }
    });
  }

  function schedule() {
    if (!running || timer) return;
    const delay = Math.min(1000 * 2 ** attempt, maxDelay);
    attempt++;
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (!running || socket) return;
    const token = opts.accessToken();
    if (!opts.baseUrl || !token) return;
    const s = createSocket(realtimeUrl(opts.baseUrl, token));
    socket = s;
    s.onopen = () => {
      attempt = 0;
      opts.onOpen?.();
    };
    s.onmessage = (ev) => emit(ev.data);
    s.onerror = () => undefined; // onclose follows
    s.onclose = (ev) => {
      if (socket !== s) return;
      socket = null;
      if (!running) return;
      if (ev.code !== WS_UNAUTHORIZED) return schedule();
      opts
        .refresh()
        .then((fresh) => (fresh ? schedule() : stop()))
        .catch(() => schedule());
    };
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    const s = socket;
    socket = null;
    s?.close(1000);
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      connect();
    },
    stop,
    /** Back to the foreground: reconnect now instead of waiting for the backoff. */
    wake() {
      if (!running || socket) return;
      if (timer) clearTimeout(timer);
      timer = null;
      attempt = 0;
      connect();
    },
    /** `types` null = every event. Returns the unsubscribe function. */
    subscribe(types: RealtimeEventType[] | null, handler: Handler) {
      handlers.set(handler, types);
      return () => void handlers.delete(handler);
    },
    get connected() {
      return !!socket;
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
