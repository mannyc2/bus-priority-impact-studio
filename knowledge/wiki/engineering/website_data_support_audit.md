---
title: Website Data Support Audit
type: engineering
status: active
last_updated: 2026-06-01
owner: codex
source_count: 0
tags: [website, audit, studio-api, d1, r2, cutover, mocks]
---

# Website Data Support Audit

## Purpose

This page records what the website actually loads, what is still demo-shaped, and which data exists
in production serving storage but is not yet exposed through the route-first Studio API.

The key finding: the frontend is no longer production-mocked through fixture imports. Studio route
listing/search now use the D1-backed public route set, and per-route Studio detail projections are
generated for the full public route set. Studio briefs now cover the public route set too, with
dedicated evidence/history projections. Studio findings now prefer the local detector review queue
instead of the older route-score-only generator. The remaining product gap is narrower: findings are
review-gated candidates rather than approved publication claims, generated briefs are not
editorially reviewed by default, and the write-side authoring API is still design-only.

## Audit Method

Code inspection on 2026-05-18 and 2026-05-23 checked:

- `apps/web/src/studio/api-client.ts`
- `apps/web/src/routes/**`
- `apps/web/src/worker/index.ts`
- `tools/pipeline/src/jobs/build/studio-release.ts`
- `packages/domain/src/studio-schemas.ts`
- `packages/db/src/d1/queries/route-observed-reliability.ts`
- `packages/db/src/local/repositories/observed-reliability.ts`
- `tests/harness/production-boundaries.test.ts` through `bun run check:web-architecture`
- `tests/harness/production-boundaries.test.ts`

The production data-store counts below also incorporate the 2026-05-18 production cutover handoff
recorded in `knowledge/log.md`.

## Current Production Serving Shape

### Cloudflare D1

Production D1 `bus-priority-serving` was reported as loaded with the canonical March 2026 release
plus the May 2026 observed appendix:

- 381 route catalog rows.
- March 2026 monthly serving tables for route coverage, trends, readiness, build plan, baseline
  reliability, intervention comparisons, artifacts, brief summaries, scorecards, equity context,
  corridor summaries, and batch status.
- March 2026 `route_observed_reliability_summary`: 381 rows from `bus-observatory-2026-03`
  (`third_party_recovered` provenance).
- May 2026 `route_observed_reliability_summary`: 381 rows from
  `gtfs-rt-v1-20260517T103607Z-24h` (`official_self_collected` current appendix evidence).
- May 2026 `route_month_source_status`: reliability-scope rows only.

### Cloudflare R2

Production R2 `bus-priority-artifacts` was reported as loaded with:

- `briefs/2026-03/` route/corridor brief artifacts and manifest.
- `evaluations/2026-03/` intervention and observed-reliability payloads.
- `map/2026-03/` manifest and route-segment GeoJSON artifacts.
- `pipeline-v1/` audit payloads including March observed and March+May appendix audits.
- `source-availability/` public-source availability artifacts.
- `studio/v1/` route-first Studio projection JSON files.

The separate `bus-priority-gtfs-rt-raw` bucket is the raw capture bucket for Worker-written
GTFS-RT snapshots and is not part of public Studio serving.

## Runtime Data Paths

