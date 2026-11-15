// Decisions (plan sections 1 and 5): what the AI may not do alone becomes a question for the
// professional, with a deadline. Never books by timeout.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { firstName, interpretProfessionalAnswer, renderMessage } from '@boramarca/ia';
import {
  DECISION_NOTIFICATION_CATEGORY_ID,
  DECISION_NOTIFICATION_CHANNEL_ID,
  DEFAULT_DECISION_DEADLINE_MINUTES,
  type AgendaActionCall,
  type AnswerVia,
  type AppointmentView,
  type DecisionAnswerBody,
  type DecisionAnswerResponse,
  type DecisionOption,
  type DecisionType,
  type DecisionView,
  type ProfessionalAnswer,
} from '@boramarca/shared';
import { aiDecisions, clients, conversations, messages } from '../../db/schema';
import { audit } from '../../lib/audit';
import { aiActive, loadPro, type Core, type ProRow } from '../../lib/core';
import { AppError, notFound } from '../../lib/errors';
import { realtimeEvent } from '../../lib/event-bus';
import { wire } from '../../lib/serialize';
import { executeAction } from '../ai/actions';
import { publishConversation } from '../conversations/views';
import type { Notify } from '../devices/notify';
import type { Outbox } from '../whatsapp/send';

type DecisionRow = typeof aiDecisions.$inferSelect;
const MIN = 60_000;
const TAKE_OVER_LABEL = /eu respondo|assum|deixa que eu/i;

export interface NewDecision {
  pro: ProRow;
  conversationId: string | null;
  clientId: string | null;
  type: DecisionType;
  question: string;
  options: DecisionOption[];
  proposedAction: AgendaActionCall | null;
  extra?: Record<string, unknown>;
}

