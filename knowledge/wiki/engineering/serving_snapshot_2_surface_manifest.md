---
title: Serving Snapshot 2.0 surface manifest
type: engineering
status: active
last_updated: 2026-06-06
owner: codex
source_count: 0
tags: [serving, snapshot-2, website, routes, surface-manifest, d1, r2]
---

# Serving Snapshot 2.0 Surface Manifest

## Purpose

This page is the concrete surface manifest for Snapshot 2.0. It translates the
surface-first plan into page/tab-shaped serving requirements.

The question is not:

> Which local tables do we have?

The question is:

> For each public page category, what data must exist so the page can answer its question quickly,
> honestly, and without pretending missing data is a clean result?

This manifest is not a runtime contract yet. It is the planning baseline for the next projection,
D1/R2 export, Worker endpoint, and UI wiring work.

## Design Rules

- Keep route pages uniform; make the highlighted questions route-specific later.
- A valid catalog route should remain addressable even when a child surface is missing.
- Every page/tab has a product question, claim posture, grain, storage target, and empty state.
- D1 stores compact query/index rows. R2 stores dense immutable bundles, chart payloads, maps, and
  evidence packets.
- The Worker maps public resources to D1/R2 and does no heavy analytics.
- Public UI uses typed resources or explicit section-level unavailable states.
- Raw detector candidates, raw Tier 2 surfaces, raw context-event rows, and local artifact paths do
  not become public facts.
- Data Notes owns source coverage, caveats, freshness, and method limitations. Other tabs should
  use short labels and refs, not long methodological explanations.

## Engagement Model

The page questions in this manifest should be user-motivation questions, not internal coverage
questions.

Behaviorally, the site earns attention when it gives a reader:

| Driver | Product translation | Bad version |
|---|---|---|
| Personal relevance | "Find my route and understand it." | "Which routes are built?" |
| Salience | "Which route has the most rider pain right now?" | "Which table has rows?" |
| Surprise | "Which route is getting worse, improving, or behaving oddly?" | "Which detector ran?" |
| Agency | "Where is there an actionable treatment gap?" | "Which pipeline output exists?" |
| Trust | "Can I cite this, and what supports it?" | "Here is a claim with hidden caveats." |
| Progressive disclosure | "Show the headline first; let me inspect proof." | "Make methodology the first screen." |

The system still needs coverage states, but those are not the hook. They belong in ranking gates,
disabled rows, Data Notes, and release QA. A user should experience sparse data as a clear section
state only after they ask for a route or claim, not as the main promise of `/routes`.

## Status Legend

| Status | Meaning |
|---|---|
| `exists` | Endpoint/artifact exists and is usable as a base surface. |
| `partial` | Some data exists, but shape or coverage is not enough for the target page. |
| `not_built` | Required projection/endpoint is planned but not implemented. |
| `research_only` | Useful for analysis/review, but not a public serving contract. |
| `defer` | Do not build until a stronger upstream detector/review layer exists. |

For route-level availability, use the runtime status vocabulary from
`StudioRouteSurfaceStatus`: `available`, `partial`, `missing`, `none`, `upstream_blocked`,
`downstream_blocked`, and `not_built`.

## Current Base Surfaces

These are already good enough to build from:

| Surface | Current backing | Public role | Status |
|---|---|---|---|
| Snapshot v2 | `GET /api/v1/studio/snapshot` nested `v2` | Release truth, route universe, source month states. | exists |
| All-route index v2 | `GET /api/v1/studio/routes?schema=2` | Full route addressability, support flags, projection refs. | exists |
| Route sections | `GET /api/v1/studio/routes/sections` | Route discovery sections built from route summaries, history stats, support flags, and coverage states. | exists |
| Route detail v1 | `GET /api/v1/studio/routes/:routeId` | Current rich route shell and prototype panels. | partial |
| Route history | `GET /api/v1/studio/routes/:routeId/history` | Route-month speed/ridership trend context. | exists |
| Route speed history | `GET /api/v1/studio/routes/:routeId/speed-history` | Segment x month x daypart carpet where R2 artifacts exist. | partial |
| Route ladder | `GET /api/v1/studio/routes/:routeId/ladder` | Rich segment ladder where v1 artifact exists. | partial |
| Source month coverage | D1 `source_month_coverage` via snapshot v2 | Data Notes and release caveats. | exists |
| Tier 2 materialized views | `vocab-materialized-views-v1-20260606` | Route evidence, detector feature rows, review queues, source coverage. | research_only |

