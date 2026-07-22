---
title: Website Surface Data Plan
type: engineering
status: planning
last_updated: 2026-07-20
owner: codex
source_count: 0
tags: [website, data, snapshot-2, routes, compare, serving, product-surfaces]
---

# Website Surface Data Plan

## Purpose

The website has enough local data that the next planning problem is not "what can we fetch?" It is:

> For each public surface, what is the best data product to serve so the page answers its question
> quickly, honestly, and with enough depth to reward inspection?

This page is the surface-first companion to
[[wiki/engineering/website_data_expansion_plan|Website Data Expansion Plan]],
[[wiki/engineering/serving_snapshot_2_full_route_baseline|Serving Snapshot 2.0 Full-Route Baseline]],
and [[wiki/data/public_facing_data_catalog|Public-Facing Data Catalog]].

It focuses on three immediate product areas:

1. `/routes` as a route-discovery and triage surface with multiple tables, not one list.
2. `/routes/:routeId` as a tabbed route evidence surface.
3. `/compare` as a cohort-aware comparison surface, not only a two-card diff.

The business-opportunity-to-data framing for these surfaces lives in
[[wiki/project/opportunity_data_map|Opportunity Data Map]]. Its core doctrine is that Snapshot 2.0
should become a route/corridor evidence product: observed multi-year performance, rider-exposed
pain, treatment inventory, document timelines, detector/review posture, and source gaps. TSP is a
high-value treatment/source-gap layer, but the core route/corridor product should not block on
authoritative current TSP inventory.

## Planning Stance

Use the corpus broadly, but do not dump the corpus into the UI.

The local corpus contains multi-year route-segment speed rows, route-month trends, observed
reliability summaries, route/hour ridership, route geometry, DOT bus lanes, ACE/ABLE records,
intervention timelines, detector candidates and coverage ledgers, Tier 2 document-derived surfaces,
311/permit/weather/traffic/equity context, and generated briefs/findings/evidence. The public
website should turn those into a small number of opinionated read models.

Principles:

- Every page section starts with a product question.
- Every public metric has a named grain, freshness label, and claim posture.
- D1 stores compact sortable/filterable read models.
- R2 stores dense immutable artifacts, maps, evidence bundles, and chart payloads.
- Pipeline-v2 computes heavy joins, rankings, detector coverage, route history, and chart payloads.
- Worker handlers map product resources to D1/R2 and do no heavy analytics.
- Missing data is section-level availability, not a route-level disappearance.
- Public copy should describe the metric, not the pipeline. Detailed caveats belong in Data Notes
  and `/docs/methodology`.

### Landed route-intervention read model

The public route surfaces use the strict per-route
`bp.studio.route_intervention_inventory_bundle.v1` artifact as their treatment
truth boundary. The bundle preserves exact route identity, canonical treatment
kind/family, lifecycle, raw reviewed labels, occurrences, project
relationships, source gaps, and source coverage. Overview promotes a bounded
current/planned summary; History lists the full typed inventory and never
downloads or re-joins the citywide corpus in the browser.

The `/interventions` ledger uses
`bp.studio.intervention_facet_index.v1` for typed family and exact-route joins.
Documented/Planned view, studied coverage, borough, family, route slug, and
text search are shareable URL state.
Ledger-to-History links carry the exact route slug and a stable record ID;
History-to-ledger links carry the same route slug and optional treatment
family. Unknown exact route filters and missing facet artifacts are explicit
availability states, not prompts to normalize a route suffix or parse prose.

The approved Plan 089 surface keeps one text hero and one responsive ledger
card. Documented records group by year and planned records by a structured
source-plan label; undated/unnamed records remain explicit rollups. The
in-card histogram, summary, tab counts, and group counts all derive from the
same filtered record universe. Only published study-index rows create linked
`matched-segment study` or `descriptive study` labels, while legacy
peer-adjusted comparisons remain descriptive and unlinked.

Route detail reconciles the same evidence into three explicit sections.
`Current state` reads only the inventory bundle's typed `currentState[]` and
never promotes a historical implementation date. `History` is one lossless,
newest-first ledger with stable relationship anchors, Undated last, and local
search/type controls only when cardinality exceeds 12. `Outcomes` keeps
published matched-control, published descriptive, and legacy peer-adjusted
evidence visually and semantically distinct. Citation popovers preserve
original URLs; a typed PDF page adds only `#page=N`. B44 and B44+ remain exact,
separate route identities throughout.

Plan 082 remains sequenced after the typed contract: dated trend markers may
reuse the exhaustive treatment presentation metadata only after resolving Plan
090 observation treatment IDs through the route inventory.

## Surface Contract Pattern

Every website surface should be planned with the same contract:

