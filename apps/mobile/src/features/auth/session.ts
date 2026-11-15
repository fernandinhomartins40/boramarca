import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AuthTokens, OtpVerifyResponse, PhoneE164 } from '@boramarca/shared';
import { data } from '@/data';

/**
 * signedOut → (auth) screens · onboarding → quick sign-up · signedIn → the app.
 * The root guard (useAuthGuard) sends each status to its place.
 */
export type SessionStatus = 'signedOut' | 'onboarding' | 'signedIn';

interface SessionState {
  /** False until the persisted session was read (the splash stays up until then). */
  hydrated: boolean;
  status: SessionStatus;
  phone: PhoneE164 | null;
  /** Kept in the device keychain/keystore. The api data layer (D1) reads and refreshes them. */
  tokens: AuthTokens | null;
  signIn: (phone: PhoneE164, res: OtpVerifyResponse) => void;
  finishOnboarding: () => void;
  setTokens: (tokens: AuthTokens) => void;
  clear: () => void;
}

// Tokens are secrets: keychain/keystore (expo-secure-store), not AsyncStorage.
const secureStorage: StateStorage = {
  getItem: async (key) => (await SecureStore.getItemAsync(key)) ?? null,
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      hydrated: false,
      status: 'signedOut',
      phone: null,
      tokens: null,
      signIn: (phone, { isNewUser, ...tokens }) =>
        set({ phone, tokens, status: isNewUser ? 'onboarding' : 'signedIn' }),
      finishOnboarding: () => set({ status: 'signedIn' }),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set({ status: 'signedOut', phone: null, tokens: null }),
    }),
    {
      name: 'boramarca.session',
      storage: createJSONStorage(() => secureStorage),
      partialize: ({ status, phone, tokens }) => ({ status, phone, tokens }),
      onRehydrateStorage: () => () => useSession.setState({ hydrated: true }),
    },
  ),
);

/** "Sair": tells the server, then forgets the session (the guard goes to Boas-vindas). */
export async function signOut() {
  await data.auth.signOut().catch(() => undefined);
  useSession.getState().clear();
}
