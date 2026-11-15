import { Pressable } from 'react-native';
import { Plus, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';

export interface FabProps {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: LucideIcon;
}

/** Big round "+" at the bottom right (novo agendamento). Place inside a relative container. */
export function Fab({ onPress, accessibilityLabel, icon: Icon = Plus }: FabProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        position: 'absolute',
        right: t.spacing.lg,
        bottom: t.spacing.lg,
        width: t.sizes.fab,
        height: t.sizes.fab,
        borderRadius: t.radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.colors.primary,
        opacity: pressed ? t.opacity.pressed : 1,
        elevation: t.spacing.xs,
        shadowColor: t.colors.scrim,
        shadowOpacity: t.opacity.scrim / 2,
        shadowRadius: t.spacing.sm,
        shadowOffset: { width: 0, height: t.spacing.xs },
      })}
    >
      <Icon color={t.colors.onPrimary} size={t.sizes.iconLg} />
    </Pressable>
  );
}
