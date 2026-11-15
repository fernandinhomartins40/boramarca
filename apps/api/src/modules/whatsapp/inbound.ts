// Inbound side of plan section 5: webhook -> stored message -> `inbound` queue -> AI -> rule engine.
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { buildContext, interpretClientMessage } from '@boramarca/ia';
import { ACTIVE_APPOINTMENT_STATUSES, type WhatsAppStatusResponse } from '@boramarca/shared';
import type { InboundMessageEvent } from '@boramarca/whatsapp';
import {
  appointments,
  appointmentServices,
  clients,
  conversations,
  messages,
  services,
  whatsappSessions,
} from '../../db/schema';
import { audit } from '../../lib/audit';
import { aiActive, loadPro, type Core } from '../../lib/core';
import { realtimeEvent } from '../../lib/event-bus';
import { withKeyLock } from '../../lib/queues';
import { todayIn } from '../../lib/time';
import type { ToolRunner } from '../ai/tools';
import { publishMessage } from '../conversations/views';
import type { Notify } from '../devices/notify';
import type { Waitlist } from '../waitlist/service';
import { hadPastAppointment } from './send';

export interface InboundJob {
  messageId: string;
  professionalId: string;
  audio: { base64: string; mimetype: string | null } | null;
}

type SessionRow = typeof whatsappSessions.$inferSelect;

export function statusResponse(
  s: Pick<SessionRow, 'status' | 'phone' | 'updatedAt'> | null,
  extra: {
    profileName?: string | null;
    profilePictureUrl?: string | null;
    errorMessage?: string | null;
  } = {},
): WhatsAppStatusResponse {
  return {
    status: s?.status ?? 'disconnected',
    phone: s?.phone ?? null,
    profileName: extra.profileName ?? null,
    profilePictureUrl: extra.profilePictureUrl ?? null,
    errorMessage:
      extra.errorMessage ??
      (s?.status === 'error' ? 'A conexão com o WhatsApp falhou. Conecte de novo.' : null),
    updatedAt: (s?.updatedAt ?? new Date()).toISOString(),
  };
}

