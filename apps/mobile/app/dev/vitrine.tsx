import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  Armchair,
  Bell,
  Calendar,
  CircleUser,
  Coins,
  MessageCircle,
  Search,
  Send,
  User,
} from 'lucide-react-native';
import {
  Avatar,
  Badge,
  BalcaoStatus,
  Banner,
  BigChoice,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  Fab,
  FitInCard,
  Header,
  IconButton,
  ListItem,
  LoadingState,
  Logo,
  NextCard,
  NowCard,
  NowIndicator,
  ProgressSteps,
  Screen,
  SegmentedControl,
  Skeleton,
  StatusPill,
  SummaryStrip,
  Switch,
  Text,
  TextField,
  TimeSlot,
  VoiceOrb,
  showToast,
  type ButtonVariant,
  type PillStatus,
  type VoiceOrbState,
} from '@/components';
import { ThemeScope, useTheme } from '@/theme';
import type { ColorSchemeName } from '@boramarca/shared';

const BUTTONS: ButtonVariant[] = ['primary', 'secondary', 'accent', 'neutral', 'danger', 'ghost'];
const PILLS: PillStatus[] = [
  'confirmado',
  'agendado',
  'pendente',
  'cancelado',
  'encaixe',
  'faltou',
  'em_atendimento',
  'concluido',
];
const ORBS: VoiceOrbState[] = ['parado', 'ouvindo', 'pensando', 'falando'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md, paddingTop: t.spacing.lg }}>
      <Text variant="heading" color="primaryText">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, alignItems: 'center' }}
    >
      {children}
    </View>
  );
}

/** A box painted with a brand color, to show the logo variants on their intended backgrounds. */
function Swatch({
  color,
  children,
}: {
  color: 'grafite' | 'violeta' | 'neutro';
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.brand[color],
        padding: t.spacing.lg,
        borderRadius: t.radii.md,
        gap: t.spacing.md,
      }}
    >
      {children}
    </View>
  );
}

