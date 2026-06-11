# Headway Reliability EWT Calibration Inventory

Generated: 2026-06-10

## Scope

First ADR-0018 slice for `headway_reliability_ewt`. It records a no-write inventory and adds
deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection
machinery for **stop-direction-hour** cells. It does not claim public readiness and does not promote
any finding. No detector thresholds or caps were changed.

The detector resolves the `stop_direction_hour` feature grain through
`artifact.stop_direction_hour_ewt_features.v1` (feed health is carried by `embedded.feature_quality.v1`).
Its claim is descriptive excess-wait-time (EWT) at a single stop-direction-hour cell.

## No-Write Run (default cap)

```bash
bun run pipeline findings run-detector --detector-id headway_reliability_ewt \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-headway-reliability-ewt/no-write-run.json
```

| Metric | Count |
| --- | ---: |
| Feature cells (stop-direction-hour) | 650,264 |
| Ready cells (passed quality + skip gates) | 14,628 |
| Baseline unavailable | 39,377 |
| Insufficient headways | 550,909 |
| Low coverage | 45,350 |
| Observed headway samples | 2,604,283 |
| Emitted candidates (default cap 100) | 100 |
| Evidence rows | 200 |
| Coverage rows | 650,264 |
| Hit rows | 100 |
| Clean no-hit rows | 1,658 |
| Skipped rows | 648,506 |

Run used `wroteDb=false`.

## High-Limit Cap Probe

```bash
bun run pipeline findings run-detector --detector-id headway_reliability_ewt \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-headway-reliability-ewt/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Emitted candidates | 100 | 1,698 |

**1,698 cells qualify above the emission threshold but the default top-100 cap emits only 100 — it
suppresses 1,598 qualifying cells (94.1%).**

## Cap Bias (the headline calibration risk)

The detector score saturates: every one of the 1,698 qualifying cells has `detectorScore` in
`[80, 100]`, and well over 100 cells hit the maximum of 100. The detector sorts by score only and
slices the top 100, so the production cap is filled by an arbitrary, input-order tie-break among the
score-100 cells. The result is a **borough monoculture**:

| Borough prefix | Top-100 emitted | Cap-suppressed (rank 101+) |
| --- | ---: | ---: |
| B (Brooklyn) | 100 | 283 |
| Q (Queens) | 0 | 606 |
| SIM (SI express) | 0 | 179 |
| M (Manhattan) | 0 | 118 |
| S (Staten Island) | 0 | 112 |
| BX (Bronx) | 0 | 107 |
| QM (Queens express) | 0 | 79 |
| BXM (Bronx express) | 0 | 70 |
| X (express) | 0 | 30 |
| BM (Brooklyn express) | 0 | 14 |

Every emitted candidate is a Brooklyn local route. Every other borough — including the 606 qualifying
Queens cells — is invisible at the production cap. This is the borough/route-prefix sampler skew the
calibration loop is meant to catch (cf. the 2026-06-08 top-100 cap-bug log entry). **It is recorded
here as a finding, not fixed in this slice** (per the plan's "do not relax detector caps/thresholds
to make numbers look better"). Any reviewed-gold collection must therefore be built from the
high-limit run with explicit cap-suppressed and borough-spread strata, never from the production
top-100.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:

- `headway-reliability-ewt-review-queue.ts` — `buildHeadwayReliabilityEwtReviewQueue()`. Enriches a
  high-limit no-write output into strata: `top_score`, `near_threshold`, `thin_headway_samples`,
  `borderline_frequency`, `extreme_variability` (LoS F), `borough_spread`, `cap_suppressed_control`
  (score rank beyond the production cap, borough-round-robin sampled), `clean_control`,
  `skipped_control`. Cap suppression is derived from score rank vs the production candidate cap
  because non-emitted clean_no_hit coverage rows do not carry the computed EWT/LoS metrics.
- `headway-reliability-ewt-reviewed-gold.ts` — reviewed-gold labels with stop-direction-hour identity
  keys, suppress-leakage + reviewed-primary survival evaluation, and readiness buckets
  (`public_finding_candidate`, `route_context`, `review_queue`, `suppressed`) with skipped-coverage
  accounting. Calibration vocabulary covers the cell-level risks: thin headway samples, borderline
  frequent service, LoS-F feed-gap artifacts, terminal/layover artifacts, and the standing caveat
  that one stop-hour cell must not be generalized to a whole route.

Both are pure applied-research code over candidate/evidence/coverage rows, fixture-tested in
`packages/applied-research/test/headway-reliability-ewt-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

`findings run-detector --rows-output` persists every candidate/evidence/coverage row. Because the
queue module derives cap suppression from score rank vs the production cap, the rows pass was run at
`--candidate-limit 20000` so the cap-suppressed population carries its computed EWT/LoS evidence:

```bash
bun run pipeline findings run-detector --detector-id headway_reliability_ewt \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-headway-reliability-ewt/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-headway-reliability-ewt/run-rows.json
```

