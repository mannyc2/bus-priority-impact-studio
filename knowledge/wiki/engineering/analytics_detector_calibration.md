---
title: Analytics Detector Calibration
type: engineering
status: active
last_updated: 2026-05-31
owner: packages/analytics
source_count: 0
tags: [analytics, detectors, calibration, baselines, corpus]
---

# Analytics Detector Calibration

## Purpose

Detector calibration is where the historical corpus becomes operational policy. The detector code
should not decide ad hoc which months count as history, which seasonality checks matter, or when a
missing surface blocks promotion. Those choices are part of the detector contract.

The initial scaffold lives in:

```text
packages/analytics/src/calibration/detector-policy.ts
```

It is pure TypeScript: no database reads, no artifact writes, no network calls. Pipeline jobs can
consume the policy later when they build baseline snapshots, score vectors, and post-backfill
validation reports.

The first policy consumer is:

```sh
bun --filter @bp/pipeline-v2 cli -- audit analytics-detector-readiness \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3
```

It writes:

```text
data/artifacts/analytics-detector-readiness/2023-04_to_2026-03/readiness.json
```

The audit joins surface coverage to these policies and reports each detector as `ready`, `partial`,
`blocked`, or `policy_pending`, with the exact missing surface and failure state that prevents
calibration. The audit walks `ANALYTICS_DETECTOR_REGISTRY`, so detectors without an explicit
calibration policy are visible instead of being silently omitted.

The first score-vector artifact path is EWT route-month calibration:

```sh
bun --filter @bp/pipeline-v2 cli -- ingest bus-customer-journey-metrics \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3
```

```sh
bun --filter @bp/pipeline-v2 cli -- build ewt-score-vectors \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3 \
  --release-year 2026 --release-month 3
```

It writes:

```text
data/artifacts/analytics-ewt-score-vectors/2023-04_to_2026-03/2026-03/ewt-route-month-score-vectors.json
```

This artifact deliberately separates **score-vector calibration** from public stop-hour findings.
The route-month score vector now prefers MTA Customer Journey-Focused Metrics
`additional_bus_stop_time`, customer-weighted across peak/off-peak rows, as the compact ABST
baseline surface. ABST is an official MTA route-month-period aggregate: it is schedule-relative and
EWT-like, but it is not a substitute for raw stop-direction-hour schedule features.

```text
score_excess_wait_minutes = weighted_mean(ABST/additional_bus_stop_time, number_of_customers)
```

The observed-regularity score (`AWT - mean_observed_headway / 2`) remains a fallback for
route-months that are missing from the customer journey source. Raw schedule-derived features still
need to be built for detector-grade stop-direction-hour EWT, schedule mismatch, headway regularity,
and audit packets.

The first raw schedule-derived feature materializer is route-scoped so it can backfill safely:

```sh
bun --filter @bp/pipeline-v2 cli -- build stop-direction-hour-ewt-features \
  --year 2026 --month 3 \
  --route-id M15 \
  --run-id bus-observatory-2026-03
```

It writes stop-direction-hour feature rows under:

```text
data/artifacts/analytics-stop-direction-hour-ewt/2026-03/bus-observatory-2026-03/<route>/stop-direction-hour-ewt-features.json
```

Those rows use raw `local_route_schedule_timepoint` arrivals to compute scheduled buses/hour and
scheduled headway baselines, then join `local_observed_headway_sample` by route, direction, stop,
day type, and hour. The default observed aggregation is `month_day_type_hour` for historical
detector calibration; `service_date_hour` remains available for live/day-level audit runs. Cells
without a matched schedule baseline emit `baseline_unavailable`, not clean/no issue. Current route
slice schedules cover timepoint stops, so this path is detector-grade where it has matched
timepoint baselines and also exposes where we still need the broader raw schedule corpus.

The March 2026 artifact run over 2023-04..2026-03 produced 24,344 staged customer-journey rows
across 356 source routes, 11,937 usable score-vector route-month rows, 11,591 pre-release baseline
rows, 36 usable months, 35 baseline months, 346 release routes, and 20 release routes above the
fleet P90 calibration cutoff. Score basis counts: 11,737 `mta_abst_customer_journey_metric` rows
and 200 observed-regularity fallback rows.

## Canonical baseline windows

| Window | Default | Minimum complete months | Anchor | Purpose |
|---|---:|---:|---|---|
| `releaseMonth` | 1 month | 1 | Release month | Current public evidence and serving projection. |
| `lookback12` | 12 months | 8 | Release month | Stable own-route baselines and persistence checks. |
| `lookback36` | 36 months | 24 | Release month | Distribution fitting, rare-event calibration, and score-vector history. |
| `seasonalPeerWindow` | 9 months | 3 | Release month | Same-month prior-year and adjacent-month seasonality checks. |
| `prePostInterventionWindow` | 24 months | 12 | Intervention month | Pre/post, control, placebo, and event-study screening panels. |

These are policy names, not query implementations. Feature materializers still decide how to load
typed rows from SQLite/R2 and then stamp the exact start/end months used.

