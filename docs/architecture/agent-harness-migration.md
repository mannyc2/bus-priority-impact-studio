# AgentHarness migration plan

Status: phases 1, 1b, 2, 3, 4 landed (2026-05-30). Cross-route batching for
true compaction value remains a runner-level follow-up.
Tracking commits: see `git log` on `main`.

## Why

The current codemode runner builds on `runAgentLoop`, the low-level entry
point in `@earendil-works/pi-agent-core`. That gets us a working loop + tool
dispatch, but misses the higher-level `AgentHarness` features:

- **Lifecycle hooks** `before_provider_request` / `after_provider_response`
  surface HTTP status codes and provider response headers — useful for
  retry-after handling, observability, and provider-specific debugging that
  `runAgentLoop` doesn't expose.
- **Built-in retry** via `pi-coding-agent`-style settings instead of our
  hand-rolled regex + backoff in `_tool_loop.ts`. Stays in sync with upstream
  patterns for free; deletes 40-ish LOC of bespoke retry code.
- **Mid-conversation recovery** — `AgentHarness` can `continue()` after a
  transient failure mid-tool-execution; our current retry restarts the whole
  conversation from scratch (correct but wasteful when tools 1–4 already ran).
- **Session persistence** via `JsonlSessionRepo` makes runs resumable. Today
  a crash mid-run loses all proposals and tool work.
- **Skills + prompt templates** are a real package-level primitive for
  loading reusable agent instructions from `SKILL.md` files. Currently the
  agent corpus map is read ad-hoc; skills give us a discoverable registry.
- **Compaction** for long runs that exceed the model's context window. Not
  needed today for 1-route runs; will matter once we scale to many routes
  per turn or longer multi-turn analyses.

Reference materials:
- `tools/pipeline-v2/node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.d.ts`
- `packages/agent/docs/agent-harness.md` upstream (mirrored in the in-tree
  reference docs the user pasted into the slice conversation).

## What stays the same

- `tools/pipeline-v2/src/commands/findings/_runner.ts` external surface
  (`RunProposalsInput`, `RunProposalsResult`, `runAgentPropose`) — unchanged.
- `ModelToolLoop`, `ToolLoopInput`, `ToolLoopResult`, `ToolUseTraceEntry`,
  `ToolLoopUsage` — unchanged. The harness adoption is internal to
  `makeToolLoopRunner`.
- `_code_execution.ts`, `_validation.ts`, `_evidence_payload.ts`,
  `_runner.ts` — no changes needed. The deterministic gate sits above the
  harness.
- The sandbox image (`tools/sandbox/`) and the bp_corpus library
  (`tools/agent-corpus-lib/`) — unchanged.
- `_tool_loop.ts`'s tool definitions (`pythonExecParams`, `bashExecParams`,
  `PYTHON_EXEC_TOOL`, `BASH_EXEC_TOOL`) — port verbatim to the harness, the
  `AgentTool.execute()` signature already matches what we have.
- The CLI flag `--enable-codemode` and corpus-map loading in
  `agent-propose.ts` — unchanged.

## What changes, by phase

### Phase 1: drop-in AgentHarness, replacing runAgentLoop  ✅ LANDED 2026-05-30

**Goal:** swap `runAgentLoop(prompts, context, config, emit, signal)` for
`new AgentHarness(...).prompt(userMessage)`. Get HTTP-status hooks for
free. Keep custom retry until phase 1b.

**Outcome:**
- `_tool_loop.ts` now constructs `NodeExecutionEnv` + `InMemorySessionRepo`
  + `AgentHarness` per attempt. Caps + trace live in
  `harness.on("tool_result", ...)` (terminate: true semantics). Usage +
  iterations roll up via `harness.subscribe(...)` watching `turn_start`/
  `turn_end` AgentEvents. Wall-time enforced via `setTimeout(() =>
  harness.abort())`.
- `runAgentLoopFn` test seam replaced with `harnessFactory: HarnessFactory`
  returning a `HarnessLike` (subset of AgentHarness — `on`, `subscribe`,
  `prompt`, `abort`).
- `maxOutputTokens` not exposed by AgentHarnessStreamOptions in pi-agent-core
  0.78, so injected via `harness.on("before_provider_payload", ...)`
  patching `max_tokens` into the provider payload. Drop this hook if a
  future pi-agent-core release surfaces it natively.
- `ToolLoopEventSink` type widened from `AgentEvent` to
  `AgentHarnessEvent = AgentEvent | AgentHarnessOwnEvent`; the stderr
  printer in `agent-propose.ts` keeps working because it only narrows on
  `AgentEvent` types.
