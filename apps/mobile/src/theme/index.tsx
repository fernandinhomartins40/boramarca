import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ColorSchemeName } from '@boramarca/shared';
import { themes, type AppTheme } from './tokens';

export * from './tokens';

export type ThemePreference = 'system' | ColorSchemeName;

interface ThemePreferenceState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

/** User override of the system scheme ("Aparência" in Ajustes). Persisted. */
export const useThemePreference = create<ThemePreferenceState>()(
  persist((set) => ({ preference: 'system', setPreference: (preference) => set({ preference }) }), {
    name: 'boramarca.theme',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

const ForcedScheme = createContext<ColorSchemeName | null>(null);

/** Forces a scheme for a subtree, e.g. `<ThemeScope scheme="dark">` for Modo Balcão (always dark). */
export function ThemeScope({ scheme, children }: { scheme: ColorSchemeName; children: ReactNode }) {
  return <ForcedScheme.Provider value={scheme}>{children}</ForcedScheme.Provider>;
}

export function resolveScheme(
  forced: ColorSchemeName | null,
  preference: ThemePreference,
  system: string | null | undefined,
): ColorSchemeName {
  if (forced) return forced;
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Current theme: forced scope > user preference > system scheme. */
export function useTheme(): AppTheme {
  const forced = useContext(ForcedScheme);
  const preference = useThemePreference((s) => s.preference);
  const system = useColorScheme();
  return themes[resolveScheme(forced, preference, system)];
}
