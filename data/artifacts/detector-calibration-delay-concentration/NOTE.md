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

## Remaining Work

- Commandize a full-output review-queue writer: `findings run-detector` persists only the summarized
  registry run artifact, not full candidates/evidence/coverage.
- Hand-label all 7 emitted candidates plus stratified clean/skipped controls.
- Require suppress leakage = 0 and report reviewed-primary survival before serving promotion.
- Treat low support, segment-count sensitivity, and single-segment dominance as readiness gates, not
  reasons to relax thresholds.

## Recommendation

`delay_concentration` is ready for first review-queue construction and gold-label collection from
the March 2026 no-write output. It is **not** ready for public promotion until labels are reviewed
and the readiness projection reports zero suppress leakage with label-backed primary survival.
