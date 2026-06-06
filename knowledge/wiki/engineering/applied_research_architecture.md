---
title: Applied Research Architecture
type: engineering
status: draft
last_updated: 2026-06-06
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
    "./feature-history": "./src/feature-history/index.ts",
    "./treatments": "./src/treatments/index.ts",
    "./causal": "./src/causal/index.ts",
    "./forecasting": "./src/forecasting/index.ts",
    "./artifacts": "./src/artifacts/index.ts",
    "./route-briefs": "./src/route-briefs/index.ts",
    "./local-db": "./src/local-db/index.ts"
  }
}
```

`./core`, `./detector-runs`, `./evaluation`, `./causal`, `./forecasting`, and `./artifacts` should
be fixture-testable without opening a database. `./local-db` may depend on `@bp/db` and adapt
repositories into the pure ports.

`./treatments` owns deterministic treatment-state materialization: canonical treatment vocabulary,
source-family status mapping, merge policy, route/segment treatment rows, source-gap rows, and
validation summaries. Detectors, causal panels, route briefs, and serving projections consume this
materialized treatment layer; they do not rebuild it.

Implementation status, 2026-06-06: the package is scaffolded and now owns the shared research
quality score, detector-evaluation report contracts, detector-evaluation markdown rendering,
deterministic detector-evaluation label-set construction, generic detector score-vector artifact
construction, speed/pace feature + score-vector construction, route runtime/history feature
resolution, runtime/trend score-vector construction, EWT route-month score-vector construction,
raw stop-direction-hour EWT feature artifact construction, and registry detector-run artifact
assembly. The first hard-cutover detector-study path now lives in the package:
`@bp/applied-research/detector-runs` owns registry detector study execution, detector-specific
feature resolution, analytics-registry dispatch, and run-artifact construction for
`findings run-detector`. `@bp/applied-research/local-db` owns the local SQLite row selectors for
that study family, while `@bp/applied-research/artifacts` owns stop-direction-hour EWT feature
artifact loading. The generic detector score-vector builder has also hard-cut over:
`@bp/applied-research/score-vectors` owns the study wrapper, `@bp/applied-research/local-db` owns
the `local_finding_coverage_audit` and `local_finding_candidate` row selectors, and
`@bp/applied-research/artifacts` owns the detector-score-vector artifact path convention.
`findings review-packets` has also cut over: `@bp/applied-research/review-packets` owns the packet,
queue, and coverage artifact construction, while `@bp/applied-research/local-db` owns the local
SQLite selectors and domain-schema parsing for `local_finding_candidate`,
`local_finding_evidence_link`, and `local_finding_coverage_audit`.
`findings lattice-review-bundles` now follows that review-packet boundary:
`@bp/applied-research/review-packets` owns route input shaping from review packets and signal
features, lattice preview artifact construction, and Markdown/HTML rendering.
`findings coverage-audit` now follows the same boundary:
`@bp/applied-research/evaluation` owns detector coverage-audit artifact construction, and
`@bp/applied-research/local-db` owns summary and top-candidate selectors over the local finding
tables.
`audit review-packet-coverage` now follows the package-owned gate boundary:
`@bp/applied-research/evaluation` owns review-packet coverage status, severity, summary, and gap
evaluation, while the pipeline command retains release-month/path resolution and JSON input loading.
`build detector-evaluation-labels` also follows the package boundary:
`@bp/applied-research/evaluation` owns deterministic label-set construction,
`@bp/applied-research/local-db` owns coverage-label source row selection, and
`@bp/applied-research/artifacts` owns the artifact path convention.
`build detector-gold-set-evaluation` follows the same evaluation boundary:
`@bp/applied-research/evaluation` owns gold-set expectation construction, promoted/flagged scope
matching, missing-data discovery scope assembly, and calibration evaluation, while
`@bp/applied-research/artifacts` owns the default artifact path convention.
`audit analytics-corpus-profile` now follows the package-owned corpus profiling boundary:
`@bp/applied-research/local-db` owns local corpus observation row loading,
`@bp/applied-research/evaluation` owns profile construction and doctrine, and
`@bp/applied-research/artifacts` owns the profile path convention.
`audit analytics-backfill-coverage` now follows the same package-owned audit boundary:
`@bp/applied-research/local-db` owns local backfill surface row loading,
`@bp/applied-research/evaluation` owns coverage construction, thresholds, and next-action logic,
and `@bp/applied-research/artifacts` owns the coverage path convention. Detector-readiness audit
code now builds that nested coverage through the package surface.
`audit analytics-detector-readiness` now follows the same package-owned readiness boundary:
`@bp/applied-research/evaluation` owns detector calibration-policy readiness joins, required-surface
status rollups, and next-action construction; `@bp/applied-research/local-db` owns the direct
observed-headway, bus-wait, GTFS schedule, permit-touch, and 311-touch surface probes; and
`@bp/applied-research/artifacts` owns readiness path naming.
`audit analytics-materialization-coverage` now follows the package-owned audit boundary:
`@bp/applied-research/evaluation` owns route universe probing, local route-table coverage checks,
route-slice/brief/EWT artifact discovery, score-vector route extraction, materialization status
rollups, and next-action construction; `@bp/applied-research/artifacts` owns coverage path naming.
`route brief-model` now follows the same hard-cutover boundary for route brief analytics:
`@bp/applied-research/route-briefs` owns route-score brief construction, hotspot projection,
segment-universe assembly, schedule comparisons, ridership/speed profiles, bus-lane/ACE summaries,
visibility adjustment, route-universe planning, unknown-route issue construction, and
comparison-rank rows. It also owns final serving projection so visibility policy is applied once to
route brief rows and route-slice metrics. The pipeline command retains local DB reads/writes,
hotspot projection error capture, route-slice artifact writes, CLI parsing, and run summary
reporting.
`audit evidence-corpus` now follows the package-owned evaluation boundary:
`@bp/applied-research/evaluation` owns source evidence eligibility summaries, route-month
signal-feature readiness, detector candidate/evidence/coverage counts, review-queue linkage, gap
detection, and pass/warn/fail status. The pipeline command retains artifact path resolution, JSON
reads, output validation, and report writes.
`audit detector-closure` now follows the package-owned evaluation boundary:
`@bp/applied-research/evaluation` owns analysis dependency closure construction, planned
research-unit dependency policy, status rollups, and Markdown rendering, while
`@bp/applied-research/artifacts` owns closure JSON/Markdown path conventions.
`audit tier2-structured-data` now follows the same evaluation boundary:
`@bp/applied-research/evaluation` owns structured-document artifact layer/trust classification,
count extraction, reviewed-record schema validity checks, summary extraction, and
research-substrate warning policy. It also owns inventory summary construction, best research/serving
artifact ranking, next-action policy, and Markdown rendering. The pipeline command retains docs-root
scanning, JSON reads, unreadable-file handling, and output writes.
`audit studio-coverage` now follows the package-owned Studio projection evaluation boundary:
`@bp/applied-research/evaluation` owns route brief input completeness checks and Studio route
projection validators for schedule comparisons, ridership exposure, hourly bins, DOT lane geometry,
trend-month labels, route-level ridership profiles, route-shape geometry, TSP source evidence,
public AI note shape/density, rider-delay evidence, and route-segment coverage metadata. The
pipeline command retains local D1 reads, projection list/directory scanning, presentation-text
scanning, status assembly, and report writes.
`evaluate detectors` now follows the package-owned artifact-path boundary:
`@bp/applied-research/artifacts` owns the detector-evaluation JSON/Markdown path and the input
artifact path bundle for release review artifacts, coverage audits, readiness, score vectors,
labels, and grain audits.
`evaluation artifacts` now follows the package-owned static serving boundary:
`@bp/applied-research/evaluation` owns public evaluation payload construction, intervention-event
reference filtering, manifest construction, SHA-256/byte metadata, manifest parsing, payload
contract checks, file verification, and expected-row-count policy, while
`@bp/applied-research/artifacts` owns evaluation artifact key/path naming. The pipeline command
retains local SQLite row reads, CLI adaptation, and JSON file writes before those files are promoted
to R2.
`map artifacts` now follows that same static serving boundary:
`@bp/applied-research/artifacts` owns map artifact key/path naming, and
`@bp/applied-research/evaluation` owns JSON/GeoJSON content-type constants, artifact-entry
construction, manifest construction, SHA-256/byte metadata, manifest parsing, required-artifact
checks, route-segment payload validation, file verification, and expected public-route coverage
policy. The pipeline command retains source snapshot reads, local DB row reads, route geometry
projection, CLI adaptation, and JSON file writes before R2 promotion.
`brief artifacts` now follows the route-brief package boundary:
`@bp/applied-research/route-briefs` owns route/corridor brief artifact key naming, source-reference
policy, observed-reliability window grouping/ranking, JSON/Markdown/HTML rendering, content-type
assignment, byte counts, and SHA-256 metadata. The pipeline command retains local SQLite row
loading, artifact file writes, route/corridor artifact table replacement, and route-batch status
writes.
`audit route-schedule-progress` now follows the local research boundary:
`@bp/applied-research/local-db` owns Socrata schedule-progress and GTFS static run aggregation,
while the pipeline command retains DB opening and CLI output.
`findings repair-persistent-speed-coverage` now follows the same local-research boundary:
`@bp/applied-research/evaluation` builds exact segment-scope coverage repair rows, and
`@bp/applied-research/local-db` owns the local candidate/evidence/coverage selector.
`audit speed-pace-shadow` and `audit route-month-shadow` also now follow that boundary:
`@bp/applied-research/evaluation` builds the detector shadow-audit artifacts,
`@bp/applied-research/local-db` owns the local coverage/candidate selectors, and
`@bp/applied-research/artifacts` owns the detector-shadow-audit path conventions.
`audit detector-corpus-grain` now follows the same package-owned audit boundary: release-month
candidate and coverage count loading for local finding tables lives in `@bp/applied-research/local-db`,
detector-corpus artifact path naming and detector-specific score-vector artifact discovery live in
`@bp/applied-research/artifacts`, and the corpus-grain audit builder, release checks, feature-grain
profiles, and markdown renderer live in `@bp/applied-research/evaluation`. The pipeline command
retains manifest loading, local DB opening, package delegation, and output writes.
`build stop-direction-hour-ewt-features` is now package-owned at the local research boundary:
`@bp/applied-research/local-db` owns GTFS static calendar expansion, Socrata/timepoint schedule row
loading, observed-headway row loading, and SQLite-backed feature artifact construction, while
`@bp/applied-research/artifacts` owns the default stop-direction-hour EWT artifact path convention.
`build context-event-route-touches` now follows the same local research boundary:
`@bp/applied-research/local-db` owns direct-route, LION-link, and parking-location route-touch
materialization plus source/event-kind audit rollups, while `@bp/applied-research/artifacts` owns
the route-touch audit path convention.
`build intervention-panel` now follows the causal research boundary:
`@bp/applied-research/local-db` owns local intervention-comparison row loading,
`@bp/applied-research/causal` owns associational intervention-panel artifact construction, and
`@bp/applied-research/artifacts` owns the default intervention-panel path convention.
`build route-hourly-profile` now follows the feature-history boundary:
`@bp/applied-research/local-db` owns local route-hourly ridership profile row loading,
`@bp/applied-research/feature-history` owns compact route-month hourly profile artifact construction,
and `@bp/applied-research/artifacts` owns the default route-hourly profile path convention.
`build segment-daypart-history` now follows the same feature-history boundary:
`@bp/applied-research/local-db` owns segment/daypart aggregation over local route segment speeds,
`@bp/applied-research/feature-history` owns compact segment-daypart history artifact construction,
and `@bp/applied-research/artifacts` owns the default segment-daypart history path convention.
`build observed-headways` now delegates GTFS-RT vehicle-position stop-event deduplication,
successive-vehicle headway construction, and observed-headway local DB writes to
`@bp/applied-research/local-db`; the pipeline command is only the DB-opening and CLI output adapter.
`route observed-reliability` now delegates route/month observed-headway summarization, reliability
status classification, bunching/long-gap and wait-reliability metric construction, source-status row
construction, and local DB writes to `@bp/applied-research/local-db`.
`route reliability-baseline` now delegates scheduled-headway grouping, route-level baseline
summaries, long-gap windows, source-status row construction, and local DB writes to
`@bp/applied-research/local-db`.
`route readiness` now delegates missing-input detection, readiness status classification, scoring,
row ordering, and local DB writes to `@bp/applied-research/local-db`.
`route build-plan` now delegates priority scoring, candidate ordering, selected/backlog/already-built
/blocked classification, count rollups, and local DB writes to `@bp/applied-research/local-db`.
`route equity-context` now delegates route-prefix county assignment, county-level ACS tract
aggregation, route equity row construction, source-status rows, and local DB writes to
`@bp/applied-research/local-db`.
`build context-events` now delegates context-event ID construction, source-row normalization,
parking/collision/permit/traffic/311/ACE event mapping, ACE monthly route aggregation, and local
context-event DB writes to `@bp/applied-research/local-db`.
`build parking-violation-matches` now uses package-owned parking-location normalization:
`@bp/applied-research/local-db` owns borough/street normalization, parking location keys, camera
location parsing, corridor keys, house-number parsing, and deterministic evidence hashes. The
package also owns match audit summary SQL, audit-only group count probes, location-key refresh,
camera/address match-group selectors, match-table clear/insert persistence with match weighting, and
LION/route candidate selectors for physical-id and street-corridor matching. Audit artifact shaping
and deterministic street-code-house match resolution are package-owned, while the parking violation
match audit path convention lives in `@bp/applied-research/artifacts`. The pipeline command still
owns Geoclient/env setup, raw snapshot file discovery/JSON loading, and audit writes for that
command. Raw parking and LION hydration transforms are package-owned. Camera intersection/corridor
match policy is package-owned; the command only builds the package-requested Geocoder call and
passes back a plain geocode outcome. The local DB rebuild loop is also package-owned, including
clearing stale matches, scanning camera/address groups, invoking the injected camera geocoder
callback, resolving matches, inserting rows, and returning scanned counts.
`build route-lion-link` now delegates route allowlist query construction, buffer conversion,
SpatialIndex-backed route/LION intersection queries, per-route replacement writes, and run counts to
`@bp/applied-research/local-db`.
`route intervention-evaluation` now delegates ACE, bus-lane, and document-anchor treatment event
construction, bus-lane open-date parsing, source-gap handling, peer/descriptive before-after
comparison construction, local route/brief/trend/bus-lane row loading, and local DB writes to
`@bp/applied-research/local-db`.
`build lion-geometry-index` now delegates GeoJSON feature unwrapping, Spatialite geometry-column
and spatial-index helpers, WKT/GeoJSON insertion, skip-rate enforcement, and run counts to
`@bp/applied-research/local-db`. `build route-shape-geometry-index` also uses the package-owned
route-shape geometry helper while retaining source snapshot normalization in the pipeline.
The route-shape command now also delegates normalized shape grouping, LineString/MultiLineString
extraction, MultiLineString GeoJSON construction, Spatialite upserts, and inserted/skipped counts to
`@bp/applied-research/local-db`.
`build express-bus-capacity-context` and `build express-route-analysis` now delegate route/hour
capacity summaries, capacity-window aggregation, speed-window aggregation, load/speed banding,
screening candidate flags, route summaries, analysis artifact validation, audit issue construction,
and express analysis path naming to `@bp/applied-research/feature-history` and
`@bp/applied-research/artifacts`. Pipeline retains normalized artifact loading, Socrata speed-query
fetching, route filtering, CLI options, and JSON writes.
`check route-speed-availability` now delegates source row parsing, route normalization, month status
classification, requested-month fallback, rebuild-decision policy, result construction, and artifact
path naming to `@bp/applied-research/evaluation` and `@bp/applied-research/artifacts`. Pipeline
retains source manifest loading, Socrata query/fetch plumbing, CLI validation, compatibility
artifact reads, and JSON writes.
`export route-speed-history-coverage-index` now delegates the
`local_route_speed_history_coverage` table contract, route-id normalization, release-month row
replacement, count rollups, and null metric defaults to `@bp/applied-research/local-db`, leaving
manifest parsing, artifact path resolution, existence checks, and CLI wiring in the pipeline.
`studio route-speed-spine` now delegates stable timepoint-node clustering, spine segment
construction, month coverage, validation issues, and route speed-spine source-row contracts to
`@bp/applied-research/feature-history`; artifact path naming to `@bp/applied-research/artifacts`;
and local `local_route_segment_speed` row aggregation to `@bp/applied-research/local-db`. The Studio
pipeline commands retain SQLite opening, path resolution, JSON writes, and manifest orchestration.
The `studio route-speed-spines` manifest path, readiness classification, candidate route probe, and
current-catalog route probe are also package-owned.
`studio route-speed-history` now delegates segment/daypart cell construction, expected-service
derivation from schedule stop pairs, route speed-history artifact path naming, and local
speed/schedule row loading to applied-research. The command remains a spine-artifact reader,
SQLite/path adapter, and JSON writer.
`studio route-speed-histories` now delegates default readiness policy, readiness-list parsing,
batch route/manifest contracts, manifest path naming, and batch summary construction to
`@bp/applied-research/feature-history` and `@bp/applied-research/artifacts`. The command remains the
spine-manifest reader, route filter/limit adapter, per-route job orchestrator, and JSON writer.
`audit source-coverage` now delegates source coverage policy, SQLite table/column/range probes,
geocode and context-event join summaries, readiness classification, evidence eligibility, and
summary rollups to `@bp/applied-research/local-db`, with path naming in
`@bp/applied-research/artifacts`.
`audit route-source-reconciliation` now delegates local route catalog/source-set queries, canonical
route matching, source-year schedule waiver classification, route source classification, alias
candidate construction, eligible-product assignment, and reconciliation artifact assembly to
`@bp/applied-research/local-db`, with path naming in `@bp/applied-research/artifacts`.
The source-month matrix emitted by `audit data-product-completeness` now delegates local
month/source table probes, source-year schedule ingest rollups, source/derived/upstream status
classification, status counts, and matrix artifact construction to `@bp/applied-research/local-db`,
with path naming in `@bp/applied-research/artifacts`.
The data-product manifest schema, parser, and release manifest now live under
`@bp/applied-research/data-products`; `tools/pipeline-v2/src/registry/data-products.ts` is a
compatibility re-export while command code imports the registry from the package owner. The default
data-product completeness artifact path is also package-owned under `@bp/applied-research/artifacts`.
The same data-products subpath owns data-product completeness status/reason derivation, gap-class
classification, dependency root-cause propagation, score-vector route parsing, JSON artifact
semantic reasons, count rollups, and coverage summary buckets.
`@bp/applied-research/local-db` owns data-product route-universe derivation and latest GTFS run
selection for that audit, plus the month-table, table-route, table-row count, source-year route,
route artifact, score-vector route, JSON/file artifact, and artifact-glob completeness checks.
`tools/pipeline-v2 audit data-product-completeness` now retains CLI parsing, local DB opening,
template value wiring, raw reliability snapshot probes, and artifact writes, then delegates
route-universe probing, local/source-year/artifact checks, artifact semantics, and product
classification to applied-research.
`build ewt-score-vectors` is also now package-owned: `@bp/applied-research/local-db` loads and
enriches route-month reliability rows from the local SQLite corpus, `@bp/applied-research/score-vectors`
owns the EWT study wrapper, and `@bp/applied-research/artifacts` owns the artifact path convention.
`build speed-pace-score-vectors` has the same boundary: local segment-speed month and row loading
lives under `@bp/applied-research/local-db`, the speed/pace study wrapper lives under
`@bp/applied-research/score-vectors`, and path naming lives under `@bp/applied-research/artifacts`.
`build runtime-trend-score-vectors` now follows the same boundary: local observed-runtime,
scheduled-stop, and route-metric history row loading lives under `@bp/applied-research/local-db`,
the runtime/trend study wrapper lives under `@bp/applied-research/score-vectors`, and path naming
lives under `@bp/applied-research/artifacts`.
`tools/pipeline-v2` is now the local DB/artifact I/O shell for these paths: it parses flags, opens
stores, passes package-owned study inputs into applied research, optionally replaces local finding
tables where applicable, and writes output artifacts. The causal and forecasting subpaths now expose
initial study contracts and scoring/readiness helpers so future estimators and models build on the
same headless study architecture rather than returning to CLI implementation.

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

  data-products/
    registry.ts

  treatments/
    vocabulary.ts
    status-policy.ts
    source-rows.ts
    materializer.ts
    validation.ts

  review-packets/
    packet-builder.ts
    packet-coverage.ts
    evidence-role-policy.ts

  feature-history/
    route-hourly-profile.ts
    segment-daypart-history.ts

  route-briefs/
    model.ts
    metrics.ts

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

All scores are on a 0-1000 scale. Unknown evidence is `null`, not zero or perfect. Component
weights are normalized over known components so new dimensions can be added without changing older
partial score behavior.

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
| Mechanism corroboration | 70 | Plausible mechanisms have independent support/counter-evidence |
| Search preservation | 70 | The system keeps candidate search broad enough before selecting examples |
| Placebo strength | 70 | Placebo-in-time/space/family checks are present and decision-relevant |
| Temporal transportability | 70 | Effects or forecasts are tested across historical windows/regimes |
| Regime sensitivity | 70 | The study can detect sign/magnitude drift under changing street constraints |

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
| `analysis-dependency-closure` | Joins detector/research units to data products, packets, readiness, and evaluation status |
| `detector-run-artifact` | Candidate, clean no-hit, skipped, and coverage rows |
| `review-packet-bundle` | Evidence packets and packet coverage |
| `detector-score-vectors` | Historical scores at detector-native grains |
| `detector-evaluation` | Release-cycle scorecards and recommendations |
| `causal-panel` | Treatment/control/donor panel and validity diagnostics |
| `intervention-association-study` | Event-study/DiD/SCM estimates and claim gates |
| `event-family-effect-panel` | Event/intervention effects by historical window, context regime, and source coverage |
| `event-response-drift-study` | Sign, magnitude, or marginal-value drift across event families and binding constraints |
| `forecast-backtest` | Forecast outputs, baseline comparisons, calibration, drift |

The first closure command is:

```sh
bun --filter @bp/pipeline-v2 cli -- audit detector-closure \
  --year 2026 --month 3 \
  --history-start-month 2023-04 \
  --run-id bus-observatory-2026-03
