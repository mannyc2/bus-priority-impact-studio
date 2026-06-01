---
title: Applied Research Architecture
type: engineering
status: draft
last_updated: 2026-06-01
owner: codex
source_count: 0
tags: [applied-research, analytics, detectors, causal-inference, forecasting, pipeline-v2, architecture]
---

# Applied Research Architecture

## Purpose

`packages/applied-research` should become the research engine that applies the pure analytics
kernel to the full local corpus.

The package exists because `packages/analytics` has become the right thing: a deterministic,
filesystem-free detector kernel. At the same time, `tools/pipeline-v2` has grown beyond command
orchestration and now contains too much applied research implementation: feature resolution from
SQLite, detector run orchestration, review-packet assembly, score-vector materialization, detector
evaluation artifact construction, corpus/grain audits, and future causal/forecasting scaffolding.

The new layer makes that split explicit:

```text
packages/analytics
  pure analytical instruments

packages/applied-research
  corpus-backed studies, research artifacts, detector runs, causal panels, forecasting backtests

tools/pipeline-v2
  CLI orchestration, source ingest, local DB/artifact I/O, publishing, operational commands
```

The key idea: **detectors find candidate structure; causal inference tests intervention claims;
forecasting predicts future distributions. The shared scoring system lets us optimize all three
without pretending they are the same problem.**

## Why This Is A Package, Not An App

An app should not be the reusable implementation layer. Apps are runtime shells with UI, routing,
environment assumptions, and deployment concerns. If the CLI imports an app, the app silently
becomes a package with weaker boundaries.

The reusable core should live in `packages/applied-research`. A separate
`apps/applied-research` workbench is out of scope for this plan.

This gives headless consumers the same research logic:

| Consumer | How it uses applied research |
|---|---|
| `tools/pipeline-v2` | Headless batch runs, artifact writes, publish gates, audits |
| Ralph/Codex loops | Structured research tasks, scorecards, loss functions, evidence packets |

## Goals

`packages/applied-research` should:

1. Turn local corpus rows and artifacts into detector-grade feature collections at their native
   grains.
2. Run detector studies through the registry without embedding CLI behavior in the study logic.
3. Produce review packets, score vectors, evaluation packets, corpus/grain audits, and study
   manifests as typed research artifacts.
4. Provide reusable panel builders for causal inference: treatment windows, comparison pools,
   donor pools, pre-trend checks, placebo checks, sensitivity summaries, and claim gates.
5. Provide reusable forecasting study builders: feature views, train/test windows, backtest folds,
   prediction distribution artifacts, calibration reports, and baseline comparisons.
6. Give Ralph/Codex a measurable improvement loop: detector quality, causal validity, forecast
   calibration, evidence completeness, novelty, stability, and elegance all become explicit
   scorecard components.
7. Keep public serving decoupled. The public app consumes approved serving projections, not live
   research code.

## Non-Goals

`packages/applied-research` should not:

- fetch external sources directly;
- own Socrata/MTA retry logic;
- publish Cloudflare D1/R2 releases;
- contain React components or Worker handlers;
- own detector math that belongs in `packages/analytics`;
- contain LLM prompts, model calls, sandbox execution, or agent loops;
- import from any `apps/*` package or from `tools/*`.

LLM-assisted research agents may call applied-research APIs through a harness, but the package
itself stays deterministic.

## How It Differs From Existing Packages

| Layer | Owns | Does not own |
|---|---|---|
| `packages/domain` | Pure shared contracts, branded ids, public schemas | DB, analytics, sources, apps |
| `packages/sources` | External source clients, raw DTO parsing, source metadata | Local research orchestration, detectors |
| `packages/db` | D1/local schemas and repositories | Research decisions, detector math |
| `packages/analytics` | Pure detector math, feature contracts, baselines, calibration/evaluation math | SQLite, filesystem, artifact paths, CLI |
| `packages/applied-research` | Corpus-backed research workflows and typed artifacts | Source fetching, publishing, UI |
| `tools/pipeline-v2` | CLI, source ingest, DB/artifact I/O, operational jobs | Research implementation internals |
| `apps/web` | Public serving UI and Worker API over projections | Analytics/research runtime |

The most important distinction is between analytics and applied research:

```text
analytics asks:
  Given typed features, what does this detector/metric compute?

applied research asks:
  Given the corpus, what study should we run, what features are eligible, what evidence packet
  should we emit, and how good was the result?
```

