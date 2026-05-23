---
title: Website Data Support Audit
type: engineering
status: active
last_updated: 2026-05-18
owner: codex
source_count: 0
tags: [website, audit, studio-api, d1, r2, cutover, mocks]
---

# Website Data Support Audit

## Purpose

This page records what the website actually loads, what is still demo-shaped, and which data exists
in production serving storage but is not yet exposed through the route-first Studio API.

The key finding: the frontend is no longer production-mocked through fixture imports. The remaining
problem is that `/api/v1/studio/*` is backed by a small curated R2 projection while D1 contains much
broader serving data.

## Audit Method

Code inspection on 2026-05-18 checked:

- `apps/web/src/studio/api-client.ts`
- `apps/web/src/routes/**`
- `apps/web/src/worker/index.ts`
- `tools/pipeline/src/jobs/build/studio-release.ts`
- `packages/domain/src/studio-schemas.ts`
- `packages/db/src/d1/queries/route-observed-reliability.ts`
- `packages/db/src/local/repositories/observed-reliability.ts`
- `tools/pipeline/src/checks/check-web-architecture.ts`
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
| `/api/v1/studio/*` Worker handlers | R2 `studio/v1/*.json` projections via `loadStudioProjection()` | Real R2-backed API, but curated slice. |
| `/api/v1/routes` | D1 route brief summaries + observed reliability rows | D1-backed all-route compatibility endpoint, not consumed by frontend. |
| `/api/v1/routes/:id/profile` | D1 route brief summary, observed reliability, route artifacts | Rich D1-backed route profile, not consumed by frontend. |
| `/api/v1/status` | D1 route batch status + observed reliability for `BASELINE_MONTH` | Does not yet surface latest non-baseline appendix month. |
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

### 1. Studio route coverage is curated

**Where:** `tools/pipeline/src/jobs/build/studio-release.ts:36-37` (`defaultRouteLimit = 12`,
`canonicalRouteIds = ["M15+", "BX12+", "M101", "B41", "B46+", "Q58", "M14A+", "M14D+"]`) feed
into the route selection at line 550, capped at line 559 by `Math.max(routeLimit,
requiredSummaries.length)`. `studio/v1/routes.json` + per-route `routes/{slug}/index.json` are
written only for that capped subset.

**Verify gap:** `curl -s https://bus-priority-impact-studio.c20carroll.workers.dev/api/v1/studio/routes | jq '.routes | length'` returns 12; D1 has 381 (`SELECT COUNT(*) FROM route_catalog`).

Impact:

- `/api/v1/studio/routes` exposes a curated subset.
- `/api/v1/studio/routes/:slug` returns 404 for ~369 routes that exist in D1.
- The frontend is real, but the product surface is not full-network yet.

**Fix outline:**

1. Rename the existing curated behavior `--profile demo`; add `--profile full` that drops the
   `routeLimit` cap and removes the `canonicalRouteIds` floor.
2. Make `/api/v1/studio/routes` and `/api/v1/studio/search` D1-backed in the Worker
   (`apps/web/src/worker/index.ts`) — see [[serving_storage_split_plan]] §"Target Endpoint
   Backing". Keep per-route detail (`/api/v1/studio/routes/:slug`) R2-backed.
3. Generate full route detail projections for every route with a `route_brief_summary` row.

**Verify fixed:** `bun run build:studio-release -- --month 2026-03 --profile full` writes route
list/detail projections for every public-visible `route_brief_summary` row. For the current March
2026 export that is 350 public routes out of 381 catalog routes; the remaining 31 catalog rows are
not public-visible Studio cards.

### 2. Observed reliability is not in Studio route contracts

**Where:** `packages/domain/src/studio-schemas.ts:65` has `reliability: z.string()` — a label,
not a block. D1 has `route_observed_reliability_summary` rows (381 for March
`bus-observatory-2026-03`, 381 for May `gtfs-rt-v1-20260517T103607Z-24h`) and the compatibility
`/api/v1/routes/:id/profile` (`apps/web/src/worker/index.ts`) already serializes the full record.

**Verify gap:** `curl -s '.../api/v1/studio/routes/m15-sbs' | jq '.route.reliability'` returns a
string; the same route's `/api/v1/routes/m15-sbs/profile` returns a structured object.

Impact:

