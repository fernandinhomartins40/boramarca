import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface BadgeProps {
  count: number;
  /** Hidden when the count is zero (default true). */
  hideWhenZero?: boolean;
}

/** Small lima counter (Decisões tab, unread messages). */
export function Badge({ count, hideWhenZero = true }: BadgeProps) {
  const t = useTheme();
  if (hideWhenZero && count <= 0) return null;
  return (
    <View
      accessibilityLabel={`${count} pendente${count === 1 ? '' : 's'}`}
      style={{
        minWidth: t.sizes.iconSm,
        height: t.sizes.iconSm,
        paddingHorizontal: t.spacing.xs,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" color="onAccent" weight="bold" allowFontScaling={false}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
