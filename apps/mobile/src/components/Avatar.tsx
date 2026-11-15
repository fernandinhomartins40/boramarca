import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

/** "Ana Paula" → "AP"; "Rafael" → "R". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Circle with initials, violeta claro (references 05, 06, 07, 10). */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  const t = useTheme();
  const d = { sm: t.sizes.avatarSm, md: t.sizes.avatar, lg: t.sizes.avatarLg }[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: d,
        height: d,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant={size === 'lg' ? 'title' : size === 'md' ? 'body' : 'bodySmall'}
        weight="bold"
        color="primaryText"
        allowFontScaling={false}
      >
        {initials(name)}
      </Text>
    </View>
  );
}
