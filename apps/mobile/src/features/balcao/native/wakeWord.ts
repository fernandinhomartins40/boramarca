import type { WakeWordEngine } from '../engines';

/** The part of Porcupine's PorcupineManager used here (injected so tests need no native code). */
export interface WakeWordManager {
  start(): Promise<void>;
  stop(): Promise<void>;
}
export type CreateWakeWordManager = (onDetect: () => void) => Promise<WakeWordManager>;

/** Default sensitivity: lower = fewer false wakes ("bora marcar pra semana que vem?"). */
export const WAKE_SENSITIVITY = 0.5;

/**
 * "Ei, Bora Marca" with Picovoice Porcupine. If the engine cannot start (bad AccessKey, missing
 * .ppn, no microphone) it never throws: it turns `simulated` on, so the screen shows "Falar".
 */
export class PorcupineWakeWord implements WakeWordEngine {
  private manager: WakeWordManager | null = null;
  private onWake: (() => void) | null = null;
  private failed = false;

  constructor(
    private readonly create: CreateWakeWordManager,
    private readonly onError: (e: unknown) => void = () => undefined,
  ) {}

  get simulated() {
    return this.failed;
  }

  async start(onWake: () => void) {
    this.onWake = onWake;
    if (this.failed) return;
    try {
      this.manager ??= await this.create(() => this.onWake?.());
      await this.manager.start();
    } catch (e) {
      this.failed = true;
      this.onError(e);
    }
  }

  async stop() {
    this.onWake = null;
    await this.manager?.stop().catch(() => undefined);
  }
}

/**
 * Wraps the wake word engine so the microphone can be handed over: Android lets only one
 * recorder capture at a time, so speech recognition (and "Pausar") `hold()` it and `release()`
 * it afterwards. `started` = the Balcão controller is running (Modo Balcão screen open).
 */
export class HoldableWakeWord implements WakeWordEngine {
  started = false;
  private onWake: (() => void) | null = null;
  private holds = 0;
  private on = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly inner: WakeWordEngine) {}

  get simulated() {
    return this.inner.simulated;
  }

  start(onWake: () => void) {
    this.onWake = onWake;
    this.started = true;
    return this.sync();
  }

  stop() {
    this.onWake = null;
    this.started = false;
    return this.sync();
  }

  hold() {
    this.holds++;
    return this.sync();
  }

  release() {
    this.holds = Math.max(0, this.holds - 1);
    return this.sync();
  }

  /** Applies the wanted state in order, so fast hold/release pairs never interleave. */
  private sync() {
    this.queue = this.queue
      .then(async () => {
        const want = this.onWake !== null && this.holds === 0;
        if (want === this.on) return;
        if (want) await this.inner.start(() => this.onWake?.());
        else await this.inner.stop();
        this.on = want;
      })
      .catch(() => undefined);
    return this.queue;
  }
}

/**
 * Text fallback for the setup test when there is no Porcupine: true only for "Ei, Bora Marca"
 * (with the "Ei"), never for everyday "bora marcar…" phrases.
 */
export function isWakePhrase(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ');
  return /\b(ei|hey|oi|e)\s+bora\s+marca\b/.test(t.replace(/\s+/g, ' '));
}
