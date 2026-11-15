import type {
  AgendaResponse,
  AgendaActionCall,
  AppointmentActionResponse,
  AppointmentCancel,
  AppointmentCreate,
  AppointmentDetail,
  AppointmentEvent,
  AppointmentReschedule,
  AppointmentStatus,
  AppointmentView,
  DateOnly,
  DelayNoticeBody,
  DelayNoticeResponse,
  Id,
  SlotsResponse,
} from '@boramarca/shared';
import { clients, firstName, ids, professional, services, workingHours } from './mock/fixtures';
import { base, dateOf, fail, minutesAgo, newId, nowIso, reply, todayAt, uid } from './mock/util';

/** Agenda and appointments (prompts 03 and 04). Owner: agent B3; api implementation: D1. */
export interface AgendaData {
  /** GET /agenda?date= — includes cancelled appointments ("Carlos desmarcou há 3 min"). */
  getDay(date: DateOnly): Promise<AgendaResponse>;
  /** GET /slots — free starts where the total duration of `serviceIds` fits. */
  getSlots(date: DateOnly, serviceIds: Id[]): Promise<SlotsResponse>;
  getAppointment(id: Id): Promise<AppointmentDetail>;
  create(body: AppointmentCreate): Promise<AppointmentDetail>;
  reschedule(id: Id, body: AppointmentReschedule): Promise<AppointmentActionResponse>;
  cancel(id: Id, body: AppointmentCancel): Promise<AppointmentActionResponse>;
  arrive(id: Id): Promise<AppointmentActionResponse>;
  done(id: Id): Promise<AppointmentActionResponse>;
  noShow(id: Id): Promise<AppointmentActionResponse>;
  sendDelayNotice(id: Id, body: DelayNoticeBody): Promise<DelayNoticeResponse>;
}

// ---- mock store: today as in reference 04-agenda (8 atendimentos, 2 vagas, R$ 1.200)

const sessao = services[0]!;
const MIN = 60_000;

function appt(
  id: string,
  clientId: string,
  startsAt: string,
  status: AppointmentStatus,
  extra: Partial<AppointmentView> = {},
): AppointmentView {
  return {
    ...base(id, 60 * 24),
    professionalId: ids.professional,
    clientId,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + sessao.durationMin * MIN).toISOString(),
    status,
    origin: 'ai',
    isFitIn: false,
    priceCents: sessao.priceCents,
    cancelReason: null,
    clientName: clients.find((c) => c.id === clientId)!.name,
    services: [
      {
        serviceId: sessao.id,
        name: 'Fisioterapia',
        durationMin: sessao.durationMin,
        priceCents: sessao.priceCents,
      },
    ],
    ...extra,
  };
}

const c = ids.client;
export const mockAppointments: AppointmentView[] = [
  appt(uid(0x201), c.fernanda, todayAt('08:00'), 'done'),
  appt(uid(0x202), c.marcos, todayAt('09:00'), 'done'),
  appt(uid(0x203), c.patricia, todayAt('10:00'), 'done'),
  appt(uid(0x204), c.camila, todayAt('11:00'), 'done'),
  appt(uid(0x205), c.juliana, todayAt('13:00'), 'done'),
  appt(uid(0x206), c.anaPaula, todayAt('14:00'), 'in_service'),
  appt(uid(0x207), c.rafaelAlmeida, todayAt('15:00'), 'confirmed'),
  appt(uid(0x208), c.carlos, todayAt('17:00'), 'cancelled', {
    cancelReason: 'Cliente pediu',
    updatedAt: minutesAgo(3),
  }),
  appt(uid(0x209), c.diego, todayAt('18:00'), 'confirmed'),
];

const events = new Map<string, AppointmentEvent[]>([
  [
    uid(0x207),
    [
      ev(uid(0x207), 'requested', 'Pediu horário', 'client', todayAt('10:12')),
      ev(uid(0x207), 'ai_offered', 'IA ofereceu 15:00', 'ai', todayAt('10:13')),
      ev(uid(0x207), 'confirmed', 'Você confirmou por voz', 'professional', todayAt('10:20')),
      ev(uid(0x207), 'reminder_sent', 'Lembrete enviado', 'system', todayAt('13:00')),
    ],
  ],
]);

