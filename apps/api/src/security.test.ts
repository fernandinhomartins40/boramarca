// Fixes of docs/revisao-seguranca.md that live in the messaging flow (M5, M6, M7, M8, M11, B3, B8,
// B9), end to end against the Docker Postgres and Redis with the FakeGateway and a FakeLlm.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm, toolReply } from '@boramarca/ia';
import { buildApp } from './app';
import {
  appointments,
  auditLog,
  clients,
  conversations,
  professionals,
  waitlistOffers,
} from './db/schema';
import { ensureReviewAccount } from './db/seed-review';
import { aiActive, loadPro } from './lib/core';
import { zonedToUtc } from './lib/time';
import { FakePush } from './modules/devices/push';
import { WS_UNAUTHORIZED } from './modules/realtime';
import { hadPastAppointment } from './modules/whatsapp/send';
import { connectedPro, waitFor, WEBHOOK_SECRET } from './test/connected';
import { randomPhone, testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 180_000 });

const DATE = '2030-04-06';
const at = (hhmm: string) => zonedToUtc(DATE, hhmm, 'America/Sao_Paulo').toISOString();
let now = new Date(at('09:00'));
const gw = testGateway();
const llm = new FakeLlm();
const push = new FakePush();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(
    testConfig({
      WHATSAPP_WEBHOOK_SECRET: WEBHOOK_SECRET,
      WA_GUARD_TYPING_MIN_SECONDS: '1',
      WA_GUARD_TYPING_MAX_SECONDS: '1',
    }),
    { gateway: gw, llm, push, now: () => now },
  );
});
afterAll(() => app.close());

const auditOf = async (professionalId: string, action: string) =>
  app.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.professionalId, professionalId), eq(auditLog.action, action)));

describe('M5: AI paused', () => {
  it('a "sim" to a waitlist offer books nothing and waits for the professional; no automatic offers', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const bia = await t.addClient('Bia Lima');
    await t.wrote(bia.id);
    const entry = (
      await t.call('POST', '/v1/waitlist', {
        clientId: bia.id,
        preference: { weekdays: [], periods: [] },
        clientAsked: true,
      })
    ).json().id as string;
    const offer = await t.call('POST', `/v1/waitlist/${entry}/offer`, {
      slotStartsAt: at('15:00'),
    });
    expect(offer.statusCode, offer.body).toBe(200);
    await waitFor(() => t.sentTo(bia.phone)[0]);

    expect((await t.call('POST', '/v1/ai/pause', { until: null })).statusCode).toBe(200);
    await t.receive(bia.phone, 'Sim, quero!', 'Bia');
    await waitFor(async () =>
      (await auditOf(t.professionalId, 'ai.skipped')).find((a) => a.payload.reason === 'ai_paused'),
    );
    expect(
      await app.db.select().from(appointments).where(eq(appointments.clientId, bia.id)),
    ).toHaveLength(0);
    const [o] = await app.db.select().from(waitlistOffers).where(eq(waitlistOffers.entryId, entry));
    expect(o!.status).toBe('sent');
    expect(t.sentTo(bia.phone)).toHaveLength(1); // only the offer

    // A slot freed while paused is not offered automatically either.
    expect(
      await app.messaging.waitlist.offerNext({
        professionalId: t.professionalId,
        startsAt: at('16:00'),
        endsAt: at('16:50'),
        serviceIds: [t.serviceId],
      }),
    ).toBeNull();
  });
});

describe('M6: switching the AI off', () => {
  it('outlasts the end of an earlier timed pause', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    expect((await t.call('POST', '/v1/ai/pause', { until: at('18:00') })).statusCode).toBe(200);
    const off = await t.call('PATCH', '/v1/ai/settings', { aiEnabled: false });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json()).toMatchObject({ aiEnabled: false, aiPausedUntil: null });
    const { p } = await loadPro(app.db, t.professionalId);
    expect(aiActive(p, new Date(at('18:01')))).toBe(false);
  });
});

describe('M7: perguntar_ao_profissional built by the model', () => {
  it('an option acting on another client is refused and becomes an "Eu respondo" question', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const carla = await t.addClient('Carla Dias');
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const carlaAppt = await app.agenda.book(ctx, {
      clientId: carla.id,
      serviceIds: [t.serviceId],
      startsAt: at('11:00'),
    });
    llm.on(
      /injecao-m7/,
      toolReply({
        name: 'perguntar_ao_profissional',
        arguments: {
          type: 'duvida',
          question: 'Bia confirma presença?',
          options: [
            {
              id: 'sim',
              label: 'Sim',
              action: { name: 'cancelar', arguments: { appointmentId: carlaAppt.id } },
            },
            { id: 'nao', label: 'Não', action: null },
          ],
          proposedAction: null,
        },
      }),
      1,
    );
    await t.receive(randomPhone(), 'injecao-m7', 'Bia');
    const items = await waitFor(async () => {
      const r = (await t.call('GET', '/v1/decisions?status=pending')).json().items as {
        question: string;
        options: { id: string; action: unknown }[];
      }[];
      return r.length ? r : null;
    });
    expect(items[0]!.question).not.toContain('confirma presença');
    expect(items[0]!.options).toEqual([expect.objectContaining({ id: 'assumir', action: null })]);
    const [rej] = await auditOf(t.professionalId, 'ai.tool_rejected');
    expect(rej!.payload.reason).toBe('other_client');
    const [still] = await app.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, carlaAppt.id));
    expect(still!.status).toBe('scheduled');
  });
});

