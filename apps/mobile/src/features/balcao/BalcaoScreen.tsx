import { useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { CalendarDays, Mic, Power, Volume1 } from 'lucide-react-native';
import {
  Banner,
  BigChoice,
  Button,
  Logo,
  Screen,
  Text,
  VoiceOrb,
  showToast,
  type VoiceOrbState,
} from '@/components';
import { data } from '@/data';
import { DEV_TOOLS_ENABLED } from '@/dev/flags';
import { clock, firstName } from '@/features/agenda/format';
import { ThemeScope, useTheme } from '@/theme';
import { dateOnly, nowAndNext } from '@/utils/agenda';
import { BalcaoDevPanel } from './BalcaoDevPanel';
import { getBalcaoEngines } from './engines';
import type { BalcaoStateName } from './machine';
import { LOW_VOLUME, useBalcaoStore } from './store';
import { useBalcao } from './useBalcao';

const DEV_TAPS = 3;
const DEV_TAP_WINDOW_MS = 1500;
const LONG_PRESS_MS = 800;

const ORB_STATE: Record<BalcaoStateName, VoiceOrbState> = {
  parado: 'parado',
  ativado: 'ouvindo',
  ouvindo: 'ouvindo',
  pensando: 'pensando',
  falando: 'falando',
  esperando_resposta: 'ouvindo',
};

/** [white part, lima part] of the question, as in reference 08-voz ("Posso marcar a | Beatriz às 16h?"). */
export function splitQuestion(question: string, name?: string): [string, string] {
  const sentences = question.split(/(?<=[.?!])\s+/);
  if (sentences.length > 1) {
    const last = sentences.pop()!;
    return [`${sentences.join(' ')} `, last];
  }
  const i = name ? question.indexOf(name) : -1;
  return i > 0 ? [question.slice(0, i), question.slice(i)] : ['', question];
}

/** Spoken part (up to the end of the current word) and the rest, for the karaoke highlight. */
function karaoke(phrase: string, spokenTo: number): [string, string] {
  if (spokenTo <= 0) return ['', phrase];
  const end = phrase.indexOf(' ', spokenTo);
  const cut = end === -1 ? phrase.length : end;
  return [phrase.slice(0, cut), phrase.slice(cut)];
}

function useNextClient(): string | null {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    data.agenda
      .getDay(dateOnly(new Date()))
      .then((day) => {
        const n = nowAndNext(day.appointments, new Date()).next;
        if (alive) setNext(n ? `${firstName(n.clientName)} às ${clock(n.startsAt)}` : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return next;
}

function BalcaoContent() {
  const t = useTheme();
  useKeepAwake('balcao');
  const controller = useBalcao();
  const s = useBalcaoStore((st) => st.snapshot);
  const volume = useBalcaoStore((st) => st.volume);
  const next = useNextClient();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [devOpen, setDevOpen] = useState(false);
  const taps = useRef<number[]>([]);

  function onLogoPress() {
    if (!DEV_TOOLS_ENABLED) return;
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < DEV_TAP_WINDOW_MS), now];
    if (taps.current.length >= DEV_TAPS) {
      taps.current = [];
      setDevOpen(true);
    }
  }

  const orbSize = landscape
    ? Math.min(height * 0.55, width * 0.4)
    : Math.min(height * 0.4, width * 0.85);
  const pill: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.touchTarget.min,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radii.md,
    borderWidth: t.sizes.border,
    borderColor: t.colors.border,
  };
  const big = { ...t.balcaoText, color: t.colors.text };
  const asking = s.decision && (s.status === 'esperando_resposta' || s.status === 'falando');

  const phrase = (() => {
    switch (s.status) {
      case 'parado':
        return null;
      case 'ativado':
      case 'ouvindo':
        return 'Ouvindo…';
      case 'pensando':
        return 'Um segundo…';
      case 'falando':
      case 'esperando_resposta':
        return s.phrase;
    }
  })();

  const center =
    s.status === 'esperando_resposta' && s.decision ? (
      (() => {
        const [plain, lime] = splitQuestion(s.phrase, s.decision.context.clientFirstName);
        return (
          <Text
            accessibilityLiveRegion="polite"
            style={big}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            numberOfLines={5}
          >
            {plain}
            <Text style={[big, { color: t.colors.accent }]}>{lime}</Text>
          </Text>
        );
      })()
    ) : (
      <>
        <VoiceOrb state={ORB_STATE[s.status]} size={orbSize}>
          {s.status === 'parado' ? (
            <Text variant="display" color="onPrimary" align="center">
              Diga{'\n'}
              <Text variant="display" color="accent">
                Ei, Bora Marca
              </Text>
            </Text>
          ) : null}
        </VoiceOrb>
        {phrase ? (
          s.status === 'falando' ? (
            (() => {
              const [said, rest] = karaoke(s.phrase, s.spokenTo);
              return (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[big, { textAlign: landscape ? 'left' : 'center' }]}
                  adjustsFontSizeToFit
                  minimumFontScale={0.4}
                  numberOfLines={4}
                >
                  <Text style={[big, { color: t.colors.accent }]}>{said}</Text>
                  {rest}
                </Text>
              );
            })()
          ) : (
            <Text
              accessibilityLiveRegion="polite"
              style={big}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {phrase}
            </Text>
          )
        ) : null}
      </>
    );

  const listening =
    s.status === 'ouvindo' || s.status === 'ativado' || s.status === 'esperando_resposta';
  const footerText =
    s.caption ||
    (s.status === 'esperando_resposta'
      ? 'Você também pode responder falando.'
      : listening
        ? 'Pergunte, por exemplo: quem é o próximo?'
        : 'Assistente ativo');

  return (
    <Screen contentStyle={{ gap: t.spacing.lg }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Pressable onPress={onLogoPress} accessibilityLabel="Bora Marca" hitSlop={t.spacing.sm}>
          <Logo variant="violeta-branco" />
        </Pressable>
        <View
          style={{ width: t.sizes.border, alignSelf: 'stretch', backgroundColor: t.colors.border }}
        />
        {next ? (
          <View style={[pill, { flexShrink: 1 }]} accessibilityLabel={`Próximo: ${next}`}>
            <CalendarDays color={t.colors.text} size={t.sizes.icon} />
            <View style={{ flexShrink: 1 }}>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                Próximo:
              </Text>
              <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                {next}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable
          onLongPress={() => router.back()}
          onPress={() => showToast('Segure o botão para sair.', 'info')}
          delayLongPress={LONG_PRESS_MS}
          accessibilityRole="button"
          accessibilityLabel="Sair do Modo Balcão"
          accessibilityHint="Toque e segure para sair"
          style={({ pressed }) => [
            pill,
            { borderRadius: t.radii.pill, opacity: pressed ? t.opacity.pressed : 1 },
          ]}
        >
          <Power color={t.colors.text} size={t.sizes.icon} />
          <Text weight="semibold">Sair</Text>
        </Pressable>
      </View>

      {volume !== null && volume < LOW_VOLUME ? (
        <Banner
          tone="warning"
          icon={Volume1}
          message="Volume baixo — aumente para ouvir os avisos"
        />
      ) : null}

      <View
        style={{
          flex: 1,
          flexDirection: landscape ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing.xl,
        }}
      >
        <View style={{ flex: landscape ? 1 : undefined, alignItems: 'center', gap: t.spacing.lg }}>
          {center}
        </View>
        {asking || (s.status === 'parado' && getBalcaoEngines().wakeWord.simulated) ? (
          <View
            style={{
              alignSelf: 'stretch',
              flex: landscape ? 1 : undefined,
              justifyContent: 'center',
            }}
          >
            {asking ? (
              <BigChoice
                size="balcao"
                onYes={() => controller.send({ type: 'TAP', choice: 'yes' })}
                onNo={() => controller.send({ type: 'TAP', choice: 'no' })}
              />
            ) : (
              <Button label="Falar" icon={Mic} size="lg" onPress={controller.wake} />
            )}
          </View>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing.lg,
          minHeight: t.touchTarget.bigChoice,
          paddingHorizontal: t.spacing.xl,
          borderRadius: t.radii.lg,
          backgroundColor: s.caption ? t.colors.surfaceAlt : undefined,
        }}
      >
        <Mic color={t.colors.accent} size={t.sizes.iconLg} />
        <View
          style={{
            width: t.sizes.borderStrong,
            alignSelf: 'stretch',
            backgroundColor: t.colors.border,
          }}
        />
        <Text
          variant="heading"
          weight={s.caption ? 'bold' : 'regular'}
          style={{ flexShrink: 1 }}
          numberOfLines={3}
        >
          {footerText}
        </Text>
      </View>

      {DEV_TOOLS_ENABLED ? (
        <BalcaoDevPanel
          visible={devOpen}
          onClose={() => setDevOpen(false)}
          controller={controller}
        />
      ) : null}
    </Screen>
  );
}

/** Modo Balcão (prompt 07): always dark, read from 1–2 m away, portrait and landscape. */
export function BalcaoScreen() {
  return (
    <ThemeScope scheme="dark">
      <BalcaoContent />
    </ThemeScope>
  );
}
