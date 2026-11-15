// End-to-end: WhatsApp (FakeGateway) -> webhook -> BullMQ -> AI (FakeLlm) -> rule engine ->
// Decisions -> send guard, against the Docker Postgres and Redis (plan section 5).
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FakeLlm, FakeTranscriber, toolReply } from '@boramarca/ia';
import { WHATSAPP_WEBHOOK_SECRET_HEADER, type RealtimeEvent } from '@boramarca/shared';
import { buildApp } from './app';
import {
  aiDecisions,
  appointments,
  auditLog,
  clients,
  conversations,
  messages,
  professionals,
} from './db/schema';
import { zonedToUtc } from './lib/time';
import { FakePush } from './modules/devices/push';
import { randomPhone, seedProfessional, testConfig, testGateway } from './test/helpers';

// Real queues and workers: under a loaded machine a full flow can take a while.
vi.setConfig({ testTimeout: 180_000 });

const TZ = 'America/Sao_Paulo';
const DATE = '2030-03-09'; // a Saturday
const at = (hhmm: string) => zonedToUtc(DATE, hhmm, TZ).toISOString();
const SECRET = 'test-webhook-secret-0123456789';

let now = new Date(at('14:00'));
const gw = testGateway();
const llm = new FakeLlm();
const push = new FakePush();
let app: Awaited<ReturnType<typeof buildApp>>;

async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false> | T | null | undefined | false,
  ms = 150_000, // generous: the whole suite shares one slow machine
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** A professional with WhatsApp connected, ready to receive messages. */
async function setupPro() {
  const pro = await seedProfessional(app.db);
  const token = app.issueTokens({
    professionalId: pro.professionalId,
    salonId: pro.salonId,
    role: 'owner',
  }).accessToken;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const sess = await call('POST', '/v1/whatsapp/session', { riskAccepted: true });
  expect(sess.statusCode, sess.body).toBe(200);
  const instance = `bm-${pro.professionalId}`;
  expect((await call('GET', '/v1/whatsapp/qr')).json().qr).toContain('fake-qr');
  await gw.simulateConnect(instance, randomPhone());
  expect((await call('GET', '/v1/whatsapp/status')).json().status).toBe('connected');
  await call('POST', '/v1/devices', {
    pushToken: `ExponentPushToken[${pro.professionalId}]`,
    platform: 'android',
  });

  const webhook = (body: unknown, secret = SECRET) =>
    app.inject({
      method: 'POST',
      url: `/v1/webhooks/whatsapp/${instance}`,
      payload: body as object,
      headers: { [WHATSAPP_WEBHOOK_SECRET_HEADER]: secret },
    });
  const receive = async (fromPhone: string, text: string, pushName?: string) => {
    const body = await gw.injectInbound(instance, { fromPhone, text, pushName });
    const r = await webhook(body);
    expect(r.statusCode).toBe(200);
    return body;
  };
  const sentTo = (phone: string) =>
    gw.sent.filter((s) => s.instance === instance && s.toPhone === phone);
  const addClient = async (name: string, phone = randomPhone()) => {
    const [c] = await app.db
      .insert(clients)
      .values({ professionalId: pro.professionalId, name, phone })
      .returning();
    return c!;
  };
  const pendingDecisions = async () =>
    (await call('GET', '/v1/decisions?status=pending')).json().items as {
      id: string;
      question: string;
      type: string;
      status: string;
      clientId: string;
    }[];
  return { ...pro, token, call, instance, webhook, receive, sentTo, addClient, pendingDecisions };
}

beforeAll(async () => {
  app = await buildApp(testConfig({ WHATSAPP_WEBHOOK_SECRET: SECRET }), {
    gateway: gw,
    llm,
    transcriber: new FakeTranscriber('tem horário amanhã de manhã?'),
    push,
    now: () => now,
  });
});
afterAll(() => app.close());

