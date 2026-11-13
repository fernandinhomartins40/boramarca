import { z } from 'zod';
import { EntityBase, Id, IsoDateTime, Weekday } from './common';
import { WaitlistRule } from './salon';

export const DayPeriod = z.enum(['manha', 'tarde', 'noite']);
export type DayPeriod = z.infer<typeof DayPeriod>;

/** "Qualquer dia à tarde", "Só sábado". Empty arrays mean "any". */
export const WaitlistPreference = z.object({
  weekdays: z.array(Weekday).default([]),
  periods: z.array(DayPeriod).default([]),
  note: z.string().max(200).optional(),
});
export type WaitlistPreference = z.infer<typeof WaitlistPreference>;

export const WaitlistEntryStatus = z.enum(['waiting', 'offered', 'booked', 'removed']);
export type WaitlistEntryStatus = z.infer<typeof WaitlistEntryStatus>;

export const WaitlistEntry = EntityBase.extend({
  professionalId: Id,
  clientId: Id,
  serviceId: Id.nullable(),
  preference: WaitlistPreference,
  /** When the client asked to be told about openings. Only opted-in people get offers. */
  optedInAt: IsoDateTime,
  /** Message where the client asked; null when added manually by the professional. */
  sourceMessageId: Id.nullable(),
  status: WaitlistEntryStatus,
});
export type WaitlistEntry = z.infer<typeof WaitlistEntry>;

export const WaitlistOfferStatus = z.enum(['sent', 'accepted', 'declined', 'expired']);
export type WaitlistOfferStatus = z.infer<typeof WaitlistOfferStatus>;

export const WaitlistOffer = EntityBase.extend({
  entryId: Id,
  slotStartsAt: IsoDateTime,
  expiresAt: IsoDateTime,
  status: WaitlistOfferStatus,
});
export type WaitlistOffer = z.infer<typeof WaitlistOffer>;

export const WaitlistEntryView = WaitlistEntry.extend({
  clientName: z.string(),
  serviceName: z.string().nullable(),
  activeOffer: WaitlistOffer.nullable(),
});
export type WaitlistEntryView = z.infer<typeof WaitlistEntryView>;

// ---- CRUD /waitlist
export const WaitlistListResponse = z.object({
  items: z.array(WaitlistEntryView),
  rule: WaitlistRule,
});
export type WaitlistListResponse = z.infer<typeof WaitlistListResponse>;

/** Manual add: the professional confirms the client asked ("Só adicione quem pediu para ser avisado"). */
export const WaitlistEntryCreate = z.object({
  clientId: Id,
  serviceId: Id.nullable().default(null),
  preference: WaitlistPreference,
  clientAsked: z.literal(true),
});
export type WaitlistEntryCreate = z.infer<typeof WaitlistEntryCreate>;
export const WaitlistEntryUpdate = z
  .object({ serviceId: Id.nullable(), preference: WaitlistPreference })
  .partial();
export type WaitlistEntryUpdate = z.infer<typeof WaitlistEntryUpdate>;

// ---- POST /waitlist/:id/offer ("Oferecer vaga agora")
export const WaitlistOfferBody = z.object({
  slotStartsAt: IsoDateTime,
  messageText: z.string().max(1000).optional(),
});
export type WaitlistOfferBody = z.infer<typeof WaitlistOfferBody>;
export const WaitlistOfferResponse = WaitlistOffer;

// ---- PATCH /waitlist/rule
export const WaitlistRulePatch = z
  .object({ enabled: z.boolean(), waitMinutes: z.number().int().min(1).max(240) })
  .partial()
  .strict();
export type WaitlistRulePatch = z.infer<typeof WaitlistRulePatch>;
export const WaitlistRuleResponse = WaitlistRule;
