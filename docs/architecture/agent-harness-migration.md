# AgentHarness migration plan

Status: phase 1 landed (2026-05-30); phases 1b–4 still planned.
Tracking commits: TBD (phase 1 landing commit on `main`).

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

### Phase 1b: drop custom retry, adopt harness retry settings

**Goal:** remove `isRetryableProviderError` and the backoff loop from
`_tool_loop.ts`; rely on harness's built-in retry. Wire
`auto_retry_start`/`auto_retry_end` events through `onEvent`.

**Files touched:**
- `_tool_loop.ts` — delete ~50 LOC of retry plumbing
- Keep `retries: number` field on `ToolLoopResult`, populated from
  harness's auto_retry_end event count

**Estimated effort:** ~50 LOC delta. Same session as phase 1 if budget allows.

### Phase 2: session persistence via JsonlSessionRepo

**Goal:** Each agent-propose run writes its transcript to
`data/artifacts/findings/<month>/agent-proposals/<runId>/session.jsonl`.
Crash mid-run, resume cleanly.

**Files touched:**
- `_tool_loop.ts` — accept an optional `sessionDir` arg; when set,
  construct `JsonlSessionRepo` instead of `InMemorySessionRepo`
- `agent-propose.ts` — pass `agentProposalsDir(month, runId)/session.jsonl`
  through when `--execute` is on
- New CLI flag `--resume <runId>` to reattach to an existing session repo
  and call `harness.continue()` instead of `harness.prompt()`

**Verification:**
- Kill an agent-propose mid-run; rerun with `--resume`; verify it picks up
  where it left off without re-running tools
- New integration test: write a fake session.jsonl with one turn complete,
  verify `--resume` produces a valid completion

**Estimated effort:** ~150 LOC delta + 1 integration test. 1 session.

### Phase 3: skills via SKILL.md + AgentHarnessResources

**Goal:** Move the corpus map and determinism rules out of an ad-hoc
markdown read into a real skill registry. Future agents (intervention rank,
brief writer) reuse the same skills.

**Decisions to make:**
- Where do SKILL.md files live? Proposed: `tools/agent-corpus-lib/skills/`
  - `corpus-navigation.md` — bp_corpus API + determinism rules
  - `proposal-format.md` — output JSON shape + claim-strength rules
- Skills are loaded via `loadSourcedPromptTemplates` / `loadSkills` helpers
  pi-agent-core already exposes, then passed via
  `AgentHarnessResources.skills`
- The `systemPrompt` callback option becomes the integration point; we
  compose the prompt from the active skills + the per-run claim/severity rules

**Files touched:**
- `tools/agent-corpus-lib/skills/*.md` — new directory, ~3 skills
- `_tool_loop.ts` — load skills at runner construction, pass via `resources`
- The old `agent_corpus_map.md` in `knowledge/wiki/data/` stays as
  human-readable docs; `corpus-navigation.md` is the machine-loadable copy
  (or vice versa — open question)

**Estimated effort:** ~200 LOC delta + skill content. 1 session.

### Phase 4: compaction for long runs

**Goal:** Auto-compact context when it exceeds threshold. Lets us run all
381 routes in a single agent-propose invocation instead of per-route batches.

**Decisions to make:**
- Compaction strategy: pi-agent-core's `DEFAULT_COMPACTION_SETTINGS` or a
  custom one tuned for our digest sizes
- Where to insert summary content — proposed at the model layer

**Files touched:**
- `_tool_loop.ts` — pass `compactionSettings` to AgentHarness; subscribe to
  `compaction_start`/`compaction_end` events for stderr visibility
- New CLI flag `--max-routes-per-turn` to control batching

**Verification:**
- Run with 50+ routes per turn; verify compaction fires when context
  approaches the model's window
- Confirm validated proposals still re-resolve evidence refs correctly
  against the compacted transcript

**Estimated effort:** ~100 LOC delta + threshold tuning. 1 session.

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
