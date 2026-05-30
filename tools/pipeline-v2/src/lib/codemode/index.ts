// Codemode layer — generic AgentHarness adapter for codemode-style agents
// (sandboxed python_exec + bash_exec, deterministic-gated evidence refs).
// Decoupled from findings so other agents (brief, intervention rank) can
// reuse the same harness wiring.
//
// Public surface:
//   makeToolLoopRunner / ModelToolLoop — factory + callable for codemode runs
//   ToolLoopInput / ToolLoopResult / ToolUseTraceEntry / ToolLoopUsage —
//     stable data types crossed by findings:_runner and other callers
//   ToolLoopEventSink + buildStderrEventSink — live observability seam
//   HarnessFactory / HarnessLike — test seam for mocking AgentHarness
//   DEFAULT_COMPACTION_SETTINGS — re-export for future cross-turn batching

export {
  DEFAULT_COMPACTION_SETTINGS,
  type HarnessFactory,
  type HarnessLike,
  type MakeToolLoopRunnerArgs,
  type ModelToolLoop,
  type ToolExecutor,
  type ToolLoopEventSink,
  type ToolLoopInput,
  type ToolLoopResult,
  type ToolLoopUsage,
  type ToolUseTraceEntry,
  makeToolLoopRunner,
} from "./tool-loop.ts";
export { buildStderrEventSink } from "./stderr-event-sink.ts";
