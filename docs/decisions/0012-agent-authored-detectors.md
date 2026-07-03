# 0012 - Agent-assisted detector authoring

Date: 2026-05-30
Revised: 2026-05-31

> **Superseded (2026-07-03).** The agent-authored-detector workflow is historical after the
> generation-3 hard cutover. The accepted detector boundary that still matters is the deterministic
> `@bp/analytics` registry plus ADR 0018 readiness gates.

## Status

**Proposed, revised after the 2026-05-30 analytics refactor.**

This ADR replaces the earlier "agent-authored detectors" plan. The original plan
assumed a pre-refactor detector layer: 8 hand-authored detectors, scattered
detector logic, no claim-tier metadata, no reviewer-driven lifecycle helpers, and
a proposed `submit_detector -> {score, flagged, evidence}` shape. That is no
longer the codebase.

The current plan is stricter:

- `packages/analytics` is the detector kernel and source of truth.
- `ANALYTICS_DETECTOR_REGISTRY` is the accepted detector registry.
- `data/artifacts/findings/detector-specs.json` is a generated projection, not
  the registry.
- Agent/Ralph loops may propose detector candidates, specs, feature ideas, and
  implementation patches, but they are not detectors of record.
- The harness, analytics tests, backtest jobs, review outcomes, and human review
  decide what becomes an accepted detector version.

This does not supersede ADR 0011. Findings-mode still exists for deep one-off
research. This ADR defines the detector-library path.

## Context

ADR 0011 proved that codemode agents can find useful one-off findings by writing
reproducible code against a read-only corpus. The next leverage point is not more
single-scope findings; it is better reusable detectors that run across declared
scope universes and produce candidates, evidence, and coverage audits.

The analytics package now already provides most of the substrate the first ADR
0012 draft wanted to build:

| Old premise | Current reality |
| --- | --- |
| 8 hand-authored detectors | 18 registered detectors in `ANALYTICS_DETECTOR_REGISTRY` |
| Detector logic is scattered hand TypeScript | Detectors share an `AnalyticsDetector<TInput>` contract plus registry metadata |
| Detector specs are the source of truth | Registry is the source of truth; detector-spec artifacts are projections |
| Novelty needs Jaccard and Spearman from scratch | `jaccardOverlap`, `flaggedSet`, and `summarizeScoreVector` exist; Spearman remains a real gap |
| Domination must be invented wholesale | Backtested domination must compose existing gold-set, range precision/recall, reviewer-decision, and review-cycle helpers |
| Review acceptance to retirement is a deferred phase | Reviewer summaries, false-positive summaries, and retirement recommendations already exist |
| No claim-tier concept | `claimTier`, `promotionGates`, and intervention gate summaries are first-class |
| `submit_detector` returns `{score, flagged, evidence}` | Accepted detectors return `FindingCandidate[]`, `FindingEvidenceLink[]`, and `FindingCoverageAudit[]` |

This changes the shape of the plan. The next system should not invite a model to
invent an opaque mini-runtime. It should use agents to draft candidate detector
work, then force that work through the same typed, deterministic, review-aware
kernel as human-authored detectors.

## Decision

Build a **registry-first detector candidate loop**.

The agent loop is an authoring and discovery aid. It can:

- inspect the current registry, specs, known failure modes, review outcomes, and
  calibration artifacts;
- propose a new detector family;
- propose a versioned improvement to an existing detector;
- propose a spec or metadata improvement;
- prototype an analysis with `ts_exec` in the Bun/TypeScript sandbox to prove a
  pattern exists;
- open a normal code patch that adds or changes pure TypeScript detector code.

The detector of record is never the model. The detector of record is an accepted
registry entry in `packages/analytics`, with deterministic TypeScript compute,
tests, registry metadata, generated specs, pipeline backtest artifacts, review
evidence, and a human-accepted merge path.

## Boundary Reconciliation

`knowledge/wiki/analysis/ideal_detector_system.md` says LLMs must not compute
metric values or become detectors of record. This ADR keeps that rule.

Allowed:

- An LLM writes exploratory sandbox code to discover a candidate procedure.
- An LLM drafts a detector spec, failure-mode note, or implementation patch.
- An LLM-authored patch may become normal repo code after review, tests, and
  deterministic backtests.

Not allowed:

- A model response is treated as a metric value.
- Sandbox output is published as detector output without harness re-execution.
- Agent loop, prompt, sandbox, model, or `.ralph` code enters
  `packages/analytics`.
- A detector registry entry calls an LLM or reads agent memory at runtime.
- The public app imports detector authoring or pipeline-only code.

