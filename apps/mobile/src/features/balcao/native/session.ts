import type { VoiceSummaryMoment, VoiceSummaryResponse } from '@boramarca/shared';
import type { ToastTone } from '@/components/Toast';
import type { AudioRoute, ServiceChange } from '../../../../modules/balcao-service';

/** The Android foreground service (modules/balcao-service); null on iOS. */
export interface ServiceModule {
  start(title: string, text: string, pauseLabel: string): void;
  stop(): void;
  isRunning(): boolean;
}

export interface SessionDeps {
  service: ServiceModule | null;
  /** Wake word with hold/release (HoldableWakeWord); `started` = Modo Balcão screen open. */
  wake: { started: boolean; hold(): Promise<void>; release(): Promise<void> } | null;
  summary(moment: VoiceSummaryMoment): Promise<VoiceSummaryResponse>;
  /** Chime + speech. */
  say(text: string): Promise<void>;
  setActive(active: boolean): void;
  notify(message: string, tone: ToastTone): void;
  isForeground(): boolean;
}

export interface BalcaoSession {
  /** "Iniciar o balcão": starts the service (Android) and speaks the day's summary. */
  open(): Promise<void>;
  /** "Encerrar o balcão": stops the service and speaks the closing summary. */
  close(): Promise<void>;
  readonly running: boolean;
  /** Wire these to the store, the service events, AppState and the audio route events. */
  onActiveChange(active: boolean, prev: boolean): void;
  onServiceChange(e: ServiceChange): void;
  onForeground(): void;
  onRouteChange(route: AudioRoute): void;
}

export const SERVICE_TITLE = 'Bora Marca está ouvindo';
export const SERVICE_TEXT = 'Diga "Ei, Bora Marca". Toque para abrir.';
export const SERVICE_PAUSE = 'Pausar';
export const SPEAKER_LOST = 'A caixa desconectou. Vou falar pelo celular.';

/**
 * Ties the Android microphone service to Modo Balcão. The service follows the screen: opening the
 * Balcão (store `active` true, app in the foreground, as Android 14+ requires) starts it, leaving it
 * ends it with the closing summary. "Pausar" in the notification stops it and frees the microphone
 * until the app comes back to the foreground.
 */
export function createBalcaoSession(deps: SessionDeps): BalcaoSession {
  let running = deps.service?.isRunning() ?? false;
  let paused = false;
  let bluetooth: boolean | null = null;

  const startService = () => {
    if (!deps.service || running) return;
    deps.service.start(SERVICE_TITLE, SERVICE_TEXT, SERVICE_PAUSE);
    running = true;
  };
  const stopService = () => {
    if (!deps.service || !running) return;
    running = false;
    deps.service.stop();
  };
  const speakSummary = async (moment: VoiceSummaryMoment) => {
    const res = await deps.summary(moment).catch(() => null);
    if (res?.speech) await deps.say(res.speech).catch(() => undefined);
  };

  const session: BalcaoSession = {
    get running() {
      return running;
    },
    async open() {
      paused = false;
      startService();
      deps.setActive(true);
      await speakSummary('open');
    },
    async close() {
      stopService();
      deps.setActive(false);
      await speakSummary('close');
    },
    onActiveChange(active, prev) {
      if (active && !prev && !running && !paused && deps.isForeground()) {
        try {
          startService();
        } catch {
          deps.notify('Não deu para ouvir com a tela bloqueada. Abra o balcão de novo.', 'danger');
        }
      } else if (!active && prev && running) {
        void session.close();
      }
    },
    onServiceChange(e) {
      running = e.running;
      if (e.running || e.reason !== 'paused') return;
      paused = true;
      void deps.wake?.hold();
      deps.setActive(false);
    },
    onForeground() {
      if (!paused) return;
      paused = false;
      void deps.wake?.release();
      if (!deps.wake?.started) return;
      try {
        startService();
        deps.setActive(true);
      } catch {
        // stays without the service: the Balcão still works with the screen on
      }
    },
    onRouteChange(route) {
      const was = bluetooth;
      bluetooth = route.bluetooth;
      if (was === null || was === route.bluetooth) return;
      if (!running && !deps.wake?.started) return;
      // Android already moved the audio to the phone speaker; tell the professional
      if (!route.bluetooth) {
        deps.notify(SPEAKER_LOST, 'danger');
        void deps.say(SPEAKER_LOST).catch(() => undefined);
      } else {
        deps.notify(route.name ? `${route.name} conectada de novo.` : 'Caixa conectada de novo.', 'success');
      }
    },
  };
  return session;
}
