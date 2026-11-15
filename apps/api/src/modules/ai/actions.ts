// Runs one agenda action (an AI tool call, or the action of an answered Decision). Every agenda
// write goes through createAgenda (app.agenda), which re-checks ownership and conflicts.
import { and, eq } from 'drizzle-orm';
import { firstName, formatWhen, renderMessage } from '@boramarca/ia';
import type { Actor, AgendaActionCall, AppointmentView } from '@boramarca/shared';
import { services, waitlistEntries } from '../../db/schema';
import { audit } from '../../lib/audit';
import type { Core, ProRow } from '../../lib/core';
import { AppError } from '../../lib/errors';

export interface ActionOutcome {
  appointment: AppointmentView | null;
  /** Client to message, and the standard text for it (null = nothing to send). */
  messageTo: string | null;
  message: string | null;
  /** Sentence spoken back to the professional ("Marquei Fulano hoje às 14h20"). */
  spoken: string;
}

export async function executeAction(
  core: Core,
  pro: ProRow,
  /** The client of the conversation/Decision (`marcar`, `responder_cliente` act on them). */
  ownClientId: string | null,
  action: AgendaActionCall,
  actor: Actor,
  sourceMessageId: string | null = null,
): Promise<ActionOutcome> {
  const { agenda } = core;
  const pid = pro.p.id;
  const ctx = { professionalId: pid, actor };
  const tz = pro.salon.timezone;
  const now = core.now().toISOString();
  const tone = pro.p.aiTone;
  const when = (iso: string) => formatWhen(iso, now, tz);
  const text = (kind: Parameters<typeof renderMessage>[0], v: AppointmentView, prev?: string) =>
    renderMessage(kind, tone, {
      now,
      timezone: tz,
      clientFirstName: firstName(v.clientName),
      startsAt: v.startsAt,
      previousStartsAt: prev,
      serviceName: v.services.map((s) => s.name).join(' + ') || undefined,
    });
  const needClient = () => {
    if (!ownClientId) throw new AppError(400, 'CLIENT_REQUIRED', 'Essa decisão não tem cliente');
    return ownClientId;
  };

  switch (action.name) {
    case 'marcar': {
      const a = action.arguments;
      const v = await agenda.book(ctx, {
        clientId: needClient(),
        serviceIds: a.serviceIds,
        startsAt: a.startsAt,
        isFitIn: a.isFitIn,
      });
      return {
        appointment: v,
        messageTo: v.clientId,
        message: text('booking_confirmation', v),
        spoken: `Marquei ${firstName(v.clientName)} ${when(v.startsAt)}.`,
      };
    }
    case 'remarcar': {
      const before = await agenda.getAppointment(pid, action.arguments.appointmentId);
      const v = await agenda.reschedule(ctx, before.id, { startsAt: action.arguments.startsAt });
      return {
        appointment: v,
        messageTo: v.clientId,
        message: text('reschedule', v, before.startsAt),
        spoken: `Remarquei ${firstName(v.clientName)} para ${when(v.startsAt)}.`,
      };
    }
    case 'cancelar': {
      const v = await agenda.cancel(ctx, action.arguments.appointmentId, {
        reason: action.arguments.reason,
      });
      return {
        appointment: v,
        messageTo: v.clientId,
        message: text('cancellation', v),
        spoken: `Cancelei o horário de ${firstName(v.clientName)} ${when(v.startsAt)}.`,
      };
    }
    case 'confirmar_presenca': {
      const v = await agenda.confirm(ctx, action.arguments.appointmentId);
      return {
        appointment: v,
        messageTo: null,
        message: null,
        spoken: `Confirmei ${firstName(v.clientName)}.`,
      };
    }
    case 'enviar_whatsapp':
      return {
        appointment: null,
        messageTo: action.arguments.clientId,
        message: action.arguments.text,
        spoken: 'Mensagem enviada.',
      };
    case 'responder_cliente':
      return {
        appointment: null,
        messageTo: needClient(),
        message: action.arguments.text,
        spoken: 'Respondi o cliente.',
      };
    case 'entrar_lista_de_espera': {
      const clientId = needClient();
      const { serviceId, preference } = action.arguments;
      if (serviceId) {
        const [s] = await core.db
          .select({ id: services.id })
          .from(services)
          .where(and(eq(services.id, serviceId), eq(services.professionalId, pid)));
        if (!s) throw new AppError(400, 'UNKNOWN_SERVICE', 'Serviço não encontrado');
      }
      const [entry] = await core.db
        .insert(waitlistEntries)
        .values({
          professionalId: pid,
          clientId,
          serviceId,
          preference,
          optedInAt: core.now(),
          sourceMessageId,
        })
        .returning({ id: waitlistEntries.id });
      await audit(core.db, pid, actor, 'waitlist.joined', {
        entryId: entry!.id,
        clientId,
        sourceMessageId,
      });
      return {
        appointment: null,
        messageTo: null,
        message: null,
        spoken: 'Coloquei na lista de espera.',
      };
    }
  }
}
