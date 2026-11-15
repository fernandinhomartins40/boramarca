import { mockAccount, type AccountData } from './account';
import { mockAgenda, type AgendaData } from './agenda';
import { apiData } from './api';
import { mockAuth, type AuthData } from './auth';
import { mockClients, type ClientsData } from './clients';
import { mockConversationsData, type ConversationsData } from './conversations';
import { mockDecisionsData, type DecisionsData } from './decisions';
import { mockProfile, type ProfileData } from './profile';
import { mockVoice, type VoiceData } from './voice';
import { mockWaitlist, type WaitlistData } from './waitlist';
import { mockWhatsApp, type WhatsAppData } from './whatsapp';

export type { AccountData, AgendaData, AuthData, ClientsData, ConversationsData, DecisionsData };
export type { ProfileData, VoiceData, WaitlistData, WhatsAppData };
export { DataError } from './errors';

/** Everything the screens can ask for. Screens import `data` and never know the source. */
export interface DataLayer {
  auth: AuthData;
  profile: ProfileData;
  whatsapp: WhatsAppData;
  agenda: AgendaData;
  clients: ClientsData;
  waitlist: WaitlistData;
  decisions: DecisionsData;
  conversations: ConversationsData;
  voice: VoiceData;
  account: AccountData;
}

export type DataSource = 'mock' | 'api';

export const mockData: DataLayer = {
  auth: mockAuth,
  profile: mockProfile,
  whatsapp: mockWhatsApp,
  agenda: mockAgenda,
  clients: mockClients,
  waitlist: mockWaitlist,
  decisions: mockDecisionsData,
  conversations: mockConversationsData,
  voice: mockVoice,
  account: mockAccount,
};

/** `EXPO_PUBLIC_DATA_SOURCE=mock|api` (inlined at build time). Anything else falls back to mock. */
export function resolveDataSource(value: string | undefined): DataSource {
  return value === 'api' ? 'api' : 'mock';
}

export function createData(source: DataSource): DataLayer {
  return source === 'api' ? apiData : mockData;
}

export const dataSource: DataSource = resolveDataSource(process.env.EXPO_PUBLIC_DATA_SOURCE);
export const data: DataLayer = createData(dataSource);