Important: Tier 2 materialized views are usable as pipeline inputs now, but they are not public
evidence contracts until stable public evidence ids and review/promotion gates are added.

The route/segment treatment read models are planned in
[[wiki/engineering/route_treatment_summary_materializer_plan|Route Treatment Summary Materializer
Plan]]. That plan treats Tier 2 interventions as one input, then deterministically merges them with
ACE/ABLE, DOT bus-lane overlap, TSP source posture, local intervention events, comparison windows,
and source gaps.

## Page Manifest

### `/routes` Route Discovery

Question:

> Which routes need attention right now?

Primary answer:

- A full route universe.
- Multiple ranked sections organized around rider impact, change, reliability, actionability, and
  evidence readiness.
- Search always lets a user open their route.

System/coverage obligation:

- Include all addressable routes.
- Do not rank a route in a section unless it passes that section's minimum coverage rule.
- Distinguish available, partial, missing, upstream-blocked, downstream-blocked, and not-built
  surfaces behind the scenes.
- Let Data Notes explain sparse coverage when a user opens the route.

| Section | Product question | Required read model | Grain | Store | Current state | Empty state |
|---|---|---|---|---|---|---|
| All routes/search | Can I open any current route? | `studio_route_index_v2` | route/release | D1 | exists | Route appears with support level and caveats. |
| Needs Attention | Which routes combine slow speed, rider impact, and recurring hotspots? | `route_section_rank` + `route_kpi_summary` | route/month | D1 | exists | Section ranks only routes with a baseline route summary. |
| Worsening Fast | Which routes are getting worse against their own history? | `route_month_history` + trend gates | route/month | D1 | partial | Requires min-history gate before ranking. |
| Reliability Watch | Where are headways and wait pain worst? | `route_reliability_summary` | route/month/run | D1 | not_built | Show only after observed reliability coverage exists. |
| Treatment Gaps | Where is rider impact high and indexed treatment coverage low? | `route_section_rank` from current summary treatment flags | route/month | D1 | partial | Upgrade when a fuller treatment summary exists. |
| Evidence Ready | Which routes can support source-backed findings or briefs now? | `route_evidence_index` | route/evidence | D1 + R2 refs | not_built | Keep separate from raw Tier 2/detector candidates. |
| Data Coverage | Which routes have partial evidence for this release? | surface flags + source month states | route/release | D1 | exists | Secondary/review section; do not make it the main route-list hook. |

Implemented base:

1. `StudioRouteSectionsResponse`.
2. D1/Worker builder for deterministic route sections.
3. `GET /api/v1/studio/routes/sections`.

Next build target: mount `/routes` sections in the UI without replacing the current route designs,
then promote Reliability Watch and Evidence Ready only after their backing projections exist.

### `/routes/:routeId` Header And KPI Strip

Question:

> What route am I looking at, and what is the current headline condition?

Primary answer:

- Route identity and support level.
- Observed speed, rider-hours lost, reliability, daily riders, and treatment coverage.

| Need | Required read model | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Route identity | `studio_route_index_v2` | route/release | D1 | exists | Must work for sparse routes. |
| KPI summary | `route_kpi_summary` | route/month | D1 | partial | Current values live inside route detail v1. |
| Support flags | `surfaceFlags` | route/release | D1 | exists | Drives child-tab availability. |
| Quality/caveat summary | route quality row | route/release | D1 | partial | Full method text stays in Data Notes. |
| CTA refs | brief/findings/evidence availability | route/release | D1 | partial | Generate-brief affordance can remain prototype-only until release gates. |

KPI order for 2.0:

1. Observed speed.
2. Rider-hours lost.
3. Observed reliability / excess wait.
4. Daily riders.
5. Treatment coverage.

Current UI still shows bus-lane coverage and ACE status. Do not remove design work yet; migrate the
data source behind the cells first.

### Overview Tab

Question:

> What is the route story in one screen?

Primary answer:

- The route's top current issue.
- Where that issue is located.
- Whether current conditions are chronic, worsening, improving, or not yet trend-supported.

| Section | Required read model/artifact | Grain | Store | Current state | Empty state |
|---|---|---|---|---|---|
| Summary paragraph | `route_overview_summary` | route/month | D1 or R2 text | partial | Use metric-backed sentence only; no generated unsupported diagnosis. |
| Corridor profile/map | route geometry + `route_segment_summary` | route/segment/month | R2 map + D1 refs | partial | Keep route shell; mark map/segment unavailable. |
| Speed trend | `route_month_history` | route/month | D1 | exists | Show source window and null months. |
| Hour/daypart profile | `route_daypart_profile` | route/daypart/month | D1/R2 | partial | Current hour bars are derived from v1 segments; replace with explicit profile. |
| Treatment inventory preview | `route_treatment_summary` | route/treatment/month | D1 | partial | Summary only; detail in Interventions. |
| Top issue tuple | `route_segment_topk` | route/segment/month | D1 | not_built | Needs min-sample gate. |

Claim posture: observed or proxy/provisional. Overview should never be causal by itself.

### Slow Segments Tab

Question:

> Where does the route lose the most time, and when?

Primary answer:

- Ranked segment rows by rider-hours lost, persistence, and treatment state.

| Need | Required read model/artifact | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Stable segment identity | route speed spine | route/segment | R2/D1 refs | partial | Must keep same segment across months before historical claims. |
| Segment current summary | `route_segment_summary` | route/segment/daypart/month | D1 | partial | Current v1 `segments` is enough for prototype, not final ranking. |
| Persistence | `route_speed_history` | route/segment/month/daypart | R2 | partial | Available where speed-history artifact exists. |
| Rider exposure | route/hour ridership allocation | route/segment/daypart | D1/R2 | partial | Must call it delay exposure, not stop-level passenger load. |
| Treatment flags | `route_treatment_summary` | route/segment/treatment | D1 | not_built | Bus-lane overlap is hypothesis/context until audited. |
| Evidence refs | `route_evidence_index` | route/evidence | D1 + R2 | not_built | Links to Evidence/Data Notes. |

Required rankings:

- rider impact;
- slowest with min sample gate;
- most persistent;
- untreated pain;
- worsening segment.

### Reliability Tab

Question:

> Do buses arrive predictably, and is the current signal trustworthy?

Primary answer:

- Excess wait, bunching, long gaps, sample coverage, and source provenance.

| Need | Required read model/artifact | Grain | Store | Current state | Empty state |
|---|---|---|---|---|---|
| KPI row | `route_reliability_summary` | route/month/run | D1 | not_built | Show unavailable or insufficient-sample row, not silence. |
| Distribution | `studio/v2/routes/{slug}/reliability-distribution.json` | route/run/headway bucket | R2 | not_built | Dense optional artifact. |
| Hour/daypart split | `route_reliability_daypart` | route/daypart/run | D1/R2 | not_built | Later than KPI row. |
| Schedule baseline | scheduled headway/span | route/direction/daypart | D1 | partial | Do not claim if GTFS coverage is current-only for the question. |
| Coverage card | source/run/sample/provenance | route/month/run | D1 | partial | Put details in Data Notes. |

Current UI does not mount this tab. Snapshot 2.0 should add the endpoint and data first, then mount
the tab.

### Riders Tab

Question:

> How many riders are affected, and where is rider delay concentrated?

Primary answer:

- Daily riders, route/hour boardings, ridership trend, and delay exposure.

| Need | Required read model | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Daily/average boardings | `route_kpi_summary` | route/month | D1 | partial | Current route detail carries one scalar. |
| Ridership history | `route_month_history` | route/month | D1 | exists | Null-aware; speed months and ridership months can differ. |
| Hour profile | `route_hourly_ridership_profile` | route/hour/month | D1/R2 | not_built | Source is boardings, not stop boardings. |
| Rider-hours lost | `route_segment_summary` | route/segment/daypart/month | D1 | partial | Use delay exposure wording. |
| Top rider-impact segments | `route_segment_topk` | route/segment/month | D1 | not_built | Shared with Slow Segments. |

