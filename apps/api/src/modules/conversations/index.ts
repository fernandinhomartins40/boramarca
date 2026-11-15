import { and, desc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { routes } from '@boramarca/shared';
import { clients, conversations, messages } from '../../db/schema';
import { audit } from '../../lib/audit';
import { AppError, notFound } from '../../lib/errors';
import { route } from '../../lib/route';
import { conversationColumns, messageWire, publishConversation, toConversationView } from './views';

/** GET /conversations, GET/POST /conversations/:id/messages, POST /conversations/:id/handoff. */
const conversationsModule: FastifyPluginAsync = async (app) => {
  const c = routes.conversations;
  const db = app.db;

  const own = async (pid: string, id: string) => {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.professionalId, pid)));
    if (!row) throw notFound('Conversa');
    return row;
  };

  route(app, c.list, async (req) => {
    const pid = req.scope.professionalId;
    const { filter, search, limit } = req.query;
    // shortcut: offset cursor, like /clients; keyset if lists reach thousands.
    const offset = Number(req.query.cursor ?? 0) || 0;
    const where: (SQL | undefined)[] = [eq(conversations.professionalId, pid)];
    if (filter === 'ai' || filter === 'human') where.push(eq(conversations.handler, filter));
    if (filter === 'unread') where.push(gt(conversations.unreadCount, 0));
    if (search) {
      const digits = search.replace(/\D/g, '');
      where.push(
        or(
          ilike(clients.name, `%${search}%`),
          digits ? ilike(clients.phone, `%${digits}%`) : undefined,
        ),
      );
    }
    const rows = await db
      .select(conversationColumns)
      .from(conversations)
      .innerJoin(clients, eq(clients.id, conversations.clientId))
      .where(and(...where))
      .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.createdAt))
      .limit(limit + 1)
      .offset(offset);
    return {
      items: rows.slice(0, limit).map(toConversationView),
      nextCursor: rows.length > limit ? String(offset + limit) : null,
    };
  });

  route(app, c.messages, async (req) => {
    const pid = req.scope.professionalId;
    const conv = await own(pid, req.params.id);
    const offset = Number(req.query.cursor ?? 0) || 0;
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(req.query.limit + 1)
      .offset(offset);
    if (conv.unreadCount > 0) {
      await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conv.id));
      await publishConversation(db, app.bus, pid, conv.id);
    }
    return {
      items: rows.slice(0, req.query.limit).map(messageWire),
      nextCursor: rows.length > req.query.limit ? String(offset + req.query.limit) : null,
    };
  });

  // Sent as the professional, through the send guard like everything else.
  route(app, c.send, async (req) => {
    const pid = req.scope.professionalId;
    const conv = await own(pid, req.params.id);
    const m = await app.messaging.outbox.enqueue({
      professionalId: pid,
      clientId: conv.clientId,
      text: req.body.text,
      purpose: 'reply',
      author: 'professional',
    });
    if (!m) throw new AppError(409, 'NO_SESSION', 'Conecte o WhatsApp para enviar mensagens');
    return messageWire(m);
  });

  route(app, c.handoff, async (req) => {
    const pid = req.scope.professionalId;
    const conv = await own(pid, req.params.id);
    await db
      .update(conversations)
      .set({ handler: req.body.handler })
      .where(eq(conversations.id, conv.id));
    await audit(db, pid, 'professional', 'conversation.handoff', {
      conversationId: conv.id,
      handler: req.body.handler,
    });
    return (await publishConversation(db, app.bus, pid, conv.id))!;
  });
};

export default conversationsModule;
