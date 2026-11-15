import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeGateway,
  createSender,
  type RecipientFacts,
  type SendAuditEntry,
  type SendIntent,
  type SenderPorts,
  type WebhookEvent,
} from '../src';

const CLIENT = '+5511987654321';
const STRANGER = '+5511911112222';

async function setup(
  opts: { connected?: boolean; facts?: Partial<RecipientFacts>; counts?: [number, number] } = {},
) {
  const clock = new FakeClock('2026-01-05T14:05:00Z');
  const gateway = new FakeGateway({ clock });
  await gateway.createSession('bm-1', { webhookUrl: 'http://api/x', webhookSecret: 's' });
  if (opts.connected !== false) await gateway.simulateConnect('bm-1', '+5511900000001');
  const audits: SendAuditEntry[] = [];
  let [lastMinute, today] = opts.counts ?? [0, 0];
  const ports: SenderPorts = {
    recipientFacts: async (i) => ({
      hasInboundMessage: i.toPhone === CLIENT,
      hasPastAppointment: false,
      waitlistOptedInAt: null,
      ...opts.facts,
    }),
    sessionConnected: async (inst) => (await gateway.getStatus(inst)).status === 'connected',
    getCounters: async () => ({ lastMinute, today }),
    incrementCounters: async () => {
      lastMinute++;
      today++;
    },
    audit: async (e) => {
      audits.push(e);
    },
  };
  const sender = createSender({ gateway, ports, clock, rng: () => 0.5 });
  const intent = (over: Partial<SendIntent> = {}): SendIntent => ({
    instance: 'bm-1',
    toPhone: CLIENT,
    text: 'Marquei você às 14h20.',
    purpose: 'reply',
    queuedAt: clock.now(),
    ...over,
  });
  return { clock, gateway, sender, audits, intent, counters: () => ({ lastMinute, today }) };
}

describe('createSender', () => {
  it('shows typing, waits, then sends; counts the message', async () => {
    const { gateway, sender, intent, clock, counters } = await setup();
    const t0 = clock.now().getTime();
    const res = await sender.send(intent());
    expect(res).toMatchObject({ status: 'sent', providerMessageIds: [expect.any(String)] });
    expect(gateway.presences).toHaveLength(1);
    const typing = gateway.presences[0]!.durationMs;
    expect(typing).toBeGreaterThanOrEqual(2000);
    expect(typing).toBeLessThanOrEqual(8000);
    expect(gateway.sent[0]!.at.getTime() - t0).toBe(typing);
    expect(counters()).toEqual({ lastMinute: 1, today: 1 });
  });

  it('sends a long text as 2 messages, each after its own typing', async () => {
    const { gateway, sender, intent } = await setup();
    const res = await sender.send(
      intent({ text: `${'Frase longa aqui. '.repeat(25)}${'Outra. '.repeat(20)}` }),
    );
    expect(res.status).toBe('sent');
    expect(gateway.sent).toHaveLength(2);
    expect(gateway.presences).toHaveLength(2);
    for (const s of gateway.sent) expect(s.text.length).toBeLessThanOrEqual(500);
  });

  it('there is no path to a number that never wrote: nothing reaches the gateway, block is audited', async () => {
    const { gateway, sender, intent, audits } = await setup();
    for (const purpose of ['reply', 'reminder', 'notice', 'waitlist_offer'] as const) {
      const res = await sender.send(intent({ toPhone: STRANGER, purpose }));
      expect(res.status).toBe('blocked');
    }
    expect(gateway.sent).toHaveLength(0);
    expect(gateway.presences).toHaveLength(0);
    expect(audits).toHaveLength(4);
    expect(audits[0]).toEqual({
      action: 'whatsapp.send_blocked',
      payload: expect.objectContaining({
        reason: 'recipient_not_allowed',
        instance: 'bm-1',
        textLength: 22,
      }),
    });
    expect(JSON.stringify(audits)).not.toContain('14h20'); // no message content in the audit
  });

  it('session down: blocked as retryable, nothing sent', async () => {
    const { gateway, sender, intent } = await setup({ connected: false });
    expect(await sender.send(intent())).toEqual({
      status: 'blocked',
      reason: 'session_disconnected',
      retryable: true,
    });
    expect(gateway.sent).toHaveLength(0);
  });

  it('per-minute limit stops the 9th message', async () => {
    const { gateway, sender, intent } = await setup();
    const results = [];
    for (let i = 0; i < 9; i++)
      results.push(await sender.send(intent({ queuedAt: new Date('2026-01-05T14:05:00Z') })));
    expect(results.slice(0, 8).every((r) => r.status === 'sent')).toBe(true);
    expect(results[8]).toMatchObject({ status: 'blocked', reason: 'rate_limit_minute' });
    expect(gateway.sent).toHaveLength(8);
  });

  it('per-day limit', async () => {
    const { sender, intent } = await setup({ counts: [0, 200] });
    expect(await sender.send(intent())).toMatchObject({
      status: 'blocked',
      reason: 'rate_limit_day',
    });
  });

  it('drops a message that sat in the queue for more than 30 minutes', async () => {
    const { sender, intent, clock, gateway, audits } = await setup();
    const queued = intent();
    clock.advance(31 * 60_000);
    expect(await sender.send(queued)).toMatchObject({ status: 'blocked', reason: 'stale_message' });
    expect(gateway.sent).toHaveLength(0);
    expect(audits[0]?.payload.reason).toBe('stale_message');
  });

  it('gateway failure mid-way reports which parts went out', async () => {
    const { gateway, sender, intent } = await setup();
    gateway.failNextSends.push(new Error('boom'));
    const res = await sender.send(intent());
    expect(res).toMatchObject({ status: 'failed', providerMessageIds: [] });
  });
});

