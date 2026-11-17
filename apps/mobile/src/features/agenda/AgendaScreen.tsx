import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeOutDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import {
  Armchair,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleUser,
  Coins,
  type LucideIcon,
} from 'lucide-react-native';
import type { AppointmentView, DateOnly, DecisionView } from '@boramarca/shared';
import {
  BalcaoStatus,
  BottomSheet,
  Button,
  Card,
  DayStrip,
  EmptyState,
  ErrorState,
  Fab,
  FitInCard,
  Header,
  IconButton,
  NextCard,
  NowCard,
  NowIndicator,
  Screen,
  Skeleton,
  SummaryStrip,
  Text,
  TimeSlot,
  pillForAppointment,
  showToast,
} from '@/components';
import { data } from '@/data';
import { useBalcaoStore } from '@/features/balcao/store';
import { useRealtime } from '@/lib/realtime';
import { handleDecisionAction } from '@/features/decisions';
import { useTheme } from '@/theme';
import {
  buildTimeline,
  dateOnly,
  hhmm,
  nowAndNext,
  relativeIn,
  atMinute,
  type TimelineRow,
} from '@/utils/agenda';
import { salonClock } from '@/utils/timezone';
import { DelaySheet } from './DelaySheet';
import { clock, dayTitle, firstName, money, plural, shiftDate } from './format';
import { useLoad, useRefreshOnFocus } from './useLoad';

export const AGENDA_REFRESH_MS = 30_000;

const newAt = (date: DateOnly, minute: number) =>
  router.push({ pathname: '/agendamento/novo', params: { startsAt: atMinute(date, minute) } });
const openAppointment = (id: string) =>
  router.push({ pathname: '/agendamento/[id]', params: { id } });

