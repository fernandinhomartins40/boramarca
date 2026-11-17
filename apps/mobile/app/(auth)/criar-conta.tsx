import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Mail, Smartphone, Store, User } from 'lucide-react-native';
import {
  PROFESSIONS,
  PROFESSION_LABELS,
  SignupRequestBody,
  TRIAL_DAYS,
  type Profession,
} from '@boramarca/shared';
import { Button, Chip, Header, Screen, Text, TextField } from '@/components';
import { data } from '@/data';
import { maskBrPhone, toE164 } from '@/features/auth/phone';
import { errorMessage } from '@/features/settings/format';
import { useTheme } from '@/theme';

/** "Criar conta grátis": the code goes by e-mail, so it works without SMS (docs/COBRANCA.md). */
export default function CreateAccountScreen() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [profession, setProfession] = useState<Profession | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    const parsed = SignupRequestBody.safeParse({
      name,
      salonName,
      profession,
      phone: toE164(phone) ?? phone,
      email,
    });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      if (e.profession) e.profession = 'Escolha sua profissão.';
      return setErrors(e);
    }
    setErrors({});
    setError(null);
    setSending(true);
    try {
      const r = await data.auth.requestSignup(parsed.data);
      router.push({
        pathname: '/codigo',
        params: {
          via: 'signup',
          masked: r.email,
          retry: String(r.retryAfterSeconds),
          ...parsed.data,
        },
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
          <Button
            label="Receber código por e-mail"
            size="lg"
            iconRight={ArrowRight}
            loading={sending}
            onPress={send}
            style={{ flex: 1 }}
          />
        }
      >
        <Header onBack={() => router.back()} title=" " />
        <Text variant="display">Criar conta grátis</Text>
        <Text color="textMuted">
          {TRIAL_DAYS} dias para testar tudo, sem cartão. Enviamos um código para o seu e-mail.
        </Text>
        <TextField
          label="Seu nome"
          icon={User}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          error={errors.name}
        />
        <TextField
          label="Nome do seu negócio"
          icon={Store}
          value={salonName}
          onChangeText={setSalonName}
          error={errors.salonName}
        />
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="bodySmall" weight="semibold">
            Profissão
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {PROFESSIONS.map((p) => (
              <Chip
                key={p}
                label={PROFESSION_LABELS[p]}
                selected={profession === p}
                onPress={() => setProfession(p)}
              />
            ))}
          </View>
          {errors.profession ? (
            <Text variant="bodySmall" color="danger">
              {errors.profession}
            </Text>
          ) : null}
        </View>
        <TextField
          label="Celular (WhatsApp)"
          icon={Smartphone}
          value={phone}
          onChangeText={(v) => setPhone(maskBrPhone(v))}
          placeholder="(11) 91234-5678"
          keyboardType="phone-pad"
          autoComplete="tel"
          error={errors.phone}
        />
        <TextField
          label="E-mail"
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={errors.email ?? error}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