```

It writes:

```text
data/artifacts/detector-closure/2023-04_to_2026-03/2026-03/detector-closure.json
data/artifacts/detector-closure/2023-04_to_2026-03/2026-03/detector-closure.md
```

Although the command name starts with detector closure, the artifact schema is generalized around
analysis units: detectors, causal studies, forecasting studies, and response-drift studies. Current
future research units are intentionally registered as blocked/planned through data-product registry
products until their builders and validation gates exist.

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
`@bp/applied-research/review-packets`; `pipeline-v2 findings review-packets` now retains local DB
opening, path resolution, resume-id artifact loading, and artifact writes. Detector-family feature
resolvers for
rider-weighted EWT, positive deviance, intervention panels, and delay concentration now live under
`@bp/applied-research/feature-resolvers`; `pipeline-v2 findings run-detector` retains SQLite reads
and detector execution orchestration.
`pipeline-v2 findings coverage-audit` now retains only local DB opening, path resolution, and
artifact writes while `@bp/applied-research/evaluation` and `@bp/applied-research/local-db` own the
artifact builder and local row selection.
`pipeline-v2 build detector-evaluation-labels` now retains only CLI parsing, local DB opening, path
resolution, and output writes while `@bp/applied-research/evaluation`,
`@bp/applied-research/local-db`, and `@bp/applied-research/artifacts` own label construction, row
selection, and path naming.
`pipeline-v2 build detector-gold-set-evaluation` now retains only CLI parsing, artifact path
resolution, JSON input loading, and output writes while applied-research owns expectation/flagged
scope assembly and gold-set calibration evaluation.
`pipeline-v2 findings repair-persistent-speed-coverage` now retains CLI parsing, local DB opening,
the optional insert transaction, and count reporting while applied-research owns repair construction
and missing-row selection.
`pipeline-v2 audit speed-pace-shadow` and `pipeline-v2 audit route-month-shadow` now retain only
CLI parsing, local DB opening, path resolution, and output writes while applied-research owns
shadow-audit artifact construction, row selection, and detector-shadow path naming.
`pipeline-v2 audit detector-corpus-grain` now retains CLI parsing, manifest/completeness/shadow
artifact loading, local DB opening, and output writes while applied-research owns local row
selection, path naming, score-vector artifact discovery, audit construction, release checks, and
markdown rendering.
`pipeline-v2 build stop-direction-hour-ewt-features` now retains only CLI parsing, local DB opening,
and output writes while applied-research owns schedule/observed row loading, GTFS service-date
expansion, artifact construction, and path naming.
`pipeline-v2 build ewt-score-vectors` now retains only CLI parsing, local DB opening, path
resolution, and output writes; the EWT study wrapper, ABST enrichment, reliability-row loading, and
path convention live under `@bp/applied-research`.
`pipeline-v2 build speed-pace-score-vectors` now retains the same shell responsibilities while
applied-research owns segment-speed row loading, score-vector study construction, and path naming.
`pipeline-v2 build runtime-trend-score-vectors` now retains the same shell responsibilities while
applied-research owns observed-runtime, scheduled-stop, and route-metric history row loading,
runtime/trend score-vector study construction, and path naming.
`pipeline-v2 audit analytics-corpus-profile` now retains CLI parsing, local DB opening, path
resolution, and output writes while applied-research owns corpus observation SQL loading, profile
artifact construction, doctrine, and path naming.
`pipeline-v2 audit analytics-backfill-coverage` now retains the same shell responsibilities while
applied-research owns backfill surface SQL loading, coverage audit construction, thresholds,
next-action logic, and path naming.
`pipeline-v2 audit analytics-detector-readiness` now retains CLI parsing, local DB opening, nested
backfill coverage delegation, path display normalization, and output writes while applied-research
owns direct readiness surface probes and detector policy readiness construction.
`pipeline-v2 audit analytics-materialization-coverage` now retains CLI parsing, data-product
manifest metadata adaptation, local DB opening, path display normalization, and output writes while
applied-research owns route/table/artifact probing and materialization audit construction.
`pipeline-v2 route brief-model` now retains CLI parsing, route-list resolution, local DB
reads/writes, hotspot projection error capture, route-slice artifact writes, and run summary
reporting while applied-research owns route brief analytics, route-universe planning, unknown-route
issue construction, hotspot projection, segment universe construction, visibility adjustment, and
comparison-rank row construction, including the final serving projection that mirrors visibility
into route-slice metrics.
`pipeline-v2 audit evidence-corpus` now retains artifact path resolution, JSON reads, output
validation, and report writes while applied-research owns evidence-corpus summary and gap/status
policy construction.
`pipeline-v2 audit detector-closure` now retains CLI parsing, data-product manifest parsing,
prerequisite artifact reads, path display normalization, and output writes while applied-research
owns dependency-closure artifact construction and Markdown rendering.
`pipeline-v2 audit studio-coverage` now retains local D1 reads, generated artifact path/list
scanning, presentation-term scanning, status assembly, and report writes while applied-research owns
route brief input completeness and Studio route projection validation policy.
`pipeline-v2 audit route-schedule-progress` now retains only local DB path resolution, SQLite
opening, and command output while applied-research owns schedule-progress SQL aggregation.
`pipeline-v2 findings lattice-review-bundles` now retains CLI path resolution, artifact reads, and
JSON/Markdown/HTML writes while applied-research owns route input shaping, preview artifact
construction, and renderers.
`pipeline-v2 studio route-speed-histories` now retains route selection, existing-artifact probing,
per-route history orchestration, and output writes while applied-research owns the batch manifest
path, readiness defaults/parsing, batch manifest contract, and summary rollups.
`pipeline-v2 build express-route-analysis` now retains source manifest loading, Socrata speed-query
fetching, route filtering, and output writes while applied-research owns the express capacity/speed
window shaping, screening thresholds, summaries, artifact contract, audit policy, and path naming.
`pipeline-v2 check route-speed-availability` now retains Socrata source probing and output writes
while applied-research owns source-row parsing, route/month availability classification,
requested-month fallback, rebuild-decision policy, result construction, and path naming.

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
