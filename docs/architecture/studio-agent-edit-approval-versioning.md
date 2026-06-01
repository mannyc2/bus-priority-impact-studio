# Studio Agent Edit Approval & Versioning

Status: **Accepted** - proposal approval backend plus first Think execution slice implemented
Last updated: 2026-06-01

This note answers one narrow question: when the Studio AI agent wants to modify a
brief, what triggers it, what can it change, who approves it, and what version
record is created?

It extends:

- `docs/architecture/studio-brief-authoring-ux.md`
- `docs/architecture/studio-agent-stack.md`
- `docs/architecture/brief-markdown-primitives.md`
- `docs/architecture/studio-review-collaboration-and-promotion.md`

## Decision

The agent should not silently mutate the accepted draft body.

For v1, AI authoring produces a **proposed change set** against a known draft
version. The author can accept all of it, accept selected changes, ask the agent
to revise, or reject it. Applying an approved change set creates a durable draft
version and records an audit/history event.

This gives us three things at once:

1. the composer can feel live and AI-assisted;
2. no model output becomes accepted editorial text without operator intent; and
3. review, rollback, and publication validation have stable content hashes to
   reason about.

## Trigger Model

AI edit triggers are explicit product actions, not passive background behavior.

| Trigger | Example UI | Agent output | Approval |
|---|---|---|---|
| Generate draft | `Generate` / `Regenerate` from composer | Whole-brief body, blocks, refs, claim edits | Required before replacing accepted draft |
| Revise selection | Select prose -> `Improve wording` / `Make caveat explicit` | Text replacement for a range/quote | Required |
| Fix validation issue | Click a blocking issue -> `Ask AI to repair` | Targeted body/block/ref/claim patch | Required |
| Insert from corpus | Corpus palette best match | Proposed block/ref plus body directive | Accepting the palette row is the approval |
| Send to brief | Capture object -> choose destination | Proposed or deterministic attached block/ref | Approval is the sheet confirmation |
| Review response | Author asks agent to address a review thread | Patch tied to the thread id | Required, then thread can resolve |

The agent can run in the background only after one of these triggers. It should
not wake on a timer or route-page visit and change draft content by itself.
Scheduled/queued agent tasks are for continuing a user-started run, retrying a
failed step, or refreshing status.

## Execution Model

Use Cloudflare Think for the real-time agent and its queue for short async agent
work. If a generation or review-repair flow needs durable multi-step execution,
long waits after approval, or recovery across several external systems, add
Cloudflare Workflows as a separate implementation slice.

Human approval in this product is **approval of the agent's end result**, not
approval of every internal tool call. The agent may call read tools, draft a
proposal, validate that proposal, and save proposal metadata without interrupting
the user. The pause happens before model-authored content becomes accepted draft
content.

Tool-call approval should be reserved for exceptional actions with immediate
side effects, such as marking a publish candidate, sending external
notifications, changing access roles, or spending unusually large inference
budget. Normal authoring tools should be scoped and audited, but not gated
one-by-one.

Initial shape:

```text
operator action
  -> Worker records agent run with base draft version/hash
  -> Think agent reads draft context and evidence
  -> agent calls proposeBriefEdit with structured operations
  -> Worker validates or returns machine-readable repair feedback
  -> agent retries until the proposal validates or the run fails
  -> UI previews proposal and validation result
  -> operator approves the end result or selected operations
  -> Worker applies approved operations and creates draft version
```

The existing `POST /api/v1/studio/briefs/{id}/draft/generate` remains the
compatibility trigger for whole-brief generation. It now starts a queued
Cloudflare Think agent run that produces a proposal when `AI` and
`BRIEF_AUTHOR_AGENT` are configured. It still does not write final content
inline.

## Internal State Machine

Agent runs and proposals need explicit server-owned state. A simple v1 state
machine is enough, but the states should be durable so refreshes, retries, and
human approval waits do not depend on an open browser tab.

The durable copy of these states belongs in D1. Cloudflare Agent state may mirror
the current run/proposal progress to connected browsers with `setState`, but it
must be reconstructable from D1 and must not become the only record of approval,
application, versioning, or publish lifecycle transitions.

Agent run statuses:

- `queued`: the operator asked the agent to work and the Worker recorded the
  request.
- `running`: the runtime has started model/tool execution.
- `needs_approval`: the agent produced a valid proposal and is waiting on a
  human decision.
- `failed`: execution stopped without a valid proposal.
- `cancelled`: a human or system cancelled the run before approval.
- `superseded`: a newer run/proposal replaced this one for the same target.

Proposal statuses:

- `drafting`: the agent is still submitting or repairing structured
  operations.
- `proposed`: operations validated and can be previewed.
- `applying`: the Worker is applying approved operations and creating a draft
  version.
