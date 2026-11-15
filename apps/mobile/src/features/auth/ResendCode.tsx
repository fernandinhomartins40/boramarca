import { useState } from 'react';
import type { OtpRequestResponse } from '@boramarca/shared';
import { Button, Text, showToast } from '@/components';
import { errorMessage } from '@/features/settings/format';
import { formatClock, useCountdown } from './useCountdown';

const nowPlus = (s: number) => Date.now() + s * 1000;

/** "Não recebeu o código? Reenviar em 00:28", then a "Reenviar código" button. */
export function ResendCode({
  initialSeconds,
  onResend,
}: {
  initialSeconds: number;
  onResend: () => Promise<OtpRequestResponse>;
}) {
  const [until, setUntil] = useState(() => nowPlus(initialSeconds));
  const [busy, setBusy] = useState(false);
  const left = useCountdown(until);

  if (left > 0)
    return (
      <Text color="textMuted" align="center" accessibilityLiveRegion="none">
        Não recebeu o código?{'\n'}Reenviar em{' '}
        <Text weight="bold" color="primaryText">
          {formatClock(left)}
        </Text>
      </Text>
    );

  return (
    <Button
      label="Reenviar código"
      variant="ghost"
      loading={busy}
      onPress={async () => {
        setBusy(true);
        try {
          const r = await onResend();
          setUntil(nowPlus(r.retryAfterSeconds));
          showToast('Código reenviado.', 'info');
        } catch (e) {
          showToast(errorMessage(e), 'danger');
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
