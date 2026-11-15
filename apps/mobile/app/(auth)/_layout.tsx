import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

/** Entry screens: no header (each screen draws its own back arrow). The root guard redirects. */
export default function EntryLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }} />
  );
}