- The public Studio route pages cannot show March recovered observed reliability or the May official
  current appendix through `/api/v1/studio/*`.
- Agents using the Studio API cannot inspect observed headway/bunching signals without falling back
  to compatibility endpoints.

**Fix outline:**

1. Add `StudioObservedReliabilitySchema` to `packages/domain/src/studio-schemas.ts` with
   `runId`, `source` (`"third_party_recovered" | "official_self_collected"`), `releaseLayer`
   (`"observed_release" | "current_signal"`), `month`, `sampleCount`, `observedHeadwayP50/P90`,
   `bunchingShare`, `longGapShare`, `excessWaitSeconds`, `reliabilityStatus`, `caveats`.
2. Add `observedReliability: StudioObservedReliabilitySchema.nullable()` to `StudioRouteSchema`
   (line 45-) and `StudioRouteDetailResponseSchema`. Keep the existing string `reliability` as a
   short label or remove after frontend migrates.
3. Populate from `route_observed_reliability_summary` in `tools/pipeline/src/jobs/build/studio-release.ts`
   when building per-route projections; provenance from `realtimeSourceForRunId(runId)`
   (already exists in worker code).

**Verify fixed:** Worker test `apps/web/test/worker/index.worker.test.ts` parses a route response
and asserts `route.observedReliability.runId === "gtfs-rt-v1-20260517T103607Z-24h"` for a route
that has the May appendix.

### 3. May appendix is not surfaced as a current signal

**Where:** `apps/web/src/worker/index.ts:585-633` (`buildReleaseStatusResponse`).
Line 598 calls `listRouteObservedReliabilitySummaries(db, month)` with the baseline month only.
Line 633 hardcodes `currentSignalMonth: null`.

**Verify gap:** `curl -s '.../api/v1/status' | jq '.currentSignalMonth'` returns `null` even
though D1 has 381 May 2026 rows.

Impact:

- The May 2026 self-collected appendix exists in D1 but is not visible through a public status
  response.

**Fix outline:**

1. Add a `listLatestNonBaselineObservedReliability(db, baselineMonth)` query to `@bp/db/d1`
   returning the most recent `(month, run_id)` from `route_observed_reliability_summary` where
   `month != baselineMonth`, plus per-route status counts.
2. Extend `ReleaseStatusResponseSchema` (`packages/domain/src/schemas.ts:292-330`) with a
   `currentObservedSignal: { month, runId, source, releaseLayer, routeCount, observedRouteCount,
   insufficientRouteCount, sampleCount, caveats }.nullable()` field.
3. Populate in `buildReleaseStatusResponse` (replace `currentSignalMonth: null` with the
   aggregated row + set `currentSignalMonth` to the month). Reuse the existing
   `realtimeSourceForRunId(runId)` and caveat construction.
4. Keep `sameMonthPromotionReady` derivation unchanged — it stays false until matching public
   speed data lands.

**Verify fixed:** `curl -s '.../api/v1/status' | jq '.currentObservedSignal'` returns
`{ "month": "2026-05", "runId": "gtfs-rt-v1-20260517T103607Z-24h", "source":
"official_self_collected", "observedRouteCount": 300, ... }`.

### 4. D1-backed route profile is richer than Studio route detail

**Where:** Compatibility handler in `apps/web/src/worker/index.ts` for `/api/v1/routes/:id/profile`
returns the full D1 `route_brief_summary` + `route_observed_reliability_summary` +
`route_artifact` join. Studio detail (`/api/v1/studio/routes/:slug`) is built from
`tools/pipeline/src/jobs/build/studio-release.ts` and currently omits observed reliability and
the artifact-ref array.

Impact:

- Useful serving data exists behind compatibility endpoints but is not part of the route-first
  product contract.

**Fix outline:** subsumed by gap #2 (`observedReliability` block) + a new `artifactRefs` array
on `StudioRouteDetailResponseSchema` populated from `route_artifact` rows. Once Studio detail
has parity, retire `/api/v1/routes/:id/profile` per
[[web_api_endpoint_architecture]] §"Current State" cutover posture.

### 5. Briefs are dual-stored and curated

