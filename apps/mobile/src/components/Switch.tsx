import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel: string;
  /** primary = violeta (padrão) · accent = lima (permissões da IA, referência 11). */
  tone?: 'primary' | 'accent';
  disabled?: boolean;
}

/** Large switch with a 56 dp touch area. */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  tone = 'primary',
  disabled,
}: SwitchProps) {
  const t = useTheme();
  const w = t.touchTarget.min;
  const h = t.spacing.xxl;
  const knob = h - t.spacing.sm;
  const on = tone === 'accent' ? t.colors.accent : t.colors.primary;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={(t.touchTarget.min - h) / 2}
      style={{ opacity: disabled ? t.opacity.disabled : 1 }}
    >
      <View
        style={{
          width: w,
          height: h,
          borderRadius: t.radii.pill,
          padding: t.spacing.xs,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? on : t.colors.border,
        }}
      >
        <View
          style={{
            width: knob,
            height: knob,
            borderRadius: t.radii.pill,
            backgroundColor: value && tone === 'accent' ? t.colors.onAccent : t.colors.surface,
          }}
        />
      </View>
    </Pressable>
  );
}
