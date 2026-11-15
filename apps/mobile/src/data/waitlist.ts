import type {
  Id,
  WaitlistEntryCreate,
  WaitlistEntryUpdate,
  WaitlistEntryView,
  WaitlistListResponse,
  WaitlistOffer,
  WaitlistOfferBody,
  WaitlistRule,
  WaitlistRulePatch,
} from '@boramarca/shared';
import { clientName, ids, professional, services } from './mock/fixtures';
import { base, fail, minutesAgo, minutesFromNow, newId, nowIso, reply, uid } from './mock/util';

/** Waitlist (prompt 09). Owner: agent B3; api implementation: D1. */
export interface WaitlistData {
  list(): Promise<WaitlistListResponse>;
  /** Manual add: `clientAsked: true` is mandatory ("Só adicione quem pediu para ser avisado"). */
  add(body: WaitlistEntryCreate): Promise<WaitlistEntryView>;
  update(id: Id, body: WaitlistEntryUpdate): Promise<WaitlistEntryView>;
  remove(id: Id): Promise<void>;
  /** "Oferecer vaga agora". */
  offer(id: Id, body: WaitlistOfferBody): Promise<WaitlistOffer>;
  /** "Quando vagar um horário, ofereço para 1 pessoa da lista e espero 10 minutos." */
  updateRule(body: WaitlistRulePatch): Promise<WaitlistRule>;
}

const entry = (
  n: number,
  clientId: string,
  preference: WaitlistEntryView['preference'],
  daysAgo: number,
  serviceId: string | null,
): WaitlistEntryView => ({
  ...base(uid(0x600 + n), daysAgo * 60 * 24),
  professionalId: ids.professional,
  clientId,
  serviceId,
  preference,
  optedInAt: minutesAgo(daysAgo * 60 * 24),
  sourceMessageId: null,
  status: 'waiting',
  clientName: clientName(clientId)!,
  serviceName: services.find((s) => s.id === serviceId)?.name ?? null,
  activeOffer: null,
});

/** Reference 10-clientes: Lista de espera (3). */
export const mockWaitlistEntries: WaitlistEntryView[] = [
  entry(
    1,
    ids.client.beatriz,
    { weekdays: [], periods: ['tarde'], note: 'Qualquer dia à tarde' },
    2,
    ids.service.sessao,
  ),
  entry(
    2,
    ids.client.juliana,
    { weekdays: [2], periods: ['manha'], note: 'Terça pela manhã' },
    5,
    null,
  ),
  entry(3, ids.client.lucas, { weekdays: [], periods: ['noite'], note: 'Após 17h' }, 9, null),
];

function find(id: Id) {
  return (
    mockWaitlistEntries.find((e) => e.id === id) ?? fail(404, 'NOT_FOUND', 'Entrada não encontrada')
  );
}

export const mockWaitlist: WaitlistData = {
  async list() {
    return reply({
      items: mockWaitlistEntries.filter((e) => e.status === 'waiting' || e.status === 'offered'),
      rule: professional.waitlistRule,
    });
  },
  async add(body) {
    if (!body.clientAsked)
      fail(400, 'CLIENT_DID_NOT_ASK', 'Só adicione quem pediu para ser avisado');
    const name = clientName(body.clientId) ?? fail(404, 'NOT_FOUND', 'Cliente não encontrado');
    const e: WaitlistEntryView = {
      ...base(newId(), 0),
      professionalId: professional.id,
      clientId: body.clientId,
      serviceId: body.serviceId ?? null,
      preference: body.preference,
      optedInAt: nowIso(),
      sourceMessageId: null,
      status: 'waiting',
      clientName: name,
      serviceName: services.find((s) => s.id === body.serviceId)?.name ?? null,
      activeOffer: null,
    };
    mockWaitlistEntries.push(e);
    return reply(e);
  },
  async update(id, body) {
    const e = find(id);
    Object.assign(e, body, { updatedAt: nowIso() });
    if (body.serviceId !== undefined)
      e.serviceName = services.find((s) => s.id === body.serviceId)?.name ?? null;
    return reply(e);
  },
  async remove(id) {
    find(id).status = 'removed';
    return reply(undefined);
  },
  async offer(id, body) {
    const e = find(id);
    const offer: WaitlistOffer = {
      ...base(newId(), 0),
      entryId: id,
      slotStartsAt: body.slotStartsAt,
      expiresAt: minutesFromNow(professional.waitlistRule.waitMinutes),
      status: 'sent',
    };
    e.status = 'offered';
    e.activeOffer = offer;
    return reply(offer);
  },
  async updateRule(body) {
    Object.assign(professional.waitlistRule, body);
    return reply(professional.waitlistRule);
  },
};
