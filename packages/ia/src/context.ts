import {
  HEALTH_PROFESSIONS,
  PROFESSION_LABELS,
  type AiTone,
  type AppointmentStatus,
  type Autonomy,
  type MessageAuthor,
  type Profession,
} from '@boramarca/shared';
import type { LlmMessage } from './llm';
import { SYSTEM_PROMPT, TONE_GUIDE } from './prompts';
import { spokenTimeOf, WEEKDAY_NAMES_PT, zonedParts } from './time';

/** Domain data the API hands over. Full names and phones may come in; they never go out. */
export interface ClientMessageInput {
  /** ISO timestamp of "now" (the inbound message time). */
  now: string;
  timezone: string;
  professional: {
    professions: Profession[];
    tone: AiTone;
    autonomy: Autonomy;
    spaceName?: string | null;
    address?: string | null;
  };
  client: {
    id: string;
    /** Full name as stored; only the first name is sent. */
    name: string;
    /** Has had at least one appointment before (autonomy `book_free_slot_known_client`). */
    isKnown: boolean;
    upcoming: { id: string; startsAt: string; serviceNames: string[] }[];
  };
  services: { id: string; name: string; durationMinutes: number; priceCents: number | null }[];
  day: {
    date: string; // YYYY-MM-DD, salon timezone
    /** Of other clients only the time goes out (as "ocupado"). */
    appointments: {
      id: string;
      clientId: string;
      clientName: string;
      startsAt: string;
      endsAt: string;
      serviceNames: string[];
      status: AppointmentStatus;
    }[];
    /** Free start times today (ISO), already computed by the agenda engine. */
    freeSlots: string[];
  };
  /** Previous messages, oldest first (the API sends the last ~10). */
  history: { author: MessageAuthor; text: string; at: string }[];
  message: { text: string; transcribedFromAudio?: boolean };
}

export interface AiContext {
  messages: LlmMessage[];
  meta: {
    clientId: string;
    clientFirstName: string;
    isHealth: boolean;
    now: string;
    timezone: string;
    tone: AiTone;
  };
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || 'Cliente';

/** Masks e-mails, phone-like sequences (8+ digits) and other long numbers (6+ digits: CPF, cards). */
export function maskPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => (m.replace(/\D/g, '').length >= 8 ? '[telefone]' : m))
    .replace(/\d{6,}/g, '[número]');
}

const AUTHOR_LABEL: Record<MessageAuthor, string> = {
  client: 'cliente',
  ai: 'assistente',
  professional: 'profissional',
};

const money = (cents: number | null) =>
  cents === null ? 'preço a combinar' : `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

const yesNo = (v: boolean) => (v ? 'sim' : 'não');

/**
 * The only place that assembles what goes to the AI. Fixed system prompt first (input cache),
 * variable context after it, the new client message last. Applies data reduction.
 */
export function buildContext(input: ClientMessageInput): AiContext {
  const tz = input.timezone;
  const clientFirst = firstName(input.client.name);
  // Full names of anyone in the context are reduced to first names inside free text too.
  const names = [input.client.name, ...input.day.appointments.map((a) => a.clientName)]
    .map((n) => n.trim())
    .filter((n) => n.includes(' '));
  const clean = (text: string) =>
    maskPii(names.reduce((t, n) => t.split(n).join(firstName(n)), text));

  const isHealth = input.professional.professions.some((p) => HEALTH_PROFESSIONS.includes(p));
  const now = zonedParts(input.now, tz);
  const hm = (iso: string) => spokenTimeOf(iso, tz);
  const a = input.professional.autonomy;
  const p = input.professional;

  const lines = [
    `Agora: ${WEEKDAY_NAMES_PT[now.weekday]}, ${now.date}, ${hm(input.now)} (fuso ${tz}).`,
    `Tom: ${p.tone} — ${TONE_GUIDE[p.tone]}`,
    `Profissão: ${p.professions.map((x) => PROFESSION_LABELS[x]).join(', ') || 'não informada'}. Conta de saúde: ${yesNo(isHealth)}.`,
    // Business data, not client data: not masked (a CEP would look like a phone).
    p.spaceName ? `Espaço: ${p.spaceName}.` : null,
    p.address ? `Endereço: ${p.address}.` : 'Endereço: não cadastrado.',
    `Autonomia: responder preço e endereço sozinho: ${yesNo(a.answer_price_address)}; aceitar confirmação de lembrete: ${yesNo(a.confirm_reminders)}; marcar horário livre para cliente conhecido: ${yesNo(a.book_free_slot_known_client)}; cancelar quando o cliente pede: ${yesNo(a.cancel_on_request)}; mexer no horário de outro cliente: sempre pergunta.`,
    '',
    `Cliente desta conversa: ${clientFirst} (clientId ${input.client.id}). Já foi atendido antes: ${yesNo(input.client.isKnown)}.`,
    'Agendamentos futuros do cliente:',
    ...(input.client.upcoming.length
      ? input.client.upcoming.map(
          (u) =>
            `- appointmentId ${u.id} | ${zonedParts(u.startsAt, tz).date} ${hm(u.startsAt)} | ${u.serviceNames.join(' + ')}`,
        )
      : ['- nenhum']),
    '',
    'Serviços:',
    ...input.services.map(
      (s) => `- serviceId ${s.id} | ${s.name} | ${s.durationMinutes} min | ${money(s.priceCents)}`,
    ),
    '',
    `Agenda de hoje (${input.day.date}):`,
    ...(input.day.appointments.length
      ? input.day.appointments.map((x) =>
          // Other clients are only "ocupado": no name, service or id leaves (LGPD, health accounts).
          x.clientId === input.client.id
            ? `- ${hm(x.startsAt)}–${hm(x.endsAt)} | ${clientFirst} (este cliente) | ${x.serviceNames.join(' + ')} | ${x.status} | appointmentId ${x.id}`
            : `- ${hm(x.startsAt)}–${hm(x.endsAt)} | ocupado`,
        )
      : ['- livre o dia todo']),
    `Vagas livres hoje: ${input.day.freeSlots.length ? input.day.freeSlots.map(hm).join(', ') : 'nenhuma'}.`,
    '',
    'Últimas mensagens:',
    ...(input.history.length
      ? input.history.map((m) => `[${hm(m.at)}] ${AUTHOR_LABEL[m.author]}: ${clean(m.text)}`)
      : ['- nenhuma']),
  ].filter((l): l is string => l !== null);

  const newMessage = `${input.message.transcribedFromAudio ? '(áudio transcrito) ' : ''}${clean(input.message.text)}`;

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `CONTEXTO\n${lines.join('\n')}` },
      { role: 'user', content: newMessage },
    ],
    meta: {
      clientId: input.client.id,
      clientFirstName: clientFirst,
      isHealth,
      now: input.now,
      timezone: tz,
      tone: p.tone,
    },
  };
}
