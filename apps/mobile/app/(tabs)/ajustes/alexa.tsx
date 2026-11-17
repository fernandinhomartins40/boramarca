import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Megaphone, Speaker, Unlink } from 'lucide-react-native';
import type { AlexaSettingsPatch, AlexaSettingsResponse } from '@boramarca/shared';
import {
  BottomSheet,
  Button,
  Card,
  ErrorState,
  Header,
  ListItem,
  Screen,
  Skeleton,
  StatusPill,
  Switch,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { errorMessage } from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { useLoad } from '@/features/settings/useLoad';
import { useTheme } from '@/theme';

const load = () => data.alexa.getSettings();

/** Alexa in Ajustes: link status, Voice Monkey announcements (GET/PATCH /alexa/settings), unlink. */
export default function AlexaSettingsScreen() {
  const t = useTheme();
  const res = useLoad(load);
  return (
    <Screen edges={['top', 'left', 'right']} scroll>
      <Header title="Alexa" onBack={() => router.back()} />
      {res.loading ? (
        <Skeleton height={t.touchTarget.min * 4} radius="lg" />
      ) : res.error || !res.data ? (
        <ErrorState message={res.error ?? undefined} onRetry={res.reload} />
      ) : (
        <Content settings={res.data} onChange={res.setData} />
      )}
    </Screen>
  );
}

function Content({
  settings: s,
  onChange,
}: {
  settings: AlexaSettingsResponse;
  onChange: (s: AlexaSettingsResponse) => void;
}) {
  const t = useTheme();
  const [device, setDevice] = useState(s.voiceMonkeyDevice ?? '');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  async function save(patch: AlexaSettingsPatch, done?: string) {
    setSaving(true);
    try {
      onChange(await data.alexa.updateSettings(patch));
      if (done) showToast(done);
      return true;
    } catch (e) {
      showToast(errorMessage(e), 'danger');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAnnouncement() {
    const ok = await save(
      { voiceMonkeyDevice: device.trim() || null, ...(token.trim() ? { voiceMonkeyToken: token } : {}) },
      'Avisos da Alexa salvos.',
    );
    if (ok) setToken('');
  }

  async function unlink() {
    setUnlinking(true);
    try {
      onChange(await data.alexa.unlink());
      setConfirm(false);
      showToast('Alexa desvinculada.', 'info');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <>
      <Card variant={s.linked ? 'accentSoft' : 'default'} style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Speaker color={t.colors.text} size={t.sizes.iconLg} />
          <Text variant="heading" style={{ flex: 1 }}>
            {s.linked ? 'Conta vinculada' : 'Conta não vinculada'}
          </Text>
          <StatusPill
            status={s.linked ? 'confirmado' : 'cancelado'}
            label={s.linked ? 'Vinculada' : 'Não vinculada'}
          />
        </View>
        <Text color="textMuted">
          {s.linked
            ? 'Pergunte à Alexa pela sua agenda e responda os pedidos por voz.'
            : 'Para vincular, abra o app Alexa, ative a skill Bora Marca e entre com o seu número de celular.'}
        </Text>
      </Card>

      <Section
        title="Avisos na Alexa"
        subtitle="A Alexa avisa em voz alta quando chega um pedido para você decidir. Usa a sua conta do Voice Monkey."
      >
        <ListItem
          icon={Megaphone}
          title="Avisar pela Alexa"
          chevron={false}
          right={
            <Switch
              value={s.voiceMonkeyEnabled}
              disabled={saving}
              onValueChange={(v) => void save({ voiceMonkeyEnabled: v })}
              accessibilityLabel="Avisar pela Alexa"
            />
          }
        />
        <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
          <TextField
            label="Nome do aparelho no Voice Monkey"
            value={device}
            onChangeText={setDevice}
            placeholder="Ex.: echo-balcao"
            autoCapitalize="none"
            maxLength={100}
          />
          <TextField
            label="Token do Voice Monkey"
            value={token}
            onChangeText={setToken}
            placeholder={s.voiceMonkeyTokenSet ? 'Já salvo. Digite para trocar.' : 'Cole o token aqui'}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={500}
          />
          <Button label="Salvar avisos" onPress={saveAnnouncement} loading={saving} />
          {s.voiceMonkeyTokenSet ? (
            <Button
              label="Apagar o token salvo"
              variant="ghost"
              onPress={() => void save({ voiceMonkeyToken: null }, 'Token apagado.')}
            />
          ) : null}
        </View>
      </Section>

      {s.linked ? (
        <Button
          label="Desvincular a Alexa"
          variant="neutral"
          icon={Unlink}
          onPress={() => setConfirm(true)}
        />
      ) : null}

      <BottomSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Desvincular a Alexa?"
        subtitle="A Alexa para de ler sua agenda e de responder pedidos até você vincular de novo pelo app Alexa."
      >
        <Button label="Desvincular" variant="danger" loading={unlinking} onPress={unlink} />
        <Button label="Cancelar" variant="neutral" onPress={() => setConfirm(false)} />
      </BottomSheet>
    </>
  );
}