function Showcase() {
  const t = useTheme();
  const [sheet, setSheet] = useState(false);
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [segment, setSegment] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [chip, setChip] = useState('fisio');

  return (
    <View style={{ gap: t.spacing.sm, paddingBottom: t.spacing.xxxl }}>
      <Section title="Agenda (composição da referência 04)">
        <Header
          right={
            <>
              <IconButton icon={Bell} accessibilityLabel="Notificações" />
              <IconButton icon={CircleUser} accessibilityLabel="Perfil" />
            </>
          }
        />
        <Text variant="title">Marina, seu dia está assim</Text>
        <Row>
          <Calendar color={t.colors.textMuted} size={t.sizes.iconSm} />
          <Text color="textMuted">Terça, 10 de novembro</Text>
        </Row>
        <BalcaoStatus active onPress={() => undefined} />
        <NowCard
          label="Agora"
          clientName="Ana Paula"
          detail="Fisioterapia · 14:00–14:50"
          onPress={() => undefined}
        />
        <NextCard
          title="Rafael às 15:00"
          relative="em 12 min"
          actionLabel="Avisar atraso"
          onAction={() => undefined}
        />
        <FitInCard
          title="1 pedido de encaixe"
          question="Beatriz pode vir às 16h?"
          onYes={() => showToast('Marcado! A Beatriz já foi avisada.')}
          onNo={() => showToast('Tudo bem, não marquei.', 'info')}
        />
        <SummaryStrip
          items={[
            { icon: Calendar, label: '8 atendimentos' },
            { icon: Armchair, label: '2 vagas' },
            { icon: Coins, label: 'R$ 1.200' },
          ]}
        />
        <View>
          <TimeSlot
            time="14:00"
            state="busy"
            title="Ana Paula"
            subtitle="Fisioterapia"
            status="confirmado"
            onPress={() => undefined}
          />
          <TimeSlot
            time="15:00"
            state="busy"
            title="Rafael"
            subtitle="Fisioterapia"
            status="confirmado"
            onPress={() => undefined}
          />
          <NowIndicator time="14:48" />
          <TimeSlot
            time="16:00"
            state="free"
            title="Livre — toque para marcar"
            onPress={() => undefined}
          />
          <TimeSlot
            time="17:00"
            state="freed"
            title="Carlos"
            subtitle="Cancelou há 3 min"
            onPress={() => undefined}
          />
          <TimeSlot time="12:00" state="lunch" title="Almoço" />
          <TimeSlot
            time="09:00"
            state="past"
            title="Marcos Vieira"
            subtitle="Fisioterapia"
            status="concluido"
          />
        </View>
      </Section>

      <Section title="Logo">
        <Logo />
        <Logo kind="simbolo" height={t.sizes.avatarLg} />
        <Swatch color="neutro">
          <Logo variant="cor" />
        </Swatch>
        <Swatch color="grafite">
          <Logo variant="negativo" />
          <Logo variant="violeta-branco" />
        </Swatch>
        <Swatch color="violeta">
          <Logo variant="violeta-branco" />
        </Swatch>
      </Section>

      <Section title="Texto">
        {(['display', 'title', 'heading', 'body', 'bodySmall', 'caption'] as const).map((v) => (
          <Text key={v} variant={v}>
            {v} · Bora Marca
          </Text>
        ))}
        <Text color="textMuted">textMuted</Text>
        <Text color="primaryText">primaryText (link)</Text>
        <Text color="danger">danger</Text>
      </Section>

      <Section title="Botões">
        {BUTTONS.map((v) => (
          <Button key={v} label={`${v}`} variant={v} onPress={() => undefined} />
        ))}
        <Button label="Começar" size="lg" iconRight={Send} onPress={() => undefined} />
        <Button label="Desabilitado" disabled />
        <Button label="Carregando" loading />
        <Row>
          <IconButton icon={Bell} accessibilityLabel="Notificações" dot />
          <IconButton icon={Search} accessibilityLabel="Buscar" />
          <Badge count={1} />
          <Badge count={12} />
        </Row>
      </Section>

      <Section title="BigChoice">
        <BigChoice onYes={() => undefined} onNo={() => undefined} />
        <BigChoice
          size="compact"
          yesLabel="Sim, pode"
          onYes={() => undefined}
          onNo={() => undefined}
        />
        <BigChoice size="compact" loading="yes" onYes={() => undefined} onNo={() => undefined} />
        <ThemeScope scheme="dark">
          <Swatch color="grafite">
            <BigChoice size="balcao" onYes={() => undefined} onNo={() => undefined} />
          </Swatch>
        </ThemeScope>
      </Section>

      <Section title="Cards">
        <Card>
          <Text weight="semibold">Card padrão</Text>
          <Text color="textMuted">Superfície com borda.</Text>
        </Card>
        <Card variant="alt">
          <Text>Card alternativo (área secundária)</Text>
        </Card>
        <Card variant="accentSoft">
          <Text>Lima claro (encaixe, "Ofereço a 1 pessoa e espero 10 minutos.")</Text>
        </Card>
        <NowCard
          label="Agora"
          clientName="Ana Paula"
          detail="Fisioterapia · 14:00–14:50"
          progress={0.6}
        />
      </Section>

      <Section title="Selos">
        <Row>
          {PILLS.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
          <StatusPill status="confirmado" label="Cliente avisado" />
        </Row>
        <BalcaoStatus active={false} onPress={() => undefined} />
      </Section>

      <Section title="VoiceOrb">
        <Row>
          {ORBS.map((s) => (
            <View key={s} style={{ alignItems: 'center' }}>
              <VoiceOrb state={s} size={t.sizes.orb / 2} />
              <Text variant="caption">{s}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Banners">
        <Banner tone="info" message="Só avisamos quem pediu." />
        <Banner tone="success" message="Ofereço a 1 pessoa e espero 10 minutos." />
        <Banner
          tone="warning"
          message="Conexão não oficial. Existe risco de bloqueio."
          actionLabel="Saiba mais"
          onPress={() => undefined}
        />
        <Banner
          tone="danger"
          message="WhatsApp desconectado — toque para reconectar"
          onPress={() => undefined}
        />
      </Section>

      <Section title="Campos e escolhas">
        <TextField label="Celular" placeholder="(11) 91234-5678" keyboardType="phone-pad" />
        <TextField icon={User} defaultValue="Marina Costa" />
        <TextField label="Serviço" error="Coloque pelo menos um serviço" />
        <Row>
          <Chip
            label="Fisioterapeuta"
            selected={chip === 'fisio'}
            onPress={() => setChip('fisio')}
          />
          <Chip label="Dentista" selected={chip === 'dent'} onPress={() => setChip('dent')} />
          <Chip label="Todas" tone="primary" selected />
          <Chip label="IA cuidando" tone="primary" />
          <Chip label="Desabilitado" disabled />
        </Row>
        <Row>
          <Switch value={on} onValueChange={setOn} accessibilityLabel="Exemplo" />
          <Switch
            value={on}
            onValueChange={setOn}
            tone="accent"
            accessibilityLabel="Exemplo lima"
          />
          <Switch value={!on} onValueChange={(v) => setOn(!v)} accessibilityLabel="Desligado" />
          <Switch value disabled onValueChange={() => undefined} accessibilityLabel="Travado" />
        </Row>
        <Checkbox label="Entendi e quero conectar" checked={checked} onChange={setChecked} />
        <SegmentedControl
          segments={[
            { value: 'pendentes', label: 'Pendentes (2)' },
            { value: 'resolvidas', label: 'Resolvidas' },
          ]}
          value={segment}
          onChange={setSegment}
        />
        <ProgressSteps current={2} total={4} />
      </Section>

      <Section title="Listas">
        <Row>
          <Avatar name="Beatriz Lima" size="sm" />
          <Avatar name="Rafael" />
          <Avatar name="Ana Paula" size="lg" />
        </Row>
        <ListItem
          avatarName="Beatriz Lima"
          title="Beatriz Lima"
          subtitle="Pode sim, às quatro está ótimo."
          right={<StatusPill status="encaixe" label="IA" />}
          onPress={() => undefined}
        />
        <ListItem
          icon={MessageCircle}
          title="WhatsApp conectado"
          right={<Switch value onValueChange={() => undefined} accessibilityLabel="WhatsApp" />}
        />
      </Section>

      <Section title="Estados">
        <EmptyState
          art={<VoiceOrb state="parado" size={t.sizes.avatarLg} />}
          title="Nada esperando você. Bom trabalho!"
        />
        <ErrorState onRetry={() => undefined} />
        <LoadingState />
        <Skeleton />
        <Skeleton width="60%" height={t.spacing.xl} />
      </Section>

      <Section title="Sheet, toast e cabeçalhos">
        <Button label="Abrir BottomSheet" variant="secondary" onPress={() => setSheet(true)} />
        <Button
          label="Mostrar toast"
          variant="secondary"
          onPress={() => showToast('Marcado! O Rafael já foi avisado.')}
        />
        <Button
          label="Toast de erro"
          variant="secondary"
          onPress={() => showToast('Não deu para enviar.', 'danger')}
        />
        <Header title="Agendamento" onBack={() => undefined} />
        <Header title="Conectar" onBack={() => undefined} showLogo />
        <View style={{ height: t.sizes.fab + t.spacing.xxl }}>
          <Fab accessibilityLabel="Novo agendamento" onPress={() => undefined} />
        </View>
      </Section>

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Mensagem que será enviada"
        subtitle="Para Beatriz Lima, sobre o agendamento das 16h"
      >
        <Card variant="accentSoft">
          <Text>Olá, Beatriz! Seu agendamento foi confirmado para hoje, às 16h. Nos vemos lá!</Text>
        </Card>
        <Row>
          <Button
            label="Editar"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => setSheet(false)}
          />
          <Button label="Enviar" icon={Send} style={{ flex: 1 }} onPress={() => setSheet(false)} />
        </Row>
      </BottomSheet>
    </View>
  );
}

/** Dev-only showcase of every base component, in light and dark (prompt 00). */
export default function Vitrine() {
  const [scheme, setScheme] = useState<ColorSchemeName>('light');
  return (
    <ThemeScope scheme={scheme}>
      <Screen scroll>
        <Header title="Vitrine" onBack={() => router.back()} />
        <SegmentedControl
          segments={[
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
          value={scheme}
          onChange={setScheme}
        />
        <Showcase />
      </Screen>
    </ThemeScope>
  );
}
