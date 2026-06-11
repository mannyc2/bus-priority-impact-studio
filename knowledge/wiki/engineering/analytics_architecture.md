---
title: Analytics Architecture
type: engineering
status: active
last_updated: 2026-05-30
owner: codex
source_count: 0
tags: [analytics, detectors, feature-store, baselines, package-architecture]
---

# Analytics Architecture

## Purpose

`packages/analytics` is the analytical kernel of Bus Priority Impact Studio.

Its job is not to orchestrate jobs, query databases, publish artifacts, run agents, or serve the
public app. Its job is to turn typed evidence into reusable, deterministic analytical instruments:
feature builders, baselines, detectors, scores, evidence payloads, coverage rows, and calibration
helpers.

The target shape is:

```text
typed source/local inputs
  -> feature contracts
  -> baseline primitives
  -> detector algorithms
  -> candidates + evidence links + coverage audits
  -> pipeline persistence, review, and Studio projection outside analytics
```

This page refines [[wiki/engineering/package_structure|Repo Package Structure]] for the analytics
package specifically and gives the migration plan from the current detector files toward a more
ambitious detector-science layer.

The next detector-science roadmap is [[wiki/analysis/bus-reliability-detectors-spec|Bus Reliability
Detectors Spec]], which maps the 2023-2026 reliability literature review into feature contracts,
baselines, registry metadata, and staged detector implementation.

The next data-science roadmap is [[wiki/engineering/analytics_corpus_profile|Analytics Corpus
Profile]]. It separates the public release month from the historical detector-learning window so
the package can use the full local corpus for baselines, calibration, false-positive analysis, and
Ralph detector ideation without overclaiming historical evidence as current service state.

The initial calibration policy scaffold is
[[wiki/engineering/analytics_detector_calibration|Analytics Detector Calibration]]. The pure module
`packages/analytics/src/calibration/detector-policy.ts` declares named baseline windows,
seasonality rules, minimum-history gates, and post-backfill validation expectations for the first
full-history detector families.

The corpus-backed research orchestration layer is
[[wiki/engineering/applied_research_architecture|Applied Research Architecture]]. That page defines
`packages/applied-research` as the future home for detector study orchestration, score-vector
artifact builders, review-packet assembly, causal panels, forecasting backtests, and the shared
research scorecard. Those responsibilities should not live in this pure analytics kernel.

## Current Audit

The current package is directionally right:

- It is TypeScript-only and imports only `@bp/domain` plus Node `crypto` for stable IDs.
- Existing detector functions are pure: callers pass arrays and timestamps, functions return
  candidates, evidence links, and coverage audits.
- Tests live in `packages/analytics/test/`, not under production `src/`.
- Detector outputs use domain contracts such as `FindingCandidateSchema`,
  `FindingEvidenceLinkSchema`, and `FindingCoverageAuditSchema`.
- `apps/web` does not import `@bp/analytics`; public serving remains a projection consumer.

Before this refactor, the package was too file-local:

- Each detector defines its own input shape instead of consuming shared feature grains.
- Each detector repeats `stableId`, threshold merge logic, severity/confidence mapping, candidate
  construction, evidence link construction, and coverage row construction.
- Baselines are implicit inside detectors. Examples include fleet percentiles in
  `delay_concentration`, peer medians in `multi_month_speed_peer`, source coverage thresholds in
  `source_gap`, and pain/intervention floors in intervention detectors.
- Detector specs are generated as artifacts, but the source of truth is not yet a first-class
  analytics registry.
- `route-score.ts` and `hotspots.ts` are useful transforms, but they are not yet integrated into a
  shared feature/baseline/detector vocabulary.
- Calibration and backtest concepts exist in pipeline artifacts and wiki doctrine, but the reusable
  math and comparison primitives do not live in analytics yet.

Current analytics footprint, after the 2026-05-30 architecture refactor:

| Area | Files | Notes |
|---|---:|---|
| Package source | 81 TypeScript files | Core helpers, feature contracts, baseline primitives, detector registry/specs, calibration helpers, corpus profiling, detector files, local review-bundle helpers, transforms, and explicit barrels |
| Package tests | 30 TypeScript test files | Detector behavior tests plus architecture, registry, calibration, corpus, local review-bundle, and feature-contract tests |
| Detector families | 18 | Legacy coverage detectors plus the literature-driven headway, bunching, speed/pace, variability, schedule, trend, positive-deviance, intervention-event, and rider-weighted EWT detectors |
| Registry entries | 18 | Every detector has a spec, version, declared feature grains, scope metadata, claim tier, missing-data states, and run function |
| Repeated mechanics | centralized where stable | Stable IDs, threshold merging, number helpers, score-to-severity, evidence builders, coverage builders, score-vector summaries, gold-set evaluation, and reviewer summaries |

The conclusion is not that the previous code was bad. The conclusion is that the package had
outgrown the "one pure function per detector" stage. The architecture should preserve purity while
giving detectors shared analytical infrastructure.

The first full refactor now establishes that infrastructure. It intentionally preserves detector
behavior and thresholds. Direct domain-schema parsing still appears inside several mature detector
files where the payload shape is detector-specific; the reusable builders exist and can be adopted
when those detectors receive feature-level rewrites.

## Boundary Rules

`packages/analytics` may contain:

- pure deterministic TypeScript functions;
- typed feature and baseline contracts;
- detector algorithms;
- detector specs and registry metadata;
- scoring, coverage, evidence, and calibration helpers;
- fixture-backed tests.

`packages/analytics` must not contain:

- filesystem reads or writes;
- DB clients, Drizzle table imports, or repository calls;
- network/source clients;
- Worker handlers, React components, or deployable app code;
- pipeline command dispatch;
- LLM prompts, agent loops, sandbox execution, or model-specific code.

Consumers stay outside the package:

| Consumer | Responsibility |
|---|---|
| `packages/applied-research` | Resolve corpus-backed study inputs, run analytics over detector-native grains, build score vectors, review packets, evaluation artifacts, causal panels, and forecasting backtests |
| `tools/pipeline-v2` | Load local DB/artifact inputs, call analytics, persist detector outputs, build review packets and Studio artifacts |
| `packages/db` | Store local detector inputs/outputs and serving projections |
| `packages/domain` | Own public/internal contracts, branded IDs, and Zod schemas crossing package boundaries |
| `apps/web` | Read D1/R2/Worker projections only; no analytics imports |
| Future lab or review apps | Read generated artifacts or Worker APIs; do not become analytics runtime owners |

## Target Package Shape

Use a layered internal package structure:

```text
packages/analytics/src/
  core/
    ids.ts
    numbers.ts
    scoring.ts
    evidence.ts
    coverage.ts
    detector.ts

  features/
    route-month.ts
    segment-month.ts
    reliability.ts
    intervention.ts
    context.ts
    source-coverage.ts

  baselines/
    distribution.ts
    peer.ts
    history.ts
    intervention-window.ts
    source-coverage.ts

  detectors/
    source-gap.ts
    persistent-speed-hotspot.ts
    multi-month-speed-peer.ts
    observed-reliability.ts
    intervention-gap.ts
    intervention-underperformance.ts
    permit-correlated-slowdown.ts
    service-request-context.ts
    delay-concentration.ts

  registry/
    specs.ts
    detectors.ts

  calibration/
    gold-set.ts
    score-vectors.ts
    reviewer-feedback.ts

  transforms/
    hotspots.ts
    route-score.ts
    concentration.ts
```

This is a target shape, not a demand to move every file at once. Existing imports can be kept stable
through explicit root and subpath exports while modules move in small slices.

Implementation note, 2026-05-30: `core/`, `features/`, `baselines/`, `registry/`, and
`calibration/` now exist. Detector implementations remain in `findings/` for compatibility, with an
explicit `detectors/` barrel as the new public detector surface. `hotspots.ts`, `route-score.ts`,
and `concentration.ts` remain at the package root for stable imports; they can move under
`transforms/` later behind the same explicit exports.

