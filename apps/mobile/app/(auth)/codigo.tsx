import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Button, Header, Screen, Text } from '@/components';
import { data } from '@/data';
import { CodeInput } from '@/features/auth/CodeInput';
import { formatPhone } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';
import { ResendCode } from '@/features/auth/ResendCode';
import { errorMessage } from '@/features/settings/format';
import { useTheme } from '@/theme';

/** "Confirme seu número": 6-digit code with SMS autofill (prompt 01). Mock code: 123456. */
export default function CodeScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ phone?: string; retry?: string }>();
  const phone = params.phone ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(value = code) {
    if (value.length !== 6) {
      setError('Digite os 6 números do código.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await data.auth.verifyOtp({ phone, code: value });
      // The root guard takes it from here: new users → cadastro, others → agenda.
      useSession.getState().signIn(phone, res);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <Header onBack={() => router.back()} title=" " />
        <Text variant="display">Confirme seu número</Text>
        <Text color="textMuted">
          Digite o código de 6 dígitos que enviamos por SMS para{' '}
          <Text weight="bold">{formatPhone(phone)}</Text>.
        </Text>
        <CodeInput
          value={code}
          autoFocus
          error={error}
          onChange={(v) => {
            setCode(v);
            setError(null);
            if (v.length === 6) confirm(v);
          }}
        />
        <View style={{ alignItems: 'center' }}>
          <ResendCode
            initialSeconds={Number(params.retry ?? 30)}
            onResend={() => data.auth.requestOtp({ phone, purpose: 'login' })}
          />
        </View>
        <Button
          label="Confirmar"
          size="lg"
          iconRight={Check}
          loading={busy}
          onPress={() => confirm()}
          style={{ marginTop: t.spacing.sm }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
