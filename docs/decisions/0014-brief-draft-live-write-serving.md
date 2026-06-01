# 0014 - Studio brief-draft live-write serving

Date: 2026-05-31

## Status

Accepted.

## Context

> 2026-06-01 update: ADR 0016 implements the future Cloudflare Think / Workers AI runner described
> below. The live-write/auth/idempotency decisions in this ADR still stand.

The Studio brief-draft authoring feature already had browser client functions, domain Zod schemas,
D1 migrations, and D1 query helpers, but the Worker did not expose the draft routes. The authoring
UI could typecheck while runtime requests returned 404.

Public Studio reads are still projection-backed R2 resources. Draft authoring is different: it is a
private AI-backed write surface where operators edit generated claims, request generation, validate
drafts, review, and mark publish candidates. Heavy LLM inference must not run inline in a public
request path.

ADR 0008 defines the shared `identity` / `identity_session` / `studio_actor_role` model and the
`bp_session` cookie used to resolve operator scopes.

## Decision

Serve `/api/v1/studio/briefs/{briefId}/draft*` from the Worker as a D1 live-write surface backed by
`packages/db/src/d1/queries/studio-brief-drafts.ts`.

The Worker keeps published/public brief reads anonymous. `GET /api/v1/studio/briefs/{briefId}`
continues to read the release projection from R2. If the request has a valid operator session with
`read:briefs` in the draft workspace, the Worker overlays the D1 draft title/dek/summary/version,
claims, `draftStatus`, and `draftPublishedAt`; anonymous and non-operator callers receive the R2
projection with the draft fields left `null`.

Draft endpoints require a valid `bp_session` operator role because the brief authoring surface is
AI-backed, private workspace state:

- `write:briefs`: draft creation, draft metadata edits, claim create/update/delete, validation, and
  generation job recording.
- `review:briefs`: review request/comment creation plus approve/request-changes verdicts.
- `publish:briefs`: publish-candidate marking, retracting, and publish-candidate export.

Anonymous callers receive 401. Signed-in identities without a matching operator role/scope receive
403. Workspace mismatches also receive 403.

All draft mutations require the `Idempotency-Key` header. The Worker checks and records successful
write responses through `studio_brief_write_idempotency`, keyed by method + path + key. The browser
client generates a key per mutation by default and lets callers pass a stable key for retrying the
same user/agent action.

`POST /draft/generate` does not call an LLM inline. It ensures a draft exists, records an
`llm_assisted` generation job on the draft, and returns a `StudioBriefGenerationJobResponse`.
Before ADR 0016 wired Cloudflare Think / Workers AI, that job failed closed with
`job_llm_status = "not_configured"` so callers did not poll a job that nothing could consume. ADR
0016 keeps the same public route shape and replaces the placeholder with an out-of-band
Durable Object runner.

Publish-candidate export is a read of the draft candidate, not a release mutation. It returns the
strict export payload and a deterministic future R2 artifact key under the current Studio release
prefix. The immutable public release projection remains unchanged until an explicit promotion step
is designed.

## Alternatives considered

- **Run LLM generation inline in the Worker request**: rejected. It violates the no-heavy-public-path
  rule and creates timeout/cost ambiguity.
- **Keep draft writes in R2 only**: rejected. Claim edits, status transitions, validation, history,
  and idempotency need transactional small-row updates.
- **Require auth only for generation**: rejected for this slice. All draft endpoints operate on the
  private brief authoring artifact produced by an AI-backed flow, so the whole draft surface is
  operator-scoped.
- **Expose D1 row objects directly**: rejected. The Worker maps D1 rows into the existing domain
  contracts and OpenAPI document.

## Consequences

### Positive

- The browser client and future agent clients now have real Worker endpoints for the existing draft
  contract.
- Route/finding/source-brief seeds can now mint draft-only brief ids without first publishing an R2
  projection.
- Public brief reads stay fast and anonymous, while operators get live draft status when authorized.
- Idempotency is enforced server-side for retrying browser and agent actions.
- The generation route had honest behavior before the out-of-band AI runner existed and now has an
  ADR 0016 runner without changing the route shape.

### Negative

- The Worker now owns a small live-write path in addition to projection reads, so tests must cover
  D1 row mapping, authz, and idempotency.
- The generation endpoint is intentionally non-productive until Cloudflare Think / Workers AI runner
  wiring lands.
- The publish-candidate export does not itself promote a public release; that release workflow still
  needs a separate decision.
