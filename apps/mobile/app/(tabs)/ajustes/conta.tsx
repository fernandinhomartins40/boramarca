import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  CircleQuestionMark,
  Crown,
  ExternalLink,
  FileText,
  LogOut,
  Package,
  ShieldCheck,
  UserX,
} from 'lucide-react-native';
import { PLAN_LABELS } from '@boramarca/shared';
import {
  BottomSheet,
  Button,
  ErrorState,
  Header,
  ListItem,
  Screen,
  Skeleton,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import { openSite } from '@/features/account/links';
import { signOut } from '@/features/auth/session';
import { errorMessage } from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { useLoad } from '@/features/settings/useLoad';
import { useTheme } from '@/theme';

const load = () => data.profile.getMe();

/** Conta (prompt 10 + plan section 11): plano, Kit Balcão, ajuda, termos, privacidade, sair, excluir. */
export default function AccountScreen() {
  const t = useTheme();
  const me = useLoad(load);
  const [kitOpen, setKitOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function sendKit() {
    setSending(true);
    try {
      await data.account.createKitLead({ note: note.trim() || null });
      setKitOpen(false);
      setNote('');
      showToast('Pedido enviado! A gente te chama no WhatsApp.');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen edges={['top', 'left', 'right']} scroll>
      <Header title="Conta" onBack={() => router.back()} />
      {me.loading ? (
        <Skeleton height={t.touchTarget.min * 2} radius="lg" />
      ) : me.error || !me.data ? (
        <ErrorState message={me.error ?? undefined} onRetry={me.reload} />
      ) : (
        <Section title="Plano">
          <ListItem
            icon={Crown}
            title={`Plano ${PLAN_LABELS[me.data.salon.plan]}`}
            subtitle="Ver planos e preços no site"
            right={<ExternalLink color={t.colors.textMuted} size={t.sizes.iconSm} />}
            chevron={false}
            onPress={() => openSite('plans')}
          />
          <ListItem
            icon={Package}
            title="Kit Balcão"
            subtitle="Quero o kit com celular + caixa"
            onPress={() => setKitOpen(true)}
          />
        </Section>
      )}

      <Section title="Ajuda e documentos">
        <ListItem
          icon={CircleQuestionMark}
          title="Ajuda"
          subtitle="Fale com o suporte"
          onPress={() => openSite('contact')}
        />
        <ListItem icon={FileText} title="Termos de uso" onPress={() => openSite('terms')} />
        <ListItem
          icon={ShieldCheck}
          title="Política de privacidade"
          onPress={() => openSite('privacy')}
        />
      </Section>

      <Section>
        <ListItem
          icon={LogOut}
          title="Sair"
          subtitle="Sua conta e seus dados continuam guardados"
          chevron={false}
          onPress={async () => {
            setLeaving(true);
            await signOut();
          }}
          right={leaving ? <Text color="textMuted">Saindo…</Text> : null}
        />
        <ListItem
          icon={UserX}
          title="Excluir conta"
          subtitle="Apaga sua conta e os dados dos seus clientes"
          onPress={() => router.push('/ajustes/excluir-conta')}
        />
      </Section>

      <BottomSheet
        visible={kitOpen}
        onClose={() => setKitOpen(false)}
        title="Kit Balcão"
        subtitle="Um celular e uma caixa de som prontos para o balcão. Deixe seu interesse e a gente te chama."
      >
        <View style={{ gap: t.spacing.md }}>
          <TextField
            label="Algum recado? (opcional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
          />
          <Button label="Quero o kit" loading={sending} onPress={sendKit} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
