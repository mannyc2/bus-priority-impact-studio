import {
  type Api,
  complete,
  type Context,
  getModel,
  type Model,
  registerBuiltInApiProviders,
  type ThinkingLevel,
} from "@earendil-works/pi-ai";

let providersRegistered = false;
function ensureProviders(): void {
  if (providersRegistered) return;
  registerBuiltInApiProviders();
  providersRegistered = true;
}

/**
 * Build a pi-ai custom `Model<"openai-completions">` that points at OpenRouter's
 * chat-completions endpoint. v1's pipeline routed many dev-side LLM calls through
 * OpenRouter using arbitrary upstream model IDs ("deepseek/deepseek-chat-v3-0324",
 * "qwen/qwen3.7-max", etc.). pi-ai's generated catalog only knows about the three
 * "openrouter/auto" routing IDs, so we register the specific model on demand.
 *
 * Cost is set to zero — pi-ai's accounting is best-effort and OpenRouter exposes
 * real per-call cost in its response body if needed. contextWindow/maxTokens are
 * conservative defaults that the caller can override per-request via `maxOutputTokens`.
 */
export function openRouterModel(modelId: string): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_000,
  };
}

/**
 * Direct DeepSeek model descriptor (OpenAI-compatible API at
 * https://api.deepseek.com/v1). Use when going direct rather than via
 * OpenRouter — same OpenAI completions wire format, separate billing.
 *
 * Common modelId values: "deepseek-chat" (V3 chat), "deepseek-reasoner" (R1).
 */
/**
 * Resolve a model by id against pi-ai's generated OpenRouter catalog. Returns
 * the catalog entry (with reasoning + thinkingLevelMap + compat fields wired)
 * when present; null when the id is custom or unknown. Use the catalog model
 * whenever it exists so thinking-mode and provider-specific behavior come
 * along for free.
 */
export function getOpenRouterCatalogModel(modelId: string): Model<Api> | null {
  const model = getModel("openrouter" as never, modelId as never);
  return (model ?? null) as Model<Api> | null;
}

export function deepSeekModel(modelId: string): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_000,
  };
}

export type CompleteJsonOptions = {
  apiKey: string;
  timeoutMs: number;
  maxAttempts: number;
  maxOutputTokens?: number | undefined;
  responseFormatJson?: boolean | undefined;
  reasoning?: ThinkingLevel | undefined;
  /**
   * Extra provider-specific body fields. Merged onto the providerOptions object
   * (responseFormatJson contributes `response_format`). Use for DeepSeek's
   * `thinking: {type: "enabled"}` + `reasoning_effort` extensions or other
   * non-standard fields the upstream accepts.
   */
  providerOptions?: Record<string, unknown> | undefined;
  describeAttemptError?: ((error: unknown) => string) | undefined;
  appName?: string | undefined;
};

export type CompleteJsonResult = {
  text: string;
  attempts: number;
};

/**
 * Run an OpenRouter chat completion with retry + abort-on-timeout and return the
 * assistant message text. The caller parses the text as JSON (or whatever shape
 * the prompt demands); we only wrap transport + retry.
 *
 * Behavior matches v1's hand-rolled openrouter loop (max-attempts with exponential
 * description of the prior error stitched into the next prompt by the caller),
 * routed through pi-ai so token/cost/streaming hooks are uniform across the
 * pipeline. v1's per-call OpenRouter headers ("HTTP-Referer", "X-Title") are not
 * wired here — pi-ai stamps its own User-Agent and that's been acceptable for
 * dev-side use.
 */
export async function completeJson(
  model: Model<Api>,
  context: Context,
  options: CompleteJsonOptions,
): Promise<CompleteJsonResult> {
  ensureProviders();
  if (options.apiKey.trim().length === 0) {
    throw new Error("OPENROUTER_API_KEY is required.");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const providerOptions: Record<string, unknown> = {
        ...(options.responseFormatJson ? { response_format: { type: "json_object" } } : {}),
        ...(options.providerOptions ?? {}),
      };
      const result = await complete(model, context, {
        apiKey: options.apiKey,
        signal: controller.signal,
        ...(options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens }),
        ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      });
      // Propagate provider-reported errors verbatim — pi-ai stuffs them on
      // result.errorMessage when stopReason is "error". The previous behavior
      // ("LLM response did not include any text content") buried real causes
      // like "402 Insufficient credits" or rate limits.
      if (result.stopReason === "error" && result.errorMessage) {
        throw new Error(`LLM provider error: ${result.errorMessage}`);
      }
      const text = result.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text.length === 0) {
        const blockTypes = result.content.map((b) => b.type).join(",");
        throw new Error(
          `LLM response had no text content (stopReason=${result.stopReason} blocks=[${blockTypes}]). Raise --max-output-tokens, drop --thinking, or check provider quotas.`,
        );
      }
      return { text, attempts: attempt };
    } catch (error) {
      const resolved = controller.signal.aborted
        ? new Error(
            `LLM request timed out after ${options.timeoutMs}ms for ${model.id}.`,
          )
        : error;
      lastError = resolved;
      if (attempt >= options.maxAttempts) break;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("LLM request failed with no error.");
}
