import { z } from 'zod';
import { Cents, DateOnly, Id, PhoneE164, Weekday, paginated } from './common';
import { AppointmentView } from './appointments';
import { ClientSummary } from './clients';
import { DecisionView } from './decisions';
import { Plan, Profession, ProfessionalRole } from './salon';
import { WorkingHours } from './schedule';
import { WhatsAppStatus } from './whatsapp';

/** Owner panel routes (`/salon/*`): only `role = owner`, scoped to the owner's salon. */

export const TeamMember = z.object({
  id: Id,
  name: z.string(),
  phone: PhoneE164,
  role: ProfessionalRole,
  professions: z.array(Profession),
  servicesCount: z.number().int().nonnegative(),
  whatsappStatus: WhatsAppStatus,
  workingHours: z.array(WorkingHours),
});
export type TeamMember = z.infer<typeof TeamMember>;

// ---- GET /salon/day?date=
export const SalonDayQuery = z.object({ date: DateOnly });
export type SalonDayQuery = z.infer<typeof SalonDayQuery>;
export const SalonDayResponse = z.object({
  date: DateOnly,
  timezone: z.string(),
  columns: z.array(
    z.object({
      professional: TeamMember.pick({ id: true, name: true, role: true }),
      workingHours: WorkingHours.nullable(),
      appointments: z.array(AppointmentView),
    }),
  ),
  pendingDecisions: z.array(DecisionView),
});
export type SalonDayResponse = z.infer<typeof SalonDayResponse>;

// ---- GET /salon/reports?month=YYYY-MM
export const SalonReportsQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export type SalonReportsQuery = z.infer<typeof SalonReportsQuery>;
export const SalonReportsResponse = z.object({
  month: z.string(),
  /** "23 encaixes = R$ 1.380 que teriam ficado vagos": the headline number. */
  recoveredFitInsCount: z.number().int().nonnegative(),
  recoveredValueCents: Cents,
  /** 0..1 */
  noShowRate: z.number().min(0).max(1),
  /** Appointments done in the month (whole salon). Optional for older clients/mocks. */
  appointmentsDoneCount: z.number().int().nonnegative().optional(),
  occupancyByProfessional: z.array(
    z.object({ professionalId: Id, name: z.string(), occupancyRate: z.number().min(0).max(1) }),
  ),
  /** Day × hour occupancy (0..1), salon timezone. */
  heatmap: z.array(
    z.object({
      weekday: Weekday,
      hour: z.number().int().min(0).max(23),
      occupancyRate: z.number().min(0).max(1),
    }),
  ),
});
export type SalonReportsResponse = z.infer<typeof SalonReportsResponse>;

// ---- CRUD /salon/team
export const TeamListResponse = z.object({ items: z.array(TeamMember) });
export type TeamListResponse = z.infer<typeof TeamListResponse>;
export const TeamMemberCreate = z.object({
  name: z.string().trim().min(1).max(120),
  phone: PhoneE164,
  professions: z.array(Profession).min(1),
});
export type TeamMemberCreate = z.infer<typeof TeamMemberCreate>;
export const TeamMemberUpdate = TeamMemberCreate.partial();
export type TeamMemberUpdate = z.infer<typeof TeamMemberUpdate>;

// ---- GET /salon/clients (format=csv returns text/csv with the same columns)
export const SalonClientsQuery = z.object({
  search: z.string().trim().max(120).optional(),
  inactiveDays: z.coerce.number().int().positive().optional(),
  professionalId: Id.optional(),
  /** `true`: only clients on the waitlist; `false`: only those not on it. */
  onWaitlist: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  format: z.enum(['json', 'csv']).default('json'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type SalonClientsQuery = z.infer<typeof SalonClientsQuery>;
export const SalonClient = ClientSummary.extend({ professionalName: z.string() });
export type SalonClient = z.infer<typeof SalonClient>;
export const SalonClientsResponse = paginated(SalonClient);
export type SalonClientsResponse = z.infer<typeof SalonClientsResponse>;

// ---- GET /salon/plan
export const SalonPlanResponse = z.object({
  plan: Plan,
  activeProfessionals: z.number().int().nonnegative(),
  usage: z.object({
    messagesThisMonth: z.number().int().nonnegative(),
    decisionsThisMonth: z.number().int().nonnegative(),
    appointmentsThisMonth: z.number().int().nonnegative(),
  }),
  kitInterestSent: z.boolean(),
});
export type SalonPlanResponse = z.infer<typeof SalonPlanResponse>;
