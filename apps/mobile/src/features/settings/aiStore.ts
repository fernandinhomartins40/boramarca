import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AiStatus, IsoDateTime } from '@boramarca/shared';
import { data } from '@/data';
import { dateOnly } from '@/utils/agenda';
import { salonInstant } from '@/utils/timezone';

interface AiStore {
  aiEnabled: boolean;
  aiPausedUntil: IsoDateTime | null;
  apply: (s: Pick<AiStatus, 'aiEnabled' | 'aiPausedUntil'>) => void;
}

/**
 * "IA atendendo" as last seen from the server, persisted so the "IA pausada" banner shows on every
 * tab right away, even before the network answers.
 */
export const useAiStore = create<AiStore>()(
  persist(
    (set) => ({
      aiEnabled: true,
      aiPausedUntil: null,
      apply: ({ aiEnabled, aiPausedUntil }) => set({ aiEnabled, aiPausedUntil }),
    }),
    {
      name: 'boramarca.ai',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ aiEnabled, aiPausedUntil }) => ({ aiEnabled, aiPausedUntil }),
    },
  ),
);

export function refreshAi() {
  return data.profile
    .getAiSettings()
    .then((s) => useAiStore.getState().apply(s))
    .catch(() => undefined);
}

export type PauseOption = '1h' | 'tomorrow' | 'indefinitely';

export const PAUSE_LABELS: Record<PauseOption, string> = {
  '1h': 'Pausar por 1h',
  tomorrow: 'Pausar até amanhã',
  indefinitely: 'Pausar até eu voltar',
};

/** End of a quick pause; null = "até eu voltar". */
export function pauseUntil(option: PauseOption, now = new Date()): IsoDateTime | null {
  if (option === '1h') return new Date(now.getTime() + 60 * 60_000).toISOString();
  // next midnight in the salon (minute 1440 of today)
  if (option === 'tomorrow') return salonInstant(dateOnly(now), 24 * 60).toISOString();
  return null;
}

/** Turns "IA atendendo" on (resume) or off (pause until I come back). Throws DataError. */
export async function setAiOn(on: boolean) {
  const s = on ? await data.profile.resumeAi() : await data.profile.pauseAi({ until: null });
  useAiStore.getState().apply(s);
}

export async function pauseAi(option: PauseOption) {
  const s = await data.profile.pauseAi({ until: pauseUntil(option) });
  useAiStore.getState().apply(s);
}