The clean distinction:

```text
LLM proposes a frozen procedure
  -> deterministic harness runs it
  -> analytics implementation is reviewed and tested
  -> registry records the accepted detector version
  -> pipeline computes candidates, evidence, and coverage
  -> reviewer gates decide publication
```

## Accepted Detector Shape

Accepted detectors follow the existing analytics contract:

```ts
type AnalyticsDetector<TInput> = {
  detectorId: DetectorId;
  version: string;
  spec: FindingDetectorSpec;
  featureGrains: readonly string[];
  scope: AnalyticsDetectorScope;
  run(input: TInput): DetectorOutput;
};

type DetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};
```

The proposal path may use a sandbox prototype, but the accepted implementation
must be pure TypeScript in the analytics package, with no filesystem, database,
network, Worker, pipeline, sandbox, or model dependencies.

Every accepted detector or detector version must declare:

- `FindingDetectorSpec`, including `allowedClaimStrength` and
  `supportingEvidenceExpected`;
- `claimTier`;
- `baselineFamilies`;
- `promotionGates`;
- `missingDataStates`;
- `evidenceSchemaVersion`;
- `retirementStatus`;
- declared feature grains and scope kind;
- tests for the detector behavior and registry metadata.

## Candidate Submission Modes

### 1. Spec Or Metadata Improvement

Use when the detector question, claim template, allowed claim strength,
supporting evidence, counter-evidence, promotion checklist, known failure modes,
claim tier, promotion gates, or missing-data states are wrong or incomplete.

Gate:

- schema and registry lint;
- consistency with claim-tier doctrine;
- no change in emitted candidates unless compute also changes;
- reviewer-readable migration note.

### 2. New Detector

Use when the proposal fills a real coverage gap that no registered detector
currently measures.

Gate:

- contract, coverage, and determinism gates;
- score-vector non-degeneracy;
- novelty against accepted detectors;
- claim-tier and promotion-gate validation;
- held-out release-month run before acceptance beyond experimental status.

### 3. Improved Detector Version

Use when the proposal changes an existing detector's scoring, feature use,
threshold, evidence payload, missing-data handling, or coverage behavior.

Gate:

- contract, coverage, and determinism gates;
- backtested domination or explicitly documented tradeoff;
- no regression on promoted or reviewer-confirmed positives unless the reviewer
  outcome was itself superseded;
- semver change kind from `compareDetectorVersions`;
- versioned migration note and retirement/supersession policy for the old
  version.

Novelty is not required for an improved version. It should overlap the detector
it improves.

## Admission Gates

These gates replace the old D1-D4 draft.

### A0 - Boundary Gate

The candidate does not add model, prompt, sandbox, filesystem, network, database,
Worker, app, or pipeline dependencies to `packages/analytics`.

### A1 - Contract Gate

The candidate implements or modifies a registered `AnalyticsDetector<TInput>`
shape. It returns candidates, evidence links, and coverage audits, not a loose
`{score, flagged, evidence}` object.

For every considered scope, the run must emit a coverage outcome such as `hit`,
`clean_no_hit`, `skipped_missing_input`, `skipped_failed_join`, `source_lag`, or
an explicitly declared missing-data state.

### A2 - Determinism And Scope Gate

Pipeline or harness code runs the detector over the declared scope universe and
re-runs a sample. Outputs must be byte-stable after deterministic sorting and
hashing.

The harness, not the model, computes metrics, score vectors, review summaries,
novelty, precision/recall, and backtest packets.

### A3 - Non-Degeneracy Gate

The score vector must discriminate:

- it does not flag all scopes or no scopes;
- flagged share stays within detector-family policy;
- score distribution has non-zero spread;
- missing inputs are represented as coverage states, not silent clean misses.

Existing helper: `summarizeScoreVector`.

Gap to close: extend score-vector summaries with standard deviation or add a
companion helper, because min/max and flagged share are not enough to reject
flat-but-thresholded vectors.

### A4 - Novelty Gate For New Detectors

New detectors must be distinct from existing registry members.

Use:

- `flaggedSet`;
- `jaccardOverlap`;
- a new Spearman rank-correlation helper over aligned score vectors.

The Spearman helper is a required implementation gap. Tie handling must be
explicit and fixture-tested.

### A5 - Claim-Tier And Promotion Gate

The detector's strongest possible claim is bounded by both:

- domain spec `allowedClaimStrength`; and
- analytics registry `claimTier` plus `promotionGates`.

