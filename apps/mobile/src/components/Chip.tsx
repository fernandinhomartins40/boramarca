import { Pressable } from 'react-native';
import { Check, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  /** accent = lima when selected (profissão, dias, tom) · primary = violeta (filtros de Conversas). */
  tone?: 'accent' | 'primary';
  disabled?: boolean;
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
  tone = 'accent',
  disabled,
}: ChipProps) {
  const t = useTheme();
  const on = tone === 'accent' ? t.colors.accent : t.colors.primary;
  const fg = selected
    ? tone === 'accent'
      ? t.colors.onAccent
      : t.colors.onPrimary
    : t.colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        minHeight: t.touchTarget.min - t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        borderRadius: tone === 'primary' ? t.radii.pill : t.radii.md,
        borderWidth: t.sizes.border,
        borderColor: selected ? on : t.colors.border,
        backgroundColor: selected ? on : t.colors.surface,
        opacity: disabled ? t.opacity.disabled : pressed ? t.opacity.pressed : 1,
      })}
    >
      {Icon ? <Icon color={fg} size={t.sizes.iconSm} /> : null}
      <Text variant="bodySmall" weight="medium" style={{ color: fg }}>
        {label}
      </Text>
      {selected && tone === 'accent' ? <Check color={fg} size={t.sizes.iconSm} /> : null}
    </Pressable>
  );
}
