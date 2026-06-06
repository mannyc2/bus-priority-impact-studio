# packages/analytics

Deterministic analytics layer. The local compute engine that turns prepared
feature rows into metrics, hotspots, and reviewable finding candidates.

## Responsibilities

- Statistical baseline primitives: distributions/quantiles, peer medians,
  robust z-scores (MAD, Theil–Sen), headway excess-wait/CoV/LOS, runtime
  deviation, intervention-window deltas, and context correlation.
- Feature contracts and grain definitions for the route/segment/stop/daypart
  surfaces detectors consume (route-month, segment-month, stop-direction-hour,
  reliability, rider-weighted EWT, intervention panels, positive deviance,
  feed health, source coverage).
- The 18 deterministic detectors that emit `@bp/domain` finding candidates,
  evidence links, and coverage audits.
- A detector registry plus metadata, specs, and calibration/evaluation harnesses
  (gold-set scoring, precision/recall, reviewer feedback, lifecycle policies).
- Standalone scorers: route score, segment hotspots, delay concentration,
  powerset-lattice deduction, and public route-visibility classification.

## Module map

The root entrypoint is a convenience barrel; consumers usually import the
specific subpath they need:

| Subpath | Contents |
| --- | --- |
| `@bp/analytics` | Barrel: detectors, feature contracts, hotspots, route score, lattice, visibility. |
| `@bp/analytics/core` | Detector building blocks: `AnalyticsDetector` contract, coverage/evidence builders, `stableId`, number + severity helpers. |
| `@bp/analytics/baselines` | Pure statistical primitives (distribution, peer, history, headway, runtime, context). |
| `@bp/analytics/features` | Feature grain definitions, key builders, and feature-quality helpers. |
| `@bp/analytics/detectors` | The deterministic `detect*` functions with their IDs and default thresholds. |
| `@bp/analytics/registry` | Detector registry, metadata (claim tiers, gates, retirement), and `FINDING_DETECTOR_SPECS`. |
| `@bp/analytics/calibration` | Bootstrap CIs, gold-set/precision-recall evaluation, reviewer feedback, lifecycle and seasonality policies. |
| `@bp/analytics/evaluation` | Detector evaluation scorecard: weighted components and hard gates. |
| `@bp/analytics/corpus` | Corpus profile summarization. |

## Detector pattern

Every detector implements `AnalyticsDetector<TInput>`: a typed `run(input)` that
returns a `DetectorOutput` of `{ candidates, evidence, coverage }` built from the
`Finding*` contracts in `@bp/domain/findings`. Each detector binds to a
`DetectorId` from the domain's `KNOWN_DETECTOR_IDS`, and the registry is checked
against `FINDING_DETECTOR_SPECS` via `assertDetectorRegistryMatchesSpecs` so a
detector cannot ship without a matching spec.

## Rules

- `@bp/domain` is the only runtime dependency; all schemas/contracts live there.
- For local batch compute, not public request handlers. Heavyweight joins and
  artifact generation stay out of `apps/web`.
- Prefer deterministic SQL/TypeScript over LLM output; detectors must be
  reproducible from their inputs.
- Operate on prepared feature rows; source fetching and raw cleaning belong in
  `packages/sources` and `tools/pipeline-v2`.
