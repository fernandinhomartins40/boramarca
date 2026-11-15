import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionFunctionTool,
} from 'openai/resources/chat/completions';

export type LlmMessage = ChatCompletionMessageParam;
export type LlmTool = ChatCompletionFunctionTool;

export interface LlmRequest {
  messages: LlmMessage[];
  tools?: LlmTool[];
  /** `required` forces at least one tool call. */
  toolChoice?: 'auto' | 'required';
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmToolCall {
  name: string;
  /** Raw JSON string, exactly as the model produced it. */
  arguments: string;
}

export interface LlmResponse {
  content: string | null;
  toolCalls: LlmToolCall[];
  /** Model that answered (useful in logs to see when the fallback kicked in). */
  model: string;
}

/** Everything in packages/ia talks to the model through this; inject a FakeLlm in tests. */
export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export interface LlmEndpointConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** One OpenAI-compatible endpoint (DeepSeek, Qwen/DashScope, OpenAI, OpenRouter...). */
export class OpenAiCompatibleClient implements LlmClient {
  private readonly client: OpenAI;

  constructor(private readonly config: LlmEndpointConfig) {
    // Retries and timeouts are handled by ResilientLlmClient, so the SDK must not retry on its own.
    this.client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, maxRetries: 0 });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await this.client.chat.completions.create(
      {
        model: this.config.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        ...(req.tools?.length ? { tools: req.tools, tool_choice: req.toolChoice ?? 'auto' } : {}),
      },
      { signal: req.signal },
    );
    const msg = res.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: (msg?.tool_calls ?? []).flatMap((c) =>
        c.type === 'function' ? [{ name: c.function.name, arguments: c.function.arguments }] : [],
      ),
      model: res.model || this.config.model,
    };
  }
}

export interface ResilienceOptions {
  /** Per attempt. */
  timeoutMs?: number;
  /** Extra attempts on the same endpoint before moving to the next one. */
  retries?: number;
  onError?: (info: { endpoint: number; attempt: number; error: unknown }) => void;
}

export class LlmUnavailableError extends Error {
  constructor(readonly causes: unknown[]) {
    super(`Nenhum modelo respondeu (${causes.length} tentativas).`);
    this.name = 'LlmUnavailableError';
  }
}

/** Timeout + retry on each endpoint, then automatic switch to the next (primary → fallback). */
export class ResilientLlmClient implements LlmClient {
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    private readonly endpoints: LlmClient[],
    private readonly opts: ResilienceOptions = {},
  ) {
    if (endpoints.length === 0) throw new Error('ResilientLlmClient needs at least one endpoint');
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 1;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const causes: unknown[] = [];
    for (const [endpoint, client] of this.endpoints.entries()) {
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          return await withTimeout(this.timeoutMs, (signal) => client.complete({ ...req, signal }));
        } catch (error) {
          causes.push(error);
          this.opts.onError?.({ endpoint, attempt, error });
        }
      }
    }
    throw new LlmUnavailableError(causes);
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`LLM timeout após ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type Env = Record<string, string | undefined>;

function endpointFromEnv(env: Env, prefix: string): LlmEndpointConfig | null {
  const baseURL = env[`${prefix}_BASE_URL`];
  const apiKey = env[`${prefix}_API_KEY`];
  const model = env[`${prefix}_MODEL`];
  return baseURL && apiKey && model ? { baseURL, apiKey, model } : null;
}

/**
 * Builds the production client from LLM_PRIMARY_* and (optional) LLM_FALLBACK_*.
 * Returns null when the primary is not configured, so the caller can disable the AI cleanly.
 */
export function createLlmClientFromEnv(
  env: Env = process.env,
  opts: ResilienceOptions = {},
): LlmClient | null {
  const primary = endpointFromEnv(env, 'LLM_PRIMARY');
  if (!primary) return null;
  const fallback = endpointFromEnv(env, 'LLM_FALLBACK');
  const timeoutMs = Number(env.LLM_TIMEOUT_MS) || undefined;
  return new ResilientLlmClient(
    [primary, ...(fallback ? [fallback] : [])].map((c) => new OpenAiCompatibleClient(c)),
    { timeoutMs, ...opts },
  );
}
