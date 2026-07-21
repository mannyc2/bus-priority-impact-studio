# Plan 074 rc26 segment-study anchors report

Status: **STOPPED for operator review**. Do not activate Plan 075 or publish these results until the
operator completes the checklist below.

- Analysis month: `2026-03`
- Candidate set: `candidate-set-v3:80050ed598f3b2ab0d0a1e99`
- Approval outcome: 7 approved, 477 rejected
- Engine: `segment-matched-did-v2`
- Complete run: 7 studies, 2 gated estimates, 5 descriptive comparisons

## Current results

Every approved event-route pair produced one study. Values below are trip-weighted segment-grain
matched-control before/after estimates with deterministic 1,000-iteration bootstrap intervals. The
implementation month is excluded. They are gated estimates or descriptive comparisons, not causal
claims.

| Route | Operational onset | All-day estimate (mph) | 95% bootstrap interval (mph) | Claim tier | Direction | Important gates | Published claim |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| BX28 | 2024-09-16 | -0.061 | [-0.142, 0.007] | descriptive | no detectable change | pre-trend failed | TBD |
| M79+ | 2024-09-30 | +0.336 | [-0.235, 1.386] | descriptive | no detectable change | pre-trend failed; congestion-pricing overlap flagged | TBD |
| B82+ | 2024-09-30 | -0.207 | [-0.504, -0.038] | descriptive | worsened | pre-trend and minimum-sample gates failed | TBD |
| BX38 | 2024-09-16 | -0.002 | [-0.098, 0.084] | gated estimate | no detectable change | all gates pass | TBD |
| M96 | 2025-10-13 | -0.068 | [-0.134, 0.017] | descriptive | no detectable change | placebo failed; congestion-pricing overlap flagged | TBD |
| B67 | 2025-10-02 | +0.139 | [0.121, 0.156] | descriptive | improved | placebo and minimum-sample gates failed | No comparable official B67 result found (checked 2026-07-21) |
| BX9 | 2025-11-10 | +0.137 | [0.019, 0.306] | gated estimate | improved | all gates pass; exactly four post months | TBD |

Four intervals cover zero and are represented as `no_detectable_change`. B82+ is not promoted even
though its interval excludes zero: only three treated segments survived and its pre-trend gate
failed. B67 is also not promoted despite its interval excluding zero: its exact bounded scope yields
only two treated spine segments, and its 0.240 mph placebo effect is much larger than the all-day
interval half-width. M96 remains descriptive because its placebo and congestion-pricing-overlap
gates fail. BX9 is the sole gated estimate whose interval excludes zero; its short four-month post
window remains an important limitation.

No all-day estimate exceeds 0.34 mph in absolute value. Zero of seven studies exceed the Plan 074
implausibility threshold of 3 mph, so the real-result STOP condition did not fire.

## Downstream Plan 076 gate

The complete run contains only two `gated_estimate` studies, BX38 and BX9, both in the automated
bus-lane-enforcement family. Plan 076 requires at least three gated estimates in one treatment family
before transferring an effect into opportunity rankings. Its explicit STOP therefore remains
triggered: do not implement or publish a ranking. Revisit Plan 076 only after another qualifying
gated study lands so that at least one family reaches three.

## What changed from rc25

The six rc25 ACE admissions and their numeric study results are unchanged. The rc26 release changes
only the Flatbush chronology and exact-deduplication boundary: it proves that September installation
preceded the 2025-10-02 operational opening on the same bounded corridor. B41 still fails
`needs_pattern_review`. B67 now has clean phase identity, exact physical scope, a
`series_ready_with_gaps` spine, and sufficient nominal calendar coverage, so it becomes the seventh
admitted event.

The B67 study uses exactly two stable treated segments:
`b67-n-node-009-node-010` and `b67-s-node-010-node-009`. It reports +0.139 mph all-day and +0.151 mph
at peak hours, but remains descriptive because the minimum-sample and placebo gates fail. The
correct reading is a bounded before/after association for these two segments, not a route-wide or
causal Flatbush claim.

## Published-evidence check

The prior review found only a non-comparable systemwide ACE speed benchmark, not route-specific
results for the six historical routes. Their `Published claim` cells therefore remain `TBD`;
aggregate statements are context, not benchmarks for these estimates.

