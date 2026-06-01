// Tier 2 dev-side LLM HTTP clients (OpenRouter + DeepSeek chat-completions),
// extracted from the former _shared.ts monolith during the per-step decomposition.
//
// These hand-rolled clients model provider-specific behavior the generic harness
// did not historically cover: OpenRouter's `service_tier`, `plugins.file-parser`
// for PDF input, and forced multimodal `tool_choice`; DeepSeek's thinking-mode
// disable (incompatible with a forced tool_choice) and its distinct transient-
// failure shapes. Phase 2 migrates their *transport* onto the pi harness
// (`lib/llm.ts`) while preserving the exact wire body — locked by the
// `llm-request-shape` snapshot oracle.
//
// Runtime-leaf: the only things imported from the core module are the `FetchLike`
// *type* (erased at runtime); the pi harness adapter pulls only from `lib/llm.ts`,
// so there is no import cycle.
import {
  type CompleteToolCallResult,
  completeToolCall,
  deepSeekModel,
  getDeepSeekCatalogModel,
  openRouterModel,
  pioneerBaseUrl,
  type ToolCallMessage,
} from "../../../lib/llm.ts";
import type { FetchLike } from "./_shared.ts";

const DEFAULT_OPENROUTER_MAX_ATTEMPTS = 3;
// pi harness call budgets. The legacy hand-rolled DeepSeek client had no per-call
// timeout (only attempt-based backoff); pick a generous ceiling so genuinely slow
// extractions still complete while a hung socket eventually aborts.
const PI_CALL_TIMEOUT_MS = 600_000;
const PI_TOOL_CALL_MAX_ATTEMPTS = 3;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OpenRouterCallResult = { response: Response; body: unknown };

/**
 * Reconstruct the legacy `{response, body}` contract from a pi-harness
 * `completeToolCall` result, so the existing per-step consumers
 * (`extractToolCallArguments`, `openRouterErrorMessage`, `missingToolCallErrorMessage`,
 * `body.usage`) keep working byte-for-byte against the persisted `response.json`.
 *
 * Success → 200 with an OpenAI-completions body carrying the forced tool call and
 * reshaped usage. Provider/transport error → a non-ok Response (502) plus an
 * `{error:{message}}` body so the consumers' `!response.ok` / `openRouterErrorMessage`
 * branch fires exactly as before.
 *
 * What the raw HTTP body used to carry but pi-ai cannot recover — OpenRouter
 * `service_tier`, file annotations, and raw provider `usage` — is intentionally
 * absent; the OCR consumer treats a missing service tier / empty annotations as a
 * no-op, and `usage` is the reshaped pi-ai counts.
 */
export function synthesizeOpenRouterCallResult(
  result: CompleteToolCallResult,
): OpenRouterCallResult {
  if (result.stopReason === "error" || result.toolCall === null) {
    const message =
      result.errorMessage ??
      (result.toolCall === null
        ? "LLM response did not include a tool call."
        : "LLM provider error.");
    const body = { error: { message } };
    return {
      response: new Response(JSON.stringify(body), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      }),
      body,
    };
  }

  const usage = result.usage
    ? {
        prompt_tokens: result.usage.input,
        completion_tokens: result.usage.output,
        total_tokens: result.usage.totalTokens,
      }
    : undefined;
  const body = {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: result.toolCall.id,
              type: "function",
              function: {
                name: result.toolCall.name,
                arguments: JSON.stringify(result.toolCall.arguments),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    ...(usage === undefined ? {} : { usage }),
  };
  return {
    response: new Response(JSON.stringify(body), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    }),
    body,
  };
}

/**
 * DeepSeek text-only forced tool call through the pi harness. Prefers the pi-ai
 * catalog model (`deepseek-v4-pro`) — it ships `thinkingFormat:"deepseek"` so the
 * harness auto-injects `thinking:{type:"disabled"}` when reasoning is off, matching
 * the legacy client's manual disable that keeps forced `tool_choice` working.
 * Falls back to the handcrafted descriptor for ids the catalog does not know.
 */
