import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface ProgressStepsProps {
  /** 1-based current step. */
  current: number;
  total: number;
}

/** Segmented progress bar of the quick sign-up ("1/4"), reference 02-cadastro. */
export function ProgressSteps({ current, total }: ProgressStepsProps) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Etapa ${current} de ${total}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: t.spacing.sm,
            borderRadius: t.radii.pill,
            backgroundColor: i < current ? t.colors.primary : t.colors.surfaceAlt,
          }}
        />
      ))}
      <Text variant="bodySmall" color="textMuted" style={{ marginLeft: t.spacing.sm }}>
        {current}/{total}
      </Text>
    </View>
  );
}
