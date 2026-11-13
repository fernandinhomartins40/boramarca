import { z } from 'zod';
import { EntityBase, Id, PhoneE164 } from './common';
import { Profession } from './salon';

/** `leads`: contacts from the public site. */
export const Lead = EntityBase.extend({
  name: z.string(),
  phone: PhoneE164,
  profession: z.string().nullable(),
  message: z.string().nullable(),
  source: z.string(),
});
export type Lead = z.infer<typeof Lead>;

// ---- POST /leads (public, rate limited). `website` is a honeypot: humans leave it empty.
export const LeadCreate = z.object({
  name: z.string().trim().min(1).max(120),
  phone: PhoneE164,
  profession: z
    .union([Profession, z.string().max(80)])
    .nullable()
    .default(null),
  message: z.string().trim().max(2000).nullable().default(null),
  source: z.string().max(40).default('site_contato'),
  website: z.string().max(0, 'Campo inválido').optional(),
});
export type LeadCreate = z.infer<typeof LeadCreate>;
export const LeadCreateResponse = z.object({ ok: z.literal(true), id: Id });
export type LeadCreateResponse = z.infer<typeof LeadCreateResponse>;

/** `kit_leads`: interest in the "Kit Balcão" (phone + Bluetooth speaker). */
export const KitLead = EntityBase.extend({
  professionalId: Id,
  note: z.string().nullable(),
});
export type KitLead = z.infer<typeof KitLead>;

// ---- POST /kit-leads
export const KitLeadCreate = z.object({
  note: z.string().trim().max(1000).nullable().default(null),
});
export type KitLeadCreate = z.infer<typeof KitLeadCreate>;
export const KitLeadCreateResponse = KitLead;
