import { View } from 'react-native';
import { Clock, UtensilsCrossed } from 'lucide-react-native';
import { Chip, Text, TextField } from '@/components';
import { useTheme } from '@/theme';
import { WEEK_ORDER, WEEKDAY_SHORT, maskTime, type Week } from './format';

/** Days (chips) + working hours + lunch break. Used by the quick sign-up and Ajustes. */
export function WeekEditor({
  value,
  onChange,
  error,
}: {
  value: Week;
  onChange: (w: Week) => void;
  error?: string | null;
}) {
  const t = useTheme();
  const set = (p: Partial<Week>) => onChange({ ...value, ...p });
  const time = (key: keyof Omit<Week, 'days'>, label: string, icon = Clock) => (
    <View style={{ flex: 1 }}>
      <TextField
        label={label}
        icon={icon}
        value={value[key]}
        onChangeText={(v) => set({ [key]: maskTime(v) })}
        placeholder="00:00"
        keyboardType="number-pad"
        maxLength={5}
      />
    </View>
  );
  return (
    <View style={{ gap: t.spacing.md }}>
      <Text weight="semibold">Dias da semana</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
        {WEEK_ORDER.map((d) => {
          const on = value.days.includes(d);
          return (
            <Chip
              key={d}
              label={WEEKDAY_SHORT[d]}
              selected={on}
              onPress={() =>
                set({ days: on ? value.days.filter((x) => x !== d) : [...value.days, d] })
              }
            />
          );
        })}
      </View>
      <Text weight="semibold">Horário de atendimento</Text>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {time('start', 'Começa')}
        {time('end', 'Termina')}
      </View>
      <Text weight="semibold">Intervalo de almoço</Text>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {time('lunchStart', 'Sai', UtensilsCrossed)}
        {time('lunchEnd', 'Volta', UtensilsCrossed)}
      </View>
      <Text variant="caption" color="textMuted">
        Sem almoço? Deixe os dois campos vazios.
      </Text>
      {error ? (
        <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
