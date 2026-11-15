import { View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Button } from './Button';

export interface BigChoiceProps {
  onYes: () => void;
  onNo: () => void;
  yesLabel?: string;
  noLabel?: string;
  /**
   * default: ≥ 96 dp, "Sim" violeta · compact: 56 dp (cards de decisão e de encaixe) ·
   * balcao: ≥ 120 dp, "Sim" lima sobre grafite (Modo Balcão).
   */
  size?: 'default' | 'compact' | 'balcao';
  disabled?: boolean;
  loading?: 'yes' | 'no' | null;
}

/** Sim / Não pair for quick decisions; each button takes half the width. */
export function BigChoice({
  onYes,
  onNo,
  yesLabel = 'Sim',
  noLabel = 'Não',
  size = 'default',
  disabled,
  loading,
}: BigChoiceProps) {
  const t = useTheme();
  const big = size === 'balcao';
  const minHeight = big
    ? t.touchTarget.balcaoChoice
    : size === 'compact'
      ? t.touchTarget.min
      : t.touchTarget.bigChoice;
  const style = { flex: 1, minHeight, borderRadius: big ? t.radii.lg : t.radii.md };
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
      <Button
        label={yesLabel}
        variant={big ? 'accent' : 'primary'}
        size="lg"
        icon={big || size === 'compact' ? undefined : Check}
        onPress={onYes}
        disabled={disabled}
        loading={loading === 'yes'}
        style={style}
      />
      <Button
        label={noLabel}
        variant={big ? 'neutral' : 'secondary'}
        size="lg"
        icon={big || size === 'compact' ? undefined : X}
        onPress={onNo}
        disabled={disabled}
        loading={loading === 'no'}
        style={[style, big && { backgroundColor: 'transparent', borderColor: t.colors.text }]}
      />
    </View>
  );
}
