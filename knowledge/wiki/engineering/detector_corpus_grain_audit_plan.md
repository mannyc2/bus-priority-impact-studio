---
title: Detector Corpus Grain Audit Plan
type: engineering
status: draft
last_updated: 2026-06-01
owner: packages/analytics
source_count: 0
tags: [analytics, detectors, corpus, feature-store, grain, false-negatives]
---

# Detector Corpus Grain Audit Plan

## Purpose

This page turns the detector-corpus concern into an actionable audit.

The risk is not that detectors use derived data. The risk is that a shared derived artifact can
collapse route, segment, stop, direction, hour, event, and distribution axes before a detector has a
chance to look for patterns on those axes.

The desired detector corpus is therefore not raw source files and not one coarse route-month
projection. It is a local analytical corpus with multiple detector-native grains:

```text
raw/source captures
  -> normalized local DB tables
  -> enriched join tables
  -> detector-native feature tables/artifacts by grain
  -> detector candidates, evidence links, and coverage rows
  -> reviewed/promoted serving projections
```

## Core Decision

Detectors should work from the richest practical local analytical corpus, not directly from raw
artifacts and not primarily from `RouteMonthSignalFeature`.

`RouteMonthSignalFeature` remains valuable, but as a route-level screening and packet-context
artifact. It should not be the canonical substrate for discovery across all detector families.

Each detector version should declare:

- the feature grains it consumes;
- the local tables or artifacts that materialize those grains;
- the retained axes that can affect its result;
- the axes intentionally collapsed before scoring;
- the claim grain it emits;
- the evidence refs that preserve why the claim fired.

## Vocabulary

| Term | Meaning |
|---|---|
| Raw artifact | Immutable source capture or downloaded object under `knowledge/raw/` or source snapshots. |
| Normalized local mirror | SQLite table that keeps source-like rows after parsing, canonical IDs, and type coercion. |
| Enriched join table | Materialized expensive join, such as route-to-LION or context-event-to-route touches. |
| Detector-native feature grain | Typed detector input whose grain is chosen for one detector family, such as segment-daypart or stop-direction-hour. |
| Screening feature | Coarse feature that is useful for triage or packet context but not enough for fine-grain discovery. |
| Claim grain | The scope of the candidate claim, such as route-month, segment-daypart, or stop-direction-hour. |
| Evidence grain | The grain of rows or features referenced by evidence links to explain the candidate. |

## Current Audit Snapshot

Local inspection on 2026-06-01 used `data/local/pipeline.sqlite` and March 2026 release artifacts.
These counts are a local snapshot, not a public release guarantee.

| Surface | Current count / state | Grain implication |
|---|---:|---|
| `local_route_segment_speed` total | 17,473,351 rows | Rich local speed corpus exists. |
| `local_route_segment_speed` for 2026-03 | 470,462 rows | March speed evidence is far richer than route-month. |
| Distinct 2026-03 route/timepoint segments | 4,129 | Segment universe exists before top-candidate selection. |
| Distinct 2026-03 segment/day/hour cells | 457,422 | Direction, day-of-week, and hour are locally available. |
| `local_route_month_trend` for 2026-03 | 350 rows | Useful route-month summary, but a large collapse from speed rows. |
| `local_route_hotspot` for 2026-03 | 3,097 rows | Segment candidates are capped; median and max route both have 10 rows. |
| `signal-features.json` for 2026-03 | 381 route-month features | 350 computable, 31 missing speed. Screening-level corpus. |
| `local_route_observed_reliability_summary` for 2026-03 | 381 rows | Route-level reliability summary. |
| 2026-03 observed reliability sample support | 2,604,283 samples | Route summaries collapse millions of headway samples. |
| 2026-03 stop-direction-hour EWT artifacts | 650,008 features | Detector-grade reliability grain exists as artifacts and now feeds March detector runs. |
| 2026-03 EWT ready features | 13 ready features | Feature readiness is visible and gates most rows into explicit skipped/missing states. |
| 2026-03 detector candidates | 982 candidates across 14 detector families | Existing March pass is detector-output state, not corpus. |
| 2026-03 detector evidence links | 4,098 links | Packet evidence exists for candidate-bearing detector families. |
| 2026-03 detector coverage rows | 1,322,549 rows | Coverage rows are valuable, but only for materialized detectors. |
| Registry vs March packet coverage | 18 registered; 14 packetized; 14 complete, 0 partial; 4 no candidates | Orchestration/materialization drift and packet completeness drift are visible. |

