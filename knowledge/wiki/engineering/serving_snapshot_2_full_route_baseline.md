---
title: Serving Snapshot 2.0 Full-Route Baseline
type: engineering
status: planning
last_updated: 2026-06-05
owner: codex
source_count: 0
tags: [serving, snapshot-2, routes, d1, r2, studio-api, coverage]
---

# Serving Snapshot 2.0 Full-Route Baseline

> Historical document (work completed/superseded); month-anchored language reflects the doctrine of its time — see ADR-0022.

## Purpose

Serving Snapshot 2.0 starts with the most basic product promise:

> Every current MTA bus route we know about should be addressable in the public Studio.

The current website should not be a curated demo slice. It can still have uneven richness by route,
but route availability must be broad and honest:

- a current catalog route should have a stable URL;
- the route index and search should cover the full route universe;
- missing child surfaces should be labeled in API support metadata and code comments, with public
  UI changes deferred until the release data is complete enough to design around;
- no route should disappear only because a map, brief, finding, speed month, or timeline is absent.

This page is the minimum product/data contract before deeper 2.0 route pages, timelines, evidence
catalogs, and finding feeds. It is not meant to shrink 2.0 down to a route directory. The
all-route shell is the first public addressability layer; the multi-year corpus, detector audits,
score vectors, and Tier 2 evidence are the reason those route pages can become useful.

## Current Local Facts

As of the June 5, 2026 local pipeline state:

| Surface | Count | Meaning |
|---|---:|---|
| `local_route_catalog` | 381 routes | Full current catalog universe. |
| `local_route_readiness` for `2026-03` | 381 routes | Every catalog route has release-readiness state. |
| `local_route_brief_summary` for `2026-03` | 381 routes | Every catalog route has a compact summary row. |
| Public-visible `local_route_brief_summary` for `2026-03` | 346 routes | Rich public route artifacts currently exist for a subset. |
| `local_route_artifact` for `2026-03` | 346 routes | Existing rich R2 route artifact coverage. |
| Studio v1 release projection | 12 routes | Current public projection is still a demo-like slice. |
| May data-product direct `available_not_fetched` | 0 products | Remaining direct source gaps are no longer “go fetch it.” |
| May upstream-blocked source products | 3 products | Segment speeds, Bus Wait Assessment, and Customer Journey are blocked by missing/zero-row May source release. |

Interpretation:

- The 2.0 route universe should be 381 current catalog routes.
- The first rich baseline month should stay `2026-03`, because that is the latest complete speed
  baseline currently available.
- April/May data can appear as source-specific appendices or coverage notes, not as a stronger
  complete public performance month.
- Existing rich route artifacts cover 346 routes; the remaining catalog routes still need route
  API shells with honest support metadata. The prototype UI should not be reshaped around that
  temporary sparsity.
- The multi-year backfill is still in scope for serving. It should feed historical trend charts,
  detector calibration, detector coverage/no-hit ledgers, before/after panels, route timelines,
  and evidence-backed finding proposals. It should not be reduced to private pipeline bookkeeping.

## Product Baseline

For 2.0, “support all routes” means six things.

1. **All current catalog routes are addressable.**
   Every `local_route_catalog.route_id` gets a stable slug and public route URL.

2. **Route index and search use the full route universe.**
   They are no longer derived from `data/artifacts/studio/v1/routes.json` alone, because that
   projection currently exposes only 12 routes.

3. **Route detail can be partial.**
   A route response can exist with identity, coverage, source status, and machine-readable surface
   flags even when map, segment ladder, findings, brief, or timeline are missing.

4. **Missing data is section-level state.**
   Missing route artifacts, upstream-blocked speed months, absent observed reliability, and no
   reviewed findings should be represented as explicit status/caveat metadata, not silence or
   route-level 404s. Whether that metadata becomes visible copy is a design/release decision.

5. **Richer artifacts do not define the route universe.**
   Route artifacts, briefs, findings, bus lanes, and timelines enrich route pages. They do not
   decide whether a route exists in the Studio.

6. **Historical and detector data are surfaced through reviewed projections.**
   The site should not dump raw SQLite/R2 history tables into public responses, but it should expose
   compact multi-year route/corridor summaries, detector eligibility states, detector hits/no-hits,
   caveats, score vectors, and promoted findings where the release gates allow it.