/** Agenda do dia (prompt 03, reference 04-agenda). */
export function AgendaScreen() {
  const t = useTheme();
  const [now, setNow] = useState(() => new Date());
  const today = dateOnly(now);
  const [date, setDate] = useState<DateOnly>(today);
  const [picking, setPicking] = useState(false);
  const [delayFor, setDelayFor] = useState<AppointmentView | null>(null);
  const [answering, setAnswering] = useState<'yes' | 'no' | null>(null);

  const day = useLoad(() => data.agenda.getDay(date), [date]);
  const decisions = useLoad(() => data.decisions.list('pending'), []);
  const me = useLoad(() => data.profile.getMe(), []);
  const services = useLoad(() => data.profile.listServices(), []);

  const { reload: reloadDay } = day;
  const { reload: reloadDecisions } = decisions;
  const refresh = useCallback(
    (silent = true) => {
      setNow(new Date());
      return Promise.all([reloadDay(silent), reloadDecisions(true)]).then(() => undefined);
    },
    [reloadDay, reloadDecisions],
  );
  useRefreshOnFocus(refresh);
  useRealtime(['appointment.changed', 'decision.created', 'decision.resolved'], () => void refresh());
  useEffect(() => {
    const timer = setInterval(() => void refresh(), AGENDA_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const slotMin = Math.min(
    ...(services.data?.filter((s) => s.active).map((s) => s.durationMin) ?? []),
    60,
  );
  const rows = useMemo(
    () => (day.data ? buildTimeline(day.data, now, slotMin) : []),
    [day.data, now, slotMin],
  );
  const isToday = date === today;
  const live = day.data && isToday ? nowAndNext(day.data.appointments, now) : null;
  // Sim/Não right on the agenda: fit-in requests first (reference 04), then any yes/no decision.
  const yesNo = decisions.data?.items.filter((d) => d.options.length === 2) ?? [];
  const decision = yesNo.find((d) => d.type === 'encaixe') ?? yesNo[0];
  const pendingCount = decisions.data?.items.length ?? 0;
  const balcaoActive = useBalcaoStore((s) => s.active);
  const booked = day.data?.appointments.filter((a) => a.status !== 'cancelled') ?? [];

  // scroll to the "agora" line once per day shown
  const scroll = useRef<ScrollViewInstance>(null);
  const timelineY = useRef(0);
  const scrolledFor = useRef<string | null>(null);
  const onNowLayout = (y: number) => {
    if (scrolledFor.current === date) return;
    scrolledFor.current = date;
    scroll.current?.scrollTo({ y: Math.max(0, timelineY.current + y - t.touchTarget.min * 2) });
  };

  async function answer(d: DecisionView, which: 'yes' | 'no') {
    const option = which === 'yes' ? d.options[0]! : d.options[d.options.length - 1]!;
    setAnswering(which);
    try {
      const r = await handleDecisionAction(d.id, { optionId: option.id }, 'app');
      showToast(r.spokenConfirmation, which === 'yes' ? 'success' : 'info');
      await refresh();
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setAnswering(null);
    }
  }

  const name = me.data ? firstName(me.data.professional.name) : null;
  const summary: { icon: LucideIcon; label: string }[] = day.data
    ? [
        {
          icon: Calendar,
          label: plural(day.data.summary.appointmentsCount, 'atendimento', 'atendimentos'),
        },
        { icon: Armchair, label: plural(day.data.summary.freeSlotsCount, 'vaga', 'vagas') },
        { icon: Coins, label: money(day.data.summary.expectedRevenueCents) },
      ]
    : [];

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{
          gap: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.md,
          paddingBottom: t.sizes.fab + t.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={day.refreshing}
            onRefresh={() => void refresh()}
            colors={[t.colors.primary]}
            tintColor={t.colors.primary}
          />
        }
      >
        <Header
          right={
            <>
              <IconButton
                icon={Bell}
                accessibilityLabel="Decisões pendentes"
                dot={pendingCount > 0}
                onPress={() => router.push('/decisoes')}
              />
              <IconButton
                icon={CircleUser}
                accessibilityLabel="Ajustes"
                onPress={() => router.push('/ajustes')}
              />
            </>
          }
        />
        <Text variant="title">{name ? `${name}, seu dia está assim` : 'Seu dia está assim'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
          <IconButton
            icon={ChevronLeft}
            accessibilityLabel="Dia anterior"
            onPress={() => setDate(shiftDate(date, -1))}
          />
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`${dayTitle(date, now)}. Escolher outro dia`}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
          >
            <Calendar color={t.colors.textMuted} size={t.sizes.iconSm} />
            <Text color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {dayTitle(date, now)}
            </Text>
          </Pressable>
          <IconButton
            icon={ChevronRight}
            accessibilityLabel="Próximo dia"
            onPress={() => setDate(shiftDate(date, 1))}
          />
        </View>
        <BalcaoStatus active={balcaoActive} onPress={() => router.push('/balcao')} />

        {day.loading ? (
          <View accessibilityLabel="Carregando a agenda" style={{ gap: t.spacing.md }}>
            <Skeleton height={t.touchTarget.min * 2} radius="lg" />
            <Skeleton />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={t.touchTarget.min} />
            ))}
          </View>
        ) : day.error || !day.data ? (
          <ErrorState onRetry={() => void day.reload()} />
        ) : (
          <>
            {live ? (
              <>
                {live.current ? (
                  <NowCard
                    label="Agora"
                    clientName={live.current.clientName}
                    detail={`${live.current.services.map((s) => s.name).join(' + ')} · ${clock(live.current.startsAt)}–${clock(live.current.endsAt)}`}
                    progress={live.progress ?? undefined}
                    onPress={() => openAppointment(live.current!.id)}
                  />
                ) : (
                  <Card variant="primary">
                    <Text variant="title" color="onPrimary">
                      {live.next
                        ? `Livre até as ${clock(live.next.startsAt)}`
                        : 'Livre pelo resto do dia'}
                    </Text>
                  </Card>
                )}
                {live.next ? (
                  <NextCard
                    title={`${firstName(live.next.clientName)} às ${clock(live.next.startsAt)}`}
                    relative={relativeIn(live.minutesToNext ?? 0)}
                    actionLabel="Avisar atraso"
                    onAction={() => setDelayFor(live.next)}
                    onPress={() => openAppointment(live.next!.id)}
                  />
                ) : null}
              </>
            ) : null}

            {isToday && decision ? (
              <Animated.View key={decision.id} exiting={FadeOutDown}>
                <FitInCard
                  title={
                    pendingCount === 1
                      ? decision.type === 'encaixe'
                        ? '1 pedido de encaixe'
                        : '1 pedido esperando você'
                      : `${pendingCount} pedidos esperando você`
                  }
                  question={decision.question}
                  onYes={() => void answer(decision, 'yes')}
                  onNo={() => void answer(decision, 'no')}
                  onDetails={() => router.push('/decisoes')}
                  loading={answering}
                />
              </Animated.View>
            ) : null}

            <SummaryStrip items={summary} />

            {booked.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title={
                  day.data.workingHours ? 'Nenhum cliente marcado.' : 'Você não atende nesse dia.'
                }
                message={day.data.workingHours ? 'Que tal avisar sua lista de espera?' : undefined}
                actionLabel={day.data.workingHours ? 'Ver lista de espera' : undefined}
                onAction={() => router.push({ pathname: '/clientes', params: { aba: 'espera' } })}
              />
            ) : null}

            <View onLayout={(e) => (timelineY.current = e.nativeEvent.layout.y)}>
              {rows.map((row) => (
                <Row key={row.key} row={row} date={date} onNowLayout={onNowLayout} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <Fab
        accessibilityLabel="Novo agendamento"
        onPress={() =>
          router.push({
            pathname: '/agendamento/novo',
            params: { date },
          })
        }
      />

      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Escolher o dia">
        <DayStrip
          value={date}
          from={salonClock(now.getTime() - 7 * 86_400_000)}
          days={45}
          onChange={(d) => {
            setDate(d);
            setPicking(false);
          }}
        />
        <Button
          label="Voltar para hoje"
          variant="secondary"
          onPress={() => {
            setDate(today);
            setPicking(false);
          }}
        />
      </BottomSheet>
      <DelaySheet appointment={delayFor} onClose={() => setDelayFor(null)} />
    </Screen>
  );
}

function Row({
  row,
  date,
  onNowLayout,
}: {
  row: TimelineRow;
  date: DateOnly;
  onNowLayout: (y: number) => void;
}) {
  switch (row.kind) {
    case 'now':
      return (
        <View onLayout={(e) => onNowLayout(e.nativeEvent.layout.y)}>
          <NowIndicator time={hhmm(row.start)} />
        </View>
      );
    case 'free':
      return (
        <TimeSlot
          time={hhmm(row.start)}
          state="free"
          title="Livre — toque para marcar"
          onPress={() => newAt(date, row.start)}
        />
      );
    case 'freed':
      return (
        <TimeSlot
          time={hhmm(row.start)}
          state="freed"
          title={firstName(row.appointment.clientName)}
          subtitle={row.minutesAgo < 1 ? 'Cancelou agora' : `Cancelou há ${row.minutesAgo} min`}
          onPress={() => newAt(date, row.start)}
        />
      );
    case 'lunch':
      return (
        <TimeSlot
          time={hhmm(row.start)}
          state="lunch"
          title="Almoço"
          rows={Math.max(1, Math.round((row.end - row.start) / 60))}
        />
      );
    case 'appointment': {
      const a = row.appointment;
      const minutes = (Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60_000;
      return (
        <TimeSlot
          time={hhmm(row.start)}
          state={row.past ? 'past' : 'busy'}
          title={a.clientName}
          subtitle={a.services.map((s) => s.name).join(' + ')}
          status={pillForAppointment(a.status, a.isFitIn)}
          rows={Math.max(1, Math.round(minutes / 60))}
          onPress={() => openAppointment(a.id)}
        />
      );
    }
  }
}
