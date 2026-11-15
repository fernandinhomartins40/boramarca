import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

export type VoiceOrbState = 'parado' | 'ouvindo' | 'pensando' | 'falando';

export interface VoiceOrbProps {
  state: VoiceOrbState;
  /** Diameter in dp (default sizes.orb). Modo Balcão uses ~40% of the screen height. */
  size?: number;
  /** Content inside the orb when `parado` ("Diga Ei, Bora Marca"). */
  children?: ReactNode;
}

const STATE_LABELS: Record<VoiceOrbState, string> = {
  parado: 'Assistente parado',
  ouvindo: 'Ouvindo',
  pensando: 'Pensando',
  falando: 'Falando',
};

/** Bar heights (share of the inner circle) of the voice wave, as in reference 08-voz. */
const BARS = [0.22, 0.34, 0.26, 0.52, 0.72, 0.5, 0.3, 0.4, 0.22] as const;

function Bar({
  index,
  share,
  size,
  active,
  fast,
}: {
  index: number;
  share: number;
  size: number;
  active: boolean;
  fast: boolean;
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: t.duration.normal });
      return;
    }
    const d = fast ? t.duration.normal * 2 : t.duration.pulse;
    scale.value = withDelay(
      index * (d / BARS.length),
      withRepeat(withTiming(0.45, { duration: d, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [active, fast, index, scale, t.duration.normal, t.duration.pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return (
    <Animated.View
      style={[
        {
          width: size * 0.035,
          height: size * share,
          borderRadius: t.radii.pill,
          backgroundColor: index % 3 === 1 ? t.colors.primaryText : t.colors.accent,
        },
        style,
      ]}
    />
  );
}

/**
 * Voice state circle for Modo Balcão. Slow, calm animations (prompt 07): it must not distract.
 * parado = violeta com anéis respirando · ouvindo/falando = anel violeta com onda · pensando = pulso.
 */
export function VoiceOrb({ state, size, children }: VoiceOrbProps) {
  const t = useTheme();
  const d = size ?? t.sizes.orb;
  const breath = useSharedValue(1);
  const breathing = state === 'parado' || state === 'pensando';
  const breathTo = state === 'pensando' ? 0.9 : 1.04;
  useEffect(() => {
    if (!breathing) {
      cancelAnimation(breath);
      breath.value = withTiming(1);
      return;
    }
    breath.value = withRepeat(
      withTiming(breathTo, { duration: t.duration.orb, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [breathing, breathTo, breath, t.duration.orb]);
  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));

  const ring = (share: number, opacity: number) => ({
    position: 'absolute' as const,
    width: d * share,
    height: d * share,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.primary,
    opacity,
  });

  const wave = state === 'ouvindo' || state === 'falando';
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={STATE_LABELS[state]}
      style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}
    >
      {wave ? (
        <>
          <View
            style={{
              position: 'absolute',
              width: d * 0.8,
              height: d * 0.8,
              borderRadius: t.radii.pill,
              borderWidth: Math.max(t.sizes.borderStrong, d * 0.03),
              borderColor: t.colors.primary,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d * 0.025 }}>
            {BARS.map((share, i) => (
              <Bar key={i} index={i} share={share} size={d} active fast={state === 'falando'} />
            ))}
          </View>
        </>
      ) : (
        <Animated.View
          style={[
            { width: d, height: d, alignItems: 'center', justifyContent: 'center' },
            breathStyle,
          ]}
        >
          <View style={ring(1, 0.25)} />
          <View style={ring(0.84, 0.45)} />
          <View style={ring(state === 'pensando' ? 0.5 : 0.68, 1)} />
          <View style={{ maxWidth: d * 0.6, alignItems: 'center' }}>{children}</View>
        </Animated.View>
      )}
    </View>
  );
}
