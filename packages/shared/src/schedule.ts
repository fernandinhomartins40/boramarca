import { z } from 'zod';
import { EntityBase, Id, IsoDateTime, TimeOfDay, Weekday } from './common';

/** One row per weekday the professional works; lunch is optional. Times in the salon timezone. */
const WorkingHoursFields = z.object({
  weekday: Weekday,
  start: TimeOfDay,
  end: TimeOfDay,
  lunchStart: TimeOfDay.nullable(),
  lunchEnd: TimeOfDay.nullable(),
});

const checkWorkingHours = (v: z.infer<typeof WorkingHoursFields>, ctx: z.RefinementCtx) => {
  if (v.start >= v.end)
    ctx.addIssue({ code: 'custom', message: 'O fim vem depois do início', path: ['end'] });
  if ((v.lunchStart === null) !== (v.lunchEnd === null))
    ctx.addIssue({ code: 'custom', message: 'Informe início e fim do almoço', path: ['lunchEnd'] });
  if (
    v.lunchStart &&
    v.lunchEnd &&
    !(v.start <= v.lunchStart && v.lunchStart < v.lunchEnd && v.lunchEnd <= v.end)
  )
    ctx.addIssue({
      code: 'custom',
      message: 'O almoço fica dentro do expediente',
      path: ['lunchStart'],
    });
};

export const WorkingHours = EntityBase.extend({ professionalId: Id }).extend(
  WorkingHoursFields.shape,
);
export type WorkingHours = z.infer<typeof WorkingHours>;

// ---- CRUD /working-hours
export const WorkingHoursCreate = WorkingHoursFields.superRefine(checkWorkingHours);
export type WorkingHoursCreate = z.infer<typeof WorkingHoursCreate>;
export const WorkingHoursUpdate = WorkingHoursFields.partial();
export type WorkingHoursUpdate = z.infer<typeof WorkingHoursUpdate>;
/** `PUT /working-hours` replaces the whole week at once (used by sign-up and settings). */
export const WorkingHoursReplaceBody = z.object({ items: z.array(WorkingHoursCreate) });
export type WorkingHoursReplaceBody = z.infer<typeof WorkingHoursReplaceBody>;
export const WorkingHoursListResponse = z.object({ items: z.array(WorkingHours) });
export type WorkingHoursListResponse = z.infer<typeof WorkingHoursListResponse>;

/** Days off, holidays, blocked periods. */
export const TimeOff = EntityBase.extend({
  professionalId: Id,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  reason: z.string().max(200).nullable(),
});
export type TimeOff = z.infer<typeof TimeOff>;

// ---- CRUD /time-off
const TimeOffFields = z.object({
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  reason: z.string().max(200).nullable().default(null),
});
export const TimeOffCreate = TimeOffFields.refine((v) => v.startsAt < v.endsAt, {
  message: 'O fim vem depois do início',
  path: ['endsAt'],
});
export type TimeOffCreate = z.infer<typeof TimeOffCreate>;
export const TimeOffUpdate = TimeOffFields.partial();
export type TimeOffUpdate = z.infer<typeof TimeOffUpdate>;
export const TimeOffListQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
});
export type TimeOffListQuery = z.infer<typeof TimeOffListQuery>;
export const TimeOffListResponse = z.object({ items: z.array(TimeOff) });
export type TimeOffListResponse = z.infer<typeof TimeOffListResponse>;
