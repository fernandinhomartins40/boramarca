import OpenAI, { toFile } from 'openai';

export interface AudioInput {
  data: Uint8Array;
  /** e.g. "audio.ogg" — the extension helps the provider detect the format. */
  filename: string;
  mimeType?: string;
}

export interface Transcriber {
  transcribe(audio: AudioInput): Promise<{ text: string }>;
}

export interface TranscriberConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  /** ISO-639-1; pt improves accuracy and latency. */
  language?: string;
  timeoutMs?: number;
}

/** OpenAI-compatible /audio/transcriptions (Groq Whisper, OpenAI...). */
export class OpenAiCompatibleTranscriber implements Transcriber {
  private readonly client: OpenAI;

  constructor(private readonly config: TranscriberConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 30_000,
      maxRetries: 1,
    });
  }

  async transcribe(audio: AudioInput): Promise<{ text: string }> {
    const file = await toFile(
      audio.data,
      audio.filename,
      audio.mimeType ? { type: audio.mimeType } : undefined,
    );
    const res = await this.client.audio.transcriptions.create({
      file,
      model: this.config.model,
      language: this.config.language ?? 'pt',
    });
    return { text: res.text.trim() };
  }
}

/** Deterministic transcriber for tests: by filename, or a fixed text. */
export class FakeTranscriber implements Transcriber {
  readonly received: AudioInput[] = [];

  constructor(private readonly script: string | Record<string, string> = 'áudio de teste') {}

  async transcribe(audio: AudioInput): Promise<{ text: string }> {
    this.received.push(audio);
    if (typeof this.script === 'string') return { text: this.script };
    const text = this.script[audio.filename];
    if (text === undefined) throw new Error(`FakeTranscriber: sem texto para ${audio.filename}`);
    return { text };
  }
}

/** From TRANSCRIBE_BASE_URL / TRANSCRIBE_API_KEY / TRANSCRIBE_MODEL; null when not configured. */
export function createTranscriberFromEnv(
  env: Record<string, string | undefined> = process.env,
): Transcriber | null {
  const { TRANSCRIBE_BASE_URL: baseURL, TRANSCRIBE_API_KEY: apiKey, TRANSCRIBE_MODEL: model } = env;
  if (!baseURL || !apiKey || !model) return null;
  return new OpenAiCompatibleTranscriber({
    baseURL,
    apiKey,
    model,
    language: env.TRANSCRIBE_LANGUAGE || 'pt',
  });
}
