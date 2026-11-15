import { useState } from 'react';
import { View } from 'react-native';
import { DELAY_OPTIONS_MINUTES, type AppointmentView } from '@boramarca/shared';
import { BottomSheet, Button, Chip, MessagePreview, showToast } from '@/components';
import { data } from '@/data';
import { useTheme } from '@/theme';
import { firstName } from './format';
import { delayMessage, useEditableMessage } from './messages';

export interface DelaySheetProps {
  appointment: AppointmentView | null;
  onClose: () => void;
}

/** "Avisar atraso": 10/15/20 min and the ready message to the next client. */
export function DelaySheet({ appointment, onClose }: DelaySheetProps) {
  const t = useTheme();
  const [minutes, setMinutes] = useState<number>(DELAY_OPTIONS_MINUTES[1]);
  const [text, setText] = useEditableMessage(delayMessage(appointment?.clientName ?? '', minutes));
  const [sending, setSending] = useState(false);

  async function send() {
    if (!appointment) return;
    setSending(true);
    try {
      await data.agenda.sendDelayNotice(appointment.id, {
        delayMinutes: minutes,
        messageText: text,
      });
      showToast(`Aviso enviado para ${firstName(appointment.clientName)}.`);
      onClose();
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet
      visible={!!appointment}
      onClose={onClose}
      title="Avisar que vou atrasar"
      subtitle={appointment ? `Mensagem para ${firstName(appointment.clientName)}` : undefined}
    >
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {DELAY_OPTIONS_MINUTES.map((m) => (
          <Chip key={m} label={`${m} min`} selected={m === minutes} onPress={() => setMinutes(m)} />
        ))}
      </View>
      <MessagePreview text={text} onChangeText={setText} />
      <Button label="Enviar aviso" onPress={send} loading={sending} />
    </BottomSheet>
  );
}
