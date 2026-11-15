import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zonedToUtc } from './lib/time';
import { randomPhone, testApp } from './test/helpers';

/** Plan section 3: a professional never reads nor changes another professional's data. */
let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());

async function login() {
  const r = await app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    payload: { phone: randomPhone(), code: '123456' },
  });
  const token = r.json().accessToken as string;
  return (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

describe('isolation between professionals', () => {
  let a: Awaited<ReturnType<typeof login>>;
  let b: Awaited<ReturnType<typeof login>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    a = await login();
    b = await login();
    ids.service = (
      await a('POST', '/v1/services', { name: 'Sessão', durationMin: 50, priceCents: 15000 })
    ).json().id;
    const wh = await a('PUT', '/v1/working-hours', {
      items: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        start: '08:00',
        end: '18:00',
        lunchStart: null,
        lunchEnd: null,
      })),
    });
    ids.workingHours = wh.json().items[0].id;
    ids.timeOff = (
      await a('POST', '/v1/time-off', {
        startsAt: '2030-05-01T03:00:00Z',
        endsAt: '2030-05-02T03:00:00Z',
      })
    ).json().id;
    ids.client = (
      await a('POST', '/v1/clients', { name: 'Ana Paula', phone: '+5511988776655' })
    ).json().id;
    const appt = await a('POST', '/v1/appointments', {
      clientId: ids.client,
      serviceIds: [ids.service],
      startsAt: zonedToUtc('2030-03-04', '14:00', 'America/Sao_Paulo').toISOString(),
    });
    expect(appt.statusCode).toBe(200);
    ids.appointment = appt.json().id;
  });

  it('owner sees its own data', async () => {
    expect((await a('GET', `/v1/clients/${ids.client}`)).statusCode).toBe(200);
    expect((await a('GET', `/v1/appointments/${ids.appointment}`)).statusCode).toBe(200);
    expect((await a('GET', '/v1/agenda?date=2030-03-04')).json().appointments).toHaveLength(1);
  });

  it('lists of the other professional are empty', async () => {
    expect((await b('GET', '/v1/clients')).json().items).toEqual([]);
    expect((await b('GET', '/v1/services')).json().items).toEqual([]);
    expect((await b('GET', '/v1/working-hours')).json().items).toEqual([]);
    expect((await b('GET', '/v1/time-off')).json().items).toEqual([]);
    expect((await b('GET', '/v1/agenda?date=2030-03-04')).json().appointments).toEqual([]);
  });

  it.each([
    ['GET', 'clients/:client'],
    ['PATCH', 'clients/:client', { name: 'X' }],
    ['DELETE', 'clients/:client'],
    ['GET', 'clients/:client/stats'],
    ['GET', 'services/:service'],
    ['PATCH', 'services/:service', { name: 'X' }],
    ['DELETE', 'services/:service'],
    ['GET', 'working-hours/:workingHours'],
    ['PATCH', 'working-hours/:workingHours', { end: '19:00' }],
    ['DELETE', 'working-hours/:workingHours'],
    ['GET', 'time-off/:timeOff'],
    ['PATCH', 'time-off/:timeOff', { reason: 'X' }],
    ['DELETE', 'time-off/:timeOff'],
    ['GET', 'appointments/:appointment'],
    ['POST', 'appointments/:appointment/cancel', { reason: 'X' }],
    ['POST', 'appointments/:appointment/reschedule', { startsAt: '2030-03-04T18:00:00Z' }],
    ['POST', 'appointments/:appointment/arrive'],
    ['POST', 'appointments/:appointment/done'],
    ['POST', 'appointments/:appointment/no-show'],
  ] as const)('%s %s of another professional is 404', async (method, path, payload?: object) => {
    const url = '/v1/' + path.replace(/:(\w+)/, (_, k: string) => ids[k]!);
    const r = await b(method, url, payload);
    expect(r.statusCode).toBe(404);
  });

  it("cannot book with another professional's client or service", async () => {
    const startsAt = '2030-03-04T15:00:00Z';
    const ownService = (
      await b('POST', '/v1/services', { name: 'S', durationMin: 30, priceCents: 0 })
    ).json().id;
    expect(
      (
        await b('POST', '/v1/appointments', {
          clientId: ids.client,
          serviceIds: [ownService],
          startsAt,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await b('POST', '/v1/appointments', {
          newClient: { name: 'Y', phone: '+5511911112222' },
          serviceIds: [ids.service],
          startsAt,
        })
      ).statusCode,
    ).toBe(400);
    expect((await b('GET', `/v1/slots?date=2030-03-04&serviceIds=${ids.service}`)).statusCode).toBe(
      400,
    );
  });

  it("nothing of A changed after B's attempts", async () => {
    const appt = (await a('GET', `/v1/appointments/${ids.appointment}`)).json();
    expect(appt.status).toBe('scheduled');
    expect((await a('GET', `/v1/clients/${ids.client}`)).json().name).toBe('Ana Paula');
    expect((await a('GET', '/v1/services')).json().items).toHaveLength(1);
    expect((await a('GET', '/v1/working-hours')).json().items).toHaveLength(7);
  });
});
