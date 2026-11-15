import { routes } from '@boramarca/shared';
import type { PanelClient } from './client';

/** Owner panel writes. The salon routes cover every professional, the owner included. */

export const answerDecision = (
  api: PanelClient,
  id: string,
  answer: { optionId: string } | { text: string },
) => api.call(routes.salon.answerDecision, { params: { id }, body: { ...answer, via: 'app' } });

/** Same-day move: shifts the start by the minutes between the old and the new time of day. */
export function movedStart(startsAt: string, fromMinutes: number, toMinutes: number): string {
  // shortcut: a minute delta ignores a DST jump inside the day (Brazil has none); convert the
  // wall time with the salon timezone if the panel ever serves zones with DST.
  return new Date(Date.parse(startsAt) + (toMinutes - fromMinutes) * 60_000).toISOString();
}

export const rescheduleAppointment = (
  api: PanelClient,
  id: string,
  startsAt: string,
  notifyClient: boolean,
) =>
  api.call(routes.salon.rescheduleAppointment, {
    params: { id },
    body: { startsAt, notifyClient },
  });