A fresh official-source search on 2026-07-21 completed the B67 check with a negative finding. NYC
DOT's [September 2025 installation announcement](https://www.nyc.gov/html/dot/html/pr2025/nyc-dot-flatbush-ave.shtml)
reports a pre-project rush-hour baseline for the entire Flatbush corridor and 12 routes, not a B67
post-opening result for the two-block phase. Its
[October 2025 CB6 presentation](https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-bus-priority-cb6-oct2025.pdf)
uses 20% only as a hypothetical B41 scenario. The
[April 2026 construction update](https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-bus-priority-mtp-briefing-apr2026.pdf)
and [April 2026 press release](https://www.nyc.gov/html/dot/html/pr2026/nyc-dot-begins-reconstruction-of-flatbush-avenue.shtml)
confirm that Livingston-to-State was installed in fall 2025 but publish no post-opening B67
measurement; the cited 43% speed gain belongs to 161st Street in the Bronx. MTA's
[route-level](https://data.ny.gov/Transportation/MTA-Bus-Speeds-Beginning-2015/cudb-vcni) and
[segment-level](https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x)
speed datasets are measurement inputs, not an official project-attributed evaluation. The B67 cell
therefore records that no comparable official result was found; +0.139 mph remains this Tracker's
descriptive association, not an external benchmark.

## Operator anchor check

1. Accept the completed negative B67 evidence finding and fill or explicitly accept `TBD` for the
   six historical published-claim cells after checking comparable official evidence.
2. Sanity-check direction and magnitude, especially B67's descriptive improvement, BX9's gated
   improvement, and B82+'s descriptive worsening. Do not promote a descriptive row or reinterpret
   an interval covering zero.
3. Confirm that B67 should remain admitted as a two-segment descriptive study at the corrected
   2025-10-02 operational onset. Rejection requires a candidate-level rationale and a fresh complete
   receipt; do not patch only the approved subset.
4. Record `approve`, `revise`, or `defer` for Plan 075 activation. Publication remains a separate
   decision even if the anchors are approved.

## Verification evidence

- Review reconciliation: 484 unique decisions, 7 approved, 477 rejected, no omissions or duplicates;
  482 unchanged decisions replayed only after exact semantic comparison and two Flatbush decisions
  freshly adjudicated.
- Strict merge: 484 candidates, 7 approved events, 382 retained source rejections, zero conflicts.
- Real run: 7 studies, 7 route rollups, zero ineligible studies, 2 gated estimates, 5 descriptive
  comparisons, 4 no-detectable-change results, and zero lane or scope fallbacks.
- Schema validation: all seven studies, the index, and all seven route rollups decode against the
  native Effect schemas in `packages/domain/src/studio/study.ts`.
- Determinism: a same-root repeat reproduced all 15 JSON outputs byte-for-byte. Independent roots
  also agree after normalizing their intentionally embedded absolute speed-spine paths.
- Limits: index length 7 (cap 500); every route rollup contains one study (cap 20).

## Reproducibility hashes

| Artifact | SHA-256 |
| --- | --- |
| rc26 strict import | `b9c41aafb499b3cf3c8b5e74192be64b1615393d50c5d2cf4edc66260857d6cd` |
| rc26 candidate artifact | `fe4d3ce9fa9f73f660256034afa497a8a8935f3471c083358a171f5f719e5363` |
| Review worksheet | `b0577fc4d9eb44e62edfdd378eea2205884c5c5232e6edb3c649c5507f66aec5` |
| Review reconciliation | `171696a8f6ccb5e9be1c8f936067e5b6706fd8c2d14d647e48f6cbf01e1bef7e` |
| Approval receipt | `00f2fb5e97969a986c9b07a30c9e9b3920066c80356404cfddbdcefba14d89de` |
| Scope bindings | `b9cfcf9e048e32b8080138debaa6c876bd5e21a0340b4894ec13454f169faf25` |
| Approved event set | `7923d0ea4e86a07d70a354f22ae8d732ee8cc198612dffe25bdae6bdaf30c18f` |
| Study index | `081a994624f503c13b404c7596505f3a86c497c05bbc9c10aa63aab5e488eccf` |
| BX28 study | `15a4cb2a22f917816adb66b63e1e9b00c3e0bd3b21de6dd4df58e0378e2092c4` |
| M79+ study | `68d0009d55c8d32ba7c87a3d683e913a5b10d4218940153887deef0a3feb66b8` |
| M96 study | `3621229a104070e84339b4f1534904af4c650ef261a44fde8314a6c175593fe1` |
| B82+ study | `ae7d75d00b7e110f9aaf2fb4d5c59e15851fdc576760024f36b4623b6ce4265f` |
| BX38 study | `4161a6869c6cf475aa6910b79bf0d0b8623a8b89148fd9f9d8a16e122dee8469` |
| BX9 study | `2a7a2c51941cb74f30a4423c03036f48c5c56b43a050f8a8dc6b56bdbfa3f8fc` |
| B67 study | `a6b1ce3fa1e4e7ccbda4137a57b7c7f3f56681581430bc696e14c5bdf342457d` |

Full-precision values and gate reasons remain authoritative in the isolated rc26 run artifacts at
`/tmp/bp-plan074-rc26-run-a/studio/v2/studies/`. This report rounds values for review only.
