import { Pressable, View } from 'react-native';
import { CircleCheck, Info, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react-native';
import { useTheme, type AppColors } from '@/theme';
import { Text } from './Text';

/**
 * info = violeta claro ("Só avisamos quem pediu") · success/accent = lima claro · warning = âmbar
 * (aviso discreto) · danger = vermelho fixo ("WhatsApp desconectado — toque para reconectar").
 */
export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerProps {
  message: string;
  tone?: BannerTone;
  icon?: LucideIcon;
  /** Whole banner becomes a button. */
  onPress?: () => void;
  actionLabel?: string;
}

const looks: Record<BannerTone, { bg: keyof AppColors; fg: keyof AppColors; icon: LucideIcon }> = {
  info: { bg: 'surfaceAlt', fg: 'text', icon: Info },
  success: { bg: 'accentSoft', fg: 'text', icon: CircleCheck },
  warning: { bg: 'warning', fg: 'onWarning', icon: TriangleAlert },
  danger: { bg: 'danger', fg: 'onDanger', icon: WifiOff },
};

export function Banner({ message, tone = 'info', icon, onPress, actionLabel }: BannerProps) {
  const t = useTheme();
  const look = looks[tone];
  const Icon = icon ?? look.icon;
  const content = (
    <>
      <Icon color={t.colors[look.fg]} size={t.sizes.icon} />
      <Text variant="bodySmall" weight="medium" style={{ flex: 1, color: t.colors[look.fg] }}>
        {message}
      </Text>
      {actionLabel ? (
        <Text variant="bodySmall" weight="bold" style={{ color: t.colors[look.fg] }}>
          {actionLabel}
        </Text>
      ) : null}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.spacing.md,
    minHeight: t.touchTarget.min,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radii.md,
    backgroundColor: t.colors[look.bg],
  };
  if (!onPress)
    return (
      <View accessibilityRole="alert" style={style}>
        {content}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={actionLabel ? `${message}. ${actionLabel}` : message}
      style={({ pressed }) => [style, { opacity: pressed ? t.opacity.pressed : 1 }]}
    >
      {content}
    </Pressable>
  );
}
