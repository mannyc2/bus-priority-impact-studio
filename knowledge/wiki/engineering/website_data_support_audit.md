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

`tools/pipeline/src/jobs/build/studio-release.ts` has `defaultRouteLimit = 12` and hard-coded
canonical route IDs. It selects a small subset from D1 route brief summaries, then writes
`studio/v1/routes.json` plus per-route projections only for that subset.

Impact:

- `/api/v1/studio/routes` exposes a curated subset.
- `/api/v1/studio/routes/:slug` is unavailable for most routes present in D1.
- The frontend is real, but the product surface is not full-network yet.

Target:

- Use D1 for all-route listing/search.
- Generate full route detail projections for every public route with available release artifacts,
  or explicitly label demo builds as demo builds.

### 2. Observed reliability is not in Studio route contracts

D1 has `route_observed_reliability_summary` rows and compatibility route/profile endpoints include
observed reliability. `StudioRouteSchema` currently has a string `reliability` label, but no
structured observed-reliability block for run id, source, sample count, bunching, long-gap share, or
excess wait.

Impact:

- The public Studio route pages cannot show March recovered observed reliability or the May official
  current appendix through `/api/v1/studio/*`.
- Agents using the Studio API cannot inspect observed headway/bunching signals without falling back
  to non-Studio compatibility endpoints.

Target:

- Add a structured `observedReliability` or `currentObservedSignal` block to Studio route/detail
  contracts.
- Keep provenance explicit: March is `third_party_recovered`; May is `official_self_collected`
  current appendix until matching public speed data exists.

### 3. May appendix is not surfaced as a current signal

`/api/v1/status` reads observed reliability for the requested baseline month only. It sets
`currentSignalMonth: null` and does not aggregate latest non-baseline rows.

Impact:

- The May 2026 self-collected appendix exists in D1 but is not visible through a public status
  response.

Target:

- Add `currentObservedSignal` to status: latest non-baseline reliability month, run id, route count,
  observed route count, insufficient route count, sample count, source, and caveats.
- Preserve `sameMonthPromotionReady=false` until May or a later month has matching public speed
  coverage.

### 4. D1-backed route profile is richer than Studio route detail

`/api/v1/routes/:id/profile` returns observed reliability and route artifact refs from D1, but the
frontend calls `/api/v1/studio/routes/:slug`.

Impact:

- Useful serving data exists behind compatibility endpoints but is not part of the route-first
  product contract.

Target:

- Port the useful profile fields into Studio route contracts and retire the compatibility endpoint
  as a frontend source.

### 5. Briefs are dual-stored and curated

Generated route/corridor brief artifacts live in R2 and are indexed by D1 route/corridor artifact
rows. Studio `/api/v1/studio/briefs` currently serves a separate curated R2 projection with
hand-picked briefs generated by `build:studio-release`.

Impact:

- The public brief gallery does not represent the full published brief artifact set.
- Brief evidence/history endpoints currently reuse `StudioBriefResponse`, so they do not express
  distinct evidence/history contracts.

Target:

- D1 stores published brief metadata and artifact refs.
- R2 stores brief bodies, exports, evidence bundles, and history/diff snapshots.
- Split `StudioBriefEvidenceResponse` and `StudioBriefHistoryResponse`.

### 6. Findings are generated from a small release subset

`build:studio-release` currently creates findings from the selected routes and top segment artifact
content. This is deterministic and source-shaped, but it is not a full detector coverage layer.

Impact:

- Findings are useful as a product skeleton, but not yet a complete finding feed.

Target:

- Promote detector-backed findings from the pipeline with considered/hit/skipped counts.
- Store finding list/search metadata in D1 and detail reasoning/evidence documents in R2.

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

The local generated brief manifest for March 2026 references nested artifact keys such as
`briefs/routes/b1/2026-03/brief.html`, `briefs/routes/b1/2026-03/brief.json`, and
`briefs/routes/b1/2026-03/brief.md`. Local generated data contains many nested route/corridor brief
body files under `data/artifacts/briefs/routes/**/2026-03/` and
`data/artifacts/briefs/corridors/**/2026-03/`.

The current publish script uploads `data/artifacts/briefs/$month/*`, which catches
`briefs/2026-03/manifest.json` but not necessarily the nested `briefs/routes/...` and
`briefs/corridors/...` body artifacts referenced by D1 `route_artifact` / `corridor_artifact` rows
and by the brief manifest.

Impact:

- D1 and the brief manifest can point at R2 keys that were not uploaded by the release script.
- The issue is not over-storing in R2; it is potentially under-publishing artifact bodies while
  still publishing their indexes/refs.

Target:

- Change publish selection from broad directory globs to a manifest-driven upload list, or include
  the nested route/corridor brief artifact paths explicitly.
- Add a release check that validates every D1 artifact ref and every brief/evaluation/map manifest
  key exists in the R2 upload set before `--execute`.

## Immediate Work Queue

1. Fix the observed-reliability replacement bug before the next appendix operation.
2. Add `currentObservedSignal` to `/api/v1/status`.
3. Add a release manifest/audit output for Studio projection coverage versus D1 coverage.
4. Change `build:studio-release` to make curated output explicit and add a full-network output mode.
5. Add structured observed reliability to Studio route contracts and projections.
6. Back `/api/v1/studio/routes` and `/api/v1/studio/search` with D1 indexes for all-route coverage.
7. Split brief evidence/history contracts before expanding brief pages.
8. Fix serving publish so nested route/corridor brief bodies referenced by D1 and the brief manifest
   are uploaded, then add an artifact-ref-to-R2-upload validation gate.
9. Add one Worker test each for: full-route Studio listing, current appendix status, missing R2
   projection behavior, and no production fixture fallback.

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
