import { describe, expect, it } from 'vitest';
import {
  createTranscriberFromEnv,
  FakeTranscriber,
  OpenAiCompatibleTranscriber,
} from './transcriber';

describe('Transcriber', () => {
  it('FakeTranscriber returns scripted text by filename', async () => {
    const t = new FakeTranscriber({ 'a.ogg': 'tem horário amanhã?' });
    expect(await t.transcribe({ data: new Uint8Array([1]), filename: 'a.ogg' })).toEqual({
      text: 'tem horário amanhã?',
    });
    await expect(t.transcribe({ data: new Uint8Array([1]), filename: 'b.ogg' })).rejects.toThrow();
  });
  it('env factory: null without config, real client with config', () => {
    expect(createTranscriberFromEnv({})).toBeNull();
    expect(
      createTranscriberFromEnv({
        TRANSCRIBE_BASE_URL: 'https://x.test/v1',
        TRANSCRIBE_API_KEY: 'k',
        TRANSCRIBE_MODEL: 'm',
      }),
    ).toBeInstanceOf(OpenAiCompatibleTranscriber);
  });
});
