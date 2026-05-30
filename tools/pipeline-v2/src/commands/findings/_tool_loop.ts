import {
  type AfterToolCallContext,
  type AfterToolCallResult,
  type AgentContext,
  type AgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
  type AgentToolResult,
  runAgentLoop,
} from "@earendil-works/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  type Message,
  type Model,
  type Static,
  Type,
  type Usage,
} from "@earendil-works/pi-ai";

import { runBash, runPython, type SandboxResult } from "../../lib/sandbox.ts";

// ---------------------------------------------------------------------------
// Tools — typebox schemas via pi-ai's re-exported `Type`. Each tool is an
// `AgentTool` (extends pi-ai's `Tool` with label + execute) which pi-agent-core
// dispatches inside the loop.

const pythonExecParams = Type.Object(
  {
    code: Type.String({
      minLength: 1,
      maxLength: 8000,
      description:
        "Python source. Runs inside the bp-sandbox container with bp_corpus on PYTHONPATH, no network, read-only mounts on /work/data and /work/knowledge.",
    }),
    timeoutSec: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 120,
        description: "Wall-time cap in seconds (default 30, max 120).",
      }),
    ),
  },
  { additionalProperties: false },
);

const bashExecParams = Type.Object(
  {
    code: Type.String({
      minLength: 1,
      maxLength: 4000,
      description:
        "Bash command(s). Same sandbox constraints as python_exec. Useful for `ls`, `rg`, `jq` over the corpus.",
    }),
    timeoutSec: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 60,
        description: "Wall-time cap in seconds (default 15, max 60).",
      }),
    ),
  },
  { additionalProperties: false },
);

type PythonExecArgs = Static<typeof pythonExecParams>;
type BashExecArgs = Static<typeof bashExecParams>;

const PYTHON_EXEC_DESCRIPTION =
  "Run Python in the sandbox. Returns stdout/stderr/exitCode. Use this to slice the corpus via bp_corpus and to compute values you intend to cite. Code you cite via `code_execution` evidenceRefs will be re-executed at validation — keep it deterministic (no datetime.now, random, time.time).";

const BASH_EXEC_DESCRIPTION =
  "Run bash in the sandbox. Same determinism rules as python_exec apply for any code you intend to cite.";

// ---------------------------------------------------------------------------
// Caller-facing types — kept stable across the pi-agent-core refactor so
// _runner.ts and the codemode tests need no changes.

export type ToolUseTraceEntry = {
  toolCallId: string;
  tool: "python_exec" | "bash_exec";
  code: string;
  timeoutSec: number | undefined;
  exitCode: number;
  stdoutPreview: string;
  stderrPreview: string;
  durationMs: number;
  stdoutBytes: number;
  stdoutTruncated: boolean;
  timedOut: boolean;
};

export type ToolLoopInput = {
  systemPrompt: string;
  userMessage: string;
};

export type ToolLoopUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type ToolLoopResult = {
  finalText: string;
  toolUseTrace: ToolUseTraceEntry[];
  capsHit: "calls" | "stdout" | "walltime" | null;
  iterations: number;
  usage: ToolLoopUsage;
  retries: number;
};

// Matches pi-coding-agent's _isRetryableError regex. Covers rate limits,
// transient 5xx, network glitches, premature stream closes — anything the
// upstream provider is likely to recover from on its own.
const RETRYABLE_ERROR_PATTERN =
  /overloaded|provider.?returned.?error|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server.?error|internal.?error|network.?error|connection.?error|connection.?refused|connection.?lost|websocket.?closed|websocket.?error|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|ended without|stream ended before message_stop|http2 request did not get a response|timed? out|timeout|terminated|retry delay/i;

export function isRetryableProviderError(errorMessage: string): boolean {
  return RETRYABLE_ERROR_PATTERN.test(errorMessage);
}

export type ModelToolLoop = (input: ToolLoopInput) => Promise<ToolLoopResult>;

// Live observability seam — caller subscribes to pi-agent-core's full event
// stream (turn_start, message_update streaming deltas, tool_execution_*,
// turn_end with per-message usage, agent_end). The factory forwards events
// to this callback after its own bookkeeping. Errors thrown by the
// subscriber are swallowed so a bad print doesn't kill the loop.
export type ToolLoopEventSink = (event: AgentEvent) => void;

// Test seam — lets unit tests run the loop without docker.
export type ToolExecutor = (
  toolName: "python_exec" | "bash_exec",
  args: { code: string; timeoutSec?: number },
) => Promise<SandboxResult>;

// Test seam — pi-agent-core's `runAgentLoop` accepts an optional streamFn we
// can override to return scripted AssistantMessage events without an HTTP call.
type RunAgentLoopFn = typeof runAgentLoop;

const STDOUT_PREVIEW_BYTES = 4000;
const STDERR_PREVIEW_BYTES = 1000;

