import { Redirect, Stack } from 'expo-router';
import { DEV_TOOLS_ENABLED } from '@/dev/flags';

/** Gate for every dev route: unreachable in release builds (see src/dev/flags.ts). */
export default function DevLayout() {
  if (!DEV_TOOLS_ENABLED) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
