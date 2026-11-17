import { Pressable, ScrollView } from 'react-native';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useTheme } from '@/theme';
import { salonClock } from '@/utils/timezone';
import { Text } from './Text';

export interface DayStripProps {
  /** Selected day, `YYYY-MM-DD`. */
  value: string;
  onChange: (date: string) => void;
  /** First day shown, a `salonClock` date (default today in the salon). */
  from?: Date;
  /** How many days (default 14). */
  days?: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Horizontal day picker: "Hoje / Qui, 24", "Amanhã / Sex, 25", "Sáb, / 26" (reference 05). */
export function DayStrip({ value, onChange, from = salonClock(), days = 14 }: DayStripProps) {
  const t = useTheme();
  const today = salonClock();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: t.spacing.sm }}
    >
      {Array.from({ length: days }, (_, i) => {
        const d = addDays(from, i);
        const key = format(d, 'yyyy-MM-dd');
        const diff = differenceInCalendarDays(d, today);
        const short = cap(format(d, 'EEE', { locale: ptBR }));
        const top = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : `${short},`;
        const bottom = diff === 0 || diff === 1 ? `${short}, ${format(d, 'd')}` : format(d, 'd');
        const selected = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}
            style={({ pressed }) => ({
              minWidth: t.touchTarget.min + t.spacing.lg,
              minHeight: t.touchTarget.min,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.xs,
              borderRadius: t.radii.md,
              backgroundColor: selected ? t.colors.accent : t.colors.surfaceAlt,
              opacity: pressed ? t.opacity.pressed : 1,
            })}
          >
            <Text
              variant="bodySmall"
              weight={selected ? 'bold' : 'medium'}
              style={{ color: selected ? t.colors.onAccent : t.colors.text }}
            >
              {top}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: selected ? t.colors.onAccent : t.colors.textMuted }}
            >
              {bottom}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
