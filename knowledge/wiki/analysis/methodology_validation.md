---
title: Methodology Validation
type: analysis
status: current
last_updated: 2026-05-17
owner: codex
tags: [analysis, validation, methodology]
---

# Methodology Validation

Code-level audit of per-route analysis logic. Covers correctness of calculations, known limitations, and what would need to change for production use.

## Hotspot detection — sound with caveats

Source: `packages/analytics/src/hotspots.ts`

**What's correct:**
- Trip-count-weighted averaging is the right approach — gives higher-traffic windows more influence on the segment average, avoiding distortion from low-trip overnight windows.
- Speed severity normalization (`(target - observed) / target`, clamped 0–1) produces a unitless 0–1 deficit that's comparable across segments with different absolute speeds.
- Slow window share captures frequency independent of magnitude — a segment that's slightly below threshold every hour scores higher than one that's very slow for one hour.
- The 65/35 blend of severity vs frequency is a reasonable default. Speed severity dominates because a chronically slow segment matters more than one that dips briefly.
- Rider delay index (`ridership * speedSeverity`) is a valid exposure-weighted metric when the ridership data matches the right granularity.

**What's limited:**
- **Route-level ridership proxy.** The ridership join uses MTA Bus Hourly Ridership, which reports total riders per route per hour — not per segment. Every segment in the same hour gets the same ridership weight. This inflates rider-impact scores for segments that are slow during peak hours regardless of whether riders actually traverse those segments. Fixing this requires APC data (not publicly available) or a boarding/alighting model.
- **8 mph target is a single constant.** Express routes, SBS routes, and local routes have different speed expectations. A single target treats an SBS route averaging 10 mph the same as a local route averaging 10 mph. Route-type-aware targets would improve ranking accuracy.

**Test verdict:** The unit tests verify weighted averaging and rider-impact reranking with known inputs and expected outputs. The core math is correct.

See [[wiki/analysis/hotspot_detection|Hotspot detection]] for full formula documentation.

## Route score — functional but simplistic

Source: `packages/analytics/src/route-score.ts`

**What's correct:**
- The formula produces a 0–100 score that correctly ranks slower routes below faster ones and penalizes routes with more hotspot segments.
- Clamping prevents impossible values.
- Output is Zod-validated against a strict schema.

**What's limited:**
- Two-factor formula (`speedScore - hotspotPenalty`) vs the planned five-factor weighted model. Missing: ridership weight, persistence, reliability/bunching, intervention gap.
- The 12 mph reference and 5-point penalty are hand-tuned. No calibration against MTA performance standards or peer transit agencies.
- Hotspot penalty counts segments, not their severity — 8 mild hotspots = 8 severe hotspots.
- Absolute scale, not percentile-normalized. Scores are not relative to the distribution.

**Test verdict:** Simple formula, correctly implemented, correctly clamped. The formula itself is the limitation, not the code.

See [[wiki/analysis/route_score|Route score]] for full formula documentation.

## Schedule comparison — correct logic

Source: `tools/pipeline/src/jobs/build/route-brief-metrics.ts` — `scheduleComparisons()`

**What's correct:**
- Groups schedule timepoints by `(date, dayType, direction, blockId)`, sorts by time, detects trip boundaries via sequence number resets. This correctly handles multiple trips per block.
- Computes median scheduled travel time per stop-pair — robust to outlier trips.
- Filters out implausible travel times (<=0 or >180 minutes).
- `Date.parse()` on schedule times works because MTA Socrata timepoint data uses ISO-parseable time strings.
- Compares observed (weighted average from hotspots) to scheduled (median from timepoints) per matched pair.

**What's limited:**
- Only matches hotspot segments, not all scheduled pairs. A segment not flagged as a hotspot won't get a schedule comparison even if it's running behind schedule.
- Schedule data reflects planned service, not actual departures. Cancellations and short-turns are invisible.

## Bus lane matching — reasonable approximation

Source: `tools/pipeline/src/jobs/build/route-brief-metrics.ts` — `busLaneMatches()`

**What's correct:**
- Street name normalization handles common abbreviations (AV/AVE/AVENUE, ST/STREET, BLVD/BOULEVARD, RD/ROAD).
- 150-meter proximity threshold is reasonable for NYC block scale (~80m typical block width).
- Equirectangular distance formula (`metersBetween`) is accurate to <0.1% at NYC latitude (40.7°). Full Haversine is unnecessary at this scale.

