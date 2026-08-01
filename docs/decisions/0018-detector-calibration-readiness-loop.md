# 0018 - Detector calibration and readiness loop

Date: 2026-06-08

## Status

Accepted — program complete 2026-06-11; all 21 detectors dispositioned; calibration receipts preserved in git history (removed from the working tree by plan 112).

## Context

ADR 0012 established that accepted detectors are deterministic TypeScript registry entries, not
model responses. That solved the detector-of-record boundary, but it did not fully define how a
detector output becomes safe enough for route pages, briefs, public findings, or internal review.

Recent detector work exposed the missing lifecycle. The treatment-scope detectors and the
`customer_journey_shortfall` detector both began as plausible candidate generators. They became
useful only after a repeated loop:

1. run the detector without writing DB rows;
2. inspect candidates, evidence, and coverage rows;
3. create a reviewed queue;
4. label examples into product-surface buckets;
5. evaluate detector output against stable labels;
6. add deterministic gates only when labels expose a real false-positive class;
7. project output into readiness buckets that say what downstream surfaces may do with it.

The concrete results justify making this a project rule:

- `treatment_scope_gap` / `treatment_scope_mismatch` now have a 118-label reviewed gold set,
  12/12 reviewed primary survival, 0/23 suppress leakage, and a readiness projection separating
  public-finding candidates, route context, review queue rows, and suppressed rows.
- `customer_journey_shortfall` now has reviewed CJTP gold labels, an exposure gate backed by labels,
  a readiness projection, and explicit caveats that CJTP is a composite performance share, not a
  causal component truth.

Without this loop, "detector candidate" is too easy to mistake for "publishable finding."

## Decision

Adopt a **reviewed-gold calibration and readiness loop** for detector families that can influence
route pages, briefs, public findings, or other product-facing surfaces.

The detector runtime remains deterministic and registry-first:

```text
packages/analytics detector
  -> candidates + evidence + coverage
  -> applied-research review queue
  -> reviewed gold labels
  -> evaluation metrics
  -> deterministic detector gates, if justified
  -> readiness projection
  -> serving/public promotion gate
```

The detector itself answers "what signal did the data produce?" The readiness projection answers
"what may the product do with this signal?"

## Required Loop

### 1. No-write run and inventory

Calibration starts with a no-write detector run, normally through `findings run-detector` with
`writeDb=false`.

The run artifact must record:

- detector id and version;
- release or source month;
- feature counts and source freshness;
- candidate, evidence, and coverage counts;
- skipped/clean/hit coverage distributions;
- sample candidates and evidence payload shape;
- whether DB rows were written.

### 2. Review queue

Build a review queue from emitted candidates and selected controls. The queue must carry enough
context to review the candidate without rerunning the detector by hand:

- stable scope identity;
- detector score and claim text;
- evidence and counter-evidence;
- coverage or skip reason;
- relevant metric values and units;
- source freshness / as-of month;
- known caveats such as geometry ambiguity, low exposure, short history, or composite metrics.

Large detector outputs should be reviewed by stratified expansion, not one flat score-ordered manual
pass. Stratify by score, route type, geography, exposure, component/metric family, edge cases, and
likely false-positive classes.

### 3. Reviewed gold labels

Each calibrated detector family owns a reviewed gold artifact. Labels must use stable identity,
not regenerated candidate ids or row order.

Minimum label fields:

- `detectorId`;
- `scopeId`;
- stable `identityKey = detectorId + scopeId`;
- `expectedFrontendUse`;
- review batch and review depth;
- reviewer confidence or equivalent;
- rationale/notes;
- root-cause or false-positive tags;
- reviewed evidence snapshot when useful.

Use this frontend-use vocabulary unless a detector family has a documented reason to narrow it:

| Bucket | Meaning |
|---|---|
| `primary_finding` | Strong reviewed signal that may enter a public-finding-candidate queue after promotion gates. |
| `route_context` | Useful route-page or brief context, but not a standalone finding. |
| `reviewer_only` | Useful for internal analyst review, not route-page material by default. |
| `needs_more_evidence` | Plausible but blocked on missing source, denominator, geometry, or methodological support. |
| `suppress` | Should not emit as a candidate/finding for the reviewed scope. |

Detector families may add domain tags, such as treatment-scope false-positive roots or CJTP component
drivers, but the product-surface buckets should remain comparable.

### 4. Evaluation

Every reviewed gold artifact must have an evaluator that reports at least:

- primary survival;
- suppress leakage;
- unreviewed emitted count;
- context/reviewer leakage;
- counts by review batch and review depth;
- counts by root-cause or false-positive family;
- candidate cap effects when a detector caps output.

Evaluation should be reported for each label batch and for the combined gold set. Batch-specific
metrics are diagnostic; the combined set is the headline calibration view.

### 5. Deterministic gate changes

