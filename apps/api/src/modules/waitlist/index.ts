import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { routes, type WaitlistEntryView } from '@boramarca/shared';
import { clients, professionals, services, waitlistEntries, waitlistOffers } from '../../db/schema';
import { audit } from '../../lib/audit';
import { loadPro } from '../../lib/core';
import { hadInboundMessage, hadPastAppointment } from '../whatsapp/send';
import { AppError, notFound } from '../../lib/errors';
import { route } from '../../lib/route';
import { wire } from '../../lib/serialize';

/** CRUD /waitlist, POST /waitlist/:id/offer, PATCH /waitlist/rule (plan section 8). */
const waitlist: FastifyPluginAsync = async (app) => {
  const w = routes.waitlist;
  const db = app.db;
  const svc = () => app.messaging.waitlist;

  async function views(pid: string, ids?: string[]): Promise<WaitlistEntryView[]> {
    const rows = await db
      .select({ e: waitlistEntries, clientName: clients.name, serviceName: services.name })
      .from(waitlistEntries)
      .innerJoin(clients, eq(clients.id, waitlistEntries.clientId))
      .leftJoin(services, eq(services.id, waitlistEntries.serviceId))
      .where(
        and(
          eq(waitlistEntries.professionalId, pid),
          ids ? inArray(waitlistEntries.id, ids) : undefined,
          inArray(waitlistEntries.status, ['waiting', 'offered']),
        ),
      )
      .orderBy(asc(waitlistEntries.optedInAt));
    const offers = rows.length
      ? await db
          .select()
          .from(waitlistOffers)
          .where(
            and(
              inArray(
                waitlistOffers.entryId,
                rows.map((r) => r.e.id),
              ),
              eq(waitlistOffers.status, 'sent'),
              gt(waitlistOffers.expiresAt, app.now()),
            ),
          )
      : [];
    return rows.map((r) => {
      const o = offers.find((x) => x.entryId === r.e.id);
      return {
        ...wire(r.e),
        clientName: r.clientName,
        serviceName: r.serviceName,
        activeOffer: o
          ? wire({
              id: o.id,
              createdAt: o.createdAt,
              updatedAt: o.updatedAt,
              entryId: o.entryId,
              slotStartsAt: o.slotStartsAt,
              expiresAt: o.expiresAt,
              status: o.status,
            })
          : null,
      };
    });
  }
  const one = async (pid: string, id: string) => {
    const [v] = await views(pid, [id]);
    if (!v) throw notFound('Entrada da lista de espera');
    return v;
  };
  const checkRefs = async (pid: string, clientId?: string, serviceId?: string | null) => {
    if (clientId) {
      const [c] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.professionalId, pid)));
      if (!c) throw notFound('Cliente');
    }
    if (serviceId) {
      const [s] = await db
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, serviceId), eq(services.professionalId, pid)));
      if (!s) throw new AppError(400, 'UNKNOWN_SERVICE', 'Serviço não encontrado');
    }
  };

  route(app, w.list, async (req) => {
    const pid = req.scope.professionalId;
    return { items: await views(pid), rule: (await loadPro(db, pid)).p.waitlistRule };
  });

  route(app, w.create, async (req) => {
    const pid = req.scope.professionalId;
    const { clientId, serviceId, preference } = req.body;
    await checkRefs(pid, clientId, serviceId);
    // clientAsked: true is required by the contract ("Só adicione quem pediu para ser avisado").
    // Being on the list lets the guard message this number, so a manual add needs someone who
    // already wrote or was really attended (M8, plan section 7): never a cold contact.
    const [known] = await db
      .select({
        wrote: hadInboundMessage(clientId),
        visited: hadPastAppointment(clientId, app.now()),
      })
      .from(clients)
      .where(eq(clients.id, clientId));
    if (!known?.wrote && !known?.visited)
      throw new AppError(
        409,
        'CLIENT_NEVER_WROTE',
        'Essa pessoa ainda não falou com você pelo WhatsApp. Peça para ela mandar uma mensagem antes.',
      );
    const [e] = await db
      .insert(waitlistEntries)
      .values({ professionalId: pid, clientId, serviceId, preference, optedInAt: app.now() })
      .returning();
    await audit(db, pid, 'professional', 'waitlist.joined', {
      entryId: e!.id,
      clientId,
      sourceMessageId: null,
      manual: true,
    });
    return one(pid, e!.id);
  });

  route(app, w.get, async (req) => one(req.scope.professionalId, req.params.id));

  route(app, w.update, async (req) => {
    const pid = req.scope.professionalId;
    await checkRefs(pid, undefined, req.body.serviceId);
    await one(pid, req.params.id);
    if (Object.keys(req.body).length)
      await db
        .update(waitlistEntries)
        .set(req.body)
        .where(and(eq(waitlistEntries.id, req.params.id), eq(waitlistEntries.professionalId, pid)));
    return one(pid, req.params.id);
  });

  route(app, w.remove, async (req) => {
    const pid = req.scope.professionalId;
    await one(pid, req.params.id);
    const open = await svc().openOfferOf(req.params.id);
    await db
      .update(waitlistEntries)
      .set({ status: 'removed' })
      .where(and(eq(waitlistEntries.id, req.params.id), eq(waitlistEntries.professionalId, pid)));
    // Their open offer closes and the slot goes to the next person.
    if (open) await svc().close(open.id, 'expired');
    await audit(db, pid, 'professional', 'waitlist.removed', { entryId: req.params.id });
    return { ok: true as const };
  });

  route(app, w.offer, async (req) => {
    const o = await svc().manualOffer(
      req.scope.professionalId,
      req.params.id,
      req.body.slotStartsAt,
      req.body.messageText,
    );
    return wire({
      id: o.id,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      entryId: o.entryId,
      slotStartsAt: o.slotStartsAt,
      expiresAt: o.expiresAt,
      status: o.status,
    });
  });

  route(app, w.updateRule, async (req) => {
    const pid = req.scope.professionalId;
    const rule = { ...(await loadPro(db, pid)).p.waitlistRule, ...req.body };
    await db.update(professionals).set({ waitlistRule: rule }).where(eq(professionals.id, pid));
    return rule;
  });
};

export default waitlist;
