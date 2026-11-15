import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

/** Sheet from the bottom over a scrim (prévia de mensagem, "Saiba mais", opções de atraso). */
export function BottomSheet({ visible, onClose, title, subtitle, children }: BottomSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          onPress={onClose}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: t.colors.scrim, opacity: t.opacity.scrim },
          ]}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radii.lg,
            borderTopRightRadius: t.radii.lg,
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.sm,
            paddingBottom: insets.bottom + t.spacing.lg,
            gap: t.spacing.md,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: t.sizes.sheetHandle,
              height: t.sizes.progress,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.border,
            }}
          />
          {title ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: t.spacing.xs, paddingTop: t.spacing.sm }}>
                <Text variant="heading" weight="bold">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="bodySmall" color="textMuted">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton icon={X} accessibilityLabel="Fechar" onPress={onClose} />
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