| Surface | Current source | Support level |
|---|---|---|
| Frontend route loaders | `apps/web/src/studio/api-client.ts` calling `/api/v1/studio/*` | Real fetch path, not production fixture imports. |
| `/api/v1/studio/routes` | D1 route brief summaries + observed reliability rows | D1-backed public route listing; R2 fallback only when `DB` is unset. |
| `/api/v1/studio/search` | D1-backed route cards + R2 findings/brief cards | Mixed real search surface; routes and briefs cover the public route set, findings are detector review-queue candidates. |
| `/api/v1/studio/routes/:slug` | R2 `studio/v1/routes/{slug}/index.json` detail projection | Full-public route details generated from D1/R2 release data, including observed reliability and artifact refs. |
| Other `/api/v1/studio/*` Worker handlers | R2 `studio/v1/*.json` projections via `loadStudioProjection()` | Real R2-backed API; briefs have full public-route coverage with split evidence/history, findings are capped detector candidates. |
| `/api/v1/routes` | D1 route brief summaries + observed reliability rows | D1-backed all-route compatibility endpoint, not consumed by frontend. |
| `/api/v1/routes/:id/profile` | D1 route brief summary, observed reliability, route artifacts | Rich D1-backed route profile, not consumed by frontend. |
| `/api/v1/status` | D1 route batch status + baseline observed reliability + latest non-baseline observed month | Surfaces May 2026 current observed signal when present. |
| `/api/v1/hotspots` | D1 corridor summaries | D1-backed compatibility endpoint. |
| `/api/v1/compare` | D1 route comparison ranks + observed reliability | D1-backed compatibility endpoint. |
| `/api/v1/map/manifest` | R2 `map/{month}/manifest.json` | Real artifact manifest. |
| `/api/v1/artifacts/*` | R2 controlled proxy | Real artifact serving path. |
| `/api/openapi.json` | Generated from `packages/domain` Studio schemas | Real docs/schema output for current contracts. |
| `/system` and dev examples | `apps/web/src/fixtures/demo-snippets.ts` | Dev-only; production path is closed. |
| Worker tests | `apps/web/src/studio/sample-data.ts` seeded into fake R2 | Test fixture only. |

## Mock And Fixture Status

Production runtime:

- No production source file imports `apps/web/src/studio/sample-data.ts`.
- No production route/page imports `apps/web/src/fixtures/demo-snippets.ts`.
- `apps/web/src/dev/examples/*` imports demo snippets, but these are dev examples.
- Worker tests seed fake R2 objects from `studio/sample-data.ts`; this is acceptable test-only
  fixture use.
- `check-web-architecture` and `production-boundaries.test.ts` guard against production imports of
  sample/demo data and against public runtime exposure of private `studio/v1/*` storage keys.

Therefore the old "unfixture frontend route loaders" task is obsolete. The frontend is already
calling real endpoints. The remaining task is to expand the real endpoints.

## Current Gaps

### 1. Studio route coverage is full-public

**Status:** resolved for route cards and route detail projections.

`build:studio-release` now defaults to the full public profile; `--profile demo` is the explicit
curated mode. `/api/v1/studio/routes` and `/api/v1/studio/search` use D1-backed route cards when
`DB` is configured, while per-route detail remains a release-static R2 projection. The current March
2026 release has 350 public Studio routes out of 381 catalog rows; the other 31 catalog rows are not
public-visible route cards.

**Verify fixed:** `bun run audit:studio-coverage -- --year 2026 --month 3` passes with
`studioRouteCoverageShare=1`, `routesListCount=350`, and `routeDetailCount=350`.

### 2. Observed reliability is in Studio route contracts

**Status:** resolved.

`packages/domain/src/studio-schemas.ts` now defines `StudioObservedReliabilitySchema`, and
`StudioRouteSchema` carries `observedReliability` alongside the short string label. The Studio
release builder populates it from `route_observed_reliability_summary` rows with explicit
`third_party_recovered` or `official_self_collected` provenance.

**Verify fixed:** Worker coverage parses the D1-backed Studio route list and R2 route detail
responses, asserting March recovered observed reliability appears on route cards/details.

### 3. May appendix is surfaced as a current signal

**Status:** resolved.

`/api/v1/status` now looks up the latest non-baseline observed reliability month and returns a
structured `currentObservedSignal` block. The May 2026 self-collected appendix is visible as a
current signal while March 2026 remains the baseline observed release.

**Verify fixed:** `curl -s '.../api/v1/status' | jq '.currentObservedSignal'` returns
`{ "month": "2026-05", "runId": "gtfs-rt-v1-20260517T103607Z-24h", "source":
"official_self_collected", "observedRouteCount": 300, ... }`.

### 4. Studio route detail now includes route artifact refs

**Status:** resolved for observed reliability and artifact pointers.