Forbidden claim: segment passenger load. Use "allocated delay exposure" until a segment passenger
load source exists.

### Interventions Tab

Question:

> What priority tools are already in place, and where are the gaps?

Primary answer:

- Current treatment inventory and high-delay untreated areas.

| Need | Required read model/artifact | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Current inventory | `route_treatment_summary` | route/treatment/month | D1 | partial | Current UI derives from route/segments. |
| Bus-lane/TSP/ACE/ABLE refs | source-specific treatment rows | route/segment/treatment | D1 + R2 refs | partial | Keep source and method caveats. |
| Coverage bar/map | route-shape overlap + audited refs | route/segment | D1/R2 | partial | Route-shape overlap is not audited regulatory mileage. |
| Segment treatment table | `route_segment_treatment_summary` | route/segment/treatment | D1 | not_built | Powers gap ranking. |
| Evaluation readiness | event windows + peer cohort + coverage | route/treatment/event | D1 + R2 | not_built | Do not imply causal effect. |

The tab should be descriptive until a treatment/evaluation gate says otherwise.

### Timeline Tab

Question:

> What changed on or near this route, and what happened around those dates?

Primary answer:

- Reviewed dated events and their relationship to route history.

| Need | Required read model/artifact | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Timeline index | `route_timeline_index` | route/event | D1 | not_built | Stable event ids and status. |
| Timeline bundle | `studio/v2/routes/{slug}/timeline.json` | route/event/evidence | R2 | not_built | Dense source refs, snippets, caveats. |
| Operational date gates | Tier 2 operational-date assertions | event/date/source | pipeline artifact | partial | Need reviewed/promoted projection. |
| History overlay | `route_month_history` | route/month | D1 | exists | Descriptive only. |
| Before/after panels | evaluated event-study artifact | route/event/window | R2 | defer | Needs causal/peer gate. |

Current route detail has intervention records in the v1 payload. Treat them as prototype timeline
content until the route timeline index exists.

### Evidence And Data Notes Tab

Question:

> What source coverage and caveats travel with this route?

Primary answer:

- Surface availability, source coverage, caveats, and source-backed evidence refs.

| Need | Required read model/artifact | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Surface availability matrix | `surfaceFlags` + projection refs | route/release | D1 | exists | Use runtime status vocabulary. |
| Source coverage by family | `source_month_coverage` | source/month/route optional | D1 | exists | Must say blocked vs not fetched vs derived not built. |
| Route evidence cards | `route_evidence_index` | route/evidence | D1 + R2 | not_built | Stable public evidence ids required. |
| Tier 2 route evidence bundle | materialized vocab route bundles | route/source/surface | pipeline artifact -> R2 later | research_only | Do not expose raw surface ids publicly yet. |
| Caveats | route caveat rows | route/surface | D1/R2 | partial | User-facing wording. |
| Artifact refs | public API refs + hashes | route/artifact | D1 | partial | No private R2 keys as public contract. |

The new Tier 2 materialized views are the best current input for this tab, but the public contract
should be a stable evidence index, not the raw materialized JSON shape.

### `/compare` Compare Surface

Question:

> How are these routes different, are they comparable, and what explains the difference?

Primary answer:

- A/delta/B metrics plus peer context and evidence readiness.

| Section | Required read model/artifact | Grain | Store | Current state | Empty state |
|---|---|---|---|---|---|
| Pair header | `studio_route_index_v2` + peer cohort | route/pair | D1 | partial | Say if pair is not a good peer comparison. |
| KPI delta strip | `route_compare_metric` | route/month | D1 | partial | Current compare is v1 scalar diff. |
| Daypart profile | `route_daypart_profile` | route/daypart/month | D1/R2 | not_built | Row-level unavailable if one route lacks it. |
| Segment contrast | `route_segment_topk` | route/segment/month | D1 | not_built | Compare top-k, not all segments. |
| Reliability comparison | `route_reliability_summary` | route/month/run | D1/R2 | not_built | No reliability row means unavailable, not zero. |
| Treatment comparison | `route_treatment_summary` | route/treatment/month | D1 | not_built | Descriptive. |
| History comparison | `route_month_history` | route/month | D1 | exists | Needs min-history labels. |
| Evidence overlap | `route_evidence_index` + timeline refs | route/evidence | D1/R2 | not_built | Evidence readiness only after promotion. |

