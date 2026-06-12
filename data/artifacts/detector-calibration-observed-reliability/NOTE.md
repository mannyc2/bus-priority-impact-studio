# Observed Reliability Calibration Inventory

Generated: 2026-06-09

## Scope

This is the first ADR-0018 slice for `observed_reliability`. It records a no-write inventory and
adds deterministic reviewed-gold, evaluation, and readiness-projection scaffolding for route-month
labels. It does not claim public readiness and does not promote any finding.

The detector resolves the `route_reliability_month` feature grain through
`sqlite.local_route_observed_reliability_summary.v1`. Its current support inputs are GTFS-RT
observed reliability rows, scheduled baseline headway support, and Bus Wait Assessment context.

## No-Write Run

Command:

```bash
bun run pipeline findings run-detector --detectorId observed_reliability --year 2026 --month 3 --writeDb false --output data/artifacts/detector-calibration-observed-reliability/no-write-run.json
```

Result:

| Metric | Count |
| --- | ---: |
| Input routes | 381 |
| Feature rows | 381 |
| Observed GTFS-RT routes | 350 |
| Scheduled-baseline routes | 369 |
| Bus Wait Assessment routes | 343 |
| Emitted candidates, default cap | 100 |
| Evidence rows | 200 |
| Coverage rows | 381 |
| Hit rows | 100 |
| Clean no-hit rows | 242 |
| Skipped rows | 39 |

The run used `wroteDb=false`.

### High-Limit Cap Probe

Command:

```bash
bun run pipeline findings run-detector --detectorId observed_reliability --year 2026 --month 3 --writeDb false --candidateLimit 1000 --output data/artifacts/detector-calibration-observed-reliability/no-write-run-limit1000.json
```

Result:

| Metric | Default cap | Candidate limit 1000 |
| --- | ---: | ---: |
| Emitted candidates | 100 | 220 |
| Evidence rows | 200 | 440 |
| Coverage rows | 381 | 381 |
| Hit rows | 100 | 220 |
| Clean no-hit rows | 242 | 122 |
| Skipped rows | 39 | 39 |

The high-limit probe shows 120 route-month rows qualify under the detector thresholds but are not
emitted by the default top-100 cap. The review queue therefore needs cap-suppressed controls and
borough/route-prefix spread before any reviewed-gold promotion decision.

## Initial Calibration Slice

Package-owned deterministic machinery now exists for:

- reviewed-gold labels with route-level identity keys,
- suppress-leakage and reviewed-primary survival evaluation,
- readiness buckets: `public_finding_candidate`, `route_context`, `review_queue`, `suppressed`,
- skipped-coverage accounting for low-support rows such as missing BWA or scheduled baselines.

This mirrors the existing customer-journey and treatment-scope readiness pattern without changing
the detector's thresholds or candidate cap.

## Stratified Review Queue Builder

`@bp/applied-research/evaluation` now has a fixture-testable
`buildObservedReliabilityReviewQueue()` builder. It enriches a no-write detector output into strata:
top score, near threshold, low GTFS-RT samples, weak scheduled-baseline support, weak BWA support, BWA
conflict, borough spread, cap-suppressed controls, clean controls, and skipped controls.

The builder is pure applied-research code over candidate/evidence/coverage rows. A commandized writer
for a full-output queue artifact is still needed because `findings run-detector` currently persists
only the summarized registry run artifact.

## Full-Output Run + Review Queue (2026-06-11)

Two `--rows-output` passes (the run artifact keeps only samples):

```bash
bun run pipeline findings run-detector --detector-id observed_reliability \
  --year 2026 --month 3 --write-db false --candidate-limit 1000 \
  --output data/artifacts/detector-calibration-observed-reliability/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-observed-reliability/run-rows.json
bun run pipeline findings run-detector --detector-id observed_reliability \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-observed-reliability/no-write-run-default-cap.json \
  --rows-output data/artifacts/detector-calibration-observed-reliability/run-rows-default-cap.json
bun --conditions=source <build review-queue.json from run-rows-default-cap.json>
```

Cap semantics matter for this detector (100 emitted vs 220 qualifying), so the queue was built from
the **default-cap** rows: the builder marks a row cap-suppressed only when it qualifies under all
thresholds but was not emitted, which only happens under the production top-100 cap. The high-limit
pass cross-checks the accounting: queue `capSuppressedCount` = 120 = 220 − 100 exactly.