function ev(
  appointmentId: string,
  type: AppointmentEvent['type'],
  description: string,
  actor: AppointmentEvent['actor'],
  at = nowIso(),
): AppointmentEvent {
  return { id: newId(), createdAt: at, updatedAt: at, appointmentId, type, description, actor };
}

const ACTIVE: AppointmentStatus[] = ['scheduled', 'confirmed', 'in_service'];
const COUNTED: AppointmentStatus[] = [...ACTIVE, 'done'];

function find(id: Id) {
  return (
    mockAppointments.find((a) => a.id === id) ??
    fail(404, 'NOT_FOUND', 'Agendamento não encontrado')
  );
}

function detail(a: AppointmentView): AppointmentDetail {
  return {
    ...a,
    client: clients.find((x) => x.id === a.clientId)!,
    events: events.get(a.id) ?? [],
  };
}

function log(a: AppointmentView, type: AppointmentEvent['type'], description: string) {
  events.set(a.id, [...(events.get(a.id) ?? []), ev(a.id, type, description, 'professional')]);
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const minOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

function dayWindow(date: DateOnly) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return workingHours.find((w) => w.weekday === weekday) ?? null;
}

/** Free starts (every 10 min) where `duration` fits: inside hours, outside lunch and appointments. */
function freeStarts(date: DateOnly, duration: number, ignoreId?: string): number[] {
  const wh = dayWindow(date);
  if (!wh) return [];
  const busy = mockAppointments
    .filter(
      (a) =>
        a.id !== ignoreId &&
        ACTIVE.concat('done').includes(a.status) &&
        dateOf(a.startsAt) === date,
    )
    .map((a) => [minOfDay(a.startsAt), minOfDay(a.endsAt)] as const);
  if (wh.lunchStart && wh.lunchEnd) busy.push([toMin(wh.lunchStart), toMin(wh.lunchEnd)]);
  const out: number[] = [];
  for (let s = toMin(wh.start); s + duration <= toMin(wh.end); s += 10) {
    if (busy.every(([b, e]) => s + duration <= b || s >= e)) out.push(s);
  }
  return out;
}

/** Whole service-length slots left in the day, packed from the start of each gap. */
function freeSlotsCount(date: DateOnly): number {
  let count = 0;
  let last = -Infinity;
  for (const s of freeStarts(date, sessao.durationMin)) {
    if (s >= last + sessao.durationMin) {
      count++;
      last = s;
    }
  }
  return count;
}

const atMinute = (date: DateOnly, m: number) =>
  new Date(
    `${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`,
  ).toISOString();

/** Used by the decisions mock to run the action of an answered decision on this agenda. */
export function applyMockAgendaAction(
  action: AgendaActionCall,
  clientId: Id | null,
): AppointmentView | null {
  if (action.name === 'marcar' && clientId) {
    const a = appt(newId(), clientId, action.arguments.startsAt, 'scheduled', {
      isFitIn: action.arguments.isFitIn,
    });
    mockAppointments.push(a);
    return a;
  }
  if (action.name === 'remarcar') {
    const a = find(action.arguments.appointmentId);
    const len = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime();
    a.startsAt = action.arguments.startsAt;
    a.endsAt = new Date(new Date(a.startsAt).getTime() + len).toISOString();
    a.updatedAt = nowIso();
    return a;
  }
  return null;
}

function setStatus(
  id: Id,
  status: AppointmentStatus,
  type: AppointmentEvent['type'],
  text: string,
) {
  const a = find(id);
  a.status = status;
  a.updatedAt = nowIso();
  log(a, type, text);
  return reply(a);
}

