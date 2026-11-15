import { useEffect } from 'react';
import { create } from 'zustand';
import type { WhatsAppStatusResponse } from '@boramarca/shared';
import { data } from '@/data';
import { onSimulation } from '@/dev/simulations';

interface WhatsAppStore {
  status: WhatsAppStatusResponse | null;
  set: (s: WhatsAppStatusResponse) => void;
}

/** Last known connection status (global banner, Ajustes). */
export const useWhatsAppStore = create<WhatsAppStore>((set) => ({
  status: null,
  set: (status) => set({ status }),
}));

export function refreshWhatsAppStatus() {
  return data.whatsapp
    .getStatus()
    .then((s) => useWhatsAppStore.getState().set(s))
    .catch(() => undefined);
}

const REFRESH_MS = 30_000;

// shortcut: polls every 30 s; switch to the `whatsapp.status` WebSocket event when D1 adds realtime.
/** Keeps the status fresh while `enabled` (signed in). */
export function useWhatsAppWatcher(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    refreshWhatsAppStatus();
    const timer = setInterval(refreshWhatsAppStatus, REFRESH_MS);
    const off = onSimulation('whatsapp-drop', refreshWhatsAppStatus);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [enabled]);
}

/** Dropped after having been set up (or never connected): the red banner shows. */
export const isWhatsAppDown = (s: WhatsAppStatusResponse | null) =>
  !!s && (s.status === 'disconnected' || s.status === 'error');
