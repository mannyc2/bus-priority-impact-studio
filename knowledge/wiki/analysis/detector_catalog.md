---
title: Detector Catalog
type: analysis
status: active
last_updated: 2026-06-07
owner: packages/analytics
source_count: 0
tags: [detectors, analytics, registry, findings, authoring, duplicate-check]
---

# Detector Catalog

This is the human-readable catalog for the detector layer.

The source of truth remains code:

- registry metadata: `packages/analytics/src/registry/detectors.ts`
- detector specs: `packages/analytics/src/registry/specs.ts`
- feature contracts: `packages/analytics/src/features/contracts.ts`
- detector ID allowlist: `packages/domain/src/findings/index.ts`

This page is not a replacement for the registry. It is the short context surface to read before
adding or modifying a detector, especially to avoid creating near-duplicates.

## Why This Is Not Just The Registry

The registry is executable and precise, but it is too dense for product planning. It carries import
wiring, detector functions, gates, data products, models, and repeated metadata across more than a
thousand lines.

Use this split:

| Layer | Role |
| --- | --- |
| Registry | Source of truth for runnable detector definitions. |
| Generated specs artifact | Machine-readable projection for tools and review packets. |
| This catalog | Human-readable map of what exists, how detectors differ, and where novelty fits. |

The right long-term shape is partly generated, partly curated:

- generated from registry: detector id, name, question, scope, claim tier, feature grains,
  baselines, model artifacts, status;
- curated here: similarity clusters, duplicate warnings, product-use notes, and missing detector
  spaces.

## Current Set

Current registry count: **21 detectors**.

| Detector | Question | Scope | Tier | Status |
| --- | --- | --- | --- | --- |
| `source_gap` | Which route/source scopes are missing required data or join coverage? | route | descriptive | active |
| `persistent_speed_hotspot` | Which route segments have persistently slow speed evidence? | segment | descriptive | deprecated (superseded by `speed_pace_hotspot` + `delay_concentration`, OD-2 2026-06-10) |
| `speed_pace_hotspot` | Which segment-daypart cells are persistently slow relative to free-flow pace? | segment | descriptive | active |
| `multi_month_speed_peer` | Which routes show multi-month low-speed trends below a matched peer median? | route | associational | active |
| `observed_reliability` | Which routes show observed headway reliability risk corroborated by wait assessment? | route | descriptive | active |
| `headway_reliability_ewt` | Which frequent-service stop-direction-hour cells show excess rider wait and poor headway regularity? | route | descriptive | active |
| `bunching_hotspots` | Which stop-direction-hour cells show high bunching or long-gap rates? | route | descriptive | active |
| `rider_weighted_excess_wait` | Which stop-direction-hour cells impose the largest rider-minute exposure from excess wait? | route | associational | experimental |
| `customer_journey_shortfall` | Which routes deliver poor customer journey-time performance for the resolved CJTP snapshot month, and is the shortfall wait-side or in-vehicle-side? | route | descriptive | experimental |
| `travel_time_variability` | Which route-direction-daypart cells have unpredictable travel time? | route | descriptive | active |
| `schedule_mismatch` | Which route-direction-daypart cells have scheduled runtime far from observed median runtime? | route | descriptive | active |
| `degradation_trend` | Which metric-history scopes show a worsening trend and current outlier? | route | associational | active |
| `positive_deviance` | Which scopes persistently outperform comparable peers after adjustment? | route | descriptive | active |
| `intervention_gap` | Which high-pain routes lack dated or evaluated intervention evidence? | route | associational | active |
| `intervention_event_study` | Which intervention panels show a performance change around a known treatment? | route | associational | active |
| `intervention_underperformance` | Which evaluated interventions have non-positive peer-adjusted speed outcomes? | route | associational | active |
| `treatment_scope_mismatch` | Which bus-lane-overlap segments remain slow enough to review for scope mismatch? | segment | associational | active |
| `treatment_scope_gap` | Which treated routes have a slow segment that appears outside or weakly covered by known bus-lane geometry? | segment | associational | active |
| `permit_correlated_slowdown` | Which slow routes also have substantial DOT permit context? | route | associational | active |
| `service_request_context` | Which slow routes also have substantial bus-relevant 311 service-request context? | route | associational | active |
| `delay_concentration` | Which routes concentrate avoidable delay in a small set of segments? | route | descriptive | active |

## Similarity Clusters

Use these clusters before creating a new detector. If a new idea lands inside an existing cluster,
first decide whether it is:

