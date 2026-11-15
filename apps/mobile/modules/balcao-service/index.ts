import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export interface AudioRoute {
  /** A Bluetooth speaker (A2DP or LE audio) is connected as an output. */
  bluetooth: boolean;
  name: string | null;
}

export interface ServiceChange {
  running: boolean;
  /** started | stopped | paused (the notification's "Pausar" action). */
  reason: 'started' | 'stopped' | 'paused';
}

interface BalcaoServiceNative {
  start(title: string, text: string, pauseLabel: string): void;
  stop(): void;
  isRunning(): boolean;
  getMediaVolume(): number | null;
  getAudioRoute(): AudioRoute;
  getKeepSpeakerAwake(): boolean;
  setKeepSpeakerAwake(enabled: boolean): void;
  addListener(event: 'onServiceChange', fn: (e: ServiceChange) => void): EventSubscription;
  addListener(event: 'onAudioRouteChange', fn: (e: AudioRoute) => void): EventSubscription;
}

/**
 * Local Expo module (Android only; see plugins/withBalcaoService.cjs for the manifest entries).
 * null on iOS, on web, under Jest and in builds made before the module existed.
 */
export const BalcaoService = requireOptionalNativeModule<BalcaoServiceNative>('BoraMarcaBalcao');