`StudioRouteDetailResponseSchema` now includes `artifactRefs`, and `StudioReleasePayloadSchema`
stores the route artifact refs loaded from D1 `route_artifact` rows. `build:studio-release` filters
those refs to the selected Studio route set and route detail projections expose only the refs for
their route. The compatibility `/api/v1/routes/:id/profile` endpoint can stay temporarily for older
panel consumers; any remaining peak/slow-window fields should be modeled deliberately in Studio
rather than kept as an implicit compatibility dependency.

### 5. Briefs cover public routes, but most are generated

**Status:** resolved for public-route projection coverage and split evidence/history contracts.

**Where:** generated brief body artifacts live at
`data/artifacts/briefs/{routes,corridors}/{id}/{month}/brief.{html,json,md}` and are indexed by
`route_artifact` / `corridor_artifact` D1 rows. The Studio brief projection is still a separate
route-first projection generated by `tools/pipeline/src/jobs/build/studio-release.ts`, but it now
builds one brief card/detail for every public Studio route that has route artifact refs. Dedicated
`evidence.json` and `history.json` projections back `/api/v1/studio/briefs/:id/evidence` and
`/history`.

Impact:

- The public brief gallery represents the public route set, but most briefs are generated system
  briefs rather than reviewed editorial publications.
- `brief.status` now distinguishes reviewed/canonical `"Published"` briefs from generated route
  briefs using `"Generated"`.

**Verify fixed:** `bun run audit:studio-coverage -- --year 2026 --month 3` passes with
`briefsListCount=350`, `briefDetailCount=350`, `briefEvidenceDetailCount=350`,
`briefHistoryDetailCount=350`, and `studioBriefCoverageShare=1`.

### 6. Findings are detector-backed candidates, not approved claims

**Status:** resolved for detector-backed candidate sourcing, approved promotion projection, and
evidence-link integrity; unpromoted detector candidates remain review-gated before publication.

**Where:** `findings:detect` emits local detector candidates, evidence links, and coverage rows.
`build:studio-release` keeps the reviewed B25/BX41 findings, then fills the public finding feed
from `data/artifacts/findings/{month}/promoted-findings.json`, then
`data/artifacts/findings/{month}/review-queue.json`, before falling back to the old generated
route-score candidate path. A promoted finding claims its route slot so the approved reviewed
finding replaces the route's review candidate while keeping candidate, detector, decision, packet,
reviewer, and hash provenance attached. The March 2026 proof without a reviewed promotion file uses
a 200-item review queue to produce 50 public Studio findings: 2 reviewed/manual findings plus 48
detector-derived candidates.

The detector layer now has a per-source evidence eligibility ledger, route-month context features
across normalized context sources, and an evidence-corpus audit. The March proof has 599 detector
candidates, 1,188 evidence links, 2,304 coverage rows, and zero unlinked review-queue candidates.

Impact:

- Findings are useful as a broader triage feed and now carry detector/evidence provenance, but they
  are still not reviewer-approved claims.
- Parking-derived context remains `release_context_only`; the all-source route-month context
  feature makes parking visible as evidence context without silently promoting it to primary
  detector evidence.

**Verify fixed:** `bun --filter @bp/pipeline-v2 cli -- audit evidence-corpus --year 2026 --month 3`
passes with 12 source eligibility rows, 381 route-month signal features, 6 context sources, 599
detector candidates, 1,188 evidence links, 2,304 coverage rows, and 0 unlinked review-queue
candidates.

### 7. Write-side agent API is design-only

The agent-author API is documented, but no durable write-side brief draft/job/idempotency storage is
implemented yet.

Impact:

- Agents can read the current Studio API but cannot author briefs through the planned REST surface.

Target:

- Feature-flag D1 draft/job/idempotency tables.
- Store large generated draft/publish candidate artifacts in R2.
- Keep publish promotion deliberate and audited.

### 8. Brief body artifacts are covered by publish completeness

**Status:** resolved locally.

`publish:r2-artifacts` now builds its candidate set from release prefixes, manifest-declared keys
(`briefs`, `evaluations`, and `map`), and D1 `route_artifact` / `corridor_artifact` keys from the
local serving export. `check-publish-completeness` uses the same manifest/D1 key model and fails if
any referenced key lacks a local `data/artifacts/<key>` body.