- a new feature or model feeding an existing detector;
- a threshold or calibration change;
- a review-packet enrichment;
- a route/page serving projection;
- or genuinely a new detector question.

### Source And Coverage

| Detector | Distinct role |
| --- | --- |
| `source_gap` | Says the system cannot support stronger claims because a source, join, or freshness requirement is missing. |

Duplicate warning: do not create a new "missing data detector" per source. Add source states or
data-product checks to `source_gap` unless the user-facing question is materially different.

### Segment Speed And Delay

| Detector | Distinct role |
| --- | --- |
| `persistent_speed_hotspot` | Segment-level slow evidence at route/timepoint grain. |
| `speed_pace_hotspot` | Segment-daypart pace versus free-flow; better for time-of-day bottlenecks. |
| `delay_concentration` | Route-level concentration: whether a small set of segments accounts for avoidable delay. |

Duplicate warning: a new slow-segment idea is usually not a new detector. It is probably a better
segment model, daypart model, residual model, or concentration rollup.

### Reliability, Wait, And Rider Experience

| Detector | Distinct role |
| --- | --- |
| `observed_reliability` | Route-level GTFS-RT long-gap/wait risk corroborated by official wait assessment. |
| `headway_reliability_ewt` | Stop-direction-hour excess wait and headway regularity for frequent service. |
| `bunching_hotspots` | Stop-direction-hour bunching and long-gap rates. |
| `rider_weighted_excess_wait` | Ranks stop-hour EWT by rider-minute exposure. |
| `customer_journey_shortfall` | Official CJTP route/period/trip-type shortfall, decomposed into wait-side and in-vehicle-side. |

Duplicate warning: "riders wait too long" can mean several things. Choose by grain:

- route/month official KPI: `customer_journey_shortfall` or `observed_reliability`;
- stop-direction-hour operations: `headway_reliability_ewt` or `bunching_hotspots`;
- rider-impact prioritization: `rider_weighted_excess_wait`.

### Runtime And Schedule

| Detector | Distinct role |
| --- | --- |
| `travel_time_variability` | Unpredictable observed runtime; P95 vs P50 spread. |
| `schedule_mismatch` | Scheduled runtime differs from observed median runtime. |

Duplicate warning: variability is not schedule mismatch. One is spread; the other is schedule-vs-
observed level.

### History, Peers, And Outliers

| Detector | Distinct role |
| --- | --- |
| `multi_month_speed_peer` | Routes persistently below peer speed baseline. |
| `degradation_trend` | Metric-history scopes getting worse over time. |
| `positive_deviance` | Scopes outperforming peers; learning candidates, not problem findings. |

Duplicate warning: "bad compared with peers" is not the same as "getting worse." CJTP or reliability
metrics should be added to history/peer surfaces before making a new trend detector.

### Interventions And Treatment Scope

| Detector | Distinct role |
| --- | --- |
| `intervention_gap` | High-pain routes with absent/thin dated intervention evidence. |
| `intervention_event_study` | Known intervention panels with post-treatment performance changes; never auto-causal. |
| `intervention_underperformance` | Evaluated interventions with non-positive peer-adjusted outcomes and current pain. |
| `treatment_scope_mismatch` | Segment overlaps known bus-lane treatment but remains slow. |
| `treatment_scope_gap` | Treated route has a slow segment weakly covered or uncovered by bus-lane geometry. |

Duplicate warning: do not add one detector per treatment type unless the evidence grain and review
question differ. Bus lane, TSP, ACE, and redesign evidence should usually enter treatment summary or
treatment event panels first.

### External Context

| Detector | Distinct role |
| --- | --- |
| `permit_correlated_slowdown` | Slow routes with substantial DOT permit context. |
| `service_request_context` | Slow routes with substantial bus-relevant 311 context. |

Duplicate warning: context detectors are associational. If the new idea says "X caused Y," it needs
a causal/event-study panel or review gate, not another context detector.

## Feature Grain Map

This is the fastest way to see whether a proposed detector is novel. If it uses the same grain,
same baseline, and same claim shape as an existing detector, it is probably duplicate.

