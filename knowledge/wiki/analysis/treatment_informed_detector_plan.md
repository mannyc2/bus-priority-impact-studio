---
title: Treatment-Informed Detector Plan
type: analysis
status: active
last_updated: 2026-06-06
owner: packages/analytics
source_count: 0
tags: [detectors, treatments, interventions, source-gap, bus-lanes, tsp, findings]
---

# Treatment-Informed Detector Plan

## Purpose

Use the deterministic `route-treatment-summary` artifact to make intervention detectors sharper
without overclaiming.

The treatment artifact gives the detector layer three new feature grains:

| Grain | What it answers | Main use |
|---|---|---|
| `route_treatment_summary` | For route/month/treatment, what status can we honestly claim? | Intervention gap and treated-route review. |
| `route_segment_treatment_summary` | For observed route segments, where does DOT bus-lane geometry overlap? | Treated-but-slow segment review. |
| `route_treatment_source_gap` | Which treatment claims are blocked by missing public inventory? | Source-gap findings and claim guards. |

These are not final causal evidence. They are admission and guardrail features.

## Detector Quality Rule

A high-quality treatment detector must combine four independent things:

1. **Pain signal**: speed, delay, reliability, rider exposure, or degradation.
2. **Treatment state**: confirmed, planned, historical, source-gapped, or not found.
3. **Scope match**: route, corridor, segment, intersection, or source-only.
4. **Counter-evidence**: peer trend, before/after window, known source gap, low overlap, or missing
   inventory.

If one of these is missing, the output stays a review seed, not a promoted finding.

## Detector Designs

### 1. TSP Source-Gap Blocker

Question:

> Which high-pain routes cannot support TSP presence/absence claims because current public
> route/intersection inventory is missing?

Inputs:

- `route_treatment_source_gap`;
- route/month speed or reliability pain;
- optional Tier 2 TSP source references.

Output:

- `source_gap` candidate with `claimSafeLabel = insufficient_evidence`;
- missing-data state `tsp_current_inventory_missing`;
- blocks claims like "no TSP here" or "route has TSP coverage".

Promotion:

- Descriptive only.
- Never implies TSP does not exist.

### 2. Treatment Gap, Source-Gap Aware

Question:

> Which high-pain routes have no strong current/implemented treatment evidence after separating
> `not_found` from `source_gap`?

Inputs:

- route speed/reliability pain;
- `route_treatment_summary`;
- `route_treatment_source_gap`.

Output:

- `intervention_gap` candidate only when pain is high and treatment posture is genuinely absent or
  thin.
- If the blocking issue is TSP or missing implementation date, emit a source-gap caveat instead of
  "no intervention".

Promotion:

- Associational review target.
- Public language: "little dated public treatment evidence", not "untreated".

### 3. Bus-Lane Slow-Segment Review

Question:

> Which observed slow segments already overlap DOT bus-lane geometry?

Inputs:

- segment speed/daypart features;
- `route_segment_treatment_summary`;
- bus-lane overlap share, match method, confidence.

Output:

- segment review seed for underperformance or scope-mismatch analysis.

Required guards:

- `matchMethod = route_shape_overlap`;
- minimum speed observations/trips;
- overlap-share confidence bucket;
- caveat that overlap is geometry context, not audited lane mileage.

Promotion:

- Descriptive review seed until peer/daypart baselines are attached.

### 4. Route Treatment Underperformance

Question:

> Which route-level treatments have peer-adjusted non-positive effect estimates while current pain
> remains high?

Inputs:

- `route_treatment_summary`;
- `intervention_panel`;
- `route_metric_history`;
- current speed/reliability pain.

Output:

- `intervention_underperformance` candidate with primary evidence from evaluated panel and
  treatment state.

Required guards:

- evaluated comparison row;
- adequate peer/control count;
- pre/post windows present;
- current pain remains high;
- counter-evidence lists positive comparison rows and peer limitations.

Promotion:

- Associational only unless formal event-study gates pass.

### 5. Segment Treatment Scope Mismatch

Question:

> Did the route receive a treatment, but the worst segment appears outside the treatment geography?

Inputs:

- route treatment summary;
- segment treatment summary;
- top slow segments;
- speed/rider exposure.

Output:

- review seed for "treatment may not cover the binding constraint."

Required guards:

- confirmed route-level treatment;
- worst segment has `not_found` or low-overlap treatment state;
- no claim that the treatment failed.

