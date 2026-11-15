import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar, CircleCheck, EllipsisVertical, Plus, Users } from 'lucide-react-native';
import type { WaitlistEntryView, WaitlistListResponse } from '@boramarca/shared';
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListItem,
  Skeleton,
  StatusPill,
  Switch,
  Text,
  showToast,
} from '@/components';
import { data } from '@/data';
import { daysAgo, firstName } from '@/features/agenda/format';
import type { Loaded } from '@/features/agenda/useLoad';
import { useTheme } from '@/theme';
import { preferenceLabel } from './preference';
import { AddToWaitlistSheet, OfferSheet } from './WaitlistSheets';

const INTRO_KEY = 'waitlist.intro.dismissed';
export const WAIT_OPTIONS_MINUTES = [5, 10, 15, 20, 30, 60] as const;

/** Lista de espera (prompt 09, reference 10-clientes, 3rd screen). */
export function WaitlistView({ list }: { list: Loaded<WaitlistListResponse> }) {
  const t = useTheme();
  const [intro, setIntro] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<WaitlistEntryView | null>(null);
  const [offerTo, setOfferTo] = useState<WaitlistEntryView | null>(null);
  const [editingWait, setEditingWait] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY)
      .then((v) => setIntro(v !== '1'))
      .catch(() => setIntro(true));
  }, []);
  const closeIntro = () => {
    setIntro(false);
    AsyncStorage.setItem(INTRO_KEY, '1').catch(() => undefined);
  };

  async function updateRule(patch: { enabled?: boolean; waitMinutes?: number }) {
    try {
      await data.waitlist.updateRule(patch);
      await list.reload(true);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function remove(e: WaitlistEntryView) {
    setMenu(null);
    try {
      await data.waitlist.remove(e.id);
      showToast(`${firstName(e.clientName)} saiu da lista.`, 'info');
      await list.reload(true);
    } catch (err) {
      showToast((err as Error).message, 'danger');
    }
  }

  if (list.loading)
    return (
      <View style={{ gap: t.spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={t.touchTarget.min + t.spacing.xl} radius="lg" />
        ))}
      </View>
    );
  if (list.error || !list.data) return <ErrorState onRetry={() => void list.reload()} />;

  const { items, rule } = list.data;
  const first = items.find((e) => e.status === 'waiting');

  return (
    <View style={{ gap: t.spacing.md }}>
      {intro ? (
        <Banner
          tone="info"
          message="Quem está aqui pediu para ser avisado quando vagar um horário. É só para essas pessoas que o Bora Marca oferece vagas."
          actionLabel="Fechar"
          onPress={closeIntro}
        />
      ) : (
        <Banner tone="info" message="Só avisamos quem pediu." />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Ninguém na lista de espera"
          message="Quando um cliente pedir para ser avisado de uma vaga, ele aparece aqui."
        />
      ) : (
        items.map((e) => (
          <Card key={e.id} style={{ padding: t.spacing.xs }}>
            <ListItem
              avatarName={e.clientName}
              title={e.clientName}
              subtitle={`${preferenceLabel(e.preference)} · ${e.serviceName ?? 'Qualquer serviço'}`}
              accessibilityLabel={`${e.clientName}, ${preferenceLabel(e.preference)}. Opções`}
              onPress={() => setMenu(e)}
              chevron={false}
              right={
                <IconButton
                  icon={EllipsisVertical}
                  accessibilityLabel={`Opções de ${e.clientName}`}
                  onPress={() => setMenu(e)}
                />
              }
            >
              <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                <Text variant="caption" color="textMuted">
                  Entrou {daysAgo(e.optedInAt, new Date())}
                </Text>
                {e.status === 'offered' ? (
                  <StatusPill status="pendente" label="Vaga oferecida" />
                ) : null}
              </View>
            </ListItem>
          </Card>
        ))
      )}

      {first ? (
        <Button
          label="Oferecer vaga"
          icon={Calendar}
          size="lg"
          onPress={() => setOfferTo(first)}
          accessibilityLabel={`Oferecer vaga para ${first.clientName}, a primeira da lista`}
        />
      ) : null}

      <Card variant="accentSoft" style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <CircleCheck color={t.colors.text} size={t.sizes.icon} />
          <Text style={{ flex: 1 }}>
            Quando vagar um horário, ofereço para <Text weight="bold">1 pessoa</Text> da lista e
            espero{' '}
            <Text
              weight="bold"
              color="primaryText"
              style={{ textDecorationLine: 'underline' }}
              onPress={() => setEditingWait(true)}
              accessibilityRole="button"
              accessibilityLabel={`${rule.waitMinutes} minutos. Mudar o tempo de espera`}
            >
              {rule.waitMinutes} minutos
            </Text>{' '}
            pela resposta.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Text variant="bodySmall" style={{ flex: 1 }}>
            {rule.enabled
              ? 'O Bora Marca oferece sozinho quando vagar'
              : 'Desligado: você oferece na mão'}
          </Text>
          <Switch
            value={rule.enabled}
            onValueChange={(v) => void updateRule({ enabled: v })}
            accessibilityLabel="Oferecer vagas automaticamente"
          />
        </View>
      </Card>

      <Button label="Adicionar" icon={Plus} variant="secondary" onPress={() => setAdding(true)} />

      <BottomSheet
        visible={editingWait}
        onClose={() => setEditingWait(false)}
        title="Quanto tempo espero a resposta?"
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {WAIT_OPTIONS_MINUTES.map((m) => (
            <Chip
              key={m}
              label={`${m} min`}
              selected={rule.waitMinutes === m}
              onPress={() => {
                setEditingWait(false);
                void updateRule({ waitMinutes: m });
              }}
            />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.clientName}>
        <Button
          label="Oferecer vaga agora"
          icon={Calendar}
          onPress={() => {
            setOfferTo(menu);
            setMenu(null);
          }}
        />
        <Button
          label="Ver cliente"
          variant="secondary"
          onPress={() => {
            const id = menu?.clientId;
            setMenu(null);
            if (id) router.push({ pathname: '/cliente/[id]', params: { id } });
          }}
        />
        <Button label="Tirar da lista" variant="ghost" onPress={() => menu && void remove(menu)} />
      </BottomSheet>

      <OfferSheet
        entry={offerTo}
        onClose={() => setOfferTo(null)}
        onDone={() => {
          setOfferTo(null);
          void list.reload(true);
        }}
      />
      {adding ? (
        <AddToWaitlistSheet
          visible
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void list.reload(true);
          }}
        />
      ) : null}
    </View>
  );
}
