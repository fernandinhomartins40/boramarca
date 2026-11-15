import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle, RefreshCw, ShieldCheck, Unplug } from 'lucide-react-native';
import { SEND_GUARD_DEFAULTS, type WhatsAppStatus } from '@boramarca/shared';
import {
  BottomSheet,
  Button,
  Card,
  Header,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  showToast,
} from '@/components';
import { data } from '@/data';
import { formatPhone } from '@/features/auth/phone';
import { errorMessage } from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { refreshWhatsAppStatus, useWhatsAppStore } from '@/features/whatsapp/store';
import { useTheme } from '@/theme';

const STATUS_TEXT: Record<WhatsAppStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando',
  waiting_qr: 'Esperando o pareamento',
  disconnected: 'Desconectado',
  error: 'Com erro',
};

/** WhatsApp in Ajustes (prompt 10): status, number, reconnect, disconnect, safety limits. */
export default function WhatsAppSettingsScreen() {
  const t = useTheme();
  const status = useWhatsAppStore((s) => s.status);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    refreshWhatsAppStatus().then(() => setFailed(!useWhatsAppStore.getState().status));
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      await data.whatsapp.disconnect();
      await refreshWhatsAppStatus();
      setConfirm(false);
      showToast('WhatsApp desconectado.', 'info');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.status === 'connected';

  return (
    <Screen edges={['top', 'left', 'right']} scroll>
      <Header title="WhatsApp" onBack={() => router.back()} />
      {!status ? (
        failed ? (
          <Card variant="alt">
            <Text>Não deu para ver o status agora.</Text>
            <Button
              label="Tentar de novo"
              variant="secondary"
              onPress={() =>
                refreshWhatsAppStatus().then(() => setFailed(!useWhatsAppStore.getState().status))
              }
            />
          </Card>
        ) : (
          <LoadingState label="Vendo a conexão…" />
        )
      ) : (
        <Card variant={connected ? 'accentSoft' : 'default'} style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <MessageCircle color={t.colors.text} size={t.sizes.iconLg} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">
                {connected ? formatPhone(status.phone) : 'Sem número conectado'}
              </Text>
              {status.profileName ? <Text color="textMuted">{status.profileName}</Text> : null}
            </View>
            <StatusPill
              status={
                connected ? 'confirmado' : status.status === 'connecting' ? 'pendente' : 'cancelado'
              }
              label={STATUS_TEXT[status.status]}
            />
          </View>
          {status.errorMessage ? <Text color="danger">{status.errorMessage}</Text> : null}
        </Card>
      )}
      <Button
        label={connected ? 'Reconectar' : 'Conectar'}
        icon={RefreshCw}
        onPress={() => router.push('/whatsapp')}
      />
      {connected ? (
        <Button
          label="Desconectar"
          variant="neutral"
          icon={Unplug}
          onPress={() => setConfirm(true)}
        />
      ) : null}

      <Section title="Limites de segurança">
        <View style={{ flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.sm }}>
          <ShieldCheck color={t.colors.primaryText} size={t.sizes.icon} />
          <Text style={{ flex: 1 }}>
            Respondemos só quem te mandou mensagem · Máx. {SEND_GUARD_DEFAULTS.perMinute} mensagens
            por minuto · Nenhum envio em massa
          </Text>
        </View>
      </Section>

      <BottomSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Desconectar o WhatsApp?"
        subtitle="A IA para de responder seus clientes até você conectar de novo."
      >
        <Button label="Desconectar" variant="danger" loading={busy} onPress={disconnect} />
        <Button label="Cancelar" variant="neutral" onPress={() => setConfirm(false)} />
      </BottomSheet>
    </Screen>
  );
}
