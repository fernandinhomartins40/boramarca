import { useState } from 'react';
import { View } from 'react-native';
import { Mail } from 'lucide-react-native';
import { emailState, type MeResponse } from '@boramarca/shared';
import { Button, StatusPill, Text, TextField, showToast } from '@/components';
import { data } from '@/data';
import { errorMessage } from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { useTheme } from '@/theme';

/** Ajustes → Conta: optional e-mail, "Confirmado" / "Aguardando confirmação" + "Reenviar". */
export function EmailSection({
  me,
  onChange,
}: {
  me: MeResponse;
  onChange: (me: MeResponse) => void;
}) {
  const t = useTheme();
  const current = me.professional.email ?? '';
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState<'save' | 'resend' | null>(null);
  const state = emailState(me.professional);
  const next = value.trim().toLowerCase();

  async function save() {
    setBusy('save');
    try {
      const updated = await data.profile.updateMe({ email: next || null });
      onChange(updated);
      setValue(updated.professional.email ?? '');
      showToast(next ? 'Enviamos um link para confirmar seu e-mail.' : 'E-mail removido.');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setBusy('resend');
    try {
      await data.profile.resendEmailConfirmation();
      showToast('Link reenviado. Confira sua caixa de entrada.');
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="E-mail" subtitle="Opcional. Só para avisos da conta e comprovantes.">
      <View style={{ paddingHorizontal: t.spacing.md, gap: t.spacing.md }}>
        <TextField
          label="Seu e-mail"
          icon={Mail}
          value={value}
          onChangeText={setValue}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          maxLength={254}
          placeholder="voce@exemplo.com"
        />
        {state === 'verified' && next === current ? (
          <StatusPill status="confirmado" />
        ) : state === 'pending' && next === current ? (
          <View style={{ gap: t.spacing.sm }}>
            <StatusPill status="pendente" label="Aguardando confirmação" />
            <Text variant="bodySmall" color="textMuted">
              Abra o link que enviamos para {current}. Ele vale por 24 horas.
            </Text>
            <Button
              label="Reenviar link"
              variant="secondary"
              loading={busy === 'resend'}
              disabled={busy !== null}
              onPress={resend}
            />
          </View>
        ) : null}
        {next !== current ? (
          <Button
            label={next ? 'Salvar e-mail' : 'Remover e-mail'}
            loading={busy === 'save'}
            disabled={busy !== null}
            onPress={save}
          />
        ) : null}
      </View>
    </Section>
  );
}
