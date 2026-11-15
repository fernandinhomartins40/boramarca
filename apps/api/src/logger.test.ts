// Logs carry no personal data (plan section 16): phones, message text, codes and tokens are
// censored, and request URLs lose their query string.
import { Writable } from 'node:stream';
import pino from 'pino';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './db/client';
import { professionals } from './db/schema';
import { loggerOptions } from './lib/logger';
import { TEST_DATABASE_URL } from './test/env';

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

it('a failed query logs the SQL, the code and the stack, never the bound values (M9)', async () => {
  const { db, sql } = createDb(TEST_DATABASE_URL);
  const lines: string[] = [];
  const out = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const log = pino(loggerOptions('info'), out);
  // Not a uuid: Postgres repeats the value in its message, drizzle in `params` and its message.
  const err = await db
    .select()
    .from(professionals)
    .where(eq(professionals.id, '+5511987650000'))
    .then(
      () => null,
      (e: unknown) => e,
    );
  await sql.end();
  expect(err).toBeTruthy();
  log.error({ err }, 'unhandled error');
  const all = lines.join('\n');
  expect(all).not.toContain('987650000');
  expect(all).toContain('select');
  expect(all).toContain('22P02'); // invalid_text_representation
  expect(all).toContain('"stack"'); // stack frames kept
});
