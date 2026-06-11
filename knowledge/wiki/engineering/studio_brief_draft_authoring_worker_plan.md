---
title: Studio Brief-Draft Authoring Worker Plan
type: engineering
status: implemented
last_updated: 2026-06-01
owner: codex
source_count: 2
tags: [studio, worker, d1, auth, ai, briefs, authoring]
---

# Studio Brief-Draft Authoring Worker Plan

## Purpose

The Studio brief-draft authoring client, domain schemas, D1 migrations, and most D1 query helpers
exist, but the Cloudflare Worker routes that connect them are missing. The browser authoring UI
therefore typechecks but still 404s at runtime for `/api/v1/studio/briefs/{briefId}/draft*`.

This page records the implementation plan and its implementation status.

## Verified Current State

Checked against the live tree on 2026-05-31:

- `apps/web/src/studio/api-client.ts` calls `/api/v1/studio/briefs/{briefId}/draft*`.
- `packages/domain/src/studio-brief-draft-schemas.ts` defines the draft request/response schemas
  and is re-exported through `@bp/domain` plus `apps/web/src/studio/api-contract.ts`.
- `packages/db/src/d1/queries/studio-brief-drafts.ts` contains the CRUD, validation, generation
  status, review, publish/retract, history, and idempotency helpers.
- `packages/db/src/d1/queries/studio-auth.ts` exists, but the current Worker already uses the
  newer identity helpers from `identity.ts`; both `studio-auth.ts` and `studio-brief-drafts.ts`
  are not re-exported from `packages/db/src/d1/index.ts`.
- `apps/web/src/worker/index.ts` has the draft handler, auth helpers, and the `BriefAuthorAgent`
  Cloudflare Think Durable Object class.
- `apps/web/wrangler.jsonc` has D1/R2/cron bindings plus Workers AI (`AI`) and the
  `BRIEF_AUTHOR_AGENT` Durable Object binding for brief generation.
- `StudioBriefDraftStatusSchema` currently accepts only `draft`, `in_review`, `approved`, and
  `archived`, while the D1 draft row parser accepts `drafting`, `publish_candidate`, `published`,
  and `retracted` too. This must be aligned before exposing `draftStatus` from D1.

## Decisions

1. Public Studio read endpoints stay anonymous. Draft-authoring endpoints require auth because this
   feature area creates or mutates AI-backed/private authoring artifacts.
2. Anonymous callers to draft endpoints receive `401`. Signed-in callers without an operator role
   or without the required scope receive `403`.
3. Scope gates:
   - `write:briefs`: metadata edits, claim create/update/delete, validation, generation request.
   - `review:briefs`: review request/comment.
   - `publish:briefs`: publish candidate, retract, publish-candidate export.
4. `GET /api/v1/studio/briefs/{briefId}` remains public. If the request has an authenticated
   operator in the draft workspace, the Worker overlays the D1 draft and populates `draftStatus`
   and `draftPublishedAt`; otherwise it returns the R2 release projection with those fields null.
5. Idempotency uses an `Idempotency-Key` request header for every draft mutation. Browser calls can
   generate one key per user action in `sendStudioJson`; external agent clients should supply a
   stable retry key.
6. `POST /draft/generate` records a generation job and never runs LLM inference inline in the
   public request path. With `AI` and `BRIEF_AUTHOR_AGENT` configured, it queues the Cloudflare Think
   `BriefAuthorAgent` to call Workers AI out-of-band and produce a proposal. Missing bindings still
   fail closed with typed `not_configured` job state.
7. This slice should not add Python, hosted Postgres/PostGIS, a VPS, or pipeline imports into the
   Worker.

Cloudflare reference check: Cloudflare Think is documented as a Workers agent base class backed by
Durable Object SQLite, and Workers AI requires an `env.AI` binding. The implemented runner follows
that model.

## Query Mapping And Gaps