## Audit Findings

### 1. Derived Data Is Necessary

There are real reasons to derive detector inputs:

- source row parsing and schema validation;
- stable route, stop, month, and timezone normalization;
- expensive spatial joins such as route-to-LION and context-event-to-route touches;
- source freshness, join confidence, sample support, and coverage facts;
- reproducible historical windows and detector-version baselines;
- performance and idempotence for release reruns.

This is healthy. `local_context_event_route_touch` is the best current pattern: it materializes a
costly join while preserving event id, route id, time, physical id, touch kind, fanout, and match
weight.

### 2. Coarse Shared Features Are Not Enough

`RouteMonthSignalFeature` carries route/month/window fields such as aggregate speed, hotspot count,
permit/context counts, sample support, uncertainty, provenance, and coverage. That is useful for
route-level screening and review-packet context.

It is too coarse for discovery patterns that depend on:

- segment or corridor location;
- direction;
- day of week;
- hour or daypart;
- stop-level headway behavior;
- event timing overlap;
- distribution shape;
- near-miss ranking below top-k truncation.

### 3. The Local DB Already Preserves Richer Grains

The local DB stores detector-relevant grains that are much closer to source data:

- `local_route_segment_speed`: route, month, day-of-week, hour, direction, timepoint pair, speed,
  travel time, road distance, and trip count.
- `local_observed_headway_sample`: route, stop, direction, vehicle-pair timestamps, and headway.
- `local_context_event`: event id, source id, event kind, timestamp, location, route id when
  direct, and payload.
- `local_context_event_route_touch`: joined event-route evidence with fanout and match weight.
- `local_route_hourly_ridership`: route, month, day-of-week, hour ridership and transfers.
- `local_route_intervention_comparison` and Tier 2 intervention records for treatment panels.

The issue is not absence of local detail. The issue is making the right grains first-class detector
inputs and gating detector runs on their materialization coverage.

### 4. Some Better Grains Already Exist, But Are Not Yet The Default Detector Substrate

Current or emerging feature paths include:

- `build segment-daypart-history`, which aggregates speed at route, month, segment, direction, and
  daypart.
- `build stop-direction-hour-ewt-features`, which reads observed headways and schedules to emit
  stop-direction-hour EWT features with readiness audit rows.
- `build intervention-panel`, which materializes treatment/event comparison panels.
- `build detector-score-vectors` and `evaluate detectors`, which can score detector families once
  materialization exists.

These are the right direction: derived, typed, reproducible, and detector-shaped without forcing
everything through route-month.

### 5. The Findings Orchestration Is Behind The Analytics Registry

`packages/analytics` currently registers 18 detector families. March 2026 now packetizes every
local candidate-bearing detector family, including the first registry-run reliability, schedule,
runtime-variability, and degradation detectors. The release has 14 detector families with March
candidates and 14 with complete packet coverage. Four registered families still have no March
candidates or have not been materialized into local findings tables.

That makes the corpus-grain work partly an orchestration problem: the registry declares richer
detectors and feature grains, but the release findings pass has not fully moved to registry-driven
feature materialization and execution. The new review-packet coverage artifact helps distinguish
three cases that used to blur together: registered detectors with no materialized candidates,
candidate-bearing detectors with complete packets, and candidate-bearing detectors with packet
lineage gaps. `source_gap` now has a packet-coverage waiver for absent counter-evidence because it
is a data-quality detector with missing-data evidence; it remains blocked from promotion as a
service-performance finding.

## Target Detector Corpus

The detector corpus should be a set of strata, not one artifact.