export function createDecisions(core: Core, deps: { outbox: Outbox; notify: Notify }) {
  const { db, queues, bus } = core;
  const createdHooks = new Set<(d: DecisionView) => unknown>();
  const deadlineMin = core.config.DECISION_DEADLINE_MINUTES ?? DEFAULT_DECISION_DEADLINE_MINUTES;

  async function view(professionalId: string, id: string): Promise<DecisionView> {
    const [r] = await db
      .select({ d: aiDecisions, clientName: clients.name })
      .from(aiDecisions)
      .leftJoin(clients, eq(clients.id, aiDecisions.clientId))
      .where(and(eq(aiDecisions.id, id), eq(aiDecisions.professionalId, professionalId)));
    if (!r) throw notFound('Decisão');
    return { ...wire(r.d), clientName: r.clientName };
  }

  async function list(professionalId: string, status: 'pending' | 'resolved', limit: number) {
    const rows = await db
      .select({ d: aiDecisions, clientName: clients.name })
      .from(aiDecisions)
      .leftJoin(clients, eq(clients.id, aiDecisions.clientId))
      .where(
        and(
          eq(aiDecisions.professionalId, professionalId),
          status === 'pending'
            ? eq(aiDecisions.status, 'pending')
            : inArray(aiDecisions.status, ['resolved', 'expired']),
        ),
      )
      .orderBy(status === 'pending' ? asc(aiDecisions.deadlineAt) : desc(aiDecisions.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...wire(r.d), clientName: r.clientName }));
  }

  const timedStart = (a: AgendaActionCall | null) =>
    a?.name === 'marcar' || a?.name === 'remarcar' ? a.arguments.startsAt : null;

  async function removeJobs(id: string) {
    await Promise.allSettled([
      queues.queues.decisions.remove(`timeout-${id}`),
      queues.queues.decisions.remove(`expire-${id}`),
    ]);
  }

  async function create(input: NewDecision): Promise<DecisionView> {
    const now = core.now();
    const pid = input.pro.p.id;
    let clientFirstName = 'Cliente';
    if (input.clientId) {
      const [c] = await db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, input.clientId));
      if (c) clientFirstName = firstName(c.name);
    }
    const recent = input.conversationId
      ? await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, input.conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(10)
      : [];
    const [row] = await db
      .insert(aiDecisions)
      .values({
        professionalId: pid,
        conversationId: input.conversationId,
        clientId: input.clientId,
        type: input.type,
        question: input.question.slice(0, 300),
        options: input.options,
        proposedAction: input.proposedAction,
        context: {
          clientFirstName,
          messages: recent.reverse().flatMap((m) =>
            (m.text ?? m.transcription)
              ? [
                  {
                    author: m.author,
                    text: (m.text ?? m.transcription)!,
                    at: m.createdAt.toISOString(),
                  },
                ]
              : [],
          ),
          extra: input.extra,
        },
        deadlineAt: new Date(now.getTime() + deadlineMin * MIN),
      })
      .returning();
    const d = row!;
    await queues.queues.decisions.add(
      'timeout',
      { decisionId: d.id, professionalId: pid },
      { jobId: `timeout-${d.id}`, delay: deadlineMin * MIN },
    );
    const start = timedStart(d.proposedAction);
    if (start)
      await queues.queues.decisions.add(
        'expire',
        { decisionId: d.id, professionalId: pid },
        { jobId: `expire-${d.id}`, delay: Math.max(0, new Date(start).getTime() - now.getTime()) },
      );
    await audit(db, pid, 'ai', 'decision.created', {
      decisionId: d.id,
      type: d.type,
      clientId: d.clientId,
    });
    const v = await view(pid, d.id);
    await bus.publish(pid, realtimeEvent('decision.created', { decision: v })).catch(() => {});
    await deps.notify(pid, 'decision', {
      title: v.question,
      body: v.options.map((o) => o.label).join(' · '),
      categoryId: DECISION_NOTIFICATION_CATEGORY_ID,
      channelId: DECISION_NOTIFICATION_CHANNEL_ID,
      data: {
        type: 'decision',
        decisionId: v.id,
        options: v.options.map((o) => ({ id: o.id, label: o.label })),
      },
    });
    for (const h of createdHooks)
      await Promise.resolve(h(v)).catch((err: unknown) =>
        core.log.error({ err }, 'decision hook failed'),
      );
    return v;
  }

  async function ownPending(professionalId: string, id: string) {
    const [d] = await db
      .select()
      .from(aiDecisions)
      .where(and(eq(aiDecisions.id, id), eq(aiDecisions.professionalId, professionalId)));
    if (!d) throw notFound('Decisão');
    if (d.status !== 'pending')
      throw new AppError(409, 'DECISION_CLOSED', 'Essa decisão já foi resolvida');
    return d;
  }

  /** Marks it resolved only if still pending (two answers at once: one wins). */
  async function claim(d: DecisionRow, set: Partial<typeof aiDecisions.$inferInsert>) {
    const [r] = await db
      .update(aiDecisions)
      .set({ status: 'resolved', ...set })
      .where(and(eq(aiDecisions.id, d.id), eq(aiDecisions.status, 'pending')))
      .returning({ id: aiDecisions.id });
    if (!r) throw new AppError(409, 'DECISION_CLOSED', 'Essa decisão já foi resolvida');
  }
  const unclaim = (d: DecisionRow) =>
    db
      .update(aiDecisions)
      .set({ status: 'pending', resolvedVia: null, resolvedOption: null, resolvedText: null })
      .where(eq(aiDecisions.id, d.id));

  async function finish(pid: string, d: DecisionRow, payload: Record<string, unknown>) {
    await removeJobs(d.id);
    await audit(db, pid, 'professional', 'decision.answered', { decisionId: d.id, ...payload });
    const v = await view(pid, d.id);
    await bus.publish(pid, realtimeEvent('decision.resolved', { decision: v })).catch(() => {});
    return v;
  }

  async function handoff(pid: string, conversationId: string | null, handler: 'ai' | 'human') {
    if (!conversationId) return;
    await db
      .update(conversations)
      .set({ handler })
      .where(and(eq(conversations.id, conversationId), eq(conversations.professionalId, pid)));
    await audit(db, pid, 'professional', 'conversation.handoff', { conversationId, handler });
    await publishConversation(db, bus, pid, conversationId);
  }

  /** POST /decisions/:id/answer — voice, notification, app and Alexa all come here. */
  async function answer(
    professionalId: string,
    id: string,
    body: DecisionAnswerBody,
  ): Promise<DecisionAnswerResponse> {
    const pro = await loadPro(db, professionalId);
    const d = await ownPending(professionalId, id);
    const via: AnswerVia = body.via;
    let ans: ProfessionalAnswer;
    if ('optionId' in body) {
      const opt = d.options.find((o) => o.id === body.optionId);
      if (!opt) throw new AppError(400, 'UNKNOWN_OPTION', 'Opção não encontrada');
      ans = opt.action
        ? { kind: 'accept', optionId: opt.id, action: opt.action, source: 'rule' }
        : TAKE_OVER_LABEL.test(opt.label)
          ? { kind: 'take_over', source: 'rule' }
          : { kind: 'decline', optionId: opt.id, action: null, source: 'rule' };
    } else {
      ans = await interpretProfessionalAnswer(d, body.text, {
        now: core.now().toISOString(),
        timezone: pro.salon.timezone,
        llm: core.llm ?? undefined,
      });
    }
    if (ans.kind === 'unknown')
      throw new AppError(422, 'ANSWER_NOT_UNDERSTOOD', 'Não entendi a resposta. Pode repetir?');

    const optionId = ans.kind === 'accept' || ans.kind === 'decline' ? ans.optionId : 'take_over';
    await claim(d, {
      resolvedVia: via,
      resolvedOption: optionId,
      resolvedText: 'text' in body ? body.text : null,
    });

    let spoken = 'Certo.';
    let sent: string | null = null;
    let appointment: AppointmentView | null = null;
    try {
      if (ans.kind === 'take_over') {
        await handoff(professionalId, d.conversationId, 'human');
        spoken = 'Combinado, a conversa é sua.';
      } else if (ans.action) {
        const out = await executeAction(core, pro, d.clientId, ans.action, 'ai');
        appointment = out.appointment;
        spoken = out.spoken;
        if (out.messageTo && out.message) {
          await deps.outbox.enqueue({
            professionalId,
            clientId: out.messageTo,
            text: out.message,
            purpose: 'reply',
            author: 'ai',
          });
          sent = out.message;
        }
      } else if (ans.kind === 'decline' && d.clientId) {
        const first = d.context.clientFirstName;
        sent = renderMessage('decision_answer', pro.p.aiTone, {
          now: core.now().toISOString(),
          timezone: pro.salon.timezone,
          clientFirstName: first,
        });
        await deps.outbox.enqueue({
          professionalId,
          clientId: d.clientId,
          text: sent,
          purpose: 'reply',
          author: 'ai',
        });
        spoken = `Certo, avisei ${first}.`;
      }
    } catch (err) {
      await unclaim(d);
      await audit(db, professionalId, 'professional', 'decision.answer_failed', {
        decisionId: d.id,
        code: (err as { code?: string }).code ?? 'ERROR',
      });
      throw err;
    }
    const v = await finish(professionalId, d, {
      via,
      kind: ans.kind,
      optionId,
      source: ans.source,
    });
    return {
      decision: v,
      spokenConfirmation: spoken,
      clientMessagePreview: pro.p.skipMessagePreview ? null : sent,
      appointment,
    };
  }

  /** POST /decisions/:id/take-over ("Deixa que eu respondo"). */
  async function takeOver(professionalId: string, id: string) {
    const d = await ownPending(professionalId, id);
    await claim(d, { resolvedVia: 'app', resolvedOption: 'take_over' });
    await handoff(professionalId, d.conversationId, 'human');
    const v = await finish(professionalId, d, { via: 'app', kind: 'take_over' });
    return { decision: v, conversationId: d.conversationId };
  }

  /** The assistant may still talk to this client: AI on and the conversation not taken over (B9). */
  async function aiMayReply(d: DecisionRow, pro: ProRow) {
    if (!d.clientId || !aiActive(pro.p, core.now())) return false;
    if (!d.conversationId) return true;
    const [c] = await db
      .select({ handler: conversations.handler })
      .from(conversations)
      .where(eq(conversations.id, d.conversationId));
    return c?.handler !== 'human';
  }

  /** Deadline passed: neutral reply to the client, the Decision stays pending (plan rule 2). */
  async function handleTimeout(decisionId: string) {
    const [d] = await db.select().from(aiDecisions).where(eq(aiDecisions.id, decisionId));
    if (!d || d.status !== 'pending' || d.timeoutNotifiedAt) return;
    const pro = await loadPro(db, d.professionalId);
    await db
      .update(aiDecisions)
      .set({ timeoutNotifiedAt: core.now() })
      .where(eq(aiDecisions.id, d.id));
    if (await aiMayReply(d, pro))
      await deps.outbox.enqueue({
        professionalId: d.professionalId,
        clientId: d.clientId!,
        text: renderMessage('hold', pro.p.aiTone, {
          now: core.now().toISOString(),
          timezone: pro.salon.timezone,
        }),
        purpose: 'reply',
        author: 'ai',
      });
    await audit(db, d.professionalId, 'system', 'decision.timeout', { decisionId: d.id });
    await deps.notify(d.professionalId, 'decision_timeout', {
      title: `${d.context.clientFirstName} ainda espera sua resposta`,
      body: d.question,
      categoryId: DECISION_NOTIFICATION_CATEGORY_ID,
      channelId: DECISION_NOTIFICATION_CHANNEL_ID,
      data: {
        type: 'decision',
        decisionId: d.id,
        options: d.options.map((o) => ({ id: o.id, label: o.label })),
      },
    });
  }

  /** The proposed time passed or stopped being free: expired, and the client is told. */
  async function handleExpire(
    decisionId: string,
    reason: 'time_passed' | 'slot_taken' = 'time_passed',
  ) {
    const [d] = await db
      .update(aiDecisions)
      .set({ status: 'expired', resolvedVia: 'timeout' })
      .where(and(eq(aiDecisions.id, decisionId), eq(aiDecisions.status, 'pending')))
      .returning();
    if (!d) return;
    await removeJobs(d.id);
    const pro = await loadPro(db, d.professionalId);
    if (await aiMayReply(d, pro))
      await deps.outbox.enqueue({
        professionalId: d.professionalId,
        clientId: d.clientId!,
        text: renderMessage('decision_expired', pro.p.aiTone, {
          now: core.now().toISOString(),
          timezone: pro.salon.timezone,
          clientFirstName: d.context.clientFirstName,
          startsAt: timedStart(d.proposedAction) ?? undefined,
        }),
        purpose: 'reply',
        author: 'ai',
      });
    await audit(db, d.professionalId, 'system', 'decision.expired', { decisionId: d.id, reason });
    const v = await view(d.professionalId, d.id);
    await bus
      .publish(d.professionalId, realtimeEvent('decision.resolved', { decision: v }))
      .catch(() => {});
  }

  /** A new/moved appointment took the time a pending Decision proposes: it expires. */
  async function expireConflicting(professionalId: string, a: AppointmentView) {
    const pending = await db
      .select()
      .from(aiDecisions)
      .where(
        and(eq(aiDecisions.professionalId, professionalId), eq(aiDecisions.status, 'pending')),
      );
    const aStart = new Date(a.startsAt).getTime();
    const aEnd = new Date(a.endsAt).getTime();
    for (const d of pending) {
      const p = d.proposedAction;
      if (p?.name !== 'marcar' && p?.name !== 'remarcar') continue;
      if (p.name === 'remarcar' && p.arguments.appointmentId === a.id) continue;
      let minutes: number;
      try {
        minutes =
          p.name === 'marcar'
            ? await core.agenda.servicesDuration(professionalId, p.arguments.serviceIds)
            : await core.agenda
                .getAppointment(professionalId, p.arguments.appointmentId)
                .then((x) => (new Date(x.endsAt).getTime() - new Date(x.startsAt).getTime()) / MIN);
      } catch {
        continue;
      }
      const s = new Date(p.arguments.startsAt).getTime();
      if (s < aEnd && s + minutes * MIN > aStart) await handleExpire(d.id, 'slot_taken');
    }
  }

  async function process(job: Job<{ decisionId: string }>) {
    if (job.name === 'timeout') return handleTimeout(job.data.decisionId);
    if (job.name === 'expire') return handleExpire(job.data.decisionId);
  }

  return {
    create,
    view,
    list,
    answer,
    takeOver,
    handleTimeout,
    handleExpire,
    expireConflicting,
    process,
    /** Extension point (Alexa/Voice Monkey announcement, agent C4). Returns unsubscribe. */
    onCreated(fn: (d: DecisionView) => unknown) {
      createdHooks.add(fn);
      return () => createdHooks.delete(fn);
    },
  };
}
export type Decisions = ReturnType<typeof createDecisions>;
