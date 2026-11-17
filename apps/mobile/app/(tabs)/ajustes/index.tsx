import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  Bot,
  CalendarDays,
  CircleCheck,
  CirclePause,
  CircleQuestionMark,
  Crown,
  Layers,
  MessageCircle,
  MessageSquareText,
  Moon,
  Speaker,
  User,
  Volume2,
  Wrench,
  WifiOff,
} from 'lucide-react-native';
import { PLAN_LABELS, PROFESSION_LABELS } from '@boramarca/shared';
import {
  BottomSheet,
  Button,
  ErrorState,
  Header,
  ListItem,
  Screen,
  SegmentedControl,
  Skeleton,
  Switch,
  Text,
  showToast,
} from '@/components';
import { data } from '@/data';
import { DEV_TOOLS_ENABLED } from '@/dev/flags';
import { openSite } from '@/features/account/links';
import {
  PAUSE_LABELS,
  pauseAi,
  setAiOn,
  useAiStore,
  type PauseOption,
} from '@/features/settings/aiStore';
import { pausedLabel } from '@/features/settings/GlobalBanners';
import { Section } from '@/features/settings/Section';
import { errorMessage } from '@/features/settings/format';
import { useLoad } from '@/features/settings/useLoad';
import { isWhatsAppDown, useWhatsAppStore } from '@/features/whatsapp/store';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme';

const loadMe = () => data.profile.getMe();

/** Ajustes (prompt 10, reference 11-ajustes, first screen). */
export default function AjustesScreen() {
  const t = useTheme();
  const me = useLoad(loadMe);
  const ai = useAiStore();
  const wa = useWhatsAppStore((s) => s.status);
  const { preference, setPreference } = useThemePreference();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function toggleAi(on: boolean) {
    setAiBusy(true);
    try {
      await setAiOn(on);
      showToast(on ? 'IA atendendo de novo.' : 'IA pausada. Você responde tudo.', 'info');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setAiBusy(false);
    }
  }

  async function pause(option: PauseOption) {
    setPauseOpen(false);
    try {
      await pauseAi(option);
      showToast('IA pausada.', 'info');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    }
  }

  const p = me.data?.professional;
  const profession = p?.professions.map((x) => PROFESSION_LABELS[x]).join(', ');
  const waDown = isWhatsAppDown(wa);

  return (
    <Screen edges={['top', 'left', 'right']} scroll>
      <Header />
      <Text variant="title">Ajustes</Text>

      {me.loading ? (
        <View style={{ gap: t.spacing.sm }}>
          <Skeleton height={t.touchTarget.min * 3} radius="lg" />
          <Skeleton height={t.touchTarget.min * 3} radius="lg" />
        </View>
      ) : me.error ? (
        <ErrorState message={me.error} onRetry={me.reload} />
      ) : (
        <Section title="Meu negócio">
          <ListItem
            icon={User}
            title="Perfil profissional"
            subtitle={[p?.name, profession].filter(Boolean).join(' · ')}
            onPress={() => router.push('/ajustes/negocio')}
          />
          <ListItem
            icon={Layers}
            title="Serviços"
            subtitle="Nome, duração e preço"
            onPress={() => router.push('/ajustes/negocio')}
          />
          <ListItem
            icon={CalendarDays}
            title="Horários"
            subtitle="Dias, almoço, folgas e feriados"
            onPress={() => router.push('/ajustes/negocio')}
          />
        </Section>
      )}

      <Section title="A IA do Bora Marca">
        <ListItem
          icon={Bot}
          title="IA atendendo"
          subtitle={ai.aiEnabled ? 'Responde e agenda para você' : pausedLabel(ai.aiPausedUntil)}
          right={
            <Switch
              value={ai.aiEnabled}
              onValueChange={toggleAi}
              disabled={aiBusy}
              tone="accent"
              accessibilityLabel="IA atendendo"
            />
          }
        />
        <ListItem
          icon={CirclePause}
          title="Pausa rápida"
          subtitle="Por 1h, até amanhã ou até você voltar"
          onPress={() => setPauseOpen(true)}
        />
        <ListItem
          icon={MessageSquareText}
          title="Jeito de falar e o que a IA pode fazer"
          subtitle="Tom, permissões, lembretes e boas-vindas"
          onPress={() => router.push('/ajustes/ia')}
        />
      </Section>

      <Section title="Voz e Balcão">
        <ListItem
          icon={Volume2}
          title="Configurar o Balcão"
          subtitle="Celular e caixa de som no balcão"
          onPress={() => router.push('/balcao/configurar')}
        />
        <ListItem
          icon={Moon}
          title="Voz e horário de silêncio"
          subtitle="Velocidade da fala e quando o balcão não fala"
          onPress={() => router.push('/ajustes/voz')}
        />
        <ListItem
          icon={Speaker}
          title="Alexa"
          subtitle="Vínculo da conta e avisos em voz alta"
          onPress={() => router.push('/ajustes/alexa')}
        />
      </Section>

      <Section>
        <ListItem
          icon={waDown ? WifiOff : MessageCircle}
          title={
            !wa
              ? 'WhatsApp'
              : waDown
                ? 'WhatsApp desconectado'
                : wa.status === 'connected'
                  ? 'WhatsApp conectado'
                  : 'WhatsApp conectando'
          }
          right={
            wa?.status === 'connected' ? (
              <CircleCheck color={t.colors.primaryText} size={t.sizes.icon} />
            ) : null
          }
          onPress={() => router.push('/ajustes/whatsapp')}
        />
        <ListItem
          icon={Crown}
          title="Conta"
          subtitle={
            me.data
              ? `Plano ${PLAN_LABELS[me.data.salon.plan]} · privacidade, termos, excluir conta`
              : 'Plano, privacidade, termos, excluir conta'
          }
          onPress={() => router.push('/ajustes/conta')}
        />
        <ListItem
          icon={CircleQuestionMark}
          title="Ajuda"
          subtitle="Fale com o suporte"
          onPress={() => openSite('contact')}
        />
      </Section>

      <Section title="Aparência">
        <View style={{ padding: t.spacing.sm }}>
          <SegmentedControl<ThemePreference>
            segments={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
            ]}
            value={preference}
            onChange={setPreference}
          />
        </View>
      </Section>

      {DEV_TOOLS_ENABLED ? (
        <ListItem
          icon={Wrench}
          title="Menu de desenvolvimento"
          subtitle="Vitrine e simulações (só em desenvolvimento)"
          onPress={() => router.push('/dev')}
        />
      ) : null}

      <BottomSheet
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        title="Pausa rápida"
        subtitle="Enquanto a IA estiver pausada, você responde tudo."
      >
        {(Object.keys(PAUSE_LABELS) as PauseOption[]).map((o) => (
          <Button key={o} label={PAUSE_LABELS[o]} variant="neutral" onPress={() => pause(o)} />
        ))}
      </BottomSheet>
    </Screen>
  );
}