## Initial detector policies

This table documents the currently registered detector policies. Every registered detector now has
an explicit readiness policy, but a few policies deliberately cover only surfaces the current audit
can observe directly. Those waivers are listed after the table.

| Detector | Baseline windows | Required seasonality / break rules | Minimum-history posture | Backfill validation expectation |
|---|---|---|---|---|
| `source_gap` | `releaseMonth` | No seasonality rule; source-gap claims are coverage statements only. | Release source-gap findings need at least one complete audited surface month and should expose `low_coverage`, `missing_speed`, `insufficient_gtfs_rt_samples`, or `missing_scheduled_baseline` rather than score gaps as clean. | `route_segment_speeds`, `observed_headways`, and `gtfs_schedule_runtime` must be audited before source gaps can distinguish missing evidence from clean evidence. |
| `persistent_speed_hotspot` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Route-version breaks are required for promotion; same-month and adjacent-month guards are advisory. | Release segment candidates need at least 10 speed observations; persistence/threshold movement needs 8 complete speed-history months and 75% coverage. | `route_segment_speeds` must support the release and lookback windows, otherwise emit `insufficient_speed_observations`. |
| `multi_month_speed_peer` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Route-version breaks are required; same-month and adjacent-month guards prevent one-month peer overclaiming. | Peer comparison needs 8 complete route-speed months, current-month support, at least 100 observations, and explicit `insufficient_trend_months`/`missing_current_trend_month` states. | `route_segment_speeds` must be materializable into route-month speed observations and matched peer medians. Peer deficits are descriptive/associational, not causal controls. |
| `observed_reliability` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Service-period matching is required; same-month and adjacent-month guards are advisory. | Release route-month rows need 100 observed headway samples, a schedule baseline, Bus Wait Assessment support, and 8 complete months before thresholds move. | `observed_headways`, `gtfs_schedule_runtime`, and `bus_wait_assessment` must be audited. Missing support maps to `insufficient_gtfs_rt_samples`, `missing_scheduled_baseline`, or `missing_bus_wait_assessment`. |
| `headway_reliability_ewt` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Same-month prior year and adjacent-month guard are advisory. | Current EWT cells need at least 10 headways and 80% coverage; threshold movement needs at least 8 complete history months. | Observed headway coverage must be profiled before EWT threshold fitting. |
| `bunching_hotspots` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Service-period matching is required; same-month and adjacent-month guards are advisory. | Release stop-direction-hour cells need 20 observed headway pairs, a scheduled headway baseline, and 8 complete months before bunching-share thresholds move. | `observed_headways` and `gtfs_schedule_runtime` must be audited. Missing support maps to `insufficient_headway_pairs`, `baseline_unavailable`, or `low_coverage`. |
| `rider_weighted_excess_wait` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Service-period matching is required; same-month and adjacent-month guards are advisory. | Rider-minute exposure needs observed headways, scheduled wait/headway baseline, ridership/APC proxy support, and 8 complete months before percentile thresholds move. | `observed_headways`, `gtfs_schedule_runtime`, and `route_hourly_ridership` must be audited. The detector remains associational and requires reviewer confirmation of ridership proxy suitability. |
| `speed_pace_hotspot` | `releaseMonth`, `lookback12`, `lookback36`, `seasonalPeerWindow` | Route-version breaks are required for promotion; seasonal guards are advisory. | Segment-daypart cells need at least 15 traversals; free-flow/history baselines need 12 complete months and 75% coverage. | `route_segment_speeds` must pass the backfill coverage audit without unexplained missing/thin months. |
| `schedule_mismatch` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Schedule service-period and route-version breaks are required. | Current mismatch cells need at least 10 observed trips; recurring candidates need 8 complete history months. | GTFS schedule-runtime baselines and observed runtime/pace history must both exist. |
| `travel_time_variability` | `releaseMonth`, `lookback12`, `lookback36`, `seasonalPeerWindow` | Route-version breaks are required; same-month and adjacent-month guards are advisory. | Route-direction-daypart runtime variability needs 30 observed trips, valid P50/P95 runtime metrics, and 12 complete months before buffer-index thresholds move. | `route_segment_speeds` must be audited before route-direction-daypart runtime features are calibrated. Variability is descriptive and does not identify cause. |
| `degradation_trend` | `lookback12`, `lookback36`, `seasonalPeerWindow` | Route-version breaks are required; same-month and adjacent-month guards prevent one-month overclaiming. | Trend fitting needs 8 complete months minimum; seasonal promotion prefers 12 months. | Metric history must be materializable from segment-speed history; hourly ridership is optional unless severity is rider-weighted. |
| `positive_deviance` | `releaseMonth`, `lookback12`, `lookback36`, `seasonalPeerWindow` | Route-version breaks are required; same-month and adjacent-month guards are advisory. | Positive-deviance candidates need at least 8 eligible peers, repeated qualifying periods, and reciprocal-metric checks before promotion. | `route_segment_speeds` is required and `route_hourly_ridership` is optional for exposure covariates. Peer construction, covariates, and reciprocal warnings remain materializer/reviewer gates. |
| `intervention_event_study` | `prePostInterventionWindow`, `lookback36` | Control pre-trend and route-version rules are required. | Event-study screening needs 12 complete pre/post months; candidate-causal promotion needs eligible controls or auditable synthetic-control fit. | Historical `intervention_comparisons` and treated/control performance history must exist. |
| `intervention_gap` | `releaseMonth`, `lookback12`, `prePostInterventionWindow` | Route-version breaks are required; adjacent-month guard is advisory. | Evidence-gap candidates need at least one audited speed or reliability pain signal and 12 months of intervention inventory/comparison support. | `route_segment_speeds` and `intervention_comparisons` are required; `observed_headways` is optional support. Absence of local intervention rows is not proof no treatment exists. |
| `intervention_underperformance` | `releaseMonth`, `prePostInterventionWindow`, `lookback36` | Control pre-trend, route-version, and same-month prior-year checks are required/advisory according to claim strength. | Underperformance screens need a current speed pain signal and 12 months of evaluated intervention comparison support. | `route_segment_speeds` and `intervention_comparisons` are required; `observed_headways` is optional context. Peer-adjusted deltas remain associational. |
| `permit_correlated_slowdown` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Route-version breaks are required; same-month and adjacent-month guards are advisory. | Permit-context candidates need at least 100 speed observations and 25 DOT permit route-touch rows before scoring. | `route_segment_speeds` and `dot_permit_route_touches` must be audited. Permit touches are context only and never causal evidence by themselves. |
| `service_request_context` | `releaseMonth`, `lookback12`, `seasonalPeerWindow` | Route-version breaks are required; same-month and adjacent-month guards are advisory. | 311-context candidates need at least 100 speed observations and 25 joined service-request route-touch rows before scoring. | `route_segment_speeds` and `service_request_route_touches` must be audited. Reporting-bias and route-fanout caveats remain mandatory. |
| `delay_concentration` | `releaseMonth`, `lookback12`, `lookback36` | Route-version breaks are required; same-month and adjacent-month guards are advisory. | Release concentration needs enough clean segment-speed observations and eligible segments; fleet-distribution thresholds need 12 complete months, with `lookback36` preferred for stable calibration. | `route_segment_speeds` must be audited before route-level Gini/excess-delay concentration can be benchmarked. Concentration locates delay distribution and is not a cause claim. |