**What's limited:**
- Street name matching is approximate. Stop names like `5 AV/E 72 ST` are parsed to extract the first street (`5 AV`), which may miss lanes on cross streets that the route uses.
- Bus-lane overlap is useful as context and source-gap detection. Route-level bus-lane before/after rows now use the latest parseable matched NYC DOT `open_dates`, but undated or unparsable matched segments remain source gaps.

## Speed and ridership profiles — correct aggregations

Source: `tools/pipeline/src/jobs/build/route-brief-metrics.ts` — `groupedSpeedProfiles()`, `ridershipProfiles()`

**What's correct:**
- Speed profiles aggregate by direction, direction+daypart, and day+hour with consistent trip-count weighting throughout.
- Daypart bucketing (AM peak 6–9, Midday 10–15, PM peak 16–19, Evening 20–23, Overnight 0–5) aligns with standard transit analysis periods.
- Slow-crowded window ranking uses `ridership * slowObservationShare` — correctly identifies windows where many riders experience slow service.
- All aggregations use the same `SpeedAccumulator` pattern, ensuring consistency.

**No known issues** with these calculations.

## Intervention evaluation — peer-adjusted and caveated

Sources: `tools/pipeline/src/jobs/build/route-brief-metrics.ts` and `tools/pipeline/src/jobs/build/route-intervention-evaluation.ts`

**What's correct:**
- Correctly splits ACE/ABLE programs into active vs future based on implementation date vs analysis period end.
- Violation counts are grouped by type with correct summation.
- ACE/ABLE evaluated rows record raw pre/post windows, sample counts, speed/ridership deltas, peer-route comparison counts/IDs, peer baseline deltas, adjusted speed/ridership deltas, evaluation level, comparison status, and caveats.
- Peer baselines use public comparison routes with sufficient trend rows, matched on pre-period speed and ridership, to control for networkwide seasonal shifts in the same pre/post windows.
- Public routes with matched NYC DOT bus-lane geometry receive dated bus-lane comparison rows when matched lane `open_dates` parse, and explicit source-gap comparison rows when matched segments do not have usable dates.
- Strict v1 QA now fails when evaluated intervention rows lack peer-adjusted speed deltas.
- `audit:pipeline-v1` records an explicit methodology gate. Until external review is complete, the gate stays `descriptive_only`, `causalClaimsAllowed=false`, with `descriptive_before_after` and `matched_comparison` as supported evidence levels when peer-adjusted rows exist.

**What's limited:**
- Current ACE/ABLE evaluation is still observational, not causal.
- Bus-lane rows depend on route-level approximation from matched segment `open_dates`, and source gaps remain where matched segments lack parseable dates.
- External transit-domain review remains open before making operational or causal claims.

## Observed reliability — implemented, sample-gated

Sources: `tools/pipeline/src/jobs/collect/collect-gtfs-rt.ts`, `tools/pipeline/src/jobs/build/observed-headways.ts`, and `tools/pipeline/src/jobs/build/route-observed-reliability.ts`

**What's correct:**
- GTFS-RT raw snapshots, parse metadata, vehicle positions, observed stop events, and observed headway samples are run-scoped.
- Route/month observed reliability summaries include observed headway, bunching, long-gap, expected-wait, sample count, coverage, and explicit insufficient-sample statuses.
- Route brief artifacts now include top observed long-gap and bunching windows by NYC local weekday/hour, direction, and stop when observed headway samples exist.
- Strict v1 QA now checks collection window, sample cadence, successful vehicle-position snapshot coverage, parse/headway provenance, observed-route coverage, and analysis-month alignment.

**What's limited:**
- The current complete public-source month is March 2026, but there are no March 2026 GTFS-RT samples.
- Live May 2026 collection can prove the observed layer, but it cannot complete the March strict gate unless the analysis month moves to May after public speed coverage exists.
- Detailed observed reliability windows currently live in route brief static artifacts rather than a relational D1 window table.

## Overall assessment

The analysis logic is internally consistent, correctly weighted, and well-tested for its core paths. The main gaps are:

1. **Ridership granularity** — route-level proxy inflates segment-level rider-impact scores
2. **Route score simplicity** — two-factor formula vs planned five-factor model
3. **Observed realtime month split** — current live GTFS-RT evidence does not align with the March public-source month
4. **Intervention methodology** — ACE/ABLE and dated bus-lane rows now include peer-adjusted deltas where data supports them, but source gaps and external review remain
5. **Corridor precision** — hotspot-segment grouping now has shape-review coverage, but route-to-corridor naming still needs domain review for product use

For a portfolio piece demonstrating methodology, the logic is defensible and well-documented. For MTA operational use, ridership allocation, route score calibration, remaining bus-lane source gaps, and final corridor naming would need domain review.
