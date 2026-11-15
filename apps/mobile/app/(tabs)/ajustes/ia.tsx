import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import {
  Bot,
  CalendarCheck,
  CircleX,
  Lock,
  MapPin,
  Repeat,
  type LucideIcon,
} from 'lucide-react-native';
import {
  AI_TONE_LABELS,
  AiTone,
  REMINDER_LEAD_OPTIONS_MINUTES,
  type AiSettings,
  type AUTONOMY_EDITABLE_KEYS,
  type MessagePreviewKind,
} from '@boramarca/shared';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Header,
  ListItem,
  Screen,
  Skeleton,
  Switch,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { useAiStore } from '@/features/settings/aiStore';
import { errorMessage } from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { useLoad } from '@/features/settings/useLoad';
import { useTheme } from '@/theme';

type EditableKey = (typeof AUTONOMY_EDITABLE_KEYS)[number];

const PERMISSIONS: { key: EditableKey; icon: LucideIcon; title: string; text: string }[] = [
  {
    key: 'answer_price_address',
    icon: MapPin,
    title: 'Responder preço e endereço',
    text: 'Informa seus serviços, valores e endereço quando o cliente perguntar.',
  },
  {
    key: 'confirm_reminders',
    icon: CalendarCheck,
    title: 'Confirmar presença',
    text: 'Lembra o cliente do horário e confirma se ele vem.',
  },
  {
    key: 'book_free_slot_known_client',
    icon: Repeat,
    title: 'Marcar cliente da casa em horário livre',
    text: 'Para quem já é seu cliente, marca direto num horário vago.',
  },
  {
    key: 'cancel_on_request',
    icon: CircleX,
    title: 'Cancelar quando o cliente pedir',
    text: 'Cancela a pedido do cliente e sempre te avisa.',
  },
];

const REMINDER_LABELS: Record<number, string> = {
  60: '1h antes',
  120: '2h antes',
  1440: '1 dia antes',
};

const load = () =>
  Promise.all([data.profile.getAiSettings(), data.profile.getMe()]).then(([ai, me]) => ({
    ai,
    me,
  }));

/** O que a IA pode fazer (prompt 10, reference 11-ajustes, second screen). */
export default function AiScreen() {
  const t = useTheme();
  const res = useLoad(load);
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={['top', 'left', 'right']} scroll>
        <Header title="O que a IA pode fazer" onBack={() => router.back()} />
        <Text color="textMuted">
          Escolha como a IA do Bora Marca atende seus clientes no WhatsApp.
        </Text>
        {res.loading ? (
          <View style={{ gap: t.spacing.md }}>
            <Skeleton height={t.touchTarget.min * 5} radius="lg" />
            <Skeleton height={t.touchTarget.min * 3} radius="lg" />
          </View>
        ) : res.error || !res.data ? (
          <ErrorState message={res.error ?? undefined} onRetry={res.reload} />
        ) : (
          <Content
            ai={res.data.ai}
            reminder={res.data.me.professional.reminderLeadMinutes}
            welcome={res.data.me.professional.welcomeMessage ?? ''}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Content(props: { ai: AiSettings; reminder: number; welcome: string }) {
  const t = useTheme();
  const [ai, setAi] = useState(props.ai);
  const [reminder, setReminder] = useState(props.reminder);
  const [welcome, setWelcome] = useState(props.welcome);
  const [savingWelcome, setSavingWelcome] = useState(false);

  async function patchAi(patch: Parameters<typeof data.profile.updateAiSettings>[0]) {
    try {
      const next = await data.profile.updateAiSettings(patch);
      setAi(next);
      useAiStore.getState().apply(next);
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    }
  }

  async function saveReminder(minutes: number) {
    const before = reminder;
    setReminder(minutes);
    try {
      await data.profile.updateMe({ reminderLeadMinutes: minutes });
    } catch (e) {
      setReminder(before);
      showToast(errorMessage(e), 'danger');
    }
  }

  async function saveWelcome() {
    setSavingWelcome(true);
    try {
      await data.profile.updateMe({ welcomeMessage: welcome.trim() || null });
      showToast('Mensagem de boas-vindas salva.');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setSavingWelcome(false);
    }
  }

  return (
    <>
      <Section>
        {PERMISSIONS.map((p) => (
          <ListItem
            key={p.key}
            icon={p.icon}
            title={p.title}
            subtitle={p.text}
            right={
              <Switch
                value={ai.autonomy[p.key]}
                onValueChange={(v) => patchAi({ autonomy: { [p.key]: v } })}
                tone="accent"
                accessibilityLabel={p.title}
              />
            }
          />
        ))}
        <Card
          variant="accentSoft"
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
        >
          <Lock color={t.colors.text} size={t.sizes.icon} />
          <View style={{ flex: 1 }}>
            <Text weight="semibold">Mexer no horário de outro cliente</Text>
            <Text variant="bodySmall" color="textMuted">
              Sempre pergunta a você. Por segurança, isso sempre passa por você.
            </Text>
          </View>
        </Card>
      </Section>

      <Section title="Jeito de falar da IA" subtitle="Escolha o tom da conversa com seus clientes.">
        <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {AiTone.options.map((tone) => (
              <Chip
                key={tone}
                label={AI_TONE_LABELS[tone]}
                selected={ai.aiTone === tone}
                onPress={() => patchAi({ aiTone: tone })}
              />
            ))}
          </View>
          <Preview kind="tone_sample" tone={ai.aiTone} title="Exemplo de resposta" />
        </View>
      </Section>

      <Section
        title="Lembretes automáticos"
        subtitle="Quanto tempo antes o cliente recebe o lembrete."
      >
        <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {REMINDER_LEAD_OPTIONS_MINUTES.map((m) => (
              <Chip
                key={m}
                label={REMINDER_LABELS[m] ?? `${m} min`}
                selected={reminder === m}
                onPress={() => saveReminder(m)}
              />
            ))}
          </View>
          <Preview kind="reminder" tone={ai.aiTone} title="Prévia do lembrete" />
        </View>
      </Section>

      <Section title="Boas-vindas para cliente novo">
        <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
          <TextField
            accessibilityLabel="Mensagem de boas-vindas"
            value={welcome}
            onChangeText={setWelcome}
            multiline
            maxLength={500}
            placeholder="Oi! Aqui é a assistente da Marina. Como posso te ajudar?"
            hint="Vazio = a IA se apresenta do jeito de falar escolhido."
          />
          <Button label="Salvar mensagem" onPress={saveWelcome} loading={savingWelcome} />
        </View>
      </Section>
    </>
  );
}

/** Message the client would get, refreshed when the tone changes. */
function Preview({ kind, tone, title }: { kind: MessagePreviewKind; tone: AiTone; title: string }) {
  const t = useTheme();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    data.profile
      .previewMessage({ kind, tone })
      .then((r) => alive && setText(r.text))
      .catch(() => alive && setText('Não deu para carregar a prévia.'));
    return () => {
      alive = false;
    };
  }, [kind, tone]);
  return (
    <Card variant="alt" style={{ gap: t.spacing.sm }}>
      <Text weight="semibold">{title}</Text>
      <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' }}>
        <Bot color={t.colors.primaryText} size={t.sizes.iconLg} />
        {text === null ? (
          <View style={{ flex: 1 }}>
            <Skeleton height={t.spacing.xxl} />
          </View>
        ) : (
          <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {text}
          </Text>
        )}
      </View>
    </Card>
  );
}
