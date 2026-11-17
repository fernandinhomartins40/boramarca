import { describe, expect, it, vi } from 'vitest';
import { routes, type AuthTokens } from '@boramarca/shared';
import { answerDecision, movedStart, rescheduleAppointment } from './actions';
import { buildUrl, createClient, SESSION_EXPIRED, type TokenStore } from './client';
import {
  addDays,
  dayLabel,
  formatPhone,
  initials,
  minutesIn,
  money,
  monthShort,
  monthsBack,
  timeIn,
  todayIn,
  weekDates,
  weekSummary,
} from './format';

const NOW = Date.parse('2026-11-10T17:00:00Z');
const tokens = (access: string, expiresInMs = 600_000): AuthTokens => ({
  accessToken: access,
  refreshToken: `r-${access}`,
  accessTokenExpiresAt: new Date(NOW + expiresInMs).toISOString(),
  refreshTokenExpiresAt: new Date(NOW + 86_400_000).toISOString(),
});
const memStore = (t: AuthTokens | null): TokenStore & { value: AuthTokens | null } => {
  const s = {
    value: t,
    get: () => s.value,
    set: (v: AuthTokens | null) => {
      s.value = v;
    },
  };
  return s;
};
const plan = {
  plan: 'salao',
  activeProfessionals: 4,
  usage: { messagesThisMonth: 1, decisionsThisMonth: 2, appointmentsThisMonth: 3 },
  kitInterestSent: false,
};

describe('buildUrl', () => {
  it('fills path params and drops empty query values', () => {
    expect(
      buildUrl(
        'http://api',
        '/salon/team/:id',
        { id: 'a b' },
        { search: 'ana', cursor: undefined, x: '' },
      ),
    ).toBe('http://api/v1/salon/team/a%20b?search=ana');
  });
});

describe('createClient', () => {
  it('sends the bearer token and the query string', async () => {
    const fetchMock = vi.fn(async () => Response.json(plan));
    const api = createClient(memStore(tokens('a1')), {
      fetchImpl: fetchMock,
      baseUrl: 'http://api',
      now: () => NOW,
    });
    await api.call(routes.salon.day, { query: { date: '2026-11-10' } });
    expect(fetchMock).toHaveBeenCalledWith('http://api/v1/salon/day?date=2026-11-10', {
      method: 'GET',
      headers: { authorization: 'Bearer a1' },
      body: undefined,
    });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const store = memStore(tokens('old'));
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) return Response.json(tokens('new'));
      const auth = (init?.headers as Record<string, string>).authorization;
      return auth === 'Bearer new'
        ? Response.json(plan)
        : Response.json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }, { status: 401 });
    });
    const api = createClient(store, { fetchImpl: fetchMock, now: () => NOW });
    await expect(api.call(routes.salon.plan)).resolves.toEqual(plan);
    expect(store.value?.accessToken).toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('renews ahead of time when the access token is about to expire', async () => {
    const store = memStore(tokens('old', 10_000));
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/auth/refresh') ? Response.json(tokens('new')) : Response.json(plan),
    );
    const api = createClient(store, { fetchImpl: fetchMock, now: () => NOW });
    await api.call(routes.salon.plan);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/auth\/refresh$/);
    expect(store.value?.accessToken).toBe('new');
  });

  it('clears the session and reports SESSION_EXPIRED when the refresh is rejected', async () => {
    const store = memStore(tokens('old'));
    const onExpired = vi.fn();
    const fetchMock = vi.fn(async () =>
      Response.json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }, { status: 401 }),
    );
    const api = createClient(store, { fetchImpl: fetchMock, onExpired, now: () => NOW });
    await expect(api.call(routes.salon.plan)).rejects.toMatchObject({ code: SESSION_EXPIRED });
    expect(store.value).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('a rejected refresh uses the tokens another tab saved meanwhile', async () => {
    const store = memStore(tokens('old'));
    const onExpired = vi.fn();
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        store.value = tokens('other-tab'); // the other tab won the rotation
        return Response.json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }, { status: 401 });
      }
      const auth = new Headers(init?.headers).get('authorization');
      return auth === 'Bearer other-tab'
        ? Response.json(plan)
        : Response.json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }, { status: 401 });
    });
    const api = createClient(store, { fetchImpl: fetchMock, onExpired, now: () => NOW });
    await expect(api.call(routes.salon.plan)).resolves.toEqual(plan);
    expect(store.value?.accessToken).toBe('other-tab');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('surfaces the API error message (e.g. 403 for a non-owner)', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { statusCode: 403, code: 'FORBIDDEN', message: 'Só o dono do espaço' },
        { status: 403 },
      ),
    );
    const api = createClient(memStore(tokens('a')), { fetchImpl: fetchMock, now: () => NOW });
    await expect(api.call(routes.salon.plan)).rejects.toMatchObject({
      status: 403,
      message: 'Só o dono do espaço',
    });
  });

  it('calls public routes without a session', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ ok: true, expiresInSeconds: 600, retryAfterSeconds: 60 }),
    );
    const api = createClient(memStore(null), { fetchImpl: fetchMock, baseUrl: 'http://api' });
    await api.call(routes.auth.otpRequest, { body: { phone: '+5511900000001' } });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api/v1/auth/otp/request');
  });
});

