import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { MessageSquareText } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { TextField } from './TextField';

export interface MessagePreviewProps {
  text: string;
  /** Without it the preview is read-only. */
  onChangeText?: (text: string) => void;
  title?: string;
}

/** "Mensagem que será enviada": preview of the WhatsApp text, with "Editar" (reference 05). */
export function MessagePreview({
  text,
  onChangeText,
  title = 'Mensagem que será enviada',
}: MessagePreviewProps) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        backgroundColor: t.colors.surfaceAlt,
      }}
    >
      <MessageSquareText color={t.colors.primaryText} size={t.sizes.icon} />
      <View style={{ flex: 1, gap: t.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="bodySmall" weight="bold" style={{ flex: 1 }}>
            {title}
          </Text>
          {onChangeText ? (
            <Pressable
              onPress={() => setEditing((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Pronto' : 'Editar mensagem'}
              hitSlop={t.spacing.md}
            >
              <Text variant="bodySmall" weight="semibold" color="primaryText">
                {editing ? 'Pronto' : 'Editar'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {editing && onChangeText ? (
          <TextField
            value={text}
            onChangeText={onChangeText}
            multiline
            accessibilityLabel="Texto da mensagem"
          />
        ) : (
          <Text variant="bodySmall">{text}</Text>
        )}
      </View>
    </View>
  );
}