| Field | Meaning |
|---|---|
| Product question | The question a reader is trying to answer. |
| Primary answer | The one or two facts the section must make obvious. |
| Supporting data | Data families needed to defend or qualify the answer. |
| Grain | Route, route-month, segment-hour, route-event, evidence record, etc. |
| Store | D1 for compact queryable rows; R2 for dense release artifacts. |
| Empty state | How the section behaves when the data is absent, partial, or review-only. |
| Claim posture | Observed, reviewed, proxy/provisional, unavailable, or research-only. |

This avoids two common traps:

- Adding sections because a dataset exists.
- Hiding important data because it does not fit the first route-card schema.

## Shared Metric Spine

The same metric spine should appear across `/routes`, route detail, compare, briefs, and findings.
This keeps the website from becoming several incompatible dashboards.

### Primary Route Metrics

| Metric | Grain | Why it matters | Public notes |
|---|---|---|---|
| Observed weighted speed | route-month | Basic service-performance level. | Label as observed bus speed. Keep peer universe visible. |
| Scheduled-speed gap | route or segment window | Converts slow speed into deviation from planned service. | Use only where schedule comparison is available. |
| Rider-hours lost | route/day and segment/day | Ranks pain by affected riders, not speed alone. | This is delay exposure, not stop-level passenger load. |
| Daily riders | route/month or average day | Gives scale and prioritization weight. | Source is route/hour ridership, not stop boardings. |
| Observed reliability | route-month/run | Captures headway pain: bunching, long gaps, EWT. | Preserve recovered vs self-collected provenance. |
| Speed trend | route-month | Distinguishes chronic slow from worsening or improving. | Show coverage window and source month status. |
| Treatment coverage | route or segment | Explains whether priority tools are already present. | Bus-lane overlap is route-shape overlap unless audited otherwise. |
| Timeline events | route/corridor event | Anchors before/after questions and source context. | Default non-causal unless evaluation gate passes. |
| Evidence readiness | route/finding/evidence | Tells whether there is enough source-backed material for briefs/findings. | Reviewed/promoted beats generated/review-only. |
| Source completeness | route/source/month | Prevents missing data from looking like a clean route. | Expose through flags, Data Notes, and snapshot counts. |

### Secondary Context Metrics

Use these to explain or qualify a primary metric, not to dominate the page:

| Metric family | Product use |
|---|---|
| 311 complaints | Context for curb/blockage hypotheses, source-gap findings, and case studies. |
| DOT permits/openings | Event-window overlays for construction/curb disruption. |
| Parking violations | Context for curb pressure, with geocode/join caveats. |
| Weather | Reliability split and caveat context. |
| Traffic speed/volume | Street context when freshness and route matching are good enough. |
| Equity/demographic context | Later route/corridor context; needs clear geographic method. |
| Detector coverage/no-hit ledger | Shows that a route was checked even when no public finding exists. |
| Detector score vectors | Review/debug and summarized public ranking support, not raw public UI by default. |

## Route Detail Surface

The route detail page should behave like an evidence workspace. Tabs are not arbitrary categories;
each tab answers a different analyst question.

### Route Header And KPI Strip

Question:

> What route am I looking at, and what is the current headline condition?

Primary answer:

- Route identity, termini, route family, support level.
- Five stable KPI cells: observed speed, daily riders, rider-hours lost, observed reliability, and
  treatment coverage.

Target data:

| Data | Store | Notes |
|---|---|---|
| Route identity, slug, labels, borough/family | D1 | Comes from full route index. |
| Route KPI summary | D1 | One row per route/release/month. |
| Support level and surface flags | D1 | Drives section availability and sparse-route behavior. |
| Quality/caveat summary | D1 | Compact status only; full caveats in Data Notes. |
| Generated diagnosis sentence | R2 or computed in release builder | Optional; should be metric-backed and reviewed for copy quality. |

Recommended KPI order:

1. Observed speed.
2. Rider-hours lost.
3. Observed reliability / excess wait.
4. Daily riders.
5. Treatment coverage.

Reason: speed, rider cost, and reliability are the service story; riders and treatments explain
scale and possible tools.

### Overview Tab

Question:

> What is the route story in one screen?

Primary answer:

- Is this route slow, unreliable, rider-impactful, worsening, or already treated?
- Where is the highest-impact part of the route?

Sections:

| Section | Primary data | Supporting data | Store |
|---|---|---|---|
| Route summary paragraph | route KPI summary, top segment, trend direction | quality/caveats | D1 plus R2 text if generated |
| Corridor profile/map | current route shape, segment geometry, segment speed | lane/treatment overlays | R2 map/GeoJSON, D1 refs |
| Speed trend | route-month speed series | source month coverage | D1 route-month rows |
| Hour/daypart profile | route-hour or segment-hour speed/exposure | ridership by hour | D1 compact, R2 dense if needed |
| Treatment inventory | ACE, bus lanes, TSP, SBS, ABLE, planned/proposed | source refs and caveats | D1 summary plus R2 detail refs |
| Route vitals | miles, stops, frequency if available, route family | route catalog and GTFS | D1 |

