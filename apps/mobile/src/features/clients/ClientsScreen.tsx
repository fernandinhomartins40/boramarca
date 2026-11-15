import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, ChevronDown, Search, Users, X } from 'lucide-react-native';
import type { ClientSort, ClientSummary } from '@boramarca/shared';
import {
  BottomSheet,
  Card,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  ListItem,
  Screen,
  SegmentedControl,
  Skeleton,
  StatusPill,
  Text,
  TextField,
} from '@/components';
import { data } from '@/data';
import { daysAgo } from '@/features/agenda/format';
import { useLoad, useRefreshOnFocus } from '@/features/agenda/useLoad';
import { WaitlistView } from '@/features/waitlist/WaitlistView';
import { useTheme } from '@/theme';

export type ClientsTab = 'clientes' | 'espera';

const SORTS: { value: ClientSort; label: string }[] = [
  { value: 'recent', label: 'Recentes' },
  { value: 'name', label: 'A–Z' },
  { value: 'frequent', label: 'Mais frequentes' },
];

/** Days without coming back that make a client "sumido". */
export const MISSING_DAYS = 40;
/** No-shows that earn the "Falta muito" tag. */
export const MANY_NO_SHOWS = 2;

export function clientTags(c: ClientSummary, now: Date): string[] {
  const tags: string[] = [];
  if (c.lastVisitAt) {
    const days = Math.floor((now.getTime() - Date.parse(c.lastVisitAt)) / 86_400_000);
    if (days >= MISSING_DAYS) tags.push(`Sumido há ${days} dias`);
  }
  if (c.noShowCount >= MANY_NO_SHOWS) tags.push('Falta muito');
  if (c.onWaitlist) tags.push('Na lista de espera');
  return tags;
}

const letterOf = (name: string) =>
  name.charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Aba Clientes (prompt 09, reference 10-clientes): clients | lista de espera. */
