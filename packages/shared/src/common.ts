import { z } from 'zod';

/**
 * Wire format conventions (JSON over HTTP/WebSocket):
 * - ids are UUID strings; timestamps are ISO-8601 strings in UTC (`...Z`);
 * - calendar dates are `YYYY-MM-DD` in the salon's timezone; clock times are `HH:mm`;
 * - money is integer cents; phones are E.164 (`+5511912345678`).
 */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const DateOnly = z.iso.date();
export type DateOnly = z.infer<typeof DateOnly>;

/** 24h clock time `HH:mm`. */
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
export type TimeOfDay = z.infer<typeof TimeOfDay>;

export const Cents = z.number().int().nonnegative();
export type Cents = z.infer<typeof Cents>;

export const PhoneE164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Telefone no formato E.164');
export type PhoneE164 = z.infer<typeof PhoneE164>;

/** IANA timezone name, e.g. `America/Sao_Paulo`. */
export const Timezone = z.string().min(1);
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** 0 = Sunday ... 6 = Saturday (same as `Date#getDay`). */
export const Weekday = z.number().int().min(0).max(6);
export type Weekday = z.infer<typeof Weekday>;

/** Columns every table has. */
export const EntityBase = z.object({
  id: Id,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const IdParams = z.object({ id: Id });
export type IdParams = z.infer<typeof IdParams>;

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

/** Error body returned by every route on 4xx/5xx. `message` is pt-BR, safe to show. */
export const ApiError = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
  time: IsoDateTime,
});
export type HealthResponse = z.infer<typeof HealthResponse>;
