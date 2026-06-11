# Delay Concentration Calibration Inventory

Generated: 2026-06-11

## Scope

ADR-0018 Wave 1 slice for `delay_concentration`. Records the March 2026 no-write inventory and adds
deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection
machinery for **route_segment_month** route profiles. It does not claim public readiness and does
not promote any finding. No detector thresholds or caps were changed.

The detector's claim is descriptive: a route's avoidable delay is concentrated in a small set of
segments compared with the fleet distribution. It is not a causal diagnosis and must not be treated
as a treatment recommendation.

## No-Write Run

```bash
bun run pipeline findings run-detector --detector-id delay_concentration \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-delay-concentration/no-write-run.json
```

| Metric | Count |
| --- | ---: |
| Feature routes | 353 |
| Segment rows | 4,140 |
| Speed observations | 470,462 |
| Emitted candidates | 7 |
| Evidence rows | 14 |
| Coverage rows | 353 |
| Hit rows | 7 |
| Clean no-hit rows | 271 |
| Skipped rows | 75 |

Run used `wroteDb=false`.

## High-Limit Cap Probe

```bash
bun run pipeline findings run-detector --detector-id delay_concentration \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-delay-concentration/no-write-run-limit20000.json
```

| Metric | Default run | Candidate limit 20,000 |
| --- | ---: | ---: |
| Emitted candidates | 7 | 7 |
| Coverage rows | 353 | 353 |
| Hit rows | 7 | 7 |
| Clean no-hit rows | 271 | 271 |
| Skipped rows | 75 | 75 |

The high-limit probe emits the same 7 candidates, so the initial calibration risk is not production
cap suppression. The first review packet should still include clean and skipped controls because
the emitted set is small enough to review in full.

## Initial Calibration Slice

Added under `packages/applied-research/src/evaluation/`:

- `delay-concentration-review-queue.ts` - `buildDelayConcentrationReviewQueue()`. It enriches
  candidate/evidence/coverage rows into strata for top score, near threshold, low eligible segment
  count, segment-count sensitivity, single-segment dominance, borough spread, cap-suppressed
  controls, clean controls, and skipped controls. It preserves the detector's counter-evidence
  caveat that concentration is descriptive, not causal.
- `delay-concentration-reviewed-gold.ts` - reviewed-gold labels with route-level identity keys,
  suppress-leakage and reviewed-primary survival evaluation, and readiness buckets with skipped
  coverage accounting. The calibration vocabulary covers true route-scope concentration, weak
  segment support, segment-length/mix uncertainty, single-segment dominance, duplicate or stale
  segment rows, near-threshold routes, low total delay, and non-causal/non-actionable claim risk.

Both are pure applied-research code over detector rows, fixture-tested in
`packages/applied-research/test/delay-concentration-{review-queue,reviewed-gold}.test.ts`.

## Calibration Risks

- Low eligible segment count can make the route-level Gini readout unstable.
- "6 of N" readouts are segment-count sensitive when the route has few eligible segments.
- A single dominant segment can make a route-level concentration claim less actionable as a public
  finding.
- Segment length mix, duplicate segment rows, and stale segment geometry can distort shares.
- The detector must remain descriptive: avoidable-delay concentration is not causal evidence about
  bus lanes, enforcement, signals, construction, or curb activity.

## Full-Output Run + Review Queue (2026-06-11)

`findings run-detector` gained a `--rows-output` option that persists every candidate/evidence/
coverage row (the run artifact keeps only samples). Queue built from those rows with
`buildDelayConcentrationReviewQueue()`:

```bash
bun run pipeline findings run-detector --detector-id delay_concentration \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-delay-concentration/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-delay-concentration/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

23 rows selected for review: all 7 emitted candidates (4 `top_score`, 3 `low_eligible_segments`),
8 borough-spread `clean_control` rows, 8 `skipped_control` rows. Cap suppression 0, matching the
high-limit probe.

## Reviewed Gold (batch `2026-06-11-march-initial-23`)

All 23 selected rows labeled (adversarial depth on the 7 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`.

| Label | Count | Routes |
| --- | ---: | --- |
| `primary_finding` | 4 | B6, Q17, Q27, B17 |
| `route_context` | 1 | B44+ |
| `needs_more_evidence` | 1 | Q44+ (6-of-8 readout near-tautological at the 8-segment minimum) |
| `reviewer_only` | 1 | Q43 (near-threshold score 79, delay only 61st percentile) |
| `suppress` | 16 | 8 clean controls (absolute-delay floor working as designed) + 8 skipped controls |

Review findings worth keeping: the absolute-delay floor (fleet-median quantile) correctly held back
every high-Gini/low-delay clean control (Q88 at the 99.6th Gini percentile but 30k min delay); the
"6 of N" readout degrades into tautology near the 8-segment route minimum (Q44+, Q43); express/QM
routes add segment-length-mix uncertainty on top of the floor; B17's top segment carries 0.42 of
delay — under the 0.5 dominance flag but worth re-review if it grows.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **4/4** |
| Suppress leakage | **0/16** |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 4 `public_finding_candidate`, 1 `route_context`, 2 `review_queue`, 16 `suppressed` |
| Coverage skipped (readiness-only accounting) | 75 (67 unreviewed) |

No detector thresholds or caps were changed; all gates were already label-consistent.

## Recommendation

`delay_concentration` is calibrated at the ADR-0018 floor for March 2026: combined gold shows zero
suppress leakage and full reviewed-primary survival, with a readiness projection separating the 4
public-finding candidates from segment-count-sensitive and near-floor routes. Serving promotion
remains gated on the readiness manifest path (S4.1); low segment support, segment-count
sensitivity, and single-segment dominance stay readiness gates, never threshold relaxations.