async function defaultExecutor(
  toolName: "python_exec" | "bash_exec",
  args: { code: string; timeoutSec?: number },
): Promise<SandboxResult> {
  const opts = args.timeoutSec === undefined ? {} : { timeoutSec: args.timeoutSec };
  return toolName === "python_exec" ? runPython(args.code, opts) : runBash(args.code, opts);
}

function formatToolResultText(r: SandboxResult): string {
  const parts: string[] = [`exitCode: ${r.exitCode}`, `durationMs: ${r.durationMs}`];
  if (r.timedOut) parts.push("timedOut: true");
  if (r.stdoutTruncated) parts.push(`stdoutTruncated: true (cap reached at ${r.stdout.length} bytes)`);
  parts.push("--- stdout ---");
  parts.push(r.stdout.length > 0 ? r.stdout : "(empty)");
  if (r.stderr.trim().length > 0) {
    parts.push("--- stderr ---");
    parts.push(r.stderr);
  }
  return parts.join("\n");
}

function sandboxToAgentResult(r: SandboxResult): AgentToolResult<SandboxResult> {
  return {
    content: [{ type: "text", text: formatToolResultText(r) }],
    details: r,
  };
}

function extractLastAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === "assistant") {
      return m.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Factory

export type MakeToolLoopRunnerArgs = {
  model: Model<Api>;
  apiKey: string;
  maxOutputTokens?: number;
  reasoning?: AgentLoopConfig["reasoning"];
  // Caps
  maxToolCalls?: number;
  maxTotalStdoutBytes?: number;
  maxWallTimeMs?: number;
  // Retry on transient provider errors (rate limits, 5xx, network). The
  // wall-time cap encompasses all retries. Set maxRetries: 0 to disable.
  maxRetries?: number;
  retryBaseDelayMs?: number;
  // Live event subscription (status lines, progress UI, cost tracking).
  onEvent?: ToolLoopEventSink;
  // Test seams
  executor?: ToolExecutor;
  runAgentLoopFn?: RunAgentLoopFn;
};

export function makeToolLoopRunner(args: MakeToolLoopRunnerArgs): ModelToolLoop {
  const maxToolCalls = args.maxToolCalls ?? 20;
  const maxTotalStdoutBytes = args.maxTotalStdoutBytes ?? 2 * 1024 * 1024;
  const maxWallTimeMs = args.maxWallTimeMs ?? 4 * 60 * 1000;
  const maxRetries = args.maxRetries ?? 3;
  const retryBaseDelayMs = args.retryBaseDelayMs ?? 2000;
  const executor = args.executor ?? defaultExecutor;
  const runLoop = args.runAgentLoopFn ?? runAgentLoop;

  return async (input) => {
    const trace: ToolUseTraceEntry[] = [];
    let toolCalls = 0;
    let stdoutBytes = 0;
    let capsHit: ToolLoopResult["capsHit"] = null;
    let iterations = 0;

    const pythonTool: AgentTool<typeof pythonExecParams, SandboxResult> = {
      name: "python_exec",
      label: "Python",
      description: PYTHON_EXEC_DESCRIPTION,
      parameters: pythonExecParams,
      execute: async (_toolCallId, params: PythonExecArgs) => {
        const r = await executor("python_exec", params);
        return sandboxToAgentResult(r);
      },
    };

    const bashTool: AgentTool<typeof bashExecParams, SandboxResult> = {
      name: "bash_exec",
      label: "Bash",
      description: BASH_EXEC_DESCRIPTION,
      parameters: bashExecParams,
      execute: async (_toolCallId, params: BashExecArgs) => {
        const r = await executor("bash_exec", params);
        return sandboxToAgentResult(r);
      },
    };

    const prompts: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: input.userMessage }],
        timestamp: Date.now(),
        id: `user-${Date.now().toString(36)}`,
      } as AgentMessage,
    ];

    // Trace + caps live in afterToolCall. Terminate hints stop the agent after
    // the current batch finishes — pi-agent-core's parallel-execution semantics.
    const afterToolCall = async (
      ctx: AfterToolCallContext,
    ): Promise<AfterToolCallResult | undefined> => {
      const toolName = ctx.toolCall.name as "python_exec" | "bash_exec";
      const callArgs = ctx.args as { code: string; timeoutSec?: number };
      const sandboxResult = (ctx.result.details ?? null) as SandboxResult | null;
      if (sandboxResult === null) return undefined;

      toolCalls += 1;
      stdoutBytes += sandboxResult.stdout.length;

      trace.push({
        toolCallId: ctx.toolCall.id,
        tool: toolName,
        code: callArgs.code,
        timeoutSec: callArgs.timeoutSec,
        exitCode: sandboxResult.exitCode,
        stdoutPreview: sandboxResult.stdout.slice(0, STDOUT_PREVIEW_BYTES),
        stderrPreview: sandboxResult.stderr.slice(0, STDERR_PREVIEW_BYTES),
        durationMs: sandboxResult.durationMs,
        stdoutBytes: sandboxResult.stdout.length,
        stdoutTruncated: sandboxResult.stdoutTruncated,
        timedOut: sandboxResult.timedOut,
      });

      if (toolCalls >= maxToolCalls) {
        capsHit = capsHit ?? "calls";
        return { terminate: true };
      }
      if (stdoutBytes >= maxTotalStdoutBytes) {
        capsHit = capsHit ?? "stdout";
        return { terminate: true };
      }
      return undefined;
    };

    // pi-agent-core requires convertToLlm — for us every AgentMessage already
    // satisfies the LLM `Message` shape (we don't use custom roles), so a
    // straight pass-through is correct.
    const convertToLlm = (messages: AgentMessage[]): Message[] => messages as Message[];

    const config: AgentLoopConfig = {
      model: args.model,
      apiKey: args.apiKey,
      ...(args.maxOutputTokens === undefined ? {} : { maxOutputTokens: args.maxOutputTokens }),
      ...(args.reasoning === undefined ? {} : { reasoning: args.reasoning }),
      convertToLlm,
      afterToolCall,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => {
      capsHit = capsHit ?? "walltime";
      controller.abort();
    }, maxWallTimeMs);

    const usage: ToolLoopUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };

    const onEvent = args.onEvent;
    const emit = (event: AgentEvent): void => {
      if (event.type === "turn_start") {
        iterations += 1;
      } else if (event.type === "turn_end") {
        const u = (event.message as AssistantMessage).usage as Usage | undefined;
        if (u) {
          usage.inputTokens += u.input;
          usage.outputTokens += u.output;
          usage.cacheReadTokens += u.cacheRead;
          usage.cacheWriteTokens += u.cacheWrite;
          usage.totalTokens += u.totalTokens;
          usage.costUsd += u.cost.total;
        }
      }
      if (onEvent) {
        try {
          onEvent(event);
        } catch {
          // Subscriber failures are non-fatal — keep the loop alive.
        }
      }
    };

    let finalMessages: AgentMessage[];
    let retries = 0;
    try {
      while (true) {
        // Reset per-attempt accumulators so the result reflects only the
        // successful run, not failed retries. Caps/iterations/usage are
        // updated again as the loop progresses.
        trace.length = 0;
        toolCalls = 0;
        stdoutBytes = 0;
        capsHit = null;
        iterations = 0;
        usage.inputTokens = 0;
        usage.outputTokens = 0;
        usage.cacheReadTokens = 0;
        usage.cacheWriteTokens = 0;
        usage.totalTokens = 0;
        usage.costUsd = 0;

        const attemptContext: AgentContext = {
          systemPrompt: input.systemPrompt,
          messages: [],
          tools: [pythonTool, bashTool],
        };

        finalMessages = await runLoop(
          prompts,
          attemptContext,
          config,
          emit,
          controller.signal,
        );

        // Detect provider errors via stopReason on the final assistant message.
        let providerError: string | null = null;
        for (let i = finalMessages.length - 1; i >= 0; i -= 1) {
          const m = finalMessages[i];
          if (m && m.role === "assistant") {
            const stopReason = (m as { stopReason?: string }).stopReason;
            const errorMessage = (m as { errorMessage?: string }).errorMessage;
            if (stopReason === "error" && errorMessage) providerError = errorMessage;
            break;
          }
        }

        if (providerError === null) break; // success

        if (!isRetryableProviderError(providerError) || retries >= maxRetries) {
          throw new Error(`LLM provider error: ${providerError}`);
        }

        retries += 1;
        const delayMs = retryBaseDelayMs * 2 ** (retries - 1);
        process.stderr.write(
          `[tool_loop] retry ${retries}/${maxRetries} after ${delayMs}ms: ${providerError.slice(0, 120)}\n`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    } finally {
      clearTimeout(timer);
    }
    const finalText = extractLastAssistantText(finalMessages);
    if (finalText.length === 0 && process.env["BP_DEBUG_TOOL_LOOP"] === "1") {
      const summary = finalMessages.map((m) => {
        if (m.role === "assistant") {
          return {
            role: "assistant",
            stopReason: (m as { stopReason?: string }).stopReason,
            errorMessage: (m as { errorMessage?: string }).errorMessage,
            blockTypes: m.content.map((b) => b.type),
            textLengths: m.content
              .filter((b): b is { type: "text"; text: string } => b.type === "text")
              .map((b) => b.text.length),
          };
        }
        return { role: m.role };
      });
      process.stderr.write(`[tool_loop debug] empty finalText. messages=${JSON.stringify(summary, null, 2)}\n`);
    }
    return { finalText, toolUseTrace: trace, capsHit, iterations, usage, retries };
  };
}
