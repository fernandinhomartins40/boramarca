// Reminders, automatic waitlist, voice and the small agenda routes (plan sections 8 and 9),
// against the Docker Postgres and Redis with real BullMQ queues and the FakeGateway/FakeLlm.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm, toolReply } from '@boramarca/ia';
import { buildApp } from './app';
import {
  appointmentEvents,
  appointments,
  conversations,
  waitlistEntries,
  waitlistOffers,
} from './db/schema';
import { zonedToUtc } from './lib/time';
import { reminderJobId } from './modules/agenda/reminders';
import { offerJobId } from './modules/waitlist/service';
import { FakePush } from './modules/devices/push';
import { connectedPro, waitFor, WEBHOOK_SECRET } from './test/connected';
import { testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 240_000 });

const TZ = 'America/Sao_Paulo';
const DATE = '2030-03-13'; // a Wednesday
const at = (hhmm: string, date = DATE) => zonedToUtc(date, hhmm, TZ).toISOString();
const H = 3_600_000;

let now = new Date(at('09:00'));
const gw = testGateway();
const llm = new FakeLlm();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(
    testConfig({
      WHATSAPP_WEBHOOK_SECRET: WEBHOOK_SECRET,
      WA_GUARD_TYPING_MIN_SECONDS: '1',
      WA_GUARD_TYPING_MAX_SECONDS: '1',
    }),
    { gateway: gw, llm, push: new FakePush(), now: () => now },
  );
});
afterAll(() => app.close());

/** A finished visit in the past: the send guard lets known clients receive reminders. */
async function pastVisit(professionalId: string, clientId: string) {
  await app.db.insert(appointments).values({
    professionalId,
    clientId,
    startsAt: new Date(at('10:00', '2030-01-10')),
    endsAt: new Date(at('10:50', '2030-01-10')),
    status: 'done',
    origin: 'professional',
    priceCents: 15000,
  });
}

describe('reminders', () => {
  it('scheduled on create, moved on reschedule, removed on cancel', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const c = await t.addClient('Ana Souza');
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const q = app.messaging.core.queues.queues.reminders;

    const a = await app.agenda.book(ctx, {
      clientId: c.id,
      serviceIds: [t.serviceId],
      startsAt: at('15:00'),
    });
    let job = await q.getJob(reminderJobId(a.id));
    // 15:00 - 120 min (default lead) - 09:00 = 4 h
    expect(job?.opts.delay).toBe(4 * H);

    await app.agenda.reschedule(ctx, a.id, { startsAt: at('16:00') });
    job = await q.getJob(reminderJobId(a.id));
    expect(job?.opts.delay).toBe(5 * H);
    expect(job?.data.startsAt).toBe(at('16:00'));

    await app.agenda.cancel(ctx, a.id, { offerToWaitlist: false });
    expect(await q.getJob(reminderJobId(a.id))).toBeUndefined();

    // Lead time already passed: no reminder at all.
    const soon = await app.agenda.book(ctx, {
      clientId: c.id,
      serviceIds: [t.serviceId],
      startsAt: at('10:00'),
    });
    expect(await q.getJob(reminderJobId(soon.id))).toBeUndefined();
  });

  it('sends "responda 1" through the guard and the "1" confirms through the normal flow', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const c = await t.addClient('Bruna Lima');
    await pastVisit(t.professionalId, c.id);
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const a = await app.agenda.book(ctx, {
      clientId: c.id,
      serviceIds: [t.serviceId],
      startsAt: at('15:00'),
    });
    const job = await app.messaging.core.queues.queues.reminders.getJob(reminderJobId(a.id));

    now = new Date(at('13:00'));
    expect(await app.messaging.reminders.process(job!)).toEqual({ status: 'sent' });
    const sent = await waitFor(() => t.sentTo(c.phone)[0]);
    expect(sent.text).toContain('Responda 1 para confirmar');
    const events = await app.db
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, a.id));
    expect(events.map((e) => e.type)).toContain('reminder_sent');

    llm.on(
      /^1$/,
      toolReply(
        { name: 'confirmar_presenca', arguments: { appointmentId: a.id } },
        'Entendi como: confirmação',
      ),
      1,
    );
    await t.receive(c.phone, '1', 'Bruna');
    await waitFor(async () => {
      const [r] = await app.db.select().from(appointments).where(eq(appointments.id, a.id));
      return r!.status === 'confirmed';
    });

    // A stale job (appointment moved since) sends nothing.
    expect(await app.messaging.reminders.send({ ...job!.data, startsAt: at('11:00') })).toEqual({
      status: 'stale',
    });
  });
});

