# Degradation Trend Calibration Inventory

Generated: 2026-06-10

## Scope

ADR-0018 slice for `degradation_trend` (Wave 2 #5 in
`docs/research/backend-goal-finish-detectors.md`). Records a no-write inventory and adds
deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection
machinery for the **route_metric_history** grain (route/segment scope, single `worsening_trend`
reason class, standard 5-bucket frontend-use vocabulary). It does not claim public readiness and does
not promote any finding. No detector thresholds or caps were changed.

The detector scores metric histories with a worsening robust-z (≥3) plus a positive Theil-Sen slope
on a worse-oriented series, and emits the top `candidateLimit` (default 100) by score (60–100).

## No-Write Run (default cap) + High-Limit Probe

```bash
bun run pipeline findings run-detector --detector-id degradation_trend \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-degradation-trend/no-write-run.json
bun run pipeline findings run-detector --detector-id degradation_trend \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-degradation-trend/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature scopes (route_metric_history) | 367 | 367 |
| Emitted candidates | 6 | 6 |
| Coverage rows (hit / clean_no_hit / skipped) | 6 / 341 / 20 | 6 / 341 / 20 |

**No cap suppression** (6 = 6 at the high limit; far under the 100 cap). The detector is genuinely
conservative — only 6 of 348 supported scopes clear the robust-z ≥ 3 + positive-slope gate. The
dominant review risk is therefore **history confidence**, not the cap: the schedule-mismatch lesson
generalized — brittle single-delta worsening on thin history or a short prior baseline, plus
route-version/series breaks and seasonality the detector does not model. The emitted set is small and
Queens-heavy (sample: Q=5, B=1); a single review batch can census all 6.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:

- `degradation-trend-review-queue.ts` — `buildDegradationTrendReviewQueue()`. Strata: `top_score`,
  `near_threshold`, `thin_history` (supported point count below the high-confidence floor),
  `short_baseline` (prior baseline at/near the minimum), `segment_scope`, `borough_spread`,
  `cap_suppressed_control` (rank-based, empty this month), `clean_control`, `skipped_control`. Uses
  the shared S2.2 `cap-policy` helpers.
- `degradation-trend-reviewed-gold.ts` — standard 5-bucket reviewed-gold, suppress-leakage +
  reviewed-primary survival evaluation, and readiness projection. Calibration vocabulary covers
  route-version-break confounds, seasonal artifacts, thin history / short baseline, and the
  single-metric-not-corroborated caveat.

Both are pure applied-research code, fixture-tested in
`packages/applied-research/test/degradation-trend-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id degradation_trend \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-degradation-trend/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-degradation-trend/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Same population as the inventory run: 6 emitted, 367 coverage rows (6 hit / 341 clean_no_hit /
20 skipped). The queue derives cap suppression from score rank vs the production cap (100), so no
high-limit rerun was needed for queue building; the existing `no-write-run-limit20000.json` probe
already confirmed 0 cap suppression and the rank-based check agrees (capSuppressedCount 0).

22 rows selected for review: all 6 emitted candidates (4 `top_score`, 2 `near_threshold`; none hit
the thin-history/short-baseline/segment-scope strata — every emit has 36/36 points, 35-point prior
baseline, route scope), 8 borough-spread `clean_control` rows, 8 `skipped_control` rows (all
`insufficient_history` with 0–5 supported points, plus B102 with a 7-month window).

## Reviewed Gold (batch `2026-06-11-march-initial-22`)

All 22 selected rows labeled (adversarial depth on the 6 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`. Review read the full 36-month point series
from the primary evidence refs, including same-month prior-year (March-over-March) comparisons and
route-version fields.

| Label | Count | Routes |
| --- | ---: | --- |
| `primary_finding` | 1 | Q103 (genuine gradual 3-year decline: yearly medians 8.24→8.13→7.82, Marches 8.27→8.17→7.73, no break) |
| `reviewer_only` | 1 | B82+ (score 63 near the floor; decline confined to trailing ~7 months; 2026-02 outlier dip then March recovery) |
| `needs_more_evidence` | 4 | Q22, Q65, Q100, Q102 (late-2025 step breaks, see below) |
| `suppress` | 16 | 8 clean controls + 8 skipped controls (`insufficient_history` gate working as designed) |

Review findings worth keeping:

- **Step breaks masquerading as trends (dominant failure mode).** Q22 (score 90, robust-z 11.1),
  Q65 (90), Q100 (81), and Q102 (66) are all one-month level shifts in the 2025-07..2025-09 window
  (e.g. Q22: flat ~11.7 mph, drop to 8.9 at 2025-09, flat ~9.0 since), not gradual trends. Every
  history point carries `routeVersion: null` and `routeVersionBreakCount` is 0, so the detector's
  route-version-break machinery has no provenance to work with — the break window is consistent
  with the Queens service changes and the "worsening trend over 36 months" claim text
  mischaracterizes the shape. Labeled `needs_more_evidence` with `route_version_break_confound`;
  the fix is route-version provenance in the history grain (a readiness gate), not a threshold
  change.
- **No seasonal artifacts.** March-over-March comparisons on all 6 emits track the level shifts /
  gradual decline, not a month-of-year effect; `seasonal_artifact` was not used this batch.
- **Latest-month-improved is common but benign here.** 5 of 6 emits improved in 2026-03 vs
  2026-02; in each case the value stays inside the post-break or trend band, so none flipped a
  label on its own, but B82+'s recovery (8.0 → 8.63 after a single outlier dip) is part of why it
  is `reviewer_only`.
- **Q100 post-break plateau is suspicious.** Six near-identical ~11.2 values after the break
  suggest a possible coverage/aggregation change; noted for a source audit independent of
  route-version provenance.
- **MAD-driven sensitivity at the floor.** B82+ clears robust-z 3 partly because its baseline MAD
  is tiny (0.084), so modest absolute movement scores; stays a readiness observation, not a
  threshold proposal.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **1/1** |
| Suppress leakage | **0/16** |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 1 `public_finding_candidate`, 0 `route_context`, 5 `review_queue`, 16 `suppressed` |
| Coverage skipped (readiness-only accounting) | 20 (12 unreviewed) |

No detector thresholds or caps were changed; all gates were already label-consistent.

## Recommendation

`degradation_trend` is calibrated at the ADR-0018 floor for March 2026: zero suppress leakage and
full reviewed-primary survival, but only 1 of 6 emits survives adversarial review as a public
finding candidate. The dominant defect is not sensitivity but claim shape: 4 of 6 emits are
unprovenance'd step breaks scored as trends. Before any promotion, the route_metric_history grain
needs route-version/service-change provenance so `routeVersionBreaks` is populated; until then the
step-break emits stay `needs_more_evidence` in the review queue. History-confidence gates remain
readiness gates backed by these labels — never threshold relaxations.
