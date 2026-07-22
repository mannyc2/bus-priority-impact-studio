# Plan 074 May 2026 review-cut anchors report

Date: 2026-07-22

Status: **APPROVED FOR THIS IMMUTABLE REVIEW CUT**. The operator approved the complete
`study-review-cut-v1:5298f37aac8780666c742f7d` decision set (9 approvals, 475 rejections),
authorized the exact v4 receipt and complete estimator run, and directed evidence-conservative
anchor decisions without another stop. This closes estimator admission and the fresh anchor review;
it does not turn a descriptive result into a gated estimate or a gated estimate into a causal claim.

- Candidate universe: `candidate-set-v3:80050ed598f3b2ab0d0a1e99`
- Analysis month: `2026-05`
- Engine: `segment-matched-did-v2`
- Complete run: 9 studies, 3 gated estimates, 6 descriptive comparisons
- Scope/eligibility result: zero ineligible studies, lane fallbacks, scope fallbacks, or missing
  route-wide/bounded-scope evidence

## Result-specific anchor review

Every approved event-route pair produced exactly one strict-decoded study. Estimates are
trip-weighted segment-grain matched-control before/after comparisons with deterministic
1,000-iteration bootstrap intervals. The implementation month is excluded. They are not causal
claims.

| Route | Onset | All-day estimate | 95% interval (mph) | Treated / controls | Tier | Direction | Binding gate result | Published comparator |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| B60 | 2025-12-08 | -0.036 mph (-0.502%) | [-0.110, +0.046] | 16 / 135 | gated estimate | no detectable change | all gates pass | TBD; none asserted in this cycle |
| B68 | 2025-12-08 | -0.009 mph (-0.112%) | [-0.102, +0.073] | 12 / 135 | descriptive | no detectable change | placebo fails (-0.127 mph vs 0.087 CI half-width) | TBD; none asserted in this cycle |
| BX28 | 2024-09-16 | -0.061 mph (-0.829%) | [-0.142, +0.007] | 18 / 117 | descriptive | no detectable change | pre-trend fails | reviewed rc26 TBD retained |
| M79+ | 2024-09-30 | +0.336 mph (+5.421%) | [-0.235, +1.386] | 6 / 21 | descriptive | no detectable change | pre-trend and congestion-pricing overlap fail | reviewed rc26 TBD retained |
| B82+ | 2024-09-30 | -0.207 mph (-2.302%) | [-0.504, -0.038] | 3 / 247 | descriptive | worsened | pre-trend and minimum-sample fail | reviewed rc26 TBD retained |
| BX38 | 2024-09-16 | -0.002 mph (-0.030%) | [-0.098, +0.084] | 12 / 117 | gated estimate | no detectable change | all gates pass | reviewed rc26 TBD retained |
| M96 | 2025-10-13 | -0.069 mph (-1.256%) | [-0.140, +0.016] | 5 / 23 | descriptive | no detectable change | placebo and congestion-pricing overlap fail | reviewed rc26 TBD retained |
| B67 | 2025-10-02 | +0.128 mph (+2.249%) | [+0.109, +0.147] | 2 / 135 | descriptive | improved | pre-trend, placebo, and minimum-sample fail | rc26 negative official-evidence finding retained |
| BX9 | 2025-11-10 | +0.139 mph (+2.101%) | [+0.027, +0.311] | 13 / 217 | gated estimate | improved | all gates pass | reviewed rc26 TBD retained |

Six intervals cover zero and remain `no_detectable_change`. B82+ and B67 have intervals excluding
zero but remain descriptive because their generated gates fail. B68 is admitted to the estimator
but is not gated: its placebo magnitude exceeds the all-day interval half-width. B60 passes every
unchanged gate, but its interval covers zero and its honest reading is no detectable change. No
all-day estimate exceeds 0.34 mph in absolute value; zero of nine exceeds the 3 mph Plan 074
implausibility threshold.

B60 and B68 are two route members of one exact Wiki ACE occurrence. Only B60 is gated, so B68 does
not contribute to the downstream effect transfer. The three gated studies used by Plan 076 are
three distinct event-route results: BX38, BX9, and B60.

## B60 and B68 focused checks

The focused and complete-run JSON artifacts are byte-identical for both routes.

| Route | Peak estimate | Peak 95% interval | Peak treated / controls | Pre-trend | Placebo | Other gates |
| --- | ---: | ---: | ---: | --- | --- | --- |
| B60 | -0.032 mph (-0.483%) | [-0.095, +0.030] | 16 / 127 | pass: 0.217 <= 0.250 mph | pass: -0.031 within 0.078 mph | sample, controls, congestion, redesign pass |
| B68 | +0.012 mph (+0.169%) | [-0.118, +0.121] | 12 / 127 | pass: 0.014 <= 0.250 mph | **fail**: -0.127 exceeds 0.087 mph | sample, controls, congestion, redesign pass |

M57 remains rejected. Its exact 2025-12-08 occurrence and nominal 6-pre/5-post calendar do not
override its fresh `needs_pattern_review` spine state. No threshold, Plan 083 grouping decision, or
scope rule changed.

## Exact delta from rc26

