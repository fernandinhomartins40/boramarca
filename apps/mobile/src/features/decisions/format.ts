import { format } from 'date-fns';
import {
  DECISION_VIA_LABELS,
  type DecisionOption,
  type DecisionType,
  type DecisionView,
} from '@boramarca/shared';

/** "agora", "há 2 min", "há 3 h", "12/11". */
export function timeAgo(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return format(new Date(iso), 'dd/MM');
}

export interface Deadline {
  /** 1 = full time left, 0 = deadline reached. */
  fraction: number;
  minutesLeft: number;
  overdue: boolean;
}

export function deadline(d: Pick<DecisionView, 'createdAt' | 'deadlineAt'>, now: Date): Deadline {
  const end = Date.parse(d.deadlineAt);
  const total = Math.max(1, end - Date.parse(d.createdAt));
  const left = end - now.getTime();
  return {
    fraction: Math.min(1, Math.max(0, left / total)),
    minutesLeft: Math.max(0, Math.ceil(left / 60_000)),
    overdue: left <= 0,
  };
}

/** Text under the card: the client already got "Já te confirmo!" when overdue (plan section 5). */
export function deadlineLabel(dl: Deadline): string {
  if (dl.overdue) return 'A IA já disse ao cliente que você confirma. Ainda dá para responder.';
  return `Responder em até ${dl.minutesLeft} min`;
}

/** Sim/Não pair when the decision has exactly one "yes" option and the "nao" one. */
export function yesNoPair<T extends Pick<DecisionOption, 'id'>>(
  options: readonly T[],
): { yes: T; no: T } | null {
  const no = options.find((o) => o.id === 'nao');
  const yes = options.find((o) => o.id !== 'nao');
  return options.length === 2 && no && yes ? { yes, no } : null;
}

export const TYPE_LABELS: Record<DecisionType, string> = {
  encaixe: 'Encaixe',
  novo_horario: 'Novo horário',
  remarcar: 'Remarcar',
  atraso: 'Atraso',
  duvida: 'Dúvida',
};

/** History row: what was decided, how and whether the client was told (reference 06, right). */
export function resolutionSummary(d: DecisionView): {
  title: string;
  subtitle: string;
  clientNotified: boolean;
} {
  const at = format(new Date(d.updatedAt), 'HH:mm');
  if (d.status === 'expired' || d.resolvedVia === 'timeout') {
    return { title: d.question, subtitle: DECISION_VIA_LABELS.timeout, clientNotified: true };
  }
  const option = d.options.find((o) => o.id === d.resolvedOption);
  const answer = option?.label ?? (d.resolvedText ? `“${d.resolvedText}”` : null);
  const who = d.context.clientFirstName || d.clientName || 'Cliente';
  const via = d.resolvedVia ? DECISION_VIA_LABELS[d.resolvedVia] : 'Você';
  return {
    title: answer ? `${who}: ${answer}` : d.question,
    subtitle: `${via} · ${at}`,
    // "Deixa que eu respondo" hands the conversation over: the AI did not message the client
    clientNotified: d.resolvedText !== 'Deixa que eu respondo' && d.resolvedOption !== 'take_over',
  };
}
