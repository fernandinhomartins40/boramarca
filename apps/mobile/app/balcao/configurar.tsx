import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  ArrowLeft,
  AudioLines,
  Battery as BatteryIcon,
  Bell,
  Bluetooth,
  CalendarCheck,
  Check,
  CirclePlay,
  Info,
  Mic,
  Moon,
  Store,
  type LucideIcon,
} from 'lucide-react-native';
import { Button, Card, IconButton, Logo, Screen, Switch, Text, showToast } from '@/components';
import { playChime } from '@/features/balcao';
import {
  balcaoSession,
  currentSpeaker,
  hasRealWakeWord,
  isWakePhrase,
  keepSpeakerAwake,
  recognition,
  speak,
  wakeWord,
} from '@/features/balcao/native';
import {
  BRAND_NAME,
  BRAND_STEPS,
  SETUP_DONE_SPEECH,
  SOUND_TEST_SPEECH,
  brandOf,
  levelBars,
} from '@/features/balcao/native/setup';
import { NativeSpeechToText } from '@/features/balcao/native/speechToText';
import { getNotificationPermission, requestNotificationPermission } from '@/features/notifications';
import { useTheme } from '@/theme';

const isAndroid = Platform.OS === 'android';
const BARS = 12;
const METER_MS = 5000;

type Status = 'ok' | 'todo' | 'unknown';

/** Re-checks when the screen opens and when the user comes back from the system settings. */
function useOnForeground(check: () => void) {
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);
}

function OkPill() {
  const t = useTheme();
  return (
    <View
      accessibilityLabel="Ok"
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
      <Text variant="bodySmall" weight="semibold" color="onSuccess">
        Ok
      </Text>
    </View>
  );
}

function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: t.touchTarget.min,
        height: t.touchTarget.min,
        borderRadius: t.radii.md,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon color={t.colors.text} size={t.sizes.icon} />
    </View>
  );
}