- `partially_applied`: the author accepted only selected operations.
- `applied`: all accepted operations were applied to the draft.
- `rejected`: the author rejected the proposal.
- `stale`: the accepted draft changed from the proposal base.

Approval moves a proposal from `proposed` to `applying`/`applied` or
`partially_applied`. The run's durable waiting state is `needs_approval`; no
Workflow wait is required for this ordinary authoring pause.

## Proposed Change Set

A change set is a structured patch, not free-form markdown replacement.

```ts
type StudioBriefAgentChangeSet = {
  proposalId: string;
  runId: string;
  briefId: string;
  baseVersionId: string;
  baseContentHash: string;
  title: string;
  summary: string;
  operations: StudioBriefAgentOperation[];
  validation: StudioBriefDraftValidation | null;
  provenance: {
    modelProvider: string;
    modelId: string;
    promptHash: string;
    evidenceRefs: string[];
  };
  status: "proposed" | "partially_applied" | "applied" | "rejected" | "stale";
};
```

Operation types should map to the existing content graph:

- replace body markdown range or quote,
- replace draft body markdown,
- upsert/delete a typed block,
- upsert/delete refs,
- patch claim metadata/body during the transition period,
- add review reply/comment,
- request validation.

The agent should submit those operations through a narrow proposal-building
tool, not through accepted-draft mutation tools.

```ts
type ProposeBriefEditResult =
  | {
      ok: true;
      proposalId: string;
      status: "proposed";
      previewHash: string;
      validation: StudioBriefDraftValidation;
    }
  | {
      ok: false;
      status: "repair_required" | "stale_base" | "rejected";
      errors: Array<{
        code: string;
        path: string;
        message: string;
        retryable: boolean;
      }>;
    };
```

`proposeBriefEdit` should validate the schema, operation limits, target refs,
text selectors, base version/hash, operator scope, and deterministic draft
validation preview. On failure it returns machine-readable feedback so the
agent can repair and retry. On success it stores a `proposed` change set for
human approval. Failed attempts can be retained as compact telemetry, but they
should not become accepted draft history.

Applying proposal operations should be a separate Worker action that revalidates
schema, scope, idempotency, base version, and conflicts.

That means `write:briefs` tools used by the agent should normally write to the
proposal surface, not directly to the accepted draft. Applying an approved
proposal is the moment that mutates accepted draft `bodyMd`, blocks, refs, and
claims.

## Approval Modes

Use three modes, with conservative defaults:

| Mode | Use | Persistence |
|---|---|---|
| Ghost preview | Streaming prose or figure preview while the model is still working. | Client-local only; disappears unless accepted. |
| Staged proposal | Whole draft generation, validation repair, review response, multi-block edits. | Stored in D1/R2 as a proposal until accepted/rejected. |
| Direct apply | Deterministic user-confirmed actions like Send-to-brief attach. | Applies immediately because the user clicked the concrete action. |

Do not allow autonomous `direct apply` for LLM-authored prose in v1. "Accept
best match" is fine because the user is approving a specific proposed primitive
row.

## Versioning Model

Keep the UX doctrine: no autosave scrubber as the main authoring interface.

But persistent versioning is useful at approval boundaries. Add durable draft
versions for:

- draft creation,
- agent proposal application,
- suggested edit acceptance,
- manual publish-candidate marking,
- promotion receipt,
- explicit restore.

A draft version should capture:

```ts
type StudioBriefDraftVersion = {
  versionId: string;
  briefId: string;
  parentVersionId: string | null;
  contentHash: string;
  createdAt: string;
  actorId: string;
  actorType: "human" | "agent" | "system";
  reason:
    | "draft_created"
    | "manual_edit"
    | "agent_proposal_applied"
    | "suggestion_accepted"
    | "publish_candidate"
    | "promotion_receipt"
    | "restored";
  sourceRunId?: string;
  sourceProposalId?: string;
  validationScore?: number | null;
  snapshotRef: {
    storage: "d1" | "r2";
    key: string;
    sha256: string;
  };
};
```

Snapshots can start compact in D1 if bounded, but larger body/blocks/refs
snapshots should move to R2. The existing `studio_brief_history_event` remains
the activity log; versions are the restoreable content milestones.

Restore should create a new version from an old snapshot. It should not rewrite
history.

## Conflict Handling

Every agent run starts from a `baseVersionId` and `baseContentHash`. Applying a
proposal requires the same accepted draft base unless the patch is provably
non-overlapping.

If the draft changed:

- mark proposal `stale`,
- show "draft changed since this proposal",
- allow the author to ask the agent to rebase/revise,
- never silently apply stale prose replacements.

