# Intervention Event Study Calibration Inventory

Generated: 2026-06-10

## Scope

ADR-0018 slice for `intervention_event_study` (Wave 3 #12 in
`docs/research/backend-goal-finish-detectors.md`). Adds deterministic, fixture-tested review-queue,
reviewed-gold, evaluation, and readiness-projection machinery for the **intervention-panel** grain
(treated route/segment scope). **Family adaptation (candidate-causal): readiness caps at methodology
review — there is NO public bucket for effect language without human methodology approval.** No
detector thresholds or caps were changed.

## No-Write Run (default cap) + High-Limit Probe

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Emitted candidates | 100 | 236 |
| Coverage rows (hit / clean_no_hit / skipped) | 100 / 136 / 505 | 236 / 0 / 505 |

**236 panels qualify above the emission threshold; the default top-100 cap suppresses 136 (57.6%).**
Real cap bias on this causal detector. The qualifying population spans boroughs (hi-limit: Q=58,
BX=52, M=50, B=33, QM=22 …), so reviewed-gold must be drawn from the high-limit run with
cap-suppressed + borough-spread controls. 505 panels skipped (no window / no counterfactual / no
estimate).

## Family adaptation: internal/methodology-review-only (never public)

Per the plan, calibration here is **"labeling panel quality, not effect truth."** The reviewed-gold
uses an internal-only vocabulary keyed on the methodology gates:

| frontend-use | meaning |
| --- | --- |
| `methodology_review_candidate` | all gates tested + passed; eligible for human methodology review |
| `associational_context` | control-eligible but not causal-gated; internal context only |
| `needs_more_evidence` | gates untested / panel incomplete |
| `suppress` | a gate failure (pre-trend / placebo / autocorrelation / method divergence) or weak controls; not a usable panel |

There is **no public bucket**. The readiness projection maps every non-suppressed label to the
internal `review_queue` bucket and never to `public_finding_candidate`/`route_context`; the evaluation
carries a structural `publicLeakageCount: 0` invariant — effect language can never reach a public
surface from this detector without human methodology approval.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:
`intervention-event-study-review-queue.ts` — strata `top_score`, `near_threshold`, `gate_pass`
(causal-eligible class forced into review), `pretrend_or_placebo_risk`, `method_divergence`,
`borough_spread`, `cap_suppressed_control` (rank-based, real here), clean/skipped controls;
`emittedByGateStatus` summary; uses the S2.2 cap-policy helper. The methodology-gate fields are read
from the evidence/coverage `gateSummary` (`candidateCausalEligible`, `associationallyScoreable`,
`blockingReasons`). `intervention-event-study-reviewed-gold.ts` — internal-only reviewed-gold + eval
(methodology-candidate survival + failed-gate suppress leakage + `publicLeakageCount: 0`) + readiness
projection (only `review_queue` + `suppressed` buckets ever populated). Fixture-tested in
`packages/applied-research/test/intervention-event-study-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id intervention_event_study \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-intervention-event-study/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-intervention-event-study/run-rows.json
```

Full-rows pass (default cap): 100 emitted candidates, 741 coverage rows (505 skipped,
`insufficient_window`). Queue built with `buildInterventionEventStudyReviewQueue()` into
`review-queue.json`: **67 items selected across 32 unique scopes** — selected by stratum: 16
`gate_pass`, 12 `pretrend_or_placebo_risk`, 5 `method_divergence`, 2 `borough_spread`, 13
`clean_control`, 19 `skipped_control`. Emitted gate status: 276 coverage rows
`candidate_causal_eligible`, 27 `associational_only`.

Two machinery findings (reported, not fixed — production code untouched):

1. **Coverage is panel-grain but identity is scope-grain.** Multiple panels per route (duplicate
   intervention/window rows, including conflicting 10-control vs 0-control
   `insufficient_window` variants for the same scope, S79+ worst at 8 rows) produce duplicate queue
   items per identity key. 67 selected items collapse to 32 unique scope identities; reviewed-gold
   labels key on detector+scope, so one decision covers each scope's duplicates. The panel-assembly
   input grain (scope × intervention × window) should be deduped upstream before the next batch.
