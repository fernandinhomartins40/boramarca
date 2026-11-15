// Logs carry no personal data (plan section 16): phones, message text, codes and tokens are
// censored, and request URLs lose their query string.
import { Writable } from 'node:stream';
import pino from 'pino';
import { expect, it } from 'vitest';
import { loggerOptions } from './lib/logger';

it('censors phones, texts, codes and tokens, at the top level and one level down', () => {
  const lines: string[] = [];
  const out = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const opts = loggerOptions('info');
  const log = pino(opts, out);
  log.info(
    {
      phone: '+5511987654321',
      code: '482913',
      token: 'tok-secret',
      job: { toPhone: '+5511911112222', text: 'Oi, consigo às 16h?', refreshToken: 'r-secret' },
      body: { access_token: 'bma_x', client_secret: 'cs', voiceMonkeyToken: 'vm' },
      req: opts.serializers.req({
        method: 'GET',
        url: '/v1/whatsapp/pairing-code?phone=%2B5511933334444',
      }),
      decisionId: 'keep-me',
    },
    'event',
  );
  log.info(opts.serializers.req({ method: 'GET', url: '/v1/realtime?token=eyJhbGciOi' }), 'ws');
  const all = lines.join('\n');
  for (const secret of [
    '987654321',
    '482913',
    'tok-secret',
    '911112222',
    'consigo',
    'r-secret',
    'bma_x',
    '"cs"',
    '"vm"',
    '933334444',
    'eyJhbGciOi',
  ])
    expect(all).not.toContain(secret);
  expect(all).toContain('keep-me');
  expect(all).toContain('/v1/whatsapp/pairing-code');
  expect(all).toContain('[redacted]');
});