Quote selectors from the review model are useful here: text operations should
prefer exact quote plus prefix/suffix matching over raw offsets.

## UI Shape

The composer should show agent output as proposal cards or inline ghost content:

- `Accept all`
- `Accept selected`
- `Revise`
- `Reject`
- `View sources`
- validation result after applying in preview

For text, show an inline diff. For primitives, show the actual block preview. For
review repair, link the proposal to the review thread it addresses.

Versioning should appear as a small "milestones" drawer or action menu, not the
retired autosave timeline. The useful user questions are:

- What changed?
- Who or what proposed it?
- What did I accept?
- Can I restore the previous accepted version?

## API Sketch

Prefer additive endpoints under the existing draft namespace:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/studio/briefs/{id}/draft/agent-runs` | Start a targeted agent run. |
| `GET /api/v1/studio/briefs/{id}/draft/agent-runs/{runId}` | Poll run/proposal status. |
| `POST /api/v1/studio/briefs/{id}/draft/agent-runs/{runId}/propose-edit` | Submit structured operations and receive repair feedback or a stored proposal. |
| `GET /api/v1/studio/briefs/{id}/draft/proposals/{proposalId}` | Fetch proposed operations and preview metadata. |
| `POST /api/v1/studio/briefs/{id}/draft/proposals/{proposalId}/apply` | Apply all or selected operations after approval. |
| `POST /api/v1/studio/briefs/{id}/draft/proposals/{proposalId}/reject` | Reject proposal with optional reason. |
| `GET /api/v1/studio/briefs/{id}/draft/versions` | List restoreable draft versions. |
| `POST /api/v1/studio/briefs/{id}/draft/versions/{versionId}/restore` | Create a new draft version from an older snapshot. |

`POST .../draft/generate` can become a convenience wrapper around
`POST .../draft/agent-runs` with `intent = "generate_brief"`.

## Implementation Status

The proposal approval backend slice is implemented: domain schemas, D1
migrations/query helpers, Worker endpoints, OpenAPI entries, client helpers, and
Worker tests now support starting agent runs, submitting structured proposed
edits through the proposal-first path, returning machine-readable repair
feedback, fetching stored proposals, applying all or selected proposal
operations, rejecting proposals, listing draft-version rows, and restoring D1
version snapshots. Applying an approved proposal mutates accepted draft content,
marks the proposal applied or partially applied, records accepted operation ids,
stores a D1 snapshot, and creates a draft-version milestone. This slice
now also includes the first Cloudflare Think / Workers AI execution path:
`draft/generate` queues a generation job, signals `BriefAuthorAgent`, and the
agent calls `proposeBriefEdit` so valid model output becomes a proposal waiting
for human approval.

## Implementation Plan

1. Add domain schemas for agent run state, proposal state, change set,
   operation, proposal feedback errors, and draft version.
   -> verify: `bun --filter @bp/domain test`. **Done.**
2. Add D1 migrations/query helpers for agent runs, proposals, and draft versions.
   -> verify: `bun --filter @bp/db test`. **Done.**
3. Add the Worker-local `proposeBriefEdit` service/tool that validates
   structured operations, returns machine-readable repair feedback, and stores
   only valid proposals.
   -> verify: focused tests cover malformed operations, stale base hashes,
   selector misses, and a valid stored proposal. **Done.**
4. Add Worker endpoints with fake-model/no-model behavior: start run, store
   proposal, apply/reject proposal, list/restore versions.
   -> verify: `bun --filter @bp/web test:worker`. **Done.**
5. Change `draft/generate` to create an agent run/proposal when the runner is
   configured, while preserving honest `not_configured` behavior before then.
   -> verify: Worker test covers configured and unconfigured paths. **Done.**
6. Add composer proposal UI using a fake proposal fixture: ghost preview,
   accept/reject/revise, and version milestone drawer.
   -> verify: `bun --filter @bp/web build`.
7. Wire Think/Workers AI to call `proposeBriefEdit`, inspect validation
   feedback, and retry bounded repairs before surfacing a proposal or failure.
   -> verify: fake model and one real-model smoke produce a proposal that
   validates before apply, and a malformed proposal gets repaired or fails with
   visible feedback. **Done for the fake-binding Worker path; real-model smoke
   remains manual/deployment verification.**
8. Add optional per-tool approval only for exceptional side-effecting tools, not
   for normal proposal creation.
   -> verify: tool registry marks publish/access/external-notification tools as
   approval-required while read/propose/validate tools run without prompt loops.

## Non-Goals

- No silent AI edits to accepted draft prose.
- No per-tool approval prompts for ordinary proposal-building tools.
- No real-time multi-user CRDT editing.
- No public version/proposal endpoint.
- No full autosave timeline as the primary UX.
- No public projection mutation from an agent run.
