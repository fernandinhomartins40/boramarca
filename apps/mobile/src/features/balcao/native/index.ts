// Native voice of Modo Balcão (prompt 08, plan section 11). Owner: agent D2.
// Imported once by app/_layout.tsx: plugs the real engines in with setBalcaoEngines and wires the
// Android microphone service (modules/balcao-service) to useBalcaoStore.
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { showToast } from '@/components/Toast';
import { data } from '@/data';
import { BalcaoService } from '../../../../modules/balcao-service';
import { getBalcaoEngines, setBalcaoEngines, simulated, type WakeWordEngine } from '../engines';
import { useBalcaoStore } from '../store';
import { createBalcaoSession, type BalcaoSession } from './session';
import { NativeSpeechToText, type RecognitionModule } from './speechToText';
import { HoldableWakeWord, PorcupineWakeWord, WAKE_SENSITIVITY } from './wakeWord';

export { isWakePhrase } from './wakeWord';
export type { BalcaoSession } from './session';

const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

/** Picovoice AccessKey (.env.example). Empty = simulated wake word and the "Falar" button. */
const ACCESS_KEY = process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY ?? '';

interface WakeWordFiles {
  keyword: string;
  model: string;
}

/** Written by plugins/withWakeWord.cjs when the .ppn/.pv files were bundled for this platform. */
function wakeWordFiles(): WakeWordFiles | null {
  const all = Constants.expoConfig?.extra?.wakeWord as Record<string, WakeWordFiles | false> | undefined;
  const files = all?.[Platform.OS];
  return files && typeof files === 'object' ? files : null;
}

/** expo-speech-recognition, loaded only on a device (its native module is absent under Jest). */
export const recognition: RecognitionModule | null = (() => {
  if (!isNative) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, device only
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule as RecognitionModule;
  } catch {
    return null;
  }
})();

function createWakeWord(): WakeWordEngine {
  const files = wakeWordFiles();
  if (!isNative || !ACCESS_KEY || !files) return simulated.wakeWord;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, device only
  const { PorcupineManager } = require('@picovoice/porcupine-react-native');
  return new PorcupineWakeWord(
    (onDetect) =>
      PorcupineManager.fromKeywordPaths(
        ACCESS_KEY,
        [files.keyword],
        () => onDetect(),
        undefined,
        files.model,
        undefined,
        [WAKE_SENSITIVITY],
      ),
    (e) => console.warn('[balcao] Porcupine não iniciou; usando o botão Falar.', e),
  );
}

/** Wake word in use (Porcupine or the simulated one), with microphone hand-over. */
export const wakeWord = new HoldableWakeWord(createWakeWord());

/** True when Porcupine is configured (key + files) and has not failed. */
export const hasRealWakeWord = () => !wakeWord.simulated;

const androidService = Platform.OS === 'android' ? BalcaoService : null;

async function say(text: string) {
  const engines = getBalcaoEngines();
  await engines.chime();
  await engines.textToSpeech.speak(text);
}

function setup(): BalcaoSession {
  if (isNative) {
    setBalcaoEngines({
      wakeWord,
      ...(recognition ? { speechToText: new NativeSpeechToText(recognition, wakeWord) } : {}),
      // shortcut: media volume only on Android (iOS has no module yet); null keeps the warning off
      ...(androidService ? { volume: { getVolume: async () => androidService.getMediaVolume() } } : {}),
    });
  }

  const session = createBalcaoSession({
    service: androidService,
    wake: wakeWord,
    summary: (moment) => data.voice.summary(moment),
    say,
    setActive: (active) => useBalcaoStore.setState({ active }),
    notify: showToast,
    isForeground: () => AppState.currentState === 'active',
  });

  if (!isNative) return session;
  useBalcaoStore.subscribe((s, prev) => {
    if (s.active !== prev.active) session.onActiveChange(s.active, prev.active);
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') session.onForeground();
  });
  if (androidService) {
    androidService.addListener('onServiceChange', session.onServiceChange);
    androidService.addListener('onAudioRouteChange', session.onRouteChange);
    session.onRouteChange(androidService.getAudioRoute());
  }
  return session;
}

/** "Iniciar o balcão" / "Encerrar o balcão" (open/close) and the service state. */
export const balcaoSession = setup();

/** Bluetooth speaker currently connected (Android), or null. */
export const currentSpeaker = (): string | null => {
  const route = androidService?.getAudioRoute();
  return route?.bluetooth ? (route.name ?? 'Caixa Bluetooth') : null;
};

/** "Manter a caixa acordada": near-silent tone every 4 min while the service runs (Android). */
export const keepSpeakerAwake = {
  available: androidService !== null,
  get: () => androidService?.getKeepSpeakerAwake() ?? false,
  set: (enabled: boolean) => androidService?.setKeepSpeakerAwake(enabled),
};

/** Speaks with the chime first (setup test). */
export const speak = say;