export function ClientsScreen({ initialTab = 'clientes' }: { initialTab?: ClientsTab }) {
  const t = useTheme();
  const [tab, setTab] = useState<ClientsTab>(initialTab);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ClientSort>('recent');
  const [sorting, setSorting] = useState(false);
  // shortcut: search filters the loaded page locally (no reload per keystroke); move it to the
  // `search` query when lists get bigger than one page (limit 50).
  const clients = useLoad(() => data.clients.list({ sort, limit: 200 }), [sort]);
  const waitlist = useLoad(() => data.waitlist.list(), []);
  useRefreshOnFocus(clients.reload);
  useRefreshOnFocus(waitlist.reload);
  const list = useRef<SectionList<ClientSummary>>(null);
  const now = new Date();

  const waitCount = waitlist.data?.items.length;
  const waitLabel = `Lista de espera${waitCount !== undefined ? ` (${waitCount})` : ''}`;
  const q = search.trim().toLowerCase();
  const items = (clients.data?.items ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q),
  );
  const sections =
    sort === 'name'
      ? Object.entries(
          items.reduce<Record<string, ClientSummary[]>>((acc, c) => {
            (acc[letterOf(c.name)] ??= []).push(c);
            return acc;
          }, {}),
        ).map(([title, data]) => ({ title, data }))
      : [{ title: '', data: items }];

  const top: ReactNode = (
    <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.md }}>
      <Header
        right={
          <IconButton
            icon={Bell}
            accessibilityLabel="Decisões pendentes"
            onPress={() => router.push('/decisoes')}
          />
        }
      />
      <Text variant="title">{tab === 'clientes' ? 'Clientes' : waitLabel}</Text>
      <SegmentedControl
        segments={[
          { value: 'clientes', label: 'Clientes' },
          { value: 'espera', label: waitLabel },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'clientes' ? (
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextField
              icon={Search}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar cliente"
              accessibilityLabel="Buscar cliente"
              right={
                search ? (
                  <IconButton
                    icon={X}
                    accessibilityLabel="Limpar busca"
                    onPress={() => setSearch('')}
                  />
                ) : undefined
              }
            />
          </View>
          <Pressable
            onPress={() => setSorting(true)}
            accessibilityRole="button"
            accessibilityLabel={`Ordenar: ${SORTS.find((s) => s.value === sort)!.label}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.xs,
              minHeight: t.touchTarget.min,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radii.md,
              borderWidth: t.sizes.border,
              borderColor: t.colors.border,
              backgroundColor: t.colors.surface,
            }}
          >
            <Text variant="bodySmall" weight="medium">
              {SORTS.find((s) => s.value === sort)!.label}
            </Text>
            <ChevronDown color={t.colors.text} size={t.sizes.iconSm} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const pad = {
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.xxl,
  };

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      {tab === 'espera' ? (
        <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
          {top}
          <WaitlistView list={waitlist} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <SectionList
            ref={list}
            sections={clients.loading || clients.error ? [] : sections}
            keyExtractor={(c) => c.id}
            contentContainerStyle={[pad, sort === 'name' ? { paddingRight: t.spacing.xxl } : null]}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            onScrollToIndexFailed={() => undefined}
            ListHeaderComponent={<>{top}</>}
            ListEmptyComponent={
              clients.loading ? (
                <View style={{ gap: t.spacing.md }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} height={t.touchTarget.min + t.spacing.xl} radius="lg" />
                  ))}
                </View>
              ) : clients.error ? (
                <ErrorState onRetry={() => void clients.reload()} />
              ) : (
                <EmptyState
                  icon={Users}
                  title={search ? 'Ninguém com esse nome' : 'Nenhum cliente ainda'}
                  message={
                    search ? undefined : 'Quem falar com você no WhatsApp aparece aqui sozinho.'
                  }
                />
              )
            }
            renderSectionHeader={({ section }) =>
              section.title ? (
                <Text
                  variant="bodySmall"
                  weight="bold"
                  color="textMuted"
                  style={{ paddingVertical: t.spacing.xs }}
                >
                  {section.title}
                </Text>
              ) : null
            }
            ItemSeparatorComponent={() => <View style={{ height: t.spacing.sm }} />}
            renderItem={({ item: c }) => {
              const tags = clientTags(c, now);
              return (
                <Card style={{ padding: t.spacing.xs }}>
                  <ListItem
                    avatarName={c.name}
                    title={c.name}
                    subtitle={
                      c.lastVisitAt
                        ? `Última vez: ${daysAgo(c.lastVisitAt, now)}${c.lastServiceName ? ` · ${c.lastServiceName}` : ''}`
                        : 'Ainda não veio'
                    }
                    onPress={() => router.push({ pathname: '/cliente/[id]', params: { id: c.id } })}
                  >
                    {tags.length ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                        {tags.map((tag) => (
                          <StatusPill
                            key={tag}
                            status={tag === 'Na lista de espera' ? 'agendado' : 'pendente'}
                            label={tag}
                          />
                        ))}
                      </View>
                    ) : null}
                  </ListItem>
                </Card>
              );
            }}
          />
          {sort === 'name' && !clients.loading && sections.length > 1 ? (
            <View
              style={{
                position: 'absolute',
                right: t.spacing.xs,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
              }}
            >
              {sections.map((s, i) => (
                <Pressable
                  key={s.title}
                  hitSlop={{ left: t.spacing.md, right: t.spacing.xs }}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir para a letra ${s.title}`}
                  onPress={() =>
                    list.current?.scrollToLocation({
                      sectionIndex: i,
                      itemIndex: 0,
                      viewOffset: t.spacing.xl,
                    })
                  }
                  style={{ paddingVertical: t.spacing.xs / 2, paddingHorizontal: t.spacing.xs }}
                >
                  <Text variant="caption" weight="bold" color="primaryText">
                    {s.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}

      <BottomSheet visible={sorting} onClose={() => setSorting(false)} title="Ordenar por">
        {SORTS.map((s) => (
          <ListItem
            key={s.value}
            title={s.label}
            chevron={false}
            right={s.value === sort ? <StatusPill status="confirmado" label="Ok" /> : undefined}
            onPress={() => {
              setSort(s.value);
              setSorting(false);
            }}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}