**Verify fixed:** `bun run tools/pipeline-v2/src/checks/check-publish-completeness.ts --month 2026-03`
passes with 3 manifests, 1,629 D1 artifact refs, 1,986 unique keys, and 0 missing files.

### 9. Brief feature is templated pipes around real metrics — no authoring infra yet

The brief surface looks like a finished product but is structurally a read-only stub. What
exists, what is templated, and what is missing — listed so the gap is not mistaken for a
labeling problem.

**What exists (real):**

- D1 row per route: `route_brief_summary` carries the metrics (route_score, observed speed,
  lane coverage, hotspot count, etc.).
- R2 artifacts at `briefs/routes/{id}/{month}/brief.{html,json,md}` produced by
  `tools/pipeline/src/jobs/build/brief-artifacts.ts`.
- Studio projections at `studio/v1/briefs/{id}/index.json`,
  `studio/v1/briefs/{id}/evidence.json`, and `studio/v1/briefs/{id}/history.json` produced by
  `tools/pipeline/src/jobs/build/studio-release.ts`.
- Read endpoints: `/api/v1/studio/briefs`, `/api/v1/studio/briefs/:id`, `…/evidence`,
  `…/history`. Frontend pages render them: `apps/web/src/routes/briefs.tsx`,
  `routes/briefs/$briefId.tsx`, `.../evidence.tsx`, `.../history.tsx`,
  `.../review.tsx`, `.../edit.tsx`.

**What is templated (looks real, is synthetic):**

- `brief.summary`, `brief.dek`, `brief.sections[].body`, `brief.claims[].title`,
  `brief.evidence[].detail` — produced by string-interpolating real metrics into hard-coded
  prose templates inside `brief-artifacts.ts` / `studio-release.ts`. There is no model,
  no LLM call, no editorial pass.
- `brief.status`, `brief.version: "v1"`, `brief.generated: <iso>` — produced by the build,
  not by any publication workflow. Most route briefs are marked `"Generated"`; canonical/reviewed
  briefs remain `"Published"`.
- `history.versions[]` — generated from the build timestamp; there is no version-control
  store for brief editorial state.
- `history.comments[]` — placeholder/empty; no comments backend.
- `evidence.claims[].evidenceIds` / `caveatIds` — string keys into per-brief `evidence[]`
  and `caveats[]` arrays inside the same template, not links into a separate evidence
  catalog.

**What does not exist (the actual gap):**

- **Write API — mostly landed (ADR 0014/0015).** The agent-author draft surface
  ([[agent_author_api|Agent-Author API]]) now exists under `…/briefs` and
  `…/briefs/{id}/draft*`: draft-only brief creation, claim CRUD, typed block CRUD,
  ref resolution, `validate`, `review`, `verdict`, `publish`, `retract` — all
  idempotency-keyed where mutating.
- **D1 editorial tables — partly landed (ADR 0014).** `studio_brief_draft*`,
  `studio_brief_review_comment`, and `studio_brief_write_idempotency` now live in
  `packages/db/src/d1/queries/studio-brief-drafts.ts` (not `schema.ts`). ADR 0015
  also added `studio_brief_draft.body_md` and `studio_brief_draft_block` for typed
  primitive blocks. **Still missing:** general anchored comment/reply/suggestion
  tables.
- **Async model runner backend exists, UI still missing.** `POST …/draft/generate` records a queued
  job-shaped response, creates a D1 agent run, and signals the Cloudflare Think
  `BriefAuthorAgent` to call Workers AI when bindings exist. The D1 agent run/proposal endpoints
  under `…/draft/agent-runs*`, `…/draft/proposals*`, and `…/draft/versions*` support apply/reject
  and D1-backed restore only after human approval. Still missing: composer proposal polling,
  preview, and streaming progress UI.
- **No mid-layer data endpoints.** The walkthrough in `agent_author_api.md` step 3-4 calls
  `/studio/routes/:slug/segments?from=…&grain=…` and `/studio/data/violations?…`. Neither
  exists.