**Where:** generated brief artifacts live at `data/artifacts/briefs/{routes,corridors}/{id}/{month}/brief.{html,json,md}`
and are indexed by `route_artifact` / `corridor_artifact` D1 rows. The Studio brief projection is
a separate curated set generated by `tools/pipeline/src/jobs/build/studio-release.ts` (the
`StudioBrief` builder section). `/api/v1/studio/briefs/:id/evidence` and `/history` currently
reuse `StudioBriefResponseSchema` (`packages/domain/src/studio-schemas.ts`), so evidence and
history are not separate contracts.

Impact:

- The public brief gallery does not represent the full published brief artifact set.
- Brief evidence/history endpoints share `StudioBriefResponse`, so split-fetch and per-tab caching
  are blocked.

**Fix outline:** see work queue items #6 (split contracts) and #7 (manifest-driven publish, which
also unblocks gap #8). Order: split contracts first so the publish layer can validate against
them.

### 6. Findings are generated from a small release subset

**Where:** finding generation in `tools/pipeline/src/jobs/build/studio-release.ts` builds
findings from the selected `canonicalRouteIds` and their top route-segment artifact slices.
There is no detector-coverage layer yet — no "considered N routes, hit M, skipped K" trail.

Impact:

- Findings are useful as a product skeleton, but not yet a complete finding feed.

**Fix outline:** deferred. Needs a separate finding-detector pipeline pass (see
[[finding_coverage_and_corpus_expansion]]) plus a `finding_detector_run` table in D1 to record
considered/hit/skipped counts. Not in the immediate queue.

### 7. Write-side agent API is design-only

The agent-author API is documented, but no durable write-side brief draft/job/idempotency storage is
implemented yet.

Impact:

- Agents can read the current Studio API but cannot author briefs through the planned REST surface.

Target:

- Feature-flag D1 draft/job/idempotency tables.
- Store large generated draft/publish candidate artifacts in R2.
- Keep publish promotion deliberate and audited.

### 8. Brief body artifacts may be under-published

**Where:** `scripts/publish-serving-release.sh:152-162` globs only
`data/artifacts/briefs/$month/*`, `evaluations/$month/*`, `map/*`, `studio/*`,
`source-availability/*`, `pipeline-v1/*`. Local generated brief bodies live at
`data/artifacts/briefs/routes/{routeId}/{month}/brief.{html,json,md}` and
`data/artifacts/briefs/corridors/{corridorId}/{month}/brief.{html,json,md}` — those paths don't
start with `briefs/$month/`. D1 `route_artifact` / `corridor_artifact` rows store keys like
`briefs/routes/m15-sbs/2026-03/brief.json` which the glob skips.

**Verify gap (production):**

```bash
# Should return many files; if empty, bodies were never uploaded:
bunx wrangler r2 object list bus-priority-artifacts --prefix briefs/routes/ | head -20
# Pick any D1 artifact ref and confirm it exists in R2:
bunx wrangler d1 execute bus-priority-serving --remote \
  --command "SELECT artifact_path FROM route_artifact WHERE month='2026-03' LIMIT 5;" --json \
  | jq -r '.[0].results[].artifact_path'
# Then: bunx wrangler r2 object get bus-priority-artifacts/<that-key>
```

**Verify gap (local):**

