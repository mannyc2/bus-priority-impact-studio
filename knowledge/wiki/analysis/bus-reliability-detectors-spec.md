---
title: Bus Reliability Detectors Spec
type: analysis
status: draft
last_updated: 2026-05-30
owner: packages/analytics
source_count: 24
tags: [analytics, detectors, reliability, gtfs-rt, literature-review, planning]
---

# Bus Reliability Detectors Spec

## Purpose

This page converts the 2023-2026 bus-reliability literature review supplied on 2026-05-30 into an
engineering plan for `packages/analytics`.

The research direction is clear: the strongest detector additions are deterministic, auditable
screening tools over GTFS, GTFS-RT, AVL-like observations, route/segment speed data, intervention
inventories, and source-health records. They should improve the detector layer without moving
orchestration, persistence, live source collection, app serving, or LLM/agent behavior into
`@bp/analytics`.

This page is the incorporation plan and implementation ledger for the literature-driven reliability
work. R0-R6 are now implemented in `@bp/analytics`; the remaining work is integration in the
pipeline and review tooling that consumes these pure library outputs. The sources named below were
provided in the research brief; this pass did not independently re-verify every URL.

## Research Doctrine

The detector architecture should absorb these principles:

- Prefer rider-experienced metrics over operator-centric on-time percentage. Excess Wait Time
  (EWT), average wait time, scheduled wait time, headway coefficient of variation, bunching/gap
  shares, and travel-time buffer indices are more relevant to riders than raw OTP alone.
- Separate systematic degradation from stochastic variation. A slow but consistent segment points
  toward schedule, design, or infrastructure review; a high-variance segment points toward
  operations/control review.
- Keep all detector math deterministic and reviewable. LLMs may draft language or propose
  hypotheses outside analytics, but metrics, thresholds, evidence, and coverage are code outputs.
- Every finding needs evidence, counter-evidence, coverage, sample support, caveats, baseline
  metadata, detector version, and missing-data states where applicable.
- Missing data must never score as "no issue." Low sample count, stale feed, weak spatial join,
  missing scheduled baseline, and insufficient history are first-class outcomes.
- Context sources such as 311, permits, collisions, traffic, and weather are context signals, not
  operational causes.
- Causal/effect language is gated. Before/after, DiD, ITS, event-study, and synthetic-control
  outputs may create review candidates, but no automated detector may publish "caused by" claims.

## Current Analytics Audit

The current `@bp/analytics` package already provides a useful base:

| Current detector | Research family overlap | Keep / change |
|---|---|---|
| `source_gap` | Source quality / feed health | Keep and evolve into the coverage authority that other reliability detectors consume. |
| `persistent_speed_hotspot` | Speed / pace hotspot | Keep, but split level and variability once segment-daypart traversal features exist. |
| `delay_concentration` | Segment speed/pace decomposition | Keep, but add free-flow pace and systematic/stochastic evidence fields before stronger claims. |
| `multi_month_speed_peer` | Route/segment degradation trend | Keep as peer/persistence screen; add own-history trend math before treating it as trend detection. |
| `observed_reliability` | Headway reliability / excess wait | Keep as route-month reliability screen; add EWT/cv_h and stop-direction-hour evidence. |
| `intervention_gap` | High-pain route with missing treatment evidence | Keep as inventory/evidence-gap detector; not an impact detector. |
| `intervention_underperformance` | Intervention association | Keep as cautious current-pain + comparison screen; add formal event-study gates before effect language. |
| `permit_correlated_slowdown` | Context-correlated disruption | Keep context-only language; never promote permits to cause without review. |
| `service_request_context` | Context-correlated disruption | Keep context-only language and strengthen reporting-bias caveats. |

Current architecture support:

- `core/` has stable IDs, number helpers, scoring, evidence, coverage, and detector output contracts.
- `features/` has initial route-month, segment-month, reliability, intervention-window, context,
  and source-coverage contracts.
- `baselines/` has distribution, peer, historical delta, intervention-window delta, and
  source-coverage primitives.
- `registry/` registers all current detectors with specs, feature grains, scope, version, and run
  function.
- `calibration/` has score-vector, overlap, gold-set, and reviewer-decision primitives.

Architecture gaps closed by this refactor:

