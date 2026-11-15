import type {
  Client,
  ClientCreate,
  ClientListQuery,
  ClientListResponse,
  ClientStats,
  ClientSummary,
  ClientUpdate,
  Id,
} from '@boramarca/shared';
import { mockAppointments, visitHistoryOf } from './agenda';
import { clients, professional } from './mock/fixtures';
import { base, fail, minutesAgo, newId, nowIso, reply } from './mock/util';
import { mockWaitlistEntries } from './waitlist';

/** Clients (prompt 09). Owner: agent B3; api implementation: D1. */
export interface ClientsData {
  list(query?: Partial<ClientListQuery>): Promise<ClientListResponse>;
  get(id: Id): Promise<Client>;
  stats(id: Id): Promise<ClientStats>;
  create(body: ClientCreate): Promise<Client>;
  update(id: Id, body: ClientUpdate): Promise<Client>;
  remove(id: Id): Promise<void>;
}

const DAY = 60 * 24;

function summary(c: Client): ClientSummary {
  const h = visitHistoryOf(c.id);
  return {
    ...c,
    lastVisitAt: h.lastDaysAgo === null ? null : minutesAgo(h.lastDaysAgo * DAY),
    lastServiceName: 'Fisioterapia',
    visitsCount: h.visits,
    noShowCount: h.noShows,
    onWaitlist: mockWaitlistEntries.some((e) => e.clientId === c.id && e.status === 'waiting'),
  };
}

function find(id: Id) {
  return clients.find((c) => c.id === id) ?? fail(404, 'NOT_FOUND', 'Cliente não encontrado');
}

export const mockClients: ClientsData = {
  async list(query = {}) {
    const search = query.search?.trim().toLowerCase();
    let items = clients
      .map(summary)
      .filter((c) => !search || c.name.toLowerCase().includes(search) || c.phone.includes(search));
    if (query.inactiveDays) {
      const limit = Date.now() - query.inactiveDays * DAY * 60_000;
      items = items.filter((c) => c.lastVisitAt && new Date(c.lastVisitAt).getTime() < limit);
    }
    const sort = query.sort ?? 'recent';
    items.sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'pt-BR')
        : sort === 'frequent'
          ? b.visitsCount - a.visitsCount
          : (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? ''),
    );
    return reply({ items, nextCursor: null });
  },
  async get(id) {
    return reply(find(id));
  },
  async stats(id) {
    const s = summary(find(id));
    const next = mockAppointments
      .filter((a) => a.clientId === id && ['scheduled', 'confirmed'].includes(a.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return reply({
      clientId: id,
      visitsCount: s.visitsCount,
      averageTicketCents: 15000,
      noShowCount: s.noShowCount,
      averageIntervalDays: visitHistoryOf(id).intervalDays,
      lastVisitAt: s.lastVisitAt,
      nextAppointmentAt: next?.startsAt ?? null,
    });
  },
  async create(body) {
    if (clients.some((c) => c.phone === body.phone))
      fail(409, 'PHONE_TAKEN', 'Já existe cliente com esse telefone');
    const c: Client = {
      ...base(newId(), 0),
      professionalId: professional.id,
      name: body.name,
      phone: body.phone,
      preferences: body.preferences ?? { notes: [] },
      origin: 'manual',
      firstContactAt: null,
    };
    clients.push(c);
    return reply(c);
  },
  async update(id, body) {
    const c = find(id);
    Object.assign(c, body, { updatedAt: nowIso() });
    return reply(c);
  },
  async remove(id) {
    clients.splice(clients.indexOf(find(id)), 1);
    return reply(undefined);
  },
};
