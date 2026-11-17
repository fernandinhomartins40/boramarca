import type {
  VoiceCommandBody,
  VoiceCommandResponse,
  VoiceSummaryMoment,
  VoiceSummaryResponse,
} from '@boramarca/shared';
import { mockAppointments } from './agenda';
import { mockConversations } from './conversations';
import { mockDecisions } from './decisions';
import { firstName } from './mock/fixtures';
import { nowIso, reply } from './mock/util';
import { salonClock } from '@/utils/timezone';

/**
 * Voice commands of Modo Balcão (prompt 07; text recognized on the device). Owner: agent C3;
 * api implementation: D1. Answers to a just-spoken decision go through `handleDecisionAction`.
 */
export interface VoiceData {
  command(body: VoiceCommandBody): Promise<VoiceCommandResponse>;
  summary(moment: VoiceSummaryMoment): Promise<VoiceSummaryResponse>;
}

const hhmm = (iso: string) => {
  const d = salonClock(iso);
  return `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
};

function upcoming() {
  const now = nowIso();
  return mockAppointments
    .filter((a) => ['scheduled', 'confirmed'].includes(a.status) && a.startsAt > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Keyword intents for the four sample questions (VOICE_SAMPLE_QUESTIONS). */
export function mockVoiceAnswer(text: string): VoiceCommandResponse {
  const q = text.toLowerCase();
  const next = upcoming();
  if (/quantos|quantas/.test(q)) {
    return {
      intent: 'remaining_clients',
      speech: next.length
        ? `Ainda tem ${next.length} cliente${next.length > 1 ? 's' : ''} hoje.`
        : 'Ninguém mais hoje.',
      decisionId: null,
    };
  }
  if (/vago|livre|vaga/.test(q)) {
    // shortcut: fixed answer from the demo day, C3 can compute it from mockAgenda.getSlots.
    return { intent: 'free_slots', speech: 'Tem horário livre às 16h e às 17h.', decisionId: null };
  }
  if (/pr[oó]xim/.test(q)) {
    const a = next[0];
    return {
      intent: 'next_client',
      speech: a
        ? `O próximo é ${firstName(a.clientName)}, às ${hhmm(a.startsAt)}.`
        : 'Não tem mais ninguém hoje.',
      decisionId: null,
    };
  }
  if (/mensage/.test(q)) {
    const unread = mockConversations.filter((v) => v.unreadCount > 0);
    return {
      intent: 'new_messages',
      speech: unread.length
        ? `Sim. ${unread.map((v) => firstName(v.clientName)).join(', ')} mandaram mensagem. A IA está cuidando.`
        : 'Ninguém mandou mensagem nova.',
      decisionId: null,
    };
  }
  return { intent: 'unknown', speech: 'Não entendi. Pode repetir?', decisionId: null };
}

export const mockVoice: VoiceData = {
  async command(body) {
    return reply(mockVoiceAnswer(body.text));
  },
  async summary(moment) {
    const pending = mockDecisions.filter((d) => d.status === 'pending').length;
    const speech =
      moment === 'open'
        ? `Bom dia! Hoje você tem ${upcoming().length} clientes. ${pending ? `${pending} pedidos esperando você.` : ''}`.trim()
        : 'Balcão encerrado. Bom descanso!';
    return reply({ moment, speech });
  },
};