describe('M8: cold contacts', () => {
  it('no "done"/arrival before the start, back-dated visits do not count, manual waitlist needs contact', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const cold = await t.addClient('Desconhecido');
    const v = (
      await t.call('POST', '/v1/appointments', {
        clientId: cold.id,
        serviceIds: [t.serviceId],
        startsAt: at('10:00'),
      })
    ).json();
    for (const step of ['done', 'arrive']) {
      const r = await t.call('POST', `/v1/appointments/${v.id}/${step}`);
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().code).toBe('NOT_STARTED');
    }
    // A "done" recorded after the fact (booked after its own start) is not a past visit.
    await app.db.insert(appointments).values({
      professionalId: t.professionalId,
      clientId: cold.id,
      startsAt: new Date('2025-01-10T13:00:00Z'),
      endsAt: new Date('2025-01-10T13:50:00Z'),
      status: 'done',
      origin: 'professional',
      priceCents: 15000,
    });
    const [f] = await app.db
      .select({ v: hadPastAppointment(cold.id, now) })
      .from(clients)
      .where(eq(clients.id, cold.id));
    expect(f!.v).toBe(false);

    const add = await t.call('POST', '/v1/waitlist', {
      clientId: cold.id,
      preference: { weekdays: [], periods: [] },
      clientAsked: true,
    });
    expect(add.statusCode, add.body).toBe(409);
    expect(add.json().code).toBe('CLIENT_NEVER_WROTE');
  });
});

describe('B9 and B3: deadlines and notifications', () => {
  it('a timeout or expiry does not message a client whose conversation the professional took', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const c = await t.addClient('Davi Rocha');
    const [conv] = await app.db
      .insert(conversations)
      .values({ professionalId: t.professionalId, clientId: c.id, handler: 'human' })
      .returning();
    const pro = await loadPro(app.db, t.professionalId);
    const mk = () =>
      app.messaging.decisions.create({
        pro,
        conversationId: conv!.id,
        clientId: c.id,
        type: 'duvida',
        question: 'Davi pergunta se pode levar o filho. Pode?',
        options: [{ id: 'assumir', label: 'Eu respondo', action: null }],
        proposedAction: null,
      });
    const d1 = await mk();
    await app.messaging.decisions.handleTimeout(d1.id);
    const d2 = await mk();
    await app.messaging.decisions.handleExpire(d2.id);
    await new Promise((r) => setTimeout(r, 3000)); // outbound worker would have sent by now
    expect(t.sentTo(c.phone)).toHaveLength(0);
    expect(await auditOf(t.professionalId, 'decision.timeout')).toHaveLength(1);
  });

  it('a health account notification does not carry the message text', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    await app.db
      .update(professionals)
      .set({ professions: ['psicologo'] })
      .where(eq(professionals.id, t.professionalId));
    await t.call('POST', '/v1/devices', {
      pushToken: `ExponentPushToken[${t.professionalId}]`,
      platform: 'android',
    });
    await t.call('POST', '/v1/ai/pause', { until: null });
    await t.receive(randomPhone(), 'estou com uma dor forte no peito', 'Eva');
    const sent = await waitFor(() =>
      push.sent.find((s) => s.tokens.includes(`ExponentPushToken[${t.professionalId}]`)),
    );
    expect(sent.message.title).toContain('Eva');
    expect(sent.message.body).not.toContain('dor');
  });
});

describe('M11: team members', () => {
  it('no taking an existing number, no phone change, invite active on first login; review account cannot add', async () => {
    const t = await connectedPro(app, gw);
    const other = await connectedPro(app, gw);
    const taken = await t.call('POST', '/v1/salon/team', {
      name: 'Rival',
      phone: other.phone,
      professions: ['barbeiro'],
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().code).toBe('PHONE_TAKEN');

    const phone = randomPhone();
    const m = await t.call('POST', '/v1/salon/team', {
      name: 'Nina',
      phone,
      professions: ['barbeiro'],
    });
    expect(m.statusCode, m.body).toBe(200);
    const id = m.json().id as string;
    const lock = await t.call('PATCH', `/v1/salon/team/${id}`, { phone: randomPhone() });
    expect(lock.statusCode).toBe(409);
    expect(lock.json().code).toBe('PHONE_LOCKED');
    expect((await t.call('PATCH', `/v1/salon/team/${id}`, { name: 'Nina S.' })).statusCode).toBe(
      200,
    );
    const row = async () =>
      (await app.db.select().from(professionals).where(eq(professionals.id, id)))[0]!;
    expect((await row()).joinedAt).toBeNull();
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone, code: '123456' },
    });
    expect(login.statusCode).toBe(200);
    expect((await row()).joinedAt).not.toBeNull();

    const review = await ensureReviewAccount(app.db, randomPhone(), now);
    const rt = app.issueTokens(review).accessToken;
    const r = await app.inject({
      method: 'POST',
      url: '/v1/salon/team',
      headers: { authorization: `Bearer ${rt}` },
      payload: { name: 'Alguém', phone: randomPhone(), professions: ['barbeiro'] },
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('B8: realtime', () => {
  it('closes the socket when the access token expires', async () => {
    const t = await connectedPro(app, gw);
    const short = app.jwt.sign(
      { sub: t.professionalId, sid: t.salonId, role: 'owner', typ: 'access' },
      { expiresIn: '2s' },
    );
    const ws = await app.injectWS(`/v1/realtime?token=${short}`);
    const code = await new Promise<number>((resolve) => ws.on('close', (c: number) => resolve(c)));
    expect(code).toBe(WS_UNAUTHORIZED);
  });
});