First implementation:

- Keep the current overview layout, but add observed reliability to the primary story.
- Replace any synthetic sparkline fallback with route-history coverage-aware data where possible.
- Add a compact "top issue" tuple: `{segment, metric, daypart, riderHoursLost, confidence}`.

Later:

- Replace single-line speed trend with the route speed-carpet once `series_ready`.
- Add intervention markers to trend charts only when event dates are validated.

### Slow Segments Tab

Question:

> Where does the route lose the most time, and when?

Primary answer:

- A ranked table of segments by rider-hours lost, not raw slowness alone.
- Each row should show the time pattern and treatment state.

Required columns:

| Column | Data | Why |
|---|---|---|
| Segment | stable display label, direction, order | Lets readers locate the issue. |
| Rider-hours lost | segment/day or segment-window | Main rank field. |
| Observed speed | segment/month or segment/daypart | Severity. |
| Scheduled gap | segment/window | Delay against planned service. |
| Persistence | share of months/dayparts slow | Distinguishes chronic from one-off. |
| Worst daypart/hour | segment-hour speed or severity | Tells when intervention matters. |
| Riders exposed | route/hour ridership proxy | Prevents empty slow segments from dominating. |
| Treatments | lane/ACE/TSP/SBS state | Explains current toolkit. |
| Evidence | finding/timeline/evidence refs | Connects to briefs and finding detail. |

Recommended rankings:

| Ranking | Formula sketch | Use |
|---|---|---|
| Rider impact | `riderHoursLost` descending | Default table. |
| Slowest | observed speed ascending with min sample gate | Diagnostic alternate. |
| Most persistent | slow-month share, then rider-hours | Chronic bottlenecks. |
| Untreated pain | rider-hours times low-treatment factor | Intervention gap. |
| Worsening segment | recent slope or largest negative residual | Early warning. |

Store:

- D1: compact `route_segment_summary` rows keyed by route, segment, direction, month/daypart.
- R2: dense `route_speed_history` carpet and segment time series.

Empty state:

- If no rich segment artifact exists, keep route page available and mark the tab unavailable through
  surface flags.
- If segment data exists but no segment crosses severity gates, show a "checked/no major segment
  issue" status only after detector coverage supports it.

### Reliability Tab

Question:

> Do buses arrive predictably, and is the current signal trustworthy?

Primary answer:

- Excess wait, bunching, and long-gap rates with sample coverage.
- Whether the reliability layer is baseline observed, current signal, or insufficient samples.

Required sections:

| Section | Data | Store |
|---|---|---|
| Reliability KPI row | EWT, median headway, p90 headway, bunching, long gaps | D1 |
| Coverage/source card | run id, source, month, sample count, caveats | D1 |
| Reliability distribution | headway histogram or buckets | R2 when dense |
| Hour/daypart reliability | route-hour reliability buckets | D1 compact or R2 dense |
| Weather/incident split | normalized route-day control results where available | R2 case/context artifact |
| Schedule baseline | scheduled headway/service span | D1 when compact |

First implementation:

- Promote observed reliability from a route-card field into a dedicated tab.
- Add a simple three-part visual: median headway, long-gap share, bunching share.
- Add sample coverage and provenance labels in Data Notes, not in the hero copy.

Do not:

- Treat current appendix evidence as a full baseline month.
- Claim route-level reliability when sample counts are insufficient.
- Hide reliability entirely when there is an insufficient-samples row; that is useful status.

### Riders Tab

Question:

> How many riders are affected, and where is rider delay concentrated?

Primary answer:

- Daily riders and route/hour exposure.
- Top delay-exposure segments.

Sections:

| Section | Data | Store |
|---|---|---|
| Daily/average boardings | route-month ridership | D1 |
| YoY or multi-month rider trend | route-month ridership series | D1 |
| Boardings by hour | route-hour ridership | D1 compact |
| Rider-hours lost | route/segment delay exposure | D1 |
| Top rider-impact segments | segment summary | D1 |
| Equity context | route/corridor aggregate context | D1/R2 later |

Rules:

- Use "boardings" when the source is boardings.
- Use "rider-hours of delay" or "delay exposure" for segment allocation.
- Do not imply stop-level boardings or segment passenger loads until a real source exists.

### Timeline Tab

Question:

> What changed on or near this route, and what happened around those dates?

Primary answer:

- A dated sequence of official or reviewed events.
- A speed/reliability trend aligned to those events.
- Whether any before/after interpretation is descriptive, peer-adjusted, or causal-gated.

