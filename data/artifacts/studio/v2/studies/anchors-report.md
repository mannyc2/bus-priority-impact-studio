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
| BX28 | 2024-09-16 | -0.042 | [-0.138, 0.037] | gated estimate | no detectable change | all pass | published_claim: TBD |
| M79+ | 2024-09-30 | +0.357 | [-0.192, 1.334] | descriptive | no detectable change | pre-trend failed; congestion-pricing overlap flagged | published_claim: TBD |
| B82+ | 2024-09-30 | -0.245 | [-0.504, -0.038] | descriptive | worsened | pre-trend and minimum-sample gates failed | published_claim: TBD |
| BX38 | 2024-09-16 | +0.005 | [-0.080, 0.097] | gated estimate | no detectable change | all pass | published_claim: TBD |
| BX9 | 2025-11-10 | +0.115 | [-0.011, 0.283] | gated estimate | no detectable change | all pass; exactly four post months | published_claim: TBD |

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

## Operator anchor check

For three to five rows:

1. Find an official MTA or NYC DOT publication that states a comparable
   observed speed result and record its URL, population, date window, outcome
   definition, and published number in place of `published_claim: TBD`.
2. Note whether that publication measures the same route identity, roadway
   segments, time of day, implementation phase, and before/after window. A
   non-comparable published number should be labeled non-comparable, not forced
   into agreement.
3. Sanity-check direction and magnitude. Do not reinterpret a confidence
   interval covering zero as evidence of improvement or worsening, and do not
   promote either descriptive row to a gated estimate.
4. Confirm whether the conservative five-event approval set is accepted as the
   terminal Plan 074 real-data scope. The original plan expected at least ten
   studies, but the completed review approved only five valid event-route
   onsets. Reaching ten would require a new operator decision, not an engine
   workaround.
5. Record an explicit `approve`, `revise`, or `defer` decision for Plan 075.

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
