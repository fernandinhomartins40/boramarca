import type { LlmClient, LlmRequest, LlmResponse } from './llm';

type Reply = LlmResponse | Error | ((req: LlmRequest) => LlmResponse | Promise<LlmResponse>);

export interface FakeLlmRule {
  /** Regex tested against the last user message, or a predicate over the whole request. */
  when: RegExp | ((req: LlmRequest) => boolean);
  reply: Reply;
  /** How many times this rule may fire (default: unlimited). */
  times?: number;
}

export interface FakeLlmOptions {
  /** Used when no rule matches (default: throws, so a missing rule is visible in tests). */
  fallback?: Reply;
  /** Artificial latency, to exercise timeouts. Honors the request's abort signal. */
  delayMs?: number;
  model?: string;
}

/** Shorthand for a reply with tool calls (arguments are stringified like a real model does). */
export function toolReply(
  calls: { name: string; arguments: unknown }[] | { name: string; arguments: unknown },
  content: string | null = null,
): LlmResponse {
  const list = Array.isArray(calls) ? calls : [calls];
  return {
    content,
    toolCalls: list.map((c) => ({
      name: c.name,
      arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments),
    })),
    model: 'fake',
  };
}

export function lastUserText(req: LlmRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m?.role === 'user')
      return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  }
  return '';
}

/** Deterministic LLM for tests (packages/ia and the API's end-to-end tests). Records every request. */
export class FakeLlm implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private readonly rules: (FakeLlmRule & { used: number })[];

  constructor(
    rules: FakeLlmRule[] = [],
    private readonly opts: FakeLlmOptions = {},
  ) {
    this.rules = rules.map((r) => ({ ...r, used: 0 }));
  }

  /** Adds a rule with priority over the existing ones. */
  on(when: FakeLlmRule['when'], reply: Reply, times?: number): this {
    this.rules.unshift({ when, reply, times, used: 0 });
    return this;
  }

  /** Everything that was sent to the "model", concatenated (for redaction assertions). */
  sentText(): string {
    return this.requests
      .flatMap((r) =>
        r.messages.map((m) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        ),
      )
      .join('\n');
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    if (this.opts.delayMs) await sleep(this.opts.delayMs, req.signal);
    const text = lastUserText(req);
    const rule = this.rules.find(
      (r) =>
        (r.times === undefined || r.used < r.times) &&
        (r.when instanceof RegExp ? r.when.test(text) : r.when(req)),
    );
    if (rule) rule.used++;
    const reply = rule?.reply ?? this.opts.fallback;
    if (!reply) throw new Error(`FakeLlm: nenhuma regra para "${text.slice(-120)}"`);
    if (reply instanceof Error) throw reply;
    const res = typeof reply === 'function' ? await reply(req) : reply;
    return { ...res, model: this.opts.model ?? res.model };
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });
}