Event classes:

| Event class | Source | Public posture |
|---|---|---|
| ACE/ABLE implementation | MTA source and treatment state | observed/reviewed |
| Bus lane open/planned date | DOT source text plus normalized date review | timeline fact or supporting context |
| SBS/service redesign | Tier 2 accepted event or source registry | timeline fact after route/date gates |
| Service change/schedule shift | GTFS/timepoint/version signal | caveat or timeline context |
| Studies/board materials/press claims | Tier 2 document surfaces | supporting context until reviewed |
| Permits/311/weather | context artifacts | context only unless detector/case gate promotes |

Store:

- D1: route timeline index, counts, event types, date ranges, route refs.
- R2: route/corridor timeline bundle with source refs, evidence snippets, caveats, and chart refs.
- The current deterministic pilot index is produced by
  `docs tier2 route-timeline-bundle-index`. It reads per-route timeline bundles and emits route
  readiness rows (`timeline_ready`, `timeline_sparse`, `timeline_review_only`, `invalid`), default
  event headlines, unresolved-date counts, validation counts, and unaccounted-tail audit counts.
  The D1 row should follow that compact index; the full timeline event/citation bundle stays in R2.
- The pilot serving projection is produced by
  `docs tier2 route-timeline-serving-projection`. It converts the bundle index into a compact
  `route_timeline_index` D1 read model, `route_artifact` rows named `route_timeline_bundle`, and an
  R2 copy plan using keys like `studio/v2/routes/b46/timeline.json`. The current four-route pilot
  has 4 timeline-index rows, 4 artifact refs, 3 `timeline_ready` routes, 1 `timeline_sparse` route,
  13 default events, and 0 validation warnings/errors.
- The compact read model is now part of the canonical D1/export path. Migration
  `0028_route_timeline_index.sql` adds `route_timeline_index`; `export d1` and `verify d1` accept
  `--route-timeline-projection-path`; the Studio route index marks `surfaceFlags.timeline =
  available` when a `route_timeline_bundle` artifact is indexed; and
  `/api/v1/studio/routes/:routeId/timeline` resolves the D1 index row to the immutable R2 bundle.
  The March 2026 local export with the four-route pilot produced 4 timeline rows and 4 timeline
  artifact refs. Its full `verify d1` replay now passes with 0 issues after export input assembly
  hydrates missing month-scoped source-gap intervention events from the release-month comparison
  rows; missing non-source-gap intervention event refs remain a hard failure.

Date normalization note:

- Timeline dates should be runner-owned, not free-form model output. A curation model may select
  `dateAssertionRefs`, but the runner should hydrate `date`, `month`, `datePrecision`, display
  text, and any before/after window from those refs.
- The B46 ref-first curation now has a deterministic first pass for exact dates, months, seasons
  (`Summer 2014`, `Fall 2015`, `Spring 2016`), bare years, year ranges (`2017-2018`, `2019/2020`),
  and explicit unknowns (`TBD`). `docs tier2 route-timeline-curation-repair` should run before the
  bundle step so omitted but unambiguous `dateAssertionRefs` become explicit evidence refs instead
  of validator warnings.
- Do not schedule a broad expensive LLM rerun only to fix dates. If deterministic coverage stalls,
  use a narrow reviewed `rawDateText -> normalizedDateAssertion` codec where the agent returns only
  the raw string plus a constrained normalized shape, not a rewritten timeline event.

Do not:

- Publish raw discovery candidates as route timeline facts.
- Treat planned dates as implemented dates.
- Use official prose as causal proof without an evaluation gate.

### Interventions Tab

Question:

> What priority tools are already in place, and where are the gaps?

Primary answer:

- Treatment inventory by family.
- Coverage by route and segment.
- Evaluation readiness for each treatment.

Sections:

| Section | Data | Store |
|---|---|---|
| Current treatment inventory | bus lanes, ACE/ABLE, TSP, SBS, bus stops/lanes where available | D1 |
| Route coverage bar/map | route-shape overlap and route segment refs | D1 summary, R2 geometry |
| Segment treatment table | segment treatment flags and method caveats | D1 |
| Evaluation status | before/after windows, peer cohort, causal gate | D1 index plus R2 artifact |
| Treatment gaps | high-delay untreated segments | D1 derived ranking |

Ranking idea for treatment gaps:

```text
treatment_gap_score =
  rider_hours_lost_score
  + reliability_penalty
  + persistence_score
  - existing_treatment_credit
  - evidence_uncertainty_penalty
```

This is a triage score, not a recommendation.

### Evidence And Data Notes Tab

Question:

> What source coverage and caveats travel with this route?

Primary answer:

- Which data surfaces are available, partial, unavailable, or review-only.
- Which source refs support the route's public claims.

