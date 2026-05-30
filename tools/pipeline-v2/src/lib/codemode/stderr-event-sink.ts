import type { ToolLoopEventSink } from "./tool-loop.ts";

// Live status printer for codemode runs. AgentHarness emits a rich event
// stream (turn_start, tool_execution_start/end, turn_end with per-message
// usage, agent_end, plus session_before_compact / session_compact when
// compaction fires). Callers print one line per significant transition to
// stderr so the JSON result on stdout stays parseable. Everything is
// best-effort — exceptions are swallowed by the loop wrapper.
//
// Reused across codemode CLIs (findings:agent-propose today, plus future
// brief/intervention agents). Each caller can supply a `prefix` to scope
// its own log lines.
export function buildStderrEventSink(options: { prefix?: string } = {}): ToolLoopEventSink {
  const prefix = options.prefix ?? "codemode";
  let turn = 0;
  const turnStartMs = new Map<number, number>();
  const toolStartMs = new Map<string, number>();
  const write = (line: string) => {
    process.stderr.write(`[${prefix}] ${line}\n`);
  };
  return (event) => {
    if (event.type === "agent_start") {
      write("agent_start");
      return;
    }
    if (event.type === "turn_start") {
      turn += 1;
      turnStartMs.set(turn, Date.now());
      write(`turn ${turn} start`);
      return;
    }
    if (event.type === "tool_execution_start") {
      toolStartMs.set(event.toolCallId, Date.now());
      const code = (event.args as { code?: string } | undefined)?.code ?? "";
      const preview = code.replace(/\s+/g, " ").slice(0, 80);
      write(`tool ${event.toolName} (${event.toolCallId.slice(0, 8)}): ${preview}${code.length > 80 ? "…" : ""}`);
      return;
    }
    if (event.type === "tool_execution_end") {
      const started = toolStartMs.get(event.toolCallId);
      const elapsed = started === undefined ? "?" : `${Date.now() - started}ms`;
      const idShort = event.toolCallId.slice(0, 8);
      const errSuffix = event.isError ? " ERROR" : "";

      // Sandbox tools (python_exec, bash_exec) attach a SandboxResult on
      // result.details. Print exit + stdout bytes. For other extraTools, fall
      // back to the result's first text block — caller-defined tools (e.g.
      // findings' submit_finding_proposals) put a human-readable summary there.
      const detail = event.result as
        | {
            details?: { exitCode?: number; stdout?: string };
            content?: Array<{ type?: string; text?: string }>;
          }
        | undefined;
      const isSandboxShape = detail?.details && typeof detail.details.exitCode === "number";
      if (isSandboxShape) {
        const exitCode = detail.details!.exitCode;
        const stdoutBytes = detail.details!.stdout?.length ?? 0;
        write(
          `tool ${event.toolName} (${idShort}) done: exit=${exitCode} stdout=${stdoutBytes}b ${elapsed}${errSuffix}`,
        );
      } else {
        const text = detail?.content?.find((b) => b?.type === "text")?.text ?? "";
        const oneLine = text.replace(/\s+/g, " ").slice(0, 120);
        const preview = oneLine.length > 0 ? `: ${oneLine}${text.length > 120 ? "…" : ""}` : "";
        write(
          `tool ${event.toolName} (${idShort}) done${preview} (${elapsed})${errSuffix}`,
        );
      }
      return;
    }
    if (event.type === "turn_end") {
      const started = turnStartMs.get(turn);
      const elapsed = started === undefined ? "?" : `${Date.now() - started}ms`;
      const usage = (event.message as { usage?: { input: number; output: number; cost: { total: number } } }).usage;
      const usageStr = usage
        ? ` in=${usage.input}tok out=${usage.output}tok cost=$${usage.cost.total.toFixed(4)}`
        : "";
      write(`turn ${turn} end (${elapsed})${usageStr}`);
      return;
    }
    if (event.type === "agent_end") {
      write(`agent_end (${event.messages.length} messages)`);
      return;
    }
    if (event.type === "session_before_compact") {
      write(
        `compact start: tokensBefore=${event.preparation.tokensBefore} keepRecent=${event.preparation.settings.keepRecentTokens}`,
      );
      return;
    }
    if (event.type === "session_compact") {
      const entry = event.compactionEntry;
      write(
        `compact end: firstKept=${entry.firstKeptEntryId.slice(0, 8)} tokensBefore=${entry.tokensBefore}`,
      );
      return;
    }
  };
}
