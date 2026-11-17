import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastHost } from '@/components/Toast';
import { useAuthGuard, useSession } from '@/features/auth';
import '@/features/balcao/native'; // native voice + Android microphone service (D2)
import { useDecisionNotifications } from '@/features/notifications';
import { GlobalBanners } from '@/features/settings';
import { usePushRegistration } from '@/lib/api/push';
import { useRealtimeConnection } from '@/lib/realtime';
import { useTheme } from '@/theme';
import { brandFonts } from '@/theme/fonts';

// Keep the splash (symbol on grafite) until Inter is loaded.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const t = useTheme();
  const [loaded, error] = useFonts(brandFonts);
  const hydrated = useSession((s) => s.hydrated);
  // on font error, fall back to the system font instead of hanging; wait for the stored session
  const ready = (loaded || !!error) && hydrated;
  useAuthGuard();
  useDecisionNotifications();
  // api mode only (D1): WebSocket while signed in, push token after login
  useRealtimeConnection();
  usePushRegistration();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: t.colors.primary,
      background: t.colors.bg,
      card: t.colors.surface,
      text: t.colors.text,
      border: t.colors.border,
      notification: t.colors.accent,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
        <GlobalBanners />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}
        />
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
