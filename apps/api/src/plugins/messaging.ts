// Wires WhatsApp, the AI and the agenda: gateway, LLM, transcriber, push, BullMQ queues and workers.
import { randomBytes } from 'node:crypto';
import fp from 'fastify-plugin';
import {
  createLlmClientFromEnv,
  createTranscriberFromEnv,
  FakeLlm,
  FakeTranscriber,
  toolReply,
  type LlmClient,
  type Transcriber,
} from '@boramarca/ia';
import { FakeGateway, type WhatsAppGateway } from '@boramarca/whatsapp';
import { firstName, renderMessage } from '@boramarca/ia';
import { audit } from '../lib/audit';
import { loadPro, type Core } from '../lib/core';
import { createQueues } from '../lib/queues';
import { purgeExpired, RETENTION_CRON } from '../lib/retention';
import { createReminders } from '../modules/agenda/reminders';
import { createToolRunner } from '../modules/ai/tools';
import { createDecisions } from '../modules/decisions/service';
import { createNotifier } from '../modules/devices/notify';
import { ExpoPush, FakePush, type PushSender } from '../modules/devices/push';
import {
  createDemoGateway,
  createPrimaryGateway,
  RoutingGateway,
} from '../modules/whatsapp/gateway';
import { createInbound } from '../modules/whatsapp/inbound';
import { createOutbox } from '../modules/whatsapp/send';
import { createWaitlist } from '../modules/waitlist/service';

const RETENTION_JOB = 'retention';

export interface MessagingOverrides {
  gateway?: WhatsAppGateway;
  /** `null` = AI unavailable. */
  llm?: LlmClient | null;
  transcriber?: Transcriber | null;
  push?: PushSender;
  /** BullMQ key prefix (tests use a random one so runs do not see each other's jobs). */
  queuePrefix?: string;
}

/** Development without LLM keys: every message becomes a Decision ("IA simulada"). */
const devLlm = () =>
  new FakeLlm([], {
    fallback: toolReply(
      {
        name: 'perguntar_ao_profissional',
        arguments: {
          type: 'duvida',
          question: 'Cliente mandou mensagem (IA simulada, sem chave configurada). Você responde?',
          options: [{ id: 'assumir', label: 'Eu respondo', action: null }],
          proposedAction: null,
        },
      },
      'Entendi como: mensagem (IA simulada)',
    ),
  });

function buildMessaging(core: Core) {
  const notify = createNotifier(core);
  const outbox = createOutbox(core);
  const decisions = createDecisions(core, { outbox, notify });
  const tools = createToolRunner(core, { outbox, decisions, notify });
  const reminders = createReminders(core, { outbox });
  const waitlist = createWaitlist(core, { outbox });
  const inbound = createInbound(core, { tools, notify, waitlist });
  return { notify, outbox, decisions, tools, inbound, reminders, waitlist };
}
export type Messaging = ReturnType<typeof buildMessaging> & {
  gateway: WhatsAppGateway;
  core: Core;
};

declare module 'fastify' {
  interface FastifyInstance {
    messaging: Messaging;
  }
}

