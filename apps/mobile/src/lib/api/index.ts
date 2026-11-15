import { useSession } from '@/features/auth/session';
import { createApiClient } from './client';

export * from './client';

/** `EXPO_PUBLIC_API_URL` (inlined at build time; see apps/mobile/.env.example). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/** The app's client: tokens from useSession (expo-secure-store); a dead session goes to Boas-vindas. */
export const api = createApiClient({
  baseUrl: API_URL,
  tokens: {
    get: () => useSession.getState().tokens,
    set: (tokens) => useSession.getState().setTokens(tokens),
    // status signedOut: useAuthGuard sends the user to /boas-vindas
    expired: () => useSession.getState().clear(),
  },
});
