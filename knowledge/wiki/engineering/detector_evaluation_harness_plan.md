---
title: Detector Evaluation Harness Plan
type: engineering
status: draft
last_updated: 2026-06-01
owner: packages/analytics
source_count: 0
tags: [analytics, detectors, evaluation, calibration, review, ralph]
---

# Detector Evaluation Harness Plan

## Purpose

Coverage and readiness answer only the first question: did the detector have enough declared input
to run? The next architecture layer must answer the harder question: is the detector actually good?

The detector evaluation harness is the release-cycle system that scores detector versions against
gold sets, reviewer outcomes, false-positive root causes, novelty, evidence quality, stability,
coverage robustness, and claim discipline. It should make detector improvement optimizable without
turning detector quality into a single misleading metric.

The harness should become the default answer to:

1. Is this detector version better than the previous one?
2. Which detector families deserve engineering time?
3. Which thresholds should move, and why?
4. Which detector outputs should be auto-published, routed to review, demoted, or retired?
5. Which Ralph-generated detector ideas improve quality rather than merely adding novelty?

## Design Doctrine

Detector evaluation is separate from detector readiness.

| Layer | Question | Output | Can pass while detector is bad? |
|---|---|---|---|
| Coverage control | Do source and derived products exist? | Complete/partial/blocked product states | Yes |
| Detector readiness | Does a detector have required inputs and policies? | Ready/partial/blocked detector state | Yes |
| Detector evaluation | Does a detector produce useful, calibrated, reviewable findings? | Versioned evaluation packet and scorecard | No, this is the quality gate |

The harness must preserve multi-dimensional judgement. A single overall score is useful for
optimization, but the component scores and veto gates are more important than the number.

## Current Assets

Useful primitives already exist:

- `packages/analytics/src/calibration/gold-set.ts` evaluates TP/FP/TN/FN from expectations.
- `packages/analytics/src/calibration/reviewer-feedback.ts` summarizes reviewer approval share.
- `packages/analytics/src/calibration/detector-lifecycle.ts` compares detector versions, summarizes
  review cycles, recommends retirement, and groups false-positive root causes.
- `packages/analytics/src/calibration/range-precision-recall.ts` supports window/range detectors.
- `tools/pipeline-v2/src/commands/build/detector-gold-set-evaluation.ts` builds the first release
  gold-set artifact from review decisions and promoted findings.
- `data/artifacts/findings/2026-03/review-decisions.json` and related findings artifacts hold the
  first manually reviewed release set.

The main weakness is that these pieces are not yet joined into a release-cycle harness. The current
gold-set result can report perfect precision and recall when the expectation set contains only
reviewed positive/promoted scopes and no true negative or false-negative discovery pool. That is a
useful smoke test, not a quality evaluation.

## Implementation Status

The first complete detector-evaluation harness is implemented. The reusable scorecard helpers live
in `packages/analytics/src/evaluation/`, and the release artifact command is:

```sh
bun --filter @bp/pipeline-v2 cli -- evaluate detectors \
  --year 2026 --month 3 \
  --history-start-month 2023-04 \
  --run-id bus-observatory-2026-03
```

The first generated packet is:

```text
data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json
data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.md
```

Current result: all 18 registered detectors receive scorecard rows, and the March 2026 release now
has a deterministic negative/holdout set derived from detector coverage rows. The harness no longer
reports the portfolio as positive-only. The March local findings surface now includes registry-run
coverage for five additional detector families: `headway_reliability_ewt`, `bunching_hotspots`,
`schedule_mismatch`, `travel_time_variability`, and `degradation_trend`.

The command now also consumes review packets, review-packet coverage, review queues, promotion
queues, detector coverage audits, readiness artifacts, EWT score vectors, detector-specific
speed/pace score vectors, generic detector score vectors, deterministic evaluation labels, and the
detector corpus-grain audit.
Grain-policy warnings are now visible as scorecard flags instead of living only in planning docs.
The supporting build commands are:

```sh
bun --filter @bp/pipeline-v2 cli -- build detector-evaluation-labels \
  --year 2026 --month 3 \
  --history-start-month 2023-04

bun --filter @bp/pipeline-v2 cli -- build detector-score-vectors \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3

bun --filter @bp/pipeline-v2 cli -- build speed-pace-score-vectors \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3

bun --filter @bp/pipeline-v2 cli -- findings review-packets \
  --year 2026 --month 3

bun --filter @bp/pipeline-v2 cli -- findings coverage-audit \
  --year 2026 --month 3

bun --filter @bp/pipeline-v2 cli -- audit review-packet-coverage \
  --year 2026 --month 3

bun --filter @bp/pipeline-v2 cli -- audit route-month-shadow \
  --year 2026 --month 3
```

Generated supporting artifacts:

```text
data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation-labels.json
data/artifacts/detector-score-vectors/2023-04_to_2026-03/2026-03/detector-score-vectors.json
data/artifacts/speed-pace-score-vectors/2023-04_to_2026-03/2026-03/speed-pace-score-vectors.json
data/artifacts/findings/2026-03/detector-coverage-audit.json
data/artifacts/findings/2026-03/review-queue.json
data/artifacts/findings/2026-03/review-packet-coverage.json
data/artifacts/detector-shadow-audits/2026-03/route-month-false-negative-shadow.json
```

The March 2026 packet currently reports:

| Measure | Value |
|---|---:|
| Registered detector scorecards | 18 |
| Confirmed positive labels | 200 |
| Derived confirmed negative labels | 20,933 |
| Holdout negative labels | 4,185 |
| Queued near-miss scopes | 782 |
| Explicit missing-data scopes | 1,300,725 |
| Packetized candidate-bearing detectors | 14 / 18 |
| Complete packet-covered detectors | 14 / 18 |
| Candidate packet count | 982 |
| Generic score-vector artifact rows | 18 registered detector families; 14 currently have release coverage rows; 1,322,549 entries and 891 flagged scopes |
| `speed_pace_hotspot` historical score-vector support | 36 usable months, 520,810 features, 3,600 candidates |
| Grain-policy warning detectors | 5 |
| Derived negatives requiring grain review | 1,256 |
| False-negative shadow audits unavailable | 12 |
| Route-month shadow audit | 350 route-month clean-no-hit routes; 112 hidden routes; 1,142 richer-grain candidates |
| Claim-discipline violations | 0 |
| Portfolio pre-gate score | 845.2 |
| Portfolio gated score | 845.2 |

Implemented component coverage:

- Precision and reviewer usefulness from reviewed decisions plus promoted findings.
- Near-miss accounting from queued candidates that were not promoted.
- Evidence quality from review-packet completeness fields.
- Missing-data discipline from detector coverage audit skipped/missing rows and missing-data signals.
- Claim discipline from packet/promoted claim text plus explicit reviewer claim-discipline issues.
- Coverage robustness from detector readiness plus skipped-input penalties.
- Calibration stability from available score-vector artifacts, currently EWT and
  `speed_pace_hotspot`.
- Novelty from queued candidate scope uniqueness.
- Elegance from deterministic registry metadata: feature count, baselines, gates, detector specs,
  and failure-state clarity.
- False-positive register from rejected review decisions and root-cause labels when present.
- Packet coverage for every registered detector, so missing, partial, and complete review-packet
  states are visible even when a detector has no current candidates.
- Grain-policy flags from `detector-corpus-grain`, including route-month screening warnings,
  clean-no-hit grain review requirements, and missing false-negative shadow audits.
- General route-month false-negative shadowing from `audit route-month-shadow`, which compares
  route-level clean no-hits against richer-grain detector candidates on the same routes.

Remaining data-quality gaps:

- The 20,933 confirmed negatives are derived from `clean_no_hit` coverage rows, not manual reviewer
  negatives. They are valuable for regression and false-positive guards, but they should not be
  treated as a fully reviewed gold set. Labels now carry `grainSafety` so route-month screening
  negatives stay review-required.
- The generic detector score-vector artifact currently reflects the release coverage table, which
  only contains March 2026 rows. It now lists every registered detector, including detectors with
  `missing_execution_coverage`, but longer adjacent-window stability still requires
  detector-specific historical score vectors over the full corpus. EWT and `speed_pace_hotspot`
  are the first detector-specific historical vectors.
- Four registered detector families still have no review packets in the current release because
  they have no March 2026 candidates or have not been materialized into the local findings tables:
  `rider_weighted_excess_wait`, `positive_deviance`, `intervention_event_study`, and
  `delay_concentration`.
