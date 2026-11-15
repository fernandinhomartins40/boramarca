import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, CalendarPlus, Mic, Pause, Play, Send, Sparkles } from 'lucide-react-native';
import { QUICK_REPLIES, type ConversationView, type Message } from '@boramarca/shared';
import {
  Avatar,
  Banner,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  Skeleton,
  Switch,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { clock } from '@/features/agenda/format';
import { useLoad } from '@/features/agenda/useLoad';
import { useTheme } from '@/theme';
import { nextLabel } from './format';
import { useDictation } from './useDictation';

async function loadConversation(id: string) {
  // shortcut: the API has no GET /conversations/:id, so the header comes from the list (limit 200);
  // ask D1 for a single-conversation route if accounts get more conversations than that.
  const [list, messages] = await Promise.all([
    data.conversations.list({ limit: 200 }),
    data.conversations.messages(id),
  ]);
  return { conversation: list.items.find((c) => c.id === id) ?? null, messages: messages.items };
}

/** Conversa (prompt 06, reference 07 right). */
export function ConversationScreen({ id }: { id: string }) {
  const t = useTheme();
  const load = useLoad(() => loadConversation(id), [id]);
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [sent, setSent] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dictation = useDictation((said) => setText((v) => (v ? `${v} ${said}` : said)));

  const c = conversation ?? load.data?.conversation ?? null;
  // newest first (inverted list)
  const messages = [...sent, ...(load.data?.messages ?? [])];

  async function setHandler(handler: ConversationView['handler']) {
    setSwitching(true);
    try {
      setConversation(await data.conversations.handoff(id, { handler }));
      showToast(
        handler === 'ai' ? 'A IA voltou a responder.' : 'Você está respondendo. A IA parou aqui.',
        'success',
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não deu agora.', 'danger');
    } finally {
      setSwitching(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const m = await data.conversations.send(id, { text: body });
      setSent((s) => [m, ...s]);
      setText('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não deu para enviar.', 'danger');
    } finally {
      setSending(false);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/conversas'));

  if (load.loading || load.error || !c) {
    return (
      <Screen>
        <IconButton icon={ArrowLeft} accessibilityLabel="Voltar" onPress={back} />
        {load.loading ? (
          <View accessibilityLabel="Carregando a conversa" style={{ gap: t.spacing.md }}>
            <Skeleton height={t.touchTarget.min} />
            <Skeleton height={t.touchTarget.bigChoice} width="70%" radius="lg" />
            <Skeleton height={t.touchTarget.bigChoice} width="70%" radius="lg" />
          </View>
        ) : load.error ? (
          <ErrorState message={load.error.message} onRetry={() => void load.reload()} />
        ) : (
          <EmptyState title="Conversa não encontrada" actionLabel="Voltar" onAction={back} />
        )}
      </Screen>
    );
  }

  const aiOn = c.handler === 'ai';

  return (
    <Screen padded={false} contentStyle={{ gap: 0 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.sm,
            borderBottomWidth: t.sizes.hairline,
            borderBottomColor: t.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <IconButton icon={ArrowLeft} accessibilityLabel="Voltar" onPress={back} />
            <Avatar name={c.clientName} />
            <View style={{ flex: 1 }}>
              <Text variant="heading" weight="bold" numberOfLines={1} accessibilityRole="header">
                {c.clientName}
              </Text>
              {c.nextAppointmentAt ? (
                <Text variant="bodySmall" color="textMuted">
                  {nextLabel(c.nextAppointmentAt)}
                </Text>
              ) : null}
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              padding: t.spacing.sm,
              paddingLeft: t.spacing.md,
              borderRadius: t.radii.md,
              backgroundColor: t.colors.surfaceAlt,
            }}
          >
            <Text style={{ flex: 1 }}>IA respondendo</Text>
            <Switch
              value={aiOn}
              tone="accent"
              disabled={switching}
              onValueChange={(on) => void setHandler(on ? 'ai' : 'human')}
              accessibilityLabel="IA respondendo"
            />
            <Button
              label="Marcar horário"
              icon={CalendarPlus}
              size="md"
              onPress={() =>
                router.push({ pathname: '/agendamento/novo', params: { clientId: c.clientId } })
              }
            />
          </View>
          {aiOn ? null : (
            <Banner
              message="Você está respondendo esta conversa."
              actionLabel="Devolver para a IA"
              onPress={() => void setHandler('ai')}
            />
          )}
        </View>

        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <Bubble m={item} />}
          contentContainerStyle={{
            gap: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
          }}
          ListEmptyComponent={
            <Text color="textMuted" align="center">
              Nenhuma mensagem ainda.
            </Text>
          }
        />

        <View
          style={{
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.sm,
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {QUICK_REPLIES.map((q) => (
                <Chip key={q} label={q} onPress={() => setText(q)} />
              ))}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={text}
                onChangeText={setText}
                placeholder={dictation.listening ? 'Ouvindo…' : 'Mensagem...'}
                accessibilityLabel="Mensagem"
                multiline
              />
            </View>
            {text.trim() ? (
              <RoundButton
                icon={Send}
                label="Enviar mensagem"
                onPress={() => void send()}
                busy={sending}
              />
            ) : (
              <RoundButton
                icon={Mic}
                label={dictation.listening ? 'Parar de ditar' : 'Ditar mensagem'}
                onPress={() => void dictation.toggle()}
                active={dictation.listening}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function RoundButton({
  icon: Icon,
  label,
  onPress,
  busy,
  active,
}: {
  icon: typeof Send;
  label: string;
  onPress: () => void;
  busy?: boolean;
  active?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, selected: !!active }}
      style={({ pressed }) => ({
        width: t.touchTarget.min,
        height: t.touchTarget.min,
        borderRadius: t.radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? t.colors.accent : t.colors.primary,
        opacity: pressed || busy ? t.opacity.pressed : 1,
      })}
    >
      <Icon color={active ? t.colors.onAccent : t.colors.onPrimary} size={t.sizes.icon} />
    </Pressable>
  );
}

function AiSeal() {
  const t = useTheme();
  return (
    <View
      accessibilityLabel="Mensagem da IA"
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}
    >
      <Sparkles color={t.colors.primaryText} size={t.sizes.iconSm - t.spacing.xs} />
      <Text variant="caption" weight="semibold" color="primaryText">
        IA
      </Text>
    </View>
  );
}

function AudioPlayer() {
  const t = useTheme();
  // shortcut: Message has no audio URL in the contract yet, so the player only toggles its icon;
  // play the file with expo-audio once the API exposes it.
  const [playing, setPlaying] = useState(false);
  const bars = [3, 5, 8, 4, 6, 9, 5, 3, 7, 4, 6, 8, 3, 5, 4, 6];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <IconButton
        icon={playing ? Pause : Play}
        color="primaryText"
        accessibilityLabel={playing ? 'Pausar áudio' : 'Ouvir áudio'}
        onPress={() => setPlaying((p) => !p)}
      />
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs / 2, flex: 1 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              width: t.sizes.progress / 2,
              height: h * t.spacing.xs,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.primaryText,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Bubble({ m }: { m: Message }) {
  const t = useTheme();
  const mine = m.direction === 'out';
  return (
    <View style={{ gap: t.spacing.md }}>
      <View
        style={{
          alignSelf: mine ? 'flex-end' : 'flex-start',
          maxWidth: '82%',
          gap: t.spacing.xs,
          padding: t.spacing.md,
          borderRadius: t.radii.md,
          borderWidth: mine ? 0 : t.sizes.border,
          borderColor: t.colors.border,
          backgroundColor: mine ? t.colors.surfaceAlt : t.colors.surface,
        }}
      >
        {m.author === 'ai' ? <AiSeal /> : null}
        {m.kind === 'audio' ? <AudioPlayer /> : null}
        {m.text ? <Text>{m.text}</Text> : null}
        {m.kind === 'audio' && m.transcription ? (
          <Text
            variant="bodySmall"
            color="textMuted"
            accessibilityLabel={`Transcrição: ${m.transcription}`}
          >
            {m.transcription}
          </Text>
        ) : null}
        <Text variant="caption" color="textMuted" align={mine ? 'right' : 'left'}>
          {clock(m.createdAt)}
        </Text>
      </View>
      {m.aiNote ? <AiNote note={m.aiNote} /> : null}
    </View>
  );
}

function AiNote({ note }: { note: string }) {
  const t = useTheme();
  const line = (
    <View style={{ flex: 1, height: t.sizes.hairline, backgroundColor: t.colors.border }} />
  );
  return (
    <View
      accessibilityLabel={`Nota da IA: ${note}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
    >
      {line}
      <View
        style={{
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.xs,
          borderRadius: t.radii.pill,
          backgroundColor: t.colors.surfaceAlt,
          maxWidth: '75%',
        }}
      >
        <Text variant="caption" color="textMuted" align="center">
          {note}
        </Text>
      </View>
      {line}
    </View>
  );
}
