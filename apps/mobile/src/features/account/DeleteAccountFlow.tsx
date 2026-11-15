import { useState } from 'react';
import { View } from 'react-native';
import { Check, ExternalLink, Trash, X } from 'lucide-react-native';
import { OWNER_HAS_TEAM_ERROR } from '@boramarca/shared';
import { Banner, Button, Card, Checkbox, Text, showToast } from '@/components';
import { data, DataError } from '@/data';
import { CodeInput } from '@/features/auth/CodeInput';
import { formatPhone } from '@/features/auth/phone';
import { ResendCode } from '@/features/auth/ResendCode';
import { useSession } from '@/features/auth/session';
import { useSignUpDraft } from '@/features/auth/signup';
import { errorMessage } from '@/features/settings/format';
import { useTheme } from '@/theme';
import { openSite } from './links';

export const DELETED_ITEMS = [
  'Seu perfil, serviços, horários e folgas',
  'Sua agenda, seus clientes e a lista de espera',
  'As conversas e mensagens do WhatsApp guardadas aqui',
  'As decisões da IA e o histórico',
  'A conexão com o WhatsApp (o aparelho conectado é removido)',
] as const;

/**
 * Excluir conta (plan section 11, Apple 5.1.1(v) and Google Play): explains what is erased,
 * confirms with a fresh code sent to the account phone, calls `DELETE /me`, then leaves to
 * Boas-vindas (the root guard does that when the session is cleared).
 */
export function DeleteAccountFlow() {
  const t = useTheme();
  const phone = useSession((s) => s.phone);
  const [step, setStep] = useState<'explain' | 'code'>('explain');
  const [code, setCode] = useState('');
  const [retry, setRetry] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [ownerHasTeam, setOwnerHasTeam] = useState(false);
  const [wholeSalon, setWholeSalon] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestCode = () => data.auth.requestOtp({ phone: phone ?? '', purpose: 'delete_account' });

  async function sendCode() {
    if (!phone) return setError('Entre de novo na sua conta para excluir.');
    setBusy(true);
    setError(null);
    try {
      const r = await requestCode();
      setRetry(r.retryAfterSeconds);
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (code.length !== 6) return setError('Digite os 6 números do código.');
    setBusy(true);
    setError(null);
    try {
      await data.account.deleteMe({
        code,
        origin: 'app',
        ...(ownerHasTeam && wholeSalon ? { deleteWholeSalon: true } : {}),
      });
      useSignUpDraft.getState().reset();
      useSession.getState().clear();
      showToast('Sua conta foi excluída. Seus dados foram apagados.');
    } catch (e) {
      if (e instanceof DataError && e.code === OWNER_HAS_TEAM_ERROR) setOwnerHasTeam(true);
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (step === 'explain')
    return (
      <View style={{ gap: t.spacing.md }}>
        <Text variant="title">Excluir sua conta</Text>
        <Text color="textMuted">
          Isso apaga de vez, na hora, e não dá para desfazer. Vamos apagar:
        </Text>
        <Card variant="alt" style={{ gap: t.spacing.sm }}>
          {DELETED_ITEMS.map((item) => (
            <View key={item} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <X color={t.colors.danger} size={t.sizes.iconSm} />
              <Text style={{ flex: 1 }}>{item}</Text>
            </View>
          ))}
        </Card>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <Check color={t.colors.textMuted} size={t.sizes.iconSm} />
          <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>
            Fica só um registro de que a conta foi excluída, sem seus dados pessoais, para provar
            que atendemos o pedido. Se o plano é pago, cancele a cobrança antes.
          </Text>
        </View>
        <Text>
          Para confirmar, vamos mandar um código por SMS para{' '}
          <Text weight="bold">{formatPhone(phone)}</Text>.
        </Text>
        {error ? <Banner tone="danger" message={error} /> : null}
        <Button
          label="Enviar código"
          variant="danger"
          size="lg"
          loading={busy}
          onPress={sendCode}
        />
        <Button
          label="Também dá para pedir pelo site"
          variant="ghost"
          iconRight={ExternalLink}
          onPress={() => openSite('deleteAccount')}
        />
      </View>
    );

  return (
    <View style={{ gap: t.spacing.md }}>
      <Text variant="title">Confirme a exclusão</Text>
      <Text color="textMuted">
        Digite o código de 6 dígitos que enviamos por SMS para{' '}
        <Text weight="bold">{formatPhone(phone)}</Text>.
      </Text>
      <CodeInput
        value={code}
        autoFocus
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
      />
      <View style={{ alignItems: 'center' }}>
        <ResendCode initialSeconds={retry} onResend={requestCode} />
      </View>
      {ownerHasTeam ? (
        <Card variant="alt" style={{ gap: t.spacing.sm }}>
          <Text>
            Você é dono de um espaço com outros profissionais. Para passar o espaço para outra
            pessoa, use o painel no site. Ou exclua tudo:
          </Text>
          <Checkbox
            label="Excluir também o espaço inteiro e as contas da equipe"
            checked={wholeSalon}
            onChange={setWholeSalon}
          />
        </Card>
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button
        label="Excluir minha conta"
        variant="danger"
        size="lg"
        icon={Trash}
        loading={busy}
        disabled={ownerHasTeam && !wholeSalon}
        onPress={confirmDelete}
      />
    </View>
  );
}