Descriptive detectors may produce publishable descriptive candidates when sample,
coverage, baseline, freshness, and reviewer gates pass. Associational detectors
must keep association language and reviewer approval. Candidate-causal work must
stay behind intervention gates and methodology review. `summarizeInterventionGates`
is the starting point for event-study promotion checks, not optional decoration.

### A6 - Evidence Packet Gate

Every candidate must carry the values the detector actually used, enough evidence
for review, and explicit counter-evidence or missing-data caveats where the
packet is incomplete.

The gate checks the detector's `primaryEvidenceRequired`,
`supportingEvidenceExpected`, and `counterEvidenceRequired` fields. It rejects
"score only" hits that cannot be reviewed from their packet.

### A7 - Domination Gate For Improved Versions

`compareDetectorVersions` only classifies semver movement. It does not prove an
improvement.

Domination must be composed from existing calibration and review helpers:

- `evaluateGoldSet` for expected positive/negative scopes;
- `evaluateRangePrecisionRecall` for range/window detectors;
- `summarizeReviewerDecisions`;
- `summarizeDetectorReviewCycle`;
- `summarizeFalsePositiveRootCauses`;
- detector-specific coverage and missing-data summaries.

An improved version can pass by:

- increasing confirmed precision at acceptable recall;
- fixing a documented known failure mode;
- increasing coverage without lowering confirmed precision;
- adding required counter-evidence or missing-data states that reduce
  false-positive root causes;
- lowering claim tier or promotion strength when the old version overclaimed.

If the change intentionally trades precision for recall, the packet must say so
and require human approval.

### A8 - Lifecycle Gate

Accepted detectors enter a lifecycle immediately:

- review outcomes are summarized by detector id and version;
- false positives are tagged with root causes;
- `recommendDetectorRetirement` produces keep/watch/retire-candidate advice;
- superseded detector versions remain reproducible for historical artifacts;
- retired detectors stop generating new review packets but remain documented.

Retirement is not a future Phase 4 idea. The helpers exist; the missing work is
pipeline persistence and policy wiring.

## Registry And Artifact Rules

`ANALYTICS_DETECTOR_REGISTRY` is canonical.

The generated `finding_detector_specs` artifact is a public/review projection.
It must not become a separate hand-edited registry or the Ralph ledger.

Ralph detector mode may keep a candidate ledger under `data/working` or
`data/artifacts`, but that ledger is only proposal history. It may store:

- candidate id;
- proposal mode;
- base detector id and version when applicable;
- proposed spec or metadata diff;
- sandbox prototype hash;
- deterministic run/backtest artifact refs;
- reviewer decision;
- supersession or retirement note.

It must not be imported by `packages/analytics` or the public app.

## Implementation Plan

### Phase 0 - Freeze The New Ground Truth

- Keep this ADR aligned with Analytics Architecture, Analytics Detector
  Calibration, Bus Reliability Detectors Spec, and Ideal Detector System.
- Add ADR/README/wiki pointers so future agents read this plan instead of the
  stale first draft.
- Verify the registry count, detector ids, claim tiers, feature grains, and spec
  projection are generated from analytics.

Exit: the docs no longer describe 8 detectors or a detached detector-spec
registry.

### Phase 1 - Add Missing Pure Calibration Primitives

- Add Spearman rank correlation for aligned detector score vectors.
- Add score-vector spread statistics or a companion non-degeneracy helper.
- Add fixture tests for ties, empty vectors, constant vectors, and partial scope
  alignment.
- Keep this in `packages/analytics/src/calibration`.

Exit: new-detector novelty and non-degeneracy can be computed without pipeline
ad hoc math.

### Phase 2 - Define Detector Candidate Capsules In Pipeline

- Add a pipeline-owned candidate artifact shape for detector proposals.
- Seed Ralph detector mode with `ANALYTICS_DETECTOR_REGISTRY`, generated specs,
  known failure modes, claim tiers, promotion gates, review summaries, and
  calibration artifacts.
- Let the agent prototype only against read-only corpus data and `.ralph` scratch.
- Persist proposal metadata and sandbox hashes outside analytics.

Exit: the agent can submit a detector candidate without pretending the proposal
is already an accepted detector.

### Phase 3 - Wire Deterministic Admission Packets

- Build a pipeline command that runs a candidate or candidate patch against a
  scope sample, then a full scope universe only after provisional pass.
- Emit an admission packet with A0-A8 results, score vectors, overlap checks,
  coverage summaries, evidence packet audits, and deterministic hashes.
- Cache runs by detector code hash, feature-artifact hash, release month, and
  scope universe.

Exit: every detector proposal has a reproducible pass/fail packet before code
review.

### Phase 4 - New Detector Path