| Method | Path | Request schema | Response | D1 helper mapping | Gap to handle |
|---|---|---|---|---|---|
| `PATCH` | `/briefs/{id}/draft` | `StudioBriefDraftPatchRequest` | `204` | `updateStudioBriefDraftMetadata` | Seed draft first if only R2 brief exists; history event. |
| `POST` | `/briefs/{id}/draft/generate` | `StudioBriefDraftGenerateRequest` | `StudioBriefGenerationJobResponse` | `updateStudioBriefDraftJobStatus` plus `insertStudioBriefAgentRun`; Think agent later stores proposal through `insertStudioBriefAgentProposal` | Queues `BriefAuthorAgent`; do not inline inference. |
| `POST` | `/briefs/{id}/draft/claims` | `StudioBriefDraftClaimCreateRequest` | `StudioBriefDraftClaimResponse` | `insertStudioBriefDraftClaim` | Must assign `claimN`; helper does not compute it. |
| `PATCH` | `/briefs/{id}/draft/claims/{n}` | `StudioBriefDraftClaimPatchRequest` | `204` | `updateStudioBriefDraftClaim` | Claim number validation and history event. |
| `DELETE` | `/briefs/{id}/draft/claims/{n}` | none | `204` | `deleteStudioBriefDraftClaim` | Renumbering is in helper; add history event. |
| `POST` | `/briefs/{id}/draft/validate` | `{}` | `StudioBriefDraftValidationResponse` | `updateStudioBriefDraftValidation` | Worker must compute deterministic validation result from draft claims. |
| `POST` | `/briefs/{id}/draft/review` | `StudioBriefDraftReviewRequest` | `204` | `insertStudioBriefReviewComment` | Use authenticated identity email/display name, not browser-supplied reviewer. |
| `POST` | `/briefs/{id}/draft/publish` | `StudioBriefDraftPublishRequest` | `204` | `markStudioBriefDraftPublishCandidate` | Contract is void in client; publish is candidate creation, not release promotion. |
| `POST` | `/briefs/{id}/draft/retract` | `StudioBriefDraftRetractRequest` | `204` | `markStudioBriefDraftRetracted` | Preserve `published_at`; helper already leaves it unchanged. |
| `GET` | `/briefs/{id}/draft/publish-candidate-export` | none | `StudioBriefPublishCandidateExportResponse` | `getStudioBriefDraftRecord` plus R2 release route/brief data | No direct db helper builds the export; Worker must construct and schema-parse it. |

Additional contract gap: `StudioBriefDraftPublishResponseSchema`,
`StudioBriefDraftRetractResponseSchema`, and `StudioBriefDraftReviewResponseSchema` exist in
domain but the current browser client treats those operations as `204`. Keep the Worker aligned to
the browser contract for this slice unless the client contract is deliberately revised.

## Step-By-Step Plan

1. Re-export db helpers from `packages/db/src/d1/index.ts` using explicit named exports for
   `studio-brief-drafts.ts` and `studio-auth.ts` -> verify: `rg "getStudioBriefDraftRecord|StudioActorAuth" packages/db/src/d1/index.ts` and `bun --filter @bp/db test`.

2. Align the public/domain draft status enum with the D1 row enum, while keeping
   `StudioBriefDraftPatchRequestSchema.status` limited to editable statuses -> verify:
   `bun run check:types`.

3. Add JSON Schema exports for draft request/response contracts so OpenAPI can import them from
   `@bp/domain`, not from app code -> verify: `bun run check:types`.

4. Add `handleBriefDraftRoutes(request, env, url)` in `apps/web/src/worker/index.ts`, called before
   the generic Studio R2 handler -> verify: unauthenticated `PATCH /api/v1/studio/briefs/x/draft`
   returns `401` instead of the current Studio `404`.

5. Add a small authz helper around existing `resolveIdentity` output: require `env.DB`, identity,
   operator role, workspace, and the endpoint-specific scope -> verify:
   `apps/web/test/worker/brief-draft.worker.test.ts` covers `401`, `403`, and allowed operator
   paths.

6. Add Worker-local draft serializers that convert `StudioBriefDraftRecord` rows plus parsed claim
   JSON into `StudioBriefDraftSchema`; do not import pipeline code -> verify:
   `StudioBriefDraftSchema.parse(...)` in the Worker test fixture.

7. Add a bounded `ensureDraftRecord` path for existing release briefs: read the R2 brief projection,
   insert a D1 draft with the operator workspace if absent, and copy current release claims into
   `studio_brief_draft_claim` -> verify: FakeDb test starts with no draft rows, performs a draft
   write, and observes draft plus claim inserts.

8. Implement metadata and claim mutation endpoints against
   `updateStudioBriefDraftMetadata`, `insertStudioBriefDraftClaim`,
   `updateStudioBriefDraftClaim`, and `deleteStudioBriefDraftClaim`; append
   `insertStudioBriefHistoryEvent` after each successful mutation -> verify:
   endpoint tests assert status codes, persisted row changes, and history rows.

9. Implement validation as deterministic lightweight Worker logic over the D1 draft: weak claims
   are low-strength or weak-state claims, missing evidence are claims with no evidence ids, and
   blocking issues include empty title/body/claim sets -> verify:
   `POST /draft/validate` returns `StudioBriefDraftValidationResponseSchema` and persists validation
   columns.