## Historical And Detector Serving Contract

The historical scrape exists for three public-facing reasons:

1. **Context for each route.**
   Route pages should show how current conditions compare with the route's own multi-year history:
   speed, reliability, ridership/exposure where available, intervention windows, source coverage,
   and known caveats.

2. **Detector confidence and silence.**
   Detectors need history to distinguish a current hit from normal variation, and they need
   coverage rows to prove when a route was evaluated but produced a clean no-hit, was skipped, or
   was blocked by missing data.

3. **Findings, timelines, and briefs.**
   Promoted findings and route/corridor briefs should be built from detector packets plus Tier 2
   evidence. The multi-year corpus supplies the time axis; Tier 2 supplies agency/source context;
   review gates decide what can be public.

Snapshot 2.0 should therefore include these serving surfaces:

| Surface | Public role | Source of truth | Serving posture |
|---|---|---|---|
| `route_history_summary` | Multi-year route trend strip and route-page context. | Speed, reliability, ridership/exposure, source coverage, route version markers. | D1 compact monthly rows plus R2 chart payloads when large. |
| `detector_coverage_ledger` | Shows what each detector evaluated, skipped, or could not evaluate. | `local_finding_coverage_audit`, detector corpus grain audit, data-product completeness. | D1 rows keyed by release, detector, scope, and month. |
| `detector_score_vectors` | Review/debug basis for detector thresholds and route/fleet rankings. | `build detector-score-vectors` and specialized score-vector builders. | R2 artifact with D1 index; public UI should summarize, not expose every internal feature. |
| `finding_candidates_reviewed` | Public finding/feed cards after promotion. | Detector outputs plus review state and evidence roles. | D1 index rows with R2 packet refs. |
| `route_timeline` | Route/corridor event history: interventions, service changes, studies, agency claims. | Tier 2 accepted/promoted event surfaces and deterministic operational-date gates. | R2 route/corridor timeline bundles with D1 counts/status. |
| `evidence_catalog` | Source-backed citations, caveats, and counter-evidence for findings/briefs. | Tier 2 field-supported surfaces, source refs, detector evidence roles. | D1 searchable index plus R2 evidence bundles. |
| `source_coverage` | Explains upstream-blocked, available, stale, missing, or derived states. | `data-product-completeness`, source reconciliation, readiness audits. | D1 release/source/month rows. |

Implementation note, 2026-06-05: the first compact route-history slice now exists at
`GET /api/v1/studio/routes/:routeId/history`. It is D1-backed from `route_month_trend` and returns
route-month speed/ridership points plus coverage counts. This is the route-level historical fact
surface; it is **not** the segment-level speed carpet, which still needs the stable segment spine
described in the visualization plan.

Public route pages should use these projections in layers:

- route identity and support flags are always available for catalog routes;
- historical summaries are available when the relevant source months exist and pass coverage gates;
- detector coverage can be shown even when there are no public findings, because "we evaluated this
  and did not find a publishable issue" is different from silence;
- detector candidates remain review/private until promotion gates pass;
- Tier 2 evidence remains research-only until accepted, audited, normalized enough for lookup, and
  connected to a detector/finding/timeline/brief use.

This makes the 2.0 site more than briefs. Briefs become one downstream presentation over the same
data products. Other first-class outputs are route history, detector review packets, public
findings, route/corridor timelines, source-gap explanations, and evidence/counter-evidence panels.

## Route Support Levels

Snapshot 2.0 should classify each route into a support level.

| Level | Label | Requirement | User experience |
|---|---|---|---|
| `index_only` | Route indexed | Route exists in `local_route_catalog`. | Route is addressable; UI may keep existing prototype panels mounted until release design catches up. |
| `summary_ready` | Summary ready | Route has `local_route_readiness` and `local_route_brief_summary` for baseline month. | Route overview can show identity, score/status, speed/ridership summary, and caveats. |
| `artifact_ready` | Artifact ready | Route has rich `local_route_artifact` and R2 route detail/ladder refs. | Route page can show map/ladder/detail sections. |
| `evidence_ready` | Evidence ready | Route has at least one reviewed/promoted finding, brief, Tier 2 timeline, or evidence bundle. | Route page can show source-backed findings/timeline/evidence cards. |