describe('FakeGateway', () => {
  it('simulates QR, pairing, connection and session drop, emitting Evolution-format webhooks', async () => {
    const clock = new FakeClock();
    const gw = new FakeGateway({ clock });
    const events: WebhookEvent[] = [];
    gw.onWebhook((body) => {
      events.push(gw.parseWebhook(body));
    });
    await gw.createSession('bm-1', { webhookUrl: 'u', webhookSecret: 's' });
    expect((await gw.getStatus('bm-1')).status).toBe('disconnected');
    const qr = await gw.getQrCode('bm-1');
    expect(qr.qr).toContain('fake-qr');
    expect((await gw.getStatus('bm-1')).status).toBe('waiting_qr');
    expect((await gw.getPairingCode('bm-1', '+5511900000001')).code).toHaveLength(8);
    await gw.simulateConnect('bm-1');
    expect(await gw.getStatus('bm-1')).toMatchObject({
      status: 'connected',
      phone: '+5511900000001',
    });
    await gw.simulateDrop('bm-1');
    expect(events.map((e) => (e.type === 'connection' ? e.status : e.type))).toEqual([
      'qr',
      'connected',
      'disconnected',
    ]);
    await expect(gw.sendText('bm-1', CLIENT, 'oi')).rejects.toMatchObject({
      code: 'not_connected',
    });
  });

  it('demo mode connects by itself after autoConnectMs', async () => {
    const clock = new FakeClock();
    const gw = new FakeGateway({ clock, autoConnectMs: 5000 });
    await gw.createSession('demo', { webhookUrl: 'u', webhookSecret: 's' });
    await gw.getQrCode('demo');
    clock.advance(4999);
    expect((await gw.getStatus('demo')).status).toBe('waiting_qr');
    clock.advance(1);
    expect((await gw.getStatus('demo')).status).toBe('connected');
  });

  it('injected inbound messages parse like real ones (text, audio, group, fromMe)', async () => {
    const gw = new FakeGateway();
    await gw.createSession('bm-1', { webhookUrl: 'u', webhookSecret: 's' });
    expect(
      gw.parseWebhook(
        await gw.injectInbound('bm-1', { fromPhone: CLIENT, text: 'Oi', pushName: 'Fulano' }),
      ),
    ).toMatchObject({
      type: 'message',
      kind: 'text',
      fromPhone: CLIENT,
      text: 'Oi',
      pushName: 'Fulano',
      ignored: false,
    });
    expect(
      gw.parseWebhook(
        await gw.injectInbound('bm-1', { fromPhone: CLIENT, audio: { base64: 'AAAA' } }),
      ),
    ).toMatchObject({
      kind: 'audio',
      audio: { base64: 'AAAA', mimetype: 'audio/ogg; codecs=opus' },
      ignored: false,
    });
    expect(
      gw.parseWebhook(
        await gw.injectInbound('bm-1', { fromPhone: CLIENT, text: 'x', group: true }),
      ),
    ).toMatchObject({ ignoredReason: 'group' });
    expect(
      gw.parseWebhook(
        await gw.injectInbound('bm-1', { fromPhone: CLIENT, text: 'x', fromMe: true }),
      ),
    ).toMatchObject({ ignoredReason: 'fromMe' });
  });
});
