import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Logo } from './Logo';
import { Text } from './Text';

export interface HeaderProps {
  /** Title next to the back arrow ("Agendamento"). Without it the brand logo is shown. */
  title?: string;
  onBack?: () => void;
  /** Right-side actions (IconButtons: sino, perfil, menu). */
  right?: ReactNode;
  /** Shows the logo even with a back arrow (reference 03-whatsapp). */
  showLogo?: boolean;
}

/** Top bar: logo + actions (tabs) or back arrow + title (inner screens). */
export function Header({ title, onBack, right, showLogo }: HeaderProps) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: t.touchTarget.min,
        gap: t.spacing.xs,
      }}
    >
      {onBack ? <IconButton icon={ArrowLeft} accessibilityLabel="Voltar" onPress={onBack} /> : null}
      {showLogo || !title ? <Logo /> : null}
      {title ? (
        <Text variant="heading" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right ? <View style={{ flexDirection: 'row' }}>{right}</View> : null}
    </View>
  );
}