## Target Dependency Graph

The package should use explicit subpath exports so the pure study logic and local adapters are not
accidentally coupled.

```text
packages/domain
  <- packages/analytics
  <- packages/db

packages/analytics
  <- packages/applied-research/core

packages/db
  <- packages/applied-research/local-db

packages/applied-research
  <- tools/pipeline-v2

apps/web
  -> packages/domain, packages/db
```

Forbidden:

```text
packages/applied-research -> apps/*
packages/applied-research -> tools/*
packages/applied-research -> knowledge/*
apps/web                   -> packages/applied-research
apps/web                   -> packages/analytics
```

Recommended package exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    "./detector-runs": "./src/detector-runs/index.ts",
    "./evaluation": "./src/evaluation/index.ts",
    "./causal": "./src/causal/index.ts",
    "./forecasting": "./src/forecasting/index.ts",
    "./artifacts": "./src/artifacts/index.ts",
    "./local-db": "./src/local-db/index.ts"
  }
}
```

`./core`, `./detector-runs`, `./evaluation`, `./causal`, `./forecasting`, and `./artifacts` should
be fixture-testable without opening a database. `./local-db` may depend on `@bp/db` and adapt
repositories into the pure ports.

Implementation status, 2026-06-01: the package is scaffolded and now owns the shared research
quality score, detector-evaluation report contracts, detector-evaluation markdown rendering,
deterministic detector-evaluation label-set construction, generic detector score-vector artifact
construction, speed/pace feature + score-vector construction, route runtime/history feature
resolution, runtime/trend score-vector construction, EWT route-month score-vector construction,
raw stop-direction-hour EWT feature artifact construction, and registry detector-run artifact
assembly. `tools/pipeline-v2` is being kept as the local DB/artifact I/O shell for these surfaces:
it selects rows, handles paths, and writes outputs while the detector-grade artifact builders live
in the research package. The first local corpus ports now live under `@bp/applied-research/local-db`
for EWT route-month rows and stop-direction-hour EWT inputs; pipeline-v2 adapts SQLite queries into
those ports rather than making the artifact builders know about the database. The causal and
forecasting subpaths now expose initial study contracts and scoring/readiness helpers so future
estimators and models build on the same headless study architecture rather than returning to CLI
implementation.

## Target Internal Layout

```text
packages/applied-research/src/
  core/
    study.ts
    ports.ts
    grain.ts
    windows.ts
    provenance.ts
    score.ts

  feature-resolvers/
    stop-direction-hour-ewt.ts
    route-direction-daypart-runtime.ts
    route-metric-history.ts
    segment-daypart-speed.ts
    intervention-panel.ts
    rider-weighted-ewt.ts
    delay-concentration.ts

  detector-runs/
    registry-runner.ts
    run-artifact.ts
    candidate-coverage.ts
    missing-data-summary.ts

  review-packets/
    packet-builder.ts
    packet-coverage.ts
    evidence-role-policy.ts

  score-vectors/
    generic.ts
    ewt.ts
    speed-pace.ts
    runtime-trend.ts
    schedule-mismatch.ts

  evaluation/
    evaluation-artifact.ts
    label-builder.ts
    scorecard-inputs.ts
    corpus-grain-audit.ts

  causal/
    treatment-inventory.ts
    panel-builder.ts
    event-family-panel.ts
    response-drift.ts
    donor-pool.ts
    event-study.ts
    did.ts
    synthetic-control.ts
    validity-gates.ts
    claim-policy.ts

  forecasting/
    feature-view.ts
    folds.ts
    baseline-models.ts
    probabilistic-metrics.ts
    backtest.ts
    drift.ts

  artifacts/
    manifest.ts
    paths.ts
    schemas.ts
    summary.ts

  local-db/
    context.ts
    repositories.ts
    feature-loaders.ts
```

This layout is intentionally research-domain oriented. It keeps `pipeline-v2` from becoming a
second analytics package while still allowing pipeline commands to handle operational concerns.

## Study Model

Every applied-research workflow should be modeled as a study.

```text
StudyDefinition
  id
  purpose
  releaseMonth
  historyWindow
  sourceProducts
  featureRequirements
  grainPolicy
  methods
  scoringProfile
  outputArtifacts

StudyRun
  definition
  inputSnapshot
  featureCoverage
  methodOutputs
  evidencePackets
  scorecard
  residualRisks
