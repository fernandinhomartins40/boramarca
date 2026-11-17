import { differenceInCalendarDays, format } from 'date-fns';
import type { ConversationFilter } from '@boramarca/shared';
import { salonClock } from '@/utils/timezone';

/** Salon calendar days from today to `d` (a salonClock date): 0 today, 1 tomorrow, -1 yesterday. */
const daysFromToday = (d: Date) => differenceInCalendarDays(d, salonClock());

export const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'ai', label: 'IA cuidando' },
  { value: 'human', label: 'Com você' },
  { value: 'unread', label: 'Não lidas' },
];

/** List time: "11:58" today, "Ontem", "12/11". */
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = salonClock(iso);
  const diff = daysFromToday(d);
  if (diff === 0) return format(d, 'HH:mm');
  if (diff === -1) return 'Ontem';
  return format(d, 'dd/MM');
}

/** "Próximo: hoje às 16h", "Próximo: amanhã às 9h30", "Próximo: 20/11 às 14h". */
export function nextLabel(iso: string): string {
  const d = salonClock(iso);
  const h = d.getMinutes() === 0 ? format(d, "H'h'") : format(d, "H'h'mm");
  const diff = daysFromToday(d);
  const day = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : format(d, 'dd/MM');
  return `Próximo: ${day} às ${h}`;
}
