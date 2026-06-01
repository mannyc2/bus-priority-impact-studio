# Studio Agent Stack

Status: **Accepted** - first Think / Workers AI execution slice implemented
Last updated: 2026-06-01

This note plans the production agent stack for Studio brief authoring and review.
It is deliberately separate from the local/pipeline agent harness documented in
`docs/architecture/agent-harness-migration.md`.

The short version: production Studio agents should be Cloudflare-native. Use
Cloudflare Think for the authoring agent runtime, D1/R2 for product state,
operator-scoped tools for all brief mutations, and Codemode only later when a
workflow genuinely needs code-shaped multi-tool orchestration.

Companion note: `docs/architecture/studio-agent-edit-approval-versioning.md`
defines how agent-authored changes are triggered, approved, and versioned before
they become accepted draft content.

## Current Tree Facts

- `apps/web` now depends on Cloudflare Think, Agents, AI SDK, and
  `workers-ai-provider` for the production authoring runtime.
- `apps/web/wrangler.jsonc` and the production example bind Workers AI as `AI`
  and `BriefAuthorAgent` as the `BRIEF_AUTHOR_AGENT` Durable Object. The Worker
  test config omits the AI binding so tests stay local and inject fakes.
- `POST /api/v1/studio/briefs/{briefId}/draft/generate` records a queued
  generation job plus D1 agent run, signals `BriefAuthorAgent` with
  `ctx.waitUntil`, and returns without waiting for model inference. Missing
  bindings still fail closed with `not_configured`.
- Studio draft state now lives in D1: draft metadata, claims, body markdown,
  typed blocks, refs, review threads, idempotency records, and promotion
  receipt.
- Studio agent run/proposal/version state now has domain contracts, D1 tables,
  query helpers, OpenAPI entries, and Worker endpoints for starting a run,
  submitting structured proposed edits, fetching proposals, applying or
  rejecting proposals, listing draft version rows, and restoring version
  snapshots. The Think agent reuses the same `proposeBriefEdit` validation path.
- Public Studio projections still live in R2/D1 release artifacts. Promotion is
  an offline pipeline command, not a Worker request-path mutation.
- The local findings/proposal agent harness under `tools/pipeline-v2` is for
  offline data/product generation. The production Worker must not import that
  harness or pipeline-only code.

## Stack Decision

### Runtime

Use **Cloudflare Think** as the production Studio authoring agent runtime.

Think is the right default for the browser-facing agent because it provides the
chat lifecycle that the Studio UI needs: streaming, tool execution, message
persistence, WebSocket routing, and sub-agent RPC. The repo should not grow a
bespoke Worker chat loop while Think is available.

The first minimal implementation keeps `BriefAuthorAgent` in
`apps/web/src/worker/index.ts` so it can reuse the existing Worker-local draft
helpers without opening a wider module boundary. Split it under
`apps/web/src/worker/agents/` once the tool layer grows beyond the first agent.

Future split shape:

```text
apps/web/src/worker/agents/
  brief-author-agent.ts
  brief-review-agent.ts      # optional later, same tool layer
  tools.ts
  prompts.ts
```

The first production agent is **BriefAuthorAgent**. A separate review agent is a
later split only if review triage develops distinct prompts, tools, and budgets.

### Memory

Use Think's built-in Durable Object message persistence for the v1 chat surface.
Use the Cloudflare Sessions API when we need explicit context blocks,
compaction, tree-structured branches, or full-text session search. Sessions is
still documented as experimental, so keep it behind a small local adapter and
out of product truth.

Sessions must not become the source of truth for drafts. They may store
conversation history and compact context, but draft content, review state,
validation, and publication readiness stay in D1. Public brief projections stay
self-contained in R2/D1 release artifacts.

### Agent Runtime State

Cloudflare Agent state (`initialState`, `this.state`, `setState`, and the
Agent-local SQLite available through `this.sql`) should be used for live runtime
coordination, not as the product ledger.

Use Agent state for:

- synchronized connected-client UI state for the current run,
- streaming status, current step labels, and compact progress/error summaries,
- active proposal ids and validation-preview summaries already persisted in D1,
- small per-agent caches that can be reconstructed from D1/R2 if needed.

