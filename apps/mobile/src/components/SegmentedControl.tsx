import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** "Pendentes (2) | Resolvidas", "Clientes | Lista de espera (3)". */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: t.spacing.xs,
        borderRadius: t.radii.md,
        backgroundColor: t.colors.surfaceAlt,
      }}
    >
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <Pressable
            key={s.value}
            onPress={() => onChange(s.value)}
            accessibilityRole="tab"
            accessibilityLabel={s.label}
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              minHeight: t.touchTarget.min - t.spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: t.radii.md - t.spacing.xs,
              backgroundColor: selected ? t.colors.primary : 'transparent',
            }}
          >
            <Text
              weight={selected ? 'semibold' : 'regular'}
              color={selected ? 'onPrimary' : 'textMuted'}
            >
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
