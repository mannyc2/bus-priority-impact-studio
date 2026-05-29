import {
  complete,
  type Context,
  type Model,
  registerBuiltInApiProviders,
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

export type CompleteJsonOptions = {
  apiKey: string;
  timeoutMs: number;
  maxAttempts: number;
  maxOutputTokens?: number | undefined;
  responseFormatJson?: boolean | undefined;
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
  model: Model<"openai-completions">,
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
      const result = await complete(model, context, {
        apiKey: options.apiKey,
        signal: controller.signal,
        ...(options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens }),
        ...(options.responseFormatJson
          ? { providerOptions: { response_format: { type: "json_object" } } }
          : {}),
      });
      const text = result.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text.length === 0) {
        throw new Error("LLM response did not include any text content.");
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