- EWT, headway-cv/LOS, bunch/gap, buffer-index, runtime-deviation, pace-slowness, robust-z,
  Theil-Sen, bootstrap, segmented-regression, and range-precision/recall helpers exist.
- The detector registry now carries claim tiers, baseline families, promotion gates, missing-data
  states, evidence schema versions, and retirement status.
- Detector lifecycle helpers now support version comparison, confirmed-rate summaries, retirement
  recommendations, and false-positive root-cause summaries.
- The remaining gap is outside `@bp/analytics`: pipeline/review tooling must persist gold sets,
  false-positive registers, and detector retirement logs.

## Incorporation Strategy

Do not add all 11 detector families at once. Build the missing feature/baseline substrate first,
then turn on detectors in an order that maximizes confidence and minimizes causal overreach.

Recommended order:

1. Source quality and reliability feature contracts.
2. Headway/EWT and bunching descriptive detectors.
3. Speed/pace and travel-time variability upgrades.
4. Schedule mismatch and degradation trend detectors.
5. Context-correlation refactor over existing permit/311 detectors.
6. Intervention event-study/ITS scaffolding with hard promotion gates.
7. Positive deviance after peer covariates and calibration are good enough.
8. Rider-weighted EWT as an experimental associational detector with APC/ridership coverage gates.

## Detector Map

| Research detector | Analytics action | Feature grains | Baseline / method | Claim tier |
|---|---|---|---|---|
| `source_quality` | Extend `source_gap`; make it the explicit coverage authority. | `source_coverage`, feed-day, route-day | Feed SLA, historical coverage, validator issue counts | D |
| `headway_reliability_ewt` | Implemented as a descriptive detector; later decide whether `observed_reliability` aggregates it. | `stop_direction_hour`, `feed_health` | Schedule SWT, cv_h LOS | D |
| `bunching_hotspots` | Implemented as a descriptive detector; route-month summaries can remain supporting evidence. | `stop_direction_hour`, `feed_health` | Scheduled headway, pairwise headway ratio | D |
| `speed_pace_hotspot` | Implemented as a descriptive segment-daypart detector; keep legacy hotspot detector for compatibility. | `segment_daypart`, `feed_health` | Free-flow pace, systematic/stochastic split | D |
| `travel_time_variability` | Implemented as a descriptive route-direction-daypart detector. | `route_direction_daypart`, `feed_health` | P95-vs-P50 buffer index | D |
| `schedule_mismatch` | Implemented as a descriptive route-direction-daypart detector with neutral schedule-review language. | `route_direction_daypart`, `feed_health` | GTFS scheduled runtime vs observed median runtime | D |
| `degradation_trend` | Implemented as a sibling detector over metric-history rows. | `route_metric_history`, `feed_health` | Rolling own-history, robust z, Theil-Sen slope | A |
| `context_correlation` | Implemented as shared context-association helper used by permit and 311 detectors. | route-month, context-source | Performance signal + context volume/join quality | A only |
| `intervention_event_study` | Implemented as an associational detector over intervention panels with candidate-causal gates in evidence only. | `intervention_panel`, `route_metric_history` | Pre/post, controls, ITS fields, matched peers, optional synthetic control | A/C gated |
| `positive_deviance` | Implemented over explicit peer-residual and reciprocal-check feature rows. | `positive_deviance`, `feed_health` | Peer group, top-decile percentile, residual model | D |
| `rider_weighted_excess_wait` | Implemented as an experimental associational detector; suppresses scoring when ridership/APC proxy quality is weak. | `rider_weighted_excess_wait`, `feed_health` | EWT weighted by boardings/APC proxy, top-percentile exposure | A |

Claim tiers:

- D: descriptive; auto-run and safe to publish with caveats when coverage gates pass.
- A: associational; auto-run but publish only with explicit association language and caveats.
- C: candidate-causal-needs-review; auto-run compute is allowed, but effect/causal language requires
  human methodology approval.

## Feature Contract Additions

Add these feature grains to `@bp/analytics/features` before implementing the new detectors:

| Feature grain | Required fields | First consumers |
|---|---|---|
| `stop_direction_hour` | route id, stop id/name, direction, local date/hour, scheduled headway, observed headways, n pairs, coverage, freshness, min sample status | EWT, bunching |
| `segment_daypart` | route id, segment id, direction, daypart, traversal count, median speed/pace, free-flow pace, IQR or P95-P50, spatial confidence, min segment length | speed/pace hotspot, travel-time variability |
| `route_direction_daypart` | route id, direction, daypart, scheduled runtime/headway, observed runtime percentiles, trip count, service-pattern version | schedule mismatch, travel-time variability |
| `route_metric_history` | scope id, metric name, monthly values, route-version markers, coverage by month | degradation trend, positive deviance |
| `intervention_panel` | event id, treated scope, pre/post windows, candidate controls, control eligibility, pre-trend support, placebo support | event study / ITS |
| `feed_health` | source id, scope, expected records, observed records, freshness lag, validator issue counts, maintenance flags | source quality |
| `positive_deviance` | scope id, metric, peer group, peer count, covariates, period values, performance percentile, adjusted residual, reciprocal warnings, coverage | positive deviance |

Every row must carry coverage, freshness, and sample-support fields. A feature below its contract
threshold should produce an explicit missing-data state downstream.

## Baseline And Calibration Additions

Add pure helpers in `@bp/analytics/baselines` and `@bp/analytics/calibration`:

| Helper | Purpose | Tests |
|---|---|---|
| `scheduledWaitTime(busesPerHour)` | SWT = 30 / scheduled buses per hour | Worked examples and zero/invalid guards |
| `averageWaitTime(headways)` | AWT = sum(h_i^2) / (2 * sum(h_i)) | TfL-style worked example |
| `excessWaitTime(headways, busesPerHour)` | EWT = AWT - SWT, floored or reported with caveat | Formula, low sample gates |
| `headwayCoefficientOfVariation` | TCQSM cv_h LOS bands | LOS boundary tests |
| `headwayIrregularityRates` | bunch and gap shares from observed/scheduled headway ratios | Synthetic regular/bunched sequences |
| `bufferIndex` | (P95 - P50) / P50 | Percentile fixtures and outlier sensitivity |
| `runtimeDeviation` | observed runtime / scheduled runtime, signed percentage | Tight/loose schedule fixtures |
| `paceSlownessIndex` | median pace / free-flow pace | Free-flow and invalid-baseline guards |
| `robustZScore` | median/MAD anomaly scoring | MAD zero and synthetic outlier tests |
| `theilSenSlope` | robust monotonic trend slope | Synthetic trend/no-trend tests |
| `bootstrapInterval` | deterministic confidence intervals with seed | Seeded reproducibility tests |
| `segmentedRegressionSummary` | ITS level/slope screening fields | Simulated intervention fixtures |
| `rangePrecisionRecall` | window-detector validation | Labeled range overlap tests |

Use fixture-backed tests and deterministic seeds. Do not add Python or external statistics runtimes.

## Registry Additions

Extend the analytics registry metadata before adding many new detectors:

- `claimTier`: `descriptive`, `associational`, or `candidate_causal_needs_review`.
- `baselineFamilies`: schedule, own-history, free-flow, fleet-distribution, peer, source-coverage,
  intervention-window, control-routes, synthetic-control.
- `promotionGates`: plain data structure describing sample, coverage, pre-trend, placebo, and
  reviewer gates.
- `missingDataStates`: declared strings the detector may emit.
- `evidenceSchemaVersion`: version for evidence payload shape.
- `retirementStatus`: active, experimental, deprecated, retired.

Keep existing `FindingDetectorSpec` compatibility while adding analytics-only metadata. If the
domain artifact needs these fields later, promote them through `@bp/domain` deliberately.

## Implementation Phases

### Phase R0 - Documentation And Registry Shape

- Add this page to the wiki index.
- Link this plan from [[wiki/engineering/analytics_architecture|Analytics Architecture]] and
  [[wiki/analysis/ideal_detector_system|Ideal Detector System]].
- Add registry metadata types for claim tier, baseline families, promotion gates, and missing-data
  states without changing detector behavior.
- Verify `@bp/analytics` typecheck and registry tests.

