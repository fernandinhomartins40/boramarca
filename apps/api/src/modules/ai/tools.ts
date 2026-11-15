// Rule engine for the AI's tool calls (plan sections 5 and 6). The AI never writes: this code
// checks ownership of every id, applies the autonomy and either runs the action through the agenda
// or turns it into a Decision for the professional.
import { and, eq, inArray } from 'drizzle-orm';
import { askProfessionalFallback, firstName, formatWhen, renderMessage } from '@boramarca/ia';
import type { AgendaActionCall, AiToolCall, AiTurnResult, DecisionType } from '@boramarca/shared';
import { appointments, clients, services } from '../../db/schema';
import { audit } from '../../lib/audit';
import type { Core, ProRow } from '../../lib/core';
import { AppError } from '../../lib/errors';
import type { Decisions } from '../decisions/service';
import type { Notify } from '../devices/notify';
import type { Outbox } from '../whatsapp/send';
import { executeAction } from './actions';

export interface TurnInput {
  pro: ProRow;
  client: { id: string; name: string; isKnown: boolean };
  conversationId: string;
  messageId: string;
  turn: AiTurnResult;
}

/** Every id the model referenced, by kind (nested Decision options included). */
export function collectIds(calls: AiToolCall[]) {
  const ids = {
    appointments: new Set<string>(),
    services: new Set<string>(),
    clients: new Set<string>(),
  };
  const visit = (c: AiToolCall | AgendaActionCall) => {
    switch (c.name) {
      case 'buscar_vagas':
      case 'marcar':
        c.arguments.serviceIds.forEach((s) => ids.services.add(s));
        break;
      case 'remarcar':
      case 'cancelar':
      case 'confirmar_presenca':
        ids.appointments.add(c.arguments.appointmentId);
        break;
      case 'enviar_whatsapp':
        ids.clients.add(c.arguments.clientId);
        break;
      case 'entrar_lista_de_espera':
        if (c.arguments.serviceId) ids.services.add(c.arguments.serviceId);
        break;
      case 'perguntar_ao_profissional':
        if (c.arguments.proposedAction) visit(c.arguments.proposedAction);
        c.arguments.options.forEach((o) => o.action && visit(o.action));
        break;
    }
  };
  calls.forEach(visit);
  return ids;
}