## Core Layer

The core layer should remove detector boilerplate without becoming a generic framework.

Shared primitives should cover:

- deterministic `stableId(...parts)` with one delimiter and one hash length policy;
- `clamp`, `round`, weighted average, percentile, percentile rank, Gini, top-share helpers;
- `mergeThresholds(defaults, overrides)` with typed partials;
- score-to-severity helpers with detector-overridable bands;
- confidence helpers that separate sample support from rhetoric;
- candidate builders that accept domain fields and validate once;
- evidence builders for metric, context, counter-evidence, caveat, missing-data, and coverage refs;
- coverage builders for `hit`, `clean_no_hit`, `skipped_missing_input`, `skipped_failed_join`, and
  `source_lag`;
- deterministic sorting helpers for candidate ranking and baseline distributions.

The goal is to make a detector's code read like analytical logic, not schema plumbing.

## Feature Contracts

Detectors should consume typed features rather than each inventing a custom mini-feature store.

Initial feature grains:

| Feature grain | Purpose | Current source signals |
|---|---|---|
| `RouteMonthFeature` | Route-level speed, ridership, context, readiness, and coverage | `RouteMonthSignalFeature`, route scorecard fields, route trends |
| `RouteSegmentMonthFeature` | Directional timepoint segment speed, trip count, rider exposure, and geometry refs | `SegmentHotspot`, `local_route_hotspot`, speed observations |
| `RouteWindowSpeedFeature` | Route/segment speed by daypart, direction, weekday/weekend, or hour | brief/profile speed windows, future finer-grain speed artifacts |
| `RouteReliabilityFeature` | Observed headway, long gaps, scheduled baseline, sample support, Bus Wait Assessment | observed reliability summaries and control fields |
| `InterventionWindowFeature` | Treatment inventory, implementation windows, peer-adjusted deltas, source confidence | intervention comparison rows and Tier 2 document records |
| `ContextSourceFeature` | Source/event counts, fanout, match weights, freshness, role eligibility | context-event route touches and source coverage ledger |
| `SourceCoverageFeature` | Expected vs observed source availability and freshness by scope | source-gap inputs, source coverage audits |

Pipeline jobs may assemble these features from local DB tables, artifacts, or source snapshots.
Analytics receives them as already-loaded typed inputs. This keeps analytics pure while making
detectors richer.

## Baseline Primitives

Baselines should become first-class analytical objects.

Required baseline families:

| Baseline | Use |
|---|---|
| Fleet distribution | Percentiles and outlier detection across all routes or segments |
| Route history | Multi-month persistence, regression, recovery, and seasonal comparison |
| Peer group | Route-family/type/geography peer medians and residuals |
| Own-route free-flow | Segment delay relative to a route's better observed windows |
| Scheduled baseline | Observed reliability or travel time relative to planned service |
| Intervention window | Pre/post and peer-adjusted treatment comparisons |
| Source coverage | Expected source availability, join rate, and freshness |

A detector should be able to say which baseline it used and attach baseline facts as evidence or
counter-evidence. This is how the package moves from threshold hits to reusable instruments.

Historical baselines should be windowed explicitly. The release month is the public serving
snapshot, not the whole analysis corpus. Baseline builders should receive named windows such as
`lookback12`, `lookback36`, `seasonalPeerWindow`, or `prePostInterventionWindow`, and detector
outputs should stamp the window and coverage used. The full policy lives in
[[wiki/engineering/analytics_corpus_profile|Analytics Corpus Profile]] and
[[wiki/engineering/analytics_detector_calibration|Analytics Detector Calibration]], including the
`audit analytics-backfill-coverage` gate for promoting route segment speeds, hourly ridership, and
intervention comparisons from release-only evidence into full-history baseline substrates.

## Detector Contract

The package should converge on a detector contract that keeps existing output shapes but adds a
consistent registry surface.

Conceptual shape:

```ts
type AnalyticsDetector<TInput> = {
  detectorId: DetectorId;
  version: string;
  spec: FindingDetectorSpec;
  featureGrains: readonly string[];
  scope: {
    kind: "route" | "segment" | "corridor" | "system";
    description: string;
  };
  run(input: TInput): DetectorOutput;
};

type DetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};
```

