import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import type { ConversationFilter } from '@boramarca/shared';

export const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'ai', label: 'IA cuidando' },
  { value: 'human', label: 'Com você' },
  { value: 'unread', label: 'Não lidas' },
];

/** List time: "11:58" today, "Ontem", "12/11". */
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM');
}

/** "Próximo: hoje às 16h", "Próximo: amanhã às 9h30", "Próximo: 20/11 às 14h". */
export function nextLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getMinutes() === 0 ? format(d, "H'h'") : format(d, "H'h'mm");
  const day = isToday(d) ? 'hoje' : isTomorrow(d) ? 'amanhã' : format(d, 'dd/MM');
  return `Próximo: ${day} às ${h}`;
}
