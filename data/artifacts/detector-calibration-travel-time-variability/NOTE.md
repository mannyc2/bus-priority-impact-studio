# Travel-Time Variability Calibration Inventory

Generated: 2026-06-10 (inventory), updated 2026-06-11 (full-output run, reviewed gold, evaluation,
readiness projection)

## Scope

ADR-0018 slice for `travel_time_variability` (Wave 2 #7 in
`docs/research/backend-goal-finish-detectors.md`). Records a no-write inventory plus the first
reviewed-gold calibration loop over the deterministic, fixture-tested review-queue, reviewed-gold,
evaluation, and readiness-projection machinery for the **route-direction-daypart** grain. It does
not claim public readiness and does not promote any finding. No detector thresholds or caps were
changed.

The detector scores cells by runtime buffer index (`(P95 - P50) / P50`) and emits the top
`candidateLimit` (default 100) by score (60–100). Both the primary evidence ref and the coverage
`inputsSeenJson` carry P50/P95/trips, so cap suppression is computed **directly from coverage**
(a clean_no_hit row with `bufferIndex >= minBufferIndex` and `observedTripCount >= minObservedTrips`
is cap-suppressed), not inferred from score rank.

## No-Write Run (default cap) + High-Limit Probe

```bash
bun run pipeline findings run-detector --detector-id travel_time_variability \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-travel-time-variability/no-write-run.json
# high-limit probe
bun run pipeline findings run-detector --detector-id travel_time_variability \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-travel-time-variability/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature cells (route-direction-daypart) | 2,537 | 2,537 |
| Emitted candidates | 100 | 144 |
| Coverage rows | 2,537 | 2,537 |

**144 cells qualify above the emission threshold; the default top-100 cap suppresses 44 (30.6%).**

## Cap Bias

Emitted scores span 68–100, so the top-100 cut is a tie-broken slice rather than a natural break.
The full qualifying population (high-limit run) is borough-diverse and Queens-heavy while the
emitted set tilts Brooklyn/Bronx/Staten Island. Recorded as a finding, **not fixed in this slice**
(per the plan's "do not relax caps/thresholds"; the fix-once cap discipline is S2.2).

Because the queue module computes cap suppression from coverage P50/P95 directly (not from score
rank against the production cap), the reviewed-gold collection was built from the **production-cap
run**: the 44 cap-suppressed cells are identifiable in that run's coverage and 12 of them are
sampled as `cap_suppressed_control` rows. No high-limit rerun was needed for the gold loop, and the
evaluation is against the production emitted set.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id travel_time_variability \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-travel-time-variability/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-travel-time-variability/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Queue built with `buildTravelTimeVariabilityReviewQueue()` over all 100 candidates / 200 evidence /
2,537 coverage rows. 46 rows selected for review:

| Stratum | Population | Selected |
| --- | ---: | ---: |
| `incident_outlier_suspect` (buffer index >= 1) | 26 | 8 |
| `borough_spread` (emitted) | 74 | 10 |
| `cap_suppressed_control` | 44 | 12 |
| `clean_control` | 2,339 | 8 |
| `skipped_control` | 54 | 8 |
| `top_score` / `near_threshold` / `low_trip_support` / `service_pattern_caveat` | 0 | 0 |

`top_score` is empty because every rank-<=20 candidate has buffer index >= 1 and lands in
`incident_outlier_suspect` first; `low_trip_support` is empty because `observedTripCount` is a
segment-row trip **sum** (see below) and never reads thin; `service_pattern_caveat` is empty because
all emitted cells carry `route_segment_speed_plus_schedule_stop.v1`. All 54 skips are
`insufficient_runtime_observations`.

## Reviewed Gold (batch `2026-06-11-march-initial-46`)

All 46 selected rows labeled (adversarial depth on the 18 emitted, light on the 28 controls);
decisions in `reviewed-decisions.json`, gold in `reviewed-gold.json`. Each emitted/control decision
carries a `reviewedEvidence` decomposition computed from `local_route_segment_speed`.

| Label | Count | Cells |
| --- | ---: | --- |
| `primary_finding` | 0 | — |
| `route_context` | 0 | — |
| `needs_more_evidence` | 2 | B35 E off_peak, B35 W off_peak |
| `suppress` | 44 | 16 emitted + 12 cap-suppressed + 8 clean + 8 skipped controls |

**Core review finding: the metric the detector scores is not trip-level travel-time variability.**
The feature resolver (`runtime-history.ts` over `local_route_segment_speed`) builds each
"observed runtime" sample as `SUM(average_travel_time_minutes)` across all segment rows for a
route/direction/daypart/timestamp, and the March table carries hourly aggregate rows, so:

1. **Percentile basis is 3–10 hourly samples per cell**, one per hour-of-day inside the daypart
   band — not the thousands of trips the claim implies. `observedTripCount` (e.g. 5,336 for B16 N
   midday) is a sum of `bus_trip_count` across segment rows and wildly overstates support.
2. **Segment-row composition drives the spread.** The number of segment rows per timestamp varies
   (B16 N midday: 56–105 rows/hour, with the post-A1 non-unique cell key), so the runtime sum
   scales with row count. Decomposition on the 18 emitted cells: row-count buffer index explains
   most of the runtime buffer index in 16 of 18 (e.g. M4 S off_peak rtBI 1.97 vs row-count BI 1.33,
   per-row BI 0.18; BX38 W off_peak rtBI 1.62 vs row-count BI 1.42, per-row BI 0.05).
3. **Claim text publishes implausible magnitudes** ("P50 503.9 min" as a route runtime), so even
   genuinely spread cells are not promotable as written.
4. **Daypart-boundary artifact:** the only two cells whose spread survives the composition
   decomposition (B35 E/W off_peak, per-row BI 0.96/0.87) spread across hours *within* the
   off_peak band (overnight vs evening service mix), not across days or trips — labeled
   `needs_more_evidence`, never `primary_finding`.
5. Controls behaved as expected: the trip floor correctly skipped Q92 W off_peak (buffer index
   2.66 on 16 trips), and clean controls sit below the 0.5 threshold.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOfMonth 2026-06)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **0/0** (no cell earned `primary_finding`) |
| Suppress leakage | **16/44** (16 reviewed-suppress cells are emitted in production) |
| Context/reviewer still emitted | 2/2 (`needs_more_evidence`) |
| Unreviewed emitted candidates | 82 |
| Readiness buckets | 0 `public_finding_candidate`, 0 `route_context`, 84 `review_queue` (2 reviewed + 82 unreviewed emitted), 44 `suppressed` |
| Coverage skipped (readiness-only accounting) | 54 (46 unreviewed) |

The 16/44 suppress leakage is the honest, reportable result of this loop: labels were **not** moved
to make the evaluation pass. By stratified extrapolation the same composition artifact applies to
the unreviewed emitted population, so the detector fails the ADR-0018 zero-leakage floor as built.

## Materialization Coverage for the route-direction-daypart Grain

There is **no direction-daypart surface** in the S2.4 materialization-coverage artifact
(`data/artifacts/analytics-materialization-coverage/2026-03/bus-observatory-2026-03/coverage.json`):
its nine surfaces are route-grain. The closest input surface, `local_route_segment_speed`, is
`complete` at 350/350 expected routes. The run's own coverage rows are the only direction-daypart
accounting: 2,537 cells across 353 distinct routes (mean 7.19 cells/route; 277 routes carry the
full 8 direction-x-daypart cells). Any fleet-completeness claim at this grain must cite the run
coverage rows, not the route-grain coverage artifact — and per finding (1) above, "cell exists"
currently means "had at least one hourly aggregate row", not "has trip-level runtime support".

## Calibration Risks

- Runtime is a composition-sensitive sum over a non-unique segment-cell key; the buffer index
  largely measures variance in segment-row coverage per hour.
- Percentiles over 3–10 hourly samples; `observedTripCount` is not the sample size.
- Daypart bands (especially off_peak) mix structurally different service hours, inflating spread.
- The default top-100 cap is borough-biased against the 144-cell qualifying population.
- The detector must remain descriptive; even a fixed metric does not identify cause.

## Recommendation

`travel_time_variability` is **not calibrated** and must not be promoted for March 2026: suppress
leakage is 16/44 and zero reviewed cells earned `primary_finding`. The blocking fix is upstream of
thresholds: the route-direction-daypart feature needs a trip-level (or at least
composition-normalized, deduplicated-cell) runtime distribution and an honest sample count before
the buffer index measures variability at all. Re-run this loop after the feature fix; cap policy
(S2.2) and daypart-band design should be revisited then. No thresholds, caps, or production code
were changed in this slice.
