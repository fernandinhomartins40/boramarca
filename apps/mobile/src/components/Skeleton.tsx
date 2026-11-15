import { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, type AppTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  /** Height in dp; default is one touch row. Pass theme values (t.touchTarget.min, t.spacing.xl). */
  height?: number;
  radius?: keyof AppTheme['radii'];
}

/** Pulsing placeholder block while data loads. */
export function Skeleton({ width = '100%', height, radius = 'md' }: SkeletonProps) {
  const t = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(t.opacity.disabled, { duration: t.duration.pulse }), -1, true);
  }, [o, t.opacity.disabled, t.duration.pulse]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        {
          width,
          height: height ?? t.touchTarget.min,
          borderRadius: t.radii[radius],
          backgroundColor: t.colors.surfaceAlt,
        },
        style,
      ]}
    />
  );
}
