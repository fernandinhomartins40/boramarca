import { z } from 'zod';
import {
  IsoDateTime,
  type AgendaActionCall,
  type AiDecision,
  type ProfessionalAnswer,
} from '@boramarca/shared';
import { normalize, toolFromSchema } from './interpret-client';
import type { LlmClient } from './llm';
import { addMinutes, zonedParts, zonedToUtc } from './time';

export type DecisionForAnswer = Pick<
  AiDecision,
  'type' | 'question' | 'options' | 'proposedAction'
>;

export interface ProfessionalAnswerOptions {
  /** ISO "now" — base for "daqui 15 minutos". */
  now: string;
  timezone: string;
  /** Used only when the deterministic parser does not understand the text. */
  llm?: LlmClient;
}

type TimedCall = Extract<AgendaActionCall, { name: 'marcar' | 'remarcar' }>;
const isTimed = (a: AgendaActionCall | null): a is TimedCall =>
  a?.name === 'marcar' || a?.name === 'remarcar';

const TAKE_OVER =
  /\b(deixa (que |q )?eu (respondo|falo|resolvo|vejo|cuido)|eu (mesmo |mesma )?(respondo|falo com|resolvo)|assumo|eu assumo)\b/;
const DECLINE =
  /^(nao|n|nem|negativo|melhor nao|agora nao|hoje nao|nao da|nao pode|recusa|recuso)\b/;
const ACCEPT =
  /^(sim|s|pode|pode sim|ok|okay|beleza|blz|claro|marca|marque|fechado|isso|confirma|confirmo|manda ver|bora|1|show|perfeito|aceito|aceita)\b/;
const FROM_NOW = /\bdaqui (?:a )?(\d{1,3}|meia)\s*(min\w*|h\w*)?/;
const AFTER_PROPOSED =
  /(?:\b(\d{1,3})\s*min\w*\s*(?:depois|mais tarde|a mais|pra frente|para frente))|(?:\b(?:empurr\w*|atras\w*|adia\w*)\s*(?:mais\s*)?(\d{1,3})\s*min\w*)/;
const AT_TIME = /\b(\d{1,2})\s*(?::|h)\s*(\d{2})?\b|\bas (\d{1,2})\b/;

function minutesFromNow(m: RegExpMatchArray): number {
  const n = m[1] === 'meia' ? 30 : Number(m[1]);
  return m[2]?.startsWith('h') && m[1] !== 'meia' ? n * 60 : n;
}

/** Same call with a new start time. */
const withTime = (a: TimedCall, startsAt: string): TimedCall =>
  ({ ...a, arguments: { ...a.arguments, startsAt } }) as TimedCall;

/** The action to adjust: the proposed one, or the first timed option. */
function baseAction(d: DecisionForAnswer): { optionId: string | null; action: TimedCall } | null {
  if (isTimed(d.proposedAction)) {
    const opt = d.options.find(
      (o) => JSON.stringify(o.action) === JSON.stringify(d.proposedAction),
    );
    return { optionId: opt?.id ?? null, action: d.proposedAction };
  }
  const opt = d.options.find((o) => isTimed(o.action));
  return opt && isTimed(opt.action) ? { optionId: opt.id, action: opt.action } : null;
}

function acceptOption(d: DecisionForAnswer): {
  optionId: string | null;
  action: AgendaActionCall | null;
} {
  const byLabel = d.options.find((o) => /^(sim|pode|marca|ok|aceitar)/.test(normalize(o.label)));
  if (d.proposedAction) {
    const same = d.options.find(
      (o) => JSON.stringify(o.action) === JSON.stringify(d.proposedAction),
    );
    return { optionId: same?.id ?? byLabel?.id ?? null, action: d.proposedAction };
  }
  const opt = byLabel ?? d.options.find((o) => o.action !== null);
  return { optionId: opt?.id ?? null, action: opt?.action ?? null };
}

function declineOption(d: DecisionForAnswer): {
  optionId: string | null;
  action: AgendaActionCall | null;
} {
  const opt = d.options.find((o) => /^(nao|recusar|agora nao)/.test(normalize(o.label)));
  return { optionId: opt?.id ?? null, action: opt?.action ?? null };
}

