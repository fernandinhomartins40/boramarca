import { z } from 'zod';
import { Autonomy, AiTone } from './ai';
import { EntityBase, Id, IsoDateTime, PhoneE164, TimeOfDay, Timezone } from './common';

export const Plan = z.enum(['essencial', 'maos_livres', 'salao', 'premium']);
export type Plan = z.infer<typeof Plan>;

export const PLAN_LABELS: Record<Plan, string> = {
  essencial: 'Essencial',
  maos_livres: 'Mãos Livres',
  salao: 'Salão',
  premium: 'Premium',
};

export const ProfessionalRole = z.enum(['owner', 'professional']);
export type ProfessionalRole = z.infer<typeof ProfessionalRole>;

/** Plan section 3: accepted values of `professionals.professions`. */
export const PROFESSIONS = [
  'barbeiro',
  'cabeleireiro',
  'manicure',
  'esteticista',
  'fisioterapeuta',
  'psicologo',
  'dentista',
  'professor_instrutor',
  'outro',
] as const;
export const Profession = z.enum(PROFESSIONS);
export type Profession = z.infer<typeof Profession>;

export const PROFESSION_LABELS: Record<Profession, string> = {
  barbeiro: 'Barbeiro',
  cabeleireiro: 'Cabeleireiro(a)',
  manicure: 'Manicure',
  esteticista: 'Esteticista',
  fisioterapeuta: 'Fisioterapeuta',
  psicologo: 'Psicólogo(a)',
  dentista: 'Dentista',
  professor_instrutor: 'Professor(a) ou instrutor(a)',
  outro: 'Outro',
};

/** Health professions: the AI handles only time, service, price and address (plan rule 9). */
export const HEALTH_PROFESSIONS: readonly Profession[] = [
  'fisioterapeuta',
  'psicologo',
  'dentista',
];

/** "Horário de silêncio": the counter does not speak in this window (salon timezone). */
export const QuietHours = z.object({ start: TimeOfDay, end: TimeOfDay });
export type QuietHours = z.infer<typeof QuietHours>;

/** `professionals.waitlist_rule` (plan section 8): one person at a time. */
export const WaitlistRule = z.object({
  enabled: z.boolean(),
  peoplePerSlot: z.literal(1),
  waitMinutes: z.number().int().min(1).max(240),
});
export type WaitlistRule = z.infer<typeof WaitlistRule>;
export const DEFAULT_WAITLIST_RULE: WaitlistRule = {
  enabled: true,
  peoplePerSlot: 1,
  waitMinutes: 10,
};

export const DEFAULT_REMINDER_LEAD_MINUTES = 120;
export const REMINDER_LEAD_OPTIONS_MINUTES = [60, 120, 1440] as const;

export const Salon = EntityBase.extend({
  name: z.string().min(1).max(120),
  plan: Plan,
  timezone: Timezone,
});
export type Salon = z.infer<typeof Salon>;

export const Professional = EntityBase.extend({
  salonId: Id,
  role: ProfessionalRole,
  name: z.string().min(1).max(120),
  phone: PhoneE164,
  professions: z.array(Profession),
  address: z.string().max(300).nullable(),
  aiEnabled: z.boolean(),
  aiPausedUntil: IsoDateTime.nullable(),
  aiTone: AiTone,
  autonomy: Autonomy,
  reminderLeadMinutes: z.number().int().min(0).max(10080),
  welcomeMessage: z.string().max(500).nullable(),
  quietHours: QuietHours.nullable(),
  waitlistRule: WaitlistRule,
  skipMessagePreview: z.boolean(),
  /** Speech rate for TTS (1 = normal). */
  voiceRate: z.number().min(0.5).max(2),
});
export type Professional = z.infer<typeof Professional>;
