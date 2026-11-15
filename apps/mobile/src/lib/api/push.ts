import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { Device as RegisteredDevice } from '@boramarca/shared';
import { data, dataSource } from '@/data';
import { useSession } from '@/features/auth/session';
import { getNotificationPermission } from '@/features/notifications';

/**
 * Sends this phone's Expo push token to `POST /devices` (decisions with Sim/Não arrive by push).
 * Never asks for the permission (NotificationPermissionCard does that): only registers when it is
 * already granted. Docs checked on 15/11/2026 (expo-notifications 58.1, getExpoPushTokenAsync):
 * needs a physical device and the EAS `projectId`; the call reaches Expo's servers, so it can fail
 * offline — every failure is swallowed and retried on the next foreground.
 * Without `extra.eas.projectId` (no `eas init` yet) nothing is registered: docs/pendencias/D1.md.
 */
export async function registerPushDevice(): Promise<RegisteredDevice | null> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (!Device.isDevice) return null;
  if ((await getNotificationPermission()) !== 'granted') return null;
  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data.devices.register({ pushToken, platform: Platform.OS });
}

/** Mounted once in app/_layout.tsx: registers after login and, until it works, on each foreground. */
export function usePushRegistration() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  useEffect(() => {
    if (!signedIn || dataSource !== 'api') return;
    let done = false;
    const attempt = () => {
      if (done) return;
      registerPushDevice()
        .then((d) => {
          done = !!d;
        })
        .catch(() => undefined);
    };
    attempt();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && attempt());
    return () => sub.remove();
  }, [signedIn]);
}
