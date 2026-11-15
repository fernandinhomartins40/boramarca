import { describe, expect, it } from 'vitest';
import { FakeLlm, toolReply } from './fake-llm';
import { createLlmClientFromEnv, LlmUnavailableError, ResilientLlmClient } from './llm';

const req = { messages: [{ role: 'user' as const, content: 'oi' }] };
const ok = toolReply({ name: 'responder_cliente', arguments: { text: 'Oi!' } });

describe('ResilientLlmClient', () => {
  it('switches to the fallback when the primary fails (after its retry)', async () => {
    const primary = new FakeLlm([], { fallback: new Error('503') });
    const fallback = new FakeLlm([], { fallback: ok, model: 'reserva' });
    const errors: number[] = [];
    const client = new ResilientLlmClient([primary, fallback], {
      retries: 1,
      onError: (e) => errors.push(e.endpoint),
    });
    const res = await client.complete(req);
    expect(res.model).toBe('reserva');
    expect(primary.requests).toHaveLength(2);
    expect(errors).toEqual([0, 0]);
  });

  it('retries the primary once before giving up on it', async () => {
    const primary = new FakeLlm([{ when: () => true, reply: new Error('flaky'), times: 1 }], {
      fallback: ok,
      model: 'principal',
    });
    const fallback = new FakeLlm([], { fallback: ok, model: 'reserva' });
    const res = await new ResilientLlmClient([primary, fallback], { retries: 1 }).complete(req);
    expect(res.model).toBe('principal');
    expect(fallback.requests).toHaveLength(0);
  });

  it('times out a slow primary and uses the fallback', async () => {
    const slow = new FakeLlm([], { fallback: ok, delayMs: 1_000, model: 'lento' });
    const fast = new FakeLlm([], { fallback: ok, model: 'reserva' });
    const started = Date.now();
    const res = await new ResilientLlmClient([slow, fast], { timeoutMs: 30, retries: 0 }).complete(
      req,
    );
    expect(res.model).toBe('reserva');
    expect(Date.now() - started).toBeLessThan(500);
    expect(slow.requests[0]?.signal?.aborted).toBe(true);
  });

  it('throws LlmUnavailableError when every endpoint fails', async () => {
    const down = new FakeLlm([], { fallback: new Error('down') });
    await expect(
      new ResilientLlmClient([down, down], { retries: 0 }).complete(req),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});

describe('createLlmClientFromEnv', () => {
  it('returns null without primary config', () => {
    expect(createLlmClientFromEnv({})).toBeNull();
  });
  it('builds a client when the primary is configured', () => {
    expect(
      createLlmClientFromEnv({
        LLM_PRIMARY_BASE_URL: 'https://x.test/v1',
        LLM_PRIMARY_API_KEY: 'k',
        LLM_PRIMARY_MODEL: 'm',
      }),
    ).not.toBeNull();
  });
});
