import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useSegments } from 'expo-router';
import { format, isToday } from 'date-fns';
import { CirclePause } from 'lucide-react-native';
import { Banner } from '@/components';
import { useSession } from '@/features/auth/session';
import { isWhatsAppDown, useWhatsAppStore, useWhatsAppWatcher } from '@/features/whatsapp/store';
import '@/features/whatsapp/simulations';
import { useTheme } from '@/theme';
import { refreshAi, useAiStore } from './aiStore';

/** "IA pausada até 15:30 — …", "até 15/11 às 00:00", or with no end. */
export function pausedLabel(until: string | null): string {
  if (!until) return 'IA pausada — você está respondendo tudo.';
  const d = new Date(until);
  const when = isToday(d) ? format(d, 'HH:mm') : format(d, "dd/MM 'às' HH:mm");
  return `IA pausada até ${when} — você está respondendo tudo.`;
}

/**
 * Fixed banners on every signed-in screen (rendered once in app/_layout.tsx, above the stack):
 * red "WhatsApp desconectado" (prompt 02) and "IA pausada" (prompt 10).
 */
export function GlobalBanners() {
  const t = useTheme();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const group = useSegments()[0];
  const wa = useWhatsAppStore((s) => s.status);
  const ai = useAiStore();
  useWhatsAppWatcher(signedIn);
  useEffect(() => {
    if (!signedIn) return;
    refreshAi();
    // A timed pause ends on the server; this picks it up.
    const timer = setInterval(refreshAi, 60_000);
    return () => clearInterval(timer);
  }, [signedIn]);

  const onEntry = group === '(auth)' || group === '(onboarding)';
  const waDown = isWhatsAppDown(wa);
  if (!signedIn || onEntry || (!waDown && ai.aiEnabled)) return null;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: t.colors.bg }}>
      <View
        style={{ gap: t.spacing.xs, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs }}
      >
        {waDown ? (
          <Banner
            tone="danger"
            message="WhatsApp desconectado — toque para reconectar"
            onPress={() => router.push('/whatsapp')}
          />
        ) : null}
        {!ai.aiEnabled ? (
          <Banner
            tone="info"
            icon={CirclePause}
            message={pausedLabel(ai.aiPausedUntil)}
            actionLabel="Ligar"
            onPress={() => router.push('/ajustes')}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