These levels are cumulative where possible, but they are not pass/fail for the whole route. A route
at `index_only` is still supported; it is simply sparse.

## Minimum Route Index Row

D1 should hold the compact, queryable all-route index.

Suggested row shape:

```ts
type StudioRouteIndex2Row = {
  releaseId: string;
  baselineMonth: string;
  routeId: string;
  slug: string;
  label: string;
  longName: string | null;
  borough: "Bronx" | "Brooklyn" | "Manhattan" | "Queens" | "Staten Island";
  routeFamily: "local" | "limited" | "select_bus_service" | "express" | "shuttle" | "unknown";
  publicUrl: string;
  supportLevel: "index_only" | "summary_ready" | "artifact_ready" | "evidence_ready";
  surfaceFlagsJson: string;
  caveatCount: number;
  primaryStatus: "available" | "partial" | "upstream_blocked" | "source_absent";
  updatedAt: string;
};
```

`surfaceFlagsJson` should be small and stable enough to query later if needed, but the first pass
can keep it as JSON while the shape settles.

Suggested flags:

```ts
type StudioRouteSurfaceFlags = {
  routePage: "available" | "partial";
  summary: "available" | "missing";
  map: "available" | "missing";
  ladder: "available" | "missing";
  routeDetailArtifact: "available" | "missing";
  speedHistory: "available" | "upstream_blocked" | "missing";
  ridershipHistory: "available" | "missing";
  multiYearHistory: "available" | "partial" | "missing";
  scheduleBaseline: "available" | "missing";
  observedReliability: "available" | "missing";
  detectorCoverage: "available" | "missing";
  detectorFindings: "available" | "none" | "review_only" | "missing";
  detectorScoreVectors: "available" | "review_only" | "missing";
  busLaneLinks: "available" | "none" | "unlinked" | "missing";
  interventions: "available" | "none" | "missing";
  findings: "available" | "none" | "missing";
  briefs: "available" | "none" | "missing";
  timeline: "available" | "none" | "missing";
  evidenceCards: "available" | "none" | "missing";
};
```

## Minimum Snapshot 2.0 Manifest

`GET /api/v1/studio/snapshot` already exists. Snapshot 2.0 should make it the shared public truth
source for all-route coverage.

Minimum shape:

```ts
type StudioSnapshot2 = {
  schemaVersion: 2;
  releaseId: string;
  generatedAt: string;
  baselineMonth: "2026-03";
  currentSignalMonth: string | null;
  routeUniverse: {
    source: "local_route_catalog";
    routeCount: number;
    indexedRouteCount: number;
    summaryReadyRouteCount: number;
    artifactReadyRouteCount: number;
    evidenceReadyRouteCount: number;
  };
  sourceMonths: {
    speed: SourceMonthState;
    ridership: SourceMonthState;
    observedReliability: SourceMonthState;
    busWaitAssessment: SourceMonthState;
    customerJourneyMetrics: SourceMonthState;
  };
  counts: {
    routes: number;
    routeDetails: number;
    routeLadders: number;
    mapArtifacts: number;
    busLaneFeatures: number;
    routeHistoryRows: number;
    detectorCoverageRows: number;
    detectorScoreVectorArtifacts: number;
    findings: number;
    briefs: number;
    routeTimelines: number;
    evidenceCards: number;
  };
  caveats: SnapshotCaveat[];
  projections: SnapshotProjectionRef[];
};
```

Source month states should distinguish these cases:

```ts
type SourceMonthState =
  | { status: "available"; month: string; rowCount: number | null }
  | { status: "upstream_blocked"; month: string; reason: string }
  | { status: "source_absent"; month: string; reason: string }
  | { status: "not_built"; month: string; producerCommand: string };
```

Important: `not_built` means there is work for us to run. `upstream_blocked` means rerunning the
same fetch will not help until the source publisher releases data.

## D1/R2 Split

Use the storage split already defined in `serving_storage_split_plan.md`.

D1 should store:

- full route index rows;
- route search fields and filter facets;
- route support levels and surface flags;
- route-summary facts small enough for list/search;
- source-month status rows;
- compact route-month history summaries used by route list/detail filters and served through
  `GET /api/v1/studio/routes/:routeId/history`;
- detector coverage ledger rows and reviewed/promoted finding index rows;
- evidence/finding/brief/timeline index rows when those become queryable.

R2 should store:

- route detail release documents;
- route ladder/detail bundles;
- map GeoJSON and route segment payloads;
- multi-year chart payloads and detector score-vector artifacts;
- detector review packets and finding evidence bundles;
- route timeline bundles;
- evidence bundles;
- published brief bodies;
- headway histograms and other chart-ready nested payloads.

Do not expose raw R2 keys in product responses. Expose stable API refs or artifact handles that the
Worker can resolve.

## D1 Export Cost Budget

D1 export cost should be tracked as part of every serving publish. Cloudflare D1 billing is row
based: `INSERT`, `UPDATE`, and `DELETE` count as rows written; indexed writes can add another
written row; and Wrangler/dashboard queries count as D1 usage too. As of the 2026-06-06 pricing
check, Workers Paid includes 50M D1 rows written per month, then charges $1 per million rows
written; Workers Free has a 100k rows-written daily limit. The current Snapshot 2.0 serving exports
are well under those thresholds, but the raw analytics corpus is not.

Current local export estimates:

| Export | Seed size | Insert statements | Fresh 1x cost | Fresh 2x indexed estimate | Replace/rerun 4x estimate |
|---|---:|---:|---:|---:|---:|
| `data/exports/d1/2026-03/seed.sql` | 10.3 MB | 31,453 | $0.031 | $0.063 | $0.126 |
| `data/exports/d1/2026-05/seed.sql` | 5.6 MB | 19,708 | $0.020 | $0.039 | $0.079 |
| `data/exports/d1/2026-05/seed.appendix.sql` | 0.6 MB | 1,524 | $0.002 | $0.003 | $0.006 |

Interpretation:

- On Workers Paid, these exports should be $0 incremental unless the account has already exhausted
  the monthly included D1 writes.
- On Workers Free, the March canonical export should usually fit under the 100k daily written-row
  limit on a fresh publish, but a replace/rerun with primary-key/index overhead could approach or
  exceed it. Use Workers Paid for production-like publish attempts.
- The May appendix path is the cheap/correct path for source-status and realtime/reliability
  appendices. Do not publish a full May canonical snapshot unless intentionally switching the
  public baseline semantics.
- D1 storage is not the cost driver for these compact exports. Even using seed-file bytes as a rough
  upper proxy, March is about $0.008/GB-month beyond the included 5 GB.

Guardrail:

| Candidate surface | Current local row count | Serving posture |
|---|---:|---|
| `local_route_month_trend` | 13,880 | OK for D1; this is the compact route-month history surface. |
| `local_route_month_source_status` | 47,625 local / 3,810 March export | OK for D1 when release-scoped and indexed by route/month/source. |
| `local_finding_candidate` | 1,434 | OK as reviewed/promoted index rows; raw candidates remain private until gated. |
| `local_finding_evidence_link` | 5,002 | OK as compact reviewed evidence links or R2-index refs. |
| `local_tier2_intervention_event*` | 939 events / 3,726 routes / 9,052 spans | OK after acceptance/normalization into route timeline/evidence indexes. |
| `local_finding_coverage_audit` | 1,974,616 | Maybe D1 only after aggregation; raw audit rows should stay local/R2. |
| `local_route_hourly_ridership` | 2,129,232 | Not D1 raw; materialize monthly/route summaries. |
| `local_context_event` | 10,626,526 | Not D1 raw; materialize route/corridor event summaries and keep raw in local/R2. |
| `local_route_segment_speed` | 17,473,351 | Not D1 raw; D1 gets route-month/coverage summaries, R2 gets chart payloads. |

Publishing process:

1. Estimate before publish from `export-summary.json`, `appendix-summary.json`, and seed
   `INSERT`/`DELETE` statement counts.
2. Record the actual D1 `rows_written`, `rows_read`, and `databaseSizeBytes` after publish from the
   Cloudflare dashboard, GraphQL analytics, or `wrangler d1 insights`.
