import { z } from 'zod';
import { Cents, EntityBase, Id, IsoDateTime, PhoneE164, paginated } from './common';

export const ClientOrigin = z.enum(['whatsapp', 'manual']);
export type ClientOrigin = z.infer<typeof ClientOrigin>;

/** Preferences noted by the AI or the professional ("Prefere sábado de manhã"). Never clinical data. */
export const ClientPreferences = z.object({
  notes: z.array(z.string().max(200)).default([]),
});
export type ClientPreferences = z.infer<typeof ClientPreferences>;

export const Client = EntityBase.extend({
  professionalId: Id,
  name: z.string().trim().min(1).max(120),
  phone: PhoneE164,
  preferences: ClientPreferences,
  origin: ClientOrigin,
  firstContactAt: IsoDateTime.nullable(),
});
export type Client = z.infer<typeof Client>;

/** List item with the extra info the client list shows. */
export const ClientSummary = Client.extend({
  lastVisitAt: IsoDateTime.nullable(),
  lastServiceName: z.string().nullable(),
  visitsCount: z.number().int().nonnegative(),
  noShowCount: z.number().int().nonnegative(),
  onWaitlist: z.boolean(),
});
export type ClientSummary = z.infer<typeof ClientSummary>;

// ---- CRUD /clients
export const ClientCreate = z.object({
  name: z.string().trim().min(1).max(120),
  phone: PhoneE164,
  preferences: ClientPreferences.optional(),
});
export type ClientCreate = z.infer<typeof ClientCreate>;
export const ClientUpdate = ClientCreate.partial();
export type ClientUpdate = z.infer<typeof ClientUpdate>;

export const ClientSort = z.enum(['recent', 'name', 'frequent']);
export type ClientSort = z.infer<typeof ClientSort>;

export const ClientListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  sort: ClientSort.default('recent'),
  /** Only clients whose last visit is older than N days ("sumidos"). */
  inactiveDays: z.coerce.number().int().positive().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ClientListQuery = z.infer<typeof ClientListQuery>;
export const ClientListResponse = paginated(ClientSummary);
export type ClientListResponse = z.infer<typeof ClientListResponse>;

// ---- GET /clients/:id/stats
export const ClientStats = z.object({
  clientId: Id,
  visitsCount: z.number().int().nonnegative(),
  averageTicketCents: Cents,
  noShowCount: z.number().int().nonnegative(),
  /** "vem a cada 21 dias"; null with fewer than two visits. */
  averageIntervalDays: z.number().nullable(),
  lastVisitAt: IsoDateTime.nullable(),
  nextAppointmentAt: IsoDateTime.nullable(),
});
export type ClientStats = z.infer<typeof ClientStats>;
