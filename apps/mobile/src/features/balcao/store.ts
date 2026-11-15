import { create } from 'zustand';
import { initialSnapshot, type BalcaoSnapshot } from './machine';

export interface BalcaoState {
  /** Modo Balcão open and listening (the Agenda's BalcaoStatus pill reads this). */
  active: boolean;
  snapshot: BalcaoSnapshot;
  /** Media volume 0–1 (null = unknown). */
  volume: number | null;
}

/** Usage elsewhere: `const active = useBalcaoStore((s) => s.active)`. */
export const useBalcaoStore = create<BalcaoState>()(() => ({
  active: false,
  snapshot: initialSnapshot,
  volume: null,
}));

export const LOW_VOLUME = 0.3;
