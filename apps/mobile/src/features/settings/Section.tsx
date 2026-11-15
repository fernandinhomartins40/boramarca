import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card, Text } from '@/components';
import { useTheme } from '@/theme';

/** Grouped card with a header, as in reference 11-ajustes ("Meu negócio", "A IA do Bora Marca"). */
export function Section({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <Card
      style={{ paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.md, gap: t.spacing.xs }}
    >
      {title ? (
        <View style={{ paddingHorizontal: t.spacing.md, gap: t.spacing.xs / 2 }}>
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}