```bash
find data/artifacts/briefs/routes -name 'brief.json' | head -5
# These paths don't match the glob `data/artifacts/briefs/$month/*`.
```

Impact:

- D1 and the brief manifest can point at R2 keys that were not uploaded by the release script.
- The issue is not over-storing in R2; it is potentially under-publishing artifact bodies while
  still publishing their indexes/refs.

**Fix outline:**

1. Replace the `find` glob in `scripts/publish-serving-release.sh:152-162` with a manifest-driven
   list: read `data/artifacts/briefs/{month}/manifest.json` + `data/artifacts/map/{month}/manifest.json`
   + the new `route_artifact` / `corridor_artifact` keys from the D1 export, dedup, then upload.
2. Add a pre-publish check (`tools/pipeline/src/checks/check-publish-completeness.ts`) that fails if
   any D1 `artifact_path` or brief-manifest key has no local file at the equivalent
   `data/artifacts/<key>` path.

**Verify fixed:** Check exits 0, then a sample of D1-referenced brief keys is reachable via
`/api/v1/artifacts/<key>` on production.

### 9. Brief feature is templated pipes around real metrics — no authoring infra yet

The brief surface looks like a finished product but is structurally a read-only stub. What
exists, what is templated, and what is missing — listed so the gap is not mistaken for a
labeling problem.

**What exists (real):**

- D1 row per route: `route_brief_summary` carries the metrics (route_score, observed speed,
  lane coverage, hotspot count, etc.).
- R2 artifacts at `briefs/routes/{id}/{month}/brief.{html,json,md}` produced by
  `tools/pipeline/src/jobs/build/brief-artifacts.ts`.
- Studio projection at `studio/v1/briefs/{id}/index.json` produced by
  `tools/pipeline/src/jobs/build/studio-release.ts` (the `StudioBrief` builder).
- Read endpoints: `/api/v1/studio/briefs`, `/api/v1/studio/briefs/:id`, `…/evidence`,
  `…/history`. Frontend pages render them: `apps/web/src/routes/briefs.tsx`,
  `routes/briefs/$briefId.tsx`, `.../evidence.tsx`, `.../history.tsx`,
  `.../review.tsx`, `.../edit.tsx`.

**What is templated (looks real, is synthetic):**

- `brief.summary`, `brief.dek`, `brief.sections[].body`, `brief.claims[].title`,
  `brief.evidence[].detail` — produced by string-interpolating real metrics into hard-coded
  prose templates inside `brief-artifacts.ts` / `studio-release.ts`. There is no model,
  no LLM call, no editorial pass.
- `brief.status: "Published"`, `brief.version: "v1"`, `brief.generated: <iso>` — produced
  by the build, not by any publication workflow.
- `history.versions[]` — generated from the build timestamp; there is no version-control
  store for brief editorial state.
- `history.comments[]` — placeholder/empty; no comments backend.
- `evidence.claims[].evidenceIds` / `caveatIds` — string keys into per-brief `evidence[]`
  and `caveats[]` arrays inside the same template, not links into a separate evidence
  catalog.

**What does not exist (the actual gap):**

- **No write API.** The full spec for the agent-author write surface lives in
  [[agent_author_api|Agent-Author API]] (status: draft) — `POST /studio/briefs`,
  `PATCH /briefs/:id/claims/:n`, `POST /briefs/:id/validate`, `POST .../review`,
  `POST .../publish`, `POST .../retract`. None of these endpoints exist in
  `apps/web/src/worker/index.ts` today.
- **No D1 tables for editorial state.** No `brief_draft`, no `brief_job`, no
  `brief_version`, no `brief_claim`, no `brief_evidence_link`, no `brief_comment`, no
  `brief_review`, no `brief_idempotency`. The schema in `packages/db/src/d1/schema.ts`
  has only the read-side summary + artifact pointer tables.
- **No async job runner.** `POST /briefs` is supposed to return `202 + jobId`; there is
  no job queue, no worker-side polling endpoint, no agent-paced LLM draft step.
- **No mid-layer data endpoints.** The walkthrough in `agent_author_api.md` step 3-4 calls
  `/studio/routes/:slug/segments?from=…&grain=…` and `/studio/data/violations?…`. Neither
  exists.
- **No evidence catalog.** Step 7 of the walkthrough (`GET /briefs/:id/evidence?search=…`)
  returns a *searchable additional-evidence* catalog. Today our `…/evidence` endpoint
  returns only the per-brief embedded `evidence[]` array.
- **No validate/score gate.** Step 9 (`POST /briefs/:id/validate` → blocking issues +
  weak claims + missing evidence) does not exist.
- **No review/publish flow.** No reviewer assignment, no idempotency-keyed publish, no
  retract.

**Verify gap:**

```bash
# Look for any write-side brief routes in the worker — expect zero results:
grep -nE 'POST.*/briefs|PATCH.*/briefs|/briefs/.*/(validate|review|publish|retract)' \
  apps/web/src/worker/index.ts
# Look for editorial-state D1 tables — expect zero matches:
grep -nE 'brief_(draft|job|version|claim|evidence_link|comment|review|idempotency)' \
  packages/db/src/d1/schema.ts
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

1. Land editorial-state D1 schema (`brief_draft`, `brief_job`, `brief_version`,
   `brief_claim`, `brief_evidence_link`, `brief_comment`, `brief_review`,
   `brief_idempotency`).
