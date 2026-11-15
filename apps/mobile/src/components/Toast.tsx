import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme';
import { Text } from './Text';

export type ToastTone = 'success' | 'info' | 'danger';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  id: number;
}

const useToastStore = create<ToastState>(() => ({ message: null, tone: 'success', id: 0 }));

/** Shows a short message at the bottom: `showToast('Marcado! O Fulano já foi avisado.')`. */
export function showToast(message: string, tone: ToastTone = 'success') {
  useToastStore.setState((s) => ({ message, tone, id: s.id + 1 }));
}

export function hideToast() {
  useToastStore.setState({ message: null });
}

/** Mounted once in app/_layout.tsx. */
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { message, tone, id } = useToastStore();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hideToast, t.duration.toast);
    return () => clearTimeout(timer);
  }, [message, id, t.duration.toast]);
  if (!message) return null;
  const bg =
    tone === 'success' ? t.colors.accent : tone === 'danger' ? t.colors.danger : t.colors.text;
  const fg =
    tone === 'success' ? t.colors.onAccent : tone === 'danger' ? t.colors.onDanger : t.colors.bg;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: t.spacing.lg,
        right: t.spacing.lg,
        bottom: insets.bottom + t.touchTarget.min + t.spacing.xl,
      }}
    >
      <Animated.View
        key={id}
        entering={FadeInDown}
        exiting={FadeOutDown}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.md,
          borderRadius: t.radii.md,
          backgroundColor: bg,
        }}
      >
        <Text weight="semibold" style={{ color: fg }}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
