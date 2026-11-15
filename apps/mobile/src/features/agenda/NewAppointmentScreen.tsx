import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Calendar, MessageCircle, Plus, Search, X } from 'lucide-react-native';
import type { ClientSummary, DateOnly, Id } from '@boramarca/shared';
import {
  Button,
  Card,
  ErrorState,
  Header,
  IconButton,
  ListItem,
  LoadingState,
  MessagePreview,
  Screen,
  Switch,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { useTheme } from '@/theme';
import { dateOnly, totalDuration } from '@/utils/agenda';
import { dayPhrase, firstName, formatPhone, money, spokenTime, toE164 } from './format';
import { bookingMessage, useEditableMessage } from './messages';
import { SlotPicker } from './SlotPicker';
import { useLoad } from './useLoad';

export interface NewAppointmentParams {
  /** Pre-filled start (tapped free slot). */
  startsAt?: string;
  date?: DateOnly;
  clientId?: Id;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <View
          style={{
            width: t.sizes.iconLg,
            height: t.sizes.iconLg,
            borderRadius: t.radii.sm,
            backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text weight="bold" color="primaryText">
            {n}
          </Text>
        </View>
        <Text variant="heading" weight="bold">
          {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

/** Novo agendamento (prompt 04, reference 05-agendamentos): cliente · serviço · horário. */
export function NewAppointmentScreen({
  startsAt: initialStart,
  date: initialDate,
  clientId,
}: NewAppointmentParams) {
  const t = useTheme();
  const clients = useLoad(() => data.clients.list({ sort: 'recent' }), []);
  const services = useLoad(() => data.profile.listServices(), []);

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [serviceIds, setServiceIds] = useState<Id[]>([]);
  const [date, setDate] = useState<DateOnly>(
    initialStart ? dateOnly(initialStart) : (initialDate ?? dateOnly(new Date())),
  );
  const [startsAt, setStartsAt] = useState<string | null>(initialStart ?? null);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const preset = clientId ? clients.data?.items.find((c) => c.id === clientId) : undefined;
  const chosen = client ?? preset ?? null;
  const active = services.data?.filter((s) => s.active) ?? [];
  // pre-select the only service, as in reference 05 (one "Sessão 50 min")
  const selected = serviceIds.length || active.length !== 1 ? serviceIds : [active[0]!.id];
  const picked = active.filter((s) => selected.includes(s.id));
  const serviceLabel = picked.map((s) => s.name).join(' + ');
  const phone = toE164(newPhone);
  const name = chosen?.name ?? (creating ? newName.trim() : '');
  const clientOk = !!chosen || (creating && !!newName.trim() && !!phone);
  const ready = clientOk && picked.length > 0 && !!startsAt;

  const [text, setText] = useEditableMessage(
    name && startsAt && picked.length
      ? bookingMessage(name, serviceLabel.toLowerCase(), startsAt, new Date())
      : '',
  );

  const q = search.trim().toLowerCase();
  const matches = (clients.data?.items ?? [])
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
    .slice(0, 4);

  async function submit() {
    if (!ready || !startsAt) return;
    setSaving(true);
    try {
      await data.agenda.create({
        ...(chosen
          ? { clientId: chosen.id }
          : { newClient: { name: newName.trim(), phone: phone! } }),
        serviceIds: picked.map((s) => s.id),
        startsAt,
        isFitIn: false,
        notifyClient: notify,
        messageText: notify ? text : undefined,
      });
      showToast(notify ? `Marcado! ${firstName(name)} já foi avisado.` : 'Marcado!');
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <Header showLogo onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
  );
  if (clients.loading || services.loading)
    return (
      <Screen>
        {header}
        <LoadingState />
      </Screen>
    );
  if (clients.error || services.error)
    return (
      <Screen>
        {header}
        <ErrorState
          onRetry={() => {
            void clients.reload();
            void services.reload();
          }}
        />
      </Screen>
    );

  const summary = [
    name ? firstName(name) : null,
    serviceLabel || null,
    startsAt ? `${dayPhrase(startsAt, new Date())} às ${spokenTime(startsAt)}` : null,
    picked.length ? money(picked.reduce((s, x) => s + x.priceCents, 0)) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      scroll
      footer={
        <View style={{ flex: 1, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Calendar color={t.colors.primaryText} size={t.sizes.iconSm} />
            <Text weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {summary || 'Escolha cliente, serviço e horário'}
            </Text>
          </View>
          <Button
            label={notify ? 'Marcar e avisar no WhatsApp' : 'Marcar'}
            icon={notify ? MessageCircle : undefined}
            onPress={submit}
            disabled={!ready}
            loading={saving}
          />
        </View>
      }
    >
      {header}
      <View style={{ gap: t.spacing.xs }}>
        <Text variant="title">Novo agendamento</Text>
        <Text color="textMuted">
          Agende um serviço, avise o cliente no WhatsApp e mantenha sua agenda em dia.
        </Text>
      </View>

      <Step n={1} title="Cliente">
        {chosen ? (
          <TextField
            icon={Search}
            value={chosen.name}
            editable={false}
            accessibilityLabel="Cliente escolhido"
            right={
              <IconButton
                icon={X}
                accessibilityLabel="Trocar cliente"
                onPress={() => {
                  setClient(null);
                  router.setParams({ clientId: undefined });
                }}
              />
            }
          />
        ) : creating ? (
          <>
            <TextField label="Nome" value={newName} onChangeText={setNewName} autoFocus />
            <TextField
              label="Celular com DDD"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              placeholder="(11) 91234-5678"
              error={newPhone && !phone ? 'Confira o número com DDD' : null}
            />
            <Button label="Escolher da lista" variant="ghost" onPress={() => setCreating(false)} />
          </>
        ) : (
          <>
            <TextField
              icon={Search}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar cliente"
              accessibilityLabel="Buscar cliente"
            />
            {matches.map((c) => (
              <ListItem
                key={c.id}
                avatarName={c.name}
                title={c.name}
                subtitle={formatPhone(c.phone)}
                chevron={false}
                onPress={() => setClient(c)}
              />
            ))}
            <Button
              label="Cliente novo"
              icon={Plus}
              variant="secondary"
              onPress={() => {
                setCreating(true);
                setNewName(search);
              }}
            />
          </>
        )}
      </Step>

      <Step n={2} title="Serviço">
        {active.map((s) => {
          const on = selected.includes(s.id);
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                setServiceIds(on ? selected.filter((x) => x !== s.id) : [...selected, s.id]);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${s.name}, ${s.durationMin} minutos, ${money(s.priceCents)}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                minHeight: t.touchTarget.min,
                paddingHorizontal: t.spacing.md,
                paddingVertical: t.spacing.sm,
                borderRadius: t.radii.md,
                borderWidth: t.sizes.border,
                borderColor: on ? t.colors.primary : t.colors.border,
                backgroundColor: on ? t.colors.surfaceAlt : t.colors.surface,
                opacity: pressed ? t.opacity.pressed : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text weight="semibold">{s.name}</Text>
                <Text variant="bodySmall" color="textMuted">
                  {s.durationMin} min
                </Text>
              </View>
              <Text weight="bold">{money(s.priceCents)}</Text>
              <View
                style={{
                  width: t.sizes.icon,
                  height: t.sizes.icon,
                  borderRadius: t.radii.pill,
                  borderWidth: t.sizes.borderStrong,
                  borderColor: on ? t.colors.primary : t.colors.textMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? (
                  <View
                    style={{
                      width: t.sizes.dot,
                      height: t.sizes.dot,
                      borderRadius: t.radii.pill,
                      backgroundColor: t.colors.primary,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {picked.length > 1 ? (
          <Text variant="bodySmall" color="textMuted">
            Total: {totalDuration(picked)} min
          </Text>
        ) : null}
      </Step>

      <Step n={3} title="Horário">
        <SlotPicker
          date={date}
          onDateChange={(d) => {
            setDate(d);
            setStartsAt(null);
          }}
          serviceIds={picked.map((s) => s.id)}
          value={startsAt}
          onChange={setStartsAt}
        />
      </Step>

      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <MessageCircle color={t.colors.text} size={t.sizes.icon} />
          <View style={{ flex: 1 }}>
            <Text weight="bold">Enviar confirmação no WhatsApp</Text>
            <Text variant="bodySmall" color="textMuted">
              A IA envia a confirmação para o cliente.
            </Text>
          </View>
          <Switch
            value={notify}
            onValueChange={setNotify}
            accessibilityLabel="Enviar confirmação no WhatsApp"
          />
        </View>
        {notify && text ? <MessagePreview text={text} onChangeText={setText} /> : null}
      </Card>
    </Screen>
  );
}
