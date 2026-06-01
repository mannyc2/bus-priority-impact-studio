import {
  type Api,
  type Context,
  complete,
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
 * OpenAI-compatible Pioneer model descriptor. Pioneer is intentionally kept as
 * a custom provider here because pi-ai 0.78 does not ship a built-in Pioneer
 * catalog. Pioneer's OpenAI-compatible default is
 * https://api.pioneer.ai/v1; PIONEER_BASE_URL can override it for local
 * testing or an enterprise endpoint. Pioneer accepts the API key as both the
 * OpenAI-compatible bearer token and X-API-Key.
 */
export function pioneerModel(
  modelId: string,
  baseUrl = pioneerBaseUrl(),
): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "pioneer",
    baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256_000,
    maxTokens: 16_000,
  };
}

export function pioneerBaseUrl(): string {
  return (process.env["PIONEER_BASE_URL"]?.trim() || "https://api.pioneer.ai/v1").replace(
    /\/+$/,
    "",
  );
}

export function providerHeaders(
  provider: string,
  apiKey: string,
): Record<string, string> | undefined {
  if (provider === "pioneer") {
    return { "X-API-Key": apiKey };
  }
  return undefined;
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

/**
 * Resolve a deepseek model against pi-ai's generated catalog. Returns the
 * catalog entry when present (e.g. "deepseek-v4-flash", "deepseek-v4-pro" —
 * which ship with the right thinkingFormat: "deepseek",
 * requiresReasoningContentOnAssistantMessages, thinkingLevelMap, etc.).
 * Returns null for legacy ids like "deepseek-chat" / "deepseek-reasoner";
 * caller should fall back to the handcrafted `deepSeekModel`.
 */
export function getDeepSeekCatalogModel(modelId: string): Model<Api> | null {
  ensureProviders();
  const model = getModel("deepseek" as never, modelId as never);
  return (model ?? null) as Model<Api> | null;
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
  headers?: Record<string, string> | undefined;
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
    throw new Error("API key is required.");
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
        ...(options.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: options.maxOutputTokens }),
        ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
        ...(options.headers === undefined ? {} : { headers: options.headers }),
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
        ? new Error(`LLM request timed out after ${options.timeoutMs}ms for ${model.id}.`)
        : error;
      lastError = resolved;
      if (attempt >= options.maxAttempts) break;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("LLM request failed with no error.");
}

/** A single OpenAI-style content block as the Tier 2 callers build them. */
export type ToolCallContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type ToolCallMessage = {
  role: "system" | "user";
  content: string | ToolCallContentBlock[];
};

export type CompleteToolCallOptions = {
  apiKey: string;
  timeoutMs: number;
  maxAttempts: number;
  /** Name of the function the model is forced to call (`tool_choice`). */
  toolName: string;
  /** OpenAI-style messages; system/user, string or text+image content blocks. */
  messages: ToolCallMessage[];
  /** Function tools in OpenAI shape: `{ name, description, parameters }`. */
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  maxOutputTokens?: number | undefined;
  reasoning?: ThinkingLevel | undefined;
  headers?: Record<string, string> | undefined;
  /**
   * Swap `globalThis.fetch` for the duration of the call. The pi-ai transport
   * runs through the OpenAI SDK, which uses the global fetch; tests inject a
   * stub here to drive canned provider responses without real network I/O.
   */
  fetch?: typeof globalThis.fetch | undefined;
};

export type CompleteToolCallResult = {
  /** The forced tool call when the model produced one; null otherwise. */
  toolCall: { id: string; name: string; arguments: Record<string, unknown> } | null;
  /** pi-ai's normalized token usage, or null when the provider omitted it. */
  usage: { input: number; output: number; totalTokens: number } | null;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  /** Provider/transport error message when stopReason is "error", else null. */
  errorMessage: string | null;
  attempts: number;
};

/**
 * Run a forced-tool-call completion through the pi harness and surface the tool
 * call, usage, and stop reason in a transport-agnostic shape. The Tier 2 callers
 * synthesize the legacy `{response, body}` contract from this so their downstream
 * consumers (`extractToolCallArguments`, `openRouterErrorMessage`, …) are unchanged.
 *
 * pi-ai streams via the OpenAI SDK, so `service_tier`, OpenRouter file
 * annotations, and the raw provider body are NOT recoverable here; callers that
 * relied on those degrade gracefully (null service tier, empty annotations).
 */
export async function completeToolCall(
  model: Model<Api>,
  options: CompleteToolCallOptions,
): Promise<CompleteToolCallResult> {
  ensureProviders();
  if (options.apiKey.trim().length === 0) {
    throw new Error("API key is required.");
  }

  // pi-ai's Context carries the system prompt out-of-band (`systemPrompt`), not as
  // a `role:"system"` entry in `messages` — those are silently dropped. Hoist any
  // system messages (always string content in the Tier 2 callers) into
  // `systemPrompt`; the rest become user messages.
  const systemPrompt = options.messages
    .filter((message) => message.role === "system")
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
  const userMessages = options.messages.filter((message) => message.role !== "system");
  const context: Context = {
    ...(systemPrompt.length > 0 ? { systemPrompt } : {}),
    messages: userMessages.map((message) => ({
      role: "user" as const,
      content:
        typeof message.content === "string"
          ? message.content
          : message.content.map((block) =>
              block.type === "text"
                ? { type: "text" as const, text: block.text }
                : { type: "image" as const, data: block.data, mimeType: block.mimeType },
            ),
      timestamp: Date.now(),
    })) as Context["messages"],
    tools: options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as never,
    })),
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const originalFetch = globalThis.fetch;
    if (options.fetch !== undefined) {
      globalThis.fetch = options.fetch;
    }
    try {
      const result = await complete(model, context, {
        apiKey: options.apiKey,
        signal: controller.signal,
        toolChoice: { type: "function", function: { name: options.toolName } },
        maxRetries: 0,
        ...(options.maxOutputTokens === undefined ? {} : { maxTokens: options.maxOutputTokens }),
        ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
        ...(options.headers === undefined ? {} : { headers: options.headers }),
      } as never);

      const toolCallBlock = result.content.find(
        (
          block,
        ): block is {
          type: "toolCall";
          id: string;
          name: string;
          arguments: Record<string, unknown>;
        } => block.type === "toolCall",
      );
      const usage = result.usage
        ? {
            input: result.usage.input,
            output: result.usage.output,
            totalTokens: result.usage.totalTokens,
          }
        : null;
      return {
        toolCall: toolCallBlock
          ? { id: toolCallBlock.id, name: toolCallBlock.name, arguments: toolCallBlock.arguments }
          : null,
        usage,
        stopReason: result.stopReason,
        errorMessage:
          result.stopReason === "error"
            ? (result.errorMessage ?? "Provider returned an error stop reason")
            : null,
        attempts: attempt,
      };
    } catch (error) {
      lastError = controller.signal.aborted
        ? new Error(`LLM request timed out after ${options.timeoutMs}ms for ${model.id}.`)
        : error;
      if (attempt >= options.maxAttempts) break;
    } finally {
      clearTimeout(timeout);
      if (options.fetch !== undefined) {
        globalThis.fetch = originalFetch;
      }
    }
  }
  throw lastError ?? new Error("LLM request failed with no error.");
}