export function createToolRunner(
  core: Core,
  deps: { outbox: Outbox; decisions: Decisions; notify: Notify },
) {
  const { db } = core;

  /** Ids that do not belong to this professional (or do not exist). */
  async function foreignIds(professionalId: string, calls: AiToolCall[]) {
    const ids = collectIds(calls);
    const bad: string[] = [];
    const check = async (set: Set<string>, q: (list: string[]) => Promise<{ id: string }[]>) => {
      if (!set.size) return;
      const found = new Set((await q([...set])).map((r) => r.id));
      for (const id of set) if (!found.has(id)) bad.push(id);
    };
    await check(ids.appointments, (l) =>
      db
        .select({ id: appointments.id })
        .from(appointments)
        .where(and(eq(appointments.professionalId, professionalId), inArray(appointments.id, l))),
    );
    await check(ids.services, (l) =>
      db
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.professionalId, professionalId), inArray(services.id, l))),
    );
    await check(ids.clients, (l) =>
      db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.professionalId, professionalId), inArray(clients.id, l))),
    );
    return bad;
  }

  async function appointmentInfo(professionalId: string, id: string) {
    const [a] = await db
      .select({
        clientId: appointments.clientId,
        startsAt: appointments.startsAt,
        clientName: clients.name,
      })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .where(and(eq(appointments.id, id), eq(appointments.professionalId, professionalId)));
    return a!; // ownership already checked
  }

  /** Does any action of a perguntar_ao_profissional touch a client other than this one? */
  async function touchesOtherClient(
    professionalId: string,
    clientId: string,
    a: Extract<AiToolCall, { name: 'perguntar_ao_profissional' }>['arguments'],
  ) {
    for (const act of [a.proposedAction, ...a.options.map((o) => o.action)]) {
      if (!act) continue;
      if (act.name === 'enviar_whatsapp' && act.arguments.clientId !== clientId) return true;
      if (act.name === 'remarcar' || act.name === 'cancelar' || act.name === 'confirmar_presenca')
        if (
          (await appointmentInfo(professionalId, act.arguments.appointmentId)).clientId !== clientId
        )
          return true;
    }
    return false;
  }

  async function run(input: TurnInput) {
    const { pro, client } = input;
    const pid = pro.p.id;
    const autonomy = pro.p.autonomy;
    const tz = pro.salon.timezone;
    const nowIso = core.now().toISOString();
    const first = firstName(client.name);
    const when = (iso: string) => formatWhen(iso, nowIso, tz);
    let calls = input.turn.calls;

    const bad = await foreignIds(pid, calls);
    if (bad.length) {
      // The model referenced something that is not this professional's: run nothing.
      await audit(db, pid, 'ai', 'ai.tool_rejected', {
        reason: 'foreign_id',
        ids: bad,
        tools: calls.map((c) => c.name),
        messageId: input.messageId,
      });
      calls = askProfessionalFallback(first, 'referência inválida').calls;
    }

    const aiReplies: string[] = [];
    const holding: string[] = [];
    const standard: string[] = [];
    /** Something the AI may have promised did not happen as-is: its own reply is not sent. */
    let promiseBroken = false;

    const ask = async (
      type: DecisionType,
      question: string,
      action: AgendaActionCall,
      reason: string,
    ) => {
      promiseBroken = true;
      await audit(db, pid, 'ai', 'ai.action_needs_decision', { tool: action.name, reason });
      await deps.decisions.create({
        pro,
        conversationId: input.conversationId,
        clientId: client.id,
        type,
        question,
        options: [
          { id: 'sim', label: 'Sim', action },
          { id: 'nao', label: 'Não', action: null },
        ],
        proposedAction: action,
        extra: { reason },
      });
    };

    const execute = async (action: AgendaActionCall, notifyProfessional?: string) => {
      try {
        const out = await executeAction(core, pro, client.id, action, 'ai', input.messageId);
        await audit(db, pid, 'ai', 'ai.action_executed', {
          tool: action.name,
          appointmentId: out.appointment?.id ?? null,
          messageId: input.messageId,
        });
        if (out.message && out.messageTo === client.id) standard.push(out.message);
        if (notifyProfessional)
          await deps.notify(pid, 'ai_action', { title: notifyProfessional, body: out.spoken });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        promiseBroken = true;
        await audit(db, pid, 'ai', 'ai.action_failed', { tool: action.name, code: err.code });
        standard.push(
          renderMessage('decision_answer', pro.p.aiTone, {
            now: nowIso,
            timezone: tz,
            clientFirstName: first,
          }),
        );
      }
    };

    for (const call of calls) {
      switch (call.name) {
        case 'listar_agenda':
        case 'buscar_vagas':
          // Read-only: the context already carries the day and the free slots.
          await audit(db, pid, 'ai', 'ai.tool_read', { tool: call.name });
          break;
        case 'responder_cliente':
          aiReplies.push(call.arguments.text);
          break;
        case 'enviar_whatsapp':
          if (call.arguments.clientId === client.id) aiReplies.push(call.arguments.text);
          // change_other_client is locked: messaging someone else always asks.
          else {
            const [o] = await db
              .select({ name: clients.name })
              .from(clients)
              .where(eq(clients.id, call.arguments.clientId));
            await ask(
              'duvida',
              `${first} quer que eu mande uma mensagem para ${firstName(o!.name)}: "${call.arguments.text.slice(0, 120)}". Posso mandar?`,
              call,
              'change_other_client',
            );
          }
          break;
        case 'marcar': {
          const a = call.arguments;
          const type: DecisionType = a.isFitIn ? 'encaixe' : 'novo_horario';
          if (autonomy.book_free_slot_known_client && client.isKnown && !a.isFitIn)
            await execute(call);
          else
            await ask(
              type,
              `${first} quer horário ${when(a.startsAt)}. Posso marcar?`,
              call,
              a.isFitIn ? 'fit_in' : client.isKnown ? 'autonomy_off' : 'new_client',
            );
          break;
        }
        case 'remarcar':
        case 'cancelar':
        case 'confirmar_presenca': {
          const appt = await appointmentInfo(pid, call.arguments.appointmentId);
          const other = appt.clientId !== client.id;
          const whose = other ? `de ${firstName(appt.clientName)} ` : '';
          if (call.name === 'remarcar') {
            if (!other && autonomy.book_free_slot_known_client && client.isKnown)
              await execute(call);
            else
              await ask(
                'remarcar',
                `${first} quer mudar o horário ${whose}de ${when(appt.startsAt.toISOString())} para ${when(call.arguments.startsAt)}. Posso?`,
                call,
                other ? 'change_other_client' : 'autonomy_off',
              );
          } else if (call.name === 'cancelar') {
            if (!other && autonomy.cancel_on_request)
              await execute(call, `${first} cancelou ${when(appt.startsAt.toISOString())}`);
            else
              await ask(
                'duvida',
                `${first} pediu para cancelar o horário ${whose}${when(appt.startsAt.toISOString())}. Posso cancelar?`,
                call,
                other ? 'change_other_client' : 'autonomy_off',
              );
          } else if (!other && autonomy.confirm_reminders) await execute(call);
          else
            await ask(
              'duvida',
              `${first} quer confirmar a presença ${whose}${when(appt.startsAt.toISOString())}. Confirmo?`,
              call,
              other ? 'change_other_client' : 'autonomy_off',
            );
          break;
        }
        case 'entrar_lista_de_espera':
          await execute(call);
          break;
        case 'perguntar_ao_profissional': {
          let a = call.arguments;
          // The question and labels are the model's words: an option must not act on someone
          // else (a crafted "Bia confirma?" whose "Sim" cancels Carla). Those go through `ask` (M7).
          if (await touchesOtherClient(pid, client.id, a)) {
            await audit(db, pid, 'ai', 'ai.tool_rejected', {
              reason: 'other_client',
              tools: [call.name],
              messageId: input.messageId,
            });
            const fb = askProfessionalFallback(first, 'pedido sobre outro cliente').calls[0]!;
            if (fb.name !== 'perguntar_ao_profissional') break;
            a = fb.arguments;
          }
          await deps.decisions.create({
            pro,
            conversationId: input.conversationId,
            clientId: client.id,
            type: a.type,
            question: a.question,
            options: a.options,
            proposedAction: a.proposedAction,
          });
          if (a.holdingReply) holding.push(a.holdingReply);
          break;
        }
      }
    }

    const texts = [...(promiseBroken ? [] : aiReplies), ...holding];
    if (texts.length === 0) texts.push(...standard);
    else if (promiseBroken) texts.unshift(...standard);
    const text = [...new Set(texts)].join('\n\n').trim();
    if (text)
      await deps.outbox.enqueue({
        professionalId: pid,
        clientId: client.id,
        text,
        purpose: 'reply',
        author: 'ai',
      });
  }

  return { run, foreignIds };
}
export type ToolRunner = ReturnType<typeof createToolRunner>;