- Convert an accepted proposal into a pure TypeScript detector, registry entry,
  specs, metadata, and tests.
- Mark novel detectors `experimental` until a held-out month and first reviewer
  cohort pass.
- Generate detector specs from the registry projection.

Exit: a new detector reaches the registry without bypassing analytics boundaries
or review gates.

### Phase 5 - Improved Detector Version Path

- Compare old and new versions over a fixed backtest corpus.
- Produce domination packets using gold sets, range precision/recall, reviewer
  outcomes, false-positive root causes, and coverage deltas.
- Require semver, migration notes, and supersession policy.
- Keep old versions reproducible for historical review.

Exit: "v2 is better" means an auditable backtest result, not a nicer prompt.

### Phase 6 - Registry-Driven Pipeline Runs

- Move pipeline detector selection to the analytics registry where it is not
  already using it.
- Persist detector version, registry metadata, coverage rows, candidates,
  evidence links, packet hashes, and claim-tier gates with every run.
- Ensure Studio projections read reviewed/promoted artifacts, not raw detector
  candidates.

Exit: the detector library runs as the normal source of review packets.

### Phase 7 - Review, Retirement, And Supersession

- Persist reviewer decisions by detector id/version.
- Persist false-positive root causes.
- Run retirement recommendations on a schedule or release cycle.
- Add explicit supersession records for old versions.
- Surface watch/retire candidates in engineering review, not public UI.

Exit: weak detectors stop compounding false positives and strong detectors have
measured precision signals.

### Phase 8 - Evaluate Against Findings Mode

Compare equal-budget runs:

- ADR 0011 findings Ralph loop;
- detector candidate Ralph loop.

Primary metric: promoted findings per dollar after review.

Secondary metrics:

- distinct detector families improved or added;
- review-confirmed rate by detector version;
- false-positive root cause reduction;
- coverage increase over declared scope universes;
- pairwise score-vector redundancy;
- number of claim-tier downgrades that prevented overclaiming.

Exit: detector mode earns its place by compounding reviewed findings, not by
producing more proposal text.

## Non-Goals

- Do not build an opaque detector DSL or model-runtime detector engine.
- Do not put sandbox execution, prompts, or `.ralph` memory in analytics.
- Do not auto-promote candidates solely because they pass novelty or
  non-degeneracy gates.
- Do not treat context sources as causes.
- Do not publish candidate-causal claims without method gates and human review.
- Do not migrate to Python, Postgres/PostGIS, a VPS, or a new service because of
  this plan.

## Open Questions

- Where should the detector candidate capsule schema live: pipeline-only first,
  or `@bp/domain` once review tools consume it?
- What exact flagged-share and score-spread thresholds should be family-specific
  defaults?
- What Spearman tie policy should become canonical?
- How should variable-cardinality segment and stop-hour detectors align score
  vectors for novelty comparisons?
- What is the minimum gold set per detector family before domination gates can
  guide threshold changes?
- Should agent-created implementation patches be allowed to edit analytics files
  directly, or should detector mode stop at proposal capsules until a human asks
  for the code patch?
- Which review outcomes can supersede old promoted positives when an improved
  version intentionally stops flagging them?

## Consequences

### Positive

- The plan now matches the actual analytics architecture.
- Agents can still help invent detectors, but deterministic code and review stay
  in charge.
- New detectors, detector improvements, spec improvements, claim-tier gates, and
  retirement all share one lifecycle.
- Existing calibration helpers are reused instead of reimplemented in the
  pipeline.
- The registry becomes a stronger portfolio artifact: a library of reviewed,
  versioned, auditable instruments.

### Negative / Risks

- Detector candidate admission is heavier than one-off finding validation.
- Spearman, richer score-vector spread, and candidate-capsule persistence are
  still missing.
- Backtest quality depends on gold-set and reviewer-decision coverage.
- A lazy agent can produce plausible detector prose with no useful implementation;
  the gates must reject it cheaply.
- Human review remains necessary before stronger claims or accepted registry
  changes.

## Verification Expectations

For doc-only changes to this ADR, inspect diffs.

For implementation phases:

- analytics calibration helpers: `bun --filter @bp/analytics test`;
- detector behavior changes: affected detector tests plus registry tests;
- pipeline candidate/admission commands: focused `@bp/pipeline-v2` tests and a
  fixture-backed dry run;
- domain contract additions: `bun --filter @bp/domain test` and
  `bun run check:types`;
- boundary changes: `bun test tests/harness/production-boundaries.test.ts`.

Do not claim a detector improved unless a fixture, gold set, reviewer outcome,
or documented admission packet proves it.
