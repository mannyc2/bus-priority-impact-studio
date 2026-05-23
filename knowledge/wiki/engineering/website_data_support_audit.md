---
title: Website Data Support Audit
type: engineering
status: active
last_updated: 2026-05-23
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
generated for the full public route set. The remaining product gap is narrower: briefs/findings are
still curated/generated slices, brief evidence/history are not split contracts yet, and the
write-side authoring API is still design-only.

## Audit Method

Code inspection on 2026-05-18 and 2026-05-23 checked:

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
| `/api/v1/studio/routes` | D1 route brief summaries + observed reliability rows | D1-backed public route listing; R2 fallback only when `DB` is unset. |
| `/api/v1/studio/search` | D1-backed route cards + R2 findings/brief cards | Mixed real search surface; route coverage is full-public, findings/briefs remain curated. |
| `/api/v1/studio/routes/:slug` | R2 `studio/v1/routes/{slug}/index.json` detail projection | Full-public route details generated from D1/R2 release data, including observed reliability and artifact refs. |
| Other `/api/v1/studio/*` Worker handlers | R2 `studio/v1/*.json` projections via `loadStudioProjection()` | Real R2-backed API, but briefs/findings are curated slices. |
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
| 6 | Next | Split `StudioBriefEvidenceResponse` + `StudioBriefHistoryResponse` | `packages/domain/src/studio-schemas.ts`, `tools/pipeline/src/jobs/build/studio-release.ts`, worker handlers |
| 7 | Next | Manifest-driven publish + completeness check | `scripts/publish-serving-release.sh`, new publish-completeness check |
| 8 | Next | Worker tests for missing-projection fail-closed and no-fixture-fallback edge cases | `apps/web/test/worker/index.worker.test.ts`, new fixture cases |

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
bun run build:studio-release -- --month 2026-03
bun run audit:studio-coverage -- --year 2026 --month 3
bun run check:web-release
```

The route-facing cutover is mostly done: `/api/v1/studio/routes` exposes all public routes D1 can
serve, route details carry observed reliability and artifact refs, and `/api/v1/status` surfaces the
current appendix. The remaining cutover is brief/finding depth: dedicated brief evidence/history
contracts, manifest-driven publish completeness, and eventually the write-side authoring API.
