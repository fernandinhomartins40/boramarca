import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Lock, Mail, Smartphone } from 'lucide-react-native';
import { Button, Header, Screen, Text, TextField } from '@/components';
import { data } from '@/data';
import { maskBrPhone, toE164 } from '@/features/auth/phone';
import { errorMessage } from '@/features/settings/format';
import { useTheme } from '@/theme';

/** "Entre com seu celular" (prompt 01, reference 01-boas-vindas, middle screen). */
export default function LoginScreen() {
  const t = useTheme();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(byEmail = false) {
    const e164 = toE164(phone);
    if (!e164) {
      setError('Confira o número: DDD + celular, como (11) 91234-5678.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (byEmail) {
        const r = await data.auth.requestEmailCode({ phone: e164 });
        return router.push({
          pathname: '/codigo',
          params: {
            phone: e164,
            via: 'email',
            masked: r.email,
            retry: String(r.retryAfterSeconds),
          },
        });
      }
      const r = await data.auth.requestOtp({ phone: e164, purpose: 'login' });
      router.push({
        pathname: '/codigo',
        params: { phone: e164, retry: String(r.retryAfterSeconds) },
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll
        footer={
          <View style={{ flex: 1, gap: t.spacing.sm }}>
            <Button
              label="Enviar código por SMS"
              size="lg"
              iconRight={ArrowRight}
              loading={sending}
              onPress={() => send()}
            />
            <Button
              label="Receber o código por e-mail"
              variant="neutral"
              icon={Mail}
              disabled={sending}
              onPress={() => send(true)}
            />
          </View>
        }
      >
        <Header onBack={() => router.back()} title=" " />
        <Text variant="display">Entre com seu celular</Text>
        <Text color="textMuted">
          Enviamos um código por SMS ou, se sua conta tem e-mail confirmado, por e-mail.
        </Text>
        <TextField
          label="Celular"
          icon={Smartphone}
          value={phone}
          onChangeText={(v) => {
            setPhone(maskBrPhone(v));
            setError(null);
          }}
          placeholder="(11) 91234-5678"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="send"
          onSubmitEditing={() => send()}
          error={error}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
          <Lock color={t.colors.textMuted} size={t.sizes.icon} />
          <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>
            Seus dados são protegidos e usados apenas para acesso à sua conta.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
