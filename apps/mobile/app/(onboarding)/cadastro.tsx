import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  Ellipsis,
  GraduationCap,
  Hand,
  Plus,
  Scissors,
  Sparkles,
  Stethoscope,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { PROFESSIONS, PROFESSION_LABELS, type Profession } from '@boramarca/shared';
import {
  Button,
  Chip,
  EmptyState,
  Logo,
  ProgressSteps,
  Screen,
  Text,
  TextField,
  VoiceOrb,
} from '@/components';
import { useSession } from '@/features/auth/session';
import { completeSignUp, suggestedServicesFor, useSignUpDraft } from '@/features/auth/signup';
import { errorMessage, validateWeek } from '@/features/settings/format';
import { ServiceForm, ServiceRow } from '@/features/settings/ServiceForm';
import { WeekEditor } from '@/features/settings/WeekEditor';
import { useTheme } from '@/theme';

const ICONS: Record<Profession, LucideIcon> = {
  barbeiro: Scissors,
  cabeleireiro: Scissors,
  manicure: Hand,
  esteticista: Sparkles,
  fisioterapeuta: Activity,
  psicologo: Brain,
  dentista: Stethoscope,
  professor_instrutor: GraduationCap,
  outro: Ellipsis,
};

const STEPS = 4;

/** Quick sign-up, one question per screen (prompt 01, reference 02-cadastro). */
export default function SignUpScreen() {
  const t = useTheme();
  const d = useSignUpDraft();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const step = d.step;

  const go = (s: number) => {
    setError(null);
    setEditing(null);
    d.patch({ step: s });
  };

  async function next() {
    if (step === 1) {
      if (!d.name.trim()) return setError('Escreva como seus clientes te chamam.');
      return go(2);
    }
    if (step === 2) {
      if (d.professions.length === 0) return setError('Escolha pelo menos uma profissão.');
      const key = [...d.professions].sort().join(',');
      if (key !== d.servicesFor)
        d.patch({ services: suggestedServicesFor(d.professions), servicesFor: key });
      return go(3);
    }
    if (step === 3) {
      if (d.services.length === 0) return setError('Coloque pelo menos um serviço.');
      return go(4);
    }
    if (step === 4) {
      const problem = validateWeek(d.week);
      if (problem) return setError(problem);
      setSaving(true);
      setError(null);
      try {
        await completeSignUp(d, d.progress, (progress) => d.patch({ progress }));
        go(5);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    }
  }

  function finish() {
    useSession.getState().finishOnboarding();
    useSignUpDraft.getState().reset();
    router.replace({ pathname: '/whatsapp', params: { onboarding: '1' } });
  }

  if (step === 5)
    return (
      <Screen
        footer={
          <Button
            label="Conectar o WhatsApp"
            size="lg"
            iconRight={ArrowRight}
            onPress={finish}
            style={{ flex: 1 }}
          />
        }
      >
        <Logo />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            art={<VoiceOrb state="parado" size={t.sizes.orb * 0.6} />}
            title="Tudo pronto."
            message="Agora vamos conectar seu WhatsApp."
          />
        </View>
      </Screen>
    );

  const toggleProfession = (p: Profession) =>
    d.patch({
      professions: d.professions.includes(p)
        ? d.professions.filter((x) => x !== p)
        : [...d.professions, p],
      progress: { ...d.progress, profile: false },
    });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll
        footer={
          <>
            {step > 1 ? (
              <Button
                label="Voltar"
                variant="neutral"
                icon={ArrowLeft}
                onPress={() => go(step - 1)}
              />
            ) : null}
            <Button
              label={step === STEPS ? 'Concluir cadastro' : 'Continuar'}
              iconRight={step === STEPS ? Check : ArrowRight}
              loading={saving}
              onPress={next}
              style={{ flex: 1 }}
            />
          </>
        }
      >
        <Logo />
        <ProgressSteps current={step} total={STEPS} />

        {step === 1 ? (
          <>
            <Text variant="title">Como seus clientes te chamam?</Text>
            <Text color="textMuted">
              É assim que seu perfil vai aparecer para quem agendar com você.
            </Text>
            <TextField
              icon={User}
              placeholder="Seu nome"
              accessibilityLabel="Seu nome"
              value={d.name}
              onChangeText={(name) => {
                d.patch({ name, progress: { ...d.progress, profile: false } });
                setError(null);
              }}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={120}
              error={error}
              returnKeyType="next"
              onSubmitEditing={next}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text variant="title">O que você faz?</Text>
            <Text color="textMuted">
              Escolha sua profissão. Dá para marcar mais de uma e mudar depois.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {PROFESSIONS.map((p) => (
                <Chip
                  key={p}
                  label={PROFESSION_LABELS[p]}
                  icon={ICONS[p]}
                  selected={d.professions.includes(p)}
                  onPress={() => {
                    toggleProfession(p);
                    setError(null);
                  }}
                />
              ))}
            </View>
            <InlineError message={error} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text variant="title">Seus serviços</Text>
            <Text color="textMuted">
              Cadastre os serviços que seus clientes podem agendar com você.
            </Text>
            {d.services.map((s, i) =>
              editing === i ? (
                <ServiceForm
                  key={i}
                  initial={s}
                  onCancel={() => setEditing(null)}
                  onRemove={() => {
                    d.patch({ services: d.services.filter((_, j) => j !== i) });
                    setEditing(null);
                  }}
                  onSave={(v) => {
                    d.patch({ services: d.services.map((x, j) => (j === i ? v : x)) });
                    setEditing(null);
                  }}
                />
              ) : (
                <ServiceRow key={i} service={s} onEdit={() => setEditing(i)} />
              ),
            )}
            {editing === 'new' ? (
              <ServiceForm
                onCancel={() => setEditing(null)}
                onSave={(v) => {
                  d.patch({ services: [...d.services, v] });
                  setEditing(null);
                  setError(null);
                }}
              />
            ) : (
              <Button
                label="Adicionar serviço"
                variant="ghost"
                icon={Plus}
                onPress={() => setEditing('new')}
                style={{ backgroundColor: t.colors.surfaceAlt }}
              />
            )}
            <InlineError message={error} />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text variant="title">Quando você atende?</Text>
            <Text color="textMuted">Defina os dias da semana e os horários de atendimento.</Text>
            <WeekEditor
              value={d.week}
              onChange={(week) => {
                d.patch({ week, progress: { ...d.progress, hours: false } });
                setError(null);
              }}
              error={error}
            />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