describe('PDF example flow (steps 1–7), end to end', () => {
  it('Carlos cancels at 14:02, Fulano asks at 14:05, "pode, mas marca daqui 15 minutos" → 14h20', async () => {
    const t = await setupPro();
    const carlos = await t.addClient('Carlos Pereira');
    now = new Date(at('09:00'));
    const appt = await app.agenda.book(
      { professionalId: t.professionalId, actor: 'professional' },
      { clientId: carlos.id, serviceIds: [t.serviceId], startsAt: at('15:00') },
    );
    const marcar15 = {
      name: 'marcar' as const,
      arguments: { serviceIds: [t.serviceId], startsAt: at('15:00') },
    };
    llm
      .on(
        /não vou conseguir ir hoje às 15h/,
        toolReply(
          [
            { name: 'cancelar', arguments: { appointmentId: appt.id } },
            {
              name: 'responder_cliente',
              arguments: {
                text: 'Tranquilo, Carlos! Cancelei seu horário de hoje às 15h. Quer remarcar?',
              },
            },
          ],
          'Entendi como: cancelamento do horário de hoje às 15h',
        ),
        1,
      )
      .on(
        /tem horário hoje à tarde\?/,
        (req) => {
          // Step 3: the freed 15h is in the reduced context, and no phone ever is.
          const context = String(req.messages[1]?.content);
          expect(context).toMatch(/Vagas livres hoje: .*15h/);
          expect(context).not.toContain(carlos.phone);
          return toolReply(
            {
              name: 'perguntar_ao_profissional',
              arguments: {
                type: 'novo_horario',
                question:
                  'Fulano quer horário hoje à tarde. O Carlos das 15h desmarcou. Posso marcar o Fulano às 15h?',
                options: [
                  { id: 'sim', label: 'Sim', action: marcar15 },
                  { id: 'nao', label: 'Não', action: null },
                ],
                proposedAction: marcar15,
              },
            },
            'Entendi como: pedido de horário para hoje à tarde',
          );
        },
        1,
      );
    const events: RealtimeEvent[] = [];
    const off = app.bus.subscribe(t.professionalId, (e) => events.push(e));

    // 1–2. 14:02 — Carlos cancels; the slot is freed and he gets the AI's reply.
    now = new Date(at('14:02'));
    await t.receive(carlos.phone, 'não vou conseguir ir hoje às 15h', 'Carlos');
    const toCarlos = await waitFor(() => t.sentTo(carlos.phone)[0]);
    expect(toCarlos.text).toBe(
      'Tranquilo, Carlos! Cancelei seu horário de hoje às 15h. Quer remarcar?',
    );
    const [cancelled] = await app.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appt.id));
    expect(cancelled!.status).toBe('cancelled');
    const [carlosMsg] = await app.db
      .select()
      .from(messages)
      .where(
        and(eq(messages.direction, 'in'), eq(messages.text, 'não vou conseguir ir hoje às 15h')),
      );
    expect(carlosMsg!.aiNote).toBe('Entendi como: cancelamento do horário de hoje às 15h');
    // "Cancela quando o cliente pede e sempre avisa o profissional"
    await waitFor(() => push.sent.find((p) => p.message.title.startsWith('Carlos cancelou')));

    // 3–4. 14:05 — Fulano (new number) asks; a Decision is created, announced and notified.
    now = new Date(at('14:05'));
    const fulanoPhone = randomPhone();
    await t.receive(fulanoPhone, 'tem horário hoje à tarde?', 'Fulano');
    const [decision] = await waitFor(async () => {
      const d = await t.pendingDecisions();
      return d.length ? d : null;
    });
    expect(decision!.type).toBe('novo_horario');
    await waitFor(() => events.find((e) => e.type === 'decision.created'));
    const notif = await waitFor(() =>
      push.sent.find((p) => p.message.data?.decisionId === decision!.id),
    );
    expect(notif.message).toMatchObject({ categoryId: 'decision', channelId: 'decisoes' });
    expect(notif.message.data?.options).toEqual([
      { id: 'sim', label: 'Sim' },
      { id: 'nao', label: 'Não' },
    ]);
    expect(t.sentTo(fulanoPhone)).toHaveLength(0); // nothing booked, nothing promised

    // 5. "Pode, mas marca daqui 15 minutos." -> marcar at now + 15 min, conflict-checked.
    const r = await t.call('POST', `/v1/decisions/${decision!.id}/answer`, {
      text: 'Pode, mas marca daqui 15 minutos.',
      via: 'voice',
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.spokenConfirmation).toBe('Marquei Fulano hoje às 14h20.');
    expect(body.appointment).toMatchObject({
      startsAt: at('14:20'),
      endsAt: at('15:10'),
      status: 'scheduled',
    });
    expect(body.decision).toMatchObject({
      status: 'resolved',
      resolvedVia: 'voice',
      resolvedOption: 'sim',
    });

    // 6. Fulano gets the confirmation, through the guard ("digitando" first).
    const toFulano = await waitFor(() => t.sentTo(fulanoPhone)[0]);
    expect(toFulano.text).toBe(body.clientMessagePreview);
    expect(toFulano.text).toContain('hoje às 14h20');
    expect(gw.presences.some((p) => p.toPhone === fulanoPhone && p.durationMs >= 2000)).toBe(true);
    await waitFor(() => events.find((e) => e.type === 'decision.resolved'));
    off();

    const audit = await app.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.professionalId, t.professionalId));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'whatsapp.received',
        'ai.interpreted',
        'ai.action_executed',
        'appointment.cancelled',
        'decision.created',
        'decision.answered',
        'appointment.booked',
        'whatsapp.sent',
      ]),
    );
  });

  it('step 7: no answer in time -> "Já te confirmo!", the Decision stays pending and never books', async () => {
    const t = await setupPro();
    now = new Date(at('10:00'));
    const phone = randomPhone();
    llm.on(
      /quero marcar às 16h/,
      toolReply(
        { name: 'marcar', arguments: { serviceIds: [t.serviceId], startsAt: at('16:00') } },
        'Entendi como: pedido de horário às 16h',
      ),
      1,
    );
    await t.receive(phone, 'quero marcar às 16h', 'Beltrano');
    // book_free_slot_known_client is off by default: the "marcar" becomes a Decision.
    const [d] = await waitFor(async () =>
      (await t.pendingDecisions()).length ? t.pendingDecisions() : null,
    );
    expect(d!.question).toBe('Beltrano quer horário hoje às 16h. Posso marcar?');

    const job = await app.messaging.core.queues.queues.decisions.getJob(`timeout-${d!.id}`);
    expect(job).toBeTruthy();
    await job!.promote(); // the deadline (10 min) "passes"
    const hold = await waitFor(() => t.sentTo(phone)[0]);
    expect(hold.text).toBe('Já te confirmo!');
    await waitFor(() =>
      push.sent.find((p) => p.message.title === 'Beltrano ainda espera sua resposta'),
    );
    const [row] = await app.db.select().from(aiDecisions).where(eq(aiDecisions.id, d!.id));
    expect(row!.status).toBe('pending');
    expect(row!.timeoutNotifiedAt).not.toBeNull();
    const booked = await app.db
      .select()
      .from(appointments)
      .where(eq(appointments.professionalId, t.professionalId));
    expect(booked).toHaveLength(0);

    // Still answerable... until the time stops being free: then it expires and the client is told.
    await app.agenda.book(
      { professionalId: t.professionalId, actor: 'professional' },
      {
        newClient: { name: 'Outra', phone: randomPhone() },
        serviceIds: [t.serviceId],
        startsAt: at('16:20'),
      },
    );
    await waitFor(
      async () =>
        (await app.db.select().from(aiDecisions).where(eq(aiDecisions.id, d!.id)))[0]!.status ===
        'expired',
    );
    const expired = await waitFor(() => t.sentTo(phone)[1]);
    expect(expired.text).toContain('não está mais disponível');
    const late = await t.call('POST', `/v1/decisions/${d!.id}/answer`, {
      optionId: 'sim',
      via: 'app',
    });
    expect(late.statusCode).toBe(409);
  });
});

