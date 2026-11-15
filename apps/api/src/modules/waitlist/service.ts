// Automatic waitlist (plan section 8): when a slot opens, the oldest opted-in entry whose preference
// matches gets the offer; nobody else is offered that slot until the offer expires
// (`waitlist_rule.wait_minutes`) or is declined, then the next one is tried. Only people who asked
// are on the list (`opted_in_at`, `source_message_id` or manual add). Offers leave through the
// send guard with `purpose: 'waitlist_offer'` (one active offer per slot is re-checked there).
import { and, asc, desc, eq, gt, inArray, lt, notInArray, sql } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { firstName, renderMessage } from '@boramarca/ia';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type DayPeriod,
  type WaitlistPreference,
} from '@boramarca/shared';
import type { Tx } from '../../db/client';
import { appointments, clients, services, waitlistEntries, waitlistOffers } from '../../db/schema';
import { audit } from '../../lib/audit';
import { loadPro, type Core } from '../../lib/core';
import { AppError, notFound } from '../../lib/errors';
import { utcToZoned, weekdayOf } from '../../lib/time';
import type { Outbox } from '../whatsapp/send';

const MIN = 60_000;
type Offer = typeof waitlistOffers.$inferSelect;
type Entry = typeof waitlistEntries.$inferSelect;

export interface FreedSlot {
  professionalId: string;
  startsAt: string;
  endsAt: string;
  serviceIds: string[];
}

export const offerJobId = (offerId: string) => `wl-expire-${offerId}`;

const PERIODS: Record<DayPeriod, [number, number]> = {
  manha: [0, 12 * 60],
  tarde: [12 * 60, 18 * 60],
  noite: [18 * 60, 24 * 60],
};

