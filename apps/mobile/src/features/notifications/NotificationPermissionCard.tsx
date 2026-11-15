import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { BellRing } from 'lucide-react-native';
import { Button, Card, Text } from '@/components';
import { useTheme } from '@/theme';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from './decisionNotifications';

// "Agora não" lasts until the app restarts.
let dismissedThisSession = false;

/**
 * Explains the notification before the system prompt (asked only here, when the professional is
 * looking at decisions). Hidden once granted.
 */
export function NotificationPermissionCard() {
  const t = useTheme();
  const [status, setStatus] = useState<NotificationPermission | null>(null);
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let alive = true;
    getNotificationPermission()
      .then((s) => alive && setStatus(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!status || status === 'granted' || dismissed) return null;

  async function ask() {
    setAsking(true);
    try {
      setStatus(await requestNotificationPermission());
    } catch {
      setStatus('denied');
    } finally {
      setAsking(false);
    }
  }

  function later() {
    dismissedThisSession = true;
    setDismissed(true);
  }

  return (
    <Card variant="alt" style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' }}>
        <BellRing color={t.colors.primaryText} size={t.sizes.icon} />
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          <Text weight="bold">Responder pela notificação</Text>
          <Text variant="bodySmall" color="textMuted">
            {status === 'denied'
              ? 'As notificações estão desligadas. Ligue nas configurações do celular para responder Sim ou Não sem abrir o app.'
              : 'Quando a IA precisar de você, o celular avisa e você responde Sim ou Não ali mesmo, sem abrir o app.'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <Button
          label="Agora não"
          variant="ghost"
          onPress={later}
          style={{ flex: 1 }}
          accessibilityLabel="Agora não"
        />
        {status === 'denied' ? (
          <Button
            label="Abrir configurações"
            onPress={() => void Linking.openSettings()}
            style={{ flex: 1 }}
          />
        ) : (
          <Button label="Ativar" onPress={ask} loading={asking} style={{ flex: 1 }} />
        )}
      </View>
    </Card>
  );
}
