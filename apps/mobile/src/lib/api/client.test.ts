import { routes, type AuthTokens } from '@boramarca/shared';
import { DataError } from '@/data/errors';
import { createApiData } from '@/data/api';
import { buildUrl, createApiClient, type TokenStore } from './client';

const BASE = 'http://api.test';
const later = new Date(Date.now() + 3600_000).toISOString();
const tokens = (access: string): AuthTokens => ({
  accessToken: access,
  refreshToken: `refresh-${access}`,
  accessTokenExpiresAt: later,
  refreshTokenExpiresAt: later,
});

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** Fake server: `handle` answers [status, body]; a string body is sent as is (not JSON). */
function fakeServer(handle: (c: Call) => [number, unknown] | 'offline') {
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit) => {
    const c: Call = {
      method: String(init.method),
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
    };
    calls.push(c);
    await new Promise((r) => setTimeout(r, 5));
    const out = handle(c);
    if (out === 'offline') throw new TypeError('Network request failed');
    const [status, body] = out;
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text } as Response;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function memoryStore(initial: AuthTokens | null) {
  const store = {
    current: initial,
    expired: jest.fn(),
    get: () => store.current,
    set: (t: AuthTokens) => (store.current = t),
  };
  return store as TokenStore & { current: AuthTokens | null; expired: jest.Mock };
}

