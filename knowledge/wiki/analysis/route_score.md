---
title: Route Score
type: analysis
status: draft
last_updated: 2026-04-26
owner: codex
source_count: 0
tags: [analysis, ranking, route-score]
---

# Route Score

## Goal

Create a transparent, caveated route-level score that helps prioritize routes for deeper review.

## Initial formula

```text
bus_priority_need_score =
  0.30 * speed_severity_percentile
+ 0.25 * ridership_weight_percentile
+ 0.20 * persistence_percentile
+ 0.15 * reliability_or_bunching_percentile
+ 0.10 * intervention_gap_score
```

## Inputs

- speed severity from segment speeds,
- ridership by route/hour,
- persistence across months/hours,
- reliability/bunching if realtime data exists,
- ACE/bus-lane coverage.

## Rule

Route score is a prioritization heuristic, not an official grade. Display the formula and caveats.

## Missing piece

`reliability_or_bunching_percentile` requires either published reliability data or a realtime collection pipeline. For MVP, replace with `travel_time_variability` if calculable, or set to `not_available` and reweight.

## Output fields

- route_id
- score
- rank
- top_hotspot_segments
- rider_impact_proxy
- intervention_status
- confidence
- missing_data
- source_snapshot_dates
