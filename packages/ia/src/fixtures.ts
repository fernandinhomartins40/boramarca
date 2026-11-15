// Shared test/eval data (not exported from the package). Scenario of the PDF, page 8:
// Saturday 2026-11-14, São Paulo; Carlos has 15h, Fulano writes at 14:05.
import { DEFAULT_AUTONOMY, type Profession } from '@boramarca/shared';
import type { ClientMessageInput } from './context';

export const TZ = 'America/Sao_Paulo';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const IDS = {
  carlos: id(1),
  fulano: id(2),
  ana: id(3),
  corte: id(10),
  barba: id(11),
  apptCarlos: id(20),
  apptAna: id(21),
  apptFulano: id(22),
};

/** 14:05 in São Paulo (UTC-3). */
export const NOW = '2026-11-14T17:05:00.000Z';
export const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(2026, 10, 14, h + 3, m)).toISOString();
};

export function makeInput(
  text: string,
  over: Partial<ClientMessageInput> & { professions?: Profession[]; clientName?: string } = {},
): ClientMessageInput {
  const { professions, clientName, ...rest } = over;
  return {
    now: NOW,
    timezone: TZ,
    professional: {
      professions: professions ?? ['barbeiro'],
      tone: 'descontraido',
      autonomy: DEFAULT_AUTONOMY,
      spaceName: 'Espaço do Zé',
      address: 'Rua das Flores, 120 — Centro',
    },
    client: { id: IDS.fulano, name: clientName ?? 'Fulano de Tal', isKnown: true, upcoming: [] },
    services: [
      { id: IDS.corte, name: 'Corte', durationMinutes: 30, priceCents: 5000 },
      { id: IDS.barba, name: 'Barba', durationMinutes: 20, priceCents: 3000 },
    ],
    day: {
      date: '2026-11-14',
      appointments: [
        {
          id: IDS.apptAna,
          clientId: IDS.ana,
          clientName: 'Ana Souza',
          startsAt: at('13:00'),
          endsAt: at('13:30'),
          serviceNames: ['Corte'],
          status: 'done',
        },
        {
          id: IDS.apptCarlos,
          clientId: IDS.carlos,
          clientName: 'Carlos Pereira',
          startsAt: at('15:00'),
          endsAt: at('15:30'),
          serviceNames: ['Corte'],
          status: 'confirmed',
        },
      ],
      freeSlots: [at('14:30'), at('16:00'), at('16:30')],
    },
    history: [],
    message: { text },
    ...rest,
  };
}
