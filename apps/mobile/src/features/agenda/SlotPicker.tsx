import { useState } from 'react';
import { View } from 'react-native';
import type { DateOnly, Id } from '@boramarca/shared';
import { Button, Chip, DayStrip, Skeleton, Text } from '@/components';
import { data } from '@/data';
import { useTheme } from '@/theme';
import { minuteOfDay } from '@/utils/agenda';
import { clock } from './format';
import { useLoad } from './useLoad';

export interface SlotPickerProps {
  date: DateOnly;
  onDateChange: (date: DateOnly) => void;
  serviceIds: Id[];
  /** Selected start (ISO). */
  value: string | null;
  onChange: (startsAt: string) => void;
}

/**
 * 14-day strip + free start times where the total duration fits (GET /slots). Shows the starts on
 * the half hour plus the first start of each gap, so the chips stay few and readable.
 */
export function SlotPicker({ date, onDateChange, serviceIds, value, onChange }: SlotPickerProps) {
  const t = useTheme();
  const key = serviceIds.join(',');
  const slots = useLoad(
    () => (serviceIds.length ? data.agenda.getSlots(date, serviceIds) : Promise.resolve(null)),
    [date, key],
  );
  const [now] = useState(() => Date.now());
  const starts = (slots.data?.slots ?? [])
    .map((s) => s.startsAt)
    .filter((s) => Date.parse(s) > now);
  const shown = starts.filter((s, i) => {
    const m = minuteOfDay(s);
    const prev = i > 0 ? minuteOfDay(starts[i - 1]!) : -Infinity;
    return m % 30 === 0 || m - prev > 10 || s === value;
  });

  return (
    <View style={{ gap: t.spacing.md }}>
      <DayStrip value={date} onChange={onDateChange} />
      {!serviceIds.length ? (
        <Text color="textMuted">Escolha o serviço para ver os horários.</Text>
      ) : slots.loading ? (
        <Skeleton />
      ) : slots.error ? (
        <Button
          label="Não deu para ver os horários. Tentar de novo"
          variant="ghost"
          onPress={() => void slots.reload()}
        />
      ) : shown.length === 0 ? (
        <Text color="textMuted">Sem horário livre nesse dia.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {shown.map((s) => (
            <Chip key={s} label={clock(s)} selected={s === value} onPress={() => onChange(s)} />
          ))}
        </View>
      )}
    </View>
  );
}