describe('automatic waitlist', () => {
  it('one person at a time, in order, by preference, only who asked, with expiry', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    // Waiting time is configurable.
    const rule = await t.call('PATCH', '/v1/waitlist/rule', { waitMinutes: 5 });
    expect(rule.json()).toMatchObject({ enabled: true, waitMinutes: 5 });

    const removed = await t.addClient('Edu Removido');
    const morning = await t.addClient('Ana Manhã');
    const bia = await t.addClient('Bia Tarde');
    const caio = await t.addClient('Caio Tarde');
    const fabi = await t.addClient('Fabi Tarde');
    const dani = await t.addClient('Dani Fora');
    const add = async (clientId: string, periods: string[]) => {
      const r = await t.call('POST', '/v1/waitlist', {
        clientId,
        serviceId: null,
        preference: { weekdays: [], periods },
        clientAsked: true,
      });
      expect(r.statusCode, r.body).toBe(200);
      now = new Date(now.getTime() + 60_000); // distinct opted_in_at, in this order
      return r.json().id as string;
    };
    const edu = await add(removed.id, ['tarde']);
    await add(morning.id, ['manha']);
    const biaEntry = await add(bia.id, ['tarde']);
    const caioEntry = await add(caio.id, ['tarde']);
    const fabiEntry = await add(fabi.id, []);
    expect((await t.call('DELETE', `/v1/waitlist/${edu}`)).statusCode).toBe(200);
    const list = (await t.call('GET', '/v1/waitlist')).json();
    expect(list.items).toHaveLength(4);

    // Dani (not on the list) cancels 15:00; Bia is the oldest matching entry (Ana wants mornings).
    now = new Date(at('10:00'));
    const appt = await app.agenda.book(ctx, {
      clientId: dani.id,
      serviceIds: [t.serviceId],
      startsAt: at('15:00'),
    });
    await app.agenda.cancel(ctx, appt.id, { reason: 'Cliente pediu' });
    const offersOf = async (entryId: string) =>
      app.db.select().from(waitlistOffers).where(eq(waitlistOffers.entryId, entryId));
    const [biaOffer] = await offersOf(biaEntry);
    expect(biaOffer).toMatchObject({ status: 'sent', slotStartsAt: new Date(at('15:00')) });
    expect(biaOffer!.expiresAt.getTime() - now.getTime()).toBe(5 * 60_000);
    const job = await app.messaging.core.queues.queues.waitlist.getJob(offerJobId(biaOffer!.id));
    expect(job?.opts.delay).toBe(5 * 60_000);
    const offerMsg = await waitFor(() => t.sentTo(bia.phone)[0]);
    expect(offerMsg.text).toContain('abriu uma vaga');
    // Nobody else got anything for that slot.
    expect(t.sentTo(caio.phone)).toHaveLength(0);
    expect(t.sentTo(morning.phone)).toHaveLength(0);
    expect(t.sentTo(removed.phone)).toHaveLength(0);
    expect(t.sentTo(dani.phone)).toHaveLength(0);
    // One active offer per slot: a second freed event for the same slot does nothing.
    expect(
      await app.messaging.waitlist.offerNext({
        professionalId: t.professionalId,
        startsAt: at('15:00'),
        endsAt: at('15:50'),
        serviceIds: [t.serviceId],
      }),
    ).toBeNull();

    // Bia does not answer: the expiry job moves the slot to Caio.
    now = new Date(at('10:06'));
    await app.messaging.waitlist.process(job!);
    expect((await offersOf(biaEntry))[0]!.status).toBe('expired');
    const [bEntry] = await app.db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, biaEntry));
    expect(bEntry!.status).toBe('waiting');
    expect((await offersOf(caioEntry))[0]!.status).toBe('sent');
    await waitFor(() => t.sentTo(caio.phone)[0]);

    // Caio says no: next is Fabi (any time).
    await t.receive(caio.phone, 'Não, obrigado', 'Caio');
    await waitFor(async () => (await offersOf(caioEntry))[0]!.status === 'declined');
    await waitFor(async () => (await offersOf(fabiEntry))[0]?.status === 'sent');
    await waitFor(() => t.sentTo(fabi.phone)[0]);

    // Fabi says yes: booked at 15:00 and confirmed to her.
    await t.receive(fabi.phone, 'Sim, quero!', 'Fabi');
    const booked = await waitFor(async () => {
      const [b] = await app.db
        .select()
        .from(appointments)
        .where(and(eq(appointments.clientId, fabi.id), eq(appointments.status, 'scheduled')));
      return b;
    });
    expect((await offersOf(fabiEntry))[0]!.status).toBe('accepted');
    expect(booked.startsAt.toISOString()).toBe(at('15:00'));
    await waitFor(async () => {
      const [e] = await app.db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.id, fabiEntry));
      return e!.status === 'booked';
    });
    await waitFor(() => t.sentTo(fabi.phone).find((s) => s.text.includes('marcado')));
    // Bia (expired) never got a second offer for the same slot.
    expect((await offersOf(biaEntry)).length).toBe(1);

    // Reports count the waitlist-filled slot as recovered.
    const r = await app.inject({
      method: 'GET',
      url: '/v1/salon/reports?month=2030-03',
      headers: { authorization: `Bearer ${t.token}` },
    });
    expect(r.json()).toMatchObject({ recoveredFitInsCount: 1, recoveredValueCents: 15000 });
  });

  it('respects a disabled rule and the cancel option "não oferecer"', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const c = await t.addClient('Gabi');
    const other = await t.addClient('Hugo');
    const entry = (
      await t.call('POST', '/v1/waitlist', {
        clientId: c.id,
        preference: { weekdays: [], periods: [] },
        clientAsked: true,
      })
    ).json().id as string;
    const a = await app.agenda.book(ctx, {
      clientId: other.id,
      serviceIds: [t.serviceId],
      startsAt: at('11:00'),
    });
    await app.agenda.cancel(ctx, a.id, { offerToWaitlist: false });
    await t.call('PATCH', '/v1/waitlist/rule', { enabled: false });
    const b = await app.agenda.book(ctx, {
      clientId: other.id,
      serviceIds: [t.serviceId],
      startsAt: at('14:00'),
    });
    await app.agenda.cancel(ctx, b.id, {});
    expect(
      await app.db.select().from(waitlistOffers).where(eq(waitlistOffers.entryId, entry)),
    ).toHaveLength(0);

    // "Oferecer vaga agora" still works by hand.
    const r = await t.call('POST', `/v1/waitlist/${entry}/offer`, { slotStartsAt: at('16:00') });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ status: 'sent', entryId: entry });
    expect(
      (await t.call('POST', `/v1/waitlist/${entry}/offer`, { slotStartsAt: at('17:00') }))
        .statusCode,
    ).toBe(409);
  });
});

