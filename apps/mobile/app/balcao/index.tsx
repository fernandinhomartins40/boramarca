import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { BalcaoScreen } from '@/features/balcao';
import { recognition } from '@/features/balcao/native';

/**
 * Store rule (Google Play / App Store): the microphone is asked only with an explanation first, and
 * Android 14+ refuses a microphone foreground service before RECORD_AUDIO is granted. Without the
 * permission, the Balcão opens the setup wizard (/balcao/configurar), which explains and asks.
 */
export default function BalcaoRoute() {
  const [mic, setMic] = useState<boolean | null>(recognition ? null : true);

  useEffect(() => {
    recognition
      ?.getMicrophonePermissionsAsync()
      .then((p) => setMic(p.granted))
      .catch(() => setMic(false));
  }, []);

  if (mic === null) return null;
  return mic ? <BalcaoScreen /> : <Redirect href="/balcao/configurar" />;
}