`run-rows.json` was **742MB** (650,264 coverage rows at the stop-direction-hour grain). The queue was
built from it with `buildHeadwayReliabilityEwtReviewQueue()`; only the trimmed companion
`review-queue.selected.json` (selected items + full summary) is persisted, and `run-rows.json` was
deleted after queue + gold/evaluation/readiness construction. A 650k-item full queue artifact was not
kept.

Queue summary: 1,698 emitted, 1,598 cap-suppressed (94.1%), 42 selected for review — 10
`extreme_variability` (every in-cap candidate is score 100 / LoS F, so `top_score`/`near_threshold`/
`thin`/`borderline` strata are empty), 16 borough-round-robin `cap_suppressed_control`, 8
`clean_control` (only 60 exist at the high limit), 8 `skipped_control`. Skips: 363,703 low_coverage,
268,403 insufficient_headways, 12,870 unsupported_frequency, 3,530 baseline_unavailable.

## Reviewed Gold (batch `2026-06-11-march-initial-42`)

All 42 selected rows labeled (adversarial on the 26 emitted cells including cap-suppressed controls,
light on 16 clean/skipped controls); decisions in `reviewed-decisions.json`, gold in
`reviewed-gold.json`.

| Label | Count | Cells |
| --- | ---: | --- |
| `primary_finding` | 3 | Q13 hr6 (30 headways), QM11 hr8 (45), SIM1 hr7 (69) — the only well-sampled emitted cells |
| `needs_more_evidence` | 12 | plausible moderate EWT (8–22 min) on 10–25 observed headways where ~100–200 are expected |
| `reviewer_only` | 4 | B15 hour-4 overnight cluster (schedule/layover suspicion), M101 ambiguous CoV-3 cell |
| `suppress` | 23 | 7 emitted feed-gap artifacts (EWT 30–99 min, CoV 3.4–18.6, 10–18 headways; B36/S40 terminal-adjacent) + 8 clean + 8 skipped controls |

Review findings worth keeping: a month-long cell at 5–10 scheduled buses/hour should yield ~100–200+
observed headways, so 10–25 observed headways means fractional GTFS-RT coverage and hour-scale "EWT"
readings there are feed gaps, not service; every label-backed primary has ≥30 headways and a
gap-implausible magnitude. Consecutive-stop duplicates (B15 hr4 pair, BXM1 hr8 pair) are one upstream
pattern each, so a route rollup must dedupe adjacent cells. Real stop-hour pockets (Q13/QM11/SIM1)
must stay cell-scoped — `single_cell_not_route_generalizable` / `stop_direction_hour_cell` tags mark
rows that would mislead a route-level rollup. J90/L90 shuttle ids appear in the cell universe
(denominator-hygiene note for fleet-universe enumeration).

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

Evaluated against the **production top-100** (deterministic score-desc/scopeId-asc rank ≤ 100 over the
high-limit candidates — the real production run tie-breaks score-100 cells by input order, so this is
a deterministic approximation of the same all-Brooklyn top-100; documented choice per the bunching
sibling). `asOfMonth` 2026-06.

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **0/3** (Q13 rank 593, QM11 rank 1131, SIM1 rank 1310 — all cap-suppressed) |
| Suppress leakage | **2/23** (B11 hr6 78-min and B15 hr9 30-min feed-gap cells sit inside the top-100) |
| Unreviewed emitted (top-100) | 90 |
| Readiness buckets | 3 `public_finding_candidate`, 0 `route_context`, 106 `review_queue`, 23 `suppressed` |
| Coverage skipped (readiness-only accounting) | 648,506 (648,498 unreviewed) |

Both failures are **reported findings, not relabels**: the score-100 saturation + score-only sort
fills the cap with thin-sample Brooklyn cells (none promotable) while suppressing every cell that
actually survives adversarial review. No detector thresholds or caps were changed in this slice.

## Fleet-Readiness Caveat (materialization coverage)

Per `data/artifacts/materialization-coverage/feature-grain-materialization-coverage-2026-03.json`
(S2.4), the `stop_direction_hour` grain is **partial**: 650,264 cells materialized but the fleet
universe of stop-direction-hour cells is not yet enumerated, so no fleet-coverage denominator exists.
On top of that, observed-headway density inside materialized cells is itself fractional (363,703
low_coverage + 268,403 insufficient_headways skips; even emitted cells often carry <25% of expected
headways). Any fleet-readiness claim for this detector must cite both gaps.

## Recommendation

`headway_reliability_ewt` is **not promotable** for March 2026 and fails the ADR-0018 floor at the
production cap: reviewed-primary survival is 0/3 and suppress leakage is 2/23 against the top-100,
because score saturation makes the cap an arbitrary single-borough, thin-sample slice. The
label-backed fix direction (separate slice, not this one) is an emission ranking that prefers
high-headway-sample cells and tie-breaks deterministically with borough/route spread — the three
gold primaries are exactly the cells such a ranking would surface. Thin headway samples, borderline
frequency, LoS-F feed gaps, overnight/terminal cells, and the unenumerated cell universe remain
readiness gates, never threshold relaxations.