- Custom retry loop preserved (phase 1b unfinished). `streamOptions.maxRetries
  = 0` disables the harness's own provider retries.
- All 217 pipeline-v2 tests green. Real-model smoke against deepseek-v4-flash
  still pending verification (documented for next session).

**Files touched:**
- `tools/pipeline-v2/src/commands/findings/_tool_loop.ts` — ~150 LOC diff:
  - Construct `NodeExecutionEnv({ cwd: process.cwd() })`
  - Construct `InMemorySessionRepo` + `new Session(repo, ...)` — ephemeral,
    no persistence in this phase
  - Construct `new AgentHarness({ env, session, model, tools, systemPrompt,
    getApiKeyAndHeaders, streamOptions })` instead of building
    `AgentContext` + `AgentLoopConfig` manually
  - Replace `runLoop(prompts, context, config, emit, signal)` with
    `harness.subscribe(emit); await harness.prompt(userMessage)`
  - Map `AgentHarnessEvent` → existing `ToolLoopEventSink` (event names
    differ slightly: `tool_call` vs `tool_execution_start`)
  - Keep custom retry loop wrapping `harness.prompt()` for now
- `tools/pipeline-v2/test/commands/findings/_tool-loop.test.ts` — rewrite
  the `runAgentLoopFn` injection seam as a `streamFn` or test against a
  mock harness; ~6 tests updated
- `tools/pipeline-v2/test/commands/findings/agent-propose.codemode.test.ts`
  — no changes; uses `ModelToolLoop` mock at the seam I preserve.

**Verification:**
- 217 pipeline-v2 tests stay green
- Real `bun run` against deepseek-v4-flash on Q17 produces a proposal (any
  validation state)
- Stderr printer shows the same per-turn / per-tool lines as today
- New: confirm `harness.on("after_provider_response", ...)` surfaces HTTP
  status; print to stderr in BP_DEBUG mode

**Estimated effort:** ~200 LOC delta. 1 session.

### Phase 1b: drop custom retry, adopt harness retry settings  ✅ LANDED 2026-05-30

**Goal:** remove the custom backoff loop from `_tool_loop.ts`; rely on
pi-ai's HTTP-layer retry via `streamOptions.maxRetries`.

**Outcome:**
- Custom retry loop deleted (~50 LOC). `streamOptions.maxRetries = 3,
  maxRetryDelayMs = 30000` is passed to AgentHarness; pi-ai's
  `streamSimple` handles transient errors (429, 5xx, network) internally
  before they reach the harness as `stopReason: "error"`.
- `isRetryableProviderError` + `RETRYABLE_ERROR_PATTERN` removed — no
  longer needed.
- `retries: number` field on `ToolLoopResult` retained for compatibility
  but now always 0. pi-agent-core 0.78 does not surface internal retry
  attempts as harness events (no `auto_retry_*` events exist), so the
  count isn't observable.
- Any `stopReason: "error"` that *does* surface is treated as fatal and
  thrown verbatim — pi-ai's HTTP retry already exhausted by that point.

### Phase 2: session persistence via JsonlSessionRepo  ✅ LANDED 2026-05-30 (persistence only; resume deferred)

**Goal:** Each agent-propose run writes its transcript to
`data/artifacts/findings/<month>/agent-proposals/<runId>/sessions/`.

**Outcome:**
- `makeToolLoopRunner` gained `sessionsRoot?: string` + `sessionsCwd?: string`
  args. When `sessionsRoot` is set, the loop constructs `JsonlSessionRepo`
  instead of `InMemorySessionRepo`; otherwise behavior is unchanged.
- `ToolLoopResult` gained optional `sessionId` + `sessionPath` fields.
- New CLI flag `--persist-sessions` on `findings:agent-propose`. When set,
  sessions land in `agentProposalsDir(month, runId)/sessions/<encoded-cwd>/
  <sessionId>-<timestamp>.jsonl`.
- Resume (the `--resume <runId>` flag) is **not** implemented in this phase.
  The runner iterates per-route; each route gets its own session. Resume
  semantics require tracking which routes completed and skipping them on
  rerun, which is a runner-level change. Treat this phase as "audit
  transcripts on disk" — full resumability is a follow-up.

**Estimated effort delivered:** ~80 LOC. 0 new tests (the InMemorySession
mock harness in `_tool-loop.test.ts` already covers the seam; the on-disk
path is exercised end-to-end by `--persist-sessions` and the upstream
JsonlSessionRepo is already tested in pi-agent-core).

### Phase 3: skills via SKILL.md + AgentHarnessResources  ✅ LANDED 2026-05-30

