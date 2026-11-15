import { useState } from 'react';
import { View } from 'react-native';
import { Search } from 'lucide-react-native';
import type { ClientSummary, DayPeriod, Id, WaitlistEntryView } from '@boramarca/shared';
import {
  Banner,
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  ListItem,
  MessagePreview,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { firstName, toE164 } from '@/features/agenda/format';
import { useEditableMessage, waitlistOfferMessage } from '@/features/agenda/messages';
import { SlotPicker } from '@/features/agenda/SlotPicker';
import { useLoad } from '@/features/agenda/useLoad';
import { useTheme } from '@/theme';
import { dateOnly } from '@/utils/agenda';
import { PERIODS, WEEKDAY_SHORT } from './preference';

const toggle = <T,>(list: T[], v: T) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export interface AddToWaitlistSheetProps {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  /** From the client profile: skip the client step. */
  client?: { id: Id; name: string };
}

/** "+ Adicionar à lista": client (existing or new), preference, and "she asked" confirmation. */
export function AddToWaitlistSheet({ visible, onClose, onDone, client }: AddToWaitlistSheetProps) {
  const t = useTheme();
  const clients = useLoad(
    () => (client ? Promise.resolve(null) : data.clients.list({ sort: 'name' })),
    [client?.id],
  );
  const services = useLoad(() => data.profile.listServices(), []);
  const [picked, setPicked] = useState<ClientSummary | null>(null);
  const [search, setSearch] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [periods, setPeriods] = useState<DayPeriod[]>([]);
  const [serviceId, setServiceId] = useState<Id | null>(null);
  const [asked, setAsked] = useState(false);
  const [saving, setSaving] = useState(false);

  const who = client ?? picked;
  const q = search.trim().toLowerCase();
  const matches = q
    ? (clients.data?.items ?? []).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4)
    : [];
  const phone = toE164(newPhone);
  const canCreate = !who && !!q && !!phone;

  async function submit() {
    setSaving(true);
    try {
      const clientId =
        who?.id ?? (await data.clients.create({ name: search.trim(), phone: phone! })).id;
      await data.waitlist.add({
        clientId,
        serviceId,
        preference: { weekdays, periods },
        clientAsked: true,
      });
      showToast('Adicionado à lista de espera.');
      onDone();
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Adicionar à lista de espera">
      <Banner
        tone="warning"
        message="Só adicione quem pediu para ser avisado. Isso protege seu WhatsApp."
      />
      {client ? (
        <Text weight="bold">{client.name}</Text>
      ) : picked ? (
        <ListItem
          avatarName={picked.name}
          title={picked.name}
          subtitle="Toque para trocar"
          chevron={false}
          onPress={() => setPicked(null)}
        />
      ) : (
        <>
          <TextField
            icon={Search}
            value={search}
            onChangeText={setSearch}
            placeholder="Nome do cliente"
            accessibilityLabel="Nome do cliente"
          />
          {matches.map((c) => (
            <ListItem
              key={c.id}
              avatarName={c.name}
              title={c.name}
              chevron={false}
              onPress={() => setPicked(c)}
            />
          ))}
          {q && matches.length === 0 ? (
            <TextField
              label="Cliente novo: celular com DDD"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              error={newPhone && !phone ? 'Confira o número com DDD' : null}
            />
          ) : null}
        </>
      )}
      <Text variant="bodySmall" weight="bold">
        Quando pode vir
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
        {WEEKDAY_SHORT.map((d, i) => (
          <Chip
            key={d}
            label={d}
            selected={weekdays.includes(i)}
            onPress={() => setWeekdays(toggle(weekdays, i))}
          />
        ))}
        {PERIODS.map((p) => (
          <Chip
            key={p.value}
            label={p.label}
            selected={periods.includes(p.value)}
            onPress={() => setPeriods(toggle(periods, p.value))}
          />
        ))}
      </View>
      {services.data && services.data.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {services.data.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={serviceId === s.id}
              onPress={() => setServiceId(serviceId === s.id ? null : s.id)}
            />
          ))}
        </View>
      ) : null}
      <Checkbox label="Essa pessoa pediu para ser avisada" checked={asked} onChange={setAsked} />
      <Button
        label="Adicionar"
        onPress={submit}
        loading={saving}
        disabled={!asked || !(who || canCreate)}
      />
    </BottomSheet>
  );
}

/** "Oferecer vaga agora": free time → preview → send. */
export function OfferSheet({
  entry,
  onClose,
  onDone,
}: {
  entry: WaitlistEntryView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(dateOnly(new Date()));
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const services = useLoad(() => data.profile.listServices(), []);
  const serviceId = entry?.serviceId ?? services.data?.[0]?.id;
  const [text, setText] = useEditableMessage(
    entry && startsAt ? waitlistOfferMessage(entry.clientName, startsAt, new Date()) : '',
  );

  async function send() {
    if (!entry || !startsAt) return;
    setSending(true);
    try {
      await data.waitlist.offer(entry.id, { slotStartsAt: startsAt, messageText: text });
      showToast(`Oferta enviada para ${firstName(entry.clientName)}.`);
      setStartsAt(null);
      onDone();
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet
      visible={!!entry}
      onClose={onClose}
      title="Oferecer vaga agora"
      subtitle={entry ? `Para ${entry.clientName}` : undefined}
    >
      <SlotPicker
        date={date}
        onDateChange={(d) => {
          setDate(d);
          setStartsAt(null);
        }}
        serviceIds={serviceId ? [serviceId] : []}
        value={startsAt}
        onChange={setStartsAt}
      />
      {startsAt ? <MessagePreview text={text} onChangeText={setText} /> : null}
      <Button label="Enviar oferta" onPress={send} disabled={!startsAt} loading={sending} />
    </BottomSheet>
  );
}