- `source_gap` packet coverage now treats absent counter-evidence as waived because it is a
  data-quality detector with missing-data evidence. It remains blocked from promotion as a
  service-performance finding.
- The new EWT and bunching detector executions are intentionally harsh about missing data:
  most stop-direction-hour cells emit explicit skipped/missing states because schedule baselines,
  headway pairs, or coverage are unavailable. This is a control-plane improvement, not proof that
  stop-hour reliability is complete.
- `persistent_speed_hotspot` previously exposed a real lineage mismatch because segment candidates
  were backed only by route-level coverage rows. The detector now emits segment-scope coverage for
  fresh runs, and the March artifact was repaired with exact segment hit rows for the existing 100
  candidates.

## Evaluation Artifact

Create a new artifact family:

```text
data/artifacts/detector-evaluation/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/detector-evaluation.json
```

Schema version 1 should contain:

| Field | Purpose |
|---|---|
| `artifactKind` | `detector_evaluation_harness` |
| `schemaVersion` | Start at `1` |
| `releaseMonth` | Current serving snapshot month being evaluated |
| `historyWindow` | Historical months available for calibration and backtests |
| `detectorVersions` | Registry detector id/version rows included in the evaluation |
| `inputArtifacts` | Review decisions, promoted findings, review packets, review-packet coverage, score vectors, readiness, corpus profile, coverage audit, corpus-grain audit |
| `evaluationSets` | Named positive, negative, near-miss, skipped, and holdout sets |
| `packetCoverage` | Per-detector packet/candidate coverage state across the full registry |
| `detectorScorecards` | Per-detector component scores, overall score, gates, and recommendations |
| `portfolioSummary` | Whole-detector-system score, weak families, strongest improvements, retired candidates |
| `falsePositiveRegister` | Root causes with counts, examples, and proposed suppressors |
| `claimsDiscipline` | Causal-language, recommendation-language, missing-data, and evidence-role violations |
| `noveltySummary` | New-scope, new-route, new-detector-family, and duplicate-rate stats |
| `residualRisks` | What the evaluation cannot prove yet |

This artifact is internal/review-facing. The public app may show selected evaluation summaries, but
not raw unreviewed detector quality claims.

## Evaluation Sets

The harness should use named sets, not one undifferentiated "gold set."

| Set | Source | Purpose | Minimum viable construction |
|---|---|---|---|
| `confirmed_positive` | Approved reviewer decisions and promoted findings | Precision and evidence-quality checks | Existing review decisions with approved dispositions |
| `confirmed_negative` | Reviewer rejections and known clean scopes | False-positive measurement | Current implementation uses deterministic `clean_no_hit` coverage rows |
| `near_miss` | High score below threshold or rejected close calls | Threshold sensitivity | Top N below threshold by detector |
| `silent_scope` | Evaluated but no-hit route/segment/stop-hour scopes | Proves "no issue" was actually looked for | Coverage audit plus considered-scope rows |
| `missing_data_scope` | Skipped or low-coverage scopes | Missing-data discipline | Detector coverage audit, readiness, and source-gap outputs |
| `holdout` | Examples excluded from fitting | Regression guard | Current implementation uses a stable hash split of derived clean no-hit labels |
| `synthetic_fixture` | Generated examples with known truth | Unit/regression guard | Small fixture rows per detector family |

The first implementation includes `confirmed_positive`, derived `confirmed_negative`, `near_miss`,
`missing_data_scope`, and a stable-hash holdout split. Future work should upgrade the holdout from
derived negatives to reviewer-labeled stratified examples.

## Component Scores

Every detector version receives component scores on a 0 to 1000 scale. Use null when the evidence
is unavailable; never coerce unknown quality to zero or perfect.

