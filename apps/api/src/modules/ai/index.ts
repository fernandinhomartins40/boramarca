import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { firstName, renderMessage, type MessageParams } from '@boramarca/ia';
import { routes, type AiStatus } from '@boramarca/shared';
import { aiDecisions, clients, professionals } from '../../db/schema';
import { audit } from '../../lib/audit';
import { loadPro } from '../../lib/core';
import { AppError, notFound } from '../../lib/errors';
import { realtimeEvent } from '../../lib/event-bus';
import { route } from '../../lib/route';

type ProRow = typeof professionals.$inferSelect;

/** Same convention as the app: a pause turns `aiEnabled` off; `until: null` = "até eu voltar". */
export const aiStatusOf = (p: Pick<ProRow, 'aiEnabled' | 'aiPausedUntil'>): AiStatus => ({
  aiEnabled: p.aiEnabled,
  aiPausedUntil: p.aiPausedUntil?.toISOString() ?? null,
  pausedIndefinitely: !p.aiEnabled && p.aiPausedUntil === null,
});

/** POST /ai/pause, POST /ai/resume, PATCH /ai/settings, POST /messages/preview. */
const ai: FastifyPluginAsync = async (app) => {
  const a = routes.ai;
  const db = app.db;

  const update = async (
    pid: string,
    set: Partial<typeof professionals.$inferInsert>,
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    const [p] = await db
      .update(professionals)
      .set(set)
      .where(eq(professionals.id, pid))
      .returning();
    if (!p) throw notFound('Profissional');
    await audit(db, pid, 'professional', action, payload);
    await app.bus.publish(pid, realtimeEvent('ai.status', aiStatusOf(p))).catch(() => {});
    return p;
  };

  route(app, a.pause, async (req) => {
    const until = req.body.until ? new Date(req.body.until) : null;
    if (until && until <= app.now())
      throw new AppError(400, 'INVALID_UNTIL', 'Escolha um horário no futuro');
    const p = await update(
      req.scope.professionalId,
      { aiEnabled: false, aiPausedUntil: until },
      'ai.paused',
      {
        until: until?.toISOString() ?? null,
      },
    );
    return aiStatusOf(p);
  });

  route(app, a.resume, async (req) =>
    aiStatusOf(
      await update(
        req.scope.professionalId,
        { aiEnabled: true, aiPausedUntil: null },
        'ai.resumed',
      ),
    ),
  );

  // AiSettingsPatch is strict: `change_other_client` is rejected with 400 (locked, plan section 6).
  route(app, a.updateSettings, async (req) => {
    const pid = req.scope.professionalId;
    const { p: cur } = await loadPro(db, pid);
    const { aiEnabled, aiTone, autonomy } = req.body;
    const p = await update(
      pid,
      {
        // Either way the timed pause is over: switching off must not end when the pause would (M6).
        ...(aiEnabled !== undefined && { aiEnabled, aiPausedUntil: null }),
        ...(aiTone && { aiTone }),
        ...(autonomy && { autonomy: { ...cur.autonomy, ...autonomy, change_other_client: false } }),
      },
      'ai.settings_updated',
      { fields: Object.keys(req.body), autonomy: autonomy ?? null },
    );
    return {
      aiEnabled: p.aiEnabled,
      aiPausedUntil: p.aiPausedUntil?.toISOString() ?? null,
      aiTone: p.aiTone,
      autonomy: p.autonomy,
    };
  });

  route(app, a.messagePreview, async (req) => {
    const pid = req.scope.professionalId;
    const { kind, appointmentId, clientId, decisionId, params = {} } = req.body;
    const pro = await loadPro(db, pid);
    const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : undefined);
    const num = (k: string) => (typeof params[k] === 'number' ? (params[k] as number) : undefined);
    const p: MessageParams = {
      now: app.now().toISOString(),
      timezone: pro.salon.timezone,
      spaceName: pro.salon.name,
      clientFirstName: str('clientFirstName'),
      startsAt: str('startsAt') ?? str('slotStartsAt'),
      previousStartsAt: str('previousStartsAt'),
      serviceName: str('serviceName'),
      delayMinutes: num('delayMinutes'),
      expiresInMinutes: num('expiresInMinutes') ?? pro.p.waitlistRule.waitMinutes,
    };
    if (appointmentId) {
      const v = await app.agenda.getAppointment(pid, appointmentId);
      p.clientFirstName = firstName(v.clientName);
      p.startsAt ??= v.startsAt;
      p.serviceName ??= v.services.map((s) => s.name).join(' + ') || undefined;
    }
    if (clientId) {
      const [c] = await db
        .select({ name: clients.name })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.professionalId, pid)));
      if (!c) throw notFound('Cliente');
      p.clientFirstName = firstName(c.name);
    }
    if (decisionId) {
      const [d] = await db
        .select()
        .from(aiDecisions)
        .where(and(eq(aiDecisions.id, decisionId), eq(aiDecisions.professionalId, pid)));
      if (!d) throw notFound('Decisão');
      p.clientFirstName ??= d.context.clientFirstName;
      const pa = d.proposedAction;
      if (pa?.name === 'marcar' || pa?.name === 'remarcar') p.startsAt ??= pa.arguments.startsAt;
    }
    return { text: renderMessage(kind, req.body.tone ?? pro.p.aiTone, p) };
  });
};

export default ai;
