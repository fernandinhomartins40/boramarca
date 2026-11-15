import {
  DECISION_TIMEOUT_CLIENT_MESSAGE,
  type AiTone,
  type MessagePreviewKind,
} from '@boramarca/shared';
import { formatWhen } from './time';

/** Every MessagePreviewKind, plus the neutral hold and the expired-decision notice. */
export type MessageKind = MessagePreviewKind | 'hold' | 'decision_expired';

export interface MessageParams {
  now: string;
  timezone: string;
  clientFirstName?: string;
  /** Appointment or offered slot start (ISO). */
  startsAt?: string;
  /** Previous start, for reschedule. */
  previousStartsAt?: string;
  serviceName?: string;
  delayMinutes?: number;
  /** Waitlist offer validity. */
  expiresInMinutes?: number;
  spaceName?: string;
}

type Ctx = {
  name: string;
  hi: string;
  when: string;
  prev: string;
  later: string;
  service: string;
  delay: number;
  expires: number;
  space: string;
};
type Template = (c: Ctx) => string;

const TEMPLATES: Record<MessageKind, Record<AiTone, Template>> = {
  booking_confirmation: {
    descontraido: (c) => `Fechado${c.hi}! Te espero ${c.when}${c.service}.`,
    simpatico: (c) =>
      `Prontinho${c.hi}! Seu horário está marcado para ${c.when}${c.service}. Até lá!`,
    formal: (c) => `Olá${c.hi}. Seu horário está confirmado para ${c.when}${c.service}.`,
  },
  reschedule: {
    descontraido: (c) => `Feito${c.hi}! Mudei seu horário de ${c.prev} para ${c.when}.`,
    simpatico: (c) => `Tudo certo${c.hi}! Seu horário passou de ${c.prev} para ${c.when}.`,
    formal: (c) => `Olá${c.hi}. Seu horário foi alterado de ${c.prev} para ${c.when}.`,
  },
  cancellation: {
    descontraido: (c) => `Tranquilo${c.hi}! Cancelei seu horário de ${c.when}. Quer remarcar?`,
    simpatico: (c) =>
      `Sem problemas${c.hi}! Seu horário de ${c.when} foi cancelado. Quer marcar outro dia?`,
    formal: (c) => `Olá${c.hi}. Seu horário de ${c.when} foi cancelado. Deseja marcar outra data?`,
  },
  delay_notice: {
    descontraido: (c) =>
      `Oi${c.hi}! Tô com uns ${c.delay} min de atraso. Seu horário de ${c.when} fica para ${c.later}, beleza?`,
    simpatico: (c) =>
      `Oi${c.hi}! Estou com cerca de ${c.delay} minutos de atraso. Consegue vir para ${c.later} em vez de ${c.when}?`,
    formal: (c) =>
      `Olá${c.hi}. Estou com aproximadamente ${c.delay} minutos de atraso. Seu atendimento de ${c.when} passa para ${c.later}.`,
  },
  reminder: {
    descontraido: (c) => `Oi${c.hi}! Lembrete: ${c.when}${c.service}. Responda 1 para confirmar.`,
    simpatico: (c) =>
      `Oi${c.hi}! Passando para lembrar do seu horário ${c.when}${c.service}. Responda 1 para confirmar.`,
    formal: (c) =>
      `Olá${c.hi}. Lembrete do seu horário ${c.when}${c.service}. Responda 1 para confirmar.`,
  },
  waitlist_offer: {
    descontraido: (c) =>
      `Oi${c.hi}! Abriu uma vaga ${c.when}${c.service}. Quer? Me responde em até ${c.expires} min.`,
    simpatico: (c) =>
      `Oi${c.hi}! Você pediu para ser avisado: abriu uma vaga ${c.when}${c.service}. Quer ficar com ela? Responda em até ${c.expires} minutos.`,
    formal: (c) =>
      `Olá${c.hi}. Conforme solicitado, informamos que surgiu uma vaga ${c.when}${c.service}. Responda em até ${c.expires} minutos se tiver interesse.`,
  },
  welcome: {
    descontraido: (c) =>
      `Oi${c.hi}! Aqui é o assistente de agenda${c.space}. Me fala o que você precisa.`,
    simpatico: (c) => `Olá${c.hi}! Sou o assistente de agenda${c.space}. Como posso ajudar?`,
    formal: (c) => `Olá${c.hi}. Este é o assistente de agenda${c.space}. Em que posso ajudar?`,
  },
  decision_answer: {
    descontraido: (c) => `Poxa${c.hi}, esse horário não vai dar. Quer ver outro?`,
    simpatico: (c) =>
      `Que pena${c.hi}, esse horário não vai ser possível. Posso ver outro para você?`,
    formal: (c) => `Olá${c.hi}. Infelizmente esse horário não está disponível. Deseja outra opção?`,
  },
  tone_sample: {
    descontraido: (c) => `Fechado${c.hi}! Te espero ${c.when}.`,
    simpatico: (c) => `Prontinho${c.hi}! Te esperamos ${c.when}. Até lá!`,
    formal: (c) => `Olá${c.hi}. Seu horário está confirmado para ${c.when}.`,
  },
  // Plan rule 2: the timeout message is fixed and neutral, whatever the tone.
  hold: {
    descontraido: () => DECISION_TIMEOUT_CLIENT_MESSAGE,
    simpatico: () => DECISION_TIMEOUT_CLIENT_MESSAGE,
    formal: () => DECISION_TIMEOUT_CLIENT_MESSAGE,
  },
  decision_expired: {
    descontraido: (c) =>
      `Poxa${c.hi}, o horário de ${c.when} acabou não dando. Quer que eu veja outro?`,
    simpatico: (c) =>
      `Desculpa a demora${c.hi}! O horário de ${c.when} não está mais disponível. Posso ver outro para você?`,
    formal: (c) =>
      `Olá${c.hi}. O horário de ${c.when} não está mais disponível. Deseja outra opção?`,
  },
};

/** Standard client messages, by tone. Pure function: same input, same text. */
export function renderMessage(kind: MessageKind, tone: AiTone, p: MessageParams): string {
  const when = (iso?: string) => (iso ? formatWhen(iso, p.now, p.timezone) : 'o horário combinado');
  const startsAt = p.startsAt;
  const delayed =
    startsAt && p.delayMinutes
      ? new Date(new Date(startsAt).getTime() + p.delayMinutes * 60_000).toISOString()
      : undefined;
  return TEMPLATES[kind][tone]({
    name: p.clientFirstName ?? '',
    hi: p.clientFirstName ? `, ${p.clientFirstName}` : '',
    when: when(startsAt),
    prev: when(p.previousStartsAt),
    later: when(delayed),
    service: p.serviceName ? ` (${p.serviceName})` : '',
    delay: p.delayMinutes ?? 0,
    expires: p.expiresInMinutes ?? 30,
    space: p.spaceName ? ` de ${p.spaceName}` : '',
  });
}