2. Land the async job runner and `POST /studio/briefs` (returns 202 + jobId).
3. Land mid-layer data endpoints (`/studio/routes/:slug/segments`, `/studio/data/...`).
4. Land evidence catalog (`/studio/briefs/:id/evidence?search=…` returns *findable*
   evidence, not just per-brief embedded).
5. Land validate / review / publish / retract endpoints with idempotency keys.
6. Cut over the read-side `studio-release.ts` brief synthesis to instead read editorial
   state once human-authored briefs exist; keep the templated path as a fallback for routes
   with no editorial coverage.
7. Composer UI: wire `apps/web/src/routes/briefs/$briefId/edit.tsx` and `review.tsx` to the
   new write endpoints (today they render but cannot mutate).

**Verify fixed:** running the canonical walkthrough from [[agent_author_api]] end-to-end
against the production Worker (a coding agent can compose, validate, review, and publish a
brief) is the acceptance test.

## Prerequisite Bug

Before any further appendix-shaped operation:

**`replaceRouteObservedReliabilityRows` ignores its runId parameter.**
`packages/db/src/local/repositories/observed-reliability.ts:60-88`. The `_runId` parameter at
line 63 is prefixed with `_` and never used; the DELETE at line 69-71 only filters by month, so
calling the function with the wrong month against an existing month wipes that month's rows.
This is what caused the March 2026 clobber recorded in `knowledge/log.md` (2026-05-18 release
entry).

Fix: either honor it (`WHERE month = ? AND run_id = ?` on both deletes) or remove the parameter
from the signature and update callers. A small test that pre-seeds two run_ids for the same
month and asserts only one is deleted is enough to lock the behavior.

## Immediate Work Queue

Each item lists the primary file(s) to change. Ordering minimizes blocking: prerequisite bug
first, smallest user-visible win next, then schema/projection expansion, then publish-completeness.

| # | Change | Primary files | Approx LOC |
|---|---|---|---|
| 0 | Fix `replaceRouteObservedReliabilityRows` runId | `packages/db/src/local/repositories/observed-reliability.ts:60-88` + unit test | ~20 |
| 1 | `currentObservedSignal` block on `/api/v1/status` | `packages/domain/src/schemas.ts:292-330`, new `@bp/db/d1` query, `apps/web/src/worker/index.ts:585-650`, worker test | ~80 |
| 2 | Release-manifest audit (Studio projection vs D1 coverage) | new `tools/pipeline/src/jobs/audit/studio-coverage.ts`; emit `data/artifacts/audits/studio-coverage-{month}.json` | ~120 |
| 3 | `build:studio-release --profile {demo,full}` | `tools/pipeline/src/jobs/build/studio-release.ts:36-37,107,550-559` | ~30 |
| 4 | `observedReliability` on `StudioRouteSchema` + populate in builder | `packages/domain/src/studio-schemas.ts:45-90`, `tools/pipeline/src/jobs/build/studio-release.ts` (populate from `route_observed_reliability_summary`) | ~120 |
| 5 | D1-back `/api/v1/studio/routes` + `/api/v1/studio/search` | new D1 queries in `@bp/db/d1`, `apps/web/src/worker/index.ts` Studio handlers | ~200 |
| 6 | Split `StudioBriefEvidenceResponse` + `StudioBriefHistoryResponse` | `packages/domain/src/studio-schemas.ts`, `tools/pipeline/src/jobs/build/studio-release.ts`, worker handlers | ~250 |
| 7 | Manifest-driven publish + completeness check | `scripts/publish-serving-release.sh:152-162`, new `tools/pipeline/src/checks/check-publish-completeness.ts` | ~150 |
| 8 | Worker tests: full-route listing, current appendix status, missing-projection fail-closed, no-fixture-fallback | `apps/web/test/worker/index.worker.test.ts`, new fixture cases | ~150 |

Findings expansion (gap #6) and write-side agent API (gap #7) are deliberately not in this
queue; they need product/auth decisions first (see [[ai_interaction_model]] and
[[agent_author_api]]).

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
bun run build:studio-release -- --month 2026-03 --profile full
bun run check:web-release
```

The full cutover is not done until `/api/v1/studio/*` exposes all public routes that D1 can serve,
surfaces observed reliability/current appendix labels, and uses dedicated brief evidence/history
contracts without relying on curated demo projections.
