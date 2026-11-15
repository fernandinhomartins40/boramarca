import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  /** Custom art instead of the icon (e.g. `<VoiceOrb state="parado" />`). */
  art?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** "Nada esperando você. Bom trabalho!" */
export function EmptyState({
  title,
  message,
  icon: Icon,
  art,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.spacing.md, padding: t.spacing.xl }}>
      {art ?? (Icon ? <Icon color={t.colors.primaryText} size={t.sizes.iconLg * 1.5} /> : null)}
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text color="textMuted" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}
