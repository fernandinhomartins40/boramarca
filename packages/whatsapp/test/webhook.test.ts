import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jidToE164, parseEvolutionWebhook } from '../src';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'));

describe('parseEvolutionWebhook — messages.upsert', () => {
  it('text from a client', () => {
    expect(parseEvolutionWebhook(fixture('messages-upsert-text'))).toEqual({
      type: 'message',
      instance: 'bm-demo-prof',
      kind: 'text',
      providerMessageId: '3EB0A1B2C3D4E5F60718',
      fromPhone: '+5511987654321',
      pushName: 'Fulano',
      text: 'Oi! Tem horário sábado de manhã?',
      audio: null,
      timestamp: '2025-11-12T14:05:12.000Z',
      ignored: false,
      ignoredReason: null,
    });
  });

  it('audio with base64 and mimetype', () => {
    const e = parseEvolutionWebhook(fixture('messages-upsert-audio'));
    expect(e).toMatchObject({
      type: 'message',
      kind: 'audio',
      fromPhone: '+5511987654321',
      text: null,
      ignored: false,
      audio: {
        mimetype: 'audio/ogg; codecs=opus',
        seconds: 4,
        base64: expect.stringMatching(/^T2dnUw/),
        url: expect.stringContaining('mmg.whatsapp.net'),
      },
    });
  });

  it.each([
    ['messages-upsert-group', 'group'],
    ['messages-upsert-status', 'status'],
    ['messages-upsert-fromme', 'fromMe'],
    ['messages-upsert-image', 'unsupported'],
    ['messages-upsert-lid-unresolved', 'unknown_sender'],
  ])('%s is ignored (%s)', (name, reason) => {
    expect(parseEvolutionWebhook(fixture(name))).toMatchObject({
      type: 'message',
      ignored: true,
      ignoredReason: reason,
    });
  });

  it('group message never exposes the participant as sender', () => {
    expect(parseEvolutionWebhook(fixture('messages-upsert-group'))).toMatchObject({
      fromPhone: null,
    });
  });
});

describe('parseEvolutionWebhook — session events', () => {
  it('qrcode.updated (captured from Evolution v2.3.7)', () => {
    expect(parseEvolutionWebhook(fixture('qrcode-updated'))).toMatchObject({
      type: 'qr',
      instance: 'a2-capture-test',
      qr: expect.stringMatching(/^2@/),
      pairingCode: null,
      timestamp: '2026-11-12T23:24:22.196Z',
    });
  });

  it('connection.update connecting / close (captured)', () => {
    expect(parseEvolutionWebhook(fixture('connection-update-connecting'))).toMatchObject({
      type: 'connection',
      status: 'connecting',
      reasonCode: 200,
    });
    expect(parseEvolutionWebhook(fixture('connection-update-close'))).toMatchObject({
      type: 'connection',
      status: 'disconnected',
      reasonCode: 401,
      phone: null,
    });
  });

  it('connection.update open carries phone and profile', () => {
    expect(parseEvolutionWebhook(fixture('connection-update-open'))).toEqual({
      type: 'connection',
      instance: 'bm-demo-prof',
      status: 'connected',
      phone: '+5511900000001',
      profileName: 'Studio Ana',
      profilePictureUrl: expect.stringContaining('pps.whatsapp.net'),
      reasonCode: 200,
      timestamp: '2026-11-12T14:05:12.345Z',
    });
  });

  it('QR limit reached becomes a qr event with no code', () => {
    const e = parseEvolutionWebhook({
      event: 'qrcode.updated',
      instance: 'x',
      data: { message: 'QR code limit reached, please login again', statusCode: 500 },
    });
    expect(e).toMatchObject({ type: 'qr', qr: null });
  });

  it('unknown events and garbage are ignored without throwing', () => {
    expect(parseEvolutionWebhook({ event: 'chats.upsert', instance: 'x', data: [] })).toEqual({
      type: 'ignored',
      instance: 'x',
      event: 'chats.upsert',
    });
    expect(parseEvolutionWebhook('nope')).toEqual({ type: 'ignored', instance: null, event: null });
    expect(parseEvolutionWebhook({ event: 'messages.upsert', instance: 'x', data: {} }).type).toBe(
      'ignored',
    );
  });
});

describe('jidToE164', () => {
  it('normalizes legacy 8-digit Brazilian mobiles and rejects non-phone JIDs', () => {
    expect(jidToE164('551187654321@s.whatsapp.net')).toBe('+5511987654321');
    expect(jidToE164('551132654321@s.whatsapp.net')).toBe('+551132654321'); // landline stays
    expect(jidToE164('5511987654321:12@s.whatsapp.net')).toBe('+5511987654321');
    expect(jidToE164('14155550123@s.whatsapp.net')).toBe('+14155550123');
    expect(jidToE164('1203630@g.us')).toBeNull();
    expect(jidToE164('112233@lid')).toBeNull();
  });
});