Detector gates should follow label evidence. Do not add a hard gate because it sounds plausible.

Allowed gate examples:

- terminal/layover suppression;
- minimum exposure or denominator thresholds;
- minimum history/persistence requirements;
- stable/improving history suppression for worsening claims;
- geometry/source-state split;
- duplicate physical-scope dedupe;
- component-ambiguity handling.

Each gate change must have focused tests and a before/after evaluation note. Do not move or weaken
labels to improve metrics. If a stricter threshold drops reviewed primaries, keep the older threshold
or document the tradeoff explicitly.

### 6. Readiness projection

A detector candidate is not a public finding. Every calibrated detector family that feeds product
surfaces needs a deterministic readiness projection.

Use these readiness buckets:

| Bucket | Meaning |
|---|---|
| `public_finding_candidate` | Reviewed primary label plus any detector-family source, geometry, denominator, and promotion gates. Still a candidate for editorial/public promotion, not automatic publication. |
| `route_context` | Reviewed or safe contextual signal suitable for route pages/brief context with caveats. |
| `review_queue` | Unreviewed emitted candidates, reviewer-only rows, or needs-more-evidence rows. |
| `suppressed` | Reviewed suppressed labels and explicitly blocked rows. |

Readiness projections must distinguish reviewed suppression from coverage skips. For example:

- `reviewedSuppressedCount`;
- `coverageSkippedCount`;
- `unreviewedSuppressedCoverageCount`.

The word "suppressed" must not quietly mean "all skipped coverage rows" unless the artifact says so.

## Package Ownership

`packages/analytics` owns deterministic detector logic, feature types, detector registry metadata,
and focused detector tests.

`packages/applied-research` owns review queues, reviewed gold artifacts, evaluation functions,
readiness projections, local feature resolvers, and artifact construction helpers.

`tools/pipeline-v2` owns CLI invocation, local DB opening, artifact I/O, and no-write/write
orchestration.

`apps/web` and public Worker code must not import detector calibration code. They should read only
serving projections that have passed the relevant publication gate.

## LLM And Agent Boundary

LLMs may help draft reviews, adversarial checks, or implementation patches, but their work is not a
runtime dependency or a detector of record.

If an LLM assists review:

- save prompts, packets, outputs, and merge decisions as artifacts;
- preserve review depth/provenance on labels;
- rerun deterministic evaluators after merging labels;
- treat the artifact, not the chat transcript, as the durable record.

## Publication Rules

Public-facing route pages and briefs may use detector outputs only through readiness projections or
serving projections derived from them.

Public claim language must respect the detector's claim tier and data limits:

- reviewed primary labels may become public-finding candidates;
- route-context labels may appear as context with caveats;
- unreviewed emitted candidates stay in internal review queues;
- document/Tier 2 prose can support intervention context, but it is not metric truth;
- composite metrics such as CJTP need unit and component caveats.

## Consequences

- Detector work becomes slower at first but less embarrassing and more compounding.
- Every serious detector family should accumulate a reusable gold/eval artifact.
- "Candidate count went down" is no longer enough; evaluation must show which reviewed classes were
  preserved or suppressed.
- Public product surfaces can ask a clear question: "is this reviewed, contextual, review-only, or
  suppressed?"
- Detector families can mature independently without forcing one universal gold-schema abstraction.

## Rejected Alternatives

### Treat every emitted detector candidate as a finding

Rejected. The treatment-scope and CJTP work both showed plausible detector candidates can be
terminal artifacts, sparse denominators, source gaps, stable chronic conditions, or context rather
than findings.

### Require one universal label schema for all detector families

Rejected. Stable identity, frontend-use buckets, review provenance, and evaluation metrics should be
shared. Domain fields should stay detector-specific.

### Use only manual review notes without machine-readable gold artifacts

Rejected. Manual notes do not support regression tests, batch metrics, threshold sweeps, or
readiness projections.

### Tune thresholds before labels

Rejected. Threshold changes must be tied to reviewed false-positive or false-negative classes.

### Claim out-of-sample precision from synthetic shape smokes

Rejected. Synthetic remaps or dependency-blocked runs can prove plumbing shape only. They cannot
support precision claims without labels from the actual source/month.

## Current Implementations

As of this ADR:

- treatment-scope reviewed gold/eval/readiness lives in
  `packages/applied-research/src/evaluation/treatment-scope-reviewed-gold.ts`;
- CJTP reviewed gold/eval/readiness lives in
  `packages/applied-research/src/evaluation/customer-journey-reviewed-gold.ts`;
- generic readiness helpers live in
  `packages/applied-research/src/evaluation/detector-readiness-projection.ts`;
- calibration artifacts live under `data/artifacts/detector-calibration-*` and
  `data/artifacts/detector-readiness-*`.

Future detector families should reuse the loop, not necessarily the exact schemas.
