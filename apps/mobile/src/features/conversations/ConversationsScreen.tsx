import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { MessagesSquare, Search, Sparkles, User, X } from 'lucide-react-native';
import type { ConversationFilter, ConversationView } from '@boramarca/shared';
import {
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Screen,
  Skeleton,
  Text,
  TextField,
} from '@/components';
import { data } from '@/data';
import { useLoad, useRefreshOnFocus } from '@/features/agenda/useLoad';
import { useTheme } from '@/theme';
import { FILTERS, listTime } from './format';

const SEARCH_DEBOUNCE_MS = 300;

/** Aba Conversas (prompt 06, reference 07 left). */
export function ConversationsScreen() {
  const t = useTheme();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  const list = useLoad(
    () => data.conversations.list({ filter, search: query || undefined }),
    [filter, query],
  );
  useRefreshOnFocus(list.reload);
  const items = list.data?.items ?? [];

  const top = (
    <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.md }}>
      <Header />
      <View>
        <Text variant="display" accessibilityRole="header">
          Conversas
        </Text>
        <Text color="textMuted">Atendimentos e agendamentos pelo WhatsApp</Text>
      </View>
      <TextField
        icon={Search}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar conversa"
        accessibilityLabel="Buscar conversa por nome ou telefone"
        right={
          search ? (
            <IconButton icon={X} accessibilityLabel="Limpar busca" onPress={() => setSearch('')} />
          ) : undefined
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              tone="primary"
              selected={filter === f.value}
              onPress={() => setFilter(f.value)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <FlatList
        data={list.loading || list.error ? [] : items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationRow c={item} />}
        ItemSeparatorComponent={() => <View style={{ height: t.spacing.sm }} />}
        ListHeaderComponent={top}
        ListEmptyComponent={
          list.loading ? (
            <View accessibilityLabel="Carregando as conversas" style={{ gap: t.spacing.sm }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={t.touchTarget.bigChoice - t.spacing.lg} radius="lg" />
              ))}
            </View>
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={query || filter !== 'all' ? 'Nenhuma conversa aqui' : 'Nenhuma conversa ainda'}
              message={
                query || filter !== 'all'
                  ? 'Tente outro filtro ou outra busca.'
                  : 'Quando um cliente mandar mensagem, a conversa aparece aqui.'
              }
            />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.md,
          paddingBottom: t.spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => void list.reload(true)}
            tintColor={t.colors.primary}
            colors={[t.colors.primary]}
          />
        }
      />
    </Screen>
  );
}

/** "IA" (primary) or "Você" (textMuted): who is answering the conversation. */
export function HandlerBadge({ handler }: { handler: ConversationView['handler'] }) {
  const t = useTheme();
  const ai = handler === 'ai';
  const Icon = ai ? Sparkles : User;
  const color = ai ? t.colors.primaryText : t.colors.textMuted;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: t.spacing.xs / 2,
        borderRadius: t.radii.sm,
        backgroundColor: t.colors.surfaceAlt,
      }}
    >
      <Icon color={color} size={t.sizes.iconSm - t.spacing.xs} />
      <Text variant="caption" weight="semibold" color={ai ? 'primaryText' : 'textMuted'}>
        {ai ? 'IA' : 'Você'}
      </Text>
    </View>
  );
}

function ConversationRow({ c }: { c: ConversationView }) {
  const t = useTheme();
  const unread = c.unreadCount > 0;
  const who = c.handler === 'ai' ? 'IA cuidando' : 'com você';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: c.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${c.clientName}, ${who}${unread ? `, ${c.unreadCount} não lidas` : ''}. ${c.lastMessagePreview ?? ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: t.spacing.md,
        alignItems: 'center',
        minHeight: t.touchTarget.min,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        backgroundColor: unread ? t.colors.accentSoft : t.colors.surface,
        opacity: pressed ? t.opacity.pressed : 1,
      })}
    >
      <Avatar name={c.clientName} />
      <View style={{ flex: 1, gap: t.spacing.xs / 2 }}>
        <Text weight="bold" numberOfLines={1}>
          {c.clientName}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} color={unread ? 'text' : 'textMuted'}>
          {c.lastMessagePreview ?? ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: t.spacing.xs }}>
        <Text variant="caption" color="textMuted">
          {listTime(c.lastMessageAt)}
        </Text>
        <HandlerBadge handler={c.handler} />
      </View>
    </Pressable>
  );
}
