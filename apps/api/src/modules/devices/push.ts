// Push notifications behind an interface: Expo Push in production, a fake that records in tests
// and in development. Endpoint and ticket format checked in docs.expo.dev (sending-notifications).

export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app (decision id, options for the Sim/Não actions...). Max 4 KiB total. */
  data?: Record<string, unknown>;
  /** iOS category / Android action set (DECISION_NOTIFICATION_CATEGORY_ID). */
  categoryId?: string;
  /** Android channel (DECISION_NOTIFICATION_CHANNEL_ID). */
  channelId?: string;
}

export interface PushSender {
  /** Returns the tokens the provider says are no longer valid (to delete). */
  send(tokens: string[], message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export class FakePush implements PushSender {
  readonly sent: { tokens: string[]; message: PushMessage }[] = [];
  async send(tokens: string[], message: PushMessage) {
    this.sent.push({ tokens, message });
    return { invalidTokens: [] };
  }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

export class ExpoPush implements PushSender {
  constructor(private readonly opts: { accessToken?: string; fetch?: typeof fetch } = {}) {}

  async send(tokens: string[], message: PushMessage) {
    const doFetch = this.opts.fetch ?? fetch;
    const invalidTokens: string[] = [];
    for (let i = 0; i < tokens.length; i += EXPO_BATCH) {
      const batch = tokens.slice(i, i + EXPO_BATCH);
      const res = await doFetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.opts.accessToken && { authorization: `Bearer ${this.opts.accessToken}` }),
        },
        body: JSON.stringify(
          batch.map((to) => ({ to, sound: 'default', priority: 'high', ...message })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
      const json = (await res.json()) as { data?: ExpoTicket[] };
      json.data?.forEach((t, k) => {
        if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered')
          invalidTokens.push(batch[k]!);
      });
    }
    return { invalidTokens };
  }
}