Promotion:

- Descriptive review target.

## Immediate Implementation State

As of 2026-06-07:

- `route-treatment-summary` is materialized for 2026-03.
- Detector feature contracts exist for route, segment, and source-gap treatment rows.
- The detector-study harness can load treatment features from the artifact root.
- `source_gap`, `intervention_gap`, and `intervention_underperformance` declare the new treatment
  grains.
- `findings treatment-review` builds a deterministic review artifact with three seed classes:
  TSP source-gap blockers, bus-lane slow-segment reviews, and treated slow-route reviews.
- `intervention_gap` and `intervention_underperformance` now run through detector-native
  treatment-aware constructors in `@bp/applied-research`.
- `treatment_scope_mismatch` is registered as a segment-scope detector. It joins
  `route_segment_treatment_summary` to current route-segment speed summaries and emits cautious
  review candidates where a segment overlaps DOT bus-lane geometry but still has very low observed
  speed. It intentionally says "review scope, enforcement, and peer context" instead of "the lane
  failed."
- March 2026 detector-run artifacts were generated:
  - `intervention_gap`: 381 routes, 8 candidates, 381 coverage rows.
  - `intervention_underperformance`: 381 routes, 28 candidates, 381 coverage rows.
- `treatment_scope_mismatch`: 4,134 route segments, 100 capped candidates, 4,134 coverage rows.
  The detector asks "slow despite bus-lane overlap?" and now attaches same-segment historical
  speed context, current route/network peer rank, daypart profile, segment length, and explicit
  overlap caveats.
- `treatment_scope_gap`: 4,140 route segments, 95 capped candidates, 4,140 coverage rows. The
  detector asks "treated route, but is the slowest eligible segment outside or weakly covered by
  known bus-lane geometry?" It is complementary to `treatment_scope_mismatch`, not a duplicate.
- The segment detector now carries reviewer calibration context:
  - current-month same-route segment speed rank;
  - current-month network segment speed rank;
  - daypart speed profile and slowest daypart;
  - segment length in feet;
  - packet-level review summary/highlights/cautions/checks.
- The real March audit found that the original top Q65/Q17/Q12 candidates were tiny 16-32 ft
  segment artifacts. `treatment_scope_mismatch` now uses the same 300 ft minimum segment-length
  discipline as the speed-pace detector. Those three scopes are skipped with `segment_too_short`
  rather than queued.
- Underperformance evidence carries route/segment treatment counts plus a capped, deterministic
  sample of source refs; the full source-ref count is preserved separately to avoid oversized
  finding evidence rows.
- Review packets were regenerated for March 2026: 1,564 candidates, 1,564 packets, 20
  candidate-bearing registered detectors, and 0 missing packet candidates. Both treatment-scope
  detector packet families are complete: primary evidence, counter-evidence, coverage row, detector
  spec, and review checklist are present.
- `treatment_scope_gap` review packets now have a specialized reviewer context: route-level
  treatment count, uncovered/weakly-covered segment speed, segment treatment support, peer/daypart
  context, capped route source refs, and cautions against treating missing public overlap as proof
  of no treatment.
- `evaluate detectors --year 2026 --month 3` now produces 20 scorecards. `treatment_scope_gap` and
  `treatment_scope_mismatch` are both correctly `watch`: packet/evidence quality and claim
  discipline are strong, but precision and reviewer-usefulness are unscored until human labels
  exist. Generic score vectors now include:
  - `treatment_scope_gap`: 4,140 scopes, 95 flagged, 2,081 clean no-hit, 1,964 skipped, max score
    88, calibration stability score 700.
  - `treatment_scope_mismatch`: 4,134 scopes, 100 flagged, 735 clean no-hit, 3,299 skipped, max
    score 87, calibration stability score 651.

## Next Promotion Gates

Before treatment-informed candidates can become public findings:

- Review labeled positives/near-misses before changing thresholds or promotion status. The
  detectors are usable review queues, not public causal findings.
- Add or repair detector-readiness coverage if we need the `coverage_robustness` score; the
  optional readiness audit did not complete quickly during this slice and was not required for
  packet/evidence validation.
- Add richer frontend/reviewer rendering for treatment state, source gaps, and scope-match caveats.
  The data is already present in evidence/coverage rows; the reviewer experience should make it
  easier to inspect.
- Backtest against promoted/rejected findings so treatment features improve precision instead of
  just increasing candidate volume.