Do not use Agent state as the only copy of:

- accepted draft content,
- proposals that need approval,
- draft versions or restore points,
- review threads and suggestions,
- idempotency records,
- publish-candidate or promotion receipts.

Those records stay in D1/R2 so REST polling, Worker tests, offline promotion,
and future non-WebSocket clients observe the same truth. The Agent can mirror
D1 state into `setState` for realtime UI sync, but D1 remains authoritative and
the Agent should reconcile from D1 when it wakes.

Client-originated Agent state updates must be treated as untrusted UI signals.
Use `validateStateChange` or equivalent server-side checks to reject client
attempts to mark runs approved, apply proposals, change draft content, or move
publish lifecycle state. Those actions must go through the same authenticated
tools or REST endpoints as non-agent writes.

Default v1 scoping should be one BriefAuthorAgent instance per
`workspaceId + briefId`. That lets multiple authorized operators looking at the
same draft share run/proposal progress. Use Agent props only for initialization
configuration such as workspace/brief identifiers; persisted run/proposal
identity still lives in D1. If we later need private per-operator chat branches,
store the branch/session id separately rather than splitting product state away
from the draft-scoped Agent.

### Model Provider

Use Workers AI through the AI SDK provider as the first production model path.
Keep model selection behind the Think `getModel()` implementation so we can
swap model IDs without changing draft APIs. The first default is
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, configurable with
`STUDIO_AGENT_MODEL`.

### Product State

The agent should mutate briefs only through the same product operations used by
humans:

- read current public/draft brief context,
- patch draft metadata and body markdown,
- create/update/delete claims,
- create/update/delete typed blocks,
- resolve and persist refs,
- attach captured route/finding/search objects to the draft,
- create review comments and suggestions,
- validate the draft,
- request review.

The agent should not directly write public projections. It may mark or prepare a
publish candidate only through the existing draft API gates, and final promotion
stays offline in `tools/pipeline-v2`.

For accepted draft content, the default write path is proposal-first: the agent
creates a structured change set against a known draft version, and a human
approval applies all or selected operations. Direct apply is reserved for
deterministic user-confirmed actions such as Send-to-brief attachment.

### Tool Layer

Expose AI SDK tools around Studio operations, not around raw SQL. A tool can call
shared Worker-local helpers or the D1 query layer, but it must enforce the same
operator session, workspace, scope, idempotency, and schema validation rules as
the REST endpoints.

Approval is usually attached to the agent's proposed end result, not to each
tool call. Read/propose/validate tools can run during the agent turn. Tools with
immediate external or lifecycle side effects, such as publish-candidate marking,
access-role changes, external notifications, or unusually large budget spend,
should require explicit human confirmation.

Minimum v1 tool set:

| Tool | Purpose | Scope |
|---|---|---|
| `readBriefContext` | Load public projection plus authorized draft overlay. | `read:briefs` |
| `proposeBriefEdit` | Submit structured operations against a base draft version; receive validation feedback or a stored proposal. | `write:briefs` |
| `resolveDraftRefs` | Normalize refs against draft/public context for use in a proposal. | `write:briefs` |
| `attachToDraft` | Append a deterministic user-confirmed capture, or produce a proposal when AI-authored prose is involved. | `write:briefs` |
| `createReviewThread` | Add comments, change requests, or suggested edits. | `review:briefs` |
| `validateDraft` | Run deterministic publication checks. | `write:briefs` |
| `requestReview` | Move a draft into review with an optional note. | `review:briefs` |

Publish-candidate and retract tools should stay disabled for autonomous v1 agent
runs. They can be added as explicit human-confirmed actions later.

`proposeBriefEdit` is the main write-capable agent tool for authored content.
It does not mutate the accepted draft. It validates schemas, operation limits,
target refs, selectors, base version/hash, and deterministic draft validation
preview. If the structured output is wrong, the tool returns path-specific,
machine-readable errors so the agent can repair and retry. Only a valid proposal
is shown for human approval; the apply endpoint performs the accepted-draft
mutation and creates the draft version.

### Codemode

Do not use Cloudflare Codemode for the first authoring chat/generate slice.
Standard AI SDK tools are simpler and easier to audit for the draft mutations we
need now.

