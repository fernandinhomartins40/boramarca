import { z } from 'zod';
import { Cents, DateOnly, EntityBase, Id, IsoDateTime } from './common';
import { Actor } from './audit';
import { Client, ClientCreate } from './clients';
import { TimeOff, WorkingHours } from './schedule';

export const AppointmentStatus = z.enum([
  'scheduled',
  'confirmed',
  'in_service',
  'done',
  'cancelled',
  'no_show',
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;

/** Statuses that hold the time slot (covered by the Postgres exclusion constraint). */
export const ACTIVE_APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'in_service',
] as const satisfies readonly AppointmentStatus[];

export const AppointmentOrigin = z.enum(['ai', 'professional']);
export type AppointmentOrigin = z.infer<typeof AppointmentOrigin>;

export const Appointment = EntityBase.extend({
  professionalId: Id,
  clientId: Id,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  status: AppointmentStatus,
  origin: AppointmentOrigin,
  isFitIn: z.boolean(),
  priceCents: Cents,
  cancelReason: z.string().max(200).nullable(),
});
export type Appointment = z.infer<typeof Appointment>;

/** `appointment_services`: copy of the service at booking time. */
export const AppointmentServiceItem = EntityBase.extend({
  appointmentId: Id,
  serviceId: Id.nullable(),
  name: z.string(),
  durationMin: z.number().int().positive(),
  priceCents: Cents,
});
export type AppointmentServiceItem = z.infer<typeof AppointmentServiceItem>;

export const AppointmentEventType = z.enum([
  'requested',
  'ai_offered',
  'booked',
  'confirmed',
  'rescheduled',
  'cancelled',
  'arrived',
  'done',
  'no_show',
  'reminder_sent',
  'delay_notice_sent',
  'decision_answered',
]);
export type AppointmentEventType = z.infer<typeof AppointmentEventType>;

/** `appointment_events`: feeds the short history on the detail screen. */
export const AppointmentEvent = EntityBase.extend({
  appointmentId: Id,
  type: AppointmentEventType,
  /** pt-BR, ready to show: "IA ofereceu 15:00", "Você confirmou por voz". */
  description: z.string(),
  actor: Actor,
});
export type AppointmentEvent = z.infer<typeof AppointmentEvent>;

/** What lists and the timeline show: the appointment with client name and services. */
export const AppointmentView = Appointment.extend({
  clientName: z.string(),
  services: z.array(
    AppointmentServiceItem.pick({
      serviceId: true,
      name: true,
      durationMin: true,
      priceCents: true,
    }),
  ),
});
export type AppointmentView = z.infer<typeof AppointmentView>;

// ---- GET /appointments/:id
export const AppointmentDetail = AppointmentView.extend({
  client: Client,
  events: z.array(AppointmentEvent),
});
export type AppointmentDetail = z.infer<typeof AppointmentDetail>;

// ---- GET /agenda?date=
export const AgendaQuery = z.object({ date: DateOnly });
export type AgendaQuery = z.infer<typeof AgendaQuery>;

export const AgendaSummary = z.object({
  appointmentsCount: z.number().int().nonnegative(),
  freeSlotsCount: z.number().int().nonnegative(),
  expectedRevenueCents: Cents,
});
export type AgendaSummary = z.infer<typeof AgendaSummary>;

export const AgendaResponse = z.object({
  date: DateOnly,
  timezone: z.string(),
  workingHours: WorkingHours.nullable(),
  timeOff: z.array(TimeOff),
  /** Includes cancelled ones so the timeline can show "Carlos desmarcou há 3 min". */
  appointments: z.array(AppointmentView),
  summary: AgendaSummary,
});
export type AgendaResponse = z.infer<typeof AgendaResponse>;

// ---- GET /slots?date=&serviceIds=
/** `serviceIds` travels as a comma-separated query string. */
export const SlotsQuery = z.object({
  date: DateOnly,
  serviceIds: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(Id).min(1)),
});
export type SlotsQuery = z.infer<typeof SlotsQuery>;

export const Slot = z.object({ startsAt: IsoDateTime, endsAt: IsoDateTime });
export type Slot = z.infer<typeof Slot>;

export const SlotsResponse = z.object({
  date: DateOnly,
  durationMin: z.number().int().positive(),
  slots: z.array(Slot),
});
export type SlotsResponse = z.infer<typeof SlotsResponse>;

/** Optional message to the client: the app shows the preview and may send an edited text. */
const ClientNotice = z.object({
  notifyClient: z.boolean().default(true),
  messageText: z.string().max(1000).optional(),
});

// ---- POST /appointments
export const AppointmentCreate = ClientNotice.extend({
  /** Existing client, or `newClient` to create one in the same call. */
  clientId: Id.optional(),
  newClient: ClientCreate.optional(),
  serviceIds: z.array(Id).min(1),
  startsAt: IsoDateTime,
  isFitIn: z.boolean().default(false),
}).refine((v) => Boolean(v.clientId) !== Boolean(v.newClient), {
  message: 'Escolha um cliente ou cadastre um novo',
  path: ['clientId'],
});
export type AppointmentCreate = z.infer<typeof AppointmentCreate>;

// ---- POST /appointments/:id/reschedule
export const AppointmentReschedule = ClientNotice.extend({
  startsAt: IsoDateTime,
  serviceIds: z.array(Id).min(1).optional(),
});
export type AppointmentReschedule = z.infer<typeof AppointmentReschedule>;

// ---- POST /appointments/:id/cancel
export const CANCEL_REASONS = [
  'Cliente pediu',
  'Imprevisto meu',
  'Cliente não respondeu',
  'Outro',
] as const;
export const AppointmentCancel = ClientNotice.extend({
  reason: z.string().max(200),
  /** "Oferecer a vaga para a lista de espera" — on by default. */
  offerToWaitlist: z.boolean().default(true),
});
export type AppointmentCancel = z.infer<typeof AppointmentCancel>;

// ---- POST /appointments/:id/{arrive,done,no-show}: no body, respond with the updated appointment
export const AppointmentActionResponse = AppointmentView;
export type AppointmentActionResponse = z.infer<typeof AppointmentActionResponse>;

// ---- POST /appointments/:id/delay-notice
export const DELAY_OPTIONS_MINUTES = [10, 15, 20] as const;
export const DelayNoticeBody = z.object({
  delayMinutes: z.number().int().min(1).max(180),
  messageText: z.string().max(1000).optional(),
});
export type DelayNoticeBody = z.infer<typeof DelayNoticeBody>;
export const DelayNoticeResponse = z.object({
  ok: z.literal(true),
  sentText: z.string(),
});
export type DelayNoticeResponse = z.infer<typeof DelayNoticeResponse>;