describe('api client', () => {
  it('builds urls from the contract', () => {
    expect(
      buildUrl(`${BASE}/`, '/appointments/:id/cancel', { id: 'a b' }, { x: 1, y: undefined }),
    ).toBe(`${BASE}/v1/appointments/a%20b/cancel?x=1`);
  });

  it('refreshes once for simultaneous 401s and retries each call', async () => {
    let refreshes = 0;
    const server = fakeServer((c) => {
      if (c.url.endsWith('/v1/auth/refresh')) {
        refreshes++;
        expect(JSON.parse(c.body!)).toEqual({ refreshToken: 'refresh-old' });
        return [200, tokens('new')];
      }
      if (c.headers.Authorization !== 'Bearer new')
        return [401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Sessão expirada.' }];
      return [200, { items: [] }];
    });
    const store = memoryStore(tokens('old'));
    const api = createApiClient({ baseUrl: BASE, tokens: store, fetch: server.fetch });
    const results = await Promise.all([
      api.call(routes.decisions.list, { query: { status: 'pending' } }),
      api.call(routes.decisions.list, { query: { status: 'resolved' } }),
      api.call(routes.decisions.list),
    ]);
    expect(results).toEqual([{ items: [] }, { items: [] }, { items: [] }]);
    expect(refreshes).toBe(1);
    expect(store.current?.accessToken).toBe('new');
    expect(store.expired).not.toHaveBeenCalled();
    // a call after the refresh goes straight with the new token
    await api.call(routes.decisions.list);
    expect(refreshes).toBe(1);
  });

  it('ends the session when the refresh is rejected', async () => {
    const server = fakeServer(() => [
      401,
      { statusCode: 401, code: 'UNAUTHORIZED', message: 'Sessão expirada. Entre de novo.' },
    ]);
    const store = memoryStore(tokens('old'));
    const api = createApiClient({ baseUrl: BASE, tokens: store, fetch: server.fetch });
    await expect(api.call(routes.auth.me)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(store.expired).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails for lack of network', async () => {
    const server = fakeServer((c) => (c.url.endsWith('/refresh') ? 'offline' : [401, {}]));
    const store = memoryStore(tokens('old'));
    const api = createApiClient({ baseUrl: BASE, tokens: store, fetch: server.fetch });
    await expect(api.call(routes.auth.me)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(store.expired).not.toHaveBeenCalled();
  });

  it('turns API errors, bad gateways and network failures into DataError', async () => {
    let mode: 'conflict' | 'gateway' | 'offline' = 'conflict';
    const server = fakeServer(() => {
      if (mode === 'offline') return 'offline';
      if (mode === 'gateway') return [502, '<html>Bad Gateway</html>'];
      return [409, { statusCode: 409, code: 'CONFLICT', message: 'Esse horário não está livre' }];
    });
    const data = createApiData(
      createApiClient({ baseUrl: BASE, tokens: memoryStore(tokens('t')), fetch: server.fetch }),
    );
    const id = '00000000-0000-4000-8000-000000000001';
    const err = await data.agenda
      .reschedule(id, { startsAt: later, notifyClient: false })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err).toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Esse horário não está livre',
    });
    expect(server.calls[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/v1/appointments/${id}/reschedule`,
    });
    expect(server.calls[0]!.headers['Content-Type']).toBe('application/json');

    mode = 'gateway';
    await expect(data.agenda.confirm(id)).rejects.toMatchObject({
      statusCode: 502,
      code: 'HTTP_502',
    });
    // no body: no JSON content type (Fastify rejects an empty JSON body)
    expect(server.calls[1]!.headers['Content-Type']).toBeUndefined();

    mode = 'offline';
    await expect(data.voice.summary('open')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('validates responses with the shared schemas', async () => {
    const server = fakeServer(() => [200, { items: [{ id: 'not-a-decision' }] }]);
    const data = createApiData(
      createApiClient({ baseUrl: BASE, tokens: memoryStore(tokens('t')), fetch: server.fetch }),
    );
    await expect(data.decisions.list('pending')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('sends the contract query (slots as a comma list, includeInactive only when on)', async () => {
    const server = fakeServer(() => [200, { items: [] }]);
    const data = createApiData(
      createApiClient({ baseUrl: BASE, tokens: memoryStore(tokens('t')), fetch: server.fetch }),
    );
    await data.profile.listServices();
    await data.profile.listServices(true);
    expect(server.calls.map((c) => c.url)).toEqual([
      `${BASE}/v1/services`,
      `${BASE}/v1/services?includeInactive=true`,
    ]);
  });

  it('removes the registered device on sign out', async () => {
    const device = {
      id: '00000000-0000-4000-8000-0000000000d1',
      createdAt: later,
      updatedAt: later,
      professionalId: '00000000-0000-4000-8000-0000000000aa',
      pushToken: 'ExponentPushToken[x]',
      platform: 'android',
    };
    const server = fakeServer((c) => (c.method === 'POST' ? [200, device] : [200, { ok: true }]));
    const data = createApiData(
      createApiClient({ baseUrl: BASE, tokens: memoryStore(tokens('t')), fetch: server.fetch }),
    );
    await data.auth.signOut(); // nothing registered: only the logout
    await data.devices.register({ pushToken: device.pushToken, platform: 'android' });
    await data.auth.signOut();
    expect(server.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/v1/auth/logout`,
      `POST ${BASE}/v1/devices`,
      `DELETE ${BASE}/v1/devices/${device.id}`,
      `POST ${BASE}/v1/auth/logout`,
    ]);
    expect(JSON.parse(server.calls[0]!.body!)).toEqual({ refreshToken: 'refresh-t' });
  });

  it('signs out even when the logout call fails', async () => {
    const server = fakeServer(() => 'offline');
    const data = createApiData(
      createApiClient({ baseUrl: BASE, tokens: memoryStore(tokens('t')), fetch: server.fetch }),
    );
    await expect(data.auth.signOut()).resolves.toBeUndefined();
  });

  it('shows a clear message for the 409s the app can hit', () => {
    const e = new DataError({ statusCode: 409, code: 'NOT_STARTED', message: 'x' });
    expect(e.message).toMatch(/ainda não começou/);
    expect(new DataError({ statusCode: 409, code: 'OTHER', message: 'y' }).message).toBe('y');
  });

  it('keeps the rotated refresh token returned by /auth/refresh', async () => {
    const server = fakeServer((c) => {
      if (c.url.endsWith('/v1/auth/refresh')) return [200, tokens('new')];
      return c.headers.Authorization === 'Bearer new' ? [200, { items: [] }] : [401, {}];
    });
    const store = memoryStore(tokens('old'));
    const api = createApiClient({ baseUrl: BASE, tokens: store, fetch: server.fetch });
    await api.call(routes.decisions.list);
    expect(store.current?.refreshToken).toBe('refresh-new');
    expect(api.refreshToken()).toBe('refresh-new');
  });
});
