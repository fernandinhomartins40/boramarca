// Reminders (plan section 8): one delayed job per appointment at `starts_at - reminder_lead_minutes`,
// "responda 1 para confirmar". Rescheduling replaces the job, cancelling (or any status other than
// scheduled) removes it. The client's "1" goes through the normal inbound flow: the AI calls
// `confirmar_presenca`, which confirms when `confirm_reminders` is on.
import { eq } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { firstName, renderMessage } from '@boramarca/ia';
import type { AppointmentView } from '@boramarca/shared';
import { appointments } from '../../db/schema';
import { loadPro, type Core } from '../../lib/core';
import type { Outbox } from '../whatsapp/send';
import type { AppointmentChangedHookEvent } from './service';

export interface ReminderJob {
  professionalId: string;
  appointmentId: string;
  /** The start the reminder was scheduled for: a moved appointment makes the job stale. */
  startsAt: string;
}

export const reminderJobId = (appointmentId: string) => `reminder-${appointmentId}`;

export function createReminders(core: Core, deps: { outbox: Outbox }) {
  const { db, queues } = core;
  const queue = queues.queues.reminders;

  const remove = (appointmentId: string) =>
    queue.remove(reminderJobId(appointmentId)).catch(() => 0);

  /** (Re)schedules the reminder of a scheduled appointment; past lead time = no reminder. */
  async function schedule(a: Pick<AppointmentView, 'id' | 'professionalId' | 'startsAt'>) {
    await remove(a.id);
    const pro = await loadPro(db, a.professionalId);
    const lead = pro.p.reminderLeadMinutes;
    if (lead <= 0) return null;
    const delay = new Date(a.startsAt).getTime() - lead * 60_000 - core.now().getTime();
    if (delay < 0) return null;
    const data: ReminderJob = {
      professionalId: a.professionalId,
      appointmentId: a.id,
      startsAt: a.startsAt,
    };
    return queue.add('reminder', data, { jobId: reminderJobId(a.id), delay });
  }

  /** Agenda hook: created/rescheduled -> schedule; cancelled or confirmed/done/... -> remove. */
  async function onAppointmentChanged(e: AppointmentChangedHookEvent) {
    const a = e.appointment;
    if (a.status === 'scheduled' && (e.change === 'created' || e.change === 'rescheduled'))
      await schedule(a);
    else if (a.status !== 'scheduled') await remove(a.id);
  }

  async function send(data: ReminderJob) {
    const [a] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
    if (!a || a.status !== 'scheduled' || a.startsAt.toISOString() !== data.startsAt)
      return { status: 'stale' };
    const pro = await loadPro(db, a.professionalId);
    const view = await core.agenda.getAppointment(a.professionalId, a.id);
    const text = renderMessage('reminder', pro.p.aiTone, {
      now: core.now().toISOString(),
      timezone: pro.salon.timezone,
      clientFirstName: firstName(view.clientName),
      startsAt: view.startsAt,
      serviceName: view.services.map((s) => s.name).join(' + ') || undefined,
    });
    const m = await deps.outbox.enqueue({
      professionalId: a.professionalId,
      clientId: a.clientId,
      text,
      purpose: 'reminder',
      author: 'ai',
    });
    if (!m) return { status: 'no_session' };
    await core.agenda.addEvent(
      { professionalId: a.professionalId, actor: 'system' },
      a.id,
      'reminder_sent',
      'Lembrete enviado pelo WhatsApp',
    );
    return { status: 'sent' };
  }

  return {
    schedule,
    remove,
    onAppointmentChanged,
    send,
    process: (job: Job<ReminderJob>) => send(job.data),
  };
}
export type Reminders = ReturnType<typeof createReminders>;