Status, 2026-05-30: implemented. The analytics registry now carries `claimTier`,
`baselineFamilies`, `promotionGates`, `missingDataStates`, `evidenceSchemaVersion`, and
`retirementStatus` for every current detector. The current registry intentionally has no
`candidate_causal_needs_review` detectors; existing intervention and context detectors remain
associational until formal event-study gates exist.

### Phase R1 - Source Quality And Feature Contracts

- Extend `source_gap` toward `source_quality` rather than creating a disconnected feed-health
  detector.
- Add feature contracts for `stop_direction_hour`, `segment_daypart`, `route_direction_daypart`,
  `route_metric_history`, `intervention_panel`, and `feed_health`.
- Add tests that feature keys are stable and rows carry coverage/freshness/sample fields.

Status, 2026-05-30: implemented as feature contracts. `@bp/analytics/features` now exports the six
R1 feature grains plus stable key functions. New rows carry a shared `FeatureQuality` object with
coverage, freshness, and sample-support fields. `source_gap` remains the detector family that owns
source-quality coverage, and its registry metadata now declares `feed_health` as an input grain plus
low-coverage/feed-stale/validator-error missing states.

### Phase R2 - Headway And Bunching

- Add EWT/SWT/AWT/cv_h helpers and TCQSM LOS bands.
- Add `headway_reliability_ewt` as a descriptive detector.
- Add `bunching_hotspots` as a descriptive detector.
- Add `rider_weighted_excess_wait` only as an associational detector, with APC/ridership proxy
  gates that suppress scoring when exposure weights are missing or low quality.
- Keep `observed_reliability` as the route-month summary detector until the finer-grain detectors
  can supersede it cleanly.

Status, 2026-05-30: implemented. `@bp/analytics/baselines` now exports pure headway helpers for
scheduled wait, average wait, EWT, cv_h/LOS, and bunch/gap rates. `headway_reliability_ewt` and
`bunching_hotspots` are registered descriptive detectors over `stop_direction_hour` features, with
schedule baselines, source-quality gates, evidence/counter-evidence payloads, and coverage rows for
low coverage, stale feeds, insufficient samples, unsupported frequency, and missing baselines. The
experimental `rider_weighted_excess_wait` detector is also registered over a derived
`rider_weighted_excess_wait` feature contract, emits associational rider-minute exposure estimates,
and uses `ridership_proxy_unavailable` rather than treating missing APC/ridership weights as "no
issue."

### Phase R3 - Speed, Variability, And Schedule

- Upgrade segment speed features with pace, free-flow pace, systematic/stochastic split, traversal
  count, and spatial confidence.
- Add buffer-index and route-direction-daypart runtime baselines.
- Add `travel_time_variability`.
- Add `schedule_mismatch` with neutral "suggesting schedule review" language.
- Upgrade `persistent_speed_hotspot` evidence rather than replacing it abruptly.

Status, 2026-05-30: implemented as new feature-contract-native detectors while preserving the
legacy route-month speed detectors. `@bp/analytics/baselines` now exports runtime/pace helpers for
buffer index, runtime deviation, pace slowness index, and non-negative delay components.
`speed_pace_hotspot` consumes `segment_daypart` with free-flow pace, systematic/stochastic delay,
traversal, segment-length, and spatial-confidence gates. `travel_time_variability` and
`schedule_mismatch` consume `route_direction_daypart`; both emit descriptive evidence,
counter-evidence, and coverage rows for low coverage, stale feeds, insufficient observations,
missing runtime metrics, missing baselines, and uncertain spatial joins where applicable.

### Phase R4 - Trend And Positive Deviance

- Add robust z, Theil-Sen, and seasonally aligned own-history helpers.
- Decide whether `degradation_trend` is a major version of `multi_month_speed_peer` or a sibling
  detector.
- Add `positive_deviance` only after peer covariates and reciprocal-metric checks exist.

Status, 2026-05-30: implemented. `@bp/analytics/baselines` now exports robust z-score,
median-absolute-deviation, and Theil-Sen slope helpers. `degradation_trend` is a sibling detector
over `route_metric_history` so `multi_month_speed_peer` can remain a peer-persistence screen.
`positive_deviance` uses a dedicated feature contract carrying peer group, peer count, covariates,
performance percentiles, adjusted residuals, multi-period stability, reciprocal-metric warnings,
and quality fields. Trend findings remain associational; positive-deviance findings remain
descriptive learning candidates.

