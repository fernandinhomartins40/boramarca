import type { AlexaSettings, DecisionView } from '@boramarca/shared';

/**
 * Voice Monkey v3 Announcement API (https://voicemonkey.io/docs/api/announcement):
 * `POST https://api-v3.voicemonkey.io/announce` with JSON `{ token, device, speech, language }`.
 * v2 tokens do not work on v3.
 */
export const VOICE_MONKEY_BASE_URL = 'https://api-v3.voicemonkey.io';

export class VoiceMonkeyError extends Error {
  constructor(
    readonly status: number,
    /** Voice Monkey error code (`INVALID_TOKEN`, `DEVICE_NOT_FOUND`, `THROTTLED`...) or `NETWORK`. */
    readonly code: string,
  ) {
    super(`voice monkey ${status} ${code}`);
  }
}

export interface VoiceMonkeyClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createVoiceMonkeyClient(opts: VoiceMonkeyClientOptions) {
  const f = opts.fetch ?? fetch;
  const url = `${opts.baseUrl ?? VOICE_MONKEY_BASE_URL}/announce`;
  return {
    /** Makes the Echo speak `speech` now. Throws `VoiceMonkeyError`. */
    async announce(input: { device: string; speech: string; language?: string }): Promise<void> {
      let res: Response;
      try {
        res = await f(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: opts.token, language: 'pt-BR', ...input }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
      } catch {
        throw new VoiceMonkeyError(0, 'NETWORK');
      }
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || json.success === false)
        throw new VoiceMonkeyError(res.status, json.error ?? 'UNKNOWN');
    },
  };
}
export type VoiceMonkeyClient = ReturnType<typeof createVoiceMonkeyClient>;

/** What the Echo says for a new decision; the professional answers via the skill. */
export const decisionAnnouncement = (d: DecisionView) =>
  `${d.question} Para responder, diga: Alexa, diga ao Bora Marca que sim, ou que não.`;

/**
 * Hook for `decisions.onCreated(...)`. Announces only for professionals with Voice Monkey on.
 * Fire-and-forget: the decision flow never waits for, or fails because of, the Echo.
 */
export function createDecisionAnnouncer(deps: {
  client: VoiceMonkeyClient;
  settingsFor: (professionalId: string) => Promise<AlexaSettings | null>;
  log?: (msg: string, err?: unknown) => void;
}) {
  return (d: DecisionView): void => {
    const run = async () => {
      const s = await deps.settingsFor(d.professionalId);
      if (!s?.voiceMonkeyEnabled || !s.voiceMonkeyDevice) return;
      await deps.client.announce({ device: s.voiceMonkeyDevice, speech: decisionAnnouncement(d) });
    };
    void run().catch((err: unknown) => deps.log?.('voice monkey announce failed', err));
  };
}
