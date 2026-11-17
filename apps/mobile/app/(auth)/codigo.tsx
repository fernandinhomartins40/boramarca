import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import type { Profession } from '@boramarca/shared';
import { Button, Header, Screen, Text } from '@/components';
import { data } from '@/data';
import { CodeInput } from '@/features/auth/CodeInput';
import { formatPhone } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';
import { useSignUpDraft } from '@/features/auth/signup';
import { ResendCode } from '@/features/auth/ResendCode';
import { errorMessage } from '@/features/settings/format';
import { useTheme } from '@/theme';

type Params = Partial<
  Record<
    'phone' | 'retry' | 'via' | 'masked' | 'email' | 'name' | 'salonName' | 'profession',
    string
  >
>;

/**
 * "Confirme seu número": 6-digit code (prompt 01). Mock code: 123456. `via`: `sms` (default),
 * `email` (login code to the confirmed e-mail) or `signup` (free sign-up, code by e-mail).
 */
export default function CodeScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<Params>();
  const phone = params.phone ?? '';
  const via = params.via ?? 'sms';
  const signupBody = () => ({
    name: params.name ?? '',
    salonName: params.salonName ?? '',
    profession: params.profession as Profession,
    phone,
    email: params.email ?? '',
  });
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
      const res =
        via === 'signup'
          ? await data.auth.verifySignup({ email: params.email ?? '', code: value })
          : via === 'email'
            ? await data.auth.verifyEmailCode({ phone, code: value })
            : await data.auth.verifyOtp({ phone, code: value });
      // Free sign-up: the quick sign-up starts with name, business and profession filled in.
      if (via === 'signup')
        useSignUpDraft.getState().patch({
          name: params.name ?? '',
          salonName: params.salonName ?? '',
          professions: [params.profession as Profession],
          step: 1,
        });
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
        <Text variant="display">
          {via === 'sms' ? 'Confirme seu número' : 'Confira seu e-mail'}
        </Text>
        {via === 'sms' ? (
          <Text color="textMuted">
            Digite o código de 6 dígitos que enviamos por SMS para{' '}
            <Text weight="bold">{formatPhone(phone)}</Text>.
          </Text>
        ) : (
          <Text color="textMuted">
            {via === 'email' ? 'Se este celular tem um e-mail confirmado, enviamos' : 'Enviamos'} um
            código de 6 dígitos para <Text weight="bold">{params.masked}</Text>. Confira também o
            spam.
          </Text>
        )}
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
            onResend={() =>
              via === 'signup'
                ? data.auth.requestSignup(signupBody())
                : via === 'email'
                  ? data.auth.requestEmailCode({ phone })
                  : data.auth.requestOtp({ phone, purpose: 'login' })
            }
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
