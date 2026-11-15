import { z } from 'zod';
import { VoiceIntent, type AppointmentStatus } from '@boramarca/shared';
import { normalize, toolFromSchema } from './interpret-client';
import type { LlmClient } from './llm';
import { spokenTimeOf } from './time';

/** Today's agenda, already summarized by the API (first names only). */
export interface VoiceDaySummary {
  now: string;
  timezone: string;
  appointments: {
    startsAt: string;
    clientFirstName: string;
    serviceNames: string[];
    status: AppointmentStatus;
  }[];
  /** Free start times left today (ISO). */
  freeSlots: string[];
  /** Conversations with unread client messages. */
  unreadMessages: { clientFirstName: string; count: number }[];
}

export interface VoiceAnswer {
  intent: VoiceIntent;
  speech: string;
}

const PENDING: AppointmentStatus[] = ['scheduled', 'confirmed'];

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
export function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

const RULES: { intent: Exclude<VoiceIntent, 'answer_decision' | 'unknown'>; re: RegExp }[] = [
  // Order matters: "quantos horários vagos?" is about free slots.
  { intent: 'free_slots', re: /\b(vagos?|vagas?|livres?|buraco|janela)\b/ },
  {
    intent: 'remaining_clients',
    re: /\b(quantos?|quantas?)\b.*\b(clientes?|atendimentos?|horarios?|pessoas?|agendamentos?)\b|\bainda tenho\b|\bfalta(m)? quantos\b/,
  },
  {
    intent: 'next_client',
    re: /\b(proxim[oa]|quem (vem|e) agora|quem vem depois|quem e o seguinte)\b/,
  },
  { intent: 'new_messages', re: /\b(mensage\w*|mandou|escreveu|whats\w*|zap)\b/ },
];

function answer(intent: VoiceAnswer['intent'], day: VoiceDaySummary): string {
  const tz = day.timezone;
  const now = new Date(day.now).getTime();
  const upcoming = day.appointments
    .filter((a) => PENDING.includes(a.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  switch (intent) {
    case 'remaining_clients': {
      const left = day.appointments.filter(
        (a) => PENDING.includes(a.status) || a.status === 'in_service',
      );
      if (left.length === 0) return 'Você não tem mais clientes hoje.';
      return left.length === 1
        ? 'Você ainda tem 1 cliente hoje.'
        : `Você ainda tem ${left.length} clientes hoje.`;
    }
    case 'next_client': {
      const next = upcoming[0];
      if (!next) return 'Não tem mais ninguém marcado hoje.';
      const late = new Date(next.startsAt).getTime() < now ? ', já passou do horário' : '';
      const service = next.serviceNames.length
        ? `, ${joinPt(next.serviceNames).toLowerCase()}`
        : '';
      return `O próximo é ${next.clientFirstName}, às ${spokenTimeOf(next.startsAt, tz)}${service}${late}.`;
    }
    case 'free_slots': {
      const slots = day.freeSlots.filter((s) => new Date(s).getTime() >= now);
      if (slots.length === 0) return 'Não tem horário vago hoje.';
      const shown = slots.slice(0, 4).map((s) => spokenTimeOf(s, tz));
      const more = slots.length > 4 ? ` e mais ${slots.length - 4}` : '';
      return `Tem vaga às ${joinPt(shown)}${more}.`;
    }
    case 'new_messages': {
      const who = day.unreadMessages.filter((m) => m.count > 0).map((m) => m.clientFirstName);
      if (who.length === 0) return 'Ninguém mandou mensagem nova.';
      return who.length === 1
        ? `${who[0]} mandou mensagem.`
        : `${joinPt(who.slice(0, 4))} mandaram mensagem.`;
    }
    default:
      return 'Não entendi. Pode repetir?';
  }
}

const VoiceLlmParams = z.object({ intent: VoiceIntent, speech: z.string().min(1).max(300) });
const VOICE_TOOL = toolFromSchema(
  'responder_voz',
  'Frase curta, em pt-BR, para ser falada ao profissional.',
  VoiceLlmParams,
);

/**
 * Voice command (text already recognized on the device) → intent + sentence to speak.
 * The 4 core questions are answered deterministically (no network, well under the 3 s target).
 */
export async function interpretVoiceCommand(
  text: string,
  day: VoiceDaySummary,
  opts: { llm?: LlmClient } = {},
): Promise<VoiceAnswer> {
  const t = normalize(text).replace(/[!?.,;]+/g, ' ');
  const rule = RULES.find((r) => r.re.test(t));
  if (rule) return { intent: rule.intent, speech: answer(rule.intent, day) };
  if (!opts.llm) return { intent: 'unknown', speech: answer('unknown', day) };
  try {
    const summary = [
      `Agora: ${spokenTimeOf(day.now, day.timezone)}.`,
      `Agenda: ${day.appointments.map((a) => `${spokenTimeOf(a.startsAt, day.timezone)} ${a.clientFirstName} (${a.serviceNames.join(' + ')}, ${a.status})`).join('; ') || 'vazia'}.`,
      `Vagas: ${day.freeSlots.map((s) => spokenTimeOf(s, day.timezone)).join(', ') || 'nenhuma'}.`,
      `Mensagens não lidas: ${day.unreadMessages.map((m) => `${m.clientFirstName} (${m.count})`).join(', ') || 'nenhuma'}.`,
    ].join('\n');
    const res = await opts.llm.complete({
      messages: [
        {
          role: 'system',
          content:
            'Você é a voz do assistente de agenda Bora Marca, falando com o profissional enquanto ele atende. Responda só chamando responder_voz, com uma frase curta e direta em pt-BR baseada apenas no resumo do dia. Você não altera a agenda. Se não souber, intent "unknown".',
        },
        { role: 'user', content: summary },
        { role: 'user', content: text },
      ],
      tools: [VOICE_TOOL],
      toolChoice: 'required',
    });
    const call = res.toolCalls.find((c) => c.name === 'responder_voz');
    const parsed = call ? VoiceLlmParams.safeParse(JSON.parse(call.arguments)) : null;
    if (parsed?.success) return parsed.data;
  } catch {
    // fall through to the neutral answer
  }
  return { intent: 'unknown', speech: answer('unknown', day) };
}
