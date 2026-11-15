import { View } from 'react-native';
import { Calendar, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Card } from './Card';
import { Text } from './Text';

export interface NowCardProps {
  /** "Agora" or "Próximo". */
  label: string;
  clientName: string;
  /** "Fisioterapia · 14:00–14:50". */
  detail: string;
  /** 0..1 elapsed share of the service; omitted = no bar. */
  progress?: number;
  onPress?: () => void;
}

/** Biggest element of the Agenda: violeta card with who is being served now. */
export function NowCard({ label, clientName, detail, progress, onPress }: NowCardProps) {
  const t = useTheme();
  return (
    <Card
      variant="primary"
      onPress={onPress}
      accessibilityLabel={`${label}: ${clientName}, ${detail}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.lg,
        paddingVertical: t.spacing.xl,
      }}
    >
      <Calendar color={t.colors.onPrimary} size={t.sizes.iconLg} />
      <View style={{ flex: 1, gap: t.spacing.xs }}>
        <Text variant="title" color="onPrimary">
          {label} · {clientName}
        </Text>
        <Text variant="body" color="onPrimary">
          {detail}
        </Text>
        {progress !== undefined ? (
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={{
              height: t.sizes.progress,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.surfaceAlt,
              overflow: 'hidden',
              marginTop: t.spacing.xs,
            }}
          >
            <View
              style={{
                width: `${Math.min(1, Math.max(0, progress)) * 100}%`,
                height: '100%',
                backgroundColor: t.colors.accent,
              }}
            />
          </View>
        ) : null}
      </View>
      {onPress ? <ChevronRight color={t.colors.onPrimary} size={t.sizes.icon} /> : null}
    </Card>
  );
}
