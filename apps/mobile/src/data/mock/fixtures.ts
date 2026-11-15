import {
  DEFAULT_AUTONOMY,
  DEFAULT_REMINDER_LEAD_MINUTES,
  DEFAULT_TIMEZONE,
  DEFAULT_WAITLIST_RULE,
  type Client,
  type Professional,
  type Salon,
  type Service,
  type WorkingHours,
} from '@boramarca/shared';
import { base, minutesAgo, uid } from './util';

/**
 * Demo data shared by the mock domains (references 04–11): Marina Costa, fisioterapeuta, and her
 * clients. Domain-specific data (agenda, conversas, decisões...) lives in each domain file.
 */
export const ids = {
  salon: uid(1),
  professional: uid(2),
  service: { sessao: uid(0x10), pilates: uid(0x11), liberacao: uid(0x12) },
  client: {
    anaPaula: uid(0x100),
    rafaelAlmeida: uid(0x101),
    beatriz: uid(0x102),
    carlos: uid(0x103),
    juliana: uid(0x104),
    lucas: uid(0x105),
    rafaelFerreira: uid(0x106),
    diego: uid(0x107),
    fernanda: uid(0x108),
    patricia: uid(0x109),
    marcos: uid(0x10a),
    camila: uid(0x10b),
  },
} as const;

export const DEMO_PHONE = '+5511987654321';
export const DEMO_OTP = '123456';

export const salon: Salon = {
  ...base(ids.salon),
  name: 'Marina Costa Fisioterapia',
  plan: 'maos_livres',
  timezone: DEFAULT_TIMEZONE,
};

export const professional: Professional = {
  ...base(ids.professional),
  salonId: ids.salon,
  role: 'owner',
  name: 'Marina Costa',
  phone: DEMO_PHONE,
  professions: ['fisioterapeuta'],
  address: 'Rua das Flores, 120 — sala 4, São Paulo',
  aiEnabled: true,
  aiPausedUntil: null,
  aiTone: 'simpatico',
  autonomy: { ...DEFAULT_AUTONOMY },
  reminderLeadMinutes: DEFAULT_REMINDER_LEAD_MINUTES,
  welcomeMessage: 'Oi! Aqui é a assistente da Marina. Como posso te ajudar?',
  quietHours: { start: '20:00', end: '08:00' },
  waitlistRule: { ...DEFAULT_WAITLIST_RULE },
  skipMessagePreview: false,
  voiceRate: 1,
};

const service = (id: string, name: string, position: number): Service => ({
  ...base(id),
  professionalId: ids.professional,
  name,
  durationMin: 50,
  priceCents: 15000,
  position,
  active: true,
});

export const services: Service[] = [
  service(ids.service.sessao, 'Sessão de fisioterapia', 0),
  service(ids.service.pilates, 'Pilates terapêutico', 1),
  service(ids.service.liberacao, 'Liberação miofascial', 2),
];

/** Monday–Friday 08:00–19:00, lunch 12:00–13:00 (10 slots of 50 min a day). */
export const workingHours: WorkingHours[] = [1, 2, 3, 4, 5].map((weekday) => ({
  ...base(uid(0x700 + weekday)),
  professionalId: ids.professional,
  weekday,
  start: '08:00',
  end: '19:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
}));

const client = (id: string, name: string, phone: string, notes: string[] = []): Client => ({
  ...base(id, 60 * 24 * 120),
  professionalId: ids.professional,
  name,
  phone,
  preferences: { notes },
  origin: 'whatsapp',
  firstContactAt: minutesAgo(60 * 24 * 120),
});

export const clients: Client[] = [
  client(ids.client.anaPaula, 'Ana Paula', '+5511988776655', ['Prefere o fim da tarde']),
  client(ids.client.rafaelAlmeida, 'Rafael Almeida', '+5511987001122', ['Não gosta de esperar']),
  client(ids.client.beatriz, 'Beatriz Lima', '+5511986002233', ['Prefere à tarde']),
  client(ids.client.carlos, 'Carlos Souza', '+5511985003344'),
  client(ids.client.juliana, 'Juliana Alves', '+5511984004455', ['Prefere terça de manhã']),
  client(ids.client.lucas, 'Lucas Santos', '+5511983005566', ['Só depois das 17h']),
  client(ids.client.rafaelFerreira, 'Rafael Ferreira', '+5511982006677'),
  client(ids.client.diego, 'Diego Martins', '+5511981007788'),
  client(ids.client.fernanda, 'Fernanda Rocha', '+5511980008899'),
  client(ids.client.patricia, 'Patrícia Gomes', '+5511979009900'),
  client(ids.client.marcos, 'Marcos Vieira', '+5511978001010'),
  client(ids.client.camila, 'Camila Ribeiro', '+5511977002020'),
];

export const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? null;
export const firstName = (name: string) => name.split(' ')[0] ?? name;
