import { useRef, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components';
import { useTheme } from '@/theme';

export interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}

const LENGTH = 6;

/**
 * Six boxes over one real input (reference 01-boas-vindas, lima boxes). The input keeps the
 * SMS autofill: `autoComplete="sms-otp"` on Android, `textContentType="oneTimeCode"` on iOS.
 */
export function CodeInput({ value, onChange, error, autoFocus }: CodeInputProps) {
  const t = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const box = t.touchTarget.min;
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Pressable
        onPress={() => input.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel={`Digitar o código, ${value.length} de ${LENGTH} números`}
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm }}
      >
        {Array.from({ length: LENGTH }, (_, i) => {
          const digit = value[i];
          const active = i === Math.min(value.length, LENGTH - 1);
          return (
            <View
              key={i}
              importantForAccessibility="no-hide-descendants"
              style={{
                flex: 1,
                maxWidth: box,
                height: box + t.spacing.sm,
                borderRadius: t.radii.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: digit ? t.colors.accentSoft : t.colors.surface,
                borderWidth: active || error ? t.sizes.borderStrong : t.sizes.border,
                borderColor: error ? t.colors.danger : active ? t.colors.primary : t.colors.border,
              }}
            >
              <Text variant="title" weight="bold">
                {digit ?? ''}
              </Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, LENGTH))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel="Código de 6 dígitos"
        // Invisible but focusable: the boxes above draw what is typed.
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
      {error ? (
        <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