| Layer | Role | Examples |
|---|---|---|
| Normalized source mirrors | Preserve source-like facts after parsing and canonical IDs. | `local_route_segment_speed`, `local_observed_headway_sample`, `local_route_hourly_ridership`, GTFS static tables. |
| Enriched joins | Cache expensive joins while retaining uncertainty. | `local_route_lion_link`, `local_context_event_route_touch`, parking matches. |
| Detector-native feature grains | Give detector families typed arrays with their required axes. | segment-daypart, stop-direction-hour, route-direction-daypart, route metric history, intervention panel, source coverage. |
| Screening summaries | Support triage, packet context, and route-level overview. | `RouteMonthSignalFeature`, route scorecards, observed reliability summaries. |
| Detector outputs | Candidate findings plus evidence, coverage, and review state. | `local_finding_candidate`, `local_finding_evidence_link`, `local_finding_coverage_audit`. |
| Serving projection | Public compact release state. | D1/R2 Studio routes, briefs, findings, map objects. |

Only the first four layers are detector corpus. Detector outputs and serving projections are not
detector inputs except for evaluation, dedupe, and review-memory workflows.

## Grain Policy

1. A detector may consume coarse features only when its analytical question is coarse.
2. A detector should not consume a feature that collapsed an axis that could change the detector's
   answer.
3. A materializer may aggregate, but it must declare retained axes, collapsed axes, sample support,
   provenance, and coverage.
4. Top-k candidate lists are not a safe detector corpus. Materialize the considered universe first,
   then rank candidates.
5. A clean no-hit is meaningful only at the same grain the detector evaluated.
6. Route-month outputs are acceptable; route-month-only inputs are not acceptable as a default.

## Detector Family Audit Matrix

| Detector family | Current risk | Target corpus view | First audit question |
|---|---|---|---|
| Source/feed sufficiency | Mostly healthy, but tied to release rows. | Source coverage and feed-health features by route/source/month plus global source freshness. | Does every downstream detector inherit source-gap states instead of treating missing data as clean? |
| Persistent speed hotspot / delay concentration | Existing hotspot table is capped and month-aggregated. | Full segment universe from `local_route_segment_speed`, plus segment-daypart/history features. | Were all route segments considered, or only top-k stored hotspots? |
| Speed/pace hotspot | Newer registry detector needs segment-daypart/free-flow features. | Segment-daypart and segment-history features with free-flow baseline. | Is direction/daypart retained through scoring and evidence refs? |
| Observed reliability summary | Route-month summary hides stop/hour distribution. | Keep route-month summary for public claim, but pair with stop-direction-hour EWT/bunching evidence. | Which stop/hour/direction cells drove the route-level reliability score? |
| Headway EWT and bunching | Feature artifacts exist but are not release-default detector corpus. | Stop-direction-hour EWT features with schedule baselines and feed-health quality. | Which routes have ready features, and which missing-data states block the rest? |
| Rider-weighted excess wait | Ridership is route-hour proxy, not stop-level APC. | Stop-direction-hour reliability plus route-hour ridership proxy, clearly labeled. | Is the rider weighting claim scoped as proxy exposure rather than measured stop load? |
| Travel-time variability / schedule mismatch | Needs route-direction-daypart runtime/schedule deltas. | Route-direction-daypart features and schedule baselines. | Are schedule versions and direction/daypart retained? |
| Degradation trend / positive deviance | Needs historical windows and peer definitions. | Route metric history plus peer/seasonal baselines. | Is the historical window complete enough and is route-version drift visible? |
| Intervention gap / underperformance / event study | Current inputs risk summarizing treatment and pain too early. | Intervention panel rows with event ids, pre/post windows, comparison routes, caveats, and Tier 2 refs. | Does the detector distinguish treatment inventory, current pain, and effect estimate? |
| Permit / 311 context | Route-month counts are only triage. | Event-route-touch rows with time windows, source ids, fanout, match weight, and optional segment/corridor alignment. | Are context events time-aligned with the performance window or just counted in the month? |

## Finding Archetype: Context-Event Externality Reversal

