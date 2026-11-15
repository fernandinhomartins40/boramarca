import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  ChevronRight,
  Copy,
  MessageCircle,
  Pause,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, type WhatsAppStatusResponse } from '@boramarca/shared';
import {
  Avatar,
  Banner,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Header,
  Screen,
  Text,
  TextField,
  VoiceOrb,
  showToast,
} from '@/components';
import { data } from '@/data';
import { formatPhone, localPhone, maskBrPhone, toE164 } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';
import { formatClock, useCountdown } from '@/features/auth/useCountdown';
import { errorMessage } from '@/features/settings/format';
import { useTheme } from '@/theme';
import { useWhatsAppStore } from './store';

type Step = 'intro' | 'choose' | 'code' | 'qr' | 'connecting' | 'connected' | 'error';

interface Code {
  value: string;
  expiresAt: number;
}

const POLL_MS = 2000;

/**
 * Conectar o WhatsApp (prompt 02, reference 03-whatsapp): honest explanation → choose method →
 * pairing code (same phone) or QR (other phone) → connecting → connected | error.
 */
export function ConnectFlow({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const t = useTheme();
  const [step, setStep] = useState<Step>('intro');
  const [accepted, setAccepted] = useState(false);
  const [learnMore, setLearnMore] = useState(false);
  const [phone, setPhone] = useState(() => localPhone(useSession.getState().phone));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WhatsAppStatusResponse | null>(null);
  const left = useCountdown(code?.expiresAt ?? null);

  const fail = (e: unknown) => {
    setResult(null);
    showToast(errorMessage(e), 'danger');
  };

  async function startPairing() {
    const e164 = toE164(phone);
    if (!e164) return setPhoneError('Confira o número do WhatsApp, com DDD.');
    setBusy(true);
    try {
      await data.whatsapp.createSession({ phone: e164, riskAccepted: true });
      const r = await data.whatsapp.getPairingCode(e164);
      setCode({ value: r.code, expiresAt: Date.parse(r.expiresAt) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function startQr(newSession: boolean) {
    setBusy(true);
    try {
      if (newSession) await data.whatsapp.createSession({ riskAccepted: true });
      const r = await data.whatsapp.getQr();
      setCode({ value: r.qr, expiresAt: Date.parse(r.expiresAt) });
    } catch (e) {
      fail(e);
      setCode(null);
      setStep('choose');
    } finally {
      setBusy(false);
    }
  }

  // QR renews itself when it expires (the pairing code waits for "Gerar novo código").
  useEffect(() => {
    if (step !== 'qr' || !code || left > 0 || busy) return;
    const timer = setTimeout(() => startQr(false), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startQr only reads stable state
  }, [step, code, left, busy]);

  // Status polling while waiting for the phone to pair.
  const waiting = (step === 'code' || step === 'qr' || step === 'connecting') && !!code;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const s = await data.whatsapp.getStatus().catch(() => null);
      if (!s) return;
      if (s.status === 'connecting') setStep('connecting');
      if (s.status === 'connected' || s.status === 'error') {
        setResult(s);
        setCode(null);
        setStep(s.status);
        useWhatsAppStore.getState().set(s);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  const back = () => {
    setCode(null);
    if (step === 'code' || step === 'qr') setStep('choose');
    else if (step === 'choose') setStep('intro');
    else onBack?.();
  };
  const showBack = step === 'choose' || step === 'code' || step === 'qr' || !!onBack;

  const header = <Header onBack={showBack && step !== 'connected' ? back : undefined} showLogo />;

  if (step === 'connecting')
    return (
      <Screen>
        {header}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            art={<VoiceOrb state="pensando" size={t.sizes.orb * 0.7} />}
            title="Conectando ao seu WhatsApp…"
            message="Deixe o WhatsApp aberto por alguns segundos."
          />
        </View>
      </Screen>
    );

  if (step === 'connected')
    return (
      <Screen footer={<Button label="Continuar" size="lg" onPress={onDone} style={{ flex: 1 }} />}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', gap: t.spacing.lg }}>
          <EmptyState
            art={
              <View
                style={{
                  width: t.sizes.avatarLg,
                  height: t.sizes.avatarLg,
                  borderRadius: t.radii.pill,
                  backgroundColor: t.colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck color={t.colors.onAccent} size={t.sizes.iconLg} />
              </View>
            }
            title="Pronto! Seu WhatsApp está conectado."
            message="O Bora Marca já pode atender e agendar seus clientes."
          />
          <Card
            variant="accentSoft"
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
          >
            <Avatar name={result?.profileName ?? 'WhatsApp'} />
            <View style={{ flex: 1 }}>
              {result?.profileName ? <Text weight="semibold">{result.profileName}</Text> : null}
              <Text variant="heading">{formatPhone(result?.phone)}</Text>
            </View>
          </Card>
        </View>
      </Screen>
    );

  if (step === 'error')
    return (
      <Screen>
        {header}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            title="Não deu para conectar"
            message={
              result?.errorMessage ?? 'Confira a internet dos dois celulares e tente de novo.'
            }
            onRetry={() => setStep('choose')}
          />
        </View>
      </Screen>
    );

  if (step === 'choose')
    return (
      <Screen scroll>
        {header}
        <Text variant="title">Como você quer conectar o WhatsApp?</Text>
        <Text color="textMuted">Escolha o jeito mais prático para você.</Text>
        <MethodCard
          icon={Smartphone}
          title="WhatsApp está neste celular"
          subtitle="Usar código de pareamento"
          variant="accentSoft"
          onPress={() => setStep('code')}
        />
        <MethodCard
          icon={QrCode}
          title="WhatsApp está em outro celular"
          subtitle="Ler QR code"
          onPress={() => {
            setStep('qr');
            startQr(true);
          }}
        />
      </Screen>
    );

  if (step === 'code')
    return (
      <Screen scroll>
        {header}
        <Text variant="title">Código de pareamento</Text>
        {!code ? (
          <>
            <Text color="textMuted">
              Qual é o número do WhatsApp que seus clientes usam? Vamos gerar um código para ele.
            </Text>
            <TextField
              label="Número do WhatsApp"
              icon={Smartphone}
              value={phone}
              onChangeText={(v) => {
                setPhone(maskBrPhone(v));
                setPhoneError(null);
              }}
              placeholder="(11) 91234-5678"
              keyboardType="phone-pad"
              error={phoneError}
            />
            <Button label="Gerar código" size="lg" loading={busy} onPress={startPairing} />
          </>
        ) : (
          <>
            <Text color="textMuted">
              Use este código no seu WhatsApp para conectar o Bora Marca.
            </Text>
            <View
              accessible
              accessibilityLabel={`Código ${code.value.split('').join(' ')}`}
              style={{
                alignItems: 'center',
                paddingVertical: t.spacing.lg,
                borderRadius: t.radii.lg,
                backgroundColor: t.colors.surfaceAlt,
                opacity: left > 0 ? 1 : t.opacity.disabled,
              }}
            >
              <Text
                variant="display"
                weight="bold"
                style={{ letterSpacing: t.spacing.sm }}
                selectable
              >
                {`${code.value.slice(0, 4)} ${code.value.slice(4)}`}
              </Text>
            </View>
            {left > 0 ? (
              <>
                <Text variant="bodySmall" color="textMuted" align="center">
                  O código vale por mais {formatClock(left)}
                </Text>
                <Button
                  label="Copiar"
                  variant="neutral"
                  icon={Copy}
                  onPress={async () => {
                    await Clipboard.setStringAsync(code.value);
                    showToast('Código copiado.', 'info');
                  }}
                />
              </>
            ) : (
              <>
                <Banner tone="warning" message="O código expirou. Gere um novo para continuar." />
                <Button
                  label="Gerar novo código"
                  icon={RefreshCw}
                  loading={busy}
                  onPress={startPairing}
                />
              </>
            )}
            <Steps
              items={[
                'Abra o WhatsApp no seu celular.',
                'Toque em Aparelhos conectados → Conectar um aparelho.',
                'Toque em Conectar com número de telefone e digite o código acima.',
              ]}
            />
            <Button
              label="Abrir WhatsApp"
              size="lg"
              icon={MessageCircle}
              onPress={() =>
                Linking.openURL('whatsapp://').catch(() =>
                  showToast('Não achamos o WhatsApp neste celular.', 'danger'),
                )
              }
            />
          </>
        )}
      </Screen>
    );

  if (step === 'qr')
    return (
      <Screen scroll>
        {header}
        <Text variant="title">Escaneie o QR code</Text>
        <Text color="textMuted">
          No outro celular, abra o WhatsApp, toque em Aparelhos conectados → Conectar um aparelho e
          leia o código abaixo.
        </Text>
        <View style={{ alignItems: 'center' }}>
          <View
            accessible
            accessibilityLabel="QR code para conectar o WhatsApp"
            style={{
              padding: t.spacing.lg,
              borderRadius: t.radii.lg,
              // Scanners need dark on light, so the QR keeps the light colors in dark mode too.
              backgroundColor: colors.light.surface,
              borderWidth: t.sizes.border,
              borderColor: t.colors.border,
            }}
          >
            {code ? (
              <QRCode
                value={code.value}
                size={t.sizes.orb}
                color={colors.light.text}
                backgroundColor={colors.light.surface}
              />
            ) : (
              <View style={{ width: t.sizes.orb, height: t.sizes.orb }} />
            )}
          </View>
        </View>
        <Banner
          tone="info"
          icon={RefreshCw}
          message={code && left > 0 ? `O código renova em ${formatClock(left)}` : 'Gerando código…'}
        />
        <Steps
          items={[
            'Abra o WhatsApp no outro celular.',
            'Toque em Aparelhos conectados → Conectar um aparelho.',
            'Aponte a câmera para este código.',
          ]}
        />
      </Screen>
    );

  // intro
  return (
    <Screen
      scroll
      footer={
        <Button
          label="Conectar"
          size="lg"
          disabled={!accepted}
          onPress={() => setStep('choose')}
          style={{ flex: 1 }}
        />
      }
    >
      {header}
      <Text variant="title">Conecte o WhatsApp que seus clientes já usam</Text>
      <Text color="textMuted">
        O Bora Marca entra como um aparelho conectado, igual ao WhatsApp Web.
      </Text>
      <Point icon={MessageCircle} text="O Bora Marca só responde quem te mandou mensagem." />
      <Point icon={ShieldCheck} text="Nunca mandamos mensagem em massa." />
      <Point icon={Pause} text="Você pode pausar a IA quando quiser." />
      <Banner
        tone="warning"
        message="Essa conexão não é a API oficial do WhatsApp. Usamos regras para proteger seu número, mas existe um risco pequeno de bloqueio."
        actionLabel="Saiba mais"
        onPress={() => setLearnMore(true)}
      />
      <Checkbox label="Entendi e quero conectar" checked={accepted} onChange={setAccepted} />
      <BottomSheet
        visible={learnMore}
        onClose={() => setLearnMore(false)}
        title="Por que existe um risco?"
      >
        <Text>
          O WhatsApp oferece uma API oficial só para empresas verificadas. O Bora Marca conecta seu
          número como um aparelho conectado, do mesmo jeito que o WhatsApp Web.
        </Text>
        <Text>
          Para proteger seu número, só respondemos quem te chamou, com no máximo algumas mensagens
          por minuto, com pausa de digitação, e nunca enviamos mensagem em massa. Mesmo assim, o
          WhatsApp pode bloquear números que ele considere suspeitos.
        </Text>
        <Text>Você pode desconectar quando quiser em Ajustes → WhatsApp.</Text>
        <Button label="Entendi" onPress={() => setLearnMore(false)} />
      </BottomSheet>
    </Screen>
  );
}

function Point({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const t = useTheme();
  return (
    <Card variant="alt" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      <Icon color={t.colors.text} size={t.sizes.icon} />
      <Text weight="semibold" style={{ flex: 1 }}>
        {text}
      </Text>
    </Card>
  );
}

function MethodCard({
  icon: Icon,
  title,
  subtitle,
  variant,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  variant?: 'accentSoft';
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Card
      variant={variant}
      onPress={onPress}
      accessibilityLabel={`${title}. ${subtitle}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.lg,
        minHeight: t.touchTarget.bigChoice,
      }}
    >
      <Icon color={t.colors.text} size={t.sizes.iconLg} />
      <View style={{ flex: 1 }}>
        <Text variant="heading">{title}</Text>
        <Text color="textMuted">{subtitle}</Text>
      </View>
      <ChevronRight color={t.colors.text} size={t.sizes.icon} />
    </Card>
  );
}

function Steps({ items }: { items: string[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      {items.map((text, i) => (
        <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <View
            style={{
              width: t.sizes.avatarSm,
              height: t.sizes.avatarSm,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text weight="bold" color="primaryText">
              {i + 1}
            </Text>
          </View>
          <Text style={{ flex: 1 }}>{text}</Text>
        </View>
      ))}
    </View>
  );
}
