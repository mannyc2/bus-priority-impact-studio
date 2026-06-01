import { describe, expect, test } from "bun:test";

import type {
  AgentHarnessEvent,
  AgentHarnessEventResultMap,
  AgentHarnessOptions,
  AgentHarnessOwnEvent,
  AgentTool,
  AgentToolResult,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";

import {
  type HarnessFactory,
  type HarnessLike,
  type ToolExecutor,
  makeToolLoopRunner,
} from "../../../src/lib/codemode/index.ts";
import type { SandboxResult } from "../../../src/lib/sandbox.ts";

// ---------------------------------------------------------------------------
// Doubles
//
// AgentHarness drives the loop now; we inject a fake `HarnessFactory` that
// returns a `HarnessLike` honoring the same observable contract we depend on:
// it calls each `AgentTool.execute()` per scripted call, fires `tool_result`
// hooks (respecting their `terminate: true` patches), broadcasts AgentEvent
// turn_start/turn_end through subscribers, and resolves `prompt()` with a
// scripted AssistantMessage. That lets us assert trace + caps + usage
// behavior without docker or a real LLM.

const dummyModel = {
  api: "openai-completions",
  provider: "openrouter",
  id: "mock/v0",
} as unknown as Model<Api>;

type ScriptedCall = {
  tool: "ts_exec" | "bash_exec";
  args: { code: string; timeoutSec?: number };
  toolCallId: string;
};

type ToolResultHandler = (
  event: Extract<AgentHarnessOwnEvent, { type: "tool_result" }>,
) => Promise<AgentHarnessEventResultMap["tool_result"]> | AgentHarnessEventResultMap["tool_result"];

function mkHarnessFactory(
  scriptedCalls: ScriptedCall[],
  finalAssistantText: string,
): HarnessFactory {
  return (opts: AgentHarnessOptions): HarnessLike => {
    const toolByName = new Map<string, AgentTool>(
      (opts.tools ?? []).map((t) => [t.name, t]),
    );
    const subscribers: Array<(event: AgentHarnessEvent) => Promise<void> | void> = [];
    let toolResultHandler: ToolResultHandler | undefined;

    const emit = async (event: AgentHarnessEvent) => {
      for (const s of subscribers) {
        await s(event);
      }
    };

    const prompt = async (_text: string): Promise<AssistantMessage> => {
      await emit({ type: "agent_start" });
      await emit({ type: "turn_start" });

      let terminated = false;
      for (const call of scriptedCalls) {
        if (terminated) break;
        const tool = toolByName.get(call.tool);
        if (!tool) throw new Error(`scripted unknown tool ${call.tool}`);
        const result = (await tool.execute(call.toolCallId, call.args)) as AgentToolResult<unknown>;
        if (toolResultHandler) {
          const patch = await toolResultHandler({
            type: "tool_result",
            toolCallId: call.toolCallId,
            toolName: call.tool,
            input: call.args,
            content: result.content,
            details: result.details,
            isError: false,
          });
          if (patch?.terminate) terminated = true;
        }
      }

      const finalMessage: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: finalAssistantText }],
        api: dummyModel.api,
        provider: dummyModel.provider,
        model: dummyModel.id,
        stopReason: "stop",
        timestamp: Date.now(),
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        id: "fake-final",
      } as AssistantMessage;

      await emit({ type: "turn_end", message: finalMessage, toolResults: [] });
      await emit({ type: "agent_end", messages: [finalMessage] });

      return finalMessage;
    };

    return {
      on: ((type, handler) => {
        if (type === "tool_result") {
          toolResultHandler = handler as ToolResultHandler;
        }
        return () => {};
      }) as HarnessLike["on"],
      subscribe: (listener) => {
        subscribers.push(listener);
        return () => {};
      },
      prompt,
      abort: async () => ({ clearedSteer: [], clearedFollowUp: [] }),
    };
  };
}

function mkSandboxResult(overrides: Partial<SandboxResult> = {}): SandboxResult {
  return {
    stdout: "42\n",
    stderr: "",
    exitCode: 0,
    durationMs: 5,
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    ...overrides,
  };
}

