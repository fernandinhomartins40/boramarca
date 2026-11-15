import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Avatar } from './Avatar';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Shows an initials avatar on the left. */
  avatarName?: string;
  /** Or an icon on the left (Ajustes rows). */
  icon?: LucideIcon;
  /** Right side: time, pill, switch... */
  right?: ReactNode;
  /** Extra content under the subtitle (tags). */
  children?: ReactNode;
  onPress?: () => void;
  /** Chevron when pressable (default true). */
  chevron?: boolean;
  accessibilityLabel?: string;
}

export function ListItem({
  title,
  subtitle,
  avatarName,
  icon: Icon,
  right,
  children,
  onPress,
  chevron = true,
  accessibilityLabel,
}: ListItemProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        minHeight: t.touchTarget.min,
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.md,
        backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
        borderRadius: t.radii.md,
      })}
    >
      {avatarName ? <Avatar name={avatarName} /> : null}
      {Icon ? <Icon color={t.colors.text} size={t.sizes.icon} /> : null}
      <View style={{ flex: 1, gap: t.spacing.xs / 2 }}>
        <Text weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>
      {right}
      {onPress && chevron ? <ChevronRight color={t.colors.textMuted} size={t.sizes.icon} /> : null}
    </Pressable>
  );
}
