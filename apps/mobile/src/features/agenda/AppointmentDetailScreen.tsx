import { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import {
  Calendar,
  CalendarClock,
  Check,
  CircleCheck,
  ClipboardList,
  CreditCard,
  MessageCircle,
  Phone,
  User,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import type { AppointmentDetail } from '@boramarca/shared';
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  pillForAppointment,
  showToast,
} from '@/components';
import { data } from '@/data';
import { useTheme } from '@/theme';
import { CancelSheet, RescheduleSheet } from './AppointmentSheets';
import { clock, dayPhrase, firstName, formatPhone, money, whatsappUrl } from './format';
import { useLoad } from './useLoad';

function InfoRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        minHeight: t.touchTarget.min - t.spacing.sm,
        borderTopWidth: t.sizes.hairline,
        borderTopColor: t.colors.border,
      }}
    >
      <Icon color={t.colors.text} size={t.sizes.icon} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

type Action = 'confirm' | 'arrive' | 'done' | 'noShow';

/** Detalhe do agendamento (prompt 04, reference 05-agendamentos). */
export function AppointmentDetailScreen({ id }: { id: string }) {
  const t = useTheme();
  const appt = useLoad(() => data.agenda.getAppointment(id), [id]);
  const [sheet, setSheet] = useState<'reschedule' | 'cancel' | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function run(action: Action, a: AppointmentDetail) {
    setBusy(action);
    try {
      await data.agenda[action](a.id);
      const first = firstName(a.clientName);
      showToast(
        {
          confirm: `Confirmado o horário de ${first}.`,
          arrive: `${first} chegou. Bom atendimento!`,
          done: 'Atendimento concluído.',
          noShow: `${first} marcado como faltou.`,
        }[action],
      );
      await appt.reload(true);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  }

  const header = <Header title="Agendamento" onBack={back} />;
  if (appt.loading)
    return (
      <Screen>
        {header}
        <LoadingState />
      </Screen>
    );
  if (appt.error || !appt.data)
    return (
      <Screen>
        {header}
        <ErrorState
          title={appt.error?.message ?? 'Não deu para carregar'}
          onRetry={() => void appt.reload()}
        />
      </Screen>
    );

  const a = appt.data;
  const now = new Date();
  const day = dayPhrase(a.startsAt, now);
  const open = a.status === 'scheduled' || a.status === 'confirmed';
  const primary: { action: Action; label: string; icon: LucideIcon } | null =
    a.status === 'scheduled'
      ? { action: 'confirm', label: 'Confirmar horário', icon: CircleCheck }
      : a.status === 'confirmed'
        ? { action: 'arrive', label: 'Cliente chegou', icon: Check }
        : a.status === 'in_service'
          ? { action: 'done', label: 'Atendimento concluído', icon: Check }
          : null;
  const afterChange = () => {
    setSheet(null);
    void appt.reload(true);
  };

  return (
    <Screen scroll>
      {header}
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Avatar name={a.clientName} size="lg" />
          <View style={{ flex: 1, gap: t.spacing.xs }}>
            <Text variant="heading" weight="bold">
              {a.clientName}
            </Text>
            <StatusPill
              status={pillForAppointment(a.status, a.isFitIn)}
              label={a.status === 'confirmed' ? 'Confirmado' : undefined}
            />
          </View>
        </View>
        <Pressable
          onPress={() => void Linking.openURL(whatsappUrl(a.client.phone))}
          accessibilityRole="link"
          accessibilityLabel={`Abrir o WhatsApp de ${a.clientName}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
        >
          <Phone color={t.colors.primaryText} size={t.sizes.iconSm} />
          <Text color="primaryText" weight="semibold">
            {formatPhone(a.client.phone)}
          </Text>
        </Pressable>
        <View>
          <InfoRow icon={ClipboardList}>
            <Text weight="bold">{a.services.map((s) => s.name).join(' + ')}</Text>
          </InfoRow>
          <InfoRow icon={Calendar}>
            <Text>
              {day.charAt(0).toUpperCase() + day.slice(1)}, {clock(a.startsAt)}–{clock(a.endsAt)}
            </Text>
          </InfoRow>
          <InfoRow icon={CreditCard}>
            <Text>{money(a.priceCents)}</Text>
          </InfoRow>
          <InfoRow icon={a.origin === 'ai' ? MessageCircle : User}>
            <Text>{a.origin === 'ai' ? 'Marcado pela IA via WhatsApp' : 'Marcado por você'}</Text>
          </InfoRow>
          {a.cancelReason ? (
            <InfoRow icon={X}>
              <Text>Motivo: {a.cancelReason}</Text>
            </InfoRow>
          ) : null}
        </View>
      </Card>

      {a.events.length ? (
        <Card style={{ gap: t.spacing.md }}>
          <Text variant="heading" weight="bold">
            Histórico do agendamento
          </Text>
          {a.events.map((e) => (
            <View key={e.id} style={{ flexDirection: 'row', gap: t.spacing.md }}>
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
              <View style={{ flex: 1 }}>
                <Text>{e.description}</Text>
                <Text variant="bodySmall" color="textMuted">
                  {clock(e.createdAt)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {primary ? (
        <Button
          label={primary.label}
          icon={primary.icon}
          size="lg"
          loading={busy === primary.action}
          onPress={() => void run(primary.action, a)}
        />
      ) : null}
      {open || a.status === 'in_service' ? (
        <Button
          label="Remarcar"
          icon={CalendarClock}
          variant="secondary"
          size="lg"
          onPress={() => setSheet('reschedule')}
        />
      ) : null}
      {open ? (
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button
            label="Cancelar"
            icon={X}
            variant="neutral"
            style={{ flex: 1 }}
            onPress={() => setSheet('cancel')}
          />
          <Button
            label="Marcar como faltou"
            icon={UserX}
            variant="neutral"
            style={{ flex: 1.4 }}
            loading={busy === 'noShow'}
            onPress={() => void run('noShow', a)}
          />
        </View>
      ) : null}
      {!open && a.status !== 'in_service' ? (
        <Button
          label="Marcar de novo"
          icon={Calendar}
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/agendamento/novo', params: { clientId: a.clientId } })
          }
        />
      ) : null}

      {sheet === 'reschedule' ? (
        <RescheduleSheet
          appointment={a}
          visible
          onClose={() => setSheet(null)}
          onDone={afterChange}
        />
      ) : null}
      {sheet === 'cancel' ? (
        <CancelSheet appointment={a} visible onClose={() => setSheet(null)} onDone={afterChange} />
      ) : null}
    </Screen>
  );
}
