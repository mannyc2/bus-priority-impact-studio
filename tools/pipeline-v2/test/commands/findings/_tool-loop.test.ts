import { describe, expect, test } from "bun:test";

import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  runAgentLoop,
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";

import {
  type ToolExecutor,
  makeToolLoopRunner,
} from "../../../src/commands/findings/_tool_loop.ts";
import type { SandboxResult } from "../../../src/lib/sandbox.ts";

// ---------------------------------------------------------------------------
// Doubles
//
// pi-agent-core drives the loop now; we inject a fake runAgentLoop that
// invokes each `AgentTool.execute()` once with scripted arguments, calls
// `afterToolCall` for each, and returns a final assistant transcript. That
// lets us assert trace + caps behavior without docker or a real LLM.

const dummyModel = {
  api: "openai-completions",
  provider: "openrouter",
  id: "mock/v0",
} as unknown as Model<Api>;

type ScriptedCall = { tool: "python_exec" | "bash_exec"; args: { code: string; timeoutSec?: number }; toolCallId: string };

function mkRunAgentLoop(
  scriptedCalls: ScriptedCall[],
  finalAssistantText: string,
): typeof runAgentLoop {
  const fn = async (
    prompts: AgentMessage[],
    context: AgentContext,
    config: AgentLoopConfig,
    emit: (event: AgentEvent) => Promise<void> | void,
  ): Promise<AgentMessage[]> => {
    await emit({ type: "agent_start" });
    await emit({ type: "turn_start" });

    const tools = context.tools ?? [];
    const toolByName = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));

    let terminated = false;
    for (const call of scriptedCalls) {
      if (terminated) break;
      const tool = toolByName.get(call.tool);
      if (!tool) throw new Error(`scripted unknown tool ${call.tool}`);
      const result = await tool.execute(call.toolCallId, call.args);
      const afterToolCallHook = config.afterToolCall;
      if (afterToolCallHook) {
        const hookResult = await afterToolCallHook({
          assistantMessage: {} as never,
          toolCall: { type: "toolCall", id: call.toolCallId, name: call.tool, arguments: call.args },
          args: call.args,
          result,
          isError: false,
          context,
        });
        if (hookResult?.terminate) terminated = true;
      }
    }

    const finalMessage: AgentMessage = {
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
    } as AgentMessage;

    await emit({ type: "turn_end", message: finalMessage, toolResults: [] });
    await emit({ type: "agent_end", messages: [...prompts, finalMessage] });

    return [...prompts, finalMessage];
  };
  return fn as unknown as typeof runAgentLoop;
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

describe("makeToolLoopRunner (pi-agent-core)", () => {
  test("returns the final assistant text when no tools are called", async () => {
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      executor: scriptedExecutor([]),
      runAgentLoopFn: mkRunAgentLoop([], '{"proposals":[]}'),
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
      runAgentLoopFn: mkRunAgentLoop(
        [
          { tool: "python_exec", args: { code: "print('first')" }, toolCallId: "tc-1" },
          { tool: "bash_exec", args: { code: "echo second" }, toolCallId: "tc-2" },
        ],
        "done",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.finalText).toBe("done");
    expect(r.toolUseTrace.length).toBe(2);
    expect(r.toolUseTrace[0]!.tool).toBe("python_exec");
    expect(r.toolUseTrace[0]!.code).toBe("print('first')");
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
      runAgentLoopFn: mkRunAgentLoop(
        [
          { tool: "python_exec", args: { code: "x" }, toolCallId: "tc-1" },
          { tool: "python_exec", args: { code: "y" }, toolCallId: "tc-2" },
        ],
        "should-not-reach",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.capsHit).toBe("calls");
    expect(r.toolUseTrace.length).toBe(1);
  });

  test("capsHit='stdout' when cumulative stdout passes the cap", async () => {
    const big = "x".repeat(2048);
    const loop = makeToolLoopRunner({
      model: dummyModel,
      apiKey: "test-key",
      maxTotalStdoutBytes: 1024,
      executor: scriptedExecutor([mkSandboxResult({ stdout: big })]),
      runAgentLoopFn: mkRunAgentLoop(
        [{ tool: "python_exec", args: { code: "print(big)" }, toolCallId: "tc-1" }],
        "should-not-reach",
      ),
    });
    const r = await loop({ systemPrompt: "sys", userMessage: "user" });
    expect(r.capsHit).toBe("stdout");
    expect(r.toolUseTrace.length).toBe(1);
  });
});