**Outcome:**
- `tools/agent-corpus-lib/skills/corpus-navigation/SKILL.md` created from
  the corpus map content with proper YAML frontmatter (`name`,
  `description`). The legacy `knowledge/wiki/data/agent_corpus_map.md`
  stays as the human-readable wiki page; the SKILL.md is the machine copy.
- `_tool_loop.ts` gained `skillsRoot?: string`. When set, the loop calls
  `loadSkills(env, skillsRoot)`, emits any diagnostics to stderr, inlines
  each skill's content into the composed system prompt, AND passes the
  parsed skills via `resources.skills` so future explicit
  `harness.skill(name)` invocations work.
- `agent-propose.ts` no longer reads `agent_corpus_map.md` directly. It
  defaults `skillsRoot` to `tools/agent-corpus-lib/skills/`. The runner-
  level `corpusMapMarkdown` input is preserved for the codemode E2E test
  (which inlines a string directly) but the CLI doesn't populate it.
- **Caveat:** upstream's `formatSkillsForSystemPrompt` emits only pointers
  (name + description + host file path) and assumes the model can `cat`
  the path. That fails inside our read-only docker sandbox, so we inline
  the full content instead. Future iterations could remap `filePath` to
  `/work/agent-corpus-lib/skills/...` (which IS mounted into the sandbox)
  and switch to the pointer pattern for lazy loading.

**Estimated effort delivered:** ~140 LOC delta + the new SKILL.md.

### Phase 4: compaction wiring  ✅ LANDED 2026-05-30 (observability only)

**Reality check:** pi-agent-core 0.78 exposes `harness.compact()` as a
manual, idle-phase method; there is no automatic in-flight compaction
during a `prompt()` call. `AgentHarnessOptions` does not accept a
`compactionSettings` field — the harness uses
`DEFAULT_COMPACTION_SETTINGS` hardcoded inside `compact()`. So the
"pass compactionSettings to AgentHarness" item from the original plan
isn't expressible against the current upstream API.

**Outcome:**
- `_tool_loop.ts` re-exports `DEFAULT_COMPACTION_SETTINGS` from
  pi-agent-core so future runner refactors don't need an extra import path.
- `buildStderrEventSink` in `agent-propose.ts` now prints
  `session_before_compact` and `session_compact` events for visibility
  when compaction does run.
- **No CLI flag.** `--max-routes-per-turn` wasn't added because the runner
  still iterates per-route — there's nothing to batch yet. Cross-route
  batching is the real prerequisite for compaction to matter.

**Follow-up (not in this slice):**
- Refactor `_runner.ts` to optionally bundle N routes into one
  `harness.prompt()` call. Call `harness.compact()` between turns when
  `shouldCompact(usage)` returns true. Add `--max-routes-per-turn` then.
  Open question: does compacting a transcript still let validators
  re-resolve `code_execution` evidence refs? (Answer is probably yes,
  since refs hash by stdout not by message id, but worth verifying with
  an integration test.)

**Estimated effort delivered:** ~30 LOC (re-export + 2 stderr lines).

## Total effort

~700–900 LOC delta across 3–4 working sessions. Each phase ends with a
working state + tests + commit. Don't land all of them at once — the
incremental shape is the point.

## Migration risk

- **Phase 1 is the foundation.** If it regresses any of the 215 existing
  tests, debugging is unpleasant — AgentHarness has many more moving parts
  than `runAgentLoop`. Mitigation: keep `_tool_loop.ts`'s public surface
  identical so the codemode E2E + tool-loop unit tests catch regressions.
- **InMemorySessionRepo vs JsonlSessionRepo.** Phase 1 uses memory; phase 2
  introduces disk. Don't mix the choice across phases — finish phase 1's
  test stabilization before adding disk persistence.
- **Skills design (phase 3) is open.** The SKILL.md location and naming
  isn't obvious. Probably needs a small design memo before implementation —
  this is the phase most likely to expand into "agent harness package"
  territory the user asked about earlier.

## Open follow-ups (not phased above)

- **Cost telemetry through OpenRouter.** `--provider openrouter --model
  deepseek/deepseek-v4-flash` reports real cost via pi-ai's catalog; direct
  `--provider deepseek` doesn't (no per-model pricing). The model-default
  switch (phase 0, already landed) sets up for this — verify the
  ToolLoopUsage.costUsd numbers look right on the next real run.
- **Persisting `toolUseTrace`** to the validation artifact (schema
  migration on `AgentFindingProposalValidationArtifact`).
- **System-prompt fix for dotted metric variable names** — surfaced by the
  first real-model run; orthogonal to harness adoption.
