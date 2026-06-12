# Intervention Underperformance Calibration Inventory

Generated: 2026-06-10 (calibration loop completed 2026-06-11)

## Scope

ADR-0018 slice for `intervention_underperformance` (Wave 3 #10 in
`docs/research/backend-goal-finish-detectors.md`; the named next target in the treatment-scope
NOTEs). Adds deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and
readiness-projection machinery for the **route** grain (single `negative_peer_adjusted_delta` reason,
standard 5-bucket vocabulary). It does not claim public readiness and does not promote any finding. No
detector thresholds or caps were changed.

The detector flags high-pain routes (speedPainScore ≥ 85) whose evaluated bus-priority treatment has a
non-positive peer-adjusted speed delta, emitting the top `candidateLimit` (default 100) by score
(~85–100).

## No-Write Run (default cap) + High-Limit Probe

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature routes | 381 | 381 |
| Emitted candidates | 28 | 28 |
| Coverage rows (hit / clean_no_hit / skipped) | 28 / 166 / 187 | 28 / 166 / 187 |

**No cap suppression** (28 = 28 at the high limit). Emitted set is Manhattan-heavy (sample: M=16,
B=6, BX=5, Q=1) — high-pain Manhattan routes with evaluated treatments. 187 routes skipped (no pain
signal or no evaluated intervention).

## Dominant risk: peer-adjustment validity + treatment-evidence honesty

This is the highest-claim-risk family (before/after stories). The deltas are **descriptive
peer-adjusted comparisons, not controlled causal estimates**, so the queue stratifies:
- `thin_comparison_peers` — fewer than 3 comparison routes (the detector's medium-confidence floor).
- `thin_treatment_evidence` — zero/undated treatment source refs ("missing date ≠ no intervention":
  an underperformance claim is only as honest as the treatment inventory).
Calibration tags also cover route-change/window confounds, positive-comparisons-present, the
single-event caveat, and the explicit "not a causal impact" label. Reviewers are expected to land
most labels at `route_context`/`reviewer_only` rather than `primary_finding`.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:
`intervention-underperformance-review-queue.ts` (strata: top_score, near_threshold,
thin_comparison_peers, thin_treatment_evidence, borough_spread, cap_suppressed_control rank-based,
clean/skipped controls; uses the S2.2 cap-policy helper) and
`intervention-underperformance-reviewed-gold.ts` (standard 5-bucket reviewed-gold + eval + readiness
projection). Fixture-tested in
`packages/applied-research/test/intervention-underperformance-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id intervention_underperformance \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-intervention-underperformance/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-intervention-underperformance/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

381 features, 28 emitted, coverage 28 hit / 166 clean_no_hit / 187 skipped — identical to the
inventory and to the 20,000-limit probe, so cap suppression is 0 and no extra comparison set was
needed; the queue's rank-vs-production-cap check confirms `capSuppressedCount: 0`. Queue built with
quota override `{ top_score: 15, near_threshold: 13 }` to take the full census of all 28 emitted
candidates (the inventory recommendation); default quotas would have left 6 emitted unreviewed.

44 rows selected for review: 28 emitted (15 `top_score`, 13 `near_threshold`; the
`thin_comparison_peers` and `thin_treatment_evidence` strata are empty — every emitted candidate has
10 comparison peers and a non-empty treatment inventory), 8 borough-spread `clean_control` rows, 8
`skipped_control` rows (6 `missing_evaluated_intervention`, 2 `missing_pain_signal`).

## Reviewed Gold (batch `2026-06-11-march-initial-44`)

All 44 selected rows labeled (adversarial depth on the 28 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`. Every emitted candidate's evaluated event is
dated (`eventId` encodes a bus-lane month or ACE start date), so undated-treatment risk shows up only
in the skipped controls. The adversarial axes that actually decided labels were post-treatment window
maturity and delta magnitude.

| Label | Count | Routes |
| --- | ---: | --- |
| `primary_finding` | 4 | M57, M42, M34+, M104 (dated treatment, 10–21-month window, delta ≤ -0.11 mph, ≥2 route treatment evidence rows) |
| `route_context` | 12 | M31, BX35, M50, BX32, M106, M3, M10, M66, M21, BX19, Q65, M4 (marginal delta, single-event inventory, or 6–7-month window) |
| `needs_more_evidence` | 9 | B11, B25, B38, B45, B52, B63, M102, BX2, M96 (treatment dated 2025-10 → 2025-12: only a 3–5-month post window into 2026-03) |
| `reviewer_only` | 3 | M7, M22, BX13 (mature windows but delta within 0.03 mph of peer parity — "non-positive" only tautologically) |
| `suppress` | 16 | 8 clean controls (3 high-pain routes whose treatment delta was not non-positive, 5 below the pain floor) + 8 skipped controls |

Review findings worth keeping:

- **Treatment provenance held.** All 28 emitted events are dated; "missing date ≠ no intervention"
  surfaced where it should — as `missing_evaluated_intervention` skips (156 routes, including
  high-pain B54/BX4A/M20 that carry 18–29 treatment source refs but no dated evaluated event). Those
  are source gaps, not silent passes; closing them is inventory work, not threshold work.
- **The October-2025 cohort is the family's window trap.** 9 of 28 candidates evaluate treatments
  dated 2025-10 through 2025-12, leaving 3–5 post months; "still underperforms despite treatment
  evidence" is not yet supportable there, so the whole cohort lands at `needs_more_evidence` and
  should be re-reviewed once the window matures.
- **Uniform `comparisonRouteCount: 10` with unenumerated peers.** Every emitted candidate reports
  exactly 10 peers and the evidence packet does not list peer route ids, so peer composition is
  unverifiable at review time. This capped every `primary_finding` at reviewer confidence `medium`
  and is the top evidence-packet improvement for this detector.
- **Near-zero deltas pass the gate tautologically.** M102 (-0.0008 mph), B45 (-0.005), BX2 (-0.017),
  M7/M22/BX13 (-0.02 to -0.03) satisfy "non-positive" while being at peer parity; mature-window
  parity routes went `reviewer_only`, immature ones `needs_more_evidence`.
- B63 has `segmentTreatmentEvidenceCount: 0` — route-level treatment dating without segment-level
  spatial support, so the corridor linkage is unverified.
- Claim wording stayed associational throughout ("still has a high current speed-hotspot score after
  an evaluated bus-priority treatment with non-positive peer-adjusted speed delta") and every
  candidate carries the descriptive-not-causal counter-evidence caveat; no causal phrasing leaked.
- No label was moved to make the evaluation pass; no leakage between labels and gates was found.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOfMonth 2026-06)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **4/4** |
| Suppress leakage | **0/16** |
| Context/reviewer expected still emitted | 24/24 (expected: these stay candidate-level, gated by readiness) |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 4 `public_finding_candidate`, 12 `route_context`, 12 `review_queue`, 16 `suppressed` |
| Coverage skipped (readiness-only accounting) | 187 (179 unreviewed) |

No detector thresholds or caps were changed; all gates were already label-consistent.

## Recommendation

`intervention_underperformance` is calibrated at the ADR-0018 floor for March 2026: full-census gold
over all 28 emitted candidates shows zero suppress leakage and full reviewed-primary survival, with
only 4 of 28 reaching `public_finding_candidate` — consistent with the family's claim risk. Serving
promotion remains gated on the readiness manifest path (S4.1). Window maturity, peer-list
enumeration in the evidence packet, and near-zero-delta tautology stay readiness gates, never
threshold relaxations; the 2025-10/12 treatment cohort should be re-reviewed in a later release
month, and the `missing_evaluated_intervention` skips are the treatment-inventory backlog.
