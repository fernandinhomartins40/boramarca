import { z } from 'zod';
import {
  AI_TOOL_DESCRIPTIONS,
  AI_TOOL_PARAMS,
  AI_TOOL_NAMES,
  AiToolCall,
  AiTurnResult,
} from '@boramarca/shared';
import type { AiContext } from './context';
import type { LlmClient, LlmMessage, LlmTool, LlmResponse } from './llm';

/** OpenAI tool definitions generated from the shared Zod schemas. */
export const AI_TOOLS: LlmTool[] = AI_TOOL_NAMES.map((name) =>
  toolFromSchema(name, AI_TOOL_DESCRIPTIONS[name], AI_TOOL_PARAMS[name]),
);

export function toolFromSchema(name: string, description: string, schema: z.ZodType): LlmTool {
  // 'input' so fields with defaults (isFitIn, weekdays...) are optional for the model.
  const { $schema: _drop, ...parameters } = z.toJSONSchema(schema, { io: 'input' }) as Record<
    string,
    unknown
  >;
  return { type: 'function', function: { name, description, parameters } };
}

/**
 * Words that signal clinical information. Used to keep it out of anything the backend stores
 * (ai_note, decision question, cancel reason, waitlist note). Accent-insensitive, lowercase.
 * shortcut: keyword list, not a classifier — extend it when the eval set shows misses.
 */
const CLINICAL =
  /\b(dor(es)?|doi|doendo|sintoma|febre|sangr\w*|inflam\w*|infec\w*|incha\w*|remedio|medica\w*|antibiotic\w*|diagnostic\w*|exame|receita medica|gravid\w*|gestante|ansiedade|ansios\w*|depress\w*|panico|crise|pressao alta|diabet\w*|alergi\w*|lesao|fratura|torci|machuc\w*|enxaqueca|tontura|vomit\w*|nausea|carie|hernia|tendinite|lombar|cirurgia|internad\w*|tdah|autis\w*|bipolar|insonia|luto|suicid\w*)\b/;

export const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const hasClinicalInfo = (text: string): boolean => CLINICAL.test(normalize(text));

/** Removes clinical content from fields that get stored. Replies to the client are left alone. */
export function stripClinical(result: AiTurnResult): AiTurnResult {
  const clean = <T extends string | undefined>(text: T, replacement: T): T =>
    text !== undefined && hasClinicalInfo(text) ? replacement : text;
  const calls = result.calls.map((c): AiToolCall => {
    switch (c.name) {
      case 'cancelar':
        return {
          ...c,
          arguments: { ...c.arguments, reason: clean(c.arguments.reason, undefined) },
        };
      case 'entrar_lista_de_espera':
        return {
          ...c,
          arguments: {
            ...c.arguments,
            preference: {
              ...c.arguments.preference,
              note: clean(c.arguments.preference.note, undefined),
            },
          },
        };
      case 'perguntar_ao_profissional':
        return {
          ...c,
          arguments: {
            ...c.arguments,
            question: clean(c.arguments.question, 'Cliente quer marcar horário. Posso seguir?'),
          },
        };
      default:
        return c;
    }
  });
  return {
    note: clean(result.note, 'Entendi como: mensagem com assunto de saúde (não registrado)'),
    calls,
  };
}

const NOTE_BY_TOOL: Record<AiToolCall['name'], string> = {
  listar_agenda: 'consulta da agenda',
  buscar_vagas: 'pedido de horário',
  marcar: 'pedido de horário',
  remarcar: 'pedido de remarcação',
  cancelar: 'cancelamento',
  enviar_whatsapp: 'mensagem para outro cliente',
  entrar_lista_de_espera: 'pedido para entrar na lista de espera',
  confirmar_presenca: 'confirmação de presença',
  perguntar_ao_profissional: 'assunto para o profissional decidir',
  responder_cliente: 'conversa com o cliente',
};

function noteFrom(content: string | null, calls: AiToolCall[]): string {
  const line = content
    ?.split('\n')
    .find((l) => l.trim())
    ?.trim();
  if (line) return (line.startsWith('Entendi como') ? line : `Entendi como: ${line}`).slice(0, 200);
  const main = calls.find((c) => c.name !== 'responder_cliente') ?? calls[0]!;
  return `Entendi como: ${NOTE_BY_TOOL[main.name]}`;
}

type Parsed = { ok: true; result: AiTurnResult } | { ok: false; errors: string[] };

export function parseTurn(res: LlmResponse): Parsed {
  if (res.toolCalls.length === 0) return { ok: false, errors: ['nenhuma chamada de ferramenta'] };
  const calls: AiToolCall[] = [];
  const errors: string[] = [];
  for (const tc of res.toolCalls) {
    let args: unknown;
    try {
      args = JSON.parse(tc.arguments || '{}');
    } catch {
      errors.push(`${tc.name}: argumentos não são JSON`);
      continue;
    }
    const parsed = AiToolCall.safeParse({ name: tc.name, arguments: args });
    if (parsed.success) calls.push(parsed.data);
    else errors.push(`${tc.name}: ${z.prettifyError(parsed.error)}`);
  }
  if (errors.length || calls.length === 0) return { ok: false, errors };
  const result = AiTurnResult.safeParse({ note: noteFrom(res.content, calls), calls });
  return result.success
    ? { ok: true, result: result.data }
    : { ok: false, errors: [z.prettifyError(result.error)] };
}

/** Safe landing when the model fails twice or is down: the professional decides. */
export function askProfessionalFallback(clientFirstName: string, reason: string): AiTurnResult {
  return {
    note: `Entendi como: não consegui interpretar (${reason})`.slice(0, 200),
    calls: [
      {
        name: 'perguntar_ao_profissional',
        arguments: {
          type: 'duvida',
          question: `${clientFirstName} mandou uma mensagem que não entendi. Você responde?`.slice(
            0,
            300,
          ),
          options: [{ id: 'assumir', label: 'Eu respondo', action: null }],
          proposedAction: null,
          holdingReply: 'Vou ver aqui e já te falo!',
        },
      },
    ],
  };
}

/**
 * Turns one inbound client message (already reduced by buildContext) into validated tool calls.
 * Invalid output → one retry with the errors → falls back to perguntar_ao_profissional.
 */
export async function interpretClientMessage(
  ctx: AiContext,
  llm: LlmClient,
): Promise<AiTurnResult> {
  let messages: LlmMessage[] = ctx.messages;
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: LlmResponse;
    try {
      res = await llm.complete({ messages, tools: AI_TOOLS, toolChoice: 'required' });
    } catch {
      return askProfessionalFallback(ctx.meta.clientFirstName, 'IA indisponível');
    }
    const parsed = parseTurn(res);
    if (parsed.ok) return stripClinical(parsed.result);
    lastErrors = parsed.errors;
    messages = [
      ...ctx.messages,
      {
        role: 'user',
        content: `Sua resposta anterior foi inválida: ${lastErrors.join('; ').slice(0, 800)}. Responda de novo, só com chamadas de ferramenta válidas para a última mensagem do cliente.`,
      },
    ];
  }
  return askProfessionalFallback(
    ctx.meta.clientFirstName,
    `resposta inválida: ${lastErrors[0] ?? ''}`,
  );
}