```

This shared model lets detector runs, causal panels, and forecast backtests use the same discipline:
declared inputs, declared grain, declared windows, typed evidence, reproducible output, and scored
quality.

## Detector System

Detectors remain in `packages/analytics`. Applied research owns the surrounding study:

1. Load eligible local corpus rows through repository ports.
2. Resolve detector-native feature grains.
3. Run registry detectors from `@bp/analytics`.
4. Preserve hit, clean-no-hit, skipped, insufficient-data, and blocked states.
5. Build score vectors and review packets.
6. Build detector-evaluation inputs and scorecards.
7. Emit artifacts that `pipeline-v2` writes to disk and future review/tooling workflows can read.

This prevents early route-month collapse. The detector study must always know:

- source grain;
- detector feature grain;
- release/projection grain;
- whether clean no-hit claims are safe at that grain;
- what richer-grain shadows exist.

## Causal Inference System

Causal inference is a higher-order system built on detector-grade features. It should not replace
detectors; it should test intervention claims that detectors surface or humans nominate.

Primary outputs:

- treatment inventory with implementation dates and source confidence;
- treated route/segment panels;
- event-family effect panels by historical window, segment context, and source coverage;
- response-drift summaries for sign or magnitude changes across periods and binding-constraint
  regimes;
- donor pools and comparison-route eligibility;
- event-study, DiD-style, controlled ITS, and synthetic-control summaries;
- pre-trend, placebo-in-time, placebo-in-space, autocorrelation, and sensitivity checks;
- explicit claim-strength gates.

Claim policy:

| Tier | Meaning | Auto-publish? |
|---|---|---|
| descriptive | A measured change happened in a window | Yes, with caveats |
| associational | A change is temporally/spatially associated with an intervention | Review queue |
| candidate-causal-needs-review | Identification gates passed, but human methodology review is required | No automatic causal language |

The causal system's job is not to prove causality by default. Its job is to make intervention
claims auditable, falsifiable, and hard to overstate.

One important non-MVP causal/associational study family is historical event-family response drift:
the transit analogue of an announcement-effect regime shift. It asks whether the same event or
intervention class changed effect sign, magnitude, or marginal value across historical windows or
street-context regimes. Examples include bus lanes losing marginal value where curb friction becomes
dominant, permit events slowing the network but improving selected curb-constrained segments, or
venue/calendar events changing after loading, enforcement, or rideshare rules change. These studies
must remain review-gated and should point back to representative local case-study packets before
making product claims.

## Forecasting System

Forecasting is a separate higher-order system built on the same detector-grade feature corpus. It
predicts future distributions of travel time, pace, headway reliability, delay concentration, or
intervention risk.

Primary outputs:

- forecast feature views at declared grains;
- train/validation/test windows;
- baseline models and stronger model adapters;
- probabilistic prediction artifacts;
- calibration and sharpness reports;
- drift and residual diagnostics;
- backtest comparisons against simple baselines.

Forecasting should support decisions like:

- which corridors are likely to degrade next month;
- which route/time windows have unstable travel-time distributions;
- where detector thresholds are likely to fire soon;
- which interventions deserve closer monitoring.

Forecasting does not justify causal claims. A forecast can say a bad distribution is likely; causal
inference is what tests whether an intervention changed that distribution.

## Shared Scoring System

Applied research needs a numerical loss surface, but a single metric must not erase method-specific
truth. Use a two-layer score:

```text
overall_score = method_validity_score * 0.60
              + research_quality_score * 0.40
              - veto_penalties