Sections:

| Section | Data | Store |
|---|---|---|
| Surface availability matrix | route surface flags and source month states | D1 |
| Source coverage by family | speed, ridership, reliability, geometry, treatments, documents, context | D1 |
| Evidence cards | source/evidence refs tied to route, findings, briefs, timeline | D1 index plus R2 bundles |
| Caveats | route-specific caveats in user-facing wording | D1/R2 |
| Artifact refs | route artifacts and hashes for agents/docs | D1 refs; no private R2 keys in public copy |

Data Notes should be the only route tab allowed to talk explicitly about source coverage, method
limits, and freshness in more than a tooltip.

## Compare Surface

The compare page should answer:

> How are these two routes different, are they comparable, and what explains the difference?

There are three comparison layers:

1. Route A vs route B.
2. Each route vs its own history.
3. Each route vs a peer cohort.

### Primary Compare Metrics

| Metric | Display | Why |
|---|---|---|
| Observed weighted speed | A, delta, B | Basic performance delta. |
| Rider-hours lost | A, delta, B | Passenger impact delta. |
| Observed reliability/EWT | A, delta, B | Captures wait pain beyond speed. |
| Daily riders | A, delta, B | Scale and route comparability. |
| Treatment coverage | A, delta, B | Explains policy/tool differences. |
| Trend direction | A, delta, B | Chronic vs worsening vs improving. |
| Peer percentile | A rank, B rank | Prevents arbitrary pair over-reading. |
| Evidence readiness | A status, B status | Shows whether one route has better support. |

### Compare Sections

| Section | Question | Data |
|---|---|---|
| Pair header | Are these routes similar enough to compare? | borough/family/miles/riders/peer cohort |
| KPI delta strip | Which route is worse on the core metrics? | route compare metric rows |
| Daypart profile | When is the gap largest? | route-hour speed/reliability/exposure |
| Slow segment comparison | Is the problem one bottleneck or route-wide? | top segment summaries for both routes |
| Reliability comparison | Is wait time worse even if speed is similar? | observed reliability rows/histograms |
| Treatment comparison | Does one route already have more priority treatment? | treatment coverage and timeline |
| History comparison | Is the gap recent or persistent? | route-month history |
| Findings/evidence overlap | Which route has reviewed findings or source-backed events? | finding/evidence/timeline indexes |
| Peer context | Are both outliers or is one typical? | cohort ranks/percentiles |

### Compare Read Model

Do not precompute every possible pair. Compute pair response from compact route and cohort rows.

D1:

- `route_compare_metric`: route, month, core metric values, peer ranks.
- `route_peer_context`: route, cohort id, cohort label, rank, percentile, route count.
- `route_segment_topk`: top segments by rider impact/persistence/treatment gap.
- `route_daypart_profile`: 24-hour or 5-daypart compact metrics.
- `route_treatment_summary`: treatment coverage and active timeline state.

R2:

- full route speed-history payloads;
- reliability distribution payloads when dense;
- route timeline bundles;
- evidence bundles.

Endpoint direction:

```text
GET /api/v1/studio/compare?a=:route&b=:route
```

should become `StudioCompareResponseV2` with:

- `routes`: route summaries;
- `pair`: similarity/comparability summary;
- `metrics`: normalized A/delta/B rows;
- `dayparts`: compact profiles;
- `segments`: top-k segment contrasts;
- `treatments`: treatment deltas;
- `history`: route-month overlays or refs;
- `evidence`: finding/timeline/source refs;
- `quality`: pair-level caveats.

Empty state:

- If a metric is unavailable for one route, compare should still render the pair and mark that row
  unavailable.
- If the pair is not a good peer comparison, the page should say so through cohort labels and ranks,
  not block the comparison.

## `/routes` Surface

The `/routes` page should not be a single sorted list. It should be the network-level route discovery
surface:

> Where should I look next, and why?

It should use multiple ranked sections because different users arrive with different questions.

### Proposed Route Sections

| Section | Product question | Ranking basis | Primary columns |
|---|---|---|---|
| Needs Attention | Which routes have the biggest current service pain? | rider impact + speed gap + reliability + persistence | route, speed, EWT, rider-hours, riders, trend |
| Worsening Fast | Which routes are deteriorating? | recent route-month speed/reliability slope with coverage gates | route, 3/6/12-mo change, riders, current speed |
| High Rider Impact | Where do delays affect the most people? | rider-hours lost, daily riders, exposure by hour | route, rider-hours, daily riders, worst daypart |
| Reliability Watch | Where are headways worst? | excess wait, long gaps, bunching, sample coverage | route, EWT, long gaps, bunching, sample count |
| Slowest Corridors | Which routes are slow in absolute terms? | observed speed, speed percentile | route, mph, percentile, scheduled gap |
| Treatment Gaps | Which high-impact routes have low priority treatment? | treatment gap score | route, rider-hours, lane coverage, ACE/TSP state |
| Evidence Ready | Which routes can support a source-backed brief/finding now? | reviewed findings + timelines + evidence cards + brief status | route, findings, timeline events, evidence count |
| Recently Changed | Which routes had recent interventions or source events? | timeline recency and event class | route, event, date, current trend |
| Peer Outliers | Which routes underperform similar routes? | peer percentile gap and rider impact | route, peer group, rank, speed/reliability gap |
| Sparse / Partial Data | Which addressable routes need data completion? | support level and surface flags | route, support level, missing surfaces |