### Documented waivers

`source_gap` has a readiness policy only for surfaces the current audit can observe directly:
`route_segment_speeds`, `observed_headways`, and `gtfs_schedule_runtime`. Its context-join,
bus-lane sentinel-date, source-lag, and validator-error checks remain release-run quality checks;
they are not historical readiness blockers until the audit grows direct surfaces for those states.

`positive_deviance` readiness covers audited speed history and optional ridership exposure
covariates only. Peer construction, covariate quality, reciprocal-metric warnings, and reviewer
approval stay materializer/review gates until a direct positive-deviance feature artifact is
audited.

`intervention_gap` and `intervention_underperformance` readiness can verify speed history,
intervention comparison rows, and optional observed-reliability support. It cannot prove the
intervention inventory is exhaustive, and it does not unlock causal language.

`permit_correlated_slowdown` and `service_request_context` readiness verifies route-month speed
coverage plus joined route-touch bridge rows for the relevant context source. Raw source freshness,
geocode rates, fanout, match weights, work-type relevance, and 311 reporting bias remain promotion
caveats, not causal shortcuts.

There are no remaining `policy_pending` registered detectors as of 2026-05-31.

## How pipeline should use this scaffold

1. Build or refresh the historical source surface.
2. Run `audit analytics-backfill-coverage`.
3. For each detector, read `DETECTOR_CALIBRATION_POLICIES`.
4. Check the detector's required surfaces and minimum-history gates.
5. Materialize baseline snapshots keyed by release month, detector id, detector version, and window id.
6. Materialize score vectors over the declared windows.
7. Compare thresholds against gold sets and reviewer decisions.
8. Emit a validation packet with pass/fail/caveat states before changing detector thresholds.

Changing a detector threshold should be treated as a detector minor-version change. Changing the
scoring math should be treated as a major-version change.

## Current non-goals

- Do not auto-fit thresholds inside request handlers.
- Do not let detectors silently fall back from history-backed mode to release-only mode.
- Do not use intervention estimates as causal claims without the method gates and human approval
  described in the literature-informed detector spec.
- Do not block all descriptive release-month findings merely because long-history calibration is
  incomplete; instead, lower claim strength and emit the missing-data state.

## Next implementation steps

1. Add baseline snapshot artifact builders for `lookback12`, `lookback36`,
   `seasonalPeerWindow`, and `prePostInterventionWindow`.
2. Add score-vector artifact builders for the explicitly covered policies.
3. Attach reviewer outcomes and false-positive root causes to detector versions.
4. Require a calibration packet before threshold changes are merged.
