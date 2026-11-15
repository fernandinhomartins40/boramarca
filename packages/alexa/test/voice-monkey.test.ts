import { describe, expect, it, vi } from 'vitest';
import {
  VoiceMonkeyError,
  createDecisionAnnouncer,
  createVoiceMonkeyClient,
  decisionAnnouncement,
} from '../src';
import { D1, PRO } from './helpers';

const reply = (status: number, json: unknown) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(json), { status }));

describe('Voice Monkey client', () => {
  it('POSTs the v3 announce body', async () => {
    const f = reply(200, { success: true, data: 'OK' });
    await createVoiceMonkeyClient({ token: 'tok', fetch: f }).announce({
      device: 'echo-balcao',
      speech: 'Oi',
    });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api-v3.voicemonkey.io/announce');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      token: 'tok',
      device: 'echo-balcao',
      speech: 'Oi',
      language: 'pt-BR',
    });
  });

  it.each([
    [401, { error: 'INVALID_TOKEN' }, 'INVALID_TOKEN'],
    [404, { error: 'DEVICE_NOT_FOUND' }, 'DEVICE_NOT_FOUND'],
    [429, { error: 'THROTTLED', lockoutUntil: 'x' }, 'THROTTLED'],
    [200, { success: false }, 'UNKNOWN'],
  ])('HTTP %i → VoiceMonkeyError %s', async (status, json, code) => {
    const c = createVoiceMonkeyClient({ token: 't', fetch: reply(status, json) });
    await expect(c.announce({ device: 'd', speech: 's' })).rejects.toMatchObject({ status, code });
  });

  it('non-JSON error body', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('Bad gateway', { status: 502 }));
    await expect(
      createVoiceMonkeyClient({ token: 't', fetch: f }).announce({ device: 'd', speech: 's' }),
    ).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('network failure', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const err = await createVoiceMonkeyClient({ token: 't', fetch: f })
      .announce({ device: 'd', speech: 's' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VoiceMonkeyError);
    expect(err).toMatchObject({ code: 'NETWORK' });
  });
});

describe('decision announcer (decisions.onCreated)', () => {
  const settings = (enabled: boolean, device: string | null = 'echo-balcao') =>
    vi.fn(async () => ({ linked: true, voiceMonkeyEnabled: enabled, voiceMonkeyDevice: device }));

  it('announces the question when the professional turned it on', async () => {
    const announce = vi.fn(async () => {});
    const settingsFor = settings(true);
    createDecisionAnnouncer({ client: { announce }, settingsFor })(D1);
    await vi.waitFor(() => expect(announce).toHaveBeenCalled());
    expect(settingsFor).toHaveBeenCalledWith(PRO);
    expect(announce).toHaveBeenCalledWith({
      device: 'echo-balcao',
      speech: decisionAnnouncement(D1),
    });
    expect(decisionAnnouncement(D1)).toContain('Marco o Fulano às 15h?');
  });

  it.each([
    ['off', settings(false)],
    ['no device', settings(true, null)],
    ['no settings', vi.fn(async () => null)],
  ])('stays quiet: %s', async (_n, settingsFor) => {
    const announce = vi.fn(async () => {});
    createDecisionAnnouncer({ client: { announce }, settingsFor })(D1);
    await vi.waitFor(() => expect(settingsFor).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(announce).not.toHaveBeenCalled();
  });

  it('never throws; failures are logged', async () => {
    const log = vi.fn();
    const announce = vi.fn().mockRejectedValue(new VoiceMonkeyError(401, 'INVALID_TOKEN'));
    expect(() =>
      createDecisionAnnouncer({ client: { announce }, settingsFor: settings(true), log })(D1),
    ).not.toThrow();
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        'voice monkey announce failed',
        expect.any(VoiceMonkeyError),
      ),
    );
  });
});
