import { useEffect, useState } from 'react';
import { dayPhrase, firstName, spokenTime } from './format';

/**
 * Texts the client receives. The app shows them as a preview, the professional may edit, and the
 * final text goes as `messageText`, so what is shown is what is sent.
 */

const when = (startsAt: string, now: Date) =>
  `${dayPhrase(startsAt, now)}, às ${spokenTime(startsAt)}`;

export const bookingMessage = (name: string, service: string, startsAt: string, now: Date) =>
  `Olá, ${firstName(name)}! Seu agendamento de ${service} está confirmado para ${when(startsAt, now)}.`;

export const rescheduleMessage = (name: string, startsAt: string, now: Date) =>
  `Oi, ${firstName(name)}! Seu horário mudou para ${when(startsAt, now)}. Tudo certo para você?`;

export function cancelMessage(name: string, startsAt: string, reason: string, now: Date) {
  const first = firstName(name);
  return reason === 'Cliente pediu'
    ? `Oi, ${first}! Cancelei seu horário de ${when(startsAt, now)}, como você pediu. Quando quiser, é só chamar.`
    : `Oi, ${first}! Precisei cancelar seu horário de ${when(startsAt, now)}. Desculpe! Quer marcar outro dia?`;
}

export const delayMessage = (name: string, minutes: number) =>
  `Oi, ${firstName(name)}! Vou atrasar uns ${minutes} minutos. Desculpe! Te espero.`;

export const waitlistOfferMessage = (name: string, startsAt: string, now: Date) =>
  `Oi, ${firstName(name)}! Vagou um horário ${when(startsAt, now)}. Quer? É só responder por aqui.`;

/** Preview text that follows its template until the professional edits it. */
export function useEditableMessage(template: string) {
  const [edited, setEdited] = useState<string | null>(null);
  useEffect(() => setEdited(null), [template]);
  return [edited ?? template, setEdited] as const;
}
