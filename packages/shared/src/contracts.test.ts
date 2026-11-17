import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AI_TOOL_NAMES,
  AI_TOOL_PARAMS,
  AiSettingsPatch,
  AiToolCall,
  Autonomy,
  DEFAULT_AUTONOMY,
  DecisionAnswerBody,
  LeadCreate,
  PROFESSIONS,
  REALTIME_EVENT_TYPES,
  RealtimeEvent,
  SUGGESTED_SERVICES,
  SlotsQuery,
  listRoutes,
} from './index';

const uuid = '0b6b0f2e-6b8f-4b8a-9a4e-1f2d3c4b5a69';

describe('route contracts', () => {
  const all = listRoutes();

  it('covers every route group of plan section 9', () => {
    const keys = new Set(all.map((r) => `${r.method} ${r.path}`));
    for (const k of [
      'POST /auth/otp/request',
      'POST /auth/otp/verify',
      'POST /auth/refresh',
      'GET /me',
      'PATCH /me',
      'DELETE /me',
      'POST /leads',
      'GET /services',
      'POST /working-hours',
      'DELETE /time-off/:id',
      'GET /clients/:id/stats',
      'GET /agenda',
      'GET /slots',
      'POST /appointments',
      'GET /appointments/:id',
      'POST /appointments/:id/reschedule',
      'POST /appointments/:id/cancel',
      'POST /appointments/:id/arrive',
      'POST /appointments/:id/done',
      'POST /appointments/:id/no-show',
      'POST /appointments/:id/delay-notice',
      'POST /whatsapp/session',
      'GET /whatsapp/qr',
      'GET /whatsapp/pairing-code',
      'GET /whatsapp/status',
      'DELETE /whatsapp/session',
      'POST /webhooks/whatsapp/:instance',
      'GET /conversations',
      'GET /conversations/:id/messages',
      'POST /conversations/:id/messages',
      'POST /conversations/:id/handoff',
      'GET /decisions',
      'POST /decisions/:id/answer',
      'POST /decisions/:id/take-over',
      'GET /waitlist',
      'POST /waitlist/:id/offer',
      'PATCH /waitlist/rule',
      'POST /ai/pause',
      'POST /ai/resume',
      'PATCH /ai/settings',
      'POST /messages/preview',
      'POST /voice/command',
      'GET /voice/summary',
      'POST /devices',
      'DELETE /devices/:id',
      'GET /salon/day',
      'GET /salon/reports',
      'GET /salon/team',
      'POST /salon/team',
      'GET /salon/clients',
      'GET /salon/plan',
      'POST /kit-leads',
      'POST /alexa/skill',
      'GET /health',
    ])
      expect(keys, k).toContain(k);
  });

  it('has no duplicated method+path', () => {
    const keys = all.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every schema converts to JSON Schema (OpenAPI generation)', () => {
    for (const r of all)
      for (const s of [r.params, r.query, r.body, r.response])
        if (s)
          expect(() => z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' })).not.toThrow();
  });
});

describe('autonomy', () => {
  it('locks change_other_client', () => {
    expect(Autonomy.safeParse({ ...DEFAULT_AUTONOMY, change_other_client: true }).success).toBe(
      false,
    );
    expect(AiSettingsPatch.safeParse({ autonomy: { change_other_client: true } }).success).toBe(
      false,
    );
    expect(AiSettingsPatch.safeParse({ autonomy: { cancel_on_request: false } }).success).toBe(
      true,
    );
  });
});

describe('ai tools', () => {
  it('has the 10 pt-BR tools', () => {
    expect(AI_TOOL_NAMES).toHaveLength(10);
    for (const name of AI_TOOL_NAMES)
      expect(() => z.toJSONSchema(AI_TOOL_PARAMS[name])).not.toThrow();
  });

  it('validates a call', () => {
    const ok = AiToolCall.safeParse({
      name: 'perguntar_ao_profissional',
      arguments: {
        type: 'encaixe',
        question: 'Marco o Fulano às 15h?',
        options: [
          {
            id: 'sim',
            label: 'Sim',
            action: {
              name: 'marcar',
              arguments: { serviceIds: [uuid], startsAt: '2026-11-12T18:00:00Z' },
            },
          },
          { id: 'nao', label: 'Não', action: null },
        ],
        proposedAction: null,
      },
    });
    expect(ok.success).toBe(true);
    expect(AiToolCall.safeParse({ name: 'apagar_tudo', arguments: {} }).success).toBe(false);
  });
});

describe('misc contracts', () => {
  it('has suggested services for every profession', () => {
    for (const p of PROFESSIONS) expect(SUGGESTED_SERVICES[p]).toBeDefined();
  });

  it('parses realtime events by type', () => {
    expect(REALTIME_EVENT_TYPES).toEqual([
      'decision.created',
      'decision.resolved',
      'appointment.changed',
      'message.created',
      'conversation.updated',
      'whatsapp.status',
      'ai.status',
      'account.deleted',
    ]);
    const e = RealtimeEvent.parse({
      type: 'ai.status',
      at: '2026-11-12T12:00:00Z',
      data: { aiEnabled: true, aiPausedUntil: null, pausedIndefinitely: false },
    });
    expect(e.type).toBe('ai.status');
  });

  it('parses comma-separated serviceIds', () => {
    expect(
      SlotsQuery.parse({ date: '2026-11-12', serviceIds: `${uuid},${uuid}` }).serviceIds,
    ).toHaveLength(2);
  });

  it('accepts option or free-text answers', () => {
    expect(DecisionAnswerBody.safeParse({ optionId: 'sim', via: 'voice' }).success).toBe(true);
    expect(
      DecisionAnswerBody.safeParse({ text: 'pode, mas marca daqui 15 minutos', via: 'app' })
        .success,
    ).toBe(true);
    expect(DecisionAnswerBody.safeParse({ optionId: 'sim', via: 'timeout' }).success).toBe(false);
  });

  it('rejects the lead honeypot', () => {
    expect(
      LeadCreate.safeParse({ name: 'Ana', phone: '+5511912345678', website: 'x' }).success,
    ).toBe(false);
    expect(LeadCreate.safeParse({ name: 'Ana', phone: '+5511912345678' }).success).toBe(true);
  });
});
