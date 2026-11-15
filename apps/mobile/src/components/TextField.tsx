import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Inline, gentle validation message ("Coloque pelo menos um serviço"). */
  error?: string | null;
  hint?: string;
  icon?: LucideIcon;
  /** Element at the right edge (clear button, chevron). */
  right?: ReactNode;
}

export function TextField({
  label,
  error,
  hint,
  icon: Icon,
  right,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;
  return (
    <View style={{ gap: t.spacing.xs }}>
      {label ? (
        <Text variant="bodySmall" weight="medium" color="textMuted">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          minHeight: t.touchTarget.min,
          paddingHorizontal: t.spacing.lg,
          borderRadius: t.radii.md,
          borderWidth: focused || error ? t.sizes.borderStrong : t.sizes.border,
          borderColor,
          backgroundColor: t.colors.surface,
        }}
      >
        {Icon ? <Icon color={t.colors.textMuted} size={t.sizes.icon} /> : null}
        <TextInput
          accessibilityLabel={label ?? rest.placeholder}
          placeholderTextColor={t.colors.textMuted}
          selectionColor={t.colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[t.text.body, { flex: 1, color: t.colors.text, paddingVertical: t.spacing.md }]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="bodySmall" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