B60 and B68 are new estimator admissions. Of the seven carried studies, BX28, M79+, B82+, and BX38
retain the exact all-day effect and interval because their fixed study windows were already
complete. The later-onset rows change only as the extended outcome horizon enters their fixed
windows:

| Route | rc26 effect | May effect | Change | Other exact change |
| --- | ---: | ---: | ---: | --- |
| M96 | -0.067957 | -0.069351 | -0.001394 mph | interval [-0.133836, +0.016589] -> [-0.140145, +0.016004]; tier/gates unchanged |
| B67 | +0.138995 | +0.128261 | -0.010734 mph | controls 147 -> 135; pre-trend now also fails; remains descriptive |
| BX9 | +0.137387 | +0.138570 | +0.001184 mph | controls 215 -> 217; interval [+0.018830, +0.306346] -> [+0.027033, +0.311006]; remains gated |

B82+'s eligible-control count changes from 259 to 247 and B67's from 147 to 135 without changing
their claim tiers. No carried study is promoted. The rc26 receipt, seven-study artifacts, anchor
report, and production objects remain immutable.

## Plan 076 gate

The complete index contains three `gated_estimate` rows in
`automated_bus_lane_enforcement`: BX38 (-0.0300%), BX9 (+2.1014%), and B60 (-0.5024%). The prescribed
signed median relative transfer is therefore **-0.0300087582%**, not a tuned or absolute-valued
benefit. Plan 076's minimum evidence floor is satisfied, but the near-zero mixed-sign transfer is a
material limitation that its non-public prototype and decision memo must disclose.

## Verification evidence

- Complete decision coverage: 484 unique decisions, 9 approved, 475 rejected, no blanks,
  duplicates, or omissions.
- Strict merge: 484 candidates, 9 approved events, 382 retained source rejections, zero conflicts.
- Complete run: 9 studies and 9 route rollups; 3 gated, 6 descriptive, 6 no-detectable-change;
  every ineligibility, fallback, and scope-error counter is zero.
- All nine studies, the index, and all nine rollups strict-decode against the native Effect schemas.
- A same-root repeat reproduced all 19 generated JSON outputs byte-for-byte. Both SHA manifests
  hash to `de8e9eecc32ff924aa0c7e5c01a094de7d90ff2ca3e49287937881677559c0ef`.
- The complete-run B60 and B68 files are byte-identical to their isolated focused-run files.

## Reproducibility hashes

| Artifact | SHA-256 |
| --- | --- |
| Review-cut awaiting artifact | `6ca946c9dfd0ba624337caa99214273369bb6e88e73fb0647d58eec0715b9c02` |
| Review-input logical receipt | `13fc63b4b5a3ba378a79b7f2b58963c7700282a999cebeb9d5cd6bb808a75b6e` |
| Review worksheet | `f9413bdb021d04962def7c09ec11030f5d162f97eae47ced4dc61a31eac8a21a` |
| Review reconciliation | `d5b3b4267067ef2b2a70ee7e6319edfc72a572fa8902f8fe88f4959f85cce43e` |
| v4 approval receipt | `13be429629a0eeea241a841ed3a7362ed85fa88b9108fc4b53363bd1570a297c` |
| Scope bindings | `a4fa053e10e1be5853c953ca872c87ae6af2e356e0a30561f79aece5efa1e006` |
| Approved event set (release-managed) | `89e1d58d06a57034eddb77f926040d88731120acc86d7e819427068acb037aab` |
| Study index | `4e27d6effb4c0bf72093780de660f5b9c9eb5e9b2fee9d871bf491d52d574903` |
| B60 study | `d5baf850a21a4700ee7c815521b921ece34af9cbf7228c7afc891152b3ab227e` |
| B68 study | `0fdbfe7d1324a4a2648ae47268494d3692aedaacc7b1af1097acadd63202a44c` |
| BX28 study | `e9a7e5821d9eae9b7962a0edfc589aea6c1be1fe32bb0dec70506563b5163ea5` |
| M79+ study | `bd7dd8d8374ff0c2c398f42a6df78080cfccae1e4325d573a6f1c608c65782e0` |
| M96 study | `ff7a09ee255d263cfe4f16275a958ccce5f61dd3deb2c0fbf76efcbcbc261715` |
| B82+ study | `2285ec552788b28f42aa669b32299e547154b3203092446762f6f6eb14a72e49` |
| BX38 study | `06ee4f86998aab8e90137ce33c1acfa080cfd8125ff14fe02837fef8dd34b662` |
| BX9 study | `b1a9ae2341ffddbbc74d5ef0ed0ce3f2bd0598dcfa4ad9de4ddc977e5f154330` |
| B67 study | `765c2eee1642d01dd565906d78d7a1dcc6bf0cccd3c3086f6d46fe01414de8df` |

Full-precision values and gate reasons remain authoritative in the review-cut-bound local artifacts.
Machine-sized estimator outputs remain release-managed rather than committed.

## Publication boundary

The operator authorized publication of validated artifacts, but the original safety instruction
also forbids overwriting any rc26 or other published production object. Existing serving keys are
stable and unversioned, so activating this cut at those keys would violate that instruction.
Publication may therefore create only new immutable review-cut-versioned objects, with the rc26
serving keys left unchanged. Plan 076 is explicitly non-public and receives no serving activation.
