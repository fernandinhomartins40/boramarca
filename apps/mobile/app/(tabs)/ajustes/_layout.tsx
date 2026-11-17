import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

/** Ajustes tab: main list + inner screens (Meu negócio, IA, Voz, Alexa, WhatsApp, Conta). */
export default function AjustesLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }} />
  );
}
