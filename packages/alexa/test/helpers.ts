import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import type { RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';
import type { DecisionView } from '@boramarca/shared';
import type { AlexaPorts } from '../src';

export const SKILL_ID = 'amzn1.ask.skill.00000000-0000-4000-8000-000000000001';
export const PRO = '00000000-0000-4000-8000-0000000000a1';

/** Recorded Alexa request (test/fixtures/*.json). */
export const fixture = (name: string): RequestEnvelope =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

export function decision(id: string, question: string): DecisionView {
  const at = '2026-11-14T12:55:00.000Z';
  return {
    id,
    createdAt: at,
    updatedAt: at,
    professionalId: PRO,
    conversationId: null,
    clientId: null,
    clientName: 'Fulano Silva',
    type: 'encaixe',
    question,
    context: { clientFirstName: 'Fulano', messages: [] },
    options: [
      { id: 'opt-sim', label: 'Sim', action: null },
      { id: 'opt-nao', label: 'Não', action: null },
    ],
    proposedAction: null,
    status: 'pending',
    deadlineAt: '2026-11-14T13:05:00.000Z',
    timeoutNotifiedAt: null,
    resolvedVia: null,
    resolvedOption: null,
    resolvedText: null,
  } as DecisionView;
}

export const D1 = decision('00000000-0000-4000-8000-0000000000d1', 'Marco o Fulano às 15h?');
export const D2 = decision('00000000-0000-4000-8000-0000000000d2', 'Encaixo a Beatriz às 16h?');

export function fakePorts(over: Partial<AlexaPorts> = {}) {
  return {
    professionalIdFromToken: vi.fn(async (t: string) => (t === 'atk-linked-pro-1' ? PRO : null)),
    voiceCommand: vi.fn<AlexaPorts['voiceCommand']>(async (_p, body) => ({
      intent: 'unknown',
      speech: `resposta para: ${body.text}`,
      decisionId: null,
    })),
    listDecisions: vi.fn<AlexaPorts['listDecisions']>(async () => [D1, D2]),
    answerDecision: vi.fn<AlexaPorts['answerDecision']>(async () => ({
      decision: { ...D1, status: 'resolved' },
      spokenConfirmation: 'Marquei o Fulano às 15h.',
      clientMessagePreview: null,
      appointment: null,
    })),
    ...over,
  };
}

export const speech = (r: ResponseEnvelope) =>
  (r.response.outputSpeech as { ssml?: string } | undefined)?.ssml?.replace(/<\/?speak>/g, '') ??
  '';