10. Implement review, publish-candidate, retract, and publish-candidate export endpoints. Review
    uses authenticated identity fields. Export constructs
    `StudioBriefPublishCandidateExportResponseSchema` from D1 draft plus R2 route/release context ->
    verify: Worker tests parse the export schema and assert publish/retract status transitions.

11. Wrap all draft mutations in D1 idempotency: check `getStudioBriefWriteIdempotency` by
    `Idempotency-Key`, method, and path before mutation; store status and JSON response with
    `recordStudioBriefWriteIdempotency` after success -> verify: repeating the same mutation with
    the same header replays the first response and does not duplicate claim/history rows.

12. Update `apps/web/src/studio/api-client.ts` only as needed to attach an `Idempotency-Key` header
    for mutating draft calls; do not rebuild the existing contract functions -> verify:
    `bun run check:types`.

13. Wire `GET /api/v1/studio/briefs/{briefId}` to read D1 draft status for authenticated operators
    and overlay the editable D1 draft body only when the draft belongs to their workspace; anonymous
    and non-matching workspace reads remain public R2 projection reads -> verify: Worker tests cover
    anonymous `draftStatus: null`, authorized `draftStatus: "publish_candidate"`, and workspace
    mismatch fail-closed/null overlay.

14. Implement `POST /draft/generate` as queued Think-agent generation when bindings exist and
    `failed` / `not_configured` when they do not. Never call Workers AI inline in the REST handler
    -> verify: Worker test parses `StudioBriefGenerationJobResponseSchema`, confirms the configured
    path signals the fake agent namespace, and confirms missing bindings fail closed. **Done.**

15. Add db tests for draft row parsing, idempotency rows, claim renumbering, publish/retract status,
    and history sequencing in `packages/db/test/` -> verify: `bun --filter @bp/db test`.

16. Add `apps/web/test/worker/brief-draft.worker.test.ts` using the `FakeDb` plus
    `worker.fetch(request, env)` pattern from `auth-magic-link.worker.test.ts` -> verify:
    `bun --filter @bp/web test:worker`.

17. Expand `packages/domain/src/studio-openapi.ts` with all `/draft*` paths, request bodies, draft
    response schemas, `204`, `401`, `403`, `404`, and `503` responses. Add `delete` to the local
    OpenAPI method type -> verify: existing OpenAPI Worker test includes
    `/api/v1/studio/briefs/{briefId}/draft/generate` and
    `/api/v1/studio/briefs/{briefId}/draft/claims/{claimN}`.

18. Update in-app docs surfaces if they enumerate Studio endpoints, especially
    `apps/web/src/studio/sample-data.ts`, so they list `/draft*` endpoints and do not advertise
    stale `/briefs/:id/generate` paths -> verify: `rg "/generate|/draft" apps/web/src/studio`.

19. Add ADR `docs/decisions/0014-brief-draft-live-write-serving.md` for the live D1 write model,
    auth scopes, idempotency header, R2 plus D1 read overlay, and Cloudflare Think as the future
    async generation runner. Relate it to ADR 0008 public identity auth -> verify:
    `rg "brief-draft live-write|Idempotency-Key|Cloudflare Think" docs/decisions/0014-*.md`.

20. Update wiki/docs: `web_api_endpoint_architecture.md`, `agent_author_api.md`,
    `studio_design_pass_status.md`, and check whether `package_structure.md` needs a short note.
    Update `knowledge/index.md` and `knowledge/log.md` -> verify: `bun run check:knowledge`.

21. Run final bounded checks -> verify: `bun run check:types`,
    `bun --filter @bp/db test`, `bun --filter @bp/web test:worker`,
    `bun --filter @bp/web build`, and
    `bun test tests/harness/production-boundaries.test.ts`.

## Out Of Scope For This Slice

- Public WebSocket/chat UI for the Cloudflare Think agent.
- Real-model CI tests; CI uses fake Worker bindings.
- Creating a public chat endpoint.
- Changing the public R2 release projection pipeline except for the brief-read draft overlay.
- Adding Python, hosted Postgres/PostGIS, a VPS, or Worker imports from pipeline packages.

## Sources

- Cloudflare Think docs — https://developers.cloudflare.com/agents/api-reference/think/ —
  checked: 2026-05-31.
- Cloudflare Workers AI bindings docs —
  https://developers.cloudflare.com/workers-ai/configuration/bindings/ — checked: 2026-05-31.
