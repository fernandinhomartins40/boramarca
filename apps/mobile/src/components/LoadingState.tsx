import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface LoadingStateProps {
  label?: string;
}

/** Centered spinner. For lists prefer `Skeleton` rows. */
export function LoadingState({ label = 'Carregando…' }: LoadingStateProps) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: t.spacing.md, padding: t.spacing.xl }}
    >
      <ActivityIndicator size="large" color={t.colors.primary} />
      <Text color="textMuted">{label}</Text>
    </View>
  );
}