Codemode becomes attractive later for bounded evidence workflows where the agent
must chain many reads with branching logic, for example comparing route cohorts
or composing evidence from several mid-layer APIs. If introduced, it must run in
the Cloudflare Dynamic Worker sandbox, use allowlisted tools only, and still
mutate drafts through the same tool layer above.

## Request Flow

There are two product entry points:

1. **Generate job**:
   `POST /api/v1/studio/briefs/{briefId}/draft/generate` remains the REST
   contract for "make progress on this draft." It authenticates the operator,
   records a D1 generation job, starts or signals `BriefAuthorAgent`, and returns
   a `StudioBriefGenerationJobResponse` without waiting for the full model run.
   The model run should produce a proposed change set, not silently replace the
   accepted draft.
2. **Interactive composer chat**:
   the authoring UI connects to the same agent through Think's routed WebSocket
   surface and `useAgentChat`. Chat messages can call tools, but the visible
   draft state still comes from canonical draft reads.
3. **Targeted edit actions**:
   composer affordances such as "revise this selection", "fix this validation
   issue", or "address this review thread" start scoped agent runs against a
   specific body range, block, ref, claim, or review thread.

The first implementation proves this handoff: `draft/generate` records queued
D1 state, signals `BriefAuthorAgent`, and still returns immediately. Current v1
shape:

```text
browser
  -> Worker REST generate endpoint
     -> D1: record queued job
     -> BriefAuthorAgent Durable Object: start generation
     -> response: queued/running job payload

BriefAuthorAgent
  -> Workers AI model stream
  -> Studio tools
  -> Agent state: live progress mirror for connected clients
  -> D1: run/proposal/job/history updates
```

Do not run the full model call inline in the REST handler. If Think cannot
reliably fire-and-return for this path, keep the endpoint honest as queued and
require the browser to open the agent stream, or add a small Cloudflare Queue /
Workflow ADR before introducing another runner.

## Auth And Budget

Public deterministic Studio reads stay anonymous.

Agent routes require operator auth because they spend inference budget and can
mutate private draft state. Tool execution must fail closed using the same
workspace and scope checks as the REST endpoints:

- read tools: `read:briefs`,
- draft mutation tools: `write:briefs`,
- review tools: `review:briefs`,
- publish-candidate tools, if later enabled: `publish:briefs`.

This is not a new auth requirement for public reading endpoints. It is an auth
requirement for AI-backed and write-capable authoring.

## Context Model

Each agent run should assemble context from product APIs and storage, never from
`knowledge/` at runtime:

- stable system prompt and authoring rules,
- operator identity, workspace, and allowed scopes,
- current public brief projection when one exists,
- current D1 draft snapshot,
- route/finding/evidence summaries already exposed by Studio APIs,
- attached draft refs and block summaries,
- recent review-thread state,
- compact session memory from Think/Sessions.

The agent should receive validation failures as data and repair the draft
through tools. It should not be allowed to assert that a draft is publishable
without the deterministic validation response.

## Observability

D1 generation-job fields remain the product-facing status source. Add only
bounded agent telemetry to D1: job id, runner, model/provider, status,
timestamps, error code, and compact step summaries.

Large transcripts, if retained, belong in Durable Object storage or R2 audit
artifacts with retention rules. Do not copy full private review threads or
agent transcripts into public brief projections.

## Safety Rules

- Agent output must parse through domain schemas before it mutates draft state.
- The agent can draft, validate, repair, and request review.
- LLM-authored prose or block changes land as proposals first; approval applies
  them and creates a draft version.
- The agent cannot directly mutate public release projections.
- Default v1 behavior should require human confirmation before marking a publish
  candidate.
- Unresolved refs, missing blocks, stale blocking validation, or open blocking
  review threads prevent publication.
- The public reader must render from embedded `bodyMd`, `blocks`, and `refs`
  without resolving draft-private state.

## Implementation Status

1. Add an ADR for the production Studio agent stack and dependency posture.
   -> verify: ADR references this note, ADR 0014, ADR 0015, and the current
   Cloudflare Think/Sessions/Codemode docs. **Done: ADR 0016.**
