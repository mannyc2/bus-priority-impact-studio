# Plan 074 rc25 segment-study anchors report

Status: **STOPPED for operator review**. Do not activate Plan 075 or publish these results until the
operator completes the checklist below.

- Analysis month: `2026-03`
- Candidate set: `candidate-set-v3:575ee30a44f2e141e97f6a77`
- Approval outcome: 6 approved, 480 rejected
- Engine: `segment-matched-did-v2`
- Complete run: 6 studies, 2 gated estimates, 4 descriptive comparisons

## Current results

Every approved event-route pair produced one study. Values below are trip-weighted segment-grain
matched-control before/after estimates with deterministic 1,000-iteration bootstrap intervals. The
implementation month is excluded. They are gated estimates or descriptive comparisons, not causal
claims.

| Route | ACE onset | All-day estimate (mph) | 95% bootstrap interval (mph) | Claim tier | Direction | Important gates | Published claim |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| BX28 | 2024-09-16 | -0.061 | [-0.142, 0.007] | descriptive | no detectable change | pre-trend failed | TBD |
| M79+ | 2024-09-30 | +0.336 | [-0.235, 1.386] | descriptive | no detectable change | pre-trend failed; congestion-pricing overlap flagged | TBD |
| B82+ | 2024-09-30 | -0.207 | [-0.504, -0.038] | descriptive | worsened | pre-trend and minimum-sample gates failed | TBD |
| BX38 | 2024-09-16 | -0.002 | [-0.098, 0.084] | gated estimate | no detectable change | all gates pass | TBD |
| M96 | 2025-10-13 | -0.068 | [-0.134, 0.017] | descriptive | no detectable change | placebo failed; congestion-pricing overlap flagged | TBD |
| BX9 | 2025-11-10 | +0.137 | [0.019, 0.306] | gated estimate | improved | all gates pass; exactly four post months | TBD |

Four intervals cover zero and are represented as `no_detectable_change`. B82+ is not promoted even
though its interval excludes zero: only three treated segments survived and its pre-trend gate
failed. M96 is descriptive despite passing pre-trend and minimum-sample gates because its placebo
and congestion-pricing-overlap gates fail. BX9 is the sole gated estimate whose interval excludes
zero; the operator should treat its short four-month post window as an important limitation even
though it satisfies the prespecified minimum.

No all-day estimate exceeds 0.34 mph in absolute value. Zero of six studies exceed the Plan 074
implausibility threshold of 3 mph, so the real-result STOP condition did not fire.

## What changed from the immutable historical pilot

The previous five-study output remains immutable. The rc25 run uses the repaired control rule,
which excludes routes with any candidate intervention inside the inclusive nine-month interference
window regardless of approval, plus a fresh exact-route receipt. Control pools and several numeric
results therefore changed. BX28 is now descriptive because its pre-trend gate fails, BX9 is now a
gated improvement whose interval excludes zero, and M96 is a new sixth descriptive study.

M96 was admitted because its October ACE onset has affirmative route-wide registry evidence while
the nearby August bus-lane row lacks exact bounded-scope admission; proximity alone was not promoted
to an exact confounder. The estimator still flags M96's placebo and congestion-pricing overlap.

The delegated review rejected both Flatbush projections. B41 fails `needs_pattern_review` and has
unresolved installation-start/opening phase identity. B67 passes exact physical scope, current spine,
and calendar gates, but September 2025 is installation commencement rather than a clean operational
completion, and the candidate set also contains a nearby B67 lane onset dated 2025-10-02.

## Published-evidence check

The historical anchor review found only a non-comparable systemwide ACE speed benchmark, not a
route-specific result for the five historical routes. This is a fresh run with materially different
controls and one additional route, so the `Published claim` cells intentionally return to `TBD`.
The operator should fill them only from route-specific MTA or NYC DOT publications whose treatment,
window, segment scope, and outcome are comparable; an aggregate systemwide percentage is context,
not a benchmark for these estimates.

## Operator anchor check

1. Fill or explicitly accept `TBD` for each published-claim cell after checking comparable official
   evidence.
2. Sanity-check direction and magnitude, especially BX9's gated improvement and B82+'s descriptive
   worsening. Do not promote a descriptive row or reinterpret an interval covering zero.
3. Confirm or revise the delegated M96 admission decision. Rejection requires a candidate-level
   rationale and a fresh complete receipt; do not patch only the approved subset.
4. Record `approve`, `revise`, or `defer` for Plan 075 activation. Publication remains a separate
   decision even if the anchors are approved.

## Verification evidence

- Review reconciliation: 486 unique decisions, 6 approved, 480 rejected, no omissions or duplicates.
- Strict merge: 486 candidates, 6 approved events, 382 retained source rejections, zero conflicts.
- Real run: 6 studies, 6 route rollups, zero ineligible studies, 2 gated estimates, 4 descriptive
  comparisons, 4 no-detectable-change results, and zero lane or scope fallbacks.
- Schema validation: all six studies, the index, and all six route rollups decode against the native
  Effect schemas in `packages/domain/src/studio/study.ts`.
- Determinism: a same-root repeat reproduced all 13 JSON outputs byte-for-byte.
- Limits: index length 6 (cap 500); every route rollup contains one study (cap 20).

## Reproducibility hashes

| Artifact | SHA-256 |
| --- | --- |
| Review input manifest | `d88e6e35d2e59863ea90482ec6a862861b93c6455326d8c74e5f503ea56b6510` |
| Review reconciliation | `ae7a4c8543a28b3a6cf96364d0d6f5dfc4fb6e3ce5fdc4598f344784b0672a9b` |
| Approval receipt | `0ef336da334bb1fd17d68e54580ef5fe1de97019ee665214aaf29d04bf5394ff` |
| Approved event set | `452b5dcbe03b7eeb74728d03e39c648d05cc90f9ee1f2ca6846ad3f41727c877` |
| Study index | `071bacae7b416ff4049e4056b9a60c412b027ba206f688e4677a400909c01d18` |
| BX28 study | `cbffe85dcf2481b936543846bdb63b6139614ace9d5bb89a84a7c1be3ef451e7` |
| M79+ study | `547e20dba93e4ca4f07a05db7b4bacb46b396aecf654932388b40c01fd5d82f8` |
| M96 study | `b68320ce9a355aff3f6a0e090e73e6658475e3b4847a484943520bc4c5da9b53` |
| B82+ study | `81002cd2d60f85b2e4e616407688639bdf43c8fd5d03d10302b29150c9a92642` |
| BX38 study | `6274eae86eb1594c5c25790b4d27a50fca2bbe71153aa87e059a6ae0a8270341` |
| BX9 study | `e6678070bf983786e5ec1618f1728c32011a5acdbd5379154e0ec74d6937cc52` |

Full-precision values and gate reasons remain authoritative in the isolated rc25 run artifacts at
`/tmp/bp-plan074-rc25-run-b/studio/v2/studies/`. This report rounds values for review only.
