import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface NowIndicatorProps {
  /** "14:48". */
  time: string;
}

/** "Agora" line across the timeline: violeta pill with the time + line. */
export function NowIndicator({ time }: NowIndicatorProps) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={`Agora, ${time}`}
      style={{ flexDirection: 'row', alignItems: 'center', marginVertical: t.spacing.xs }}
    >
      <View
        style={{
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.xs / 2,
          borderRadius: t.radii.pill,
          backgroundColor: t.colors.primary,
          borderWidth: t.sizes.borderStrong,
          borderColor: t.colors.surfaceAlt,
        }}
      >
        <Text variant="caption" weight="bold" color="onPrimary">
          {time}
        </Text>
      </View>
      <View style={{ flex: 1, height: t.sizes.borderStrong, backgroundColor: t.colors.primary }} />
    </View>
  );
}
