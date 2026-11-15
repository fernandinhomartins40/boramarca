import { DEV_TOOLS_ENABLED } from '@/dev/flags';
import { mockAccount, type AccountData } from './account';
import { mockAgenda, type AgendaData } from './agenda';
import { api } from '@/lib/api';
import { createApiData } from './api';
import { mockAuth, type AuthData } from './auth';
import { mockClients, type ClientsData } from './clients';
import { mockConversationsData, type ConversationsData } from './conversations';
import { mockDecisionsData, type DecisionsData } from './decisions';
import { mockDevices, type DevicesData } from './devices';
import { mockProfile, type ProfileData } from './profile';
import { mockVoice, type VoiceData } from './voice';
import { mockWaitlist, type WaitlistData } from './waitlist';
import { mockWhatsApp, type WhatsAppData } from './whatsapp';

export type { AccountData, AgendaData, AuthData, ClientsData, ConversationsData, DecisionsData };
export type { DevicesData, ProfileData, VoiceData, WaitlistData, WhatsAppData };
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
  devices: DevicesData;
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
  devices: mockDevices,
};

/**
 * `EXPO_PUBLIC_DATA_SOURCE=mock|api` (inlined at build time). Mock only exists where the dev tools do
 * (`__DEV__` or EXPO_PUBLIC_DEV_TOOLS=true): a release/production build always talks to the API.
 */
export function resolveDataSource(
  value: string | undefined,
  allowMock = DEV_TOOLS_ENABLED,
): DataSource {
  if (!allowMock) return 'api';
  return value === 'api' ? 'api' : 'mock';
}

let apiData: DataLayer | null = null;

export function createData(source: DataSource): DataLayer {
  if (source === 'mock') return mockData;
  apiData ??= createApiData(api);
  return apiData;
}

export const dataSource: DataSource = resolveDataSource(process.env.EXPO_PUBLIC_DATA_SOURCE);
export const data: DataLayer = createData(dataSource);
