import type {
  AiPauseRequest,
  AiSettings,
  AiSettingsPatch,
  AiStatus,
  AiTone,
  Id,
  MePatch,
  MeResponse,
  MessagePreviewRequest,
  MessagePreviewResponse,
  Service,
  ServiceCreate,
  ServiceUpdate,
  TimeOff,
  TimeOffCreate,
  WorkingHours,
  WorkingHoursReplaceBody,
} from '@boramarca/shared';
import { firstName, ids, professional, salon, services, workingHours } from './mock/fixtures';
import { base, fail, newId, nowIso, reply } from './mock/util';

/**
 * Profile and settings: GET/PATCH /me, AI settings and pause, services, working hours, message
 * previews (prompts 01 sign-up and 10 Ajustes). Owner: agent B2; api implementation: D1.
 */
export interface ProfileData {
  getMe(): Promise<MeResponse>;
  updateMe(patch: MePatch): Promise<MeResponse>;
  /** New confirmation link for the pending e-mail (POST /me/email/resend). */
  resendEmailConfirmation(): Promise<void>;
  getAiSettings(): Promise<AiSettings>;
  updateAiSettings(patch: AiSettingsPatch): Promise<AiSettings>;
  /** `until: null` = "até eu voltar". */
  pauseAi(body: AiPauseRequest): Promise<AiStatus>;
  resumeAi(): Promise<AiStatus>;
  listServices(includeInactive?: boolean): Promise<Service[]>;
  createService(body: ServiceCreate): Promise<Service>;
  updateService(id: Id, body: ServiceUpdate): Promise<Service>;
  deleteService(id: Id): Promise<void>;
  reorderServices(ids: Id[]): Promise<Service[]>;
  getWorkingHours(): Promise<WorkingHours[]>;
  replaceWorkingHours(body: WorkingHoursReplaceBody): Promise<WorkingHours[]>;
  /** Folgas e feriados (CRUD /time-off). */
  listTimeOff(): Promise<TimeOff[]>;
  createTimeOff(body: TimeOffCreate): Promise<TimeOff>;
  deleteTimeOff(id: Id): Promise<void>;
  /** Text the client would receive (confirmação, lembrete, exemplo de tom...). */
  previewMessage(body: MessagePreviewRequest): Promise<MessagePreviewResponse>;
}

const TONE_SAMPLES: Record<AiTone, string> = {
  descontraido: 'Opa! Bora marcar? Me diz o dia e o horário que fica bom pra você.',
  simpatico: 'Oi! Posso agendar o seu atendimento. Qual dia e horário fica melhor para você?',
  formal: 'Olá. Posso agendar o seu atendimento. Qual dia e horário seriam mais convenientes?',
};

function aiStatus(): AiStatus {
  return {
    aiEnabled: professional.aiEnabled,
    aiPausedUntil: professional.aiPausedUntil,
    pausedIndefinitely: !professional.aiEnabled && professional.aiPausedUntil === null,
  };
}

const aiSettings = (): AiSettings => ({
  aiEnabled: professional.aiEnabled,
  aiPausedUntil: professional.aiPausedUntil,
  aiTone: professional.aiTone,
  autonomy: professional.autonomy,
});

function findService(id: Id) {
  return services.find((s) => s.id === id) ?? fail(404, 'NOT_FOUND', 'Serviço não encontrado');
}

const timeOff: TimeOff[] = [];

const sorted = () => [...services].sort((a, b) => a.position - b.position);

