---
title: Route Score
type: analysis
status: implemented
last_updated: 2026-04-29
owner: codex
source_count: 0
tags: [analysis, ranking, route-score]
---

# Route Score

## Goal

Create a transparent, caveated route-level score that helps prioritize routes for deeper review.

## Implementation

Source: `packages/analytics/src/route-score.ts` — `calculateRouteScore()`

### Implemented formula

```text
speedScore    = clamp((averageSpeedMph / 12) * 100, 0, 100)
hotspotPenalty = clamp(hotspotCount * 5, 0, 40)
routeScore    = clamp(speedScore - hotspotPenalty, 0, 100)
```

| Component | Rationale |
|---|---|
| 12 mph reference | Approximate target for NYC local bus routes including dwell and signals. A route averaging 12 mph gets a base score of 100. |
| 5-point hotspot penalty | Each identified hotspot segment reduces the score. Caps at 40 to prevent hotspot count alone from zeroing the score. |
| Clamped 0–100 | Prevents impossible scores. |

### Examples

| Route avg speed | Hotspot count | Speed score | Penalty | Route score |
|---|---|---|---|---|
| 9 mph | 2 | 75 | 10 | 65 |
| 6 mph | 8 | 50 | 40 | 10 |
| 12 mph | 0 | 100 | 0 | 100 |
| 3 mph | 10 | 25 | 40 | 0 |

### Inputs

- `averageSpeedMph`: route-weighted average from hotspot detection (`routeWeightedAverageSpeedMph`).
- `hotspotCount`: number of identified hotspot segments (after limit).
- `coverageStatus`: `"full"`, `"no_observed_speed"`, etc. — passed through, not used in scoring.
- `citations`: source references attached to the scorecard.

Output is validated against `RouteScorecardSchema` (Zod, `packages/domain`).

## Limitations

1. **Simplistic heuristic.** The formula is a two-factor index, not the five-factor weighted percentile model described in earlier planning docs. The planned components — `ridership_weight_percentile`, `persistence_percentile`, `reliability_or_bunching_percentile`, `intervention_gap_score` — are not yet incorporated into the route score.

2. **Magic numbers.** The 12 mph reference speed, 5-point penalty, and 40-point cap are hand-tuned constants with no empirical calibration. They produce reasonable-looking rankings but are not derived from regression or domain expert validation.

3. **No percentile normalization.** Unlike the planned formula, the implemented score is absolute, not relative to the distribution of all routes. A route scoring 50 doesn't mean "median" — it means the route averages 6 mph with no hotspots (or faster with some).

4. **Hotspot count conflates severity with breadth.** A route with 8 mild hotspots gets the same penalty as one with 8 severe hotspots. The hotspot scores themselves are not factored in — only the count.

## Planned improvements

When more data layers are available:

- Incorporate multi-month persistence (trend data exists but is not yet scored).
- Add reliability/bunching from GTFS-RT history.
- Add intervention gap scoring from ACE/bus-lane overlay.
- Move to percentile-based normalization across all routes.
- Calibrate weights with domain input.

## Test coverage

`packages/analytics/test/route-score.test.ts` verifies:
- Correct score calculation for a known input (9 mph, 2 hotspots = 65)
- Clamping prevents impossible scores (extreme inputs stay in 0–100)
- Output passes Zod schema validation