### Section Ranking Sketches

These formulas are release-builder guidance. They can change, but the section labels should remain
stable for users.

```text
needs_attention_score =
  0.30 * speed_gap_percentile
  + 0.30 * rider_hours_lost_percentile
  + 0.20 * observed_reliability_penalty
  + 0.10 * worsening_trend_percentile
  + 0.10 * persistence_percentile
```

```text
worsening_fast_score =
  recent_speed_decline_z
  + recent_ewt_increase_z
  + rider_weight
  - source_coverage_penalty
```

```text
treatment_gap_score =
  rider_hours_lost_percentile
  + reliability_penalty
  + persistence_percentile
  - lane_coverage_credit
  - ace_or_tsp_credit
```

```text
evidence_ready_score =
  4 * promoted_finding_count
  + 3 * reviewed_timeline_event_count
  + 2 * evidence_card_count
  + 1 * generated_brief_available
  - review_candidate_only_penalty
```

Use min-history and min-sample gates before a route can appear in Worsening Fast, Reliability Watch,
or Peer Outliers. A sparse route can still appear in Sparse / Partial Data.

### `/routes` Read Model

D1 should hold a section-ready index so the Worker can serve `/routes` without scanning raw metric
families.

Suggested row:

```ts
type StudioRouteSectionRow = {
  releaseId: string;
  sectionId:
    | "needs_attention"
    | "worsening_fast"
    | "high_rider_impact"
    | "reliability_watch"
    | "slowest_corridors"
    | "treatment_gaps"
    | "evidence_ready"
    | "recently_changed"
    | "peer_outliers"
    | "sparse_partial";
  routeId: string;
  slug: string;
  rank: number;
  score: number | null;
  primaryMetricValue: number | null;
  primaryMetricLabel: string;
  secondaryMetricValue: number | null;
  secondaryMetricLabel: string;
  reason: string;
  supportLevel: StudioRouteSupportLevel;
  surfaceFlags: StudioRouteSurfaceFlags;
  updatedAt: string;
};
```

Suggested endpoint:

```text
GET /api/v1/studio/routes/sections
```

Response shape:

```ts
type StudioRouteSectionsResponse = {
  schemaVersion: 1;
  generatedAt: string;
  releaseId: string;
  baselineMonth: string;
  sections: Array<{
    sectionId: string;
    title: string;
    productQuestion: string;
    status: "available" | "partial" | "not_built";
    rankMeaning: string;
    minCoverageRule: string;
    rows: StudioRouteSectionRow[];
    caveats: string[];
    notBuiltReason: string | null;
  }>;
  quality: StudioQuality;
};
```

Alternative:

- Embed `sections` in `GET /api/v1/studio/routes?schema=2`.

Recommendation:

- Add a separate `routes/sections` endpoint so `/routes` can load high-level discovery first while
  route search/autocomplete remains a compact route-index resource.

### `/routes` UI Behavior

Layout:

- Search/autocomplete remains first.
- Below search, show 4 to 6 high-value sections by default.
- Put additional sections behind tabs or a compact section nav.
- Each section is a dense table with stable columns, not a grid of marketing cards.

Default sections for first release:

1. Needs Attention.
2. Worsening Fast.
3. Reliability Watch.
4. Treatment Gaps.
5. Evidence Ready.
6. Sparse / Partial Data.

Reason:

- These six make the page useful to both policy readers and project reviewers.
- They exercise speed, reliability, treatments, evidence, and coverage.
- They avoid waiting for every advanced context source before improving the page.

## Cross-Surface Data Placement

### D1 Control And Index Plane

Good D1 candidates:

| Read model | Grain | Surfaces |
|---|---|---|
| `studio_route_index_v2` | route/release | `/routes`, search, route header, compare |
| `route_kpi_summary` | route/month | route header, `/routes`, compare |
| `route_section_rank` | section/route/release | `/routes` tables |
| `route_month_history` | route/month | overview, timeline, compare |
| `route_daypart_profile` | route/daypart/month | overview, compare |
| `route_reliability_summary` | route/month/run | reliability tab, `/routes`, compare |
| `route_segment_summary` | route/segment/daypart/month | slow segments, compare, treatment gaps |
| `route_treatment_summary` | route/treatment/month | interventions, compare, `/routes` |
| `route_timeline_index` | route/event | timeline, `/routes` recently changed, evidence |
| `route_evidence_index` | route/evidence | Evidence Ready, Data Notes, briefs/findings |
| `route_peer_context` | route/cohort/month | compare, peer outliers |
| `source_month_coverage` | source/month/route optional | Data Notes, snapshot, sparse data |
| `detector_public_coverage_summary` | route/detector/month | no-hit states, findings, Data Notes |

D1 row counts should stay compact. Raw hourly ridership, raw context events, raw segment speed, and
raw detector coverage ledgers are too large for public D1 without aggregation.

### R2 Artifact Plane

Good R2 candidates:

| Artifact | Grain | Surfaces |
|---|---|---|
| `studio/v2/routes/{slug}/speed-history.json` | route, segment, month, daypart | overview, slow segments, compare, case studies |
| `studio/v2/routes/{slug}/timeline.json` | route/corridor event bundle | timeline, evidence, briefs |
| `studio/v2/routes/{slug}/evidence.json` | route evidence bundle | Data Notes, findings, briefs |
| `map/{month}/routes/{slug}.geojson` | route/segment geometry | overview, slow segments, maps |
| `studio/v2/routes/{slug}/reliability-distribution.json` | route/run histogram | reliability tab |
| `studio/v2/cases/{caseId}.json` | natural-experiment case | segment/case surface, briefs |
| `studio/v2/snapshot.json` | release manifest | status, docs, route availability |

## Implementation Sequence

### Phase 0 - Lock The Surface Matrix

Deliverable:

- This page plus links from the wiki index and expansion plan.
- The [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface
  Manifest]] as the concrete page/tab checklist.
- Product questions and target read models accepted as the planning baseline.

Verification:

```sh
bun run check:knowledge
```

### Phase 1 - Route Sections From Existing Data

Goal:

- Make `/routes` useful as a network triage surface before deeper route pages are rebuilt.

Work:

1. DONE initial: Add domain schemas for `StudioRouteSectionsResponse`.
2. DONE initial: Build section ranks from existing D1 route summaries, route history stats,
   current treatment flags, and support/coverage flags.
3. DONE initial: Serve `GET /api/v1/studio/routes/sections`.
4. Update `/routes` to render multiple dense tables.

First sections:

- Needs Attention: available.
- Worsening Fast: partial.
- Treatment Gaps: partial.
- Data Coverage: available.
- Reliability Watch: not built until reliability summary projection exists.
- Evidence Ready: not built until promoted route evidence index exists.

Verification:

```sh
bun --filter @bp/studio-api test test/api-facade.test.ts
bun run test:worker
bun --filter @bp/web build
```

### Phase 2 - Route Detail V2 Tabs

Goal:

- Make each tab load a purpose-built resource instead of bloating one route detail payload.

Work:

1. Keep the current route detail shell.
2. Add or harden child resources:
   - `GET /api/v1/studio/routes/:routeId/history` already exists.
   - `GET /api/v1/studio/routes/:routeId/segments`.
   - `GET /api/v1/studio/routes/:routeId/reliability`.
   - `GET /api/v1/studio/routes/:routeId/riders`.
   - `GET /api/v1/studio/routes/:routeId/timeline`.
   - `GET /api/v1/studio/routes/:routeId/evidence`.
3. Add a Reliability tab.
4. Move Data Notes to surface flags, source coverage, and evidence refs rather than static copy.

Verification:

```sh
bun --filter @bp/studio-api test
bun run test:worker
bun --filter @bp/web build
```

### Phase 3 - Compare V2

Goal:

- Compare two routes across performance, reliability, riders, treatments, history, and peer context.

Work:

1. Add `StudioCompareResponseV2`.
2. Build D1 route compare metric rows and peer context rows.
3. Render KPI delta strip, daypart profile, reliability comparison, treatment comparison, and top
   segment contrast.
4. Keep pair-specific dense artifacts optional; assemble the response from compact route rows first.

Verification:

```sh
bun --filter @bp/studio-api test test/api-facade.test.ts
bun run test:worker
bun --filter @bp/web build
```

### Phase 4 - Multi-Year Segment Series

Goal:

- Let route pages use the multi-year segment corpus, starting with one route and then generalizing.

Work:

1. Build the stable geographic segment spine.
2. Emit `studio/v2/routes/{slug}/speed-history.json`.
3. Serve `GET /api/v1/studio/routes/:routeId/speed-history`.
4. Render the route speed-carpet deferred from the route detail page.
5. Use the carpet to power slow-segment persistence and worsening-segment rankings.