describe('protections', () => {
  it('duplicate webhook (same provider message id) is processed once', async () => {
    const t = await setupPro();
    const phone = randomPhone();
    llm.on(
      /mensagem duplicada/,
      toolReply({ name: 'responder_cliente', arguments: { text: 'Oi! Recebi.' } }),
      5,
    );
    const before = llm.requests.length;
    const body = await t.receive(phone, 'mensagem duplicada', 'Dupla');
    expect((await t.webhook(body)).statusCode).toBe(200);
    expect((await t.webhook(body)).statusCode).toBe(200);
    await waitFor(() => t.sentTo(phone)[0]);
    await new Promise((r) => setTimeout(r, 500));
    expect(t.sentTo(phone)).toHaveLength(1);
    expect(llm.requests.length - before).toBe(1);
    const rows = await app.db
      .select()
      .from(messages)
      .where(eq(messages.text, 'mensagem duplicada'));
    expect(rows).toHaveLength(1);
    const dup = await app.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.professionalId, t.professionalId),
          eq(auditLog.action, 'whatsapp.duplicate_ignored'),
        ),
      );
    expect(dup).toHaveLength(2);
  });

  it('rejects a webhook with the wrong secret', async () => {
    const t = await setupPro();
    const body = await gw.injectInbound(t.instance, { fromPhone: randomPhone(), text: 'oi' });
    expect((await t.webhook(body, 'wrong-secret-wrong-secret')).statusCode).toBe(401);
    expect((await t.webhook(body, '')).statusCode).toBe(401);
  });

  it('paused AI: the message is stored and only reaches the app', async () => {
    const t = await setupPro();
    const p = await t.call('POST', '/v1/ai/pause', { until: null });
    expect(p.json()).toEqual({ aiEnabled: false, aiPausedUntil: null, pausedIndefinitely: true });
    const phone = randomPhone();
    const before = llm.requests.length;
    await t.receive(phone, 'oi, tudo bem? IA pausada', 'Pausa');
    await waitFor(
      async () =>
        (
          await app.db
            .select()
            .from(auditLog)
            .where(
              and(eq(auditLog.professionalId, t.professionalId), eq(auditLog.action, 'ai.skipped')),
            )
        )[0],
    );
    expect(llm.requests.length).toBe(before);
    expect(t.sentTo(phone)).toHaveLength(0);
    await waitFor(() => push.sent.find((s) => s.message.title === 'Pausa mandou mensagem'));
    const convs = (await t.call('GET', '/v1/conversations?filter=unread')).json().items;
    expect(convs[0]).toMatchObject({
      clientName: 'Pausa',
      unreadCount: 1,
      lastMessagePreview: 'oi, tudo bem? IA pausada',
    });

    expect((await t.call('POST', '/v1/ai/resume')).json().aiEnabled).toBe(true);
    // A timed pause in the past does not block.
    expect(
      (
        await t.call('POST', '/v1/ai/pause', {
          until: new Date(now.getTime() - 60_000).toISOString(),
        })
      ).statusCode,
    ).toBe(400);
  });

  it('change_other_client is locked: settings reject it and the engine always asks', async () => {
    const t = await setupPro();
    const r = await t.call('PATCH', '/v1/ai/settings', { autonomy: { change_other_client: true } });
    expect(r.statusCode).toBe(400);
    expect(
      (
        await t.call('PATCH', '/v1/ai/settings', {
          autonomy: { cancel_on_request: true },
          aiTone: 'formal',
        })
      ).json().autonomy.change_other_client,
    ).toBe(false);
    // Even if the stored JSON were tampered with, the engine does not read the key.
    await app.db
      .update(professionals)
      .set({
        autonomy: {
          answer_price_address: true,
          confirm_reminders: true,
          book_free_slot_known_client: true,
          cancel_on_request: true,
          change_other_client: true as false,
        },
      })
      .where(eq(professionals.id, t.professionalId));

    now = new Date(at('09:00'));
    const other = await t.addClient('Rafael Lima');
    const appt = await app.agenda.book(
      { professionalId: t.professionalId, actor: 'professional' },
      { clientId: other.id, serviceIds: [t.serviceId], startsAt: at('17:00') },
    );
    const ana = await t.addClient('Ana Paula');
    llm.on(
      /cancela o horário do Rafael/,
      toolReply([
        { name: 'cancelar', arguments: { appointmentId: appt.id } },
        { name: 'responder_cliente', arguments: { text: 'Pronto, cancelei o do Rafael!' } },
      ]),
      1,
    );
    await t.receive(ana.phone, 'cancela o horário do Rafael, ele pediu', 'Ana');
    const [d] = await waitFor(async () =>
      (await t.pendingDecisions()).length ? t.pendingDecisions() : null,
    );
    expect(d!.question).toContain('de Rafael');
    const [still] = await app.db.select().from(appointments).where(eq(appointments.id, appt.id));
    expect(still!.status).toBe('scheduled');
    await new Promise((res) => setTimeout(res, 300));
    expect(t.sentTo(ana.phone).map((s) => s.text)).not.toContain('Pronto, cancelei o do Rafael!');

    // The professional says yes: now it runs. Rafael never wrote to this number, so the guard
    // does not let the cancellation notice reach him (recipient_not_allowed).
    const yes = await t.call('POST', `/v1/decisions/${d!.id}/answer`, {
      optionId: 'sim',
      via: 'notification',
    });
    expect(yes.json().appointment.status).toBe('cancelled');
    const blocked = await waitFor(
      async () =>
        (
          await app.db
            .select()
            .from(auditLog)
            .where(
              and(
                eq(auditLog.professionalId, t.professionalId),
                eq(auditLog.action, 'whatsapp.send_blocked'),
              ),
            )
        )[0],
    );
    expect(blocked.payload).toMatchObject({ reason: 'recipient_not_allowed' });
    expect(blocked.payload.messageId).toEqual(expect.any(String));
    expect(JSON.stringify(blocked.payload)).not.toContain(other.phone); // B5
    expect(t.sentTo(other.phone)).toHaveLength(0);
  });

  it('ids from another professional coming from the AI are refused', async () => {
    const t = await setupPro();
    const stranger = await seedProfessional(app.db);
    const [sc] = await app.db
      .insert(clients)
      .values({ professionalId: stranger.professionalId, name: 'Alheio', phone: randomPhone() })
      .returning();
    now = new Date(at('09:00'));
    const foreign = await app.agenda.book(
      { professionalId: stranger.professionalId, actor: 'professional' },
      { clientId: sc!.id, serviceIds: [stranger.serviceId], startsAt: at('11:00') },
    );
    const phone = randomPhone();
    llm.on(
      /id de outro profissional/,
      toolReply([
        { name: 'cancelar', arguments: { appointmentId: foreign.id } },
        { name: 'marcar', arguments: { serviceIds: [stranger.serviceId], startsAt: at('10:00') } },
        { name: 'enviar_whatsapp', arguments: { clientId: sc!.id, text: 'oi' } },
      ]),
      1,
    );
    await t.receive(phone, 'id de outro profissional', 'Intruso');
    const [d] = await waitFor(async () =>
      (await t.pendingDecisions()).length ? t.pendingDecisions() : null,
    );
    expect(d!.type).toBe('duvida'); // safe fallback: the professional answers
    const rejected = await app.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.professionalId, t.professionalId), eq(auditLog.action, 'ai.tool_rejected')),
      );
    expect(rejected[0]!.payload.ids).toEqual(
      expect.arrayContaining([foreign.id, stranger.serviceId, sc!.id]),
    );
    const [intact] = await app.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, foreign.id));
    expect(intact!.status).toBe('scheduled');
    expect(gw.sent.some((s) => s.toPhone === sc!.phone)).toBe(false);
    // And through the HTTP API another professional's decision is a 404.
    const other = app.issueTokens({
      professionalId: stranger.professionalId,
      salonId: stranger.salonId,
      role: 'owner',
    }).accessToken;
    const r = await app.inject({
      method: 'POST',
      url: `/v1/decisions/${d!.id}/answer`,
      payload: { optionId: 'assumir', via: 'app' },
      headers: { authorization: `Bearer ${other}` },
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('conversations, take over, audio, preview, devices', () => {
  it('"deixa que eu respondo" hands the conversation to the professional, who replies by the guard', async () => {
    const t = await setupPro();
    now = new Date(at('10:00'));
    const phone = randomPhone();
    llm.on(
      /vocês atendem convênio/,
      toolReply({
        name: 'perguntar_ao_profissional',
        arguments: {
          type: 'duvida',
          question: 'Zeca pergunta sobre convênio. Você responde?',
          options: [{ id: 'assumir', label: 'Eu respondo', action: null }],
          proposedAction: null,
          holdingReply: 'Vou ver aqui e já te falo!',
        },
      }),
      1,
    );
    await t.receive(phone, 'vocês atendem convênio?', 'Zeca');
    expect((await waitFor(() => t.sentTo(phone)[0])).text).toBe('Vou ver aqui e já te falo!');
    const [d] = await t.pendingDecisions();
    const r = await t.call('POST', `/v1/decisions/${d!.id}/answer`, {
      text: 'deixa que eu respondo',
      via: 'voice',
    });
    expect(r.json()).toMatchObject({
      spokenConfirmation: 'Combinado, a conversa é sua.',
      decision: { status: 'resolved', resolvedOption: 'take_over' },
    });
    const [conv] = await app.db
      .select()
      .from(conversations)
      .where(eq(conversations.professionalId, t.professionalId));
    expect(conv!.handler).toBe('human');

    // Human handler: the AI stays out.
    const before = llm.requests.length;
    await t.receive(phone, 'e aí?', 'Zeca');
    await waitFor(
      async () =>
        (
          await app.db
            .select()
            .from(auditLog)
            .where(
              and(eq(auditLog.professionalId, t.professionalId), eq(auditLog.action, 'ai.skipped')),
            )
        )[0],
    );
    expect(llm.requests.length).toBe(before);

    now = new Date(at('10:05'));
    const sent = await t.call('POST', `/v1/conversations/${conv!.id}/messages`, {
      text: 'Atendemos sim!',
    });
    expect(sent.json()).toMatchObject({
      direction: 'out',
      author: 'professional',
      text: 'Atendemos sim!',
    });
    await waitFor(() => t.sentTo(phone).find((s) => s.text === 'Atendemos sim!'));
    const msgs = await waitFor(async () => {
      const items = (await t.call('GET', `/v1/conversations/${conv!.id}/messages`)).json().items;
      return items[0]?.providerMessageId ? items : null;
    });
    expect(msgs[0]).toMatchObject({ text: 'Atendemos sim!' });
    expect(msgs[0].providerMessageId).toMatch(/^FAKE/);
    expect((await t.call('GET', '/v1/conversations?filter=unread')).json().items).toHaveLength(0);
    const back = await t.call('POST', `/v1/conversations/${conv!.id}/handoff`, { handler: 'ai' });
    expect(back.json().handler).toBe('ai');
  });

  it('audio is transcribed before the AI, and the guard blocks unknown recipients', async () => {
    const t = await setupPro();
    const phone = randomPhone();
    llm.on(
      /\(áudio transcrito\) tem horário amanhã de manhã\?/,
      toolReply({ name: 'responder_cliente', arguments: { text: 'Tenho às 9h!' } }),
      1,
    );
    const body = await gw.injectInbound(t.instance, {
      fromPhone: phone,
      audio: { base64: Buffer.from('ogg').toString('base64') },
      pushName: 'Voz',
    });
    await t.webhook(body);
    expect((await waitFor(() => t.sentTo(phone)[0])).text).toBe('Tenho às 9h!');
    const [m] = await app.db
      .select()
      .from(messages)
      .where(eq(messages.transcription, 'tem horário amanhã de manhã?'));
    expect(m!.kind).toBe('audio');

    // A client who never wrote and was never attended cannot be messaged (recipient_not_allowed).
    const silent = await t.addClient('Nunca Escreveu');
    await app.messaging.outbox.enqueue({
      professionalId: t.professionalId,
      clientId: silent.id,
      text: 'Oi!',
      purpose: 'notice',
      author: 'professional',
    });
    await waitFor(
      async () =>
        (
          await app.db
            .select()
            .from(auditLog)
            .where(
              and(
                eq(auditLog.professionalId, t.professionalId),
                eq(auditLog.action, 'whatsapp.send_blocked'),
              ),
            )
        )[0],
    );
    expect(t.sentTo(silent.phone)).toHaveLength(0);
  });

  it('message preview, devices and AI settings', async () => {
    const t = await setupPro();
    now = new Date(at('09:00'));
    const c = await t.addClient('Marina Souza');
    const a = await app.agenda.book(
      { professionalId: t.professionalId, actor: 'professional' },
      { clientId: c.id, serviceIds: [t.serviceId], startsAt: at('15:00') },
    );
    const r = await t.call('POST', '/v1/messages/preview', {
      kind: 'booking_confirmation',
      tone: 'descontraido',
      appointmentId: a.id,
    });
    expect(r.json().text).toBe('Fechado, Marina! Te espero hoje às 15h (Sessão).');
    expect(
      (
        await t.call('POST', '/v1/messages/preview', {
          kind: 'reminder',
          appointmentId: '00000000-0000-4000-8000-000000000000',
        })
      ).statusCode,
    ).toBe(404);

    const dev = (
      await t.call('POST', '/v1/devices', { pushToken: 'ExponentPushToken[abc]', platform: 'ios' })
    ).json();
    expect(dev.platform).toBe('ios');
    expect((await t.call('DELETE', `/v1/devices/${dev.id}`)).json()).toEqual({ ok: true });
    expect((await t.call('DELETE', `/v1/devices/${dev.id}`)).statusCode).toBe(404);
    expect((await t.call('DELETE', '/v1/whatsapp/session')).json()).toEqual({ ok: true });
    expect((await t.call('GET', '/v1/whatsapp/status')).json().status).toBe('disconnected');
    const code = await t.call(
      'GET',
      `/v1/whatsapp/pairing-code?phone=${encodeURIComponent('+5511999990000')}`,
    );
    expect(code.json().code).toHaveLength(8);
  });
});
