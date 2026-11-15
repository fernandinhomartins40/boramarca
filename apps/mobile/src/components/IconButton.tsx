import { Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme, type AppColors } from '@/theme';

export interface IconButtonProps {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress?: () => void;
  onLongPress?: () => void;
  color?: keyof AppColors;
  /** Small dot (e.g. unread notifications). */
  dot?: boolean;
  disabled?: boolean;
}

/** Round icon button with the 56 dp minimum touch area. */
export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  onLongPress,
  color = 'text',
  dot,
  disabled,
}: IconButtonProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: t.touchTarget.min,
        height: t.touchTarget.min,
        borderRadius: t.radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
        opacity: disabled ? t.opacity.disabled : 1,
      })}
    >
      <Icon color={t.colors[color]} size={t.sizes.iconLg - t.spacing.xs} />
      {dot ? (
        <View
          style={{
            position: 'absolute',
            top: t.spacing.md,
            right: t.spacing.md,
            width: t.spacing.sm,
            height: t.spacing.sm,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.primary,
          }}
        />
      ) : null}
    </Pressable>
  );
}