export async function callDeepSeekToolCallViaPi(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  toolName: string;
  messages: ToolCallMessage[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  const model = getDeepSeekCatalogModel(input.model) ?? deepSeekModel(input.model);
  const result = await completeToolCall(model, {
    apiKey: input.apiKey,
    timeoutMs: PI_CALL_TIMEOUT_MS,
    maxAttempts: PI_TOOL_CALL_MAX_ATTEMPTS,
    toolName: input.toolName,
    messages: input.messages,
    tools: input.tools,
    maxOutputTokens: input.maxTokens,
    fetch: input.fetcher as unknown as typeof globalThis.fetch,
  });
  return synthesizeOpenRouterCallResult(result);
}

/**
 * OpenRouter vision forced tool call through the pi harness (rendered-image OCR
 * path). pi-ai serializes the `{type:"image"}` block to OpenRouter's
 * `{type:"image_url",image_url:{url:"data:…"}}`; `service_tier`/`plugins` and file
 * annotations are not expressible here and are intentionally dropped — the image
 * OCR path neither sends `plugins.file-parser` nor reads served service tier.
 */
export async function callOpenRouterToolCallViaPi(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  toolName: string;
  messages: ToolCallMessage[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  const model = openRouterModel(input.model);
  const result = await completeToolCall(model, {
    apiKey: input.apiKey,
    timeoutMs: PI_CALL_TIMEOUT_MS,
    maxAttempts: PI_TOOL_CALL_MAX_ATTEMPTS,
    toolName: input.toolName,
    messages: input.messages,
    tools: input.tools,
    maxOutputTokens: input.maxTokens,
    fetch: input.fetcher as unknown as typeof globalThis.fetch,
  });
  return synthesizeOpenRouterCallResult(result);
}

function pioneerChatCompletionsUrl(): string {
  return `${pioneerBaseUrl()}/chat/completions`;
}

function toPioneerMessage(message: ToolCallMessage): Record<string, unknown> {
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map((block) =>
            block.type === "text"
              ? { type: "text", text: block.text }
              : {
                  type: "image_url",
                  image_url: { url: `data:${block.mimeType};base64,${block.data}` },
                },
          ),
  };
}

export async function callPioneerToolCallDirect(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  toolName: string;
  messages: ToolCallMessage[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  return postPioneerChatCompletions({
    apiKey: input.apiKey,
    body: {
      model: input.model,
      max_tokens: input.maxTokens,
      messages: input.messages.map(toPioneerMessage),
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: {
        type: "function",
        function: { name: input.toolName },
      },
      temperature: 0,
    },
    fetcher: input.fetcher,
  });
}

function openRouterErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !("error" in body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (error !== null && typeof error === "object" && !Array.isArray(error)) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      return String(code);
    }
  }
  return null;
}

function isTransientOpenRouterFailure(result: OpenRouterCallResult): boolean {
  if (result.response.status === 429 || result.response.status >= 500) {
    return true;
  }
  const code = openRouterErrorCode(result.body);
  if (code === "429" || code === "500" || code === "502" || code === "503" || code === "504") {
    return true;
  }
  const message = openRouterErrorMessage(result.body)?.toLowerCase() ?? "";
  return (
    message.includes("temporarily") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("try again") ||
    message.includes("overloaded") ||
    message.includes("(code: 503)")
  );
}

export async function postOpenRouterChatCompletions(input: {
  apiKey: string;
  title: string;
  body: Record<string, unknown>;
  fetcher: FetchLike;
  maxAttempts?: number;
}): Promise<OpenRouterCallResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_OPENROUTER_MAX_ATTEMPTS;
  let lastResult: OpenRouterCallResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await input.fetcher("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/",
        "X-Title": input.title,
      },
      body: JSON.stringify(input.body),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawText: text };
    }
    const result = { response, body };
    lastResult = result;
    if (attempt >= maxAttempts || !isTransientOpenRouterFailure(result)) {
      return result;
    }
    await sleepMs(500 * attempt);
  }
  if (lastResult === null) {
    throw new Error("OpenRouter request loop exited without a response.");
  }
  return lastResult;
}

export async function postPioneerChatCompletions(input: {
  apiKey: string;
  body: Record<string, unknown>;
  fetcher: FetchLike;
  maxAttempts?: number;
}): Promise<OpenRouterCallResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_OPENROUTER_MAX_ATTEMPTS;
  let lastResult: OpenRouterCallResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await input.fetcher(pioneerChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "X-API-Key": input.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawText: text };
    }
    const result = { response, body };
    lastResult = result;
    if (attempt >= maxAttempts || !isTransientOpenRouterFailure(result)) {
      return result;
    }
    await sleepMs(500 * attempt);
  }
  if (lastResult === null) {
    throw new Error("Pioneer request loop exited without a response.");
  }
  return lastResult;
}

export function openRouterErrorMessage(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !("error" in body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") {
    return error;
  }
  if (error !== null && typeof error === "object" && !Array.isArray(error)) {
    const record = error as { message?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message : null;
    const code =
      typeof record.code === "string" || typeof record.code === "number"
        ? String(record.code)
        : null;
    if (message !== null && code !== null) {
      return `${message} (code: ${code})`;
    }
    if (message !== null) {
      return message;
    }
  }
  return "OpenRouter response contained an error object.";
}

export function servedServiceTier(body: unknown): string | null {
  return typeof (body as { service_tier?: unknown }).service_tier === "string"
    ? (body as { service_tier: string }).service_tier
    : null;
}