2. Add dependencies and bindings in an inert spike: Think, AI Chat, Agents, AI
   SDK, Workers AI provider, Think peer dependencies, and Worker env types. Do
   not route production traffic yet.
   -> verify: `bun --filter @bp/web typecheck` and `bun --filter @bp/web build`.
   **Done for the first runtime slice.**
3. Add `BriefAuthorAgent` shell with no write tools, gated behind operator auth
   and a non-public route prefix. Define an `initialState` that mirrors only
   bounded runtime UI state, not product truth.
   -> verify: Worker harness test proves anonymous requests fail, unauthorized
   operators fail, authorized operators can open a minimal agent route, and
   client-originated state cannot approve/apply a proposal. **Partially done:
   the Durable Object shell exists for REST-triggered generation; WebSocket UI
   routing remains future work.**
4. Extract draft operations into a Worker-local tool/service layer reused by
   REST handlers and the agent.
   -> verify: existing `brief-draft.worker.test.ts` still passes, and new unit
   tests prove tools enforce scopes and schemas. **Done for `proposeBriefEdit`.**
5. Implement read-only agent context assembly for one brief.
   -> verify: fixture-backed test returns public projection plus authorized D1
   draft overlay without importing `tools/`, `packages/analytics`, or
   `knowledge/`.
6. Implement `proposeBriefEdit` plus deterministic helper tools for refs,
   attach, and validation. Authored metadata/prose/claim/block changes should
   be operations inside a proposal, not direct accepted-draft writes.
   -> verify: agent-tool tests prove malformed structured output returns
   repair feedback, valid output stores a proposal, and accepted-draft rows are
   unchanged until the apply endpoint runs.
7. Replace the current `not_configured` generate path with queued Think-agent
   generation.
   -> verify: Worker test shows `POST .../draft/generate` records a queued job,
   signals the agent, returns `StudioBriefGenerationJobResponse`, and never
   performs inline model work in the REST handler. **Done.**
8. Add an integration smoke with a fake model/tool loop that writes a small draft
   body, claim, block, and refs, then validates.
   -> verify: `bun --filter @bp/web test:worker` covers queued -> running ->
   succeeded and failed job states.
9. Wire the authoring UI chat only after the backend shell and generate job path
   are stable.
   -> verify: `bun --filter @bp/web build` and a focused UI test or manual
   local smoke with the fake model.
10. Revisit Codemode only after the evidence catalog and mid-layer data endpoints
    are real.
    -> verify: a separate ADR or update to this note explains why standard tools
    are insufficient for that workflow.

## Open Questions

- What transcript retention policy do we want for private authoring sessions?
- Should `draft/generate` initially be job polling only, or should it also expose
  a stream for the current run?
- Do publish-candidate tools stay human-confirmed forever, or do some trusted
  agent roles eventually get `publish:briefs`?
- Do Think's current compatibility flags, especially `nodejs_compat`, affect the
  existing Vite/Worker bundle or test harness?

## Non-Goals

- No inline LLM calls in public REST request handlers.
- No import from `tools/pipeline-v2`, `packages/analytics`, or `knowledge/` into
  Worker agent runtime.
- No public projection mutation from the Worker.
- No Postgres, Python, VPS, or non-TypeScript runner as part of this stack.
- No Codemode in v1 unless a focused workflow proves standard tools are
  inadequate.

## References

- Cloudflare Agents Think docs, checked 2026-06-01:
  https://developers.cloudflare.com/agents/api-reference/think/
- Cloudflare Agents Sessions docs, checked 2026-06-01:
  https://developers.cloudflare.com/agents/api-reference/sessions/
- Cloudflare Agents Codemode docs, checked 2026-06-01:
  https://developers.cloudflare.com/agents/api-reference/codemode/
- Cloudflare Agents store-and-sync-state docs, checked 2026-06-01:
  https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/
- `docs/decisions/0014-brief-draft-live-write-serving.md`
- `docs/decisions/0015-brief-markdown-and-primitives.md`
- `docs/architecture/brief-markdown-primitives.md`
- `docs/architecture/studio-review-collaboration-and-promotion.md`
- `docs/architecture/studio-agent-edit-approval-versioning.md`
