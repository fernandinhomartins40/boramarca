import * as Speech from 'expo-speech';

/**
 * Voice engines of Modo Balcão (plan section 11). The defaults here are simulated (wake word,
 * recognition, volume) plus real speech through expo-speech. Wave 4 plugs the native ones from
 * src/features/balcao/native with `setBalcaoEngines({ wakeWord, speechToText, volume })`, called
 * once at startup (e.g. from native/index.ts imported by app/_layout.tsx). Only the parts passed
 * are replaced.
 */
export interface WakeWordEngine {
  /** true = no real detector: the screen shows the "Falar" button instead (plan section 11). */
  readonly simulated: boolean;
  start(onWake: () => void): Promise<void>;
  stop(): Promise<void>;
}

export interface SpeechToTextHandlers {
  onPartial(text: string): void;
  onResult(text: string): void;
}

export interface SpeechToText {
  /** Resolves once the microphone is listening; one final `onResult` per start. */
  start(handlers: SpeechToTextHandlers): Promise<void>;
  stop(): Promise<void>;
}

export interface TextToSpeech {
  /** Resolves when the speech finishes or is stopped. `onBoundary` gets the current word index. */
  speak(text: string, onBoundary?: (charIndex: number) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface VolumeMonitor {
  /** Media volume 0–1, or null when the platform does not tell. */
  getVolume(): Promise<number | null>;
}

export interface BalcaoEngines {
  wakeWord: WakeWordEngine;
  speechToText: SpeechToText;
  textToSpeech: TextToSpeech;
  volume: VolumeMonitor;
  /** Short "aviso" before a proactive question. */
  chime(): Promise<void>;
}

// ---- simulated (dev panel and tests)

export class SimulatedWakeWord implements WakeWordEngine {
  readonly simulated = true;
  private onWake: (() => void) | null = null;
  async start(onWake: () => void) {
    this.onWake = onWake;
  }
  async stop() {
    this.onWake = null;
  }
  /** "Ei, Bora Marca" (dev panel, "Falar" button, `wake-word` simulation). */
  trigger() {
    this.onWake?.();
  }
}

export class SimulatedSpeechToText implements SpeechToText {
  private handlers: SpeechToTextHandlers | null = null;
  get listening() {
    return this.handlers !== null;
  }
  async start(handlers: SpeechToTextHandlers) {
    this.handlers = handlers;
  }
  async stop() {
    this.handlers = null;
  }
  /** Simulates the professional saying `text`; ignored when not listening. */
  say(text: string) {
    const h = this.handlers;
    if (!h) return false;
    this.handlers = null;
    h.onPartial(text);
    h.onResult(text);
    return true;
  }
}

/** Speaks nothing and finishes at once (tests, and fallback when expo-speech fails). */
export class SilentTextToSpeech implements TextToSpeech {
  readonly spoken: string[] = [];
  async speak(text: string, onBoundary?: (charIndex: number) => void) {
    this.spoken.push(text);
    onBoundary?.(text.length);
  }
  async stop() {}
}

export class SimulatedVolume implements VolumeMonitor {
  value: number | null = null;
  async getVolume() {
    return this.value;
  }
}

// ---- real speech (expo-speech, pt-BR) and chime (expo-audio)

export const expoTextToSpeech: TextToSpeech = {
  speak(text, onBoundary) {
    return new Promise((resolve) => {
      Speech.speak(text, {
        language: 'pt-BR',
        onBoundary: onBoundary ? (ev: { charIndex: number }) => onBoundary(ev.charIndex) : null,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  },
  stop: () => Speech.stop(),
};

const CHIME_MAX_MS = 1000;
let audioModeSet = false;

export async function playChime(): Promise<void> {
  // loaded on first use: expo-audio's native module does not load under Jest
  const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
  if (!audioModeSet) {
    audioModeSet = true;
    // iOS: also audible with the ring/silent switch on; mixes with music playing on the speaker
    await setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset reference
  const player = createAudioPlayer(require('../../../assets/sounds/aviso.wav'));
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const timer = setTimeout(done, CHIME_MAX_MS);
    const sub = player.addListener('playbackStatusUpdate', (s) => s.didJustFinish && done());
    player.play();
  });
  player.remove();
}

// ---- injection point

export const simulated = {
  wakeWord: new SimulatedWakeWord(),
  speechToText: new SimulatedSpeechToText(),
  volume: new SimulatedVolume(),
};

/** Dev panel "Volume baixo": sets the simulated media volume (0–1, null = unknown). */
export function setSimulatedVolume(value: number | null) {
  simulated.volume.value = value;
}

let engines: BalcaoEngines = {
  ...simulated,
  textToSpeech: expoTextToSpeech,
  chime: () => playChime().catch(() => undefined),
};

export function getBalcaoEngines(): BalcaoEngines {
  return engines;
}

/** Replaces some engines (wave 4: Porcupine, native recognition, media volume). */
export function setBalcaoEngines(partial: Partial<BalcaoEngines>) {
  engines = { ...engines, ...partial };
}
