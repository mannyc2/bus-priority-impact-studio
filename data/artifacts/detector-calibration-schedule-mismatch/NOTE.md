# Schedule Mismatch Calibration Inventory

Generated: 2026-06-10

## Scope

ADR-0018 slice for `schedule_mismatch` (Wave 2 #8 in
`docs/research/backend-goal-finish-detectors.md`). Records a no-write inventory and adds
deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection
machinery for the **route-direction-daypart** grain. It does not claim public readiness and does not
promote any finding. No detector thresholds or caps were changed.

The detector scores cells by signed runtime deviation (`observed_median / scheduled - 1`) and emits
the top `candidateLimit` (default 100) by absolute deviation (score 60–100). It carries two reason
classes: `schedule_too_tight` (observed slower than scheduled) and `schedule_padding_review`
(observed faster — possible padding). Coverage `inputsSeenJson` carries scheduled + observed median +
trips, so cap suppression is computed **directly from coverage**.

## No-Write Run (default cap) + High-Limit Probe

```bash
bun run pipeline findings run-detector --detector-id schedule_mismatch \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-schedule-mismatch/no-write-run.json
# high-limit probe
bun run pipeline findings run-detector --detector-id schedule_mismatch \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-schedule-mismatch/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature cells (route-direction-daypart) | 2,537 | 2,537 |
| Emitted candidates | 100 | 2,434 |
| Coverage rows | 2,537 | 2,537 |

**2,434 cells qualify above the emission threshold (|deviation| >= 0.15) — the default top-100 cap
suppresses 2,334 (95.9%).** This is the most cap-biased reliability detector inventoried so far: the
emitted top-100 sample is saturated at score 100 (deviation well past threshold) and entirely
Brooklyn in the sampled rows, while the qualifying population spans every borough and is Queens-heavy.

## Cap Bias

| Borough prefix | Qualifying (hi-limit) |
| --- | ---: |
| Q (Queens) | 709 |
| B (Brooklyn) | 462 |
| BX (Bronx) | 341 |
| M (Manhattan) | 311 |
| S (Staten Island) | 199 |
| SIM (SI express) | 141 |
| QM (Queens express) | 125 |
| BXM (Bronx express) | 83 |
| BM (Brooklyn express) | 31 |
| X (express) | 22 |
| J | 8 |
| L | 2 |

Recorded as a finding, **not fixed in this slice**. With 2,434 qualifying cells and a saturated
top-100 score, the cap is an arbitrary tie-broken slice; the cap-suppressed + borough-spread controls
are mandatory, and the reviewed queue must draw from the high-limit run. The fix-once cap discipline
is S2.2.

## Both Reason Classes

The padding class (`schedule_padding_review`) is structurally rarer and lower-scoring than the
too-tight class, so an unstratified queue would review almost only too-tight cells. The queue forces
a dedicated `padding_review` stratum so the "padded schedules look reliable" failure mode is reviewed
alongside the higher-scoring tight class. `emittedByReasonCode` is recorded in the queue summary.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:

- `schedule-mismatch-review-queue.ts` — `buildScheduleMismatchReviewQueue()`. Strata: `top_score`,
  `near_threshold`, `padding_review` (forces the minority reason class), `thin_trip_support`,
  `service_pattern_caveat`, `borough_spread`, `cap_suppressed_control` (computed from coverage
  scheduled/observed/trips, borough-round-robin sampled), `clean_control`, `skipped_control`.
- `schedule-mismatch-reviewed-gold.ts` — reviewed-gold labels with route-direction-daypart identity,
  suppress-leakage + reviewed-primary survival evaluation, and readiness buckets. Calibration
  vocabulary covers both reason classes plus congestion/incident confounds, thin trips,
  service-pattern breaks, and the single-cell generalization caveat.

Both are pure applied-research code, fixture-tested in
`packages/applied-research/test/schedule-mismatch-{review-queue,reviewed-gold}.test.ts`.

## Remaining Work

- Schedule-corpus completeness audit before promotion (the dominant Wave 2 #8 risk).
- Commandize a full-output review-queue writer (shared gap across reliability slices).
- Label a stratified queue across boroughs and both reason classes; require suppress leakage = 0 and
  report reviewed-primary survival before serving promotion.

## Recommendation

Per the plan, **expect readiness to cap at `route_context`** until route-version rules are
strengthened (ideal-doc family 4); that capped outcome is a *valid* calibration result, not a
failure. `schedule_mismatch` is ready for first review-queue construction and gold-label collection
from the high-limit run. It is **not** ready for public promotion until the schedule corpus is
audited, the queue is stratified across boroughs and both reason classes, and the readiness
projection reports zero suppress leakage with label-backed survival.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id schedule_mismatch \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-schedule-mismatch/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-schedule-mismatch/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Queue built from the **default-cap** run. No high-limit rerun was needed because
`buildScheduleMismatchReviewQueue()` computes cap suppression directly from coverage
`inputsSeenJson` (scheduled + observed median + trips), not from rank vs the production cap; the
2,334 cap-suppressed qualifiers it finds match the earlier 20,000-limit probe exactly
(2,434 qualifying − 100 emitted). The gold evaluation therefore runs against the production
(top-100) emitted set, which is the set that would actually serve.

52 rows selected for review of 100 emitted / 2,537 coverage: 12 `top_score`, 2 `padding_review`
(the entire minority reason class), 10 `borough_spread`, 12 `cap_suppressed_control`
(borough-round-robin across all 12 prefixes), 8 `clean_control`, 8 `skipped_control`. Confirming
the cap-bias finding: all 100 emitted candidates are borough prefix `B`, every emitted candidate is
saturated at score 100, and the `near_threshold`, `thin_trip_support`, and `service_pattern_caveat`
strata are empty in the emitted set.

## Reviewed Gold (batch `2026-06-11-march-initial-52`)

All 52 selected rows labeled (adversarial depth on the 24 emitted, light on the 28 controls);
decisions in `reviewed-decisions.json`, gold in `reviewed-gold.json`.

| Label | Count | What |
| --- | ---: | --- |
| `primary_finding` | 0 | — |
| `route_context` | 0 | — |
| `needs_more_evidence` | 24 | every reviewed emitted candidate (both reason classes) |
| `reviewer_only` | 0 | — |
| `suppress` | 28 | 12 cap-suppressed controls + 8 clean controls + 8 skipped controls |

**Schedule-provenance review finding (the headline):** not one reviewed emitted candidate has a
verifiable schedule baseline. The too-tight class compares scheduled runtimes of 15–151 minutes
against observed median one-way runtimes of 175–650 minutes — physically impossible trip durations
for these routes — and the scheduled side frequently reads as a partial schedule-stop pair (B1 cells
carry a constant ~16-minute "scheduled runtime" across all dayparts while observed medians run
280–478 minutes; cap-suppressed controls go as low as 1–3 scheduled minutes, e.g. B25 E pm_peak at
+46,406%). The padding class is the mirror image: B111 midday claims rest on 126–127-minute
scheduled baselines that are implausibly long while the observed 25–32 minutes is the credible side.
`servicePatternVersion` is `route_segment_speed_plus_schedule_stop.v1` — a derivation-method label,
not an identifier of the schedule version actually in effect — so the key calibration question
("is the schedule compared against the one in effect?") cannot be answered from the metrics. Tagged
throughout with `service_pattern_break` + `not_actionable_as_claim`.

Because the deviation magnitudes are corpus artifacts, the honest ceiling for the emitted set came
out **below** the plan's `route_context` expectation: even route-page context would surface garbage
percentages (e.g. "differs by 2489.5%"), so the emitted candidates are labeled
`needs_more_evidence` (review-queue bucket), not `route_context`. The plan
(`docs/research/backend-goal-finish-detectors.md`, Wave 2 #8) predicts readiness capping at
`route_context` until route-version rules are strengthened; this slice confirms the prediction and
sharpens it — with the current schedule corpus the data support zero `route_context` cells. That
capped outcome is the valid calibration result, not a failure; no labels were moved to manufacture
survival.

Secondary findings worth keeping: the skip gates work (`baseline_unavailable` 38,
`insufficient_runtime_observations` 7 — all reviewed skips were correct suppressions); the few cells
where scheduled and observed magnitudes are mutually plausible are all *clean controls* below
threshold (B2, BX33, M14D+, Q103...), which itself measures how rare verifiable baselines are; thin
trips (<20) appear only in controls.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **0/0** (no primary labels; vacuous by design) |
| Suppress leakage | **0/28** |
| Context/reviewer-class still emitted | 24/24 (all `needs_more_evidence`, all emitted) |
| Unreviewed emitted candidates | 76 |
| Readiness buckets | 0 `public_finding_candidate`, 0 `route_context`, 100 `review_queue`, 28 `suppressed` |
| Coverage skipped (readiness-only accounting) | 45 (37 unreviewed) |

No suppress-labeled cell is emitted (the leakage that exists is structural, not label leakage: the
2,334 cap-suppressed qualifiers share the emitted set's corpus pathology and are correctly held
back today only by the arbitrary top-100 cap). No detector thresholds or caps were changed.

## Recommendation (updated 2026-06-11)

`schedule_mismatch` completes the ADR-0018 loop with zero suppress leakage but **zero promotable
cells**: all 100 production emissions sit in `review_queue` pending a schedule-corpus completeness
audit and route-version rules (ideal-doc family 4). This is the expected capped outcome — in fact
stricter than the plan's `route_context` ceiling, because the reviewed evidence shows the scheduled
baselines themselves are untrustworthy, not merely unversioned. Do not promote anything from this
detector, including as route context, until (1) scheduled runtimes are rebuilt from a complete
schedule corpus with verifiable in-effect versions, (2) the observed-runtime aggregation is audited
(one-way medians of 300–650 minutes indicate the runtime derivation also needs review), and (3) the
S2.2 cap discipline replaces the borough-biased top-100 slice. Re-run this loop after those land.