/** Does a slot starting at `start` (salon timezone) fit "qualquer dia à tarde", "só sábado"...? */
export function matchesPreference(pref: WaitlistPreference, start: Date, tz: string) {
  const local = utcToZoned(start, tz);
  if (pref.weekdays.length && !pref.weekdays.includes(weekdayOf(local.date))) return false;
  if (
    pref.periods.length &&
    !pref.periods.some((p) => local.minutes >= PERIODS[p][0] && local.minutes < PERIODS[p][1])
  )
    return false;
  return true;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const DECLINE = /^(n|nao|agora nao|dessa vez nao)( |$)|\bnao (quero|posso|vou|consigo|da)\b/;
const ACCEPT =
  /^(sim|s|quero|aceito|pode|claro|fechado|ok|okay|beleza|bora|opa|isso|com certeza|perfeito|otimo)( |$)/;

export function createWaitlist(core: Core, deps: { outbox: Outbox }) {
  const { db, queues } = core;
  const queue = queues.queues.waitlist;

  async function activeOfferOnSlot(x: Tx, professionalId: string, start: Date) {
    const [o] = await x
      .select({ id: waitlistOffers.id })
      .from(waitlistOffers)
      .innerJoin(waitlistEntries, eq(waitlistEntries.id, waitlistOffers.entryId))
      .where(
        and(
          eq(waitlistEntries.professionalId, professionalId),
          eq(waitlistOffers.slotStartsAt, start),
          eq(waitlistOffers.status, 'sent'),
          gt(waitlistOffers.expiresAt, core.now()),
        ),
      )
      .limit(1);
    return o ?? null;
  }

  async function slotBusy(x: Tx, professionalId: string, start: Date, end: Date) {
    const [a] = await x
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.professionalId, professionalId),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
          lt(appointments.startsAt, end),
          gt(appointments.endsAt, start),
        ),
      )
      .limit(1);
    return Boolean(a);
  }

  /**
   * Picks who gets the slot and records the offer. Automatic: oldest matching entry not yet
   * offered this slot (null when nobody fits). Manual (`entryId`): that entry, errors as 409.
   */
  async function createOffer(slot: FreedSlot, waitMinutes: number, tz: string, entryId?: string) {
    const pid = slot.professionalId;
    const start = new Date(slot.startsAt);
    const end = new Date(slot.endsAt);
    const fail = (code: string, msg: string) => {
      if (entryId) throw new AppError(409, code, msg);
      return null;
    };
    return db.transaction(async (tx) => {
      // One decision per slot at a time, even when two hooks fire together.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`wl:${pid}:${slot.startsAt}`}))`,
      );
      if (start <= core.now()) return fail('SLOT_PASSED', 'Esse horário já passou');
      if (await slotBusy(tx, pid, start, end))
        return fail('SLOT_TAKEN', 'Esse horário não está mais livre');
      if (await activeOfferOnSlot(tx, pid, start))
        return fail('SLOT_ALREADY_OFFERED', 'Essa vaga já foi oferecida a outra pessoa');
      const tried = tx
        .select({ id: waitlistOffers.entryId })
        .from(waitlistOffers)
        .where(eq(waitlistOffers.slotStartsAt, start));
      const candidates = await tx
        .select()
        .from(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.professionalId, pid),
            entryId
              ? eq(waitlistEntries.id, entryId)
              : and(eq(waitlistEntries.status, 'waiting'), notInArray(waitlistEntries.id, tried)),
          ),
        )
        .orderBy(asc(waitlistEntries.optedInAt));
      const own = candidates.flatMap((c) => (c.serviceId ? [c.serviceId] : []));
      const svc = own.length
        ? await tx
            .select()
            .from(services)
            .where(and(inArray(services.id, own), eq(services.active, true)))
        : [];
      const slotMin = (end.getTime() - start.getTime()) / MIN;
      let chosen: { entry: Entry; serviceIds: string[] } | null = null;
      for (const entry of candidates) {
        if (entryId && entry.status !== 'waiting')
          return fail('ENTRY_NOT_WAITING', 'Essa pessoa já tem uma oferta em aberto');
        let serviceIds = slot.serviceIds;
        if (entry.serviceId) {
          const s = svc.find((x) => x.id === entry.serviceId);
          if (!s || (!entryId && s.durationMin > slotMin)) continue;
          serviceIds = [s.id];
        }
        if (!serviceIds.length) continue;
        if (!entryId && !matchesPreference(entry.preference, start, tz)) continue;
        chosen = { entry, serviceIds };
        break;
      }
      if (!chosen) return entryId ? fail('NO_SERVICE', 'Escolha um serviço para a oferta') : null;
      const [offer] = await tx
        .insert(waitlistOffers)
        .values({
          entryId: chosen.entry.id,
          slotStartsAt: start,
          slotEndsAt: end,
          serviceIds: chosen.serviceIds,
          expiresAt: new Date(core.now().getTime() + waitMinutes * MIN),
        })
        .returning();
      await tx
        .update(waitlistEntries)
        .set({ status: 'offered' })
        .where(eq(waitlistEntries.id, chosen.entry.id));
      return { offer: offer!, entry: chosen.entry };
    });
  }

  /** Offers `slot` to the next person in line. Returns the offer, or null if nobody fits. */
  async function offerNext(slot: FreedSlot, opts: { entryId?: string; messageText?: string } = {}) {
    const pro = await loadPro(db, slot.professionalId);
    const rule = pro.p.waitlistRule;
    if (!rule.enabled && !opts.entryId) return null;
    const tz = pro.salon.timezone;
    const made = await createOffer(slot, rule.waitMinutes, tz, opts.entryId);
    if (!made) return null;
    const { offer, entry } = made;
    const [c] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, entry.clientId));
    const svcNames = await db
      .select({ name: services.name })
      .from(services)
      .where(inArray(services.id, offer.serviceIds));
    const text =
      opts.messageText ??
      renderMessage('waitlist_offer', pro.p.aiTone, {
        now: core.now().toISOString(),
        timezone: tz,
        clientFirstName: firstName(c?.name ?? 'Cliente'),
        startsAt: offer.slotStartsAt.toISOString(),
        serviceName: svcNames.map((s) => s.name).join(' + ') || undefined,
        expiresInMinutes: rule.waitMinutes,
      });
    const m = await deps.outbox.enqueue({
      professionalId: slot.professionalId,
      clientId: entry.clientId,
      text,
      purpose: 'waitlist_offer',
      author: opts.messageText ? 'professional' : 'ai',
      waitlistSlotStartsAt: offer.slotStartsAt.toISOString(),
    });
    if (!m) {
      // No WhatsApp session: nobody can be offered anything, so the chain stops here.
      await settle(offer, 'expired');
      return null;
    }
    await queue.add(
      'expire',
      { offerId: offer.id },
      { jobId: offerJobId(offer.id), delay: rule.waitMinutes * MIN },
    );
    await audit(
      db,
      slot.professionalId,
      opts.entryId ? 'professional' : 'system',
      'waitlist.offer_sent',
      {
        offerId: offer.id,
        entryId: entry.id,
        clientId: entry.clientId,
        slotStartsAt: offer.slotStartsAt.toISOString(),
      },
    );
    return offer;
  }

  /** Closes a still-open offer; the entry goes back to waiting. False if it was already closed. */
  async function settle(offer: Offer, status: 'expired' | 'declined') {
    const [o] = await db
      .update(waitlistOffers)
      .set({ status })
      .where(and(eq(waitlistOffers.id, offer.id), eq(waitlistOffers.status, 'sent')))
      .returning();
    if (!o) return false;
    await db
      .update(waitlistEntries)
      .set({ status: 'waiting' })
      .where(and(eq(waitlistEntries.id, o.entryId), eq(waitlistEntries.status, 'offered')));
    await queue.remove(offerJobId(o.id)).catch(() => 0);
    return true;
  }

  async function ownerOf(offer: Offer) {
    const [e] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, offer.entryId));
    return e!;
  }

  /** No answer in time, or "não": close it and offer the same slot to the next person. */
  async function close(offerId: string, status: 'expired' | 'declined') {
    const [offer] = await db.select().from(waitlistOffers).where(eq(waitlistOffers.id, offerId));
    if (!offer || !(await settle(offer, status))) return null;
    const entry = await ownerOf(offer);
    await audit(
      db,
      entry.professionalId,
      status === 'declined' ? 'client' : 'system',
      `waitlist.offer_${status}`,
      {
        offerId,
        entryId: entry.id,
      },
    );
    return offerNext({
      professionalId: entry.professionalId,
      startsAt: offer.slotStartsAt.toISOString(),
      endsAt: offer.slotEndsAt.toISOString(),
      serviceIds: offer.serviceIds,
    });
  }

  /** "Sim": book the slot through the agenda (conflicts re-checked) and confirm to the client. */
  async function accept(offer: Offer, entry: Entry) {
    const [claimed] = await db
      .update(waitlistOffers)
      .set({ status: 'accepted' })
      .where(and(eq(waitlistOffers.id, offer.id), eq(waitlistOffers.status, 'sent')))
      .returning();
    if (!claimed) return;
    await queue.remove(offerJobId(offer.id)).catch(() => 0);
    const pid = entry.professionalId;
    const pro = await loadPro(db, pid);
    const params = { now: core.now().toISOString(), timezone: pro.salon.timezone };
    try {
      const v = await core.agenda.book(
        { professionalId: pid, actor: 'ai' },
        { clientId: entry.clientId, serviceIds: offer.serviceIds, startsAt: offer.slotStartsAt },
      );
      await db
        .update(waitlistEntries)
        .set({ status: 'booked' })
        .where(eq(waitlistEntries.id, entry.id));
      await audit(db, pid, 'client', 'waitlist.offer_accepted', {
        offerId: offer.id,
        appointmentId: v.id,
      });
      await deps.outbox.enqueue({
        professionalId: pid,
        clientId: entry.clientId,
        purpose: 'reply',
        author: 'ai',
        text: renderMessage('booking_confirmation', pro.p.aiTone, {
          ...params,
          clientFirstName: firstName(v.clientName),
          startsAt: v.startsAt,
          serviceName: v.services.map((s) => s.name).join(' + ') || undefined,
        }),
      });
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      await db
        .update(waitlistOffers)
        .set({ status: 'expired' })
        .where(eq(waitlistOffers.id, offer.id));
      await db
        .update(waitlistEntries)
        .set({ status: 'waiting' })
        .where(eq(waitlistEntries.id, entry.id));
      await audit(db, pid, 'system', 'waitlist.offer_failed', {
        offerId: offer.id,
        code: err.code,
      });
      const [c] = await db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, entry.clientId));
      await deps.outbox.enqueue({
        professionalId: pid,
        clientId: entry.clientId,
        purpose: 'reply',
        author: 'ai',
        text: renderMessage('decision_expired', pro.p.aiTone, {
          ...params,
          clientFirstName: firstName(c?.name ?? 'Cliente'),
          startsAt: offer.slotStartsAt.toISOString(),
        }),
      });
    }
  }

  /**
   * Inbound hook: a client with an open offer answered. Clear "sim"/"não" are handled here
   * (true); anything else goes to the AI as usual (false).
   */
  async function handleClientReply(professionalId: string, clientId: string, text: string) {
    const [row] = await db
      .select({ offer: waitlistOffers, entry: waitlistEntries })
      .from(waitlistOffers)
      .innerJoin(waitlistEntries, eq(waitlistEntries.id, waitlistOffers.entryId))
      .where(
        and(
          eq(waitlistEntries.professionalId, professionalId),
          eq(waitlistEntries.clientId, clientId),
          eq(waitlistOffers.status, 'sent'),
          gt(waitlistOffers.expiresAt, core.now()),
        ),
      )
      .orderBy(desc(waitlistOffers.createdAt))
      .limit(1);
    if (!row) return false;
    const t = normalize(text);
    if (DECLINE.test(t)) {
      await deps.outbox.enqueue({
        professionalId,
        clientId,
        purpose: 'reply',
        author: 'ai',
        text: 'Tudo bem! Você continua na lista de espera e eu aviso quando abrir outra vaga.',
      });
      await close(row.offer.id, 'declined');
      return true;
    }
    if (ACCEPT.test(t)) {
      await accept(row.offer, row.entry);
      return true;
    }
    return false;
  }

  /** POST /waitlist/:id/offer ("Oferecer vaga agora"): this entry, ignoring order and preference. */
  async function manualOffer(
    professionalId: string,
    entryId: string,
    slotStartsAt: string,
    messageText?: string,
  ) {
    const [entry] = await db
      .select()
      .from(waitlistEntries)
      .where(
        and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.professionalId, professionalId)),
      );
    if (!entry || entry.status === 'removed') throw notFound('Entrada da lista de espera');
    const [svc] = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.professionalId, professionalId),
          eq(services.active, true),
          entry.serviceId ? eq(services.id, entry.serviceId) : undefined,
        ),
      )
      .orderBy(asc(services.position))
      .limit(1);
    if (!svc) throw new AppError(400, 'NO_SERVICE', 'Cadastre um serviço antes de oferecer a vaga');
    const start = new Date(slotStartsAt);
    const offer = await offerNext(
      {
        professionalId,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + svc.durationMin * MIN).toISOString(),
        serviceIds: [svc.id],
      },
      { entryId, messageText },
    );
    if (!offer) throw new AppError(409, 'NO_SESSION', 'Conecte o WhatsApp para oferecer a vaga');
    return offer;
  }

  /** The open offer of an entry, if any (removing an entry closes it and moves on). */
  async function openOfferOf(entryId: string) {
    const [o] = await db
      .select()
      .from(waitlistOffers)
      .where(and(eq(waitlistOffers.entryId, entryId), eq(waitlistOffers.status, 'sent')))
      .limit(1);
    return o ?? null;
  }

  async function process(job: Job<{ offerId: string }>) {
    if (job.name === 'expire') await close(job.data.offerId, 'expired');
  }

  return { offerNext, close, accept, handleClientReply, manualOffer, openOfferOf, process };
}
export type Waitlist = ReturnType<typeof createWaitlist>;
