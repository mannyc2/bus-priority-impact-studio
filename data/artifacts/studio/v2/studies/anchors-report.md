# Plan 074 segment-study anchors report

Status: **STOPPED for operator review**. Do not begin Plan 075 or publish these
results until the operator completes the checklist below.

- Analysis month: `2026-03`
- Candidate set: `candidate-set:49af8c8721457fa7532a7345`
- Approval outcome: 5 approved, 398 rejected
- Engine: `segment-matched-did-v1`

## What this report contains

The five rows below are every event approved by the candidate-set-bound
receipt. Each estimate is a trip-weighted, segment-grain matched-control
before/after difference with a deterministic 1,000-iteration bootstrap
interval. The implementation month is excluded. These are gated estimates or
descriptive comparisons, not causal claims.

| Route | ACE onset | All-day estimate (mph) | 95% bootstrap interval (mph) | Claim tier | Direction | Important gates | Published claim |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| BX28 | 2024-09-16 | -0.042 | [-0.138, 0.037] | gated estimate | no detectable change | all pass | No route-specific official result found; systemwide +5% is non-comparable |
| M79+ | 2024-09-30 | +0.357 | [-0.192, 1.334] | descriptive | no detectable change | pre-trend failed; congestion-pricing overlap flagged | No route-specific official result found; systemwide +5% is non-comparable |
| B82+ | 2024-09-30 | -0.245 | [-0.504, -0.038] | descriptive | worsened | pre-trend and minimum-sample gates failed | No route-specific official result found; systemwide +5% is non-comparable |
| BX38 | 2024-09-16 | +0.005 | [-0.080, 0.097] | gated estimate | no detectable change | all pass | No route-specific official result found; systemwide +5% is non-comparable |
| BX9 | 2025-11-10 | +0.115 | [-0.011, 0.283] | gated estimate | no detectable change | all pass; exactly four post months | MTA confirms the onset but publishes no BX9 outcome; systemwide +5% is non-comparable |

Four of five intervals cover zero and are represented as
`no_detectable_change`. B82+ is not promoted despite its interval excluding
zero: only three treated segments survived, eight failed the window rule, and
the pre-trend gate failed. M79+ is also descriptive because its pre-trend gate
failed and the post window overlaps congestion pricing. Its required
congestion-pricing sensitivity is stored, but becomes null after excluding
2025-01 onward because only three post months remain.

No all-day estimate exceeds 0.36 mph in absolute value. The Plan 074
implausibility STOP threshold (more than 25% of studies above 3 mph in absolute
value) did not fire.

## Published evidence check

Official MTA and NYC DOT material consistently reports an approximately 5%
average speed increase across ACE-equipped routes, on top of bus-lane or busway
gains. The MTA's March 2025 special feature names larger corridor results for
Bx19 (12%), Q69 (22%), and M101 (25%), but none of those is one of the five
approved study routes:

- [MTA March 2025 New York City Transit Committee materials](https://www.mta.info/document/167241)
- [NYC DOT bus-lane and ACE overview](https://www.nyc.gov/html/brt/html/about/bus-lanes.shtml)

The MTA's November 2025 committee materials confirm that ACE activated on BX9
on November 10, 2025. The same document repeats the 5% ACE-equipped-route
average and an up-to-30% corridor range, but it cannot be a post-activation BX9
result because it announces the BX9 activation in that report:

- [MTA November 2025 New York City Transit Committee materials](https://www.mta.info/document/192116)

No official route-specific post-activation speed estimate was found for BX28,
M79+, B82+, BX38, or BX9. The published 5% figure does not disclose a matching
route population, event window, segment definition, control construction, or
uncertainty interval, so it is not directly comparable to these matched-control
studies.

For context, the study point estimates are -0.57% (BX28), +5.77% (M79+),
-2.73% (B82+), +0.07% (BX38), and +1.74% (BX9). M79+'s point estimate is near
the published systemwide average, but its interval covers zero and its
pre-trend and congestion-pricing gates fail. The other apparent differences
likewise do not validate or contradict the aggregate MTA claim because the
estimands and populations differ.

Recommendation: accept the five outputs as a bounded pilot of the engine, not
as a systemwide evaluation of ACE. Any public presentation must retain each
study's claim tier, interval, and gate caveats and must not summarize these five
routes as evidence that ACE generally works or does not work.

## Operator anchor check

The source-research portion of this check is complete. The operator still must:

1. Accept or revise the conclusion that the available official 5% benchmark is
   non-comparable to all five route studies.
2. Sanity-check direction and magnitude. Do not reinterpret a confidence
   interval covering zero as evidence of improvement or worsening, and do not
   promote either descriptive row to a gated estimate.
3. Confirm whether the conservative five-event approval set is accepted as the
   terminal Plan 074 real-data scope. The original plan expected at least ten
   studies, but the completed review approved only five valid event-route
   onsets. Reaching ten would require a new operator decision, not an engine
   workaround.
4. Record an explicit `approve`, `revise`, or `defer` decision for Plan 075.

## Verification evidence

- Strict merge: 403 decisions, 5 approved events, 398 operator rejections.
- Real run: 5 studies, 5 route rollups, 0 ineligible studies, 3 gated estimates,
  2 descriptive comparisons, 4 no-detectable-change results, and 0 lane
  fallbacks.
- Schema validation: all five study artifacts, the index, and all five route
  rollups decode against the native Effect schemas in
  `packages/domain/src/studio/study.ts`.
- Determinism: a second real run produced byte-identical hashes for all five
  studies, the index, and all five rollups.
- Limits: index length 5 (cap 500); every rollup length 1 (cap 20).
- Tests: 287 pipeline tests passed, 0 failed, with 1,823 assertions.
- Gates: root typecheck and repository style checks exited 0.

## Reproducibility hashes

| Artifact | SHA-256 |
| --- | --- |
| Approval receipt | `6c17f106dd394b70848bd401283ee1fb7d5b1b8123c4cb2ea8dd8c36a959b6a2` |
| Approved event set | `63da356a9ace61e2755b41540567b4a79a6d8c4a4b5c045df85f79b7b687bb84` |
| Study index | `b1b57de29ab005c22333628a9b4b73c4c79964b2846b76b307d6bab14d242fdb` |
| BX28 study | `5ef27e83fea2fc6e7ef78cee9a4388aec8228764dd1d79d40bc57e1c21c08eff` |
| M79+ study | `32415e7c441837519cddf030facc9da1e0a4bb2852d34abfe4e6a729a2a0fede` |
| B82+ study | `e78554d783bff96c6bf3f14bc3db9f5711379af39179836034c674500aee3037` |
| BX38 study | `2851f866b5a754dc2dd2d6a2d6accf30f5783200a7f9ef04ac4955ac26a5091c` |
| BX9 study | `88ee641a3ef2d6eae3c96bb5b843d00078ae4d6051f8b827e31e6ac7fd333348` |

The full-precision values and gate reasons remain authoritative in the JSON
artifacts under `data/artifacts/studio/v2/studies/`; this report rounds values
for review only.