This does not need to be over-abstracted. The important properties are:

- every detector carries an ID, version, and spec next to its compute;
- every detector declares the feature grains and scope universe it expects;
- every detector returns the same three output arrays;
- every detector can be registered, listed, and documented without bespoke code;
- every detector can be compared against prior runs or reviewer outcomes.

The research-informed registry should grow these analytics-only metadata fields before adding many
new detector families:

- `claimTier`: descriptive, associational, or candidate-causal-needs-review;
- `baselineFamilies`: schedule, own-history, free-flow, fleet-distribution, peer, source-coverage,
  intervention-window, control-routes, or synthetic-control;
- `promotionGates`: sample, coverage, pre-trend, placebo, control, and reviewer gates;
- `missingDataStates`: declared non-hit outcomes a detector may emit;
- `evidenceSchemaVersion`;
- `retirementStatus`.

Keep these metadata additions in analytics first. Promote them into `@bp/domain` only when serving
artifacts or public API contracts need them.

## Registry And Specs

`data/artifacts/findings/detector-specs.json` should eventually be generated from the analytics
registry, not maintained as a disconnected artifact.

Registry responsibilities:

- expose hand-authored detector specs;
- list supported detectors and versions;
- declare required feature grains;
- provide the detector run function;
- support spec artifact generation;
- give pipeline commands a stable way to select detectors by ID or family.

This makes detector documentation, tests, and execution line up.

## Calibration And Backtesting

Calibration belongs partly in analytics and partly in pipeline.

Analytics should own pure comparison primitives:

- score distributions;
- flagged-set summaries;
- detector-to-detector overlap;
- reviewer-outcome aggregation;
- gold-set expectation evaluation over typed detector outputs;
- confidence calibration buckets;
- before/after detector-version comparisons.

Pipeline should own:

- reading gold sets and reviewer decisions;
- running detectors against concrete months;
- writing backtest artifacts;
- preserving hashes, run metadata, and review provenance.

This is not a throwaway "evaluation script." It is the feedback loop that lets detectors improve
without hiding the evidence trail.

## Migration Plan

### Phase 0 - Document And Guard The Boundary

- Keep this page and [[wiki/analysis/ideal_detector_system|Ideal Detector System]] aligned.
- Keep architecture tests preventing `apps/web` from importing analytics or sources.
- Update `packages/analytics/README.md` so contributors know the package is a kernel, not a CLI.

### Phase 1 - Extract Shared Mechanics

Add `core/` helpers without changing detector behavior:

- `ids.ts`;
- `numbers.ts`;
- `scoring.ts`;
- `coverage.ts`;
- `evidence.ts`.

Port only the repeated plumbing first. Verification should show identical detector outputs for
existing fixtures.

Status, 2026-05-30: implemented. `core/ids.ts`, `core/numbers.ts`, `core/scoring.ts`,
`core/evidence.ts`, `core/coverage.ts`, and `core/detector.ts` exist. Detector files no longer keep
their own `stableId` copies, threshold merging is centralized through `mergeThresholds`, shared
numeric helpers back the score math, and `persistent_speed_hotspot` uses the evidence/coverage
builders as the first full builder migration.

### Phase 2 - Introduce Feature Contracts

Add `features/` types and mappers that mirror existing inputs:

- keep current detector input aliases as compatibility types where useful;
- migrate `persistent_speed_hotspot` and `source_gap` first because they have the clearest inputs;
- migrate `service_request_context` and `permit_correlated_slowdown` once context features are
  stable;
- migrate peer/reliability/intervention detectors after baseline objects exist.

Status, 2026-05-30: implemented as contracts. `features/` declares route-month, segment-month,
reliability, intervention-window, context-source, and source-coverage grains plus stable feature
keys. Existing detectors keep their compatibility input types while the registry declares which
feature grains each detector consumes.

### Phase 3 - Make Baselines Explicit

