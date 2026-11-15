import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Pencil, Sparkles } from 'lucide-react-native';
import type { DecisionAnswerResponse, DecisionView } from '@boramarca/shared';
import {
  BottomSheet,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Header,
  ListItem,
  Screen,
  SegmentedControl,
  Skeleton,
  Text,
  VoiceOrb,
  showToast,
} from '@/components';
import { data } from '@/data';
import { useLoad, useRefreshOnFocus } from '@/features/agenda/useLoad';
import { NotificationPermissionCard } from '@/features/notifications/NotificationPermissionCard';
import { onSimulation } from '@/dev/simulations';
import { useTheme } from '@/theme';
import { DecisionCard } from './DecisionCard';
import { emitDecisionsChanged, onDecisionsChanged } from './index';
import { resolutionSummary } from './format';

type Tab = 'pending' | 'resolved';
const TICK_MS = 30_000;

const openConversation = (id: string | null) => {
  if (id) router.push({ pathname: '/conversa/[id]', params: { id } });
};

/** Aba Decisões (prompt 05, reference 06): pending queue and history. */
export function DecisionsScreen({ decisionId }: { decisionId?: string }) {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('pending');
  const [now, setNow] = useState(() => new Date());
  const [preview, setPreview] = useState<{ d: DecisionView; text: string } | null>(null);
  const [skipPreview, setSkipPreview] = useState(false);
  const pending = useLoad(() => data.decisions.list('pending'), []);
  const resolved = useLoad(() => data.decisions.list('resolved'), []);
  useRefreshOnFocus(pending.reload);
  useRefreshOnFocus(resolved.reload);

  const reloadPending = pending.reload;
  const reloadResolved = resolved.reload;
  const reloadAll = useCallback(() => {
    void reloadPending(true);
    void reloadResolved(true);
  }, [reloadPending, reloadResolved]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    const offSim = onSimulation('decision-new', reloadAll);
    const offChanged = onDecisionsChanged(reloadAll);
    return () => {
      clearInterval(timer);
      offSim();
      offChanged();
    };
  }, [reloadAll]);

  // opened from a notification: back to Pendentes, with that decision first
  const [seenDecisionId, setSeenDecisionId] = useState(decisionId);
  if (decisionId !== seenDecisionId) {
    setSeenDecisionId(decisionId);
    if (decisionId) setTab('pending');
  }

  const pendingItems = [...(pending.data?.items ?? [])].sort((a, b) =>
    a.id === decisionId ? -1 : b.id === decisionId ? 1 : 0,
  );
  const pendingCount = pending.data?.items.length;
  const pendingLabel = `Pendentes${pendingCount ? ` (${pendingCount})` : ''}`;

  function onAnswered(d: DecisionView, r: DecisionAnswerResponse) {
    if (r.clientMessagePreview) setPreview({ d, text: r.clientMessagePreview });
    else showToast(r.spokenConfirmation, 'success');
  }

  const onTakeOver = useCallback(async (d: DecisionView) => {
    try {
      const r = await data.decisions.takeOver(d.id);
      emitDecisionsChanged();
      showToast('Combinado, a conversa é sua. A IA parou nela.', 'success');
      openConversation(r.conversationId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não deu agora.', 'danger');
    }
  }, []);

  async function closePreview() {
    if (skipPreview) {
      await data.profile
        .updateMe({ skipMessagePreview: true })
        .then(() =>
          showToast('Pronto, não mostro mais a prévia. Dá para mudar em Ajustes.', 'info'),
        )
        .catch(() => showToast('Não deu para salvar a preferência.', 'danger'));
    }
    setPreview(null);
    setSkipPreview(false);
  }

  const current = tab === 'pending' ? pending : resolved;

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <ScrollView
        contentContainerStyle={{
          gap: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.md,
          paddingBottom: t.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={current.refreshing}
            onRefresh={() => void current.reload(true)}
            tintColor={t.colors.primary}
            colors={[t.colors.primary]}
          />
        }
      >
        <Header />
        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
          <View
            style={{
              width: t.sizes.avatar,
              height: t.sizes.avatar,
              borderRadius: t.radii.md,
              backgroundColor: t.colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles color={t.colors.primaryText} size={t.sizes.icon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title" accessibilityRole="header">
              Preciso de você
            </Text>
            <Text color="textMuted">
              {tab === 'pending'
                ? 'A IA precisa da sua decisão em alguns agendamentos.'
                : 'Histórico das decisões que você já resolveu.'}
            </Text>
          </View>
        </View>
        <SegmentedControl<Tab>
          segments={[
            { value: 'pending', label: pendingLabel },
            { value: 'resolved', label: 'Resolvidas' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {current.loading ? (
          <View accessibilityLabel="Carregando as decisões" style={{ gap: t.spacing.md }}>
            <Skeleton height={t.touchTarget.balcaoChoice * 2} radius="lg" />
            <Skeleton height={t.touchTarget.balcaoChoice} radius="lg" />
          </View>
        ) : current.error ? (
          <ErrorState message={current.error.message} onRetry={() => void current.reload()} />
        ) : tab === 'pending' ? (
          pendingItems.length === 0 ? (
            <EmptyState
              art={<VoiceOrb state="parado" size={t.sizes.orb / 2} />}
              title="Nada esperando você. Bom trabalho!"
              message="Quando a IA precisar da sua resposta, a pergunta aparece aqui."
            />
          ) : (
            <>
              <NotificationPermissionCard />
              {pendingItems.map((d) => (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  now={now}
                  highlighted={d.id === decisionId}
                  onAnswered={onAnswered}
                  onTakeOver={onTakeOver}
                  onOpenConversation={(x) => openConversation(x.conversationId)}
                />
              ))}
              <Text variant="caption" color="textMuted" align="center">
                Deslize um cartão para o lado: “Deixa que eu respondo”.
              </Text>
            </>
          )
        ) : (resolved.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={Check}
            title="Nada resolvido ainda"
            message="As decisões que você responder ficam aqui."
          />
        ) : (
          resolved.data!.items.map((d) => <ResolvedRow key={d.id} d={d} />)
        )}
      </ScrollView>

      <BottomSheet
        visible={!!preview}
        onClose={() => void closePreview()}
        title="Mensagem para o cliente"
        subtitle={
          preview ? `Para ${preview.d.clientName ?? preview.d.context.clientFirstName}` : undefined
        }
      >
        {preview ? (
          <>
            <View
              style={{
                padding: t.spacing.md,
                borderRadius: t.radii.md,
                backgroundColor: t.colors.accentSoft,
              }}
            >
              <Text>{preview.text}</Text>
            </View>
            <Text variant="caption" color="textMuted">
              A IA já mandou essa mensagem. Quer completar? Escreva na conversa.
            </Text>
            <Checkbox
              label="Não mostrar prévia de novo"
              checked={skipPreview}
              onChange={setSkipPreview}
            />
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <Button
                label="Editar"
                icon={Pencil}
                variant="secondary"
                accessibilityLabel="Completar a mensagem na conversa"
                onPress={() => {
                  const id = preview.d.conversationId;
                  void closePreview().then(() => openConversation(id));
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Pronto"
                icon={Check}
                onPress={() => void closePreview()}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function ResolvedRow({ d }: { d: DecisionView }) {
  const t = useTheme();
  const s = resolutionSummary(d);
  return (
    <Card style={{ padding: t.spacing.xs }}>
      <ListItem
        avatarName={d.clientName ?? d.context.clientFirstName}
        title={s.title}
        subtitle={s.subtitle}
        chevron={!!d.conversationId}
        onPress={d.conversationId ? () => openConversation(d.conversationId) : undefined}
        accessibilityLabel={`${s.title}. ${s.subtitle}`}
        right={
          s.clientNotified ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.xs,
                paddingHorizontal: t.spacing.sm,
                paddingVertical: t.spacing.xs,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.success,
              }}
            >
              <Check color={t.colors.onSuccess} size={t.sizes.iconSm} />
              <Text variant="caption" weight="semibold" color="onSuccess">
                Cliente avisado
              </Text>
            </View>
          ) : null
        }
      />
    </Card>
  );
}
