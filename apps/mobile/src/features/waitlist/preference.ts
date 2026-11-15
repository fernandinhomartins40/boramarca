import type { DayPeriod, WaitlistPreference } from '@boramarca/shared';

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const PERIODS: { value: DayPeriod; label: string; phrase: string }[] = [
  { value: 'manha', label: 'Manhã', phrase: 'de manhã' },
  { value: 'tarde', label: 'Tarde', phrase: 'à tarde' },
  { value: 'noite', label: 'Noite', phrase: 'à noite' },
];

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;

/** "Qualquer dia à tarde" · "Só sábado" · "Terça e quinta de manhã". The note wins when present. */
export function preferenceLabel(p: WaitlistPreference): string {
  if (p.note?.trim()) return p.note.trim();
  const days = p.weekdays.length
    ? `${p.weekdays.length === 1 ? 'Só ' : ''}${list([...p.weekdays].sort().map((d) => WEEKDAYS[d]!))}`
    : 'Qualquer dia';
  const periods = list(PERIODS.filter((x) => p.periods.includes(x.value)).map((x) => x.phrase));
  const text = periods ? `${days} ${periods}` : days;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