Verification:

```sh
bun --filter @bp/pipeline-v2 cli -- studio speed-history --route B41 --start-month 2023-04 --end-month 2026-03
bun --filter @bp/studio-api test test/api-facade.test.ts
bun --filter @bp/web build
```

### Phase 5 - Timelines And Evidence

Goal:

- Turn Tier 2 and detector outputs into route-level timeline/evidence surfaces.

Work:

1. Promote reviewed route/corridor timeline records into route timeline indexes.
2. Add route evidence index rows with stable public evidence IDs.
3. Add `/routes/:routeId/timeline` and `/routes/:routeId/evidence`.
4. Add Evidence Ready and Recently Changed route sections.
5. Connect route timeline/evidence to brief composer and findings.

Current pilot:

- `docs tier2 route-timeline-bundle-index` builds route-level timeline readiness from curated
  bundles.
- `docs tier2 route-timeline-serving-projection` builds the compact D1/R2 serving addressability
  artifact for those bundles. This is not yet a canonical D1 migration/export or Worker endpoint;
  it is the reviewed shape to integrate next.

Verification:

```sh
bun --filter @bp/pipeline-v2 cli -- audit studio-coverage --year 2026 --month 3
bun --filter @bp/studio-api test
bun run test:worker
```

### Phase 6 - Context And Detector Coverage

Goal:

- Use context sources and detector no-hit/skipped coverage without overclaiming.

Work:

1. Aggregate detector coverage to public route/detector/month summaries.
2. Promote context signals only when they have route/date windows and source caveats.
3. Show "checked/no public issue" states where detector coverage supports it.
4. Add context-aware sections such as curb-pressure candidates or construction-disruption watch
   only after route matching and freshness labels are good enough.

Verification:

```sh
bun --filter @bp/pipeline-v2 cli -- audit evidence-corpus --year 2026 --month 3
bun --filter @bp/pipeline-v2 cli -- audit data-product-completeness --year 2026 --month 3 --history-start-month 2023-04
```

## Acceptance Gates

Snapshot 2.0 website data is ready for the richer UI when:

- `/routes` has multiple route sections built from real D1/R2 data, not hard-coded slices.
- Every section has a documented ranking method and min-coverage rule.
- Route detail tabs render only from typed route resources or show section-level unavailable states.
- Reliability appears as a first-class surface with provenance and sample coverage.
- Compare v2 includes peer context and route-history context, not just direct deltas.
- Slow-segment tables rank by rider impact and persistence, not speed alone.
- Timeline events are reviewed/promoted or clearly supporting context.
- Evidence Ready counts do not mix reviewed findings with raw detector candidates.
- Data Notes can explain source coverage by route/source/month.
- Publish checks prove every referenced R2 artifact exists or every missing artifact has a surface
  flag/caveat.

## Non-Goals

- Do not add hosted Postgres/PostGIS or Python to make these surfaces easier.
- Do not compute route rankings, segment persistence, or evidence linking inside Worker requests.
- Do not make stop-level boarding claims until a real stop-level source exists.
- Do not treat route-shape bus-lane overlap as audited regulatory lane mileage.
- Do not expose raw detector candidates, raw Tier 2 surfaces, or raw context-event rows as public
  facts.
- Do not turn Data Notes into a replacement for `/docs/methodology`.

## Open Decisions

1. Should route sections live at `GET /api/v1/studio/routes/sections`, or inside
   `GET /api/v1/studio/routes?schema=2`?
2. Should Reliability become a visible route-detail tab immediately, or first land as a child
   endpoint and KPI expansion?
3. What is the first peer cohort definition for compare v2: borough/family, ridership decile, route
   length, SBS/local class, or a combined cohort?
4. Should route section ranks use simple transparent percentile sums first, or detector score vectors
   where available?
5. Which route-context signals are allowed on public pages as context before they become reviewed
   evidence?
6. How many sections should `/routes` show by default before the page becomes too busy?

## See Also

- [[wiki/project/opportunity_data_map|Opportunity Data Map]]
- [[wiki/data/public_facing_data_catalog|Public-Facing Data Catalog]]
- [[wiki/engineering/website_data_expansion_plan|Website Data Expansion Plan]]
- [[wiki/engineering/route_treatment_summary_materializer_plan|Route Treatment Summary Materializer Plan]]
- [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface Manifest]]
- [[wiki/engineering/serving_snapshot_2_full_route_baseline|Serving Snapshot 2.0 Full-Route Baseline]]
- [[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Serving Snapshot 2.0 Visualization & Multi-Year Expansion]]
- [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]]
- [[wiki/engineering/website_data_support_audit|Website Data Support Audit]]
- [[wiki/engineering/ui_copy_doctrine|UI Copy Doctrine]]
