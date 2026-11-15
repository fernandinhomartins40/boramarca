import { useState } from 'react';
import { View } from 'react-native';
import { CANCEL_REASONS, type AppointmentDetail } from '@boramarca/shared';
import {
  BottomSheet,
  Button,
  Chip,
  ListItem,
  MessagePreview,
  Switch,
  showToast,
} from '@/components';
import { data } from '@/data';
import { useTheme } from '@/theme';
import { dateOnly } from '@/utils/agenda';
import { firstName } from './format';
import { cancelMessage, rescheduleMessage, useEditableMessage } from './messages';
import { SlotPicker } from './SlotPicker';

interface SheetProps {
  appointment: AppointmentDetail;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

function NotifyRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <ListItem
      title="Avisar no WhatsApp"
      chevron={false}
      right={
        <Switch value={value} onValueChange={onChange} accessibilityLabel="Avisar no WhatsApp" />
      }
    />
  );
}

/** "Remarcar": day + free times (same duration), with the message preview. */
export function RescheduleSheet({ appointment: a, visible, onClose, onDone }: SheetProps) {
  const t = useTheme();
  const [date, setDate] = useState(dateOnly(a.startsAt));
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [text, setText] = useEditableMessage(
    startsAt ? rescheduleMessage(a.clientName, startsAt, new Date()) : '',
  );
  const [busy, setBusy] = useState(false);
  const serviceIds = a.services.flatMap((s) => (s.serviceId ? [s.serviceId] : []));

  async function submit() {
    if (!startsAt) return;
    setBusy(true);
    try {
      await data.agenda.reschedule(a.id, {
        startsAt,
        notifyClient: notify,
        messageText: notify ? text : undefined,
      });
      showToast(notify ? `Remarcado! ${firstName(a.clientName)} já foi avisado.` : 'Remarcado.');
      onDone();
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Remarcar" subtitle={a.clientName}>
      <SlotPicker
        date={date}
        onDateChange={(d) => {
          setDate(d);
          setStartsAt(null);
        }}
        serviceIds={serviceIds}
        value={startsAt}
        onChange={setStartsAt}
      />
      <NotifyRow value={notify} onChange={setNotify} />
      {notify && startsAt ? <MessagePreview text={text} onChangeText={setText} /> : null}
      <View style={{ gap: t.spacing.sm }}>
        <Button
          label={notify ? 'Remarcar e avisar' : 'Remarcar'}
          onPress={submit}
          disabled={!startsAt}
          loading={busy}
        />
      </View>
    </BottomSheet>
  );
}

/** "Cancelar": reason chips, offer the slot to the waitlist (on by default), message preview. */
export function CancelSheet({ appointment: a, visible, onClose, onDone }: SheetProps) {
  const t = useTheme();
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [offer, setOffer] = useState(true);
  const [notify, setNotify] = useState(true);
  const [text, setText] = useEditableMessage(
    cancelMessage(a.clientName, a.startsAt, reason, new Date()),
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await data.agenda.cancel(a.id, {
        reason,
        offerToWaitlist: offer,
        notifyClient: notify,
        messageText: notify ? text : undefined,
      });
      showToast(offer ? 'Cancelado. Vou oferecer a vaga para a lista de espera.' : 'Cancelado.');
      onDone();
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Cancelar horário"
      subtitle="Qual o motivo?"
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
        {CANCEL_REASONS.map((r) => (
          <Chip key={r} label={r} selected={r === reason} onPress={() => setReason(r)} />
        ))}
      </View>
      <ListItem
        title="Oferecer a vaga para a lista de espera"
        chevron={false}
        right={
          <Switch
            value={offer}
            onValueChange={setOffer}
            accessibilityLabel="Oferecer a vaga para a lista de espera"
          />
        }
      />
      <NotifyRow value={notify} onChange={setNotify} />
      {notify ? <MessagePreview text={text} onChangeText={setText} /> : null}
      <Button label="Cancelar horário" variant="danger" onPress={submit} loading={busy} />
    </BottomSheet>
  );
}
