// Store review account (plan section 9): REVIEW_PHONE + REVIEW_OTP log into a solo space with
// sample data and the simulated WhatsApp (instance `demo-<id>`, see modules/whatsapp/gateway.ts).
// Idempotent: `ensureReviewAccount` creates it when missing (also after the reviewer deletes it)
// and refreshes it when the agenda of today is empty, so the reviewer always finds a full day.
import { and, eq, gte, lt } from 'drizzle-orm';
import { DEFAULT_TIMEZONE, type AppointmentStatus } from '@boramarca/shared';
import { AppError } from '../lib/errors';
import { addDays, dayBounds, todayIn, zonedToUtc } from '../lib/time';
import type { Db } from './client';
import * as t from './schema';

/** Marks the space as the review one: any other account with REVIEW_PHONE is never touched. */
export const REVIEW_SALON_NAME = 'Espaço Demonstração (revisão)';
const TZ = DEFAULT_TIMEZONE;

export async function ensureReviewAccount(db: Db, phone: string, now = new Date()) {
  const [row] = await db
    .select({ p: t.professionals, salon: t.salons })
    .from(t.professionals)
    .innerJoin(t.salons, eq(t.salons.id, t.professionals.salonId))
    .where(eq(t.professionals.phone, phone));
  if (row && row.salon.name !== REVIEW_SALON_NAME)
    // REVIEW_PHONE must not be a real account: the fixed code would open it.
    throw new AppError(403, 'REVIEW_PHONE_IN_USE', 'Conta de demonstração indisponível');
  if (row) {
    const { start, end } = dayBounds(todayIn(TZ, now), TZ);
    const [today] = await db
      .select({ id: t.appointments.id })
      .from(t.appointments)
      .where(
        and(
          eq(t.appointments.professionalId, row.p.id),
          gte(t.appointments.startsAt, start),
          lt(t.appointments.startsAt, end),
        ),
      )
      .limit(1);
    if (today) return { professionalId: row.p.id, salonId: row.salon.id, role: row.p.role };
    await db.delete(t.salons).where(eq(t.salons.id, row.salon.id)); // cascades
  }
  return seedReviewAccount(db, phone, now);
}

async function seedReviewAccount(db: Db, phone: string, now: Date) {
  const today = todayIn(TZ, now);
  const tomorrow = addDays(today, 1);
  return db.transaction(async (tx) => {
    const [salon] = await tx
      .insert(t.salons)
      .values({ name: REVIEW_SALON_NAME, plan: 'essencial', timezone: TZ })
      .returning();
    const [p] = await tx
      .insert(t.professionals)
      .values({
        salonId: salon!.id,
        role: 'owner',
        name: 'Ana Demonstração',
        phone,
        professions: ['esteticista'],
        address: 'Rua de Exemplo, 100 — São Paulo',
        welcomeMessage: 'Oi! Aqui é a assistente da Ana. Como posso ajudar?',
      })
      .returning();
    const pid = p!.id;
    await tx.insert(t.workingHours).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        professionalId: pid,
        weekday,
        start: '08:00',
        end: '19:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
      })),
    );
    const svc = { name: 'Limpeza de pele', durationMin: 60, priceCents: 12000 };
    const [s] = await tx
      .insert(t.services)
      .values({ professionalId: pid, ...svc, position: 0 })
      .returning();
    await tx.insert(t.services).values({
      professionalId: pid,
      name: 'Avaliação',
      durationMin: 30,
      priceCents: 6000,
      position: 1,
    });

    // Fictitious clients: the demo WhatsApp never delivers to these numbers.
    const names = ['Beatriz Lima', 'Carla Nunes', 'Daniel Rocha', 'Elisa Prado', 'Fábio Melo'];
    const cs = await tx
      .insert(t.clients)
      .values(
        names.map((name, i) => ({
          professionalId: pid,
          name,
          phone: `+551199990000${i}`,
          origin: 'whatsapp' as const,
          firstContactAt: zonedToUtc(addDays(today, -60), '10:00', TZ),
        })),
      )
      .returning();

    // Today: past slots done, the next confirmed, later ones scheduled, one cancellation.
    let future = 0;
    const plan: [number, string, AppointmentStatus | null][] = [
      [1, '09:00', null],
      [2, '10:30', null],
      [3, '11:00', 'cancelled'],
      [4, '14:00', null],
      [0, '17:00', null],
    ];
    for (const [ci, hhmm, fixed] of plan) {
      const startsAt = zonedToUtc(today, hhmm, TZ);
      const status: AppointmentStatus =
        fixed ?? (startsAt <= now ? 'done' : future++ === 0 ? 'confirmed' : 'scheduled');
      const [a] = await tx
        .insert(t.appointments)
        .values({
          professionalId: pid,
          clientId: cs[ci]!.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + svc.durationMin * 60_000),
          status,
          origin: 'ai',
          priceCents: svc.priceCents,
          cancelReason: status === 'cancelled' ? 'Cliente pediu' : null,
        })
        .returning();
      await tx
        .insert(t.appointmentServices)
        .values({ appointmentId: a!.id, serviceId: s!.id, ...svc });
      await tx.insert(t.appointmentEvents).values({
        appointmentId: a!.id,
        type: 'booked',
        description: 'Marcado pela IA via WhatsApp',
        actor: 'ai',
        createdAt: new Date(startsAt.getTime() - 86_400_000),
      });
    }

    // A client asks for tomorrow 10h -> pending Decision the reviewer can answer.
    const [conv] = await tx
      .insert(t.conversations)
      .values({
        professionalId: pid,
        clientId: cs[0]!.id,
        handler: 'ai',
        unreadCount: 1,
        lastMessageAt: now,
      })
      .returning();
    const msgs = await tx
      .insert(t.messages)
      .values([
        {
          conversationId: conv!.id,
          direction: 'in' as const,
          author: 'client' as const,
          text: 'Oi! Consigo amanhã às 10h?',
          aiNote: 'Entendi como: pedido de horário amanhã às 10h',
          createdAt: new Date(now.getTime() - 60_000),
        },
        {
          conversationId: conv!.id,
          direction: 'out' as const,
          author: 'ai' as const,
          text: 'Vou ver aqui e já te falo!',
          createdAt: now,
        },
      ])
      .returning();
    const book = {
      name: 'marcar' as const,
      arguments: {
        serviceIds: [s!.id],
        startsAt: zonedToUtc(tomorrow, '10:00', TZ).toISOString(),
        isFitIn: false,
      },
    };
    await tx.insert(t.aiDecisions).values({
      professionalId: pid,
      conversationId: conv!.id,
      clientId: cs[0]!.id,
      type: 'novo_horario',
      question: 'Beatriz pode vir amanhã às 10h?',
      context: {
        clientFirstName: 'Beatriz',
        messages: msgs.map((m) => ({
          author: m.author,
          text: m.text ?? '',
          at: m.createdAt.toISOString(),
        })),
      },
      options: [
        { id: 'sim', label: 'Sim', action: book },
        { id: 'nao', label: 'Não', action: null },
      ],
      proposedAction: book,
      status: 'pending',
      deadlineAt: new Date(now.getTime() + 10 * 60_000),
    });
    return { professionalId: pid, salonId: salon!.id, role: p!.role };
  });
}
