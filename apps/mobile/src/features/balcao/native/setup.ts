import type { LucideIcon } from 'lucide-react-native';
import { BatteryCharging, Lock, Rocket, Settings2, ShieldCheck } from 'lucide-react-native';

/** Brands that kill background apps in their own way (prompt 08, plan PDF p. 6). */
export type PhoneBrand = 'xiaomi' | 'samsung' | 'motorola' | 'other';

export interface BrandStep {
  icon: LucideIcon;
  text: string;
}

/** From expo-device's manufacturer/brand ("Xiaomi", "Redmi", "POCO", "samsung", "motorola"…). */
export function brandOf(manufacturer: string | null | undefined): PhoneBrand {
  const m = (manufacturer ?? '').toLowerCase();
  if (/xiaomi|redmi|poco/.test(m)) return 'xiaomi';
  if (m.includes('samsung')) return 'samsung';
  if (/motorola|moto/.test(m)) return 'motorola';
  return 'other';
}

export const BRAND_NAME: Record<PhoneBrand, string> = {
  xiaomi: 'Xiaomi / Redmi',
  samsung: 'Samsung',
  motorola: 'Motorola',
  other: 'seu celular',
};

const NO_RESTRICTIONS: BrandStep = {
  icon: BatteryCharging,
  text: 'Toque em Configurar, procure Bora Marca e escolha "Sem restrições" ou "Não otimizar".',
};

/** Extra steps per brand, besides the system battery screen. Menu names vary by version. */
export const BRAND_STEPS: Record<PhoneBrand, BrandStep[]> = {
  xiaomi: [
    NO_RESTRICTIONS,
    {
      icon: Settings2,
      text: 'Em Configurações → Apps → Gerenciar apps → Bora Marca → Economia de bateria, escolha "Sem restrições".',
    },
    { icon: Rocket, text: 'Na mesma tela, ligue "Início automático".' },
    {
      icon: Lock,
      text: 'Abra os apps recentes, segure o Bora Marca e toque no cadeado para ele não ser fechado.',
    },
  ],
  samsung: [
    NO_RESTRICTIONS,
    {
      icon: Settings2,
      text: 'Em Configurações → Apps → Bora Marca → Bateria, escolha "Sem restrições".',
    },
    {
      icon: ShieldCheck,
      text: 'Em Cuidados com a bateria → Limites de uso em segundo plano, tire o Bora Marca de "Apps em suspensão" e "Apps em suspensão profunda".',
    },
  ],
  motorola: [
    NO_RESTRICTIONS,
    {
      icon: Settings2,
      text: 'Em Configurações → Apps → Bora Marca → Bateria do app, escolha "Sem restrições".',
    },
  ],
  other: [
    NO_RESTRICTIONS,
    {
      icon: Settings2,
      text: 'Se o celular tiver um app de "Gerenciador" ou "Otimizar", deixe o Bora Marca fora da limpeza automática.',
    },
  ],
};

/** Microphone level bars for expo-speech-recognition's volume (-2…10; below 0 is silence). */
export function levelBars(volume: number, bars: number): number {
  if (!(volume > 0)) return 0;
  return Math.min(bars, Math.ceil((volume / 10) * bars));
}

export const SETUP_DONE_SPEECH = 'Tudo certo! Estou pronta para trabalhar.';
export const SOUND_TEST_SPEECH = 'Oi! É assim que eu falo com você no balcão.';
