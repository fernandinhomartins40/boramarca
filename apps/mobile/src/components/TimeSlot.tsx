import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { StatusPill, type PillStatus } from './StatusPill';
import { Text } from './Text';

/**
 * busy = ocupado · free = livre (tracejado) · freed = recém-vagou (pulso sutil) · lunch =
 * intervalo (hachurado) · past = já passou (opacidade menor).
 */
export type TimeSlotState = 'busy' | 'free' | 'freed' | 'lunch' | 'past';

export interface TimeSlotProps {
  /** "14:00". */
  time: string;
  state: TimeSlotState;
  /** Client name, "Livre — toque para marcar", "Almoço"... */
  title: string;
  /** Service, "Cancelou há 3 min"... */
  subtitle?: string;
  status?: PillStatus;
  onPress?: () => void;
  /** Extra height for longer services (multiples of the base row). */
  rows?: number;
}

function Hatch() {
  const t = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      <Defs>
        <Pattern
          id="hatch"
          width={t.spacing.sm}
          height={t.spacing.sm}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Line
            x1="0"
            y1="0"
            x2="0"
            y2={t.spacing.sm}
            stroke={t.colors.border}
            strokeWidth={t.sizes.borderStrong}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#hatch)" />
    </Svg>
  );
}

/** One row of the day timeline: time · dot on the line · card. */
export function TimeSlot({
  time,
  state,
  title,
  subtitle,
  status,
  onPress,
  rows = 1,
}: TimeSlotProps) {
  const t = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'freed') {
      pulse.value = withRepeat(
        withTiming(t.opacity.past, { duration: t.duration.pulse }),
        -1,
        true,
      );
    }
  }, [state, pulse, t.opacity.past, t.duration.pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const free = state === 'free';
  const dot =
    state === 'busy' || state === 'past' ? (
      <View
        style={{
          width: t.sizes.dot,
          height: t.sizes.dot,
          borderRadius: t.radii.pill,
          backgroundColor: t.colors.accent,
        }}
      />
    ) : state === 'freed' ? (
      <View
        style={{
          width: t.sizes.iconSm,
          height: t.sizes.iconSm,
          borderRadius: t.radii.pill,
          backgroundColor: t.colors.textMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X color={t.colors.surface} size={t.sizes.dot} strokeWidth={t.sizes.borderStrong} />
      </View>
    ) : (
      <View
        style={{
          width: t.sizes.dot + t.spacing.xs,
          height: t.sizes.dot + t.spacing.xs,
          borderRadius: t.radii.pill,
          borderWidth: t.sizes.borderStrong,
          borderColor: t.colors.textMuted,
          backgroundColor: t.colors.bg,
        }}
      />
    );

  const label = [time, title, subtitle].filter(Boolean).join(', ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: t.spacing.md,
        minHeight: t.touchTarget.min * rows + t.spacing.md * (rows - 1),
        opacity: state === 'past' ? t.opacity.past : 1,
      }}
    >
      <Text
        variant="body"
        weight="medium"
        style={{ width: t.spacing.xxxl + t.spacing.sm, paddingTop: t.spacing.md }}
      >
        {time}
      </Text>
      <View style={{ width: t.sizes.iconSm, alignItems: 'center' }}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              left: t.sizes.iconSm / 2 - t.sizes.border,
              width: t.sizes.borderStrong,
              backgroundColor: t.colors.accent,
            },
          ]}
        />
        <View style={{ marginTop: t.spacing.lg }}>{dot}</View>
      </View>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label}
        style={({ pressed }) => [
          {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            marginBottom: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.sm,
            borderRadius: t.radii.md,
            overflow: 'hidden',
            backgroundColor: free ? 'transparent' : t.colors.surfaceAlt,
            borderWidth: free ? t.sizes.border : 0,
            borderStyle: free ? 'dashed' : 'solid',
            borderColor: t.colors.textMuted,
            opacity: pressed ? t.opacity.pressed : 1,
          },
        ]}
      >
        {state === 'lunch' ? <Hatch /> : null}
        {state === 'freed' ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: t.radii.md,
                borderWidth: t.sizes.borderStrong,
                borderColor: t.colors.primary,
              },
              pulseStyle,
            ]}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text weight={free ? 'regular' : 'semibold'} color={free ? 'textMuted' : 'text'}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {status ? <StatusPill status={status} /> : null}
      </Pressable>
    </View>
  );
}