3. Treat any planned D1 export above roughly 100k inserted rows as a design review item: it may
   still be cheap on Workers Paid, but it probably means the projection is too raw for the public
   serving database.

## R2 Export Cost Budget

R2 cost should be tracked separately from D1. R2 Standard charges by stored GB-month plus Class A
and Class B operations. Class A includes writes/lists such as `PutObject`; Class B includes reads
and metadata checks such as `GetObject`/`HeadObject`; egress is free. As of the 2026-06-06 pricing
check, R2 Standard includes 10 GB-month storage, 1M Class A operations, and 10M Class B operations
per month. Paid overage is $0.015/GB-month, $4.50/M Class A operations, and $0.36/M Class B
operations.

Current local R2-size estimates:

| Artifact set | Files | Size | Storage/month before free tier | Upload Class A before free tier | One full read Class B before free tier |
|---|---:|---:|---:|---:|---:|
| `data/artifacts/studio` | 91 | 0.026 GB | $0.0004 | $0.0004 | $0.00003 |
| Public release candidate, no docs (`studio` + `map` + `briefs` + `evaluations` + `findings`) | 2,404 | 0.124 GB | $0.0019 | $0.0108 | $0.0009 |
| Public plus detector payloads, no docs | 2,408 | 0.918 GB | $0.0138 | $0.0108 | $0.0009 |
| `data/artifacts/docs` research corpus | 216,988 | 32.143 GB | $0.482 total / about $0.332 over the 10 GB free tier | $0.976 | $0.078 |

Interpretation:

- The current public Studio release is effectively free on R2.
- Even adding maps, findings, evaluations, briefs, and detector score-vector payloads stays under
  the 10 GB Standard storage free tier.
- Tier 2/docs artifacts are the only meaningful R2 storage class today. They are still cheap, but
  they are not a public serving release by default and should be published as a separate research
  archive class with its own lifecycle/caching decision.
- R2 operation costs are also negligible at the current object counts. The docs corpus has many
  objects, but still only about 217k files, below the 1M monthly Class A free tier for one full
  upload and well below the 10M Class B free tier for one full read/crawl.
- Avoid R2 Infrequent Access for now unless we deliberately model the 30-day minimum duration,
  higher operation prices, and retrieval fees. Standard storage is simpler and cheap enough.

Publishing process:

1. Run `publish r2-artifacts --dry-run` before execute. The command already performs the same
   candidate collection, uses HEAD probes when credentials are present, and writes a cost report.
2. Treat `publish-r2-report.json` as the R2 acceptance artifact for candidate count, would-upload
   bytes, actual uploads, skipped objects, Class B HEAD count, and projected R2 Standard cost.
3. Keep public-serving artifacts and research/archive artifacts as separate publish classes. Public
   releases can live in the app artifact bucket; full Tier 2/docs archives should use an explicit
   prefix or bucket policy and should not become route-page payloads by accident.

## First Implementation Slice

The smallest useful 2.0 slice is:

0. Done as an enabling slice: add `StudioRouteHistoryResponse` plus
   `GET /api/v1/studio/routes/:routeId/history` over D1 `route_month_trend`.
1. Add/extend domain schemas for `StudioSnapshot2` and `StudioRouteIndex2`.
2. Add a D1 read helper that builds the full-route index from:
   - `local_route_catalog`;
   - `local_route_readiness`;
   - `local_route_brief_summary`;
   - `local_route_artifact`;
   - route-source reconciliation;
   - data-product completeness;
   - detector/data coverage audit summaries;
   - multi-year route trend/metric summaries where complete enough to serve;
   - current Studio v1 route/brief/finding projections.
3. Write or expose:
   - D1-backed route index rows, or an interim R2 `studio/v2/routes/index.json`;
   - D1/R2 refs for route history, detector coverage, reviewed findings, and evidence bundles as
     those projections become available;
   - R2 `studio/v2/snapshot.json`.
4. Serve `GET /api/v1/studio/snapshot` from the v2 manifest when present.
5. Update route index/search to use the full route index rather than the 12-route v1 projection.
6. Update route detail behavior so a valid route with no rich artifact returns a partial route page
   response, not a not-found response.