describe('voice', () => {
  it('answers the four questions of plan section 9 and the open/close summaries', async () => {
    now = new Date(at('10:00'));
    const t = await connectedPro(app, gw);
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const caio = await t.addClient('Caio Prado');
    const ana = await t.addClient('Ana Ribeiro');
    const bia = await t.addClient('Bia Santos');
    const duda = await t.addClient('Duda Melo');
    now = new Date(at('08:00'));
    const first = await app.agenda.book(ctx, {
      clientId: caio.id,
      serviceIds: [t.serviceId],
      startsAt: at('09:00'),
    });
    now = new Date(at('10:00'));
    await app.agenda.markDone(ctx, first.id);
    await app.agenda.book(ctx, {
      clientId: ana.id,
      serviceIds: [t.serviceId],
      startsAt: at('11:00'),
    });
    const b = await app.agenda.book(ctx, {
      clientId: bia.id,
      serviceIds: [t.serviceId],
      startsAt: at('14:00'),
    });
    await app.agenda.confirm(ctx, b.id);
    await app.db
      .insert(conversations)
      .values({ professionalId: t.professionalId, clientId: duda.id, unreadCount: 2 });

    const ask = async (text: string) => {
      const r = await t.call('POST', '/v1/voice/command', { text });
      expect(r.statusCode, r.body).toBe(200);
      return r.json() as { intent: string; speech: string; decisionId: string | null };
    };
    expect(await ask('quantos clientes ainda tenho hoje?')).toEqual({
      intent: 'remaining_clients',
      speech: 'Você ainda tem 2 clientes hoje.',
      decisionId: null,
    });
    const free = await ask('tem horário vago?');
    expect(free.intent).toBe('free_slots');
    expect(free.speech).toMatch(/^Tem vaga às /);
    const next = await ask('quem é o próximo?');
    expect(next.intent).toBe('next_client');
    expect(next.speech).toMatch(/^O próximo é Ana, às /);
    expect(await ask('alguém mandou mensagem?')).toMatchObject({
      intent: 'new_messages',
      speech: 'Duda mandou mensagem.',
    });

    const open = (await t.call('GET', '/v1/voice/summary?moment=open')).json();
    expect(open.speech).toMatch(/^Bom dia! Hoje você tem 2 clientes\. O primeiro é Ana/);
    const close = (await t.call('GET', '/v1/voice/summary?moment=close')).json();
    expect(close.speech).toContain('Hoje você atendeu 1 cliente');
  });
});

