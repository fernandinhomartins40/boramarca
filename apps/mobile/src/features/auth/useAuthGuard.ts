import { useEffect } from 'react';
import { router, useRootNavigationState, useSegments, type Href } from 'expo-router';
import { useSession, type SessionStatus } from './session';

/** Where a status must go from the current top-level route group, or null to stay. */
export function redirectFor(status: SessionStatus, group: string | undefined): Href | null {
  const inAuth = group === '(auth)';
  if (status === 'signedOut') return inAuth ? null : '/boas-vindas';
  if (status === 'onboarding') return group === '(onboarding)' ? null : '/cadastro';
  return inAuth ? '/' : null;
}

/**
 * Root guard (app/_layout.tsx): signed-out users only see (auth), new users finish the sign-up,
 * signed-in users never land on the login screens. Waits for the navigator and the stored session.
 */
export function useAuthGuard() {
  const hydrated = useSession((s) => s.hydrated);
  const status = useSession((s) => s.status);
  const group = useSegments()[0];
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (!hydrated || !navReady) return;
    const target = redirectFor(status, group);
    if (target) router.replace(target);
  }, [hydrated, navReady, status, group]);
}