export default fp<{ overrides?: MessagingOverrides }>(async (app, { overrides = {} }) => {
  const config = app.config;
  const env = config as unknown as Record<string, string | undefined>;
  const prod = config.NODE_ENV === 'production';

  let gateway = overrides.gateway;
  if (!gateway) {
    const primary = createPrimaryGateway(config);
    const demo = primary instanceof FakeGateway ? primary : createDemoGateway();
    gateway = primary instanceof FakeGateway ? primary : new RoutingGateway(primary, demo);
    // Simulated gateways deliver their webhooks in-process.
    demo.onWebhook(async (body) => {
      const instance = (body as { instance?: string }).instance;
      if (instance)
        await app.messaging.inbound
          .handleWebhook(instance, body)
          .catch((err: unknown) => app.log.error({ err }, 'demo webhook failed'));
    });
  }
  const llm =
    overrides.llm !== undefined
      ? overrides.llm
      : (createLlmClientFromEnv(env) ?? (prod ? null : devLlm()));
  const transcriber =
    overrides.transcriber !== undefined
      ? overrides.transcriber
      : (createTranscriberFromEnv(env) ?? (prod ? null : new FakeTranscriber('áudio de teste')));
  const push =
    overrides.push ??
    ((config.PUSH_PROVIDER ?? (prod ? 'expo' : 'fake')) === 'expo'
      ? new ExpoPush({ accessToken: config.EXPO_ACCESS_TOKEN })
      : new FakePush());

  const queues = createQueues(
    config.REDIS_URL,
    overrides.queuePrefix ??
      (config.NODE_ENV === 'test' ? `bmt${randomBytes(4).toString('hex')}` : 'bm'),
  );
  const core: Core = {
    db: app.db,
    bus: app.bus,
    agenda: app.agenda,
    config,
    now: app.now,
    log: app.log,
    gateway,
    llm,
    transcriber,
    push,
    queues,
  };
  const m = buildMessaging(core);
  app.decorate('messaging', { ...m, gateway, core });

  const onError = (err: unknown) => app.log.error({ err }, 'queue job failed');
  queues.startWorker('inbound', (j, t) => m.inbound.process(j, t), 4, onError);
  // Per-instance lock inside: one send per WhatsApp instance at a time.
  queues.startWorker('outbound', (j, t) => m.outbox.process(j, t), 8, onError);
  queues.startWorker('decisions', (j) => m.decisions.process(j), 4, onError);
  queues.startWorker(
    'reminders',
    (j) => (j.name === RETENTION_JOB ? purgeExpired(app.db, app.now()) : m.reminders.process(j)),
    4,
    onError,
  );
  // Daily retention (leads 12 months, audit_log 90 days); one schedule shared by every instance.
  // Not under vitest: "production" test apps share the test Redis and must not leave a schedule.
  if (!process.env.VITEST)
    await queues.queues.reminders.upsertJobScheduler(
      RETENTION_JOB,
      { pattern: RETENTION_CRON },
      { name: RETENTION_JOB },
    );
  queues.startWorker('waitlist', (j) => m.waitlist.process(j), 2, onError);

  // "Avisar o cliente" from the app (create/reschedule/cancel) goes out through the guard;
  // a new booking makes Decisions proposing that time expire.
  app.agenda.onAppointmentChanged(async (e) => {
    if (e.change === 'created' || e.change === 'rescheduled')
      await m.decisions.expireConflicting(e.professionalId, e.appointment);
    if (!e.notice?.notifyClient || e.actor !== 'professional') return;
    const kind =
      e.change === 'created'
        ? 'booking_confirmation'
        : e.change === 'rescheduled'
          ? 'reschedule'
          : e.change === 'cancelled'
            ? 'cancellation'
            : null;
    if (!kind && !e.notice.messageText) return;
    const pro = await loadPro(app.db, e.professionalId);
    const text =
      e.notice.messageText ??
      renderMessage(kind!, pro.p.aiTone, {
        now: app.now().toISOString(),
        timezone: pro.salon.timezone,
        clientFirstName: firstName(e.appointment.clientName),
        startsAt: e.appointment.startsAt,
        previousStartsAt: e.previous?.startsAt,
      });
    await m.outbox.enqueue({
      professionalId: e.professionalId,
      clientId: e.appointment.clientId,
      text,
      purpose: 'notice',
      author: 'professional',
    });
    await audit(app.db, e.professionalId, 'professional', 'appointment.client_notified', {
      appointmentId: e.appointment.id,
      change: e.change,
    });
  });
  // Reminders follow the appointment: scheduled on create/reschedule, removed otherwise.
  app.agenda.onAppointmentChanged((e) => m.reminders.onAppointmentChanged(e));
  // A freed slot goes to the waitlist, one person at a time (offers leave through the guard with
  // purpose 'waitlist_offer'; send.ts passes waitlistSlotHasOtherActiveOffer from waitlist_offers).
  app.agenda.onSlotFreed(async (e) => {
    if (e.offerToWaitlist)
      await m.waitlist.offerNext({
        professionalId: e.professionalId,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        serviceIds: e.serviceIds,
      });
  });

  app.addHook('onClose', async () => {
    await queues.close();
  });
});
