# Bunching Hotspots Calibration Inventory

Generated: 2026-06-10 (reviewed-gold pass added 2026-06-11)

## Scope

ADR-0018 slice for `bunching_hotspots`. Records a no-write inventory and adds deterministic,
fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection machinery for
**stop-direction-hour** cells. It does not claim public readiness and does not promote any finding.
No detector thresholds or caps were changed.

The detector resolves the `stop_direction_hour` feature grain and emits two **descriptive** reason
classes: `bunching_hotspot` (short headways) and `headway_gap_hotspot` (long gaps), scored from
bunching/gap shares against the scheduled headway baseline.

## No-Write Run (default cap)

```bash
bun run pipeline findings run-detector --detector-id bunching_hotspots \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-bunching-hotspots/no-write-run.json
```

| Metric | Count |
| --- | ---: |
| Feature cells (stop-direction-hour) | 650,264 |
| Ready cells (passed quality + skip gates) | 14,628 |
| Emitted candidates (default cap 100) | 100 |
| Coverage rows | 650,264 |
| Hit rows | 100 |
| Clean no-hit rows | 3,831 |
| Skipped rows | 646,333 |

Run used `wroteDb=false`.

## High-Limit Cap Probe

```bash
bun run pipeline findings run-detector --detector-id bunching_hotspots \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-bunching-hotspots/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Emitted candidates | 100 | 3,048 |

**3,048 cells qualify above the emission threshold but the default top-100 cap emits only 100 — it
suppresses 2,948 qualifying cells (96.7%).**

## Cap Bias

Scores cluster near the top (emitted range 92–100), so the top-100 cap is again an arbitrary
tie-broken slice. Unlike `headway_reliability_ewt` (which emitted 100% Brooklyn), bunching's top-100
over-represents Staten Island:

| Borough prefix | Top-100 emitted | Cap-suppressed (rank 101+) |
| --- | ---: | ---: |
| S (Staten Island) | 48 | 371 |
| B (Brooklyn) | 17 | 626 |
| Q (Queens) | 11 | 459 |
| QM (Queens express) | 11 | 385 |
| M (Manhattan) | 10 | 250 |
| SIM (SI express) | 2 | 682 |
| BXM (Bronx express) | 1 | 20 |
| BX (Bronx) | 0 | 92 |
| BM (Brooklyn express) | 0 | 23 |
| X (express) | 0 | 40 |

Staten Island is ~48% of the emitted top-100 but its express family (SIM, 682 cells) and the Bronx
(BX, 92 cells) are absent or nearly absent at the cap. Recorded as a finding, **not fixed in this
slice** (per the plan's "do not relax caps/thresholds"). Any reviewed-gold collection must therefore
be built from the high-limit run with cap-suppressed + borough-spread controls.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:

- `bunching-hotspots-review-queue.ts` — `buildBunchingHotspotsReviewQueue()`. Strata: `top_score`,
  `near_threshold`, `thin_pair_support`, `gap_dominant` (forces the long-gap class to be reviewed,
  not crowded out by the higher-scoring bunching class), `extreme_share` (GPS-noise review),
  `borough_spread`, `cap_suppressed_control` (score rank beyond the production cap, borough-round-robin
  sampled), `clean_control`, `skipped_control`. Cap suppression is derived from score rank vs the
  production cap because non-emitted coverage rows do not carry computed bunching/gap shares.
- `bunching-hotspots-reviewed-gold.ts` — reviewed-gold labels with stop-direction-hour identity,
  suppress-leakage + reviewed-primary survival evaluation, and readiness buckets with
  skipped-coverage accounting. Calibration vocabulary covers both reason classes plus thin pair
  support, GPS-arrival-noise artifacts, terminal dispatch artifacts, and the single-cell
  generalization caveat.

Both are pure applied-research code, fixture-tested in
`packages/applied-research/test/bunching-hotspots-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

Queue built from a `--rows-output` high-limit run (per the module contract: cap suppression is
derived from score rank vs the production cap of 100, and non-emitted coverage rows do not carry
computed shares):

```bash
bun run pipeline findings run-detector --detector-id bunching_hotspots \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-bunching-hotspots/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-bunching-hotspots/run-rows.json
bun --conditions=source <build review queue from run-rows.json>
```

`run-rows.json` was 768 MB (650,264 coverage rows) and was deleted after queue construction; the
full queue items array (650,264 rows) was likewise not persisted. `review-queue.selected.json`
keeps the full summary plus the 54 `selectedForReview` items.

Queue summary (3,048 high-limit candidates; production cap emits the top 100):

| Stratum | Population | Selected |
| --- | ---: | ---: |
| `top_score` | 1 | 1 |
| `thin_pair_support` | 87 | 10 |
| `extreme_share` | 11 | 10 |
| `borough_spread` | 1 | 1 |
| `near_threshold` / `gap_dominant` | 0 | 0 |
| `cap_suppressed_control` | 2,948 | 16 |
| `clean_control` | 883 | 8 |
| `skipped_control` | 646,333 | 8 |