export function createInbound(
  core: Core,
  deps: { tools: ToolRunner; notify: Notify; waitlist: Waitlist },
) {
  const { db, bus, queues, gateway } = core;

  async function storeMessage(session: SessionRow, e: InboundMessageEvent) {
    const pid = session.professionalId;
    const at = core.now();
    const phone = e.fromPhone!;
    const stored = await db.transaction(async (tx) => {
      const [client] = await tx
        .insert(clients)
        .values({
          professionalId: pid,
          name: e.pushName?.trim() || 'Cliente',
          phone,
          origin: 'whatsapp',
          firstContactAt: at,
        })
        .onConflictDoUpdate({
          target: [clients.professionalId, clients.phone],
          set: {
            firstContactAt: sql`coalesce(${clients.firstContactAt}, ${at.toISOString()}::timestamptz)`,
          },
        })
        .returning();
      const [conv] = await tx
        .insert(conversations)
        .values({ professionalId: pid, clientId: client!.id })
        .onConflictDoUpdate({
          target: [conversations.professionalId, conversations.clientId],
          set: { updatedAt: at },
        })
        .returning();
      const [m] = await tx
        .insert(messages)
        .values({
          conversationId: conv!.id,
          direction: 'in',
          author: 'client',
          kind: e.kind === 'audio' ? 'audio' : 'text',
          text: e.text,
          providerMessageId: e.providerMessageId,
          createdAt: at,
        })
        .onConflictDoNothing({ target: messages.providerMessageId })
        .returning();
      if (!m) return null; // duplicate webhook
      await tx
        .update(conversations)
        .set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastMessageAt: at })
        .where(eq(conversations.id, conv!.id));
      return m;
    });
    if (!stored) {
      await audit(db, pid, 'system', 'whatsapp.duplicate_ignored', {
        providerMessageId: e.providerMessageId,
      });
      return null;
    }
    await audit(db, pid, 'client', 'whatsapp.received', {
      messageId: stored.id,
      kind: stored.kind,
    });
    await publishMessage(db, bus, pid, stored);
    const job: InboundJob = {
      messageId: stored.id,
      professionalId: pid,
      audio: e.audio?.base64 ? { base64: e.audio.base64, mimetype: e.audio.mimetype } : null,
    };
    // shortcut: audio travels in the job (Redis); move to object storage if audios get large.
    // One attempt: a retry could repeat actions/replies of a half-processed turn.
    await queues.queues.inbound.add('message', job, { jobId: stored.id, attempts: 1 });
    return stored;
  }

  /** Webhook body (already authenticated). Never throws to the provider. */
  async function handleWebhook(instance: string, body: unknown) {
    const e = gateway.parseWebhook(body);
    if (e.type === 'ignored') return 'ignored';
    if (e.instance && e.instance !== instance) return 'ignored';
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.instanceName, instance));
    if (!session) return 'unknown_instance';
    const pid = session.professionalId;

    if (e.type === 'connection') {
      const [s] = await db
        .update(whatsappSessions)
        .set({ status: e.status, ...(e.phone && { phone: e.phone }) })
        .where(eq(whatsappSessions.id, session.id))
        .returning();
      await audit(db, pid, 'system', 'whatsapp.status', {
        status: e.status,
        reasonCode: e.reasonCode,
      });
      await bus
        .publish(
          pid,
          realtimeEvent(
            'whatsapp.status',
            statusResponse(s!, {
              profileName: e.profileName,
              profilePictureUrl: e.profilePictureUrl,
            }),
          ),
        )
        .catch(() => {});
      if (e.status === 'disconnected' || e.status === 'error')
        await deps.notify(pid, 'whatsapp_down', {
          title: 'WhatsApp desconectado',
          body: 'As respostas ficam guardadas até você conectar de novo.',
        });
      return 'connection';
    }
    if (e.type === 'qr') {
      const [s] = await db
        .update(whatsappSessions)
        .set({ status: e.qr ? 'waiting_qr' : 'error' })
        .where(eq(whatsappSessions.id, session.id))
        .returning();
      await bus.publish(pid, realtimeEvent('whatsapp.status', statusResponse(s!))).catch(() => {});
      return 'qr';
    }
    if (e.ignored || !e.fromPhone) return 'ignored';
    return (await storeMessage(session, e)) ? 'stored' : 'duplicate';
  }

  /** Inbound worker, one message per conversation at a time (in order). */
  async function process(job: Job<InboundJob>, token?: string) {
    const [row] = await db
      .select({ m: messages, conv: conversations, client: clients })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(clients, eq(clients.id, conversations.clientId))
      .where(eq(messages.id, job.data.messageId));
    if (!row) return { status: 'gone' };
    return withKeyLock(queues.redis, `inbound:lock:${row.conv.id}`, job, token, () =>
      handle(job.data, row),
    );
  }

  async function handle(
    data: InboundJob,
    row: {
      m: typeof messages.$inferSelect;
      conv: typeof conversations.$inferSelect;
      client: typeof clients.$inferSelect;
    },
  ) {
    const pid = data.professionalId;
    const pro = await loadPro(db, pid);
    let m = row.m;
    const notifyApp = async (reason: string) => {
      await audit(db, pid, 'system', 'ai.skipped', { messageId: m.id, reason });
      await deps.notify(pid, 'message', {
        title: `${row.client.name} mandou mensagem`,
        body: (m.text ?? m.transcription ?? 'Áudio').slice(0, 120),
        data: { type: 'message', conversationId: row.conv.id },
      });
      return { status: 'skipped', reason };
    };

    // Step 4: audio -> text.
    if (m.kind === 'audio' && !m.transcription && data.audio) {
      if (!core.transcriber) return notifyApp('no_transcriber');
      const ext = data.audio.mimetype?.includes('mpeg') ? 'mp3' : 'ogg';
      const { text } = await core.transcriber.transcribe({
        data: Buffer.from(data.audio.base64, 'base64'),
        filename: `audio.${ext}`,
        mimeType: data.audio.mimetype ?? undefined,
      });
      [m] = (await db
        .update(messages)
        .set({ transcription: text })
        .where(eq(messages.id, m.id))
        .returning()) as [typeof m];
      await publishMessage(db, bus, pid, m);
    }
    const text = (m.text ?? m.transcription ?? '').trim();
    if (!text) return notifyApp('empty');

    // A clear "sim"/"não" to an open waitlist offer is settled by the waitlist itself.
    if (await deps.waitlist.handleClientReply(pid, row.client.id, text)) {
      await audit(db, pid, 'system', 'waitlist.reply_handled', { messageId: m.id });
      return { status: 'waitlist' };
    }

    // Step 5: AI off, paused, or the professional took over.
    const now = core.now();
    if (!aiActive(pro.p, now)) return notifyApp('ai_paused');
    if (row.conv.handler === 'human') return notifyApp('human_handler');
    if (!core.llm) return notifyApp('ai_unavailable');

    // Step 6: reduced context -> validated tool calls.
    const tz = pro.salon.timezone;
    const date = todayIn(tz, now);
    const [svc, day, upcoming, history, [known]] = await Promise.all([
      db
        .select()
        .from(services)
        .where(and(eq(services.professionalId, pid), eq(services.active, true)))
        .orderBy(asc(services.position)),
      core.agenda.getDay(pid, date),
      db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          name: appointmentServices.name,
        })
        .from(appointments)
        .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
        .where(
          and(
            eq(appointments.clientId, row.client.id),
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
            gt(appointments.startsAt, now),
          ),
        )
        .orderBy(asc(appointments.startsAt)),
      db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, row.conv.id),
            ne(messages.id, m.id),
            lt(messages.createdAt, new Date(m.createdAt.getTime() + 1)),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(10),
      db
        .select({ v: hadPastAppointment(row.client.id, now) })
        .from(clients)
        .where(eq(clients.id, row.client.id)),
    ]);
    const shortest = Math.min(...svc.map((s) => s.durationMin), 30);
    const free = await core.agenda.findFreeSlots(pid, date, shortest);
    const up = new Map<string, { id: string; startsAt: string; serviceNames: string[] }>();
    for (const u of upcoming) {
      const e = up.get(u.id) ?? { id: u.id, startsAt: u.startsAt.toISOString(), serviceNames: [] };
      if (u.name) e.serviceNames.push(u.name);
      up.set(u.id, e);
    }
    const isKnown = Boolean(known?.v);
    const ctx = buildContext({
      now: now.toISOString(),
      timezone: tz,
      professional: {
        professions: pro.p.professions,
        tone: pro.p.aiTone,
        autonomy: pro.p.autonomy,
        spaceName: pro.salon.name,
        address: pro.p.address,
      },
      client: { id: row.client.id, name: row.client.name, isKnown, upcoming: [...up.values()] },
      services: svc.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMin,
        priceCents: s.priceCents,
      })),
      day: {
        date,
        appointments: day.appointments.map((a) => ({
          id: a.id,
          clientId: a.clientId,
          clientName: a.clientName,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          serviceNames: a.services.map((s) => s.name),
          status: a.status,
        })),
        freeSlots: free.map((s) => s.startsAt),
      },
      history: history.reverse().flatMap((h) => {
        const t = h.text ?? h.transcription;
        return t ? [{ author: h.author, text: t, at: h.createdAt.toISOString() }] : [];
      }),
      message: { text, transcribedFromAudio: m.kind === 'audio' },
    });
    const turn = await interpretClientMessage(ctx, core.llm);
    [m] = (await db
      .update(messages)
      .set({ aiNote: turn.note })
      .where(eq(messages.id, m.id))
      .returning()) as [typeof m];
    await publishMessage(db, bus, pid, m);
    await audit(db, pid, 'ai', 'ai.interpreted', {
      messageId: m.id,
      tools: turn.calls.map((c) => c.name),
    });

    // Steps 7-8: rule engine; replies go through the send guard.
    await deps.tools.run({
      pro,
      client: { id: row.client.id, name: row.client.name, isKnown },
      conversationId: row.conv.id,
      messageId: m.id,
      turn,
    });
    return { status: 'processed' };
  }

  return { handleWebhook, process };
}
export type Inbound = ReturnType<typeof createInbound>;
