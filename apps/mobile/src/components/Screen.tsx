import type { ReactElement, ReactNode } from 'react';
import {
  ScrollView,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme, type AppColors } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wraps the content in a ScrollView. */
  scroll?: boolean;
  /** Padding around the content (default true). */
  padded?: boolean;
  background?: keyof AppColors;
  /** Safe-area edges. Tab screens use ['top','left','right']: the tab bar handles the bottom. */
  edges?: Edge[];
  refreshControl?: ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Fixed content below the scroll area (footer buttons). */
  footer?: ReactNode;
}

export function Screen({
  children,
  scroll,
  padded = true,
  background = 'bg',
  edges = ['top', 'left', 'right', 'bottom'],
  refreshControl,
  contentStyle,
  footer,
}: ScreenProps) {
  const t = useTheme();
  const pad: ViewStyle = padded
    ? { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md }
    : {};
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.colors[background] }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { gap: t.spacing.md }, contentStyle]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, gap: t.spacing.md }, pad, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View
          style={{
            flexDirection: 'row',
            gap: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
            borderTopWidth: t.sizes.hairline,
            borderTopColor: t.colors.border,
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