2. **Cap suppression is real but invisible in this queue.** The default-cap rows output contains only
   the 100 emitted candidates, so the rank-based `cap_suppressed_control` stratum is empty even though
   the high-limit probe shows 136 qualifying panels suppressed (236 vs 100). A future batch must build
   the queue from a high-limit `--rows-output` pass to label the suppressed class.

## Reviewed Gold (batch `2026-06-11-march-initial-32`, candidate-causal: panel quality, not effect truth)

All 32 unique selected scopes labeled (adversarial on the 17 emitted, light on the 15 controls);
decisions in `reviewed-decisions.json`, gold in `reviewed-gold.json`. Every label carries
`never_public_without_methodology_review`.

| Label | Count | Scopes |
| --- | ---: | --- |
| `methodology_review_candidate` | 8 | QM6, BX20, Q40, QM36, QM2, SIM6, QM20, QM5 — all gates tested+passed, 10 controls, plausible magnitudes |
| `needs_more_evidence` | 2 | M35 (+1.069), B39 (−0.937) — gates pass but near-unit estimates on structurally odd routes point at treatment-dating/window contamination the gates missed |
| `associational_context` | 3 | Q82 (emitted, associational-only), B26 + BM3 (clean controls; BM3 is a gates-pass null-effect panel — honest null) |
| `suppress` (not usable panels) | 19 | 6 emitted gate failures (Q35 + QM17 placebo-in-time, S79+ placebo-in-space, S46 + BX18B placebo+method-divergence, M98 method-divergence), 9 clean controls with gate failures (gates working), 4 skipped no-counterfactual controls |

Panel-quality findings worth keeping: placebo-in-time failures sit on the highest-scoring emitted
candidates (Q35 score 93 with estimate +1.452 — the same route is a fleet-wide speed deviant, i.e.
secular trend, not effect); the detector **emits associationally-scoreable panels even when causal
gates failed**, which is by design but means emitted ≠ causal-grade; QM/express routes dominate the
gate-pass class, echoing the positive-deviance service-class skew.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOf 2026-06)

| Metric | Value |
| --- | ---: |
| Methodology-review-candidate survival | **8/8** |
| Suppress (failed-gate panel) still emitted | **6/19** — real leakage of gate-failed panels into the emitted set |
| Associational/needs-more still emitted | 3/5 |
| Unreviewed emitted candidates | 83 (queue quota; 100 emitted this cap) |
| `publicLeakageCount` | **0** (structural invariant) |
| Readiness buckets | 90 `review_queue`, 19 `suppressed`, **0 public buckets** |
| Coverage skipped | 262 identity-keys (238 unreviewed) |

The internal ceiling is **enforced in the module**: `readinessBucket()` maps every non-suppress label
to `review_queue` only, the gold type pins `shouldPromotePublic: false`, and this projection contains
zero `public_finding_candidate`/`route_context` items — the projection machinery cannot emit a public
bucket for this detector. The prior recommendation's bar ("suppress leakage = 0 before internal
methodology-review promotion") is **not met**: 6 reviewed failed-gate panels are still emitted as
scored candidates, so internal promotion stays blocked pending an emission-side gate (readiness
filter, not a threshold change). `run-rows.json` is 1.5M, under the 50MB cleanup threshold; kept.

## Recommendation

Build the reviewed queue from the high-limit run, stratified across the methodology gates and
boroughs. Label panel quality (not effect truth); require suppress leakage = 0 (no failed-gate panel
emitted) before any internal methodology-review promotion. This detector must **never** be wired to
public surfaces; its readiness projection structurally cannot reach a public bucket, and effect
language always requires human methodology approval. The full-output review-queue writer gap (shared
across slices) still applies.