| Feature grain | Current detectors |
| --- | --- |
| `source_coverage` | `source_gap` |
| `route_segment_month` | `persistent_speed_hotspot`, `treatment_scope_mismatch`, `treatment_scope_gap`, `delay_concentration` |
| `segment_daypart` | `speed_pace_hotspot` |
| `route_month` | `multi_month_speed_peer`, `intervention_gap`, `intervention_underperformance`, `permit_correlated_slowdown`, `service_request_context` |
| `route_reliability_month` | `source_gap`, `observed_reliability` |
| `stop_direction_hour` | `headway_reliability_ewt`, `bunching_hotspots` |
| `rider_weighted_excess_wait` | `rider_weighted_excess_wait` |
| `customer_journey` | `customer_journey_shortfall` |
| `route_direction_daypart` | `travel_time_variability`, `schedule_mismatch` |
| `route_metric_history` | `degradation_trend`, `intervention_event_study` |
| `positive_deviance` | `positive_deviance` |
| `intervention_window` | `intervention_gap`, `intervention_underperformance` |
| `intervention_panel` | `intervention_event_study` |
| `route_treatment_summary` | `intervention_gap`, `intervention_underperformance`, `treatment_scope_gap` |
| `route_segment_treatment_summary` | `intervention_underperformance`, `treatment_scope_mismatch`, `treatment_scope_gap` |
| `route_treatment_source_gap` | `source_gap`, `intervention_gap` |
| `context_source_month` | `permit_correlated_slowdown`, `service_request_context` |

## Model Artifact Map

| Model artifact | Current consumers |
| --- | --- |
| `source_gap_model_v1` | `source_gap`, `intervention_gap` |
| `segment_daypart_residuals_v1` | `speed_pace_hotspot` |
| `route_peer_residuals_v1` | `multi_month_speed_peer`, `degradation_trend`, `positive_deviance` |
| `reliability_exposure_panel_v1` | `rider_weighted_excess_wait` |
| `treatment_event_panel_v1` | `intervention_event_study` |
| `segment_speed_residuals_v1` | `treatment_scope_mismatch`, `treatment_scope_gap` |
| `intervention_scope_fit_v1` | `treatment_scope_mismatch`, `treatment_scope_gap` |

If a proposed detector needs a new model artifact, first ask whether the artifact should be an
applied-research panel consumed by an existing detector family.

## Missing Spaces

These are areas where new work may be genuinely novel, but should usually start as applied research
before becoming detectors:

| Space | Why it is not already covered |
| --- | --- |
| Multi-year route carpets and anomaly episodes | Existing detectors emit current/snapshot candidates; carpets need route-page serving panels and anomaly segmentation. |
| TSP inventory and signal priority effectiveness | `source_gap` can say inventory is missing; it cannot evaluate TSP without intersection-level treatment data. |
| Route timeline synthesis from Tier 2 | Existing detectors attach evidence; they do not curate route timelines as a first-class route artifact. |
| Equity/rider burden | Rider exposure exists in pieces, but there is no mature equity-weighted detector. |
| Weather/event/school calendar fingerprints | Context exists, but recurring calendar-pulse detection should start as applied-research panels. |
| Detector supersession and retirement | Registry has status, but there is no durable supersession log or lifecycle artifact. |

## New Detector Intake Checklist

Before adding a detector, answer these in the implementation plan:

1. Which row in the Current Set is closest?
2. Which Similarity Cluster does the idea fall into?
3. Is the difference a new question, or merely a new feature, model, threshold, or route-page view?
4. What is the grain, and does an existing feature grain already cover it?
5. What detector would this supersede or enrich?
6. What evidence and counter-evidence would appear in review packets?
7. What clean no-hit means at the same grain?
8. What data-product completeness state blocks it?
9. What evaluation or reviewer labels would prove it is not noisy?

If the answer to question 3 is not clearly "new question," build an applied-research panel or
calibration artifact first.

## Maintenance Rule

Whenever `ANALYTICS_DETECTOR_REGISTRY` changes:

1. Update this catalog's Current Set, Similarity Clusters, Feature Grain Map, and Model Artifact Map.
2. Update [[wiki/analysis/ideal_detector_system]] if the family-level doctrine changes.
3. Run `bun test packages/analytics/test/registry.test.ts`.
4. Run `bun run check:knowledge`.

Whenever a detector's `retirementStatus` changes (demotion / supersession / retirement), also append a
machine-readable lifecycle record to `data/artifacts/detector-lifecycle/detector-lifecycle-log.json`
(built via `buildDetectorLifecycleRecord` in `@bp/analytics/calibration`; S4.2) and update the
detector's Status in the Current Set table above. First exercise: `persistent_speed_hotspot` →
`deprecated`, superseded by `speed_pace_hotspot` + `delay_concentration` (Open Decision 2, 2026-06-10).
