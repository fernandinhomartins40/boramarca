import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvolutionGateway, WhatsAppGatewayError } from '../src';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'));

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function setup(responses: [number, unknown][]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      method: init.method ?? 'GET',
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const [status, body] = responses.shift() ?? [500, null];
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  const gw = new EvolutionGateway({
    baseUrl: 'http://evo.test/',
    apiKey: 'k3y',
    fetch,
    sleep: async () => {},
    now: () => new Date('2026-01-05T12:00:00Z'),
  });
  return { gw, calls };
}

const opts = {
  webhookUrl: 'http://api.test/v1/webhooks/whatsapp/bm-1',
  webhookSecret: 's3cret-s3cret-s3cret',
};

describe('EvolutionGateway', () => {
  it('createSession posts /instance/create with the webhook, secret header and events', async () => {
    const { gw, calls } = setup([[201, fixture('rest-instance-create')]]);
    await gw.createSession('bm-1', opts);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://evo.test/instance/create',
      headers: { apikey: 'k3y', 'content-type': 'application/json' },
      body: {
        instanceName: 'bm-1',
        integration: 'WHATSAPP-BAILEYS',
        qrcode: false,
        groupsIgnore: true,
        webhook: {
          url: opts.webhookUrl,
          byEvents: false,
          base64: true,
          headers: { 'x-boramarca-webhook-secret': opts.webhookSecret },
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
      },
    });
  });

  it('createSession on an existing name refreshes the webhook via /webhook/set', async () => {
    const { gw, calls } = setup([
      [
        403,
        {
          status: 403,
          error: 'Forbidden',
          response: { message: ['This name "bm-1" is already in use.'] },
        },
      ],
      [201, {}],
    ]);
    await gw.createSession('bm-1', opts);
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'http://evo.test/webhook/set/bm-1',
      body: { webhook: { enabled: true, url: opts.webhookUrl, events: expect.any(Array) } },
    });
  });

  it('getQrCode uses GET /instance/connect and returns the raw QR string', async () => {
    const { gw, calls } = setup([[200, fixture('rest-instance-connect')]]);
    const qr = await gw.getQrCode('bm-1');
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://evo.test/instance/connect/bm-1' });
    expect(qr.qr).toMatch(/^2@/);
    expect(qr.expiresAt).toBe('2026-01-05T12:00:20.000Z');
  });

  it('getPairingCode sends the number as digits and polls until the code exists', async () => {
    const { gw, calls } = setup([
      [200, { pairingCode: null, code: '2@x', count: 1 }],
      [200, { pairingCode: 'WZYE-H1YY', code: '2@x', count: 1 }],
    ]);
    const res = await gw.getPairingCode('bm-1', '+5511987654321');
    expect(calls[0]?.url).toBe('http://evo.test/instance/connect/bm-1?number=5511987654321');
    expect(calls).toHaveLength(2);
    expect(res.code).toBe('WZYEH1YY');
  });

  it('getPairingCode fails clearly when Evolution never returns a code', async () => {
    const { gw } = setup(
      Array.from(
        { length: 5 },
        () => [200, { pairingCode: null, code: '2@x' }] as [number, unknown],
      ),
    );
    await expect(gw.getPairingCode('bm-1', '+5511987654321')).rejects.toMatchObject({
      code: 'pairing_unavailable',
    });
  });

  it('getStatus maps fetchInstances to product status and E.164 phone', async () => {
    const { gw, calls } = setup([
      [
        200,
        [
          {
            name: 'bm-1',
            connectionStatus: 'open',
            ownerJid: '5511900000001@s.whatsapp.net',
            profileName: 'Ana',
            profilePicUrl: null,
          },
        ],
      ],
    ]);
    expect(await gw.getStatus('bm-1')).toEqual({
      status: 'connected',
      phone: '+5511900000001',
      profileName: 'Ana',
      profilePictureUrl: null,
    });
    expect(calls[0]?.url).toBe('http://evo.test/instance/fetchInstances?instanceName=bm-1');
  });

  it('getStatus on a missing instance throws not_found', async () => {
    const { gw } = setup([
      [404, { status: 404, error: 'Not Found', response: { message: ['x'] } }],
    ]);
    await expect(gw.getStatus('bm-1')).rejects.toMatchObject({
      code: 'not_found',
      httpStatus: 404,
    });
  });

  it('disconnect = DELETE /instance/logout, tolerating "not connected"', async () => {
    const { gw, calls } = setup([[400, { response: { message: ['not connected'] } }]]);
    await gw.disconnect('bm-1');
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      url: 'http://evo.test/instance/logout/bm-1',
    });
  });

  it('deleteInstance = DELETE /instance/delete, idempotent on 404', async () => {
    const { gw, calls } = setup([[404, {}]]);
    await gw.deleteInstance('bm-1');
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      url: 'http://evo.test/instance/delete/bm-1',
    });
  });

  it('sendText posts digits + text and returns key.id', async () => {
    const { gw, calls } = setup([
      [
        201,
        {
          key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: true, id: '3EB0SENT' },
          status: 'PENDING',
        },
      ],
    ]);
    const res = await gw.sendText('bm-1', '+5511987654321', 'Pode vir');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://evo.test/message/sendText/bm-1',
      body: { number: '5511987654321', text: 'Pode vir', linkPreview: false },
    });
    expect(res.providerMessageId).toBe('3EB0SENT');
  });

  it('sendPresence posts composing with the delay in ms', async () => {
    const { gw, calls } = setup([[201, null]]);
    await gw.sendPresence('bm-1', '+5511987654321', 3456.4);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://evo.test/chat/sendPresence/bm-1',
      body: { number: '5511987654321', presence: 'composing', delay: 3456 },
    });
  });

  it('errors never carry the phone number', async () => {
    const { gw } = setup([[500, { response: { message: 'jid 5511987654321 failed' } }]]);
    const err = await gw.sendText('bm-1', '+5511987654321', 'oi').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WhatsAppGatewayError);
    expect(String((err as Error).message)).not.toContain('5511987654321');
  });

  it('network failure becomes network_error', async () => {
    const gw = new EvolutionGateway({
      baseUrl: 'http://evo.test',
      apiKey: 'k',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(gw.getStatus('bm-1')).rejects.toMatchObject({ code: 'network_error' });
  });
});