7. Keep UI changes additive for now: use comments and API metadata for sparse/partial semantics,
   and do not hide or remove prototype panels for data that is expected to arrive before release.

## Acceptance Gates

The first slice is done when:

- `GET /api/v1/studio/snapshot` reports 381 indexed routes for the current local catalog.
- `GET /api/v1/studio/routes` can list/search all indexed routes, not only the 12 v1 route
  projections.
- every current catalog route slug resolves to either a rich route detail or a partial route detail
  with explicit surface flags/caveats in the response.
- route responses never claim April/May speed completeness while MTA speed rows remain unreleased.
- May zero-row Bus Wait Assessment and Customer Journey fetches appear as upstream-blocked/source
  release caveats, not available-not-fetched action items.
- detector coverage rows can distinguish hit, clean no-hit, skipped missing input, failed join, and
  source lag for every detector/scope/month that enters a public release.
- multi-year route trend panels carry the source window and coverage status used to compute them.
- public findings come only from promoted/reviewed detector packets or accepted official-source
  statements with publication wording gates; raw agentic/Tier 2 surfaces never appear as findings
  by themselves.
- D1/R2 publish checks prove that every artifact ref in the snapshot exists or is explicitly marked
  unavailable.

Verification commands:

```sh
bun --filter @bp/studio-api test test/api-facade.test.ts
bun --filter @bp/pipeline-v2 test
bun --filter @bp/pipeline-v2 typecheck
bun run test:worker
bun --filter @bp/web build
```

`packages/studio-api/test/api-facade.test.ts` owns the Snapshot 2.0 acceptance invariants: it
validates `snapshot.v2`, `routes?schema=2`, default `routes`, sparse-route `search`/`detail`/`ladder`,
route identity uniqueness, and route-history coverage agreement against the same fixture-backed
Worker facade.

For live release prep, also run:

```sh
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- audit data-product-completeness --year 2026 --month 5 --history-start-month 2023-04 --json
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- export d1 --year 2026 --month 3 --json
scripts/publish-serving-release.sh --month 2026-03 --d1 <database> --r2 <bucket>
```

The publish script should stay dry-run until counts, caveats, and artifact refs are reviewed.

## Non-Goals For This Slice

- Do not wait for May speed rows to support all routes.
- Do not make Tier 2 timelines mandatory for route pages.
- Do not invent stop-level ridership or TSP current status.
- Do not turn bus-lane route overlap into audited regulatory mileage.
- Do not replace the whole UI before the snapshot contract exists.
- Do not publish raw detector candidates, raw score vectors, or raw Tier 2 surfaces as if they were
  reviewed findings.

## See Also

- [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface
  Manifest]] — page/tab-shaped checklist for the route sections, route detail child resources,
  compare, evidence/data notes, and non-public opportunity-lab lane that build on this baseline.
- [[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Visualization & multi-year
  expansion]] — extends this baseline along time (multi-year speed panels, signal-month coverage)
  and visual form (the case-study figure catalog, new `series_ready`/`case_ready` support levels).
- [[wiki/engineering/charting_library_evaluation|Charting library evaluation]] — the post-Recharts
  rendering decision (own D3 primitives + uPlot + maplibre) those figures build on.

## Open Decisions

1. Should Snapshot 2.0 be exposed as `schemaVersion: 2` at the existing
   `/api/v1/studio/snapshot` endpoint, or should the endpoint remain schema v1 while adding nested
   optional fields?
2. Should the first all-route index be D1-first immediately, or should we emit R2
   `studio/v2/routes/index.json` as a temporary bridge and then promote to D1 once the UI shape
   settles?
3. What is the public route policy for replacement shuttles and special/future route families:
   visible by default with `source_absent` caveats, or hidden behind a route-family filter?
4. Should `public_visible` continue to mean rich artifact visibility only, or should it be renamed
   so all addressable routes are not confused with rich public artifacts?
5. Which detector surfaces are allowed in the public UI as "evaluated/no issue" versus only in
   operator/reviewer views?
6. What is the first public historical chart set: speed-only, speed plus reliability, or speed plus
   reliability plus ridership/exposure where source coverage permits?
