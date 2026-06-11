# 311 Service-Request Context Calibration Inventory

Generated: 2026-06-10 (labels and evaluation added 2026-06-11)

## Scope

ADR-0018 slice for `service_request_context` (Wave 4 #14 in
`docs/research/backend-goal-finish-detectors.md`). Adds deterministic, fixture-tested review-queue,
reviewed-gold, evaluation, and readiness-projection machinery for the **route** grain (single
`service_request_context_slowdown` reason, category `context`, standard 5-bucket vocabulary). It does
not claim public readiness and does not promote any finding. No detector thresholds or caps were
changed.

## No-Write Run (default cap) + High-Limit Probe

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature routes | 380 | 380 |
| Emitted candidates | 27 | 27 |
| Coverage rows (hit / clean_no_hit / skipped) | 27 / 323 / 30 | 27 / 323 / 30 |

**No cap suppression** (27 = 27 at the high limit). Manhattan-heavy emitted set (sample: M=12, Q=7,
BX=6, B=2).

## Family adaptation: associational context (primary rare by design)

311 complaints are **broad street-condition context with reporting bias, not causal evidence**, so the
expected label mass is `route_context`/`suppress` and `primary_finding` is rare by design. The eval's
lens is **leakage INTO findings** (`findingsLeakageCount`, should stay near zero), not primary
survival. The queue surfaces the association risks the ideal-doc 311 promotion path calls for:
- `high_route_fanout` — 311 touches fanning out across many nearby routes (non-specific);
- `low_match_weight` — weak 311-to-route join (below `minAverageMatchWeight`);
- `thin_high_confidence_touches` — fewer high-confidence touches than the detector's floor.
The 311 context (`serviceRequestContext`) is read from coverage `inputsSeenJson` and the context /
counter evidence. Calibration tags also cover the complaint-type allowlist
(`complaint_type_not_bus_relevant`), reporting bias, temporal misalignment, and the
`not_a_causal_attribution` caveat; borough-spread controls serve the borough/route-length fairness
lens.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:
`service-request-context-review-queue.ts` (strata: top_score, near_threshold, high_route_fanout,
low_match_weight, thin_high_confidence_touches, borough_spread, cap_suppressed_control rank-based,
clean/skipped controls; uses the S2.2 cap-policy helper) and
`service-request-context-reviewed-gold.ts` (standard 5-bucket reviewed-gold + eval with the
`findingsLeakageCount` lens + readiness projection). Fixture-tested in
`packages/applied-research/test/service-request-context-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id service_request_context \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-service-request-context/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-service-request-context/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Same counts as the inventory: 27 emitted, 380 coverage rows (27 hit / 323 clean / 30 skipped, all
skips `missing_speed`). Cap suppression 0 (rank vs the 100 cap), matching the high-limit probe.
43 rows selected for review: all 27 emitted candidates (8 `top_score`, 12 `high_route_fanout`,
7 `low_match_weight`, none near-threshold or thin-touch), 8 borough-spread `clean_control`, 8
`skipped_control`. `run-rows.json` is 524 KB and was kept.

## Reviewed Gold (batch `2026-06-11-march-initial-43`)

All 43 selected rows labeled (adversarial on the 27 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`. Per the associational-context family
adaptation, **`route_context` is the ceiling**: zero rows were labeled `primary_finding`.

| Label | Count | Routes |
| --- | ---: | --- |
| `primary_finding` | 0 | — (rare by design; none earned it) |
| `route_context` | 10 | B60, Q12, Q23, BX11, Q27, BX35, M125, BX32, B11, Q65 (match weight ≥ 0.41, 147–472 high-confidence touches) |
| `reviewer_only` | 2 | M4, M31 (real slow-speed pain but fanout 54–55 grid-shared 311 mass) |
| `needs_more_evidence` | 3 | Q17, BX38, BX28 (hotspot 76–97 but match weight 0.23–0.24 under the detector's own 0.35 floor) |
| `suppress` | 28 | 12 emitted (weak/non-specific association) + 8 clean controls + 8 skipped controls |

Review findings worth keeping:

- **The OR-gate makes the match-weight floor toothless.** Support requires
  `highConfidenceTouchCount >= 5` OR `averageMatchWeight >= 0.35`; since every emitted route has
  ≥ 16 high-confidence touches, 16 of 27 emitted candidates sit below the 0.35 match-weight floor
  the detector itself states as a quality bar.
- **The volume signal is saturated.** `touchedEventCount / 100` caps at 1 and every route in the
  city carries hundreds-to-thousands of 311 touches (clean controls: 346–1,952), so the "substantial
  311 context" clause adds almost no discrimination — the detector is effectively a slow-route/
  hotspot detector relabeled with 311 context.
- **Complaint-type composition is unverifiable at this grain.** The feature collapses everything to
  `eventKind = "311_complaint"`; no complaint-type breakdown survives into candidates, evidence, or
  coverage inputs, so the allowlist-relevance check (is the 311 category bus-relevant?) cannot be
  performed per candidate. Rows were tagged `broad_street_condition_not_specific` instead of
  `complaint_type_not_bus_relevant`, which would require evidence the rows do not carry. This is the
  main evidence gap for any future promotion path.
- **Borough/route-length normalization risk confirmed.** The emitted set is Manhattan-heavy (12/27)
  and the fanout-45–55 cluster is entirely Manhattan grid/crosstown corridors (M34+/M34A+ share one
  street's complaints); express routes (BM2, BXM18) sweep up 1,500–2,000 touches at match weight
  0.11–0.17 purely from length. Clean controls B103 (519 high-confidence touches) and J90 (match
  weight 0.46, 606 high-confidence touches) show strong 311 association on routes with **no** speed
  problem — 311 volume tracks reporting density, not bus conditions.
- **Marginal speed pain leaks in.** Q85 (10.65 mph) and Q31 (8.89 mph) emit on hotspot 71 vs the 70
  floor with weak association — the clearest mislabels in the slice (both suppress).
- **Join-universe hygiene:** skipped scope T464 (no speed feed) still accrues 1,090 touched events;
  combined scope `BX28-BX38` appears in coverage.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOf 2026-06)

Context-family framing: the headline metric is **leakage INTO findings**, not primary survival.

| Metric | Value |
| --- | ---: |
| Findings leakage (`findingsLeakageCount`) | **0/27 emitted reviewed** |
| Suppress leakage (suppress-labeled still emitted) | **12/28** |
| Context/reviewer-labeled still emitted | 15/15 |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 0 `public_finding_candidate`, 10 `route_context`, 5 `review_queue`, 28 `suppressed` |
| Coverage skipped (readiness-only accounting) | 30 (22 unreviewed) |

The 12/28 suppress leakage is recorded honestly, not relabeled away: the current gate emits 12
candidates whose 311 association is too weak or too grid-shared to serve even as route context
(fanout ≥ 45 Manhattan rows, match weight < 0.3 with thin high-confidence support, and the two
hotspot-71 marginal-speed routes). No thresholds or caps were changed in this pass.

## Recommendation

`service_request_context` behaves as designed at the family level — zero leakage into findings, all
strong-association rows cap at `route_context` — but it is **not promotable even as context** in its
current form: 12 of 27 emitted candidates are reviewed-suppress. The label evidence points at three
candidate-side gates for a follow-up (none applied here): make the match-weight floor binding
(AND, not OR, with high-confidence support), add a route-fanout ceiling, and require complaint-type
composition in the feature so the allowlist check becomes reviewable. Serving promotion remains
gated on the readiness manifest path; the readiness projection keeps all 27 emitted rows out of
`public_finding_candidate`.