- **No evidence catalog.** Step 7 of the walkthrough (`GET /briefs/:id/evidence?search=…`)
  returns a *searchable additional-evidence* catalog. Today our `…/evidence` endpoint
  returns only the per-brief embedded `evidence[]` array.
- **Validate / review / verdict / publish / retract — landed (ADR 0014)** with
  idempotency keys (`POST …/draft/{validate,review,verdict,publish,retract}`). Anchored
  draft-private comments, replies, suggestions, and suggestion acceptance have also
  landed. **Still missing:** reviewer assignment and agent proposal apply/reject/restore
  endpoints.

**Verify gap:**

```bash
# Draft write surface — now EXISTS post ADR 0014 (expect matches):
grep -nE 'suffix === "(claims|validate|review|publish|retract)"|claimMatch' \
  apps/web/src/worker/index.ts
# Editorial-state D1 tables live in the draft query module (not schema.ts):
grep -nE 'studio_brief_draft_claim|studio_brief_review_comment|studio_brief_write_idempotency' \
  packages/db/src/d1/queries/studio-brief-drafts.ts
# Still-absent write surfaces (expect zero):
grep -nE '\bsuggest(From|To)\b|suggest_(from|to)' \
  apps/web/src/worker/index.ts packages/domain/src/studio-schemas.ts
```

**Plan of record (where the work is already designed):**

- [[agent_author_api|Agent-Author API]] — canonical write-side spec; lists all endpoints,
  decisions, and a dogfeed walkthrough.
- [[ai_interaction_model]] — product doctrine for analyst-in-the-loop authoring; constrains
  the agent surface to typed artifacts rather than free chat.
- [[web_app_support_plan]] — composer UI's data-loading shape (currently consumes only the
  read-side; needs extending for write flows once the API ships).

**Fix outline (deferred, large):** implementing this is its own milestone; the gap below is
captured so it is not mistaken for "polish needed on existing feature". Suggested order:

1. Land the async generation runner and polling/status surface.
2. Land mid-layer data endpoints (`/studio/routes/:slug/segments`, `/studio/data/...`).
3. Land evidence catalog (`/studio/briefs/:id/evidence?search=…` returns *findable*
   evidence, not just per-brief embedded).
4. Land anchored comment/reply/resolve/suggest-edit writes using draft-private review threads
   and quote-selector anchors.
5. Harden publish-candidate export and the pipeline promotion command so draft-only briefs,
   `bodyMd`, typed blocks, and stored refs become immutable public projections without copying
   private review threads into public `comments[]`.
6. Cut over the read-side `studio-release.ts` brief synthesis to instead read editorial
   state once human-authored briefs exist; keep the templated path as a fallback for routes
   with no editorial coverage.
7. Composer UI: wire `apps/web/src/routes/briefs/$briefId/edit.tsx` and `review.tsx` to the
   new write endpoints (today they render but cannot mutate).

**Verify fixed:** running the canonical walkthrough from [[agent_author_api]] end-to-end
against the production Worker (a coding agent can compose, validate, review, and publish a
brief) is the acceptance test.

## Missing brief write/authoring endpoints (current — post ADR 0014)

