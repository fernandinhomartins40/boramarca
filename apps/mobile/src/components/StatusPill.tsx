import { View } from 'react-native';
import { Check, type LucideIcon } from 'lucide-react-native';
import type { AppointmentStatus } from '@boramarca/shared';
import { useTheme, type AppColors } from '@/theme';
import { Text } from './Text';

export type PillStatus =
  | 'confirmado'
  | 'agendado'
  | 'pendente'
  | 'cancelado'
  | 'encaixe'
  | 'faltou'
  | 'em_atendimento'
  | 'concluido';

export interface StatusPillProps {
  status: PillStatus;
  /** Overrides the default label ("Cliente avisado", "Ok"). */
  label?: string;
  icon?: LucideIcon;
}

const looks: Record<PillStatus, { label: string; bg: keyof AppColors; fg: keyof AppColors }> = {
  confirmado: { label: 'Confirmado', bg: 'success', fg: 'onSuccess' },
  agendado: { label: 'Agendado', bg: 'surfaceAlt', fg: 'text' },
  pendente: { label: 'Pendente', bg: 'warning', fg: 'onWarning' },
  cancelado: { label: 'Cancelado', bg: 'danger', fg: 'onDanger' },
  encaixe: { label: 'Encaixe', bg: 'primary', fg: 'onPrimary' },
  faltou: { label: 'Faltou', bg: 'surfaceAlt', fg: 'textMuted' },
  em_atendimento: { label: 'Em atendimento', bg: 'primary', fg: 'onPrimary' },
  concluido: { label: 'Concluído', bg: 'surfaceAlt', fg: 'textMuted' },
};

const fromAppointment: Record<AppointmentStatus, PillStatus> = {
  scheduled: 'agendado',
  confirmed: 'confirmado',
  in_service: 'em_atendimento',
  done: 'concluido',
  cancelled: 'cancelado',
  no_show: 'faltou',
};

/** Maps an appointment to its pill (fit-ins that are still only scheduled show "Encaixe"). */
export function pillForAppointment(status: AppointmentStatus, isFitIn = false): PillStatus {
  return isFitIn && status === 'scheduled' ? 'encaixe' : fromAppointment[status];
}

export function StatusPill({ status, label, icon }: StatusPillProps) {
  const t = useTheme();
  const look = looks[status];
  const Icon = icon ?? (status === 'confirmado' && label ? Check : undefined);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.md,
        paddingVertical: t.spacing.xs,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors[look.bg],
      }}
    >
      {Icon ? <Icon color={t.colors[look.fg]} size={t.sizes.iconSm - t.spacing.xs} /> : null}
      <Text variant="caption" style={{ color: t.colors[look.fg] }}>
        {label ?? look.label}
      </Text>
    </View>
  );
}
