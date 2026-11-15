import { Pressable, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Card } from './Card';
import { Text } from './Text';

export interface NextCardProps {
  /** "Rafael às 15:00". */
  title: string;
  /** "em 12 min". */
  relative: string;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
}

/** "Próximo" line under the Agora card, with the small outline action "Avisar atraso". */
export function NextCard({ title, relative, actionLabel, onAction, onPress }: NextCardProps) {
  const t = useTheme();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Próximo: ${title}, ${relative}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.sm,
      }}
    >
      <Clock color={t.colors.text} size={t.sizes.icon} />
      <Text style={{ flex: 1 }}>
        <Text weight="bold">{title}</Text>
        <Text color="textMuted"> · {relative}</Text>
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={t.spacing.sm}
          style={({ pressed }) => ({
            minHeight: t.touchTarget.min - t.spacing.md,
            justifyContent: 'center',
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radii.sm,
            borderWidth: t.sizes.border,
            borderColor: t.colors.primaryText,
            backgroundColor: t.colors.surfaceAlt,
            opacity: pressed ? t.opacity.pressed : 1,
          })}
        >
          <View>
            <Text variant="bodySmall" weight="semibold" color="primaryText">
              {actionLabel}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </Card>
  );
}
