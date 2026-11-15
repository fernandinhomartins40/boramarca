import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { RealtimeEventOf, RealtimeEventType } from '@boramarca/shared';
import { dataSource } from '@/data';
import { api } from '@/lib/api';
import { useSession } from '@/features/auth/session';
import { emitDecisionsChanged } from '@/features/decisions';
import { useAiStore } from '@/features/settings/aiStore';
import { refreshWhatsAppStatus, useWhatsAppStore } from '@/features/whatsapp/store';
import { createRealtime } from './socket';

export * from './socket';

/** The app's realtime channel (one socket per signed-in session, api data source only). */
export const realtime = createRealtime({
  baseUrl: api.baseUrl,
  accessToken: api.accessToken,
  refresh: api.refresh,
  // after a drop, catch up on what may have been missed
  onOpen: () => {
    emitDecisionsChanged();
    void refreshWhatsAppStatus();
  },
});

// Global state fed straight from the events (the stores the banners, badge and tabs read).
realtime.subscribe(['whatsapp.status'], (e) => {
  if (e.type === 'whatsapp.status') useWhatsAppStore.getState().set(e.data);
});
realtime.subscribe(['ai.status'], (e) => {
  if (e.type === 'ai.status') useAiStore.getState().apply(e.data);
});
realtime.subscribe(['decision.created', 'decision.resolved'], () => emitDecisionsChanged());

/**
 * Screens: `useRealtime(['appointment.changed'], () => reload(true))`. Runs `handler` for each event
 * of `types` while mounted (the latest handler, no resubscribe per render). In mock mode nothing
 * arrives, so keep the focus/polling reload as the fallback.
 */
export function useRealtime<T extends RealtimeEventType>(
  types: readonly T[],
  handler: (event: RealtimeEventOf<T>) => void,
) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const key = types.join(',');
  useEffect(
    () =>
      realtime.subscribe(key.split(',') as RealtimeEventType[], (e) =>
        ref.current(e as RealtimeEventOf<T>),
      ),
    [key],
  );
}

/** Mounted once in app/_layout.tsx: socket open while signed in (api mode), back on foreground. */
export function useRealtimeConnection() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  useEffect(() => {
    if (!signedIn || dataSource !== 'api') return;
    realtime.start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') realtime.wake();
    });
    return () => {
      sub.remove();
      realtime.stop();
    };
  }, [signedIn]);
}