This archetype captures a class of findings where a normally harmful context event appears to
improve bus performance on a specific segment because the local binding constraint differs from the
network average. It should be written and detected generically. Do not encode route names, streets,
or fabricated examples as factual claims.

The full finding is a packet assembled from several detector families, not one monolithic detector:

| Component | Generic finding the system should support | Required corpus grain |
|---|---|---|
| Episodic pulse | A segment, stop, or short corridor has repeated short performance improvements or degradations that are too brief for route-month trend detectors. | Segment/daypart or stop-direction-hour time series with event-date resolution. |
| Misattribution guard | A known agency intervention is temporally near the anomaly but cannot explain its size, timing, or pre-period recurrence. | Intervention panel/event-study grain with pre/post windows and comparison scopes. |
| Context-event association | Most pulses overlap with a filed context event window, such as a permit, enforcement operation, construction stage, parade/street activity, or special curb regulation. | Event-route-touch rows with event id, source id, effective timestamps, geometry/join confidence, and route/segment fanout. |
| Externality reversal | The same event class has one sign network-wide but the opposite sign on a specific segment or segment class. | Network-level and segment-level treatment-effect summaries with comparable controls. |
| Mechanism support | An independent mechanism signal moves in the direction the hypothesis requires, such as blocked-stop complaints falling, curb occupancy changing, or dwell/merge delay changing. | Context source features and metric evidence at the same segment/time window as the pulse. |
| Placebo and demand checks | Nearby or matched segments do not show the same pulse, and ridership/boarding proxies do not move enough to explain the performance change. | Matched segment controls, route/hour ridership proxies, weather/holiday/day-of-week controls. |
| Falsifiable follow-up | The packet proposes a future timestamped test where the same mechanism should produce a discontinuous metric change. | Prospective event windows and pre-registered metric/secondary-signal thresholds. |

The safe claim form is:

```text
On this segment and time window, a context event appears associated with a performance improvement
because it plausibly removed the local binding constraint. This is a review candidate, not proof of
causality, until the mechanism signal, placebos, and a prospective test pass.
```

The detector stack should not claim:

- the event class is beneficial network-wide;
- the context event caused the improvement without mechanism and placebo support;
- the same treatment should be applied elsewhere without checking the local constraint;
- a monthly route-level summary is sufficient evidence for an episodic event-window effect.

This archetype is a concrete reason `route_month` screening features are insufficient. A single
month can hide a 1-4 day pulse, average opposite-sign effects together, or assign credit to the
wrong intervention. The necessary corpus is segment/time-window performance plus timestamped
context events and independent mechanism evidence.

## Phase 0 Status

Phase 0 is implemented as a repeatable pipeline-v2 audit command:

```sh
bun --filter @bp/pipeline-v2 cli -- audit detector-corpus-grain \
  --year 2026 \
  --month 3 \
  --history-start-month 2023-04 \
  --run-id bus-observatory-2026-03 \
  --data-product-completeness data/artifacts/data-product-completeness/2023-04_to_2026-03/bus-observatory-2026-03/completeness.json
```

The command writes:

```text
data/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.json
data/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.md
```

The artifact joins three things:

- `ANALYTICS_DETECTOR_REGISTRY` detector ids, versions, claim tiers, scopes, and feature grains;
- `DATA_PRODUCT_MANIFEST` products that materialize or support those grains, optionally annotated
  with `audit data-product-completeness` status;
- release-month `local_finding_candidate` and `local_finding_coverage_audit` counts when the
  detector has actually run into the local findings tables.

For the March 2026 snapshot generated on 2026-06-01:

| Result | Count | Meaning |
|---|---:|---|
| Registered detectors audited | 18 | Every analytics registry detector now has a corpus-grain row. |
| Product-mapped corpus-complete detectors | 18 | Required data products mapped by the audit were complete in the supplied completeness artifact. |
| Detectors using `route_month` screening grain | 5 | These remain the largest false-negative/granularity review targets. |
| High granularity-risk detectors | 5 | Same five detectors because `route_month` collapses segment, direction, stop, hour, and event timing axes. |
| Detectors with March coverage rows | 14 | Registry-run detectors now add EWT, bunching, schedule mismatch, travel-time variability, and degradation-trend coverage rows. |
| Candidate-bearing detectors with complete packets | 14 | Every March candidate-bearing detector has a review packet and coverage row. |
| Route-month policy warning detectors | 5 | Every current `route_month` detector now has an explicit reclassification. |
| Release-gate warnings | 16 | `speed_pace_hotspot` now passes its corpus release gate; remaining warnings are detector-specific score-vector and/or shadow-audit work. |
| Release-gate blocks | 0 | No mapped corpus grain is currently missing or blocked in the supplied completeness artifact. |
| False-negative shadow audits required | 12 | Route-month and medium-risk detectors need richer-grain shadow audits before clean no-hits become detector-quality negatives. |

Important interpretation: `complete` in the Phase 0 artifact means "mapped corpus products are
present", not "the detector has executed or cannot miss findings." Execution coverage is still
separate, and the artifact now makes that gap visible.

## Phase 1-7 Control Plane Status

The audit now carries explicit release checks for the seven immediate actions requested after this
plan review. This does not mean every detector has full detector-native math yet; it means the
control plane now records the missing work as structured pass/warn/block state instead of relying on
side-channel notes.

| Requested action | Current implementation |
|---|---|
| 1. Ratify and enforce grain policy | Feature-grain profiles classify every declared detector input as detector-native, screening, source-health, or unknown, with retained/collapsed axes and granularity risk. |
| 2. Reclassify route-month use detector by detector | Detectors using `route_month` now receive a `routeMonthPolicy` release check with an explicit classification and rationale. |
| 3. Run all 18 detectors into coverage/audit outputs | The audit has an `executionCoverage` check for every registered detector and warns when release-month coverage rows are absent. Fourteen registered detectors now have March coverage rows. |
| 4. Build detector-specific historical score-vector paths | The audit emits a `scoreVectorExpectation` warning for each detector-native grain until a detector-specific historical vector exists. EWT and `speed_pace_hotspot` now have detector-specific historical vectors; the generic score-vector artifact keeps all registered detectors visible and now contains 1,322,549 release coverage entries. |
| 5. Build reviewer-labeled negatives and near-miss queues at the same grain | The evaluation-label artifact now marks derived clean no-hit negatives with `grainSafety`, so route-month screening negatives require review/shadow-audit before being treated as detector-quality negatives. |
| 6. Add false-negative shadow audits over richer grains | The audit emits `falseNegativeShadowAudit.required` for route-month and medium-risk detector grains until richer-grain shadow audits exist. A general route-month shadow audit now exists and is consumed by the grain audit, so route-month screening detectors carry measured hidden-route/candidate counts instead of an unavailable-shadow warning. Medium-risk detector grains still need detector-specific shadow audits. |
| 7. Add stability and release gates | The audit emits a per-detector `releaseGate`; the detector evaluation harness consumes the grain audit and adds grain-policy flags and clean-no-hit grain gates to scorecards. |

## Registry-Driven Detector Execution Bridge

The first end-to-end bridge from registry metadata to detector-native execution used
`speed_pace_hotspot` because it consumes `segment_daypart`, a grain that preserves route, month,
direction, segment, and daypart instead of collapsing immediately to route-month. The same runner
now also supports stop-direction-hour reliability, route-direction-daypart runtime, and route
metric-history detectors.

Implemented pilot pieces:

- `packages/analytics/src/features/contracts.ts` declares feature contracts for every registry
  feature grain, including retained axes, collapsed axes, required fields, quality fields, and
  materialization source.
- `tools/pipeline-v2/src/lib/speed-pace-feature-resolver.ts` resolves
  `local_route_segment_speed` rows into typed `SegmentDaypartFeature` inputs.
- `findings run-detector` runs a registered detector through its feature contracts and can write
  candidates, evidence links, and coverage rows to the local findings tables.
- `build speed-pace-score-vectors` creates a detector-specific 36-month historical score-vector
  artifact for `speed_pace_hotspot`.
