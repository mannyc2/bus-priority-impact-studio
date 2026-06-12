# Positive Deviance Calibration Inventory

Generated: 2026-06-10

## Scope

ADR-0018 slice for `positive_deviance` (Wave 4 #16 in
`docs/research/backend-goal-finish-detectors.md`). Records a no-write inventory and adds
deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection
machinery. **This is a Wave 4 family adaptation: a learning detector, not a problem-finding
detector. The frontend-use vocabulary is inverted and the detector is internal-only.** No detector
thresholds or caps were changed.

## Family adaptation (inverted, internal-only)

Per the plan: *"invert the vocabulary — 'suppress' = false deviants (schedule padding, data
artifacts); labels grade learning-candidate quality, and outputs feed internal review, not public
findings."* The reviewed-gold uses:

| frontend-use | meaning |
| --- | --- |
| `learning_candidate` | genuine top-decile outperformer worth internal study |
| `watchlist` | promising but needs more evidence before internal study |
| `reviewer_only` | surfaced to reviewers, no internal action |
| `suppress` | a **false deviant** — schedule padding, data artifact, peer-construction artifact |

There is **no public bucket**. The readiness projection maps every non-suppressed label to the
internal `review_queue` bucket and never to `public_finding_candidate`/`route_context`; the evaluation
carries a structural `publicLeakageCount: 0` invariant. Suppress leakage here means a *false deviant*
still emitting a positive-deviance signal.

## No-Write Run (default cap) + High-Limit Probe

```bash
bun run pipeline findings run-detector --detector-id positive_deviance \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-positive-deviance/no-write-run.json
bun run pipeline findings run-detector --detector-id positive_deviance \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-positive-deviance/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature scopes | 365 | 365 |
| Emitted candidates | 48 | 48 |
| Coverage rows (hit / clean_no_hit / skipped) | 48 / 0 / 317 | 48 / 0 / 317 |

**No cap suppression** (48 = 48 at the high limit; well under the 100 cap). The cap-suppressed and
clean controls are therefore empty in this month's production run — the dominant review risk is *peer
construction*, not the cap. Most non-emitted scopes (317) are skipped upstream by the
`insufficient_peers` / `reciprocal_metric_warning` / `insufficient_positive_periods` gates;
reciprocal worst-practice warnings are a skip gate, so they appear only as skipped controls, never
among emitted candidates.

## Distribution note

The emitted set skews to express / outer-borough route families (sample: SIM, S, QM dominant) — fast
routes outperforming their speed peers, which is plausible but is exactly why peer-group construction
must be reviewed before any "best practice" reading. Recorded as a review caveat, not a fix.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:

- `positive-deviance-review-queue.ts` — `buildPositiveDevianceReviewQueue()`. Strata: `top_score`,
  `near_threshold`, `thin_peers`, `fragile_persistence` (only the minimum qualifying periods),
  `segment_scope`, `borough_spread`, `cap_suppressed_control` (rank-based, empty this month),
  `clean_control`, `skipped_control`. Uses the shared S2.2 `cap-policy` helpers.
- `positive-deviance-reviewed-gold.ts` — inverted/internal-only reviewed-gold, evaluation (learning-
  candidate survival + false-deviant suppress leakage + `publicLeakageCount: 0`), and readiness
  projection (only `review_queue` + `suppressed` buckets ever populated).

Both are pure applied-research code, fixture-tested in
`packages/applied-research/test/positive-deviance-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id positive_deviance \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-positive-deviance/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-positive-deviance/run-rows.json
```

Full-rows pass reproduces the inventory (48 emitted, 365 coverage rows, 317 skipped, 0 cap
suppression). Queue built with `buildPositiveDevianceReviewQueue()` into `review-queue.json`:
**33 selected for review** — 12 `top_score`, 3 `fragile_persistence`, 10 `borough_spread`,
8 `skipped_control` (no thin-peer, near-threshold, segment, cap-suppressed, or clean rows exist this
month). All 48 emitted candidates score against a single fleet-wide peer group
(`NYC bus routes with speed-history support`, 348 peers) on `average_speed_mph`.

## Reviewed Gold (batch `2026-06-11-march-initial-33`, inverted vocabulary)

All 33 selected rows labeled (adversarial on the 25 emitted, light on the 8 skipped controls);
decisions in `reviewed-decisions.json`, gold in `reviewed-gold.json`. Labels grade
**learning-candidate quality** — "suppress" means *false deviant*, not "bad route":

| Label | Count | Scopes |
| --- | ---: | --- |
| `learning_candidate` | 3 | Q35, Q50, BX29 — local routes with 36/36 qualifying periods; outperformance not explained by service class |
| `watchlist` | 6 | S40, S55, S56, S78, S89, S90 — persistent SI locals, but borough road geometry confounds the fleet-wide peer group |
| `reviewer_only` | 2 | M35, B39 — structurally sui generis short/bridge routes with thin persistence; peer-group degenerate cases |
| `suppress` (false deviants) | 22 | 12 express (SIM2/5/8/9/23/25/26/35, QM11/17/36, BXM8: peer-construction artifact — service class, not practice), 2 fragile locals (S81, Q100: 2/36 periods), 8 skipped controls (gates working as designed) |

Central review finding: **the peer group does not condition on service class**, so express commuter
routes (22 SIM + 8 QM of the 48 emitted) read as "deviants" structurally. That is a
peer-construction artifact, not real positive deviance — the named follow-up is a
service-class/density-conditioned peer group, never a threshold relaxation. No schedule-padding
false deviants were found this month (the metric is observed speed, not adherence).

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOf 2026-06)

| Metric | Value |
| --- | ---: |
| Learning-candidate survival | **3/3** |
| Suppress (false-deviant) still emitted | **14/22** (the 12 express + 2 fragile reviewed candidates the detector currently emits) |
| Watchlist/reviewer-only still emitted | 8/8 |
| Unreviewed emitted candidates | 23 (queue quota; mostly more SIM/QM mid-ranks) |
| `publicLeakageCount` | **0** (structural invariant) |
| Readiness buckets | 34 `review_queue`, 22 `suppressed`, **0 public buckets** |
| Coverage skipped | 317 (309 unreviewed) |

The 14 still-emitted false deviants are the calibration signal, not a leak to fix by hand: outputs
feed internal review only, and the internal-only ceiling is **enforced in the module**
(`readinessBucket()` maps every non-suppress label to `review_queue`; the gold type pins
`shouldPromotePublic: false`), confirmed against this projection (no
`public_finding_candidate`/`route_context` items). No thresholds, caps, or production code changed.
`run-rows.json` is 704K, well under the 50MB cleanup threshold, so it is kept.

## Recommendation

`positive_deviance` is ready for internal-only review-queue construction and learning-candidate
labeling. It must **never** be wired to public surfaces; its readiness projection structurally cannot
reach a public bucket. Promotion is to *internal study*, gated on peer-construction review and
false-deviant suppression — not to public findings. The March 2026 batch above grades the express
skew as the dominant false-deviant family; the next calibration action is peer-group conditioning,
owned by the detector-input design, not by these labels.
