import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ClientListResponse,
  ClientStats,
  RealtimeEvent,
  SlotsResponse,
  AgendaResponse,
} from '@boramarca/shared';
import { WS_UNAUTHORIZED } from './modules/realtime';
import { zonedToUtc } from './lib/time';
import { randomPhone, testApp } from './test/helpers';

let app: Awaited<ReturnType<typeof testApp>>;
let token: string;
const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
const at = (date: string, hhmm: string) =>
  zonedToUtc(date, hhmm, 'America/Sao_Paulo').toISOString();

beforeAll(async () => {
  app = await testApp();
  token = (
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: randomPhone(), code: '123456' },
    })
  ).json().accessToken;
  await call('PUT', '/v1/working-hours', {
    items: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start: '08:00',
      end: '18:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
    })),
  });
});
afterAll(() => app.close());

describe('cadastro, clientes e agenda via HTTP', () => {
  let serviceId: string;
  let clientId: string;

  it('services: create, reorder, validation', async () => {
    const a = (
      await call('POST', '/v1/services', { name: 'Sessão', durationMin: 50, priceCents: 15000 })
    ).json();
    const b = (
      await call('POST', '/v1/services', { name: 'Avaliação', durationMin: 60, priceCents: 18000 })
    ).json();
    expect([a.position, b.position]).toEqual([0, 1]);
    const r = await call('POST', '/v1/services/reorder', { ids: [b.id, a.id] });
    expect(r.json().items.map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
    expect((await call('POST', '/v1/services/reorder', { ids: [a.id] })).statusCode).toBe(400);
    const bad = await call('POST', '/v1/services', { name: '', durationMin: 1, priceCents: -1 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('VALIDATION');
    serviceId = a.id;
  });

  it('working hours: lunch must stay inside the day on update', async () => {
    const wh = (await call('GET', '/v1/working-hours')).json().items[0];
    const r = await call('PATCH', `/v1/working-hours/${wh.id}`, { lunchEnd: '19:00' });
    expect(r.statusCode).toBe(400);
    expect(
      (
        await call('POST', '/v1/working-hours', {
          weekday: 1,
          start: '08:00',
          end: '09:00',
          lunchStart: null,
          lunchEnd: null,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('clients: create, duplicate phone, search', async () => {
    const c = await call('POST', '/v1/clients', { name: 'Ana Paula', phone: '+5511988776655' });
    expect(c.statusCode).toBe(200);
    clientId = c.json().id;
    expect(
      (await call('POST', '/v1/clients', { name: 'Outra', phone: '+5511988776655' })).statusCode,
    ).toBe(409);
    await call('POST', '/v1/clients', { name: 'Beatriz Lima', phone: '+5511911112222' });
    const list = ClientListResponse.parse(
      (await call('GET', '/v1/clients?search=ana&sort=name')).json(),
    );
    expect(list.items.map((i) => i.name)).toEqual(['Ana Paula']);
    const page = ClientListResponse.parse(
      (await call('GET', '/v1/clients?limit=1&sort=name')).json(),
    );
    expect(page.nextCursor).toBe('1');
  });

  it('book, slots, day summary and client stats', async () => {
    const date = '2030-03-04';
    for (const [d, status] of [
      ['2026-02-04', 'done'],
      ['2026-02-25', 'done'],
    ] as const) {
      const v = (
        await call('POST', '/v1/appointments', {
          clientId,
          serviceIds: [serviceId],
          startsAt: at(d, '09:00'),
        })
      ).json();
      await call('POST', `/v1/appointments/${v.id}/${status}`);
    }
    const created = await call('POST', '/v1/appointments', {
      clientId,
      serviceIds: [serviceId],
      startsAt: at(date, '14:00'),
      notifyClient: false,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().events).toHaveLength(1);
    expect(created.json().client.name).toBe('Ana Paula');
    const conflict = await call('POST', '/v1/appointments', {
      clientId,
      serviceIds: [serviceId],
      startsAt: at(date, '14:20'),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: 'CONFLICT',
      message: 'Já tem atendimento nesse horário',
    });

    const slots = SlotsResponse.parse(
      (await call('GET', `/v1/slots?date=${date}&serviceIds=${serviceId}`)).json(),
    );
    expect(slots.durationMin).toBe(50);
    expect(slots.slots.map((s) => s.startsAt)).not.toContain(at(date, '14:00'));

    const day = AgendaResponse.parse((await call('GET', `/v1/agenda?date=${date}`)).json());
    expect(day.summary).toMatchObject({ appointmentsCount: 1, expectedRevenueCents: 15000 });

    const stats = ClientStats.parse((await call('GET', `/v1/clients/${clientId}/stats`)).json());
    expect(stats).toMatchObject({
      visitsCount: 2,
      averageTicketCents: 15000,
      averageIntervalDays: 21,
      lastVisitAt: at('2026-02-25', '09:00'),
      nextAppointmentAt: at(date, '14:00'),
    });
    const list = ClientListResponse.parse((await call('GET', '/v1/clients')).json());
    expect(list.items[0]).toMatchObject({
      name: 'Ana Paula',
      visitsCount: 2,
      lastServiceName: 'Sessão',
    });
  });
});

describe('realtime WebSocket', () => {
  it('refuses a bad token', async () => {
    const ws = await app.injectWS('/v1/realtime?token=nope');
    const code = await new Promise<number>((resolve) => ws.on('close', (c: number) => resolve(c)));
    expect(code).toBe(WS_UNAUTHORIZED);
  });

  it('pushes appointment.changed to the professional', async () => {
    const ws = await app.injectWS(`/v1/realtime?token=${token}`);
    const got = new Promise<RealtimeEvent>((resolve) =>
      ws.on('message', (raw: Buffer) => resolve(RealtimeEvent.parse(JSON.parse(String(raw))))),
    );
    await new Promise((r) => setTimeout(r, 300)); // let the Redis subscription settle
    const svc = (await call('GET', '/v1/services')).json().items[0];
    const c = (await call('POST', '/v1/clients', { name: 'Rafael', phone: randomPhone() })).json();
    await call('POST', '/v1/appointments', {
      clientId: c.id,
      serviceIds: [svc.id],
      startsAt: at('2030-03-05', '15:00'),
    });
    const e = await got;
    expect(e.type).toBe('appointment.changed');
    if (e.type === 'appointment.changed') expect(e.data.appointment.clientName).toBe('Rafael');
    ws.terminate();
  });
});

describe('OpenAPI', () => {
  it('is generated from the shared schemas', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(r.statusCode).toBe(200);
    const spec = r.json();
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/otp/verify',
        '/v1/appointments/{id}/cancel',
        '/v1/clients/{id}/stats',
      ]),
    );
    expect((await app.inject({ method: 'GET', url: '/v1/docs' })).statusCode).toBeLessThan(400);
  });
});
