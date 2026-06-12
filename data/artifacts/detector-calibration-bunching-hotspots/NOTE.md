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

## Ranking fix (2026-06-11)

Implemented the sample-density-aware ranking in `packages/analytics/src/findings/bunching-hotspots.ts`
(no floor/cap/threshold change; gold labels untouched):

- `detectorScore = round(60 + 40 × severitySignal × observationSufficiency, 2)` where
  `severitySignal` is the prior `clamp((max(bunchingSignal, gapSignal) − 1) / 2, 0, 1)` and
  `observationSufficiency = min(1, pairCount / highConfidencePairs[50]) × (quality.coverageShare ?? 1)`
  (shared `observationSufficiencySignal` helper in `headway-common.ts`). Candidate sort tie-breaks
  deterministically by featureKey asc. Thin cells still emit (high-limit count unchanged at 3,048);
  they just rank lower.

Re-run + re-evaluation (`no-write-run-rankfix.json`, `no-write-run-limit20000-rankfix.json`,
`evaluation-rankfix.json`, `readiness-projection-rankfix.json`; rows file rebuilt and deleted):

| Metric | Before | After |
| --- | ---: | ---: |
| Score saturation | emitted range 92–100, heavy ties | gone — unique max 100, 19 cells ≥92, 41 cells ≥80, 899 distinct scores, top-100 spans 72.02–100 |
| S54:N:201690 hr15 (primary) rank | in top-100 (survived) | **1** |
| Suppress-labeled cells in top-100 | 14/46 | **5/46** |
| Arrival-coverage gap artifacts in top-100 | 10 | 1 (B37:N:302903 at rank 93; the other 9 now rank 128–1,370) |
| Reason mix in top-100 | gap-class dominated at high limit | 92 bunching / 8 gap |

The 5 remaining leaks are B37:N:302903 (rank 93, the last feed-gap artifact, 30 pairs right at the
sufficiency knee) plus 4 duplicate-pocket cells (Q11:N:553364 r4, Q11:N:550717 r9 — school-overlay
baseline mismatch; S46:W:203087 r48; S54:N:201687 r70). Duplicate-pocket leakage is structurally
out of reach of a sufficiency ranking — those cells are well-observed measurements of the same
platoon — and stays assigned to the stop-pocket dedupe readiness gate (and school-overlay baseline
check) already recommended above. Primary survival stays 1/1; `evaluation-rankfix.json` records
suppress leakage 5/46 (was 14/46).

## Batch 2: post-fix top-100 review (2026-06-11)

Re-ran with full rows (`no-write-run-batch2.json`; the 768 MB rows file was used for extraction and
deleted), derived the production top-100 by the production ranking (detectorScore desc, featureKey
asc, slice 100 — verified against `packages/analytics/src/findings/bunching-hotspots.ts`), and
labeled every top-100 cell not already in batch-1 gold: **87 new labels**, all adversarial depth,
batch `2026-06-11-postfix-top100-87` in `reviewed-decisions-batch2.json`. 13 of the top-100 were
already labeled in batch 1 (including the rank-1 primary and the 5 known leaks).

Batch-2 label distribution (87 new cells): 1 `primary_finding` (Q31:S:501518 hr15, 94 pairs,
coverage 0.97, obs ≈ schedule-implied — canonical of the Q31 southbound school-dismissal corridor),
2 `needs_more_evidence` (S56:N:202888 hr14 canonical at 46 pairs; S78:E:200285 Bay St hr15 at
coverage 0.71), 6 `reviewer_only` (pocket canonicals: S59 Hylan/Luten, Q31 hr14, S56 hr15, S55/S56
AM school run, S96:W hr19 gap class, QM35:W 3 Av gap corridor), 39 `route_context` (well-observed
duplicate-pocket members), 39 `suppress`.

Structural readout — **78 of the production top-100 are non-canonical members of one of 14
stop/corridor pockets** (S54 Manor Rd 24 dups, Q31:S hr15 14 + hr14 5, S56:N hr14 13, S78:E Hylan
hr14 7, plus smaller school/express pockets). That is the size of the stop-pocket dedupe-gate
slice: a canonical-cell gate would collapse the top-100 to ~22 independent identities. Second
recurring failure: **observed-vs-schedule-implied baseline mismatch** (obs ≥ 1.4× expected:
QM36:W:450001 r20, S79+:E:805168 r37, S54:N:201687-hr14 r61, S86:S:202502 r64, QM8:W:403639 r72) —
school overlays and express short-turns break the scheduled-headway denominator, same mode as the
batch-1 Q11 pocket. Gap-class cells were checked against arrival coverage per the batch-1 rule;
only one classic feed-gap artifact remains in the top-100 (B37 r93, batch 1).

Combined gold (`reviewed-gold-combined.json`, batch 1 unchanged + batch 2; evaluation against the
production top-100 in `evaluation-combined.json`, readiness in
`readiness-projection-combined.json`, asOfMonth 2026-06):

| Metric | Value |
| --- | ---: |
| Gold labels | 141 (54 + 87) |
| Primary survival | **2/2** (S54:N:201690 r1, Q31:S:501518 r29) |
| Suppress leakage in top-100 | **44/85** — every top-100 cell is now reviewed (unreviewed emitted: 0) |
| Leakage characterization | 35 duplicate-pocket (dedupe gate), 5 baseline-mismatch (overlay/baseline check), 4 coverage/thin artifacts (1 batch-1 B37 + B16:N:301616 at coverage 0.52, S59:N:200407, S55:N:202335) |
| Top-100 label mix | 2 primary, 42 route_context, 9 reviewer_only, 3 needs_more_evidence, 44 suppress |
| Readiness buckets | 2 `public_finding_candidate`, 42 `route_context`, 12 `review_queue`, 85 `suppressed`; coverage skipped 646,333 |

Of the 5 pre-batch-2 known leaks: 4 are dedupe-gate leaks (Q11 ×2, S46:W:203087, S54:N:201687
hr15) and 1 is the B37 coverage artifact — confirmed by the batch-2 characterization above. The
post-fix top-100 is no longer artifact-dominated (the rank fix did its job: bunching-class,
well-observed cells), but it is **duplicate-dominated**: the binding readiness gates are now stop-
pocket dedupe and overlay-aware baselines, exactly as recommended. No thresholds, caps, or
production code were changed in this batch; labels were assigned on merit.
