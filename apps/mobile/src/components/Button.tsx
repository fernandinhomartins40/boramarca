import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme, type AppColors } from '@/theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'neutral';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type Look = { bg: keyof AppColors | null; fg: keyof AppColors; border: keyof AppColors | null };

/**
 * primary = violeta (ação principal) · secondary = contorno violeta · accent = lima ("Sim" do
 * Balcão) · neutral = branco com borda ("Já tenho conta", "Voltar") · danger · ghost (link).
 */
const looks: Record<ButtonVariant, Look> = {
  primary: { bg: 'primary', fg: 'onPrimary', border: null },
  secondary: { bg: 'surface', fg: 'primaryText', border: 'primaryText' },
  ghost: { bg: null, fg: 'primaryText', border: null },
  danger: { bg: 'danger', fg: 'onDanger', border: null },
  accent: { bg: 'accent', fg: 'onAccent', border: null },
  neutral: { bg: 'surface', fg: 'text', border: 'border' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const t = useTheme();
  const look = looks[variant];
  const fg = t.colors[look.fg];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: t.touchTarget.button[size],
          borderRadius: t.radii.md,
          paddingHorizontal: t.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing.sm,
          backgroundColor: look.bg ? t.colors[look.bg] : 'transparent',
          borderWidth: look.border ? t.sizes.borderStrong : 0,
          borderColor: look.border ? t.colors[look.border] : 'transparent',
          opacity: disabled ? t.opacity.disabled : pressed ? t.opacity.pressed : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon color={fg} size={t.sizes.icon} /> : null}
          <Text
            variant={size === 'lg' ? 'heading' : 'body'}
            weight="semibold"
            style={{ color: fg }}
          >
            {label}
          </Text>
          {IconRight ? <IconRight color={fg} size={t.sizes.icon} /> : null}
        </>
      )}
    </Pressable>
  );
}