- `audit speed-pace-shadow` compares route-month clean no-hits from the older route-level speed
  detector against segment/daypart `speed_pace_hotspot` candidates.
- `audit route-month-shadow` compares route-month clean no-hits from route-level detectors against
  richer-grain candidates across speed, reliability, schedule, variability, and trend detectors.
- `evaluate detectors` consumes the speed/pace historical vector for calibration stability.

March 2026 pilot output:

| Artifact / command | Result |
|---|---:|
| `findings run-detector` resolved features | 13,928 segment/daypart features |
| `findings run-detector` selected candidates | 100 candidate hotspots |
| `findings run-detector` coverage rows | 13,928 hit/clean/skipped rows |
| `build speed-pace-score-vectors` usable months | 36 |
| `build speed-pace-score-vectors` total features | 520,810 |
| `build speed-pace-score-vectors` total candidates | 3,600 |
| `audit speed-pace-shadow` hidden route-month clean routes | 22 |
| `audit speed-pace-shadow` hidden segment/daypart candidates | 88 |

Additional March 2026 registry-detector executions:

| Detector | Feature grain | Feature rows | Candidates | Coverage rows | Main caveat |
|---|---|---:|---:|---:|---|
| `headway_reliability_ewt` | stop-direction-hour | 650,008 | 2 | 650,008 | Most cells are explicit skipped/missing states because schedule baselines, sample counts, or coverage are unavailable. |
| `bunching_hotspots` | stop-direction-hour | 650,008 | 1 | 650,008 | Most cells lack enough headway pairs or schedule baselines. |
| `schedule_mismatch` | route-direction-daypart | 2,537 | 100 | 2,537 | Schedule baselines are available for most, but not all, observed runtime cells. |
| `travel_time_variability` | route-direction-daypart | 2,537 | 100 | 2,537 | Low observed-runtime sample cells are skipped explicitly. |
| `degradation_trend` | route metric history | 365 | 6 | 365 | Short or low-coverage histories remain skipped. |

Route-month shadow audit output:

| Artifact / command | Result |
|---|---:|
| `audit route-month-shadow` route-month clean-no-hit routes | 350 |
| `audit route-month-shadow` hidden routes | 112 |
| `audit route-month-shadow` hidden richer-grain candidates | 1,142 |

Interpretation: the pilot has become a reusable execution bridge. A detector can declare its feature
grain, resolve a detector-native corpus, emit local finding coverage, build score-vector/evaluation
surface, run false-negative shadow audits, and show up in the evaluation harness without collapsing
the discovery problem to route-month. The remaining work is to make this bridge cover the four
registered detectors that still have no March candidate surface and to add detector-specific
historical vectors beyond EWT and speed/pace.

Current route-month reclassification:

| Detector | Classification | Required follow-up grains |
|---|---|---|
| `multi_month_speed_peer` | `route_level_allowed_with_shadow_audit` | `route_metric_history`, `segment_daypart` |
| `intervention_gap` | `screening_only_requires_detector_native_followup` | `intervention_panel`, `segment_daypart` |
| `intervention_underperformance` | `replace_primary_route_month_grain` | `intervention_panel`, `route_metric_history` |
| `permit_correlated_slowdown` | `replace_primary_route_month_grain` | `event_route_touch_window`, `segment_daypart` |
| `service_request_context` | `replace_primary_route_month_grain` | `event_route_touch_window`, `segment_daypart` |

## Implementation Plan

### Phase 0 - Registry And Corpus Audit (complete)

`audit detector-corpus-grain` creates a detector-corpus manifest generated from the analytics
registry and data-product registry. For each detector, it records:

- detector id and version;
- declared feature grains;
- materialized local DB tables/artifacts;
- retained axes;
- collapsed axes;
- expected universe count;
- materialized universe count;
- candidate count;
- clean no-hit count;
- missing-data count.

It also classifies each feature grain as detector-native, screening, source-health, or unknown and
assigns a coarse granularity-risk flag (`low`, `medium`, `high`, or `unknown`) based on retained and
collapsed axes.

