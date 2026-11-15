// Demo seed (plan section 16): "Espaço Aurora", Marina (owner, fisioterapia) and team, 12 clients
// of Marina, today's agenda from the references (04-agenda, 05-agendamentos, 10-clientes,
// 12-web-agenda) with two cancellations and a pending fit-in decision (Beatriz at 16h).
// Dates are relative to "today" in America/Sao_Paulo. Re-runnable: it replaces the demo salon.
//
// Login: phone +5511900000001 (Marina), code 123456 (outside production).
// `seedDemo(db, now)` is also used by the report tests with a fixed clock.
import { inArray } from 'drizzle-orm';
import {
  AiDecision,
  DEFAULT_TIMEZONE,
  type AppointmentStatus,
  type Profession,
} from '@boramarca/shared';
import { addDays, todayIn, zonedToUtc } from '../lib/time';
import type { Db } from './client';
import * as t from './schema';

export const DEMO_PHONES = {
  marina: '+5511900000001',
  camila: '+5511900000002',
  julia: '+5511900000003',
  pedro: '+5511900000004',
} as const;

const TZ = DEFAULT_TIMEZONE;

export async function seedDemo(db: Db, now = new Date()) {
  const today = todayIn(TZ, now);
  const at = (hhmm: string, date = today) => zonedToUtc(date, hhmm, TZ);
  const minutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

  // Replace any previous demo data (cascades to everything of those professionals).
  const old = await db
    .select({ salonId: t.professionals.salonId })
    .from(t.professionals)
    .where(inArray(t.professionals.phone, Object.values(DEMO_PHONES)));
  if (old.length)
    await db.delete(t.salons).where(
      inArray(
        t.salons.id,
        old.map((o) => o.salonId),
      ),
    );

  const [salon] = await db
    .insert(t.salons)
    .values({ name: 'Espaço Aurora', plan: 'salao', timezone: TZ })
    .returning();

  interface Member {
    key: keyof typeof DEMO_PHONES;
    name: string;
    profession: Profession;
    service: { name: string; durationMin: number; priceCents: number };
  }
  const members: Member[] = [
    {
      key: 'marina',
      name: 'Marina Costa',
      profession: 'fisioterapeuta',
      service: { name: 'Sessão de fisioterapia', durationMin: 50, priceCents: 15000 },
    },
    {
      key: 'camila',
      name: 'Camila',
      profession: 'psicologo',
      service: { name: 'Sessão de psicologia', durationMin: 60, priceCents: 20000 },
    },
    {
      key: 'julia',
      name: 'Júlia',
      profession: 'esteticista',
      service: { name: 'Limpeza de pele', durationMin: 60, priceCents: 12000 },
    },
    {
      key: 'pedro',
      name: 'Pedro',
      profession: 'dentista',
      service: { name: 'Avaliação odontológica', durationMin: 60, priceCents: 15000 },
    },
  ];

  const pros: Record<string, { id: string; serviceId: string; service: Member['service'] }> = {};
  for (const m of members) {
    const [p] = await db
      .insert(t.professionals)
      .values({
        salonId: salon!.id,
        role: m.key === 'marina' ? 'owner' : 'professional',
        name: m.name,
        phone: DEMO_PHONES[m.key],
        professions: [m.profession],
        address: 'Rua das Flores, 120 — Vila Mariana, São Paulo',
        welcomeMessage:
          m.key === 'marina' ? 'Oi! Aqui é a assistente da Marina. Como posso ajudar?' : null,
      })
      .returning();
    // Mon–Sat 08:00–19:00, lunch 12:00–13:00.
    await db.insert(t.workingHours).values(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        professionalId: p!.id,
        weekday,
        start: '08:00',
        end: '19:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
      })),
    );
    const [s] = await db
      .insert(t.services)
      .values({ professionalId: p!.id, ...m.service, position: 0 })
      .returning();
    await db.insert(t.services).values({
      professionalId: p!.id,
      name: m.key === 'marina' ? 'Avaliação' : 'Retorno',
      durationMin: 60,
      priceCents: 18000,
      position: 1,
    });
    pros[m.key] = { id: p!.id, serviceId: s!.id, service: m.service };
  }
  // Today must be a working day for the demo even on Sunday.
  const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (todayWeekday === 0)
    await db.insert(t.workingHours).values(
      Object.values(pros).map((p) => ({
        professionalId: p.id,
        weekday: 0,
        start: '08:00',
        end: '19:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
      })),
    );

  let phoneSeq = 0;
  async function client(proKey: string, name: string, notes: string[] = []) {
    phoneSeq += 1;
    const [c] = await db
      .insert(t.clients)
      .values({
        professionalId: pros[proKey]!.id,
        name,
        phone: `+55119880000${String(phoneSeq).padStart(2, '0')}`,
        preferences: { notes },
        origin: 'whatsapp',
        firstContactAt: at('10:00', addDays(today, -120)),
      })
      .returning();
    return c!.id;
  }

  async function appointment(
    proKey: string,
    clientId: string,
    startsAt: Date,
    status: AppointmentStatus,
    opts: {
      origin?: 'ai' | 'professional';
      cancelReason?: string;
      cancelledMinutesAgo?: number;
    } = {},
  ) {
    const p = pros[proKey]!;
    const [a] = await db
      .insert(t.appointments)
      .values({
        professionalId: p.id,
        clientId,
        startsAt,
        endsAt: minutes(startsAt, p.service.durationMin),
        status,
        origin: opts.origin ?? 'ai',
        priceCents: p.service.priceCents,
        cancelReason: opts.cancelReason ?? null,
      })
      .returning();
    await db
      .insert(t.appointmentServices)
      .values({ appointmentId: a!.id, serviceId: p.serviceId, ...p.service });
    const booked = opts.origin === 'professional' ? 'Você marcou' : 'Marcado pela IA via WhatsApp';
    const events: {
      type: typeof t.appointmentEvents.$inferInsert.type;
      description: string;
      actor: 'ai' | 'professional' | 'client';
      createdAt: Date;
    }[] = [
      {
        type: 'booked',
        description: booked,
        actor: opts.origin === 'professional' ? 'professional' : 'ai',
        createdAt: minutes(startsAt, -60 * 24),
      },
    ];
    if (status === 'confirmed' || status === 'in_service' || status === 'done')
      events.push({
        type: 'confirmed',
        description: 'O cliente confirmou a presença',
        actor: 'client',
        createdAt: minutes(startsAt, -120),
      });
    if (status === 'in_service' || status === 'done')
      events.push({
        type: 'arrived',
        description: 'Você registrou a chegada',
        actor: 'professional',
        createdAt: startsAt,
      });
    if (status === 'done')
      events.push({
        type: 'done',
        description: 'Você concluiu o atendimento',
        actor: 'professional',
        createdAt: minutes(startsAt, 50),
      });
    if (status === 'cancelled')
      events.push({
        type: 'cancelled',
        description: `O cliente cancelou: ${opts.cancelReason ?? 'Cliente pediu'}`,
        actor: 'client',
        createdAt: minutes(now, -(opts.cancelledMinutesAgo ?? 30)),
      });
    await db
      .insert(t.appointmentEvents)
      .values(events.map((e) => ({ ...e, appointmentId: a!.id })));
    return a!.id;
  }

  // ---- Marina: 12 clients (10-clientes, 05-agendamentos, 04-agenda)
  const m = {
    anaPaula: await client('marina', 'Ana Paula', ['Prefere o fim da tarde']),
    beatriz: await client('marina', 'Beatriz Lima', ['Pós-operatório']),
    juliana: await client('marina', 'Juliana Alves', ['Reabilitação']),
    lucas: await client('marina', 'Lucas Santos', ['Esportiva']),
    rafael: await client('marina', 'Rafael Almeida'),
    carlos: await client('marina', 'Carlos Mendes'),
    anaRibeiro: await client('marina', 'Ana Ribeiro'),
    fernanda: await client('marina', 'Fernanda Lima'),
    ricardo: await client('marina', 'Ricardo Souza'),
    luiza: await client('marina', 'Luiza Prado'),
    roberto: await client('marina', 'Roberto Lima'),
    helena: await client('marina', 'Helena Duarte'),
  };

  // History: Ana Paula comes every 21 days at 17:30 (12 visits), a few others now and then.
  for (let i = 1; i <= 12; i++)
    await appointment('marina', m.anaPaula, at('17:30', addDays(today, -21 * i)), 'done');
  for (const [c, every, n] of [
    [m.rafael, 14, 4],
    [m.juliana, 30, 2],
    [m.lucas, 18, 3],
    [m.beatriz, 25, 2],
    [m.helena, 40, 1],
  ] as const)
    for (let i = 1; i <= n; i++)
      await appointment('marina', c, at('09:00', addDays(today, -every * i)), 'done');
  await appointment('marina', m.ricardo, at('10:00', addDays(today, -10)), 'no_show');

  // Today: 8 appointments (R$ 1.200), Carlos and Roberto cancelled, 16:00 and 17:00 free.
  await appointment('marina', m.anaRibeiro, at('08:00'), 'done');
  await appointment('marina', m.fernanda, at('09:00'), 'done');
  await appointment('marina', m.juliana, at('10:00'), 'done');
  await appointment('marina', m.ricardo, at('11:00'), 'done');
  await appointment('marina', m.luiza, at('13:00'), 'done', { origin: 'professional' });
  await appointment('marina', m.anaPaula, at('14:00'), 'in_service');
  await appointment('marina', m.rafael, at('15:00'), 'confirmed');
  await appointment('marina', m.roberto, at('16:00'), 'cancelled', {
    cancelReason: 'Imprevisto',
    cancelledMinutesAgo: 90,
  });
  await appointment('marina', m.carlos, at('17:00'), 'cancelled', {
    cancelReason: 'Cliente pediu',
    cancelledMinutesAgo: 3,
  });
  await appointment('marina', m.lucas, at('18:00'), 'scheduled');

  // Waitlist (10-clientes): Beatriz, Juliana, Lucas.
  await db.insert(t.waitlistEntries).values([
    {
      professionalId: pros.marina!.id,
      clientId: m.beatriz,
      serviceId: pros.marina!.serviceId,
      preference: { weekdays: [], periods: ['tarde'], note: 'Qualquer dia à tarde' },
      optedInAt: minutes(now, -60 * 24 * 3),
    },
    {
      professionalId: pros.marina!.id,
      clientId: m.juliana,
      serviceId: null,
      preference: { weekdays: [2], periods: ['manha'], note: 'Terça pela manhã' },
      optedInAt: minutes(now, -60 * 24 * 2),
    },
    {
      professionalId: pros.marina!.id,
      clientId: m.lucas,
      serviceId: null,
      preference: { weekdays: [], periods: ['noite'], note: 'Após 17h' },
      optedInAt: minutes(now, -60 * 24),
    },
  ]);

  // Beatriz asks for 16h on WhatsApp -> pending fit-in decision ("Beatriz pode vir às 16h?").
  const [conv] = await db
    .insert(t.conversations)
    .values({
      professionalId: pros.marina!.id,
      clientId: m.beatriz,
      handler: 'ai',
      unreadCount: 1,
      lastMessageAt: minutes(now, -2),
    })
    .returning();
  const asked = await db
    .insert(t.messages)
    .values([
      {
        conversationId: conv!.id,
        direction: 'in',
        author: 'client',
        text: 'Oi! Vi que vagou horário hoje. Consigo às 16h?',
        aiNote: 'Entendi como: pedido de encaixe hoje às 16h',
        createdAt: minutes(now, -3),
      },
      {
        conversationId: conv!.id,
        direction: 'out',
        author: 'ai',
        text: 'Vou ver aqui e já te falo!',
        createdAt: minutes(now, -2),
      },
    ])
    .returning();
  const fitIn = {
    name: 'marcar' as const,
    arguments: {
      serviceIds: [pros.marina!.serviceId],
      startsAt: at('16:00').toISOString(),
      isFitIn: true,
    },
  };
  const decision = {
    professionalId: pros.marina!.id,
    conversationId: conv!.id,
    clientId: m.beatriz,
    type: 'encaixe' as const,
    question: 'Beatriz pode vir às 16h?',
    context: {
      clientFirstName: 'Beatriz',
      messages: asked.map((msg) => ({
        author: msg.author,
        text: msg.text ?? '',
        at: msg.createdAt.toISOString(),
      })),
      extra: { freedBy: 'Roberto cancelou' },
    },
    options: [
      { id: 'sim', label: 'Sim', action: fitIn },
      { id: 'nao', label: 'Não', action: null },
    ],
    proposedAction: fitIn,
    status: 'pending' as const,
    deadlineAt: minutes(now, 8),
  };
  // Validate against the shared contract so the app/web can rely on it.
  AiDecision.omit({ id: true, createdAt: true, updatedAt: true }).parse({
    ...decision,
    deadlineAt: decision.deadlineAt.toISOString(),
    timeoutNotifiedAt: null,
    resolvedVia: null,
    resolvedOption: null,
    resolvedText: null,
  });
  await db.insert(t.aiDecisions).values(decision);

  // ---- Team (12-web-agenda): a few clients and today's appointments each.
  const team: [string, [string, string, AppointmentStatus][]][] = [
    [
      'camila',
      [
        ['Bruno Alves', '09:00', 'done'],
        ['Isabela Ferreira', '10:30', 'done'],
        ['Pedro Martins', '14:00', 'scheduled'],
        ['Marina Silva', '16:00', 'confirmed'],
      ],
    ],
    [
      'julia',
      [
        ['Carla Nunes', '09:00', 'done'],
        ['Patrícia Gomes', '10:30', 'done'],
        ['Juliana Costa', '14:30', 'scheduled'],
        ['Renata Melo', '16:00', 'confirmed'],
      ],
    ],
    [
      'pedro',
      [
        ['Gustavo Lima', '09:00', 'done'],
        ['Beatriz Cardoso', '11:00', 'done'],
        ['Tiago Rocha', '14:00', 'confirmed'],
        ['Aline Pereira', '15:30', 'scheduled'],
        ['Henrique Dias', '17:00', 'confirmed'],
      ],
    ],
  ];
  for (const [key, list] of team)
    for (const [name, time, status] of list)
      await appointment(key, await client(key, name), at(time), status);

  await db.insert(t.auditLog).values({
    professionalId: pros.marina!.id,
    actor: 'system',
    action: 'seed.demo',
    payload: { date: today },
  });

  return { salonId: salon!.id, today, pros };
}
