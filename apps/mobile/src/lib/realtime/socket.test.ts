import { createRealtime, realtimeUrl, WS_UNAUTHORIZED, type SocketLike } from './socket';

class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.({});
  }
  drop(code = 1006) {
    this.onclose?.({ code });
  }
  send(event: unknown) {
    this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
  }
}

const at = '2026-11-15T12:00:00.000Z';
const status = {
  type: 'whatsapp.status',
  at,
  data: {
    status: 'disconnected',
    phone: null,
    profileName: null,
    profilePictureUrl: null,
    errorMessage: null,
    updatedAt: at,
  },
};

function setup(refresh = jest.fn(async (): Promise<string | null> => 'fresh')) {
  const sockets: FakeSocket[] = [];
  let token = 'tok';
  const onOpen = jest.fn();
  const rt = createRealtime({
    baseUrl: 'https://api.test',
    accessToken: () => token,
    refresh: async () => {
      const t = await refresh();
      if (t) token = t;
      return t;
    },
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onOpen,
  });
  return { rt, sockets, onOpen, refresh };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('realtime socket', () => {
  it('builds the ws url with the token', () => {
    expect(realtimeUrl('http://10.0.2.2:3333/', 'a b')).toBe(
      'ws://10.0.2.2:3333/v1/realtime?token=a%20b',
    );
  });

  it('delivers valid events to subscribers and ignores bad frames', () => {
    const { rt, sockets } = setup();
    const all = jest.fn();
    const decisions = jest.fn();
    rt.subscribe(null, all);
    rt.subscribe(['decision.created'], decisions);
    rt.start();
    sockets[0]!.open();
    sockets[0]!.send(status);
    sockets[0]!.send('not json');
    sockets[0]!.send({ type: 'whatsapp.status', at, data: {} });
    expect(all).toHaveBeenCalledTimes(1);
    expect(all.mock.calls[0][0].data.status).toBe('disconnected');
    expect(decisions).not.toHaveBeenCalled();
  });

  it('reconnects with backoff after a drop and resets it after a good connection', () => {
    const { rt, sockets, onOpen } = setup();
    rt.start();
    sockets[0]!.drop();
    jest.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.drop();
    jest.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    sockets[2]!.open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    sockets[2]!.drop();
    jest.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(4);
  });

  it('refreshes the token on 4401 and reconnects with the new one', async () => {
    const { rt, sockets, refresh } = setup();
    rt.start();
    sockets[0]!.drop(WS_UNAUTHORIZED);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sockets[1]!.url).toContain('token=fresh');
  });

  it('stops when the session is over or on stop()', async () => {
    const { rt, sockets } = setup(jest.fn(async () => null));
    rt.start();
    sockets[0]!.drop(WS_UNAUTHORIZED);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    rt.start();
    expect(sockets).toHaveLength(2);
    rt.stop();
    expect(sockets[1]!.closed).toBe(true);
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });
});