Cap bias is borough/route-family skewed: emitted candidates are B 42 / BX 31 / M 12 / Q 11 / S 4,
while the 120 cap-suppressed qualifiers are Q 24 / QM 17 / S 16 / SIM 12 / M 13 / B 12 / BX 11 /
BXM 6 / BM 5 / X 4 — Queens locals and express/commuter families bear most of the cap suppression.

58 rows selected for review: 12 `top_score`, 8 `bwa_conflict`, 10 `borough_spread` (all emitted;
`near_threshold`/`low_gtfs_rt_samples`/`weak_schedule_baseline`/`weak_bwa_support` strata were
empty), 12 `cap_suppressed_control`, 8 `clean_control`, 8 `skipped_control`. With 100 emitted
candidates (>40), the selected set is the review batch; the 70 unreviewed emitted candidates stay in
the review queue bucket.

## Reviewed Gold (batch `2026-06-11-march-initial-58`)

All 58 selected rows labeled (adversarial depth on emitted candidates and cap-suppressed qualifiers,
light on clean/skipped controls); decisions in `reviewed-decisions.json`, gold in
`reviewed-gold.json`.

| Label | Count | What it covers |
| --- | ---: | --- |
| `primary_finding` | 22 | All 12 top-score + 10 borough-spread emitted rows: every threshold cleared with margin and BWA ≤ 0.70 corroborates the GTFS-RT shortfall |
| `route_context` | 14 | 8 emitted `bwa_conflict` rows (BWA in [0.70, 0.75) just under the corroboration ceiling) + 6 cap-suppressed local/SBS qualifiers (B46+, B82+, BX12+, M125, Q6, S48) |
| `needs_more_evidence` | 7 | 6 cap-suppressed express/commuter qualifiers (BM1, BM3, BXM11, QM20, SIM6, X38: long-gap semantics against sparse scheduled headways are aggregation-sensitive) + B42 (strong GTFS-RT signal, BWA entirely missing) |
| `suppress` | 15 | 8 clean controls (all held back by the 0.75 BWA ceiling working as designed, e.g. M96 with long-gap share 0.77 but BWA 0.83 contradicting) + 7 skipped controls (shuttles/non-revenue scopes, sub-minimum GTFS-RT samples) |

Review findings worth keeping: the BWA corroboration ceiling is the load-bearing gate — every clean
control was held back by it, including M96/Q27 with severe GTFS-RT readings that the survey metric
contradicts; B100, S53, and SIM1C sit within 0.02 of the 0.75 ceiling (knife-edge, re-review next
month). Missing BWA (B42, J90, L90) and sub-minimum GTFS-RT samples (BX95 at 64, Q70+ at 84) map to
`needs_more_evidence`/`suppress` readiness states, never to threshold relaxation. The dominant open
risk is cap bias, not gate leakage: 120 qualifying route-months are invisible under the production
cap and skew toward Queens and express families.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

Evaluated against the **production default-cap (top-100) candidate set**, because that is what
serving would see; the high-limit set would hide the cap bias the calibration exists to measure.
`asOfMonth` 2026-06.

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **22/22** |
| Suppress leakage | **0/15** |
| Context/reviewer expected → still emitted | 8/21 (the 8 emitted `bwa_conflict` rows, expected) |
| Unreviewed emitted candidates | 70 (cap 100 vs 58-row review batch) |
| Readiness buckets | 22 `public_finding_candidate`, 14 `route_context`, 77 `review_queue` (7 needs-more-evidence + 70 unreviewed emitted), 15 `suppressed` |
| Coverage skipped (readiness-only accounting) | 39 (31 unreviewed) |

No detector thresholds or caps were changed; all gates were already label-consistent.

## Recommendation

`observed_reliability` passes the ADR-0018 floor on the reviewed slice for March 2026: zero suppress
leakage and full reviewed-primary survival against the production-cap candidate set, with the BWA
corroboration ceiling verified as the gate doing the real work. It is **not** ready for blanket
public promotion: 70 of 100 emitted candidates are unreviewed, and the top-100 cap suppresses 120
qualifying route-months with a borough/route-family skew (Queens locals, express/commuter families).
Next steps are widening reviewed coverage of the emitted set and deciding cap policy via the S2.2
cap-policy helper — cap bias is a readiness/coverage question, never a threshold relaxation. Serving
promotion remains gated on the readiness manifest path (S4.1).
