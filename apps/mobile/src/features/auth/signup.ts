import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SUGGESTED_SERVICES, type Profession, type SuggestedService } from '@boramarca/shared';
import { data } from '@/data';
import { DEFAULT_WEEK, weekToWorkingHours, type Week } from '@/features/settings/format';

/** Services suggested for the chosen professions, without repeated names. */
export function suggestedServicesFor(professions: readonly Profession[]): SuggestedService[] {
  const seen = new Set<string>();
  return professions
    .flatMap((p) => SUGGESTED_SERVICES[p])
    .filter((s) => !seen.has(s.name) && !!seen.add(s.name))
    .map((s) => ({ ...s }));
}

/** What already reached the server: a retry after a failure continues from here (no duplicates). */
export interface SignUpProgress {
  profile: boolean;
  hours: boolean;
  services: number;
}

export interface SignUpDraft {
  step: number;
  name: string;
  professions: Profession[];
  services: SuggestedService[];
  /** Professions the current service list was suggested for (re-suggest when they change). */
  servicesFor: string;
  week: Week;
  progress: SignUpProgress;
}

const EMPTY: SignUpDraft = {
  step: 1,
  name: '',
  professions: [],
  services: [],
  servicesFor: '',
  week: DEFAULT_WEEK,
  progress: { profile: false, hours: false, services: 0 },
};

interface DraftStore extends SignUpDraft {
  patch: (p: Partial<SignUpDraft>) => void;
  reset: () => void;
}

/** Quick sign-up answers, persisted so closing the app does not lose them (prompt 01). */
export const useSignUpDraft = create<DraftStore>()(
  persist(
    (set) => ({
      ...EMPTY,
      patch: (p) => set(p),
      reset: () => set(EMPTY),
    }),
    { name: 'boramarca.signup', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/**
 * Sends the quick sign-up: profile (PATCH /me), week (PUT /working-hours), then one
 * POST /services per chosen service — the server's sign-up does not create suggested services.
 */
export async function completeSignUp(
  draft: Pick<SignUpDraft, 'name' | 'professions' | 'services' | 'week'>,
  progress: SignUpProgress,
  onProgress: (p: SignUpProgress) => void,
): Promise<void> {
  const p = { ...progress };
  const name = draft.name.trim();
  if (!p.profile) {
    await data.profile.updateMe({ name, professions: draft.professions, salonName: name });
    p.profile = true;
    onProgress({ ...p });
  }
  if (!p.hours) {
    await data.profile.replaceWorkingHours({ items: weekToWorkingHours(draft.week) });
    p.hours = true;
    onProgress({ ...p });
  }
  for (let i = p.services; i < draft.services.length; i++) {
    const s = draft.services[i];
    if (!s) continue;
    await data.profile.createService({ ...s, name: s.name.trim(), position: i, active: true });
    p.services = i + 1;
    onProgress({ ...p });
  }
}
