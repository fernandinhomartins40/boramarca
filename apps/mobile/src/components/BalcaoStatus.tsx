import { Pressable } from 'react-native';
import { AudioLines, Mic, MicOff } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface BalcaoStatusProps {
  active: boolean;
  onPress?: () => void;
}

/** "Balcão ativo" (lima) / "Balcão desligado" pill in the Agenda header; opens Modo Balcão. */
export function BalcaoStatus({ active, onPress }: BalcaoStatusProps) {
  const t = useTheme();
  const fg = active ? t.colors.onAccent : t.colors.textMuted;
  const label = active ? 'Balcão ativo' : 'Balcão desligado';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Abrir o Modo Balcão`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: t.spacing.sm,
        minHeight: t.touchTarget.min - t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        borderRadius: t.radii.md,
        backgroundColor: active ? t.colors.accent : t.colors.surfaceAlt,
        opacity: pressed ? t.opacity.pressed : 1,
      })}
    >
      {active ? <Mic color={fg} size={t.sizes.icon} /> : <MicOff color={fg} size={t.sizes.icon} />}
      <Text weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
      {active ? <AudioLines color={fg} size={t.sizes.icon} /> : null}
    </Pressable>
  );
}