Move distribution, peer, history, schedule, intervention-window, and source-coverage calculations
into `baselines/`.

Detectors should receive or construct named baseline results and include baseline metadata in
evidence payloads and coverage rows.

Status, 2026-05-30: implemented as pure primitives. `baselines/` now exposes distribution rank and
quantile helpers, peer median baselines, historical deltas, intervention-window deltas, and
source-coverage baselines. Existing detector behavior is preserved; future detector improvements
should attach these baseline outputs directly as evidence and counter-evidence.

### Phase 4 - Build The Registry

- Move detector specs beside detector compute.
- Generate `finding_detector_specs` from the registry.
- Let pipeline select detector IDs from the registry rather than hard-coding lists.
- Keep the root package barrel explicit and expose larger layers through focused package subpaths.

Status, 2026-05-30: implemented inside analytics. `registry/specs.ts` is now the source for the
detector-spec artifact shape, and `registry/detectors.ts` registers every detector with version,
scope, feature grains, spec, and run function. `package.json` exposes focused `./core`,
`./features`, `./baselines`, `./detectors`, `./registry`, and `./calibration` subpaths. Pipeline
selection can move to this registry in a separate orchestration change.

### Phase 5 - Add Calibration Primitives

Add pure calibration helpers only after the registry exists:

- score-vector summaries;
- flagged-set overlap;
- detector-version comparison;
- gold-set expectation matching;
- reviewer-decision calibration buckets.

Pipeline can then produce richer backtest artifacts without duplicating the math.

Status, 2026-05-30: implemented initial pure primitives. `calibration/` now has score-vector
summaries, flagged-set overlap, gold-set expectation evaluation, and reviewer-decision summaries.
Detector-version comparisons and confidence buckets remain natural next additions once pipeline
backtest artifacts call this package.

### Phase 6 - Retire Legacy Shape

Once detectors are on shared contracts:

- remove per-detector `stableId` copies;
- remove bespoke severity/confidence helpers where generic bands work;
- remove detached spec-generation logic;
- keep older function names as compatibility exports only if pipeline still imports them.

Status, 2026-05-30: partially complete. Per-detector `stableId` copies are gone, root exports are
explicit, specs are registry-owned, and older detector function names remain as compatibility
exports. Detector-specific confidence rules and direct schema parsing remain where they encode
detector-specific evidence semantics.

### Phase 7 - Incorporate Reliability Literature

Use [[wiki/analysis/bus-reliability-detectors-spec|Bus Reliability Detectors Spec]] as the roadmap
for the next detector-science pass.

Order of work:

1. Add registry metadata for claim tiers, baseline families, promotion gates, missing-data states,
   evidence schema versions, and retirement status.
2. Add feature contracts for `stop_direction_hour`, `segment_daypart`,
   `route_direction_daypart`, `route_metric_history`, `intervention_panel`, and `feed_health`.
3. Add deterministic baseline/calibration helpers for EWT, headway cv/LOS, bunch/gap rates,
   buffer index, robust z, Theil-Sen slope, bootstrap intervals, segmented regression summaries,
   and range-based precision/recall.
4. Implement descriptive reliability detectors first: `headway_reliability_ewt` and
   `bunching_hotspots`.
5. Upgrade speed and schedule detectors: speed/pace decomposition, travel-time variability,
   schedule mismatch, and degradation trend.
6. Refactor context detectors behind association-only metadata and add event-study/ITS scaffolding
   with hard human-review gates before any causal/effect language.
7. Add positive deviance and rider-weighted EWT with explicit peer/ridership coverage gates and
   conservative claim tiers.