```

All scores are on a 0-1000 scale. Unknown evidence is `null`, not zero or perfect.

### Research Quality Score

This score is shared by detectors, causal studies, and forecasting studies.

| Component | Weight | What it rewards |
|---|---:|---|
| Corpus coverage | 120 | Required products exist across declared windows and grains |
| Grain fidelity | 120 | The method uses native grains and avoids premature route-month collapse |
| Evidence completeness | 130 | Evidence, counter-evidence, coverage rows, caveats, provenance |
| Reproducibility | 100 | Versioned inputs, deterministic run id, snapshot hashes, stable artifacts |
| Claim discipline | 120 | No unsupported causal/forecast language, correct tiering |
| Reviewer utility | 110 | Packets are concise, inspectable, and decision-ready |
| Novelty/actionability | 100 | Finds non-obvious but useful structure |
| Elegance | 100 | Simple enough to audit, low boilerplate, few special cases, clear APIs |
| Maintainability | 100 | Small modules, explicit ports, fixture tests, low CLI coupling |

### Detector Validity Score

| Component | Weight | Initial proxy |
|---|---:|---|
| Precision | 180 | Confirmed hits over reviewed/derived labeled hits |
| Recall/silent-scope protection | 90 | Known positives found, clean no-hit grain safety |
| Calibration stability | 120 | Score-vector stability across windows |
| Missing-data discipline | 110 | Skips and low coverage are explicit |
| Evidence quality | 150 | Packet completeness and evidence-role correctness |
| Counter-evidence handling | 90 | Contradicting signals are present and visible |
| Detector novelty | 80 | Non-duplicate useful candidates |
| Threshold sensitivity | 80 | Near-miss behavior is explainable |
| Feature readiness | 100 | Required detector-native features exist |

### Causal Validity Score

| Component | Weight | Initial proxy |
|---|---:|---|
| Identification fit | 160 | Intervention timing/location/source confidence supports the question |
| Counterfactual quality | 150 | Valid controls or donor pool, good synthetic pre-fit when used |
| Pre-trend behavior | 130 | Parallel/pre-trend checks pass or limitations are explicit |
| Falsification checks | 130 | Placebo-in-time and placebo-in-space are null or caveated |
| Robustness | 110 | Estimates agree across reasonable specifications or divergence is flagged |
| Autocorrelation/seasonality handling | 80 | ITS residual and seasonal issues are checked |
| Effect interpretability | 80 | Magnitude, units, confidence intervals, and population are clear |
| Causal claim discipline | 160 | No automatic causal language; human approval gate enforced |

### Forecast Validity Score

| Component | Weight | Initial proxy |
|---|---:|---|
| Baseline lift | 130 | Beats naive/seasonal/rolling baselines |
| Calibration | 150 | Prediction intervals have expected coverage |
| Sharpness under calibration | 90 | Narrower intervals only when calibrated |
| Proper scoring loss | 150 | CRPS, log score, pinball loss, or declared metric improves |
| Temporal generalization | 130 | Backtest holds across months/seasons |
| Drift awareness | 90 | Distribution shift is detected and surfaced |
| Feature parsimony | 80 | Avoids unnecessary features or leakage |
| Decision usefulness | 100 | Outputs map to detector monitoring or intervention planning |
| Forecast claim discipline | 80 | No causal language, uncertainty visible |

### Veto Penalties

Some failures should cap the score regardless of weighted average:

| Veto | Effect |
|---|---|
| Silent missing data scored as clean no-hit | Cap at 400 |
| Unsupported causal language | Cap at 300 |
| Feature leakage in forecast backtest | Cap at 300 |
| Route-month clean no-hit used when richer-grain candidates exist | Cap at 500 |
| Missing provenance for primary evidence | Cap at 600 |
| Non-deterministic output without declared seed | Cap at 700 |

## Artifact Families

Applied research should define schemas for artifacts; `pipeline-v2` should decide paths and write
them.

Initial artifact families:

| Artifact | Purpose |
|---|---|
| `research-study-manifest` | Declares study inputs, methods, windows, and output artifacts |
| `detector-run-artifact` | Candidate, clean no-hit, skipped, and coverage rows |
| `review-packet-bundle` | Evidence packets and packet coverage |
| `detector-score-vectors` | Historical scores at detector-native grains |
| `detector-evaluation` | Release-cycle scorecards and recommendations |
| `causal-panel` | Treatment/control/donor panel and validity diagnostics |
| `intervention-association-study` | Event-study/DiD/SCM estimates and claim gates |
| `event-family-effect-panel` | Event/intervention effects by historical window, context regime, and source coverage |
| `event-response-drift-study` | Sign, magnitude, or marginal-value drift across event families and binding constraints |
| `forecast-backtest` | Forecast outputs, baseline comparisons, calibration, drift |

## Migration Plan

### R0: Architecture Plan

- Add this page and link it from the wiki index.
- Update package-structure docs to include `packages/applied-research` and explicitly keep
  `apps/applied-research` out of scope.
- Record that the CLI should consume the package, not the app.

### R1: Package Scaffold

- Add `packages/applied-research/package.json`, `tsconfig.json`, `README.md`, and explicit exports.
- Add `src/core/ports.ts`, `study.ts`, `windows.ts`, `grain.ts`, and `score.ts`.
- Add architecture tests proving the package does not import `apps/*`, `tools/*`, `knowledge/*`,
  or source-fetching modules.
- Keep the first scaffold behavior-free except for simple score/window/grain helpers.

Status, 2026-06-01: implemented. The package exists with explicit subpath exports, core study,
grain, window, port, and score primitives, package tests, and repo-level boundary harness coverage.

### R2: Extract Detector Research Artifacts

Move reusable logic out of these `pipeline-v2` commands while preserving CLI behavior:

- `findings run-detector`;
- `findings review-packets`;
- `evaluate detectors`;
- `build detector-evaluation-labels`;
- `build detector-score-vectors`;
- `build speed-pace-score-vectors`;
- `audit detector-corpus-grain`.

The CLI should still parse flags and write files. Applied research should build the typed payloads.

Status, 2026-06-01: started. The detector-evaluation artifact contract, markdown renderer, and
scorecard artifact builder now live under `@bp/applied-research/evaluation`; `pipeline-v2 evaluate
detectors` imports those APIs while retaining path resolution, input loading, and output writes.
Generic detector score-vector row-to-artifact construction now lives under
`@bp/applied-research/score-vectors`; `pipeline-v2 build detector-score-vectors` retains only
SQLite queries, path resolution, and artifact writes. The speed/pace segment-daypart feature
resolver and `speed_pace_hotspot` historical score-vector builder also now live in
`@bp/applied-research`; `pipeline-v2 build speed-pace-score-vectors` retains month/row queries,
path resolution, and artifact writes. Review-packet artifact assembly now lives under
`@bp/applied-research/review-packets`; `pipeline-v2 findings review-packets` remains the SQLite
reader, path resolver, resume-id loader, and artifact writer. Detector-family feature resolvers for
rider-weighted EWT, positive deviance, intervention panels, and delay concentration now live under
`@bp/applied-research/feature-resolvers`; `pipeline-v2 findings run-detector` retains SQLite reads
and detector execution orchestration.

### R3: Repository Ports And Local DB Adapter

- Define repository ports for route catalogs, route-month metrics, stop-hour EWT features,
  segment-daypart speed features, interventions, review decisions, and coverage rows.
- Add `local-db` adapters backed by `@bp/db/local` repositories where available.
- Replace direct command-local SQLite queries only after a port has fixture tests.

### R4: Detector-Native Score Vectors

- Promote EWT and speed/pace score-vector builders into package-level study builders.
- Add schedule/runtime/trend/intervention score-vector builders.
- Make score vectors usable by detector evaluation and Ralph improvement loops.

### R5: Causal System

- Add treatment-panel and donor-pool builders.
- Add event-study/DiD/SCM study outputs with validity gates.
- Keep causal estimates capped at associational/candidate-causal until human methodology approval.
- Add fixture tests for pre-trend failure, placebo failure, donor-pool insufficiency, and divergent
  uncontrolled-vs-controlled estimates.

### R6: Forecasting System

- Add feature-view and backtest-fold builders.
- Add baseline models first: last observed, seasonal mean, rolling median, peer-adjusted baseline.
- Add probabilistic metrics and calibration reports before adding stronger model adapters.
- Add leakage guards and time-split tests.

### R7: Pipeline Slim-Down

- Commands become adapters around applied-research study builders.
- Add a complexity budget for large commands.
- Retire duplicated route/product surface lists in favor of registry-driven study manifests.

## First Practical Slice

The best first implementation slice is detector research artifact extraction:

1. Create `packages/applied-research`.
2. Add the shared study and scoring primitives.
3. Move detector-evaluation artifact assembly out of `tools/pipeline-v2`.
4. Move review-packet bundle assembly out of `tools/pipeline-v2`.
5. Keep all command names and artifact paths stable.

This gives immediate value without changing source ingest or public serving.

## Open Questions

1. Should `packages/applied-research/local-db` import concrete `@bp/db/local` repositories, or
   should pipeline commands adapt repository outputs into pure ports? The recommended starting
   point is to allow a focused `local-db` subpath and keep pure study logic separate.
2. Which score components should become release gates versus advisory warnings? Unsupported causal
   claims, silent missing data, and forecast leakage should be hard gates from the beginning.
3. How much of the existing data-product registry should move from `pipeline-v2` into a package?
   The recommended starting point is to leave source/product operational registry in `pipeline-v2`
   while applied-research owns study manifests and feature requirements.