### Phase 1 - Reclassify `RouteMonthSignalFeature` (control-plane implemented)

Document and enforce `RouteMonthSignalFeature` as:

- screening;
- packet context;
- route-level detector input only for route-level detectors;
- not the default feature input for segment, stop-hour, context-timing, or intervention-effect
  detectors.

The enforcement now starts as an audit release check in `grain-audit.json` and a visible table in
`grain-audit.md` for detectors using the `route_month` feature grain. Route-month remains allowed
for route-level screening and packet context, but the audit now records when detector-native
follow-up grains or shadow audits are required before treating no-hit rows as detector-quality
evidence.

### Phase 2 - Materialize Detector-Native Feature Grains

Prioritize the grains that reduce the largest false-negative risk:

1. Segment-daypart/history from `local_route_segment_speed`.
2. Stop-direction-hour EWT/bunching from `local_observed_headway_sample` plus schedules.
3. Event-route-touch context windows from `local_context_event_route_touch`.
4. Intervention panels from `local_route_intervention_comparison`, `local_intervention_event`, and
   Tier 2 intervention records.
5. Route metric history and peer baselines.

Each materializer should emit coverage rows, not just feature rows.

### Phase 3 - Rebuild Findings Execution Around The Registry

Port or replace the deferred deterministic findings path so pipeline-v2 can:

- list registered detectors from `ANALYTICS_DETECTOR_REGISTRY`;
- resolve each detector's declared feature grains to materialized corpus products;
- block, warn, or lower claim strength when grains are missing;
- run detectors over typed feature arrays;
- write candidates, evidence links, coverage audits, review packets, and score vectors.

This should retire hard-coded 8-detector March assumptions and make unmaterialized registry
detectors visible as blocked/partial, not absent.

### Phase 4 - Add False-Negative Audits

For each detector family, add one shadow audit over a richer grain than the production detector
currently uses.

Examples:

- compare route-month speed candidates to top segment-daypart residuals;
- compare route-level reliability candidates to stop-direction-hour EWT/bunching candidates;
- compare monthly permit/311 counts to event-time-window overlap with speed/reliability pain;
- compare top-k hotspot candidates to the full segment universe for near-miss omissions.

The output should identify likely missed findings, not auto-promote them.

### Phase 5 - Promote Grain Gates Into Release Checks

After the audit stabilizes, release evaluation should fail or warn when:

- a detector claims a fleet universe but only has partial feature materialization;
- a clean no-hit is emitted at a coarser grain than the detector question;
- a detector consumes a screening feature where a detector-native grain exists;
- top-k truncation happens before detector scoring;
- evidence refs do not preserve the dimensions that caused the score.

Initial release checks are now emitted by `audit detector-corpus-grain` and consumed by
`evaluate detectors`. The current gate is warn-heavy by design: it blocks missing/blocked corpus
grains, warns on route-month policy issues, warns on absent execution coverage, warns on absent
detector-specific score vectors, and warns when false-negative shadow audits are still required.

## Definition Of Done

This plan is complete when:

1. Every registered detector has a corpus-grain row in the audit artifact.
2. Every detector input grain has materialization coverage by release month and history window.
3. `RouteMonthSignalFeature` is explicitly marked screening or route-level only.
4. Segment, stop-hour, context-event, and intervention detectors no longer depend on route-month
   screening features as their primary substrate.
5. Evaluation packets distinguish unmaterialized detectors from clean no-hit detectors.
6. Review packets carry evidence refs at the grain that actually drove the finding.

## Related Pages

- [[wiki/engineering/analytics_architecture|Analytics Architecture]]
- [[wiki/engineering/analytics_corpus_profile|Analytics Corpus Profile]]
- [[wiki/engineering/detector_evaluation_harness_plan|Detector Evaluation Harness Plan]]
- [[wiki/engineering/information_richness_audit|Information Richness Audit]]
- [[wiki/analysis/ideal_detector_system|Ideal Detector System]]
- `docs/architecture/data-corpus-overview.md`
