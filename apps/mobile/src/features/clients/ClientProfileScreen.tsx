import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import {
  Bell,
  Calendar,
  Check,
  CircleCheck,
  Coins,
  Heart,
  MessageCircle,
  Phone,
  Plus,
  UserX,
  X,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  Header,
  IconButton,
  LoadingState,
  Screen,
  StatusPill,
  Switch,
  Text,
  TextField,
  pillForAppointment,
  showToast,
} from '@/components';
import { data } from '@/data';
import { clock, formatPhone, money, whatsappUrl } from '@/features/agenda/format';
import { useLoad, useRefreshOnFocus } from '@/features/agenda/useLoad';
import { preferenceLabel } from '@/features/waitlist/preference';
import { AddToWaitlistSheet } from '@/features/waitlist/WaitlistSheets';
import { useTheme } from '@/theme';

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ flex: 1, alignItems: 'center', gap: t.spacing.xs }}
    >
      {icon}
      <Text variant="heading" weight="bold">
        {value}
      </Text>
      <Text variant="bodySmall" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

/** Perfil do cliente (prompt 09, reference 10-clientes, 2nd screen). */
export function ClientProfileScreen({ id }: { id: string }) {
  const t = useTheme();
  const client = useLoad(() => data.clients.get(id), [id]);
  const stats = useLoad(() => data.clients.stats(id), [id]);
  const history = useLoad(() => data.agenda.listByClient(id), [id]);
  const waitlist = useLoad(() => data.waitlist.list(), []);
  useRefreshOnFocus(history.reload);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/clientes'));

  if (client.loading)
    return (
      <Screen>
        <Header title="Cliente" onBack={back} />
        <LoadingState />
      </Screen>
    );
  if (client.error || !client.data)
    return (
      <Screen>
        <Header title="Cliente" onBack={back} />
        <ErrorState
          title={client.error?.message ?? 'Não deu para carregar'}
          onRetry={() => void client.reload()}
        />
      </Screen>
    );

  const c = client.data;
  const notes = c.preferences.notes;
  const entry = waitlist.data?.items.find((e) => e.clientId === id);

  async function saveNotes(next: string[]) {
    try {
      await data.clients.update(id, { preferences: { notes: next } });
      await client.reload(true);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function toggleWaitlist(on: boolean) {
    if (on) return setAdding(true);
    if (!entry) return;
    try {
      await data.waitlist.remove(entry.id);
      showToast('Saiu da lista de espera.', 'info');
      await waitlist.reload(true);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  const s = stats.data;
  return (
    <Screen scroll>
      <Header title={c.name} onBack={back} />
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
          <Avatar name={c.name} size="lg" />
          <View style={{ flex: 1, gap: t.spacing.xs }}>
            <Text variant="heading" weight="bold">
              {c.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Phone color={t.colors.text} size={t.sizes.iconSm} />
              <Text>{formatPhone(c.phone)}</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button
            label="WhatsApp"
            icon={MessageCircle}
            variant="secondary"
            style={{ flex: 1 }}
            accessibilityLabel={`Abrir o WhatsApp de ${c.name}`}
            onPress={() => void Linking.openURL(whatsappUrl(c.phone))}
          />
          <Button
            label="Marcar"
            icon={Calendar}
            style={{ flex: 1 }}
            onPress={() =>
              router.push({ pathname: '/agendamento/novo', params: { clientId: c.id } })
            }
          />
        </View>
      </Card>

      {s ? (
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row' }}>
            <Stat
              icon={<Calendar color={t.colors.primaryText} size={t.sizes.icon} />}
              value={String(s.visitsCount)}
              label={s.visitsCount === 1 ? 'visita' : 'visitas'}
            />
            <Stat
              icon={<Coins color={t.colors.primaryText} size={t.sizes.icon} />}
              value={money(s.averageTicketCents)}
              label="ticket médio"
            />
            <Stat
              icon={
                s.noShowCount ? (
                  <UserX color={t.colors.danger} size={t.sizes.icon} />
                ) : (
                  <CircleCheck color={t.colors.primaryText} size={t.sizes.icon} />
                )
              }
              value={String(s.noShowCount)}
              label={s.noShowCount === 1 ? 'falta' : 'faltas'}
            />
          </View>
          {s.averageIntervalDays ? (
            <Text align="center" color="textMuted">
              Vem a cada {Math.round(s.averageIntervalDays)} dias
            </Text>
          ) : null}
        </Card>
      ) : stats.error ? (
        <ErrorState title="Não deu para ver os números" onRetry={() => void stats.reload()} />
      ) : null}

      <Card style={{ gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Heart color={t.colors.text} size={t.sizes.icon} />
          <Text weight="bold">Preferências</Text>
        </View>
        {notes.length === 0 ? (
          <Text color="textMuted">Nada anotado ainda. A IA anota o que o cliente contar.</Text>
        ) : (
          notes.map((n, i) => (
            <View key={`${n}-${i}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1 }}>{n}</Text>
              <IconButton
                icon={X}
                accessibilityLabel={`Apagar: ${n}`}
                onPress={() => void saveNotes(notes.filter((_, j) => j !== i))}
              />
            </View>
          ))
        )}
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder="Anotar preferência"
          accessibilityLabel="Nova preferência"
          right={
            note.trim() ? (
              <IconButton
                icon={Plus}
                accessibilityLabel="Salvar preferência"
                onPress={() => {
                  void saveNotes([...notes, note.trim()]);
                  setNote('');
                }}
              />
            ) : undefined
          }
        />
      </Card>

      <Card style={{ gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Calendar color={t.colors.text} size={t.sizes.icon} />
          <Text weight="bold">Histórico de agendamentos</Text>
        </View>
        {history.loading ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState onRetry={() => void history.reload()} />
        ) : history.data!.items.length === 0 ? (
          <Text color="textMuted">Nenhum atendimento ainda.</Text>
        ) : (
          history.data!.items.slice(0, 8).map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: t.spacing.xs,
                borderTopWidth: t.sizes.hairline,
                borderTopColor: t.colors.border,
              }}
            >
              {a.status === 'done' ? (
                <View
                  style={{
                    width: t.sizes.icon,
                    height: t.sizes.icon,
                    borderRadius: t.radii.pill,
                    backgroundColor: t.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check color={t.colors.onAccent} size={t.sizes.iconSm - t.spacing.xs} />
                </View>
              ) : (
                <StatusPill status={pillForAppointment(a.status, a.isFitIn)} />
              )}
              <View style={{ flex: 1 }}>
                <Text weight="medium">
                  {format(new Date(a.startsAt), "EEE, d 'de' MMM", { locale: ptBR })} ·{' '}
                  {clock(a.startsAt)}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  {a.services.map((x) => x.name).join(' + ')}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card style={{ gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Bell color={t.colors.text} size={t.sizes.icon} />
          <View style={{ flex: 1 }}>
            <Text>Está na lista de espera</Text>
            {entry ? (
              <Text variant="bodySmall" color="textMuted">
                {preferenceLabel(entry.preference)}
              </Text>
            ) : null}
          </View>
          <Switch
            value={!!entry}
            onValueChange={(v) => void toggleWaitlist(v)}
            disabled={waitlist.loading}
            accessibilityLabel="Está na lista de espera"
          />
        </View>
      </Card>

      {adding ? (
        <AddToWaitlistSheet
          visible
          client={{ id: c.id, name: c.name }}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void waitlist.reload(true);
          }}
        />
      ) : null}
    </Screen>
  );
}
