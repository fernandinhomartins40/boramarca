// Account deletion (plan section 9, DELETE /me): disconnects and deletes the WhatsApp instance,
// removes queued jobs, erases the professional and everything of their clients (cascade from
// `professionals`), and keeps only the minimal `account_deletions` record.
import { createHmac } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { WhatsAppGatewayError } from '@boramarca/whatsapp';
import { OWNER_HAS_TEAM_ERROR, type AccountDeletionOrigin } from '@boramarca/shared';
import {
  accountDeletions,
  aiDecisions,
  appointments,
  conversations,
  leads,
  messages,
  otpCodes,
  professionals,
  salons,
  waitlistEntries,
  waitlistOffers,
  whatsappSessions,
} from '../../db/schema';
import type { Core } from '../../lib/core';
import { realtimeEvent } from '../../lib/event-bus';
import { AppError, notFound } from '../../lib/errors';
import { reminderJobId } from '../agenda/reminders';
import { offerJobId } from '../waitlist/service';

/** Not reversible: an HMAC, so the record proves the request without storing the phone. */
export const phoneHash = (secret: string, phone: string) =>
  createHmac('sha256', secret).update(`account_deletion:${phone}`).digest('hex');

/**
 * Erases one professional. The WhatsApp instance goes first: if the provider fails, nothing is
 * deleted and the caller can try again (no half-erased account with a live instance).
 */
export async function eraseProfessional(core: Core, professionalId: string) {
  const { db, queues, gateway } = core;
  const [p] = await db.select().from(professionals).where(eq(professionals.id, professionalId));
  if (!p) throw notFound('Profissional');
  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.professionalId, professionalId));
  if (session) {
    await gateway.disconnect(session.instanceName).catch(() => {});
    try {
      await gateway.deleteInstance(session.instanceName);
    } catch (err) {
      if (!(err instanceof WhatsAppGatewayError && err.code === 'not_found'))
        throw new AppError(502, 'WHATSAPP_UNAVAILABLE', 'O WhatsApp não respondeu. Tente de novo.');
    }
  }

  // Jobs carry phones and texts in Redis: remove them too.
  const [msgIds, apptIds, decisionIds, offerIds] = await Promise.all([
    db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.professionalId, professionalId)),
    db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.professionalId, professionalId)),
    db
      .select({ id: aiDecisions.id })
      .from(aiDecisions)
      .where(eq(aiDecisions.professionalId, professionalId)),
    db
      .select({ id: waitlistOffers.id })
      .from(waitlistOffers)
      .innerJoin(waitlistEntries, eq(waitlistEntries.id, waitlistOffers.entryId))
      .where(eq(waitlistEntries.professionalId, professionalId)),
  ]);
  const q = queues.queues;
  await Promise.allSettled([
    ...msgIds.flatMap((m) => [q.inbound.remove(m.id), q.outbound.remove(m.id)]),
    ...apptIds.map((a) => q.reminders.remove(reminderJobId(a.id))),
    ...decisionIds.flatMap((d) => [
      q.decisions.remove(`timeout-${d.id}`),
      q.decisions.remove(`expire-${d.id}`),
    ]),
    ...offerIds.map((o) => q.waitlist.remove(offerJobId(o.id))),
  ]);

  await db.transaction(async (tx) => {
    // Cascades: devices, services, hours, time off, clients (appointments, conversations,
    // messages, waitlist), decisions, sessions, audit log, kit leads.
    await tx.delete(professionals).where(eq(professionals.id, professionalId));
    await tx.delete(otpCodes).where(eq(otpCodes.phone, p.phone));
    await tx.delete(leads).where(eq(leads.phone, p.phone));
  });
  // Open WebSockets of this professional close now, not when their token expires (B8).
  await core.bus
    .publish(professionalId, realtimeEvent('account.deleted', {}))
    .catch((err: unknown) => core.log.warn({ err }, 'account.deleted not published'));
  return p;
}

export async function deleteAccount(
  core: Core,
  professionalId: string,
  opts: { origin: AccountDeletionOrigin; transferOwnershipTo?: string; deleteWholeSalon?: boolean },
  /** Runs after the request is validated, before anything changes (checks the code). */
  confirm: () => Promise<void> = async () => {},
) {
  const { db } = core;
  const requestedAt = core.now();
  const [me] = await db.select().from(professionals).where(eq(professionals.id, professionalId));
  if (!me) throw notFound('Profissional');
  const team = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.salonId, me.salonId), ne(professionals.id, me.id)));

  let erase = [me.id];
  let dropSalon = team.length === 0;
  let heirId: string | null = null;
  if (me.role === 'owner' && team.length > 0) {
    if (opts.deleteWholeSalon) {
      erase = [...team.map((t) => t.id), me.id];
      dropSalon = true;
    } else if (opts.transferOwnershipTo) {
      const heir = team.find((t) => t.id === opts.transferOwnershipTo);
      if (!heir) throw new AppError(400, 'INVALID_TRANSFER', 'Escolha alguém da sua equipe');
      heirId = heir.id;
    } else
      throw new AppError(
        409,
        OWNER_HAS_TEAM_ERROR,
        'Você tem equipe neste espaço. Passe a posse para alguém ou confirme a exclusão do espaço inteiro.',
        { team: team.map((t) => ({ id: t.id, name: t.name })) },
      );
  }

  await confirm();
  // Read before anything is erased: the deletion receipt needs the salon timezone.
  const [salon] = await db.select().from(salons).where(eq(salons.id, me.salonId));
  if (heirId)
    await db.update(professionals).set({ role: 'owner' }).where(eq(professionals.id, heirId));
  const erased = [];
  for (const id of erase) erased.push(await eraseProfessional(core, id));
  // The salon goes away: stop charging it (best effort; a failure is logged for a manual cancel).
  if (dropSalon && salon?.asaasSubscriptionId)
    await core.asaas
      .deleteSubscription(salon.asaasSubscriptionId)
      .catch((err: unknown) =>
        core.log.error({ err, salonId: salon.id }, 'cobrança: assinatura NÃO cancelada no Asaas'),
      );
  if (dropSalon) await db.delete(salons).where(eq(salons.id, me.salonId));
  const completedAt = core.now();
  await db.insert(accountDeletions).values(
    erased.map((p) => ({
      phoneHash: phoneHash(core.config.JWT_ACCESS_SECRET, p.phone),
      requestedAt,
      completedAt,
      origin: opts.origin,
    })),
  );
  // Deletion receipt to each confirmed address. The address comes from the row read before the
  // erase and now lives only in this queued mail (removed from Redis once delivered).
  for (const p of erased)
    if (p.email && p.emailVerifiedAt)
      await core.mail
        .send({
          to: p.email,
          ...core.mailTemplates.accountDeleted({
            name: p.name,
            completedAt,
            timezone: salon?.timezone,
          }),
        })
        .catch((err: unknown) => core.log.error({ err }, 'deletion receipt not queued'));
  return { ok: true as const, completedAt: completedAt.toISOString() };
}

/** Removes a team member (owner panel): same erase, the salon stays. */
export async function removeTeamMember(core: Core, salonId: string, memberId: string) {
  const [m] = await core.db
    .select()
    .from(professionals)
    .where(and(eq(professionals.id, memberId), eq(professionals.salonId, salonId)));
  if (!m) throw notFound('Profissional');
  if (m.role === 'owner')
    throw new AppError(409, 'CANNOT_REMOVE_OWNER', 'O dono não pode ser removido aqui');
  await eraseProfessional(core, m.id);
}