export const mockAgenda: AgendaData = {
  async getDay(date) {
    const appointments = mockAppointments
      .filter((a) => dateOf(a.startsAt) === date)
      .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
    const counted = appointments.filter((a) => COUNTED.includes(a.status));
    return reply({
      date,
      timezone: 'America/Sao_Paulo',
      workingHours: dayWindow(date),
      timeOff: [],
      appointments,
      summary: {
        appointmentsCount: counted.length,
        freeSlotsCount: freeSlotsCount(date),
        expectedRevenueCents: counted.reduce((sum, a) => sum + a.priceCents, 0),
      },
    });
  },
  async getSlots(date, serviceIds) {
    const durationMin = services
      .filter((s) => serviceIds.includes(s.id))
      .reduce((sum, s) => sum + s.durationMin, 0);
    if (!durationMin) fail(400, 'INVALID_SERVICES', 'Escolha pelo menos um serviço');
    const slots = freeStarts(date, durationMin).map((m) => ({
      startsAt: atMinute(date, m),
      endsAt: atMinute(date, m + durationMin),
    }));
    return reply({ date, durationMin, slots });
  },
  async getAppointment(id) {
    return reply(detail(find(id)));
  },
  async create(body) {
    const chosen = services.filter((s) => body.serviceIds.includes(s.id));
    const durationMin = chosen.reduce((sum, s) => sum + s.durationMin, 0);
    const date = dateOf(body.startsAt);
    if (!freeStarts(date, durationMin).includes(minOfDay(body.startsAt)))
      fail(409, 'SLOT_TAKEN', 'Esse horário não está livre');
    let clientId = body.clientId;
    if (!clientId && body.newClient) {
      clientId = newId();
      clients.push({
        ...base(clientId, 0),
        professionalId: ids.professional,
        name: body.newClient.name,
        phone: body.newClient.phone,
        preferences: body.newClient.preferences ?? { notes: [] },
        origin: 'manual',
        firstContactAt: null,
      });
    }
    const client =
      clients.find((x) => x.id === clientId) ?? fail(404, 'NOT_FOUND', 'Cliente não encontrado');
    const a: AppointmentView = {
      ...base(newId(), 0),
      professionalId: professional.id,
      clientId: client.id,
      startsAt: body.startsAt,
      endsAt: new Date(new Date(body.startsAt).getTime() + durationMin * MIN).toISOString(),
      status: 'confirmed',
      origin: 'professional',
      isFitIn: body.isFitIn ?? false,
      priceCents: chosen.reduce((sum, s) => sum + s.priceCents, 0),
      cancelReason: null,
      clientName: client.name,
      services: chosen.map((s) => ({
        serviceId: s.id,
        name: s.name,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
      })),
    };
    mockAppointments.push(a);
    log(a, 'booked', 'Marcado por você');
    return reply(detail(a));
  },
  async reschedule(id, body) {
    const a = find(id);
    const len = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime();
    if (!freeStarts(dateOf(body.startsAt), len / MIN, id).includes(minOfDay(body.startsAt)))
      fail(409, 'SLOT_TAKEN', 'Esse horário não está livre');
    a.startsAt = body.startsAt;
    a.endsAt = new Date(new Date(body.startsAt).getTime() + len).toISOString();
    a.updatedAt = nowIso();
    log(a, 'rescheduled', 'Remarcado por você');
    return reply(a);
  },
  async cancel(id, body) {
    find(id).cancelReason = body.reason;
    return setStatus(id, 'cancelled', 'cancelled', 'Cancelado por você');
  },
  arrive: (id) => setStatus(id, 'in_service', 'arrived', 'Cliente chegou'),
  done: (id) => setStatus(id, 'done', 'done', 'Atendimento concluído'),
  noShow: (id) => setStatus(id, 'no_show', 'no_show', 'Marcado como faltou'),
  async sendDelayNotice(id, body) {
    const a = find(id);
    const sentText =
      body.messageText ??
      `Oi, ${firstName(a.clientName)}! Vou atrasar uns ${body.delayMinutes} minutos. Desculpe! Te espero.`;
    log(a, 'delay_notice_sent', `Aviso de atraso de ${body.delayMinutes} min enviado`);
    return reply({ ok: true as const, sentText });
  },
};