The single actionable list of *what's still missing on the backend* for another agent to
pick up. ADR 0014 (gap #9) landed brief/claim edits, validate, review-request, publish, and
retract. On 2026-06-01 the Worker also landed draft-only brief creation (`POST /studio/briefs`),
reviewer verdict transitions (`POST .../draft/verdict`), draft-private anchored review
threads/replies/suggestions under `.../draft/comments*`, persisted draft refs, send-to-brief
attachment, promotion receipt, and candidate/public projection coverage for `bodyMd`/`blocks`/`refs`.
These are the remaining write-side gaps, in rough dependency order — each with where it surfaced and
the primary file(s) to change.

| # | Missing capability | Surfaced by | Primary files | Spec |
|---|---|---|---|---|
| 7 | Reviewer assignment/notification delivery | Review people UI can show participants, but the backend has no assignment/notify lifecycle beyond comments and verdicts | worker, `studio-brief-drafts.ts`, optional email binding | `docs/architecture/studio-review-collaboration-and-promotion.md` |

Still-open from gap #9 (unchanged by ADR 0014): the async generation runner
(`…/draft/generate` records a job nothing consumes), mid-layer data endpoints
(`/studio/routes/:slug/segments`, `/studio/data/violations`), and a searchable evidence
catalog (`…/evidence?search=` returns *findable* evidence, not just per-brief embedded).

**Verify (still-absent surfaces — expect zero):**

```bash
grep -nE '\bsuggest(From|To)\b|suggest_(from|to)' \
  apps/web/src/worker/index.ts packages/domain/src/studio-schemas.ts
```

## Prerequisite Bug

**Status:** resolved.

`replaceRouteObservedReliabilityRows` now validates that input summary rows match the requested
`month` and `runId`, then deletes `local_route_observed_reliability_summary` rows by both month and
run ID. This closes the March clobber risk recorded in `knowledge/log.md` on 2026-05-18.

## Immediate Work Queue

Each item lists the primary file(s) to change. Ordering minimizes blocking: prerequisite bug
first, smallest user-visible win next, then schema/projection expansion, then publish-completeness.

| # | Status | Change | Primary files |
|---|---|---|---|
| 0 | Done | Fix `replaceRouteObservedReliabilityRows` runId scoping | `packages/db/src/local/repositories/observed-reliability.ts` + unit test |
| 1 | Done | `currentObservedSignal` block on `/api/v1/status` | `packages/domain/src/schemas.ts`, `@bp/db/d1` query, `apps/web/src/worker/index.ts`, worker test |
| 2 | Done | Release-manifest audit (Studio projection vs D1 coverage) | `tools/pipeline/src/jobs/audit/studio-coverage.ts` |
| 3 | Done | `build:studio-release --profile {demo,full}` with full as default | `tools/pipeline/src/jobs/build/studio-release.ts` |
| 4 | Done | `observedReliability` and `artifactRefs` on Studio route detail | `packages/domain/src/studio-schemas.ts`, `packages/domain/src/studio-projections.ts`, `tools/pipeline/src/jobs/build/studio-release.ts` |
| 5 | Done | D1-back `/api/v1/studio/routes` + `/api/v1/studio/search` route coverage | `apps/web/src/worker/index.ts`, `@bp/db/d1` queries |
| 6 | Done | Split `StudioBriefEvidenceResponse` + `StudioBriefHistoryResponse` projections | `packages/domain/src/studio-projections.ts`, `tools/pipeline/src/jobs/build/studio-release.ts`, worker handlers |
| 7 | Done | Manifest/D1-driven publish + completeness check | `tools/pipeline-v2/src/commands/publish/publish-artifact-keys.ts`, `tools/pipeline-v2/src/checks/check-publish-completeness.ts`, `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts` |
| 8 | Done | Worker tests for split brief projections and missing-projection fail-closed behavior | `apps/web/test/worker/index.worker.test.ts`, new fixture cases |

Finding detector source expansion is now partly implemented through detector candidates, source
eligibility, route-month context features, and the evidence-corpus audit. The remaining finding
work is source-specific detector promotion and reviewer approval. The write-side agent API (gap #7)
still needs product/auth decisions first (see [[ai_interaction_model]] and [[agent_author_api]]).

## Verification Targets

Near-term checks:

```bash
bun run check:knowledge
bun run check:web-architecture
bun run test:worker
```

Release-support checks after implementation:

```bash
bun run verify:d1 -- --year 2026 --month 3
bun run build:studio-release -- --month 2026-03
bun run audit:studio-coverage -- --year 2026 --month 3
bun run check:web-release
```

The route-facing cutover is mostly done: `/api/v1/studio/routes` exposes all public routes D1 can
serve, route details carry observed reliability and artifact refs, and `/api/v1/status` surfaces the
current appendix. Studio briefs also cover the public route set with split evidence/history
projection artifacts, Studio findings now derive from detector review-queue candidates, and publish
completeness is manifest/D1-driven. The remaining cutover is source-specific detector promotion,
generated-brief editorial workflow, and eventually the write-side authoring API.
