import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type AppColors } from '@/theme';

/**
 * default = superfície com borda · primary = violeta (card "Agora") · accentSoft = lima claro
 * (pedido de encaixe; no escuro ganha borda lima) · alt = área secundária.
 */
export type CardVariant = 'default' | 'primary' | 'accentSoft' | 'alt';

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const bg: Record<CardVariant, keyof AppColors> = {
  default: 'surface',
  primary: 'primary',
  accentSoft: 'accentSoft',
  alt: 'surfaceAlt',
};

export function Card({
  children,
  variant = 'default',
  onPress,
  accessibilityLabel,
  style,
}: CardProps) {
  const t = useTheme();
  const borderColor =
    variant === 'default'
      ? t.colors.border
      : variant === 'accentSoft' && t.scheme === 'dark'
        ? t.colors.accent
        : t.colors[bg[variant]];
  const base: ViewStyle = {
    backgroundColor: t.colors[bg[variant]],
    borderRadius: t.radii.lg,
    borderWidth: t.sizes.border,
    borderColor,
    padding: t.spacing.lg,
    gap: t.spacing.sm,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, { opacity: pressed ? t.opacity.pressed : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}