/** Deterministic pt-BR parser for the common answers. Returns null when unsure. */
export function parseProfessionalAnswer(
  decision: DecisionForAnswer,
  text: string,
  opts: Pick<ProfessionalAnswerOptions, 'now' | 'timezone'>,
): ProfessionalAnswer | null {
  const t = normalize(text)
    .replace(/[!?.,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if (TAKE_OVER.test(t)) return { kind: 'take_over', source: 'rule' };

  const exact = decision.options.find((o) => normalize(o.label) === t);
  if (exact) {
    const declining = /^(nao|recusar|agora nao)/.test(t);
    return {
      kind: declining ? 'decline' : 'accept',
      optionId: exact.id,
      action: exact.action,
      source: 'rule',
    };
  }

  const fromNow = t.match(FROM_NOW);
  const after = t.match(AFTER_PROPOSED);
  const at = fromNow || after ? null : t.match(AT_TIME);
  const wantsTimeChange = Boolean(fromNow || after || at);

  // "não, marca às 16h" is a counter-proposal: leave it to the LLM.
  if (DECLINE.test(t))
    return wantsTimeChange ? null : { kind: 'decline', ...declineOption(decision), source: 'rule' };

  if (wantsTimeChange) {
    const base = baseAction(decision);
    if (!base) return null;
    let startsAt: string;
    if (fromNow) startsAt = addMinutes(opts.now, minutesFromNow(fromNow));
    else if (after)
      startsAt = addMinutes(base.action.arguments.startsAt, Number(after[1] ?? after[2]));
    else {
      const hour = Number(at![1] ?? at![3]);
      const minute = Number(at![2] ?? 0);
      if (hour > 23 || minute > 59) return null;
      const day = zonedParts(base.action.arguments.startsAt, opts.timezone).date;
      startsAt = zonedToUtc(day, hour, minute, opts.timezone);
    }
    return {
      kind: 'accept',
      optionId: base.optionId,
      action: withTime(base.action, startsAt),
      source: 'rule',
    };
  }

  if (ACCEPT.test(t)) return { kind: 'accept', ...acceptOption(decision), source: 'rule' };
  return null;
}

const LlmAnswerParams = z.object({
  kind: z.enum(['accept', 'decline', 'take_over', 'unknown']),
  optionId: z.string().nullable().optional(),
  /** New start time when the professional asked for a different time. */
  startsAt: IsoDateTime.nullable().optional(),
});
const ANSWER_TOOL = toolFromSchema(
  'interpretar_resposta',
  'Converte a resposta do profissional em uma ação: aceitar (accept), recusar (decline), assumir a conversa (take_over) ou não entendi (unknown).',
  LlmAnswerParams,
);

/**
 * Free-text answer to a Decision → structured action. Deterministic parser first; LLM as fallback.
 * The backend still validates conflicts before running `accept.action`.
 */
export async function interpretProfessionalAnswer(
  decision: DecisionForAnswer,
  text: string,
  opts: ProfessionalAnswerOptions,
): Promise<ProfessionalAnswer> {
  const ruled = parseProfessionalAnswer(decision, text, opts);
  if (ruled) return ruled;
  if (!opts.llm) return { kind: 'unknown', source: 'rule' };
  try {
    const res = await opts.llm.complete({
      messages: [
        {
          role: 'system',
          content:
            'Você interpreta a resposta curta de um profissional a uma pergunta do assistente de agenda. Responda só chamando interpretar_resposta. Horários em ISO 8601 com fuso.',
        },
        {
          role: 'user',
          content: `Agora: ${opts.now} (fuso ${opts.timezone}).\nPergunta: ${decision.question}\nAção proposta: ${JSON.stringify(decision.proposedAction)}\nOpções: ${JSON.stringify(decision.options.map((o) => ({ id: o.id, label: o.label })))}`,
        },
        { role: 'user', content: text },
      ],
      tools: [ANSWER_TOOL],
      toolChoice: 'required',
    });
    const call = res.toolCalls.find((c) => c.name === 'interpretar_resposta');
    const parsed = call ? LlmAnswerParams.safeParse(JSON.parse(call.arguments)) : null;
    if (!parsed?.success) return { kind: 'unknown', source: 'llm' };
    const a = parsed.data;
    if (a.kind === 'take_over' || a.kind === 'unknown') return { kind: a.kind, source: 'llm' };
    const option = decision.options.find((o) => o.id === a.optionId) ?? null;
    if (a.kind === 'decline')
      return option
        ? { kind: 'decline', optionId: option.id, action: option.action, source: 'llm' }
        : { kind: 'decline', ...declineOption(decision), source: 'llm' };
    if (a.startsAt) {
      const base = baseAction(decision);
      if (!base) return { kind: 'unknown', source: 'llm' };
      return {
        kind: 'accept',
        optionId: base.optionId,
        action: withTime(base.action, a.startsAt),
        source: 'llm',
      };
    }
    return option
      ? { kind: 'accept', optionId: option.id, action: option.action, source: 'llm' }
      : { kind: 'accept', ...acceptOption(decision), source: 'llm' };
  } catch {
    return { kind: 'unknown', source: 'llm' };
  }
}