describe('agenda extras', () => {
  it('confirm, delay notice, client history, kit lead', async () => {
    now = new Date(at('09:00'));
    const t = await connectedPro(app, gw);
    const c = await t.addClient('Iara Costa');
    await pastVisit(t.professionalId, c.id);
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const a = await app.agenda.book(ctx, {
      clientId: c.id,
      serviceIds: [t.serviceId],
      startsAt: at('15:00'),
    });

    const conf = await t.call('POST', `/v1/appointments/${a.id}/confirm`);
    expect(conf.statusCode, conf.body).toBe(200);
    expect(conf.json().status).toBe('confirmed');

    const delay = await t.call('POST', `/v1/appointments/${a.id}/delay-notice`, {
      delayMinutes: 15,
    });
    expect(delay.statusCode, delay.body).toBe(200);
    expect(delay.json().sentText).toContain('15');
    await waitFor(() => t.sentTo(c.phone).find((s) => s.text.includes('atraso')));
    const detail = (await t.call('GET', `/v1/appointments/${a.id}`)).json();
    expect(detail.events.map((e: { type: string }) => e.type)).toContain('delay_notice_sent');

    const hist = (await t.call('GET', `/v1/clients/${c.id}/appointments`)).json();
    expect(hist.items.map((i: { status: string }) => i.status)).toEqual(['confirmed', 'done']);

    const kit = await t.call('POST', '/v1/kit-leads', { note: 'Quero o kit' });
    expect(kit.statusCode, kit.body).toBe(200);
    const plan = (await t.call('GET', '/v1/salon/plan')).json();
    expect(plan.kitInterestSent).toBe(true);
  });
});
