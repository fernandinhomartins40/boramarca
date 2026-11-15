import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { Moon, Play, Volume2 } from 'lucide-react-native';
import type { QuietHours } from '@boramarca/shared';
import {
  Button,
  ErrorState,
  Header,
  ListItem,
  Screen,
  SegmentedControl,
  Skeleton,
  Switch,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { errorMessage, maskTime } from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { useLoad } from '@/features/settings/useLoad';
import { useTheme } from '@/theme';

const RATES = { slow: 0.8, normal: 1, fast: 1.25 } as const;
type Rate = keyof typeof RATES;
const rateOf = (v: number): Rate => (v < 0.9 ? 'slow' : v > 1.1 ? 'fast' : 'normal');

const load = () => data.profile.getMe();
const SAMPLE = 'Beatriz quer encaixe às quatro da tarde. Posso marcar?';
const DEFAULT_QUIET: QuietHours = { start: '20:00', end: '08:00' };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Voz e Balcão (prompt 10): velocidade da fala, testar voz, horário de silêncio. */
export default function VoiceScreen() {
  const t = useTheme();
  const res = useLoad(load);
  return (
    <Screen edges={['top', 'left', 'right']} scroll>
      <Header title="Voz e Balcão" onBack={() => router.back()} />
      <ListItem
        icon={Volume2}
        title="Configurar o Balcão"
        subtitle="Celular e caixa de som no balcão"
        onPress={() => router.push('/balcao/configurar')}
      />
      {res.loading ? (
        <Skeleton height={t.touchTarget.min * 4} radius="lg" />
      ) : res.error || !res.data ? (
        <ErrorState message={res.error ?? undefined} onRetry={res.reload} />
      ) : (
        <Content rate={res.data.professional.voiceRate} quiet={res.data.professional.quietHours} />
      )}
    </Screen>
  );
}

function Content(props: { rate: number; quiet: QuietHours | null }) {
  const t = useTheme();
  const [rate, setRate] = useState<Rate>(rateOf(props.rate));
  const [quietOn, setQuietOn] = useState(!!props.quiet);
  const [quiet, setQuiet] = useState(props.quiet ?? DEFAULT_QUIET);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function changeRate(r: Rate) {
    const before = rate;
    setRate(r);
    try {
      await data.profile.updateMe({ voiceRate: RATES[r] });
    } catch (e) {
      setRate(before);
      showToast(errorMessage(e), 'danger');
    }
  }

  async function saveQuiet(on = quietOn) {
    if (on && (!TIME.test(quiet.start) || !TIME.test(quiet.end)))
      return setError('Use horários como 20:00 e 08:00.');
    setSaving(true);
    setError(null);
    try {
      await data.profile.updateMe({ quietHours: on ? quiet : null });
      showToast('Horário de silêncio salvo.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="Voz da IA no balcão" subtitle="Como a IA fala com você no balcão.">
        <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
          <Text weight="semibold">Velocidade da fala</Text>
          <SegmentedControl<Rate>
            segments={[
              { value: 'slow', label: 'Mais lenta' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Mais rápida' },
            ]}
            value={rate}
            onChange={changeRate}
          />
          <Button
            label="Testar voz"
            icon={Play}
            onPress={() => {
              Speech.stop();
              Speech.speak(SAMPLE, { language: 'pt-BR', rate: RATES[rate] });
            }}
          />
        </View>
      </Section>

      <Section title="Horário de silêncio" subtitle="O balcão não fala nesse período.">
        <ListItem
          icon={Moon}
          title="Silêncio fora do expediente"
          chevron={false}
          right={
            <Switch
              value={quietOn}
              onValueChange={(v) => {
                setQuietOn(v);
                saveQuiet(v);
              }}
              accessibilityLabel="Horário de silêncio"
            />
          }
        />
        {quietOn ? (
          <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Das"
                  value={quiet.start}
                  onChangeText={(v) => setQuiet({ ...quiet, start: maskTime(v) })}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Até"
                  value={quiet.end}
                  onChangeText={(v) => setQuiet({ ...quiet, end: maskTime(v) })}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>
            {error ? (
              <Text variant="bodySmall" color="danger">
                {error}
              </Text>
            ) : null}
            <Button label="Salvar horário" onPress={() => saveQuiet()} loading={saving} />
          </View>
        ) : null}
      </Section>
    </>
  );
}