Do not precompute every possible pair. Build the response from compact route/cohort rows.

### Briefs, Findings, And Authoring Handoffs

Question:

> Which claims can be cited, reviewed, edited, or turned into a brief?

Primary answer:

- A stable evidence/ref layer that route pages, findings, and briefs share.

| Need | Required read model/artifact | Grain | Store | Current state | Notes |
|---|---|---|---|---|---|
| Finding cards | promoted finding index | finding/route | D1 + R2 packet refs | partial | Raw detector output is not public finding. |
| Brief evidence | evidence catalog | brief/claim/evidence | D1 + R2 | partial | Current brief evidence exists for brief workflows. |
| Route evidence handoff | `route_evidence_index` | route/evidence | D1 + R2 | not_built | Shared by route detail, briefs, findings. |
| Detector coverage/no-hit | `detector_public_coverage_summary` | route/detector/month | D1 | not_built | Lets "checked/no issue" differ from silence. |

## Research Lane: Opportunity Lab

The route-specific "interesting questions" layer should not be a public contract yet.

It is useful as a learning scaffold:

```ts
type RouteOpportunityLabRow = {
  rowId: string;
  scope: {
    routeIds: string[];
    segmentIds?: string[];
    months?: string[];
    eventIds?: string[];
    sourceIds?: string[];
  };
  questionText: string;
  whyInteresting: string;
  inputs: string[];
  claimPosture: "observed" | "hypothesis" | "review_needed" | "peer_adjusted" | "causal_gated";
  evidenceRefs: string[];
  caveats: string[];
  payload: Record<string, unknown>;
};
```

Rules:

- Do not mount this in the public UI yet.
- Do not add a hardcoded enum of "sign flips", "fingerprints", "decouplings", or similar examples.
- Let detectors, Tier 2 audits, and manual review dump loose candidates here.
- Review 50-100 real candidates before promoting a durable public `RouteInsightCandidate` contract.

This keeps the route page ready for route-specific intelligence without pretending we already know
the final taxonomy of interesting questions.

## Immediate Implementation Queue

1. DONE initial: Build `route_section_rank` from already-served data:
   - route index v2;
   - route history;
   - route summaries;
   - existing treatment/support flags;
   - source coverage.
2. DONE initial: Add `StudioRouteSectionsResponse`.
3. DONE initial: Serve `/routes` sections from D1/Worker without changing the route detail design.
4. Build `route_evidence_index` from the Tier 2 materialized vocab views:
   - start route-keyed and source-keyed;
   - mint stable public evidence ids;
   - preserve support/evidence pointer refs privately;
   - keep unresolved/preserve-raw review queues out of public responses.
5. Add route child endpoint contracts in this order:
   - `/routes/:routeId/segments`;
   - `/routes/:routeId/riders`;
   - `/routes/:routeId/reliability`;
   - `/routes/:routeId/timeline`;
   - `/routes/:routeId/evidence`.
6. Only after those exist, wire route tabs to child loaders and add the Reliability tab.

## Acceptance Checks

- Every public route page section maps to one row in this manifest.
- Every row has a grain and storage target.
- Every missing child surface has an explicit empty state.
- No public page depends on local artifact paths or raw Tier 2 surface ids.
- Route sections rank only routes that pass the section's min-coverage gate.
- Data Notes can explain every `partial`, `missing`, `upstream_blocked`, `downstream_blocked`, and
  `not_built` status shown elsewhere.
- The research/opportunity lane remains non-public until real candidates justify a schema.

## See Also

- [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]]
- [[wiki/engineering/website_data_expansion_plan|Website Data Expansion Plan]]
- [[wiki/engineering/serving_snapshot_2_full_route_baseline|Serving Snapshot 2.0 Full-Route Baseline]]
- [[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|Serving Snapshot 2.0 Visualization & Multi-Year Expansion]]
- [[wiki/engineering/tier2_processing_status_and_resume|Tier 2 Processing Status And Resume Runbook]]
