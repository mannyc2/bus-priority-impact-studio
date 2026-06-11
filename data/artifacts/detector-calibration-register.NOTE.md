# Consolidated Detector Calibration Register (S4.3)

Generated: 2026-06-11

`detector-calibration-register.json` is the single queryable record of every registry detector's
calibration disposition, gold/NOTE artifact locations, reviewed-label count, and false-positive
root-cause tags. Built via `buildDetectorCalibrationRegister` in `@bp/applied-research/evaluation`
(pure, fixture-tested in `packages/applied-research/test/detector-calibration-register.test.ts`), and
generated from the registry + the existing `data/artifacts/detector-calibration-*` dirs **without
hand-editing those dirs** (Phase 4 S4.3).

## Snapshot (2026-06-11) — all 21 detectors dispositioned, 0 pending

| disposition | count | detectors |
| --- | ---: | --- |
| `machinery_built` | 16 | speed_pace_hotspot, treatment_scope_gap/mismatch, customer_journey_shortfall, observed_reliability, headway_reliability_ewt, bunching_hotspots, delay_concentration, travel_time_variability, schedule_mismatch, degradation_trend, multi_month_speed_peer, intervention_underperformance, intervention_gap, permit_correlated_slowdown, service_request_context |
| `internal_only` | 2 | positive_deviance, intervention_event_study (machinery exists; readiness can never reach a public bucket) |
| `coverage_authority` | 1 | source_gap (agreement audit vs S2.4; no gold-precision frame) |
| `inventory_blocked` | 1 | rider_weighted_excess_wait (coverage-starved; held until ridership-proxy improves) |
| `superseded` | 1 | persistent_speed_hotspot (→ speed_pace_hotspot + delay_concentration, OD-2) |
| `deferred` | 0 | none |

`retirementStatus`: active 18, deprecated 1 (persistent_speed_hotspot), experimental 2
(rider_weighted_excess_wait, positive_deviance). The 2026-06-11 calibration sweep populated
reviewed gold for every machinery_built and internal_only detector: **860 reviewed labels across
18 detectors**, with suppress-side false-positive root-cause tags recorded per family and
`decisionRef` pointing at each gold artifact. The three zero-label entries are structural:
`persistent_speed_hotspot` (superseded), `rider_weighted_excess_wait` (inventory_blocked), and
`source_gap` (coverage authority — its record is the agreement audit at its `decisionRef`, not a
gold set). Regenerate whenever a disposition, registry status, or reviewed-gold changes; this
enables level-6 release-over-release tracking (reviewer outcomes feeding improvements).

`delay_concentration` moved from `deferred` to `machinery_built` after the S2.1 terminal-flag
prerequisite was satisfied and the route-segment review queue + reviewed-gold/readiness machinery
landed. This is a calibration-machinery disposition only; public promotion still requires reviewed
labels and zero suppress leakage.