Status, 2026-05-30: Phase 7 steps 1-7, the R6 calibration loop, and the experimental
rider-weighted EWT detector are implemented.
`@bp/analytics/registry` now exports
analytics-only metadata types and constants, and every registered detector declares claim tier,
baseline families, promotion gates, missing-data states, evidence schema version, and retirement
status without changing detector behavior. `@bp/analytics/features` now includes the R1 feature
contracts for `stop_direction_hour`, `segment_daypart`, `route_direction_daypart`,
`route_metric_history`, `intervention_panel`, and `feed_health`, plus the R4
`positive_deviance` contract and the derived `rider_weighted_excess_wait` contract, all carrying
shared quality fields for coverage, freshness, and sample support. `@bp/analytics/baselines` now includes deterministic
headway helpers for SWT/AWT/EWT, cv_h/LOS, and bunch/gap rates, and the registry includes the
descriptive `headway_reliability_ewt` and `bunching_hotspots` detectors over `stop_direction_hour`
features, plus experimental associational `rider_weighted_excess_wait` over APC/ridership exposure
features. The R3 slice adds runtime/pace helpers plus descriptive `speed_pace_hotspot`,
`travel_time_variability`, and `schedule_mismatch` detectors over `segment_daypart` and
`route_direction_daypart`. The R4 slice adds robust-z/Theil-Sen helpers, associational
`degradation_trend`, and descriptive `positive_deviance`. The R5 slice adds shared
context-association helpers for permit/311 detectors plus intervention gate summaries and the
associational `intervention_event_study` detector. The R6 slice adds range-based precision/recall,
seeded bootstrap intervals, segmented-regression summaries, detector-version comparison,
review-cycle confirmed-rate summaries, retirement recommendations, and false-positive root-cause
summaries. Remaining work is integration outside analytics: pipeline/review tools need to persist
gold sets, false-positive registers, and detector retirement logs.

## Historical First Proof Slice

The first implementation slice should be intentionally small:

1. Add `core/ids.ts`, `core/numbers.ts`, and `core/scoring.ts`.
2. Port `persistent_speed_hotspot` to shared ID and score/severity helpers.
3. Prove fixture output does not change.
4. Add a small detector metadata object for `persistent_speed_hotspot`.
5. Repeat for `source_gap`.

Do not start with the hardest detector. The first win is architectural confidence.

## Non-Goals

- Do not move orchestration from `tools/pipeline-v2` into analytics.
- Do not add a deployable analytics app as part of the package refactor.
- Do not add Python, Postgres, PostGIS, or a new runtime.
- Do not make D1 a detector warehouse.
- Do not redesign every detector's science or thresholds in an architecture-only branch.
- Do not convert every helper into a class hierarchy.
- Do not let agent or review workflows define analytics package dependencies.

## Verification Expectations

Every architecture slice should run the smallest relevant checks:

- shared helper changes: `bun --filter @bp/analytics test`;
- detector behavior changes: affected detector tests plus fixture equality when behavior should not
  change;
- domain contract changes: `bun --filter @bp/domain test` and `bun run check:types`;
- pipeline wiring changes: relevant `@bp/pipeline-v2` test or dry-run command;
- boundary changes: `bun test tests/harness/production-boundaries.test.ts`.

Do not fabricate detector improvement claims. A detector is better only when a fixture, gold set,
review outcome, or documented evidence audit shows the improvement.

Current architecture-refactor verification, 2026-05-30:

- `bun --filter @bp/analytics typecheck`
- `bun --filter @bp/analytics test` (67 passing tests across 16 files)

## Open Questions

- Which feature contracts belong in `@bp/domain` because they cross package boundaries, and which
  can remain analytics-internal?
- Should detector versions be semantic strings (`1.0.0`) or artifact-style derivation IDs?
- How much of `RouteMonthSignalFeature` should be decomposed into narrower feature grains?
- Should route score become another detector, a baseline, or remain a serving-prioritization
  transform?
- When a detector emits segment candidates but route coverage rows, should the registry declare both
  scopes explicitly?
- What is the minimum gold set needed before calibration helpers can guide threshold changes?

## North Star

`packages/analytics` should make this project feel like a serious public-data research product:

- the system knows what it measured;
- every detector has a declared universe;
- baselines are inspectable;
- silence is auditable;
- candidates have evidence and counter-evidence;
- review outcomes can improve the instruments;
- the public app receives only precomputed, reviewed, provenance-rich projections.

That is the bar for the next phase.