### Phase R5 - Context And Intervention Gates

- Refactor permit/311 detectors to share a `context_correlation` scaffold with reporting-bias and
  spatial-join caveats.
- Add `intervention_event_study` only as an associational/candidate-causal detector.
- Require pre-trend, placebo-in-time, placebo-in-space, control eligibility, autocorrelation, and
  method-divergence fields before any candidate-causal promotion.
- Keep all effect/causal language behind human methodology review.

Status, 2026-05-30: implemented. `@bp/analytics/baselines` now exports shared
context-association helpers for context support, association score, and source-specific caveats;
`permit_correlated_slowdown` and `service_request_context` both use this scaffold while preserving
context-only claim language. `@bp/analytics/calibration` exports intervention gate summaries for
control eligibility, pre-trend, placebo-in-time, placebo-in-space, autocorrelation, and method
divergence. `intervention_event_study` consumes `intervention_panel`, emits associational findings,
and records `candidate_causal_needs_review` eligibility only inside evidence when every gate passes;
the candidate claim text remains association-only and human methodology approval is still required.

### Phase R6 - Calibration Loop

- Expand gold sets with range labels for window detectors.
- Add detector-version comparison and range-based precision/recall helpers.
- Track reviewer confirmed-rate by detector version.
- Maintain a false-positive register and detector retirement log.

Status, 2026-05-30: implemented as pure calibration utilities. `@bp/analytics/calibration` now
exports range-based precision/recall for window detectors, seeded bootstrap mean intervals,
segmented-regression summaries, detector-version comparison, review-cycle confirmed-rate summaries,
retirement recommendations, and false-positive root-cause summaries. These helpers do not persist
logs themselves; pipeline/review tools own storage and pass typed rows into analytics.

## Immediate Engineering Decisions

1. `observed_reliability` should not be thrown away. It becomes the route-month rollup and review
   summary while EWT and bunching detectors own finer-grain stop/direction/hour evidence.
2. `source_gap` should become the feed/source coverage authority for all reliability detectors,
   not just a standalone data-quality finding.
3. `persistent_speed_hotspot` and `delay_concentration` should be upgraded through evidence fields
   and baselines before any new speed detector replaces them.
4. `permit_correlated_slowdown` and `service_request_context` remain context-only; the shared
   context scaffold should make that impossible to accidentally overstate.
5. `intervention_underperformance` remains descriptive/associational until formal event-study
   gates and reviewer approval exist.
6. Claim-tier metadata belongs in analytics registry first. Promote it to domain only when serving
   artifacts or the public API need it.

## References From The Research Brief

Key method anchors from the supplied review:

- TCQSM / TCRP Report 100 for headway-adherence LOS bands.
- TfL / UK DfT EWT formula: AWT = sum(h_i^2) / (2 * sum(h_i)); SWT = 30 / buses per hour.
- TransitCenter reliability framing that EWT and rider-side measures are preferred to raw OTP.
- Aemmer, Ranjbari, and MacKenzie (2022) for GTFS-RT segment delay and systematic/stochastic split.
- El-Geneidy / McGill AVL reliability work for minimum observation gates.
- Moreira-Matias et al. and recent bunching reviews for bunching black spot framing.
- Lopez Bernal et al. for interrupted time series and controlled ITS caveats.
- Synthetic-control and DiD literature for counterfactual fragility and promotion gates.
- Kontokosta / NYU Marron for 311 reporting-bias caveats.
- Tatbul et al. for range-based precision/recall.

## Open Questions

- Do stop-level GTFS-RT arrival features belong in analytics-internal types or in `@bp/domain`
  because pipeline and review artifacts both need them?
- What minimum live/recovered GTFS-RT coverage is enough for stop-direction-hour EWT in NYC?
- Should `observed_reliability` become a parent detector that aggregates child EWT/bunching outputs,
  or stay independent with shared evidence?
- Which route-versioning rule should break trend series after route redesigns or schedule changes?
- What peer covariates are available and stable enough for positive deviance?
- What is the first gold set large enough to tune EWT, bunching, and schedule-mismatch thresholds
  without threshold thrash?
