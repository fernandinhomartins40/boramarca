import { Fragment } from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface SummaryItem {
  icon: LucideIcon;
  label: string;
}

/** "8 atendimentos | 2 vagas | R$ 1.200" (reference 04-agenda). */
export function SummaryStrip({ items }: { items: readonly SummaryItem[] }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={items.map((i) => i.label).join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.sm,
        borderRadius: t.radii.lg,
        borderWidth: t.sizes.border,
        borderColor: t.colors.border,
        backgroundColor: t.colors.surface,
      }}
    >
      {items.map(({ icon: Icon, label }, i) => (
        <Fragment key={label}>
          {i > 0 ? (
            <View
              style={{
                width: t.sizes.border,
                alignSelf: 'stretch',
                backgroundColor: t.colors.border,
              }}
            />
          ) : null}
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.xs,
            }}
          >
            <Icon color={t.colors.text} size={t.sizes.iconSm} />
            <Text
              variant="bodySmall"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ flexShrink: 1 }}
            >
              {label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}