export const mockProfile: ProfileData = {
  async getMe() {
    return reply({ professional, salon });
  },
  async updateMe(patch) {
    const { salonName, email, ...rest } = patch;
    Object.assign(professional, rest, { updatedAt: nowIso() });
    // Mock: no mail goes out, the address just waits for confirmation.
    if (email !== undefined && email !== professional.email)
      Object.assign(professional, { email, emailVerifiedAt: null });
    if (salonName) salon.name = salonName;
    return reply({ professional, salon });
  },
  async resendEmailConfirmation() {
    if (!professional.email || professional.emailVerifiedAt)
      fail(409, 'NO_EMAIL', 'Nada para confirmar');
    return reply(undefined);
  },
  async getAiSettings() {
    return reply(aiSettings());
  },
  async updateAiSettings(patch) {
    const { autonomy, ...rest } = patch;
    Object.assign(professional, rest);
    if (autonomy) Object.assign(professional.autonomy, autonomy);
    if (patch.aiEnabled) professional.aiPausedUntil = null;
    return reply(aiSettings());
  },
  async pauseAi(body) {
    professional.aiEnabled = false;
    professional.aiPausedUntil = body.until;
    return reply(aiStatus());
  },
  async resumeAi() {
    professional.aiEnabled = true;
    professional.aiPausedUntil = null;
    return reply(aiStatus());
  },
  async listServices(includeInactive = false) {
    return reply(sorted().filter((s) => includeInactive || s.active));
  },
  async createService(body) {
    const s: Service = {
      ...base(newId(), 0),
      professionalId: ids.professional,
      name: body.name,
      durationMin: body.durationMin,
      priceCents: body.priceCents,
      position: body.position ?? services.length,
      active: body.active ?? true,
    };
    services.push(s);
    return reply(s);
  },
  async updateService(id, body) {
    const s = findService(id);
    Object.assign(s, body, { updatedAt: nowIso() });
    return reply(s);
  },
  async deleteService(id) {
    findService(id).active = false;
    return reply(undefined);
  },
  async reorderServices(order) {
    order.forEach((id, position) => (findService(id).position = position));
    return reply(sorted());
  },
  async getWorkingHours() {
    return reply(workingHours);
  },
  async replaceWorkingHours(body) {
    workingHours.splice(
      0,
      workingHours.length,
      ...body.items.map((w) => ({ ...base(newId(), 0), professionalId: ids.professional, ...w })),
    );
    return reply(workingHours);
  },
  async listTimeOff() {
    return reply([...timeOff].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  },
  async createTimeOff(body) {
    const item: TimeOff = {
      ...base(newId(), 0),
      professionalId: ids.professional,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      reason: body.reason ?? null,
    };
    timeOff.push(item);
    return reply(item);
  },
  async deleteTimeOff(id) {
    const i = timeOff.findIndex((x) => x.id === id);
    if (i < 0) fail(404, 'NOT_FOUND', 'Folga não encontrada');
    timeOff.splice(i, 1);
    return reply(undefined);
  },
  async previewMessage(body) {
    const tone = body.tone ?? professional.aiTone;
    const name =
      typeof body.params?.clientName === 'string' ? firstName(body.params.clientName) : 'Beatriz';
    const text: Record<MessagePreviewRequest['kind'], string> = {
      tone_sample: TONE_SAMPLES[tone],
      booking_confirmation: `Olá, ${name}! Seu agendamento está confirmado para hoje, às 16h. Nos vemos lá!`,
      reschedule: `Oi, ${name}! Seu horário mudou para as 17h. Tudo certo?`,
      cancellation: `Oi, ${name}! Precisei cancelar seu horário. Quer marcar outro dia?`,
      delay_notice: `Oi, ${name}! Vou atrasar uns ${body.params?.delayMinutes ?? 15} minutos. Desculpe!`,
      reminder: `Oi, ${name}! Lembrando do seu horário hoje às 16h. Posso confirmar?`,
      waitlist_offer: `Oi, ${name}! Vagou um horário hoje às 16h. Quer?`,
      welcome: professional.welcomeMessage ?? TONE_SAMPLES[tone],
      decision_answer: `Olá, ${name}! Seu agendamento foi confirmado. Nos vemos lá!`,
    };
    return reply({ text: text[body.kind] });
  },
};
