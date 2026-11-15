import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** "Entendi e quero conectar". */
export function Checkbox({ label, checked, onChange, disabled }: CheckboxProps) {
  const t = useTheme();
  const box = t.sizes.icon + t.spacing.xs;
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        minHeight: t.touchTarget.min,
        opacity: disabled ? t.opacity.disabled : 1,
      }}
    >
      <View
        style={{
          width: box,
          height: box,
          borderRadius: t.radii.sm,
          borderWidth: t.sizes.borderStrong,
          borderColor: checked ? t.colors.primary : t.colors.textMuted,
          backgroundColor: checked ? t.colors.primary : t.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check color={t.colors.onPrimary} size={t.sizes.iconSm} /> : null}
      </View>
      <Text style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}
