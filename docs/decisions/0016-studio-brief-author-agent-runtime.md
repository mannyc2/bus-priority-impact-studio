# 0016 - Studio brief author agent runtime

Date: 2026-06-01

## Status

Accepted.

## Context

ADR 0014 established Studio brief drafts as a D1 live-write surface and required that AI generation
not run inline in public REST handlers. At that point `POST /draft/generate` honestly recorded
`not_configured` because no out-of-band runner existed.

The authoring product now needs real AI execution while preserving the approval model in
`docs/architecture/studio-agent-edit-approval-versioning.md`: AI may draft proposals, but accepted
brief content changes only after human approval.

## Decision

Use Cloudflare Think plus Workers AI as the first production authoring runtime.

`apps/web/src/worker/index.ts` exports `BriefAuthorAgent`, a Think-backed Durable Object agent. The
Worker binds it as `BRIEF_AUTHOR_AGENT` and binds Workers AI as `AI` in deploy configs. The model is
selected through `STUDIO_AGENT_MODEL`, defaulting to
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

`POST /api/v1/studio/briefs/{briefId}/draft/generate` now:

- authenticates the operator with `write:briefs`;
- ensures a D1 draft exists;
- records a queued `llm_assisted` generation job and a queued agent run with the current draft
  version/hash;
- signals the draft-scoped `BriefAuthorAgent` through Durable Object RPC using `ctx.waitUntil`;
- returns `StudioBriefGenerationJobResponse` immediately without waiting for model inference.

The agent calls Workers AI through the AI SDK provider inside `getModel()`. Its first write tool is
`proposeBriefEdit`, backed by the same Worker-local proposal validation path used by REST
`POST .../agent-runs/{runId}/propose-edit`. Invalid structured output returns machine-readable
repair feedback to the model. Valid output stores a proposal, marks the agent run `needs_approval`,
marks the generation job succeeded, and leaves accepted draft content unchanged until an operator
applies the proposal.

The test Wrangler config intentionally omits the `AI` binding so the Worker harness does not start a
remote Workers AI proxy; Worker tests inject a fake `AI` binding and fake author-agent namespace for
the queued path.

## Alternatives considered

- **Run Workers AI directly in the REST handler**: rejected. It would violate the no-heavy-public-path
  rule and block the response on model/tool repair loops.
- **Use Cloudflare Queue first**: deferred. Think submissions already give us a durable agent-side
  queue for this short v1 authoring task. Queue/Workflow can be added later for multi-system
  workflows that outgrow a Think turn.
- **Let the agent mutate accepted drafts directly**: rejected. Human approval of the final proposal
  is a product requirement.

## Consequences

- The generation endpoint is now productive when `AI` and `BRIEF_AUTHOR_AGENT` are configured.
- D1 job/run/proposal rows remain the product-facing source of truth for polling and audits.
- Public brief projections remain unchanged by agent execution; promotion still happens through the
  explicit publish-candidate flow.
- Real-model smoke testing is now possible, but CI continues to rely on fake bindings.