describe('format', () => {
  const tz = 'America/Sao_Paulo';
  it('uses the salon timezone for dates and times', () => {
    expect(todayIn(tz, new Date('2026-11-11T02:30:00Z'))).toBe('2026-11-10');
    expect(timeIn('2026-11-10T12:00:00Z', tz)).toBe('09:00');
    expect(minutesIn('2026-11-10T12:30:00Z', tz)).toBe(9 * 60 + 30);
  });
  it('builds the Monday-to-Sunday week', () => {
    const w = weekDates('2026-11-10'); // a Tuesday
    expect(w[0]).toBe('2026-11-09');
    expect(w[6]).toBe('2026-11-15');
    expect(weekDates('2026-11-15')[0]).toBe('2026-11-09'); // Sunday stays in the same week
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('labels days and months in pt-BR', () => {
    expect(dayLabel('2026-11-10')).toBe('Terça, 10 nov');
    expect(monthsBack('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(monthShort('2026-11')).toBe('Nov/26');
  });
  it('formats money, phones and initials', () => {
    expect(money(138000)).toBe('R$ 1.380,00');
    expect(formatPhone('+5511988776655')).toBe('(11) 98877-6655');
    expect(formatPhone('+351912345678')).toBe('+351912345678');
    expect(initials('Marina Costa Silva')).toBe('MC');
  });
  it('summarizes the working week', () => {
    const h = (weekday: number, start = '09:00', end = '19:00') => ({ weekday, start, end });
    expect(weekSummary([1, 2, 3, 4, 5].map((d) => h(d)))).toBe('Seg – Sex · 09:00 – 19:00');
    expect(weekSummary([2, 3, 4, 5, 6].map((d) => h(d, '08:00', '18:00')))).toBe(
      'Ter – Sáb · 08:00 – 18:00',
    );
    expect(weekSummary([1, 3].map((d) => h(d)))).toBe('Seg, Qua · 09:00 – 19:00');
    expect(weekSummary([])).toBe('Sem horário definido');
  });
});

describe('panel writes', () => {
  const ok = (body: unknown) =>
    vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => Response.json(body));

  it('answers any decision of the salon through the owner route', async () => {
    const fetchMock = ok({ spokenConfirmation: 'Feito' });
    const api = createClient(memStore(tokens('a')), {
      fetchImpl: fetchMock,
      baseUrl: 'http://api',
      now: () => NOW,
    });
    await answerDecision(api, 'd1', { optionId: 'sim' });
    await answerDecision(api, 'd2', { text: 'pode, daqui 15 minutos' });
    expect(fetchMock.mock.calls.map(([u, i]) => [u, i?.method, i?.body])).toEqual([
      [
        'http://api/v1/salon/decisions/d1/answer',
        'POST',
        JSON.stringify({ optionId: 'sim', via: 'app' }),
      ],
      [
        'http://api/v1/salon/decisions/d2/answer',
        'POST',
        JSON.stringify({ text: 'pode, daqui 15 minutos', via: 'app' }),
      ],
    ]);
  });

  it('reschedules through the owner route with the moved start', async () => {
    const fetchMock = ok({});
    const api = createClient(memStore(tokens('a')), {
      fetchImpl: fetchMock,
      baseUrl: 'http://api',
      now: () => NOW,
    });
    // 09:00 → 10:30 in São Paulo (UTC-3).
    const startsAt = movedStart('2026-11-10T12:00:00.000Z', 9 * 60, 10 * 60 + 30);
    expect(startsAt).toBe('2026-11-10T13:30:00.000Z');
    await rescheduleAppointment(api, 'ap 1', startsAt, false);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api/v1/salon/appointments/ap%201/reschedule');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ startsAt, notifyClient: false });
  });

  it('keeps the API conflict code for the dialog', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { statusCode: 409, code: 'CONFLICT', message: 'Esse horário acabou de ser ocupado' },
        { status: 409 },
      ),
    );
    const api = createClient(memStore(tokens('a')), { fetchImpl: fetchMock, now: () => NOW });
    await expect(
      rescheduleAppointment(api, 'x', '2026-11-10T13:30:00.000Z', true),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Esse horário acabou de ser ocupado',
    });
  });
});