| Component | Weight | Definition | Initial proxy |
|---|---:|---|---|
| Precision | 180 | Share of flagged/reviewed candidates confirmed by labels | TP / (TP + FP) |
| Recall | 90 | Share of known positives found | TP / (TP + FN), only when negatives/holdout exist |
| Evidence quality | 140 | Candidate has primary evidence, counter-evidence, coverage row, caveats, and source refs | Packet field completeness and schema checks |
| Missing-data discipline | 120 | Missing/low-coverage states are explicit and suppress overclaims | Skipped/missing scope audit plus no "clean" fallback |
| Calibration stability | 100 | Thresholds and ranks do not thrash across adjacent windows | Rank overlap, threshold delta, bootstrap CI width |
| Novelty | 90 | Finds non-duplicate useful scopes and detector ideas | Duplicate/supersession key rate, new scope share, reviewer novelty flag |
| Reviewer usefulness | 120 | Reviewers can approve or reject without opening raw tables | Approval share, needs-changes share, evidence completeness |
| Claim discipline | 100 | No causal, recommendation, or unsupported effect language | Language validator and claim-tier gates |
| Coverage robustness | 80 | Quality remains stable under source thinning and route-universe checks | Sensitivity to low coverage, route aliases, source-year gaps |
| Elegance | 80 | Simple, auditable detector logic relative to explanatory power | Rule count, dependency count, parameter count, reviewer rationale clarity |

Suggested overall score:

```text
overall =
  weighted_mean(non_null_component_scores)
  * hard_gate_multiplier
```

Hard gate multipliers:

| Gate | Multiplier |
|---|---:|
| Unresolved causal-language violation | 0 |
| Missing-data scored as clean/no issue | 0 |
| Missing primary evidence schema | 0 |
| Clean no-hit grain mismatch or blocked grain release gate | 0 |
| Precision below auto-publish floor for descriptive detector | 0.4 max |
| No negative or near-miss set available | 0.8 max |
| Detector readiness not ready | 0 |

The harness should show the pre-gate weighted score and the gated score separately.

## Elegance Score

The "elegance" score is deliberately soft, but it should be explicit enough to optimize.

| Subscore | Points | Question |
|---|---:|---|
| Minimal feature dependency | 180 | Does the detector use the fewest feature contracts needed for the claim? |
| Transparent math | 220 | Can a reviewer reproduce the score from the evidence packet? |
| Locality of thresholds | 160 | Are thresholds declared in policy/versioned config rather than scattered through code? |
| Counter-evidence symmetry | 160 | Is there a natural suppressor or counter-signal for every positive signal? |
| Low parameter surface | 120 | Does the detector avoid many hand-tuned knobs? |
| Failure-state clarity | 160 | Are low-coverage, no-baseline, and no-counterfactual outcomes legible? |

This score should not reward cleverness. It should reward boring, auditable detector design.

## Recommendations

Each detector scorecard emits a recommendation:

| Recommendation | Meaning |
|---|---|
| `promote_threshold_change` | Evidence supports changing thresholds or calibration config |
| `keep_current` | Current version passes quality gates |
| `watch` | Too little reviewed evidence or unstable component scores |
| `needs_feature_work` | Weak because inputs/features are inadequate |
| `needs_evidence_packet_work` | Detector may be good but packets are not reviewable |
| `retire_candidate` | Confirmed rate or claim discipline is too weak |
| `block_publication` | Hard gate failed |

Recommendations should be deterministic given the evaluation artifact inputs.

## CLI Plan

Add a command:

```sh
bun --filter @bp/pipeline-v2 cli -- evaluate detectors \
  --year 2026 --month 3 \
  --history-start-month 2023-04 \
  --run-id bus-observatory-2026-03
```

Responsibilities:

1. Load detector registry metadata and versions from `@bp/analytics`.
2. Load review decisions, review packets, promoted findings, score vectors, readiness, corpus
   profile, materialization coverage, and data-product completeness artifacts.
3. Build evaluation sets.
4. Compute per-detector confusion matrices where labels support them.
5. Compute component scores and hard gates.
6. Emit false-positive summaries and missing-data discipline summaries.
7. Write `detector-evaluation.json` plus a compact markdown report:

```text
data/artifacts/detector-evaluation/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/detector-evaluation.md
```

The command should be read-only except for writing artifacts.

## Pure Package Plan

Keep reusable math in `packages/analytics`, with no filesystem or SQLite access.

Proposed modules:

```text
packages/analytics/src/evaluation/index.ts
packages/analytics/src/evaluation/component-scores.ts
packages/analytics/src/evaluation/evaluation-sets.ts
packages/analytics/src/evaluation/scorecard.ts
packages/analytics/src/evaluation/elegance.ts
packages/analytics/src/evaluation/recommendations.ts
packages/analytics/src/evaluation/schema.ts
```

`tools/pipeline-v2` owns artifact loading and writing. `packages/analytics` owns deterministic
evaluation functions over typed arrays.

## Implementation Slices

Status as of 2026-06-01:

- R1 is implemented: scorecard helpers, the `evaluate detectors` command, JSON/markdown outputs,
  and all-detector rows exist.
- R2 is implemented for the current local finding coverage surface: derived clean no-hit negatives,
  stable-hash holdout labels, near-miss queue accounting, and missing-data scope accounting are
  wired into the evaluation artifact.
- R3 is implemented for available review packets and claim text: evidence completeness, packet
  coverage status, claim discipline, and hard-gate multipliers are computed.
- R4 is started: EWT and `speed_pace_hotspot` have detector-specific historical score vectors, and
  fourteen local-finding detector families have available generic release score vectors. The generic
  score-vector artifact now lists all 18 registered detector families and marks absent execution
  coverage explicitly. Adjacent-window stability still needs detector-specific historical vectors
  for the remaining families.
- R5 is partially complete: the harness consumes `detector-corpus-grain` release checks and flags
  route-month grain-policy warnings, clean-no-hit grain review requirements, and missing
  false-negative shadow audits. The general route-month shadow audit is now consumed by the grain
  audit, so route-month screening detectors clear the unavailable-shadow flag and retain measured
  hidden-route/candidate counts. Medium-risk detector grains still need detector-specific shadow
  audits before their unavailable-shadow flags clear.

### First Detector-Specific Historical Vector

`speed_pace_hotspot` is now the first segment/daypart detector to complete the evaluation bridge:

1. Feature contracts declare the detector's `segment_daypart` and `feed_health` needs.
2. A pipeline-v2 resolver converts `local_route_segment_speed` into `SegmentDaypartFeature` rows.
3. `findings run-detector` writes March 2026 candidates and coverage rows.
4. `build speed-pace-score-vectors` computes a 36-month historical vector.
5. `audit speed-pace-shadow` shows where route-month clean no-hits hide segment/daypart candidates.
6. `evaluate detectors` scores calibration stability from the detector-specific vector.

Current `speed_pace_hotspot` scorecard: calibration stability is 998/1000, evidence quality is
1000/1000 across 100 packets, missing-data discipline is 1000/1000 from 13,928 coverage rows, and
the detector is now `keep_current` with no evaluation flags.

### R1: Quality Artifact Skeleton

- Add pure scorecard types and weighted score helpers.
- Add the `evaluate detectors` command.
- Load existing `review-decisions.json`, `promoted-findings.json`, `review-packets.json`,
  `gold-set-evaluation.json`, and detector registry metadata.
- Emit per-detector rows with available/null component scores.
- Do not change detector thresholds yet.

Acceptance:

- Command writes JSON and markdown.
- All 18 registered detectors appear, even with `insufficient_labels`.
- Existing perfect gold-set smoke result is flagged as `positive_only_gold_set`.

### R2: Negative, Near-Miss, And Missing-Data Sets

- Add confirmed negative examples from rejected review decisions.
- Add near-miss set from promotion/review queues and score vectors.
- Add missing-data set from detector coverage/readiness/source-gap artifacts.
- Compute confusion matrices only when both positives and negatives exist.

Acceptance:

- Precision, recall, and unknown denominators are not conflated.
- A detector with no negatives cannot get a perfect overall score.
- Missing-data-as-clean fixture fails.

### R3: Evidence And Claim Discipline Gates

- Validate evidence role completeness from review packets.
- Count primary, counter-evidence, caveat, missing-data, and source refs.
- Reuse or add claim-language validators for causal/recommendation overclaiming.
- Add hard gate multipliers.

Acceptance:

- A candidate with no primary evidence hard-fails.
- A candidate with causal language outside allowed tier hard-fails.
- A candidate with no counter-evidence is penalized, not automatically blocked.

### R4: Stability And Novelty

- Compare score vectors across adjacent release windows where artifacts exist.
- Compute rank overlap, threshold movement, duplicate/supersession key rate, and new-scope share.
- Add bootstrap confidence interval width where score vectors support it.

Acceptance:

- Threshold changes require stability evidence or a written caveat.
- Duplicate-heavy detector versions score lower on novelty.

### R5: Lifecycle Integration

- Emit retirement/watch recommendations using review-cycle summaries and false-positive roots.
- Add detector version comparison and supersession records.
- Make threshold-change PRs require a current evaluation packet.

Acceptance:

- A detector below minimum reviewed count gets `watch`, not `retire_candidate`.
- A detector with enough labels and low confirmed rate gets `retire_candidate`.
- Evaluation artifact is referenced by calibration docs and release checklist.

## Data Requirements

Minimum viable data:

- Review decisions with `candidateId`, `detectorId`, `routeId`, and disposition.
- Review packets with candidate evidence roles and detector metadata.
- Promoted findings with source candidate references.
- Score vectors for at least EWT and progressively other detectors.
- Detector readiness, data-product completeness, and detector corpus-grain audit artifacts.
- Detector registry metadata including detector id, version, claim tier, and missing-data states.

Data to add soon:

- Rejected decision root cause.
- Reviewer novelty/usefulness flags.
- Supersession key or duplicate group.
- Considered-scope counts by detector.
- Explicit skipped/missing-data rows by detector grain.
- Negative/clean labels sampled from high-coverage no-hit scopes.

## Review Disposition Schema

Extend reviewer decisions over time with optional fields:

```ts
type DetectorReviewDisposition = {
  candidateId: string;
  detectorId: string;
  detectorVersion: string;
  routeId: string | null;
  decision: "approve" | "approve_with_revisions" | "reject" | "defer" | "needs_more_data";
  falsePositiveRootCause?: string;
  reviewerUsefulness?: "high" | "medium" | "low";
  novelty?: "new_signal" | "known_issue_better_evidence" | "duplicate" | "not_useful";
  evidenceQuality?: "sufficient" | "thin" | "missing_counter_evidence" | "missing_primary";
  claimDisciplineIssue?: string;
};
```

The harness must work without these optional fields, but it should score them when present.

## Release Gate

Detector threshold or scoring changes should require:

1. Current detector readiness passes.
2. Current detector evaluation artifact exists.
3. No hard claim-discipline gate failures.
4. No missing-data-as-clean failures.
5. Component score delta is non-negative, or a reviewer-approved waiver explains the tradeoff.
6. False-positive root causes are unchanged or improved.
7. The detector version bump matches the change kind.

This gate should not block experimental Ralph proposals. It should block detector-of-record
threshold/scoring changes.

## Ralph Loop Integration

Ralph should receive:

- detector evaluation scorecards;
- component scores and null reasons;
- false-positive root causes;
- near-miss examples;
- rejected examples;
- score-vector rank/spread summaries;
- source and feature coverage caveats;
- detector registry specs.

Ralph's job is then to propose targeted changes:

- a suppressor for a repeated false-positive root cause;
- a threshold adjustment with stability evidence;
- a new feature requirement for a weak detector;
- a detector retirement or split;
- a new detector that improves portfolio coverage without duplicating existing findings.

Every Ralph proposal should be judged by the harness before becoming detector-of-record behavior.

## Non-Goals

- Do not use LLM judgement as a detector-quality label without reviewer approval.
- Do not auto-publish causal or effect language from evaluation scores.
- Do not collapse detector quality to the overall score in docs or UI.
- Do not let "perfect" metrics from positive-only gold sets unlock threshold changes.
- Do not run live network probes inside the evaluation command.

## Open Questions

1. What is the first clean negative set: rejected review candidates, sampled no-hit high-coverage
   scopes, or both?
2. Which detector families need range-based rather than point confusion matrices first?
3. How many reviewed examples are enough before retirement recommendations are meaningful?
4. Should elegance be reviewer-scored, computed from code/registry metadata, or both?
5. How should portfolio score weight strategic detector families when some have sparse labels?

## Next Build Recommendation

The harness shape, derived negatives, holdout split, and packet coverage are now real. The next most
valuable build is to strengthen the evaluation inputs rather than add more scoring surface:

1. Generate detector-specific historical score vectors for the families that still report
   `score_vector_unavailable`.
2. Add reviewer-labeled rejected examples and false-positive root causes so derived negatives are
   supplemented with human-reviewed negatives.
3. Add adjacent-window stability checks once more than one release coverage month exists.
4. Materialize current-release candidates for the four registered detector families that still have
   no March packets.
5. Wire the new route-month shadow audit into the grain-audit release checks, then add the remaining
   detector-specific richer-grain false-negative shadow audits for medium-risk detector families.
6. Keep missing-data scopes separate from clean no-hit labels in every artifact and test fixture.

That turns the harness from a release QA surface into an actual detector-improvement loss function.
