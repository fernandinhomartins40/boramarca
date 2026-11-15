import type {
  ExpoSpeechRecognitionNativeEventMap,
  ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
import type { SpeechToText, SpeechToTextHandlers } from '../engines';

type Events = ExpoSpeechRecognitionNativeEventMap;

/** The part of ExpoSpeechRecognitionModule used here (injected so tests need no native code). */
export interface RecognitionModule {
  start(options: ExpoSpeechRecognitionOptions): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  getMicrophonePermissionsAsync(): Promise<{ granted: boolean }>;
  requestMicrophonePermissionsAsync(): Promise<{ granted: boolean }>;
  getSpeechRecognizerPermissionsAsync(): Promise<{ granted: boolean }>;
  requestSpeechRecognizerPermissionsAsync(): Promise<{ granted: boolean }>;
  addListener<K extends keyof Events>(
    event: K,
    fn: (e: Events[K]) => void,
  ): { remove(): void };
}

export interface MicHolder {
  hold(): Promise<void>;
  release(): Promise<void>;
}

/**
 * Native speech recognition in pt-BR (Android SpeechRecognizer / iOS SFSpeechRecognizer through
 * expo-speech-recognition). One final `onResult` per start; on silence or error nothing is sent and
 * the Balcão machine's 12 s timer takes over. Holds the wake word's microphone while listening.
 */
export class NativeSpeechToText implements SpeechToText {
  private end: (() => void) | null = null;

  constructor(
    private readonly module: RecognitionModule,
    private readonly mic?: MicHolder,
  ) {}

  async start(handlers: SpeechToTextHandlers) {
    await this.stop();
    const permission = await this.module.requestPermissionsAsync();
    if (!permission.granted) throw new Error('Sem permissão para o microfone.');
    await this.mic?.hold();

    let done = false;
    const subs: { remove(): void }[] = [];
    const end = () => {
      if (done) return;
      done = true;
      subs.forEach((s) => s.remove());
      if (this.end === end) this.end = null;
      void this.mic?.release();
    };
    this.end = end;
    subs.push(
      this.module.addListener('result', (e) => {
        const text = e.results[0]?.transcript ?? '';
        if (!e.isFinal) return handlers.onPartial(text);
        end();
        handlers.onResult(text);
      }),
      this.module.addListener('error', end),
      this.module.addListener('nomatch', end),
      this.module.addListener('end', end),
    );
    try {
      this.module.start({ lang: 'pt-BR', interimResults: true, continuous: false });
    } catch (e) {
      end();
      throw e;
    }
  }

  async stop() {
    const end = this.end;
    if (!end) return;
    try {
      this.module.abort();
    } finally {
      end();
    }
  }
}