/** One checklist item (reference 09): icon, title, text, "Ok" pill or an action button. */
function Step(props: {
  icon: LucideIcon;
  title: string;
  text?: string;
  status: Status;
  action?: { label: string; onPress: () => void };
  /** Always-visible button besides the pill (e.g. "Testar som"). */
  extra?: { label: string; onPress: () => void };
  children?: ReactNode;
}) {
  const t = useTheme();
  const button = props.status !== 'ok' ? props.action : undefined;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <IconBox icon={props.icon} />
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
            <Text weight="bold" style={{ flex: 1 }}>
              {props.title}
            </Text>
            {props.status === 'ok' ? <OkPill /> : null}
          </View>
          {props.text ? (
            <Text variant="bodySmall" color="textMuted">
              {props.text}
            </Text>
          ) : null}
          {props.children}
          {button || props.extra ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {button ? (
                <Button label={button.label} variant="secondary" onPress={button.onPress} />
              ) : null}
              {props.extra ? (
                <Button label={props.extra.label} variant="secondary" onPress={props.extra.onPress} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function TopBar({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.surfaceAlt,
          }}
        >
          <Store color={t.colors.primaryText} size={t.sizes.iconSm} />
          <Text variant="bodySmall" weight="semibold" color="primaryText">
            Modo Balcão
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md }}>
        <IconButton icon={ArrowLeft} accessibilityLabel="Voltar" onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text variant="title" weight="bold" accessibilityRole="header">
            {title}
          </Text>
          <Text color="textMuted">{subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

// ---- page 1: checklist

function Checklist({ onContinue }: { onContinue: () => void }) {
  const t = useTheme();
  const [mic, setMic] = useState<Status>('unknown');
  const [speech, setSpeech] = useState<Status>('unknown');
  const [notif, setNotif] = useState<Status>('unknown');
  const [battery, setBattery] = useState<Status>('unknown');
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [soundTested, setSoundTested] = useState(false);
  const [awake, setAwake] = useState(keepSpeakerAwake.get());
  const [level, setLevel] = useState<number | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const brand = brandOf(Device.manufacturer ?? Device.brand);
  const meterStop = useRef<(() => void) | null>(null);

  const check = useCallback(() => {
    recognition
      ?.getMicrophonePermissionsAsync()
      .then((p) => setMic(p.granted ? 'ok' : 'todo'))
      .catch(() => setMic('todo'));
    if (!isAndroid)
      recognition
        ?.getSpeechRecognizerPermissionsAsync()
        .then((p) => setSpeech(p.granted ? 'ok' : 'todo'))
        .catch(() => setSpeech('todo'));
    getNotificationPermission()
      .then((p) => setNotif(p === 'granted' ? 'ok' : 'todo'))
      .catch(() => setNotif('todo'));
    if (isAndroid)
      Battery.isBatteryOptimizationEnabledAsync()
        .then((on) => setBattery(on ? 'todo' : 'ok'))
        .catch(() => setBattery('todo'));
    setSpeaker(currentSpeaker());
  }, []);
  useOnForeground(check);
  useEffect(() => () => meterStop.current?.(), []);

  async function askMic() {
    const p = await recognition?.requestMicrophonePermissionsAsync().catch(() => null);
    setMic(p?.granted ? 'ok' : 'todo');
    if (!p?.granted) showToast('Sem o microfone o balcão não te ouve. Libere nas configurações.', 'danger');
  }

  /** Live level for 5 s ("Fale algo…") using the recognizer's volume events. */
  function testMic() {
    if (!recognition || meterStop.current) return;
    const sub = recognition.addListener('volumechange', (e) => setLevel(e.value));
    const stop = () => {
      clearTimeout(timer);
      sub.remove();
      recognition?.abort();
      meterStop.current = null;
      setLevel(null);
    };
    const timer = setTimeout(stop, METER_MS);
    meterStop.current = stop;
    setLevel(-2);
    try {
      recognition.start({
        lang: 'pt-BR',
        continuous: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });
    } catch {
      stop();
    }
  }

  async function askSpeech() {
    const p = await recognition?.requestSpeechRecognizerPermissionsAsync().catch(() => null);
    setSpeech(p?.granted ? 'ok' : 'todo');
  }

  async function askNotif() {
    const p = await requestNotificationPermission().catch(() => 'denied' as const);
    setNotif(p === 'granted' ? 'ok' : 'todo');
  }

  async function openBattery() {
    // the system list, not REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (restricted by Google Play)
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    ).catch(() => showToast('Abra Configurações → Apps → Bora Marca → Bateria.', 'info'));
  }

  async function testSound() {
    await speak(SOUND_TEST_SPEECH).catch(() => playChime());
    setSoundTested(true);
  }

  const bars = level === null ? 0 : levelBars(level, BARS);

  return (
    <View style={{ gap: t.spacing.md }}>
      <Step
        icon={Mic}
        title={mic === 'ok' ? 'Microfone permitido' : 'Microfone'}
        text={
          mic === 'ok'
            ? level !== null
              ? 'Fale algo…'
              : undefined
            : 'Para ouvir "Ei, Bora Marca" e as suas respostas.'
        }
        status={mic}
        action={{ label: 'Permitir', onPress: askMic }}
        extra={mic === 'ok' && recognition ? { label: 'Testar', onPress: testMic } : undefined}
      >
        {mic === 'ok' ? (
          <View
            accessibilityLabel={`Nível do microfone: ${bars} de ${BARS}`}
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.xs }}
          >
            {Array.from({ length: BARS }, (_, i) => (
              <View
                key={i}
                style={{
                  width: t.spacing.sm,
                  height: t.spacing.md + Math.min(i, BARS / 2) * t.spacing.xs * 0.5,
                  borderRadius: t.radii.pill,
                  backgroundColor: i < bars ? t.colors.primary : t.colors.border,
                }}
              />
            ))}
          </View>
        ) : null}
      </Step>

      {!isAndroid ? (
        <Step
          icon={AudioLines}
          title={speech === 'ok' ? 'Reconhecimento de fala ativado' : 'Reconhecimento de fala'}
          text="Para entender o que você fala no balcão."
          status={speech}
          action={{ label: 'Permitir', onPress: askSpeech }}
        />
      ) : null}

      <Step
        icon={Bell}
        title={notif === 'ok' ? 'Notificações ativadas' : 'Notificações'}
        text="Você recebe avisos de agendamentos, alterações e pedidos de confirmação."
        status={notif}
        action={{ label: 'Ativar', onPress: askNotif }}
      />

      {isAndroid ? (
        <Step
          icon={BatteryIcon}
          title={battery === 'ok' ? 'Bateria liberada' : 'Bateria precisa ajustar'}
          text="Para o modo balcão funcionar bem, mantenha o celular carregando."
          status={battery}
          action={{ label: 'Configurar', onPress: openBattery }}
          extra={
            battery !== 'ok'
              ? {
                  label: showSteps ? 'Esconder passo a passo' : `Passo a passo: ${BRAND_NAME[brand]}`,
                  onPress: () => setShowSteps((v) => !v),
                }
              : undefined
          }
        >
          {battery !== 'ok' && showSteps ? (
            <View style={{ gap: t.spacing.sm, paddingVertical: t.spacing.xs }}>
              {BRAND_STEPS[brand].map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  <s.icon color={t.colors.primaryText} size={t.sizes.iconSm} />
                  <Text variant="bodySmall" style={{ flex: 1 }}>
                    {`${i + 1}. ${s.text}`}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Step>
      ) : null}

      <Step
        icon={Bluetooth}
        title={speaker ? `${speaker} conectado` : 'Caixa de som Bluetooth'}
        text={
          speaker
            ? 'A caixa vai reproduzir a voz da Bora Marca.'
            : 'Conecte a caixa pelo Bluetooth do celular. Sem caixa, a voz sai pelo celular.'
        }
        status={speaker || soundTested ? 'ok' : 'todo'}
        extra={{ label: 'Testar som', onPress: testSound }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          padding: t.spacing.md,
          borderRadius: t.radii.md,
          backgroundColor: t.colors.surfaceAlt,
        }}
      >
        <Info color={t.colors.text} size={t.sizes.iconSm} />
        <Text variant="bodySmall" style={{ flex: 1 }}>
          O celular escuta você. A caixa só reproduz a voz. Deixe o celular perto de você e a caixa
          onde quiser.
        </Text>
      </View>

      {keepSpeakerAwake.available ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <IconBox icon={Moon} />
            <View style={{ flex: 1, gap: t.spacing.xs }}>
              <Text weight="bold">Manter caixa acordada</Text>
              <Text variant="bodySmall" color="textMuted">
                Toca um som que você não ouve a cada 4 minutos, para a caixa não desligar sozinha.
              </Text>
            </View>
            <Switch
              value={awake}
              onValueChange={(v) => {
                keepSpeakerAwake.set(v);
                setAwake(v);
              }}
              accessibilityLabel="Manter caixa acordada"
            />
          </View>
        </Card>
      ) : null}

      <Button label="Continuar" size="lg" onPress={onContinue} />
    </View>
  );
}

// ---- page 2: final test ("Vamos testar?")

function FinalTest() {
  const t = useTheme();
  const [state, setState] = useState<'waiting' | 'listening' | 'missed' | 'ok'>('waiting');
  const realWake = hasRealWakeWord();

  const heard = useCallback(() => {
    setState('ok');
    void speak(SETUP_DONE_SPEECH).catch(() => undefined);
  }, []);

  // with Porcupine: listen for the real wake word while this page is open
  useEffect(() => {
    if (!realWake || wakeWord.started) return;
    void wakeWord.start(heard);
    return () => void wakeWord.stop();
  }, [realWake, heard]);

  // without Porcupine: one recognition round, checked for "Ei, Bora Marca"
  async function listenOnce() {
    if (!recognition) return heard();
    const stt = new NativeSpeechToText(recognition);
    setState('listening');
    try {
      await stt.start({
        onPartial: () => undefined,
        onResult: (text) => (isWakePhrase(text) ? heard() : setState('missed')),
      });
    } catch {
      setState('missed');
    }
  }

  function activate() {
    // starts the Android service now, while the app is in the foreground (Android 14+ rule)
    balcaoSession
      .open()
      .catch(() =>
        showToast('Não deu para ouvir com a tela bloqueada. Abra o balcão de novo.', 'danger'),
      );
    router.replace('/balcao');
  }

  const ring = t.sizes.orb * 0.8;
  return (
    <View style={{ gap: t.spacing.xl, alignItems: 'center' }}>
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: t.spacing.lg,
          borderColor: t.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Mic color={t.colors.primaryText} size={t.sizes.avatarLg * 0.6} />
      </View>
      <Text variant="display" weight="bold" align="center">
        Diga{' '}
        <Text variant="display" weight="bold" color="primaryText">
          Ei, Bora Marca
        </Text>
      </Text>

      {state === 'ok' ? (
        <>
          <Card variant="accentSoft" style={{ alignSelf: 'stretch' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <View
                style={{
                  width: t.sizes.avatar,
                  height: t.sizes.avatar,
                  borderRadius: t.radii.pill,
                  backgroundColor: t.colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check color={t.colors.onAccent} size={t.sizes.icon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="heading" weight="bold">
                  Reconheci sua voz
                </Text>
                <Text variant="bodySmall">Perfeito! Já posso te atender por voz aqui no balcão.</Text>
              </View>
            </View>
          </Card>
          <CalendarCheck color={t.colors.primaryText} size={t.sizes.iconLg} />
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="heading" weight="bold" align="center">
              Tudo pronto para trabalhar
            </Text>
            <Text color="textMuted" align="center">
              O Modo Balcão está configurado e funcionando.
            </Text>
          </View>
        </>
      ) : realWake ? (
        <Text color="textMuted" align="center" accessibilityLiveRegion="polite">
          Estou ouvindo. Fale como se estivesse no balcão.
        </Text>
      ) : (
        <View style={{ alignSelf: 'stretch', gap: t.spacing.sm }}>
          {state === 'missed' ? (
            <Text color="danger" align="center" accessibilityLiveRegion="polite">
              Não reconheci. Fale mais perto do celular e tente de novo.
            </Text>
          ) : null}
          <Button
            label={state === 'listening' ? 'Ouvindo…' : 'Testar agora'}
            icon={Mic}
            variant="secondary"
            size="lg"
            disabled={state === 'listening'}
            onPress={listenOnce}
          />
        </View>
      )}

      <Button
        label="Ativar Modo Balcão"
        icon={CirclePlay}
        size="lg"
        onPress={activate}
        style={{ alignSelf: 'stretch' }}
      />
    </View>
  );
}

/**
 * Preparar o balcão (prompt 08, reference 09-configurar-balcao). Android: microphone,
 * notifications, battery (per brand), Bluetooth speaker, keep it awake and final test. iOS (short
 * version, plan section 11): microphone, speech recognition, notifications, sound test and final
 * test; on the iPhone the Balcão only works with the app open.
 */
export default function ConfigurarBalcaoScreen() {
  const t = useTheme();
  const [page, setPage] = useState<'checklist' | 'test'>('checklist');
  const back = () => (page === 'test' ? setPage('checklist') : router.back());
  return (
    <Screen scroll contentStyle={{ gap: t.spacing.xl }}>
      {page === 'checklist' ? (
        <>
          <TopBar title="Prepare seu balcão" subtitle="Vamos conferir o que falta." onBack={back} />
          {!isAndroid ? (
            <Text variant="bodySmall" color="textMuted">
              No iPhone, o balcão funciona com o app aberto e a tela acesa. Com o app fechado, as
              decisões chegam por notificação com Sim e Não.
            </Text>
          ) : null}
          <Checklist onContinue={() => setPage('test')} />
        </>
      ) : (
        <>
          <TopBar
            title="Vamos testar?"
            subtitle="Fale a frase abaixo, como se estivesse no seu balcão de atendimento."
            onBack={back}
          />
          <FinalTest />
        </>
      )}
    </Screen>
  );
}
