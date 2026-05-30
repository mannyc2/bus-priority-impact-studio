import {
  AgentHarness,
  type AgentHarnessEvent,
  type AgentHarnessEventResultMap,
  type AgentHarnessOptions,
  type AgentHarnessOwnEvent,
  type AgentTool,
  type AgentToolResult,
  type ExecutionEnv,
  InMemorySessionRepo,
  type PromptTemplate,
  type Session,
  type Skill,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import {
  type Api,
  type AssistantMessage,
  type Model,
  type Static,
  type ThinkingLevel,
  Type,
  type Usage,
} from "@earendil-works/pi-ai";

import { runBash, runPython, type SandboxResult } from "../../lib/sandbox.ts";

// ---------------------------------------------------------------------------
// Tools — typebox schemas via pi-ai's re-exported `Type`. Each tool is an
// `AgentTool` (extends pi-ai's `Tool` with label + execute) which AgentHarness
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
// Caller-facing types — kept stable across the AgentHarness migration so
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

// Live observability seam — caller subscribes to AgentHarness's full event
// stream: AgentEvent (turn_start, message_update streaming deltas,
// tool_execution_*, turn_end with per-message usage, agent_end) AND
// AgentHarnessOwnEvent (tool_call, tool_result, after_provider_response, …).
// Errors thrown by the subscriber are swallowed so a bad print doesn't kill
// the loop.
export type ToolLoopEventSink = (event: AgentHarnessEvent) => void;

// Test seam — lets unit tests run the loop without docker.
export type ToolExecutor = (
  toolName: "python_exec" | "bash_exec",
  args: { code: string; timeoutSec?: number },
) => Promise<SandboxResult>;

// Subset of the `AgentHarness` surface we depend on. Defined as an interface so
// unit tests can substitute a mock without standing up the real harness, env,
// session, or provider stack.
export interface HarnessLike {
  on<TType extends keyof AgentHarnessEventResultMap>(
    type: TType,
    handler: (
      event: Extract<AgentHarnessOwnEvent, { type: TType }>,
    ) =>
      | Promise<AgentHarnessEventResultMap[TType]>
      | AgentHarnessEventResultMap[TType],
  ): () => void;
  subscribe(
    listener: (
      event: AgentHarnessEvent,
      signal?: AbortSignal,
    ) => Promise<void> | void,
  ): () => void;
  prompt(text: string): Promise<AssistantMessage>;
  abort(): Promise<unknown>;
}

// Test seam — production wraps these options into `new AgentHarness(...)`.
// Tests inject a fake harness that scripts events + tool calls.
export type HarnessFactory = (
  opts: AgentHarnessOptions<Skill, PromptTemplate, AgentTool>,
) => HarnessLike;

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

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

const defaultHarnessFactory: HarnessFactory = (opts) =>
  new AgentHarness(opts);

// ---------------------------------------------------------------------------
// Factory

export type MakeToolLoopRunnerArgs = {
  model: Model<Api>;
  apiKey: string;
  maxOutputTokens?: number;
  reasoning?: ThinkingLevel;
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
  env?: ExecutionEnv;
  harnessFactory?: HarnessFactory;
};

export function makeToolLoopRunner(args: MakeToolLoopRunnerArgs): ModelToolLoop {
  const maxToolCalls = args.maxToolCalls ?? 20;
  const maxTotalStdoutBytes = args.maxTotalStdoutBytes ?? 2 * 1024 * 1024;
  const maxWallTimeMs = args.maxWallTimeMs ?? 4 * 60 * 1000;
  const maxRetries = args.maxRetries ?? 3;
  const retryBaseDelayMs = args.retryBaseDelayMs ?? 2000;
  const executor = args.executor ?? defaultExecutor;
  const createHarness = args.harnessFactory ?? defaultHarnessFactory;

  return async (input) => {
    const env: ExecutionEnv =
      args.env ?? new NodeExecutionEnv({ cwd: process.cwd() });

    const trace: ToolUseTraceEntry[] = [];
    let toolCalls = 0;
    let stdoutBytes = 0;
    let capsHit: ToolLoopResult["capsHit"] = null;
    let iterations = 0;
    const usage: ToolLoopUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };

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

    let finalMessage: AssistantMessage | null = null;
    let retries = 0;

    while (true) {
      // Reset per-attempt accumulators so the result reflects only the
      // successful run, not failed retries. Each retry gets a fresh harness +
      // session so the prior failed turn doesn't leak into the new attempt.
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

      const sessionRepo = new InMemorySessionRepo();
      const session: Session = await sessionRepo.create({});

      const harness = createHarness({
        env,
        session,
        model: args.model,
        tools: [pythonTool, bashTool],
        systemPrompt: input.systemPrompt,
        getApiKeyAndHeaders: async () => ({ apiKey: args.apiKey }),
        // Disable the harness's own provider retries; phase 1 keeps the
        // existing custom retry loop. Phase 1b folds them into the harness.
        streamOptions: { maxRetries: 0 },
        ...(args.reasoning === undefined ? {} : { thinkingLevel: args.reasoning }),
      });

      // Caps + trace. `tool_result` fires after each tool's `execute()` returns;
      // `details` carries the SandboxResult we placed on the AgentToolResult.
      // Returning `{ terminate: true }` halts the agent after the current batch.
      harness.on("tool_result", (event) => {
        const details = event.details as SandboxResult | null;
        if (details === null || details === undefined) return undefined;
        if (event.toolName !== "python_exec" && event.toolName !== "bash_exec") {
          return undefined;
        }
        const toolName = event.toolName;
        const inputArgs = event.input as { code: string; timeoutSec?: number };

        toolCalls += 1;
        stdoutBytes += details.stdout.length;

        trace.push({
          toolCallId: event.toolCallId,
          tool: toolName,
          code: inputArgs.code,
          timeoutSec: inputArgs.timeoutSec,
          exitCode: details.exitCode,
          stdoutPreview: details.stdout.slice(0, STDOUT_PREVIEW_BYTES),
          stderrPreview: details.stderr.slice(0, STDERR_PREVIEW_BYTES),
          durationMs: details.durationMs,
          stdoutBytes: details.stdout.length,
          stdoutTruncated: details.stdoutTruncated,
          timedOut: details.timedOut,
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
      });

      // maxOutputTokens isn't a top-level harness option (see
      // AgentHarnessStreamOptions in pi-agent-core 0.78). Inject it into the
      // provider payload directly — `max_tokens` is the field name for both
      // OpenAI-completions and Anthropic. If/when the harness gains
      // first-class support we can drop this hook.
      if (args.maxOutputTokens !== undefined) {
        const maxTokens = args.maxOutputTokens;
        harness.on("before_provider_payload", (event) => {
          const payload = event.payload as Record<string, unknown>;
          return { payload: { ...payload, max_tokens: maxTokens } };
        });
      }

      const onEvent = args.onEvent;
      harness.subscribe((event) => {
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
      });

      // Wall-time enforcement: abort the harness when the timer fires.
      const timer = setTimeout(() => {
        capsHit = capsHit ?? "walltime";
        void harness.abort().catch(() => {
          // Best-effort; abort failures are not actionable here.
        });
      }, maxWallTimeMs);

      try {
        finalMessage = await harness.prompt(input.userMessage);
      } finally {
        clearTimeout(timer);
      }

      // AgentHarness reports provider failures via stopReason: "error" +
      // errorMessage on the returned assistant message (see
      // agent-harness.ts emitRunFailure). Retry transient errors; rethrow
      // permanent ones verbatim so the operator sees the provider message.
      const stopReason = (finalMessage as { stopReason?: string }).stopReason;
      const errorMessage = (finalMessage as { errorMessage?: string }).errorMessage;
      if (stopReason !== "error" || !errorMessage) break; // success

      if (!isRetryableProviderError(errorMessage) || retries >= maxRetries) {
        throw new Error(`LLM provider error: ${errorMessage}`);
      }

      retries += 1;
      const delayMs = retryBaseDelayMs * 2 ** (retries - 1);
      process.stderr.write(
        `[tool_loop] retry ${retries}/${maxRetries} after ${delayMs}ms: ${errorMessage.slice(0, 120)}\n`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }

    const finalText = finalMessage === null ? "" : extractAssistantText(finalMessage);
    if (finalText.length === 0 && process.env["BP_DEBUG_TOOL_LOOP"] === "1") {
      const summary =
        finalMessage === null
          ? null
          : {
              role: "assistant",
              stopReason: (finalMessage as { stopReason?: string }).stopReason,
              errorMessage: (finalMessage as { errorMessage?: string }).errorMessage,
              blockTypes: finalMessage.content.map((b) => b.type),
              textLengths: finalMessage.content
                .filter((b): b is { type: "text"; text: string } => b.type === "text")
                .map((b) => b.text.length),
            };
      process.stderr.write(
        `[tool_loop debug] empty finalText. finalMessage=${JSON.stringify(summary, null, 2)}\n`,
      );
    }
    return { finalText, toolUseTrace: trace, capsHit, iterations, usage, retries };
  };
}