function scriptedExecutor(results: SandboxResult[]): ToolExecutor {
  let idx = 0;
  return async () => {
    const next = results[idx];
    if (!next) throw new Error("scriptedExecutor exhausted");
    idx += 1;
    return next;
  };
}

// ---------------------------------------------------------------------------
// Tests

describe("makeToolLoopRunner (AgentHarness)", () => {
  test("returns the final assistant text when no tools are called", async () => {
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      executor: scriptedExecutor([]),
      harnessFactory: mkHarnessFactory([], '{"proposals":[]}'),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.finalText).toBe('{"proposals":[]}');
    expect(r.toolUseTrace).toEqual([]);
    expect(r.capsHit).toBeNull();
  });

  test("records a trace entry per executed tool call", async () => {
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      executor: scriptedExecutor([
        mkSandboxResult({ stdout: "first\n" }),
        mkSandboxResult({ stdout: "second\n" }),
      ]),
      harnessFactory: mkHarnessFactory(
        [
          { tool: "ts_exec", args: { code: "console.log('first')" }, toolCallId: "tc-1" },
          { tool: "bash_exec", args: { code: "echo second" }, toolCallId: "tc-2" },
        ],
        "done",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.finalText).toBe("done");
    expect(r.toolUseTrace.length).toBe(2);
    expect(r.toolUseTrace[0]!.tool).toBe("ts_exec");
    expect(r.toolUseTrace[0]!.code).toBe("console.log('first')");
    expect(r.toolUseTrace[0]!.stdoutPreview).toBe("first\n");
    expect(r.toolUseTrace[1]!.tool).toBe("bash_exec");
    expect(r.toolUseTrace[1]!.code).toBe("echo second");
    expect(r.capsHit).toBeNull();
  });

  test("capsHit='calls' when the tool-call budget is exhausted", async () => {
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      maxToolCalls: 1,
      executor: scriptedExecutor([
        mkSandboxResult({ stdout: "x\n" }),
        mkSandboxResult({ stdout: "y\n" }),
      ]),
      harnessFactory: mkHarnessFactory(
        [
          { tool: "ts_exec", args: { code: "x" }, toolCallId: "tc-1" },
          { tool: "ts_exec", args: { code: "y" }, toolCallId: "tc-2" },
        ],
        "should-not-reach",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.capsHit).toBe("calls");
    expect(r.toolUseTrace.length).toBe(1);
  });

  test("forwards events to the onEvent subscriber and rolls up usage", async () => {
    const seenEvents: string[] = [];
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      executor: scriptedExecutor([mkSandboxResult({ stdout: "ok\n" })]),
      onEvent: (event) => {
        seenEvents.push(event.type);
      },
      harnessFactory: mkHarnessFactory(
        [{ tool: "ts_exec", args: { code: "x" }, toolCallId: "tc-1" }],
        "done",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(seenEvents).toContain("agent_start");
    expect(seenEvents).toContain("turn_start");
    expect(seenEvents).toContain("turn_end");
    expect(seenEvents).toContain("agent_end");
    expect(r.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
  });

  test("swallows subscriber exceptions instead of killing the loop", async () => {
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      executor: scriptedExecutor([]),
      onEvent: () => {
        throw new Error("subscriber blew up");
      },
      harnessFactory: mkHarnessFactory([], "still finished"),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.finalText).toBe("still finished");
  });

  test("capsHit='stdout' when cumulative stdout passes the cap", async () => {
    const big = "x".repeat(2048);
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      maxTotalStdoutBytes: 1024,
      executor: scriptedExecutor([mkSandboxResult({ stdout: big })]),
      harnessFactory: mkHarnessFactory(
        [{ tool: "ts_exec", args: { code: "console.log(big)" }, toolCallId: "tc-1" }],
        "should-not-reach",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.capsHit).toBe("stdout");
    expect(r.toolUseTrace.length).toBe(1);
  });
});
