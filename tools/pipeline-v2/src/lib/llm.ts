import { Schema } from "effect";

const OpenRouterChatCompletionResponseSchema = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({
        content: Schema.String,
      }),
    }),
  ),
});

export type OpenRouterChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

export type OpenRouterChatCompletionInput = {
  readonly apiKey: string;
  readonly fetcher: typeof fetch;
  readonly maxOutputTokens: number;
  readonly messages: readonly OpenRouterChatMessage[];
  readonly model: string;
  readonly signal?: AbortSignal;
  readonly temperature?: number;
  readonly responseFormat?: "json_object";
};

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function completeOpenRouterChat(
  input: OpenRouterChatCompletionInput,
): Promise<string> {
  const response = await input.fetcher("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      max_tokens: input.maxOutputTokens,
      response_format:
        input.responseFormat === undefined ? undefined : { type: input.responseFormat },
      temperature: input.temperature ?? 0.2,
    }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  if (!response.ok) {
    const body = await responseText(response);
    const suffix = body.trim().length === 0 ? "" : `: ${body.slice(0, 600)}`;
    throw new Error(`OpenRouter chat completion failed with HTTP ${response.status}${suffix}`);
  }

  const body: unknown = await response.json();
  const decoded = Schema.decodeUnknownSync(OpenRouterChatCompletionResponseSchema)(body);
  const content = decoded.choices[0]?.message.content;
  if (content === undefined || content.trim().length === 0) {
    throw new Error("OpenRouter chat completion returned no text content.");
  }
  return content;
}