Structural readout: **98 of the production top-100 land in the `thin_pair_support` or
`extreme_share` risk strata** (87 + 11), i.e. almost the entire emitted set has fewer than 50
headway pairs and/or a dominant share at or above 0.75. The `gap_dominant` stratum is empty only
because every gap-class cell in the top-100 was already claimed by a risk stratum. Reason mix at
the high limit: 2,676 `headway_gap_hotspot` vs 372 `bunching_hotspot`.

## Reviewed Gold (batch `2026-06-11-march-initial-54`)

All 54 selected rows labeled (adversarial depth on the 38 emitted + cap-suppressed rows, light on
clean/skipped controls); decisions in `reviewed-decisions.json`, gold in `reviewed-gold.json`.

| Label | Count | Identities |
| --- | ---: | --- |
| `primary_finding` | 1 | S54:N:201690 hour 15 (51 pairs, high confidence, bunching 0.647) |
| `route_context` | 3 | S54 corridor duplicates 200263/200266/201688 |
| `reviewer_only` | 3 | S46:E:905157, S46:W:905004, S78:E:201038 |
| `needs_more_evidence` | 1 | Q11:N:982137 (school-overlay baseline mismatch) |
| `suppress` | 46 | 10 extreme-share gap artifacts + 4 duplicate-pocket cells + 16 cap-suppressed controls + 8 clean + 8 skipped |

Review findings worth keeping:

- **Gap-class emissions are dominated by arrival-coverage artifacts.** Every reviewed
  `headway_gap_hotspot` cell (10 emitted extreme-share + 16 cap-suppressed) had 20-30 observed
  pairs against a scheduled baseline implying ~50-330 pairs (6-47% arrival coverage, detector
  confidence low). With `gapRatio` 2, each missing arrival converts two real headways into one
  measured "gap", so gap shares of 0.5-0.95 at that coverage measure the feed, not the service.
  All 26 were labeled suppress with `feed_gap_or_coverage_artifact`.
- **Cross-route/corridor duplicate scope is real but mostly corridor-shaped in the top-100.** 558
  stopIds carry multiple emitted cells at the high limit (worst pockets: Eltingville Transit
  Center 9 cells/8 routes, Church St/Fulton St 9 cells/6 routes, E 57 St/Madison Av 8 cells/6
  routes — SIM/QM express pickup pockets in Manhattan). Among selected emitted rows the duplicates
  are same-route adjacent-stop platoon measurements (S54 5 cells, Q11 3 cells, QM35 3 cells, M104,
  S90, S46 2 cells each). One canonical identity was kept per pocket (primary/needs-more-evidence/
  reviewer-only) with duplicates labeled route_context or suppress.
- **Hour-15 school overlays break the scheduled-headway baseline.** Q11 observed ~2x the scheduled
  hourly trip count, so its 0.55-0.59 "bunching" shares are computed against the wrong baseline;
  the S54 primary carries the same caveat in its notes (data quality there is high, claim stays
  descriptive).
- Labels were assigned on merit and never moved to make evaluation pass; the resulting suppress
  leakage below is the reportable finding.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

Evaluation runs against the production-emitted set (top-100 by score, the same rank ordering the
queue uses), not the 3,048 high-limit candidates, so it reflects serving behavior.

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **1/1** |
| Suppress leakage | **14/46** (10 extreme-share gap artifacts + 4 duplicate-pocket cells, all in the production top-100) |
| Unreviewed emitted candidates | 78 (of the production top-100) |
| Readiness buckets | 1 `public_finding_candidate`, 3 `route_context`, 82 `review_queue` (4 reviewed + 78 unreviewed emitted), 46 `suppressed` |
| Coverage skipped (readiness-only accounting) | 646,333 (646,325 unreviewed) |

No detector thresholds or caps were changed. The leakage is recorded as a calibration finding, not
patched: the fixes belong in readiness gating (arrival-coverage floor relative to the scheduled
baseline for the gap class, and stop-pocket dedupe to one canonical cell), not in threshold edits.

## Materialization-Coverage Limit on Fleet Claims

`data/artifacts/materialization-coverage/feature-grain-materialization-coverage-2026-03.json`
records the `stop_direction_hour` grain as `status: "partial"` with 650,264 scopes materialized and
**no enumerated fleet universe** (`fleetUniverse: null`, `coverageShare: null`). Any fleet-level
readiness claim from this calibration must cite that gap: the 3,048 qualifying cells and the
borough mix above describe the materialized population only, not the full stop-direction-hour
universe.

## Recommendation

`bunching_hotspots` is **not** calibrated for public promotion at the ADR-0018 floor. March 2026
gold shows 14/46 suppress leakage in the production top-100: the emitted set is dominated by
low-coverage gap artifacts and duplicate corridor cells, with exactly one label-backed public
finding candidate (which survives, 1/1). Before promotion the detector needs (as readiness gates,
not threshold relaxations): an arrival-coverage check against the scheduled baseline for the
`headway_gap_hotspot` class, stop-pocket/corridor dedupe to a canonical cell, and a school-overlay
baseline check for hour-level bunching claims. Serving promotion remains gated on the readiness
manifest path (S4.1).
