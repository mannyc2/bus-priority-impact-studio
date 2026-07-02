// Round-trip contract test for the pi-harness response adapter.
//
// All three migrated Tier 2 forced-tool-call surfaces (DeepSeek candidates,
// DeepSeek intervention records, OpenRouter rendered-image OCR) funnel their
// pi-ai `completeToolCall` result through `synthesizeOpenRouterCallResult`, which
// reconstructs the legacy OpenAI-completions `{response, body}` the per-step
// consumers parse. The `llm-request-shape` suite pins the *request*; this pins the
// *response* contract — that the synthesized body is consumed by
// `extractToolCallArguments` / `openRouterErrorMessage` exactly as the real
// provider body was, so re-pointing the live commands onto the migrated modules
// is behavior-preserving.
import { describe, expect, test } from "bun:test";
import {
  openRouterErrorMessage,
  synthesizeOpenRouterCallResult,
} from "../../../../src/commands/docs/tier2/_llm-clients.ts";
import { extractToolCallArguments } from "../../../../src/commands/docs/tier2/_shared.ts";
import type { CompleteToolCallResult } from "../../../../src/lib/llm.ts";

const TOOL_NAME = "record_tier2_ocr_markdown_candidates";

describe("synthesizeOpenRouterCallResult — pi result -> legacy {response, body}", () => {
  test("forced tool call round-trips through extractToolCallArguments", () => {
    const args = {
      sourceId: "test_source",
      candidates: [{ claim: "SBS cut wait by 18%" }],
      page: 3,
    };
    const result: CompleteToolCallResult = {
      toolCall: { id: "call_abc", name: TOOL_NAME, arguments: args },
      usage: { input: 1200, output: 340, totalTokens: 1540 },
      stopReason: "toolUse",
      errorMessage: null,
      attempts: 1,
    };

    const { response, body } = synthesizeOpenRouterCallResult(result);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    // The consumer extracts the forced tool call's parsed arguments by name.
    expect(extractToolCallArguments(body, TOOL_NAME)).toEqual(args);
    // A different tool name finds nothing (no accidental cross-wiring).
    expect(extractToolCallArguments(body, "some_other_tool")).toBeNull();
    // Usage is reshaped into the OpenAI-completions shape the consumers read.
    expect((body as { usage?: unknown }).usage).toEqual({
      prompt_tokens: 1200,
      completion_tokens: 340,
      total_tokens: 1540,
    });
    expect(openRouterErrorMessage(body)).toBeNull();
  });

  test("omits usage when pi-ai reported none", () => {
    const result: CompleteToolCallResult = {
      toolCall: { id: "call_x", name: TOOL_NAME, arguments: { sourceId: "s" } },
      usage: null,
      stopReason: "toolUse",
      errorMessage: null,
      attempts: 1,
    };
    const { response, body } = synthesizeOpenRouterCallResult(result);
    expect(response.ok).toBe(true);
    expect((body as { usage?: unknown }).usage).toBeUndefined();
  });

  test("provider error becomes a non-ok body surfaced by openRouterErrorMessage", () => {
    const result: CompleteToolCallResult = {
      toolCall: null,
      usage: null,
      stopReason: "error",
      errorMessage: "402 Insufficient credits",
      attempts: 3,
    };
    const { response, body } = synthesizeOpenRouterCallResult(result);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(502);
    expect(openRouterErrorMessage(body)).toBe("402 Insufficient credits");
    expect(extractToolCallArguments(body, TOOL_NAME)).toBeNull();
  });

  test("a stop with no tool call is treated as a non-ok 'missing tool call' body", () => {
    const result: CompleteToolCallResult = {
      toolCall: null,
      usage: { input: 50, output: 0, totalTokens: 50 },
      stopReason: "stop",
      errorMessage: null,
      attempts: 1,
    };
    const { response, body } = synthesizeOpenRouterCallResult(result);
    expect(response.ok).toBe(false);
    expect(openRouterErrorMessage(body)).toBe("LLM response did not include a tool call.");
  });
});
