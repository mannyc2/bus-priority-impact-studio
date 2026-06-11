---
title: 100x Analytics Plan
type: engineering
status: draft
last_updated: 2026-06-07
owner: codex
source_count: 0
tags: [analytics, applied-research, detectors, panel-data, statistics, evaluation]
---

# 100x Analytics Plan

## Purpose

The current analytics system is useful but still too much like a detector collection:
thresholds over prepared rows, followed by evidence packets and review. A 100x analytics upgrade
should turn it into a statistical research system:

```text
declared corpus universe
  -> declarative panel specs
  -> versioned statistical model artifacts
  -> detectors consume model outputs
  -> evaluation harness scores quality and failure modes
  -> serving projections expose only honest, reviewed surfaces
```

The goal is not "more math" for its own sake. The goal is to make the system better at finding
non-obvious, defensible, high-value transit issues:

- slow segments that are unusually slow after accounting for route, month, history, daypart, and
  peers;
- intervention candidates where the treatment geography, timing, or effect does not match the
  observed pain;
- recurring operational fingerprints that suggest schools, events, construction, curb pressure,
  or enforcement cycles;
- routes where speed, reliability, ridership, rider exposure, and official source evidence
  decouple in ways that imply different fixes;
- gaps where the right claim is "we cannot evaluate this because the public data is missing."

## Diagnosis

The repo already has the right spine:

- `packages/analytics` is a pure detector kernel with registry metadata, feature contracts,
  baseline helpers, reason codes, coverage rows, and calibration helpers.
- `packages/applied-research` is becoming the corpus-backed research layer for local DB reads,
  artifact builders, detector studies, review packets, and evaluation reports.
- `tools/pipeline-v2` is the CLI and local IO layer.
- The detector evaluation harness, review packets, gold-set artifacts, coverage audits, and
  reviewer labels now exist.
- The first statistical artifact exists: `segment_speed_residuals_v1`, built from a
  `segment_month_panel_v1` panel and consumed by `treatment_scope_mismatch`.

The weakness is that most detectors still start from local feature rows and threshold them directly.
That leads to predictable false positives:

- terminal and layover artifacts look like extreme slowness;
- tiny or unstable segments outrank real operational issues;
- route/month screening hides segment/daypart issues;
- raw speed thresholds overstate chronic but expected conditions;
- treatment detectors confuse geometry context with treatment effect;
- "no evidence found" can sound like "no intervention exists" unless source gaps are explicit.

The 100x upgrade is to make statistical context a first-class input before detectors fire.

## Core Decision

Do not make `packages/analytics` a DB client or a dataframe app.

Instead:

| Layer | New role |
|---|---|
| `packages/analytics` | Pure statistical kernels, detector algorithms, model-output contracts, calibration math. |
| `packages/applied-research` | Declarative panel specs, local DB/artifact resolvers, dataframe-backed model builders, study artifacts. |
| `tools/pipeline-v2` | CLI adaptation, paths, local DB handles, writes, operational orchestration. |
| `apps/web` | Reads served projections only; never imports research runtime code. |

`@tidy-ts/dataframe` belongs in `packages/applied-research`, where it can make panel/model code
legible. Heavy filtering and aggregation should still happen in SQLite before rows enter JS. The
rule is:

```text
SQL narrows the corpus.
DataFrame expresses the panel/statistical transform.
Analytics consumes typed model rows.
Detectors publish hypotheses, not raw model tables.
```

## Target Architecture

### 1. Data Universe Registry

Every study begins by declaring the universe it searched.

Required fields:

| Field | Meaning |
|---|---|
| `analysisUnitId` | Stable id such as `route_month`, `segment_month`, `segment_daypart`, `stop_direction_hour`. |
| `scopeUniverse` | Which routes, months, segments, directions, stops, and source families were eligible. |
| `requiredProducts` | Source and derived products needed to evaluate the unit. |
| `coverageStates` | Available, available-not-fetched, upstream-blocked, downstream-blocked, derived-not-built, source-absent. |
| `eligibilityRules` | Minimum rows, observations, trips, months, geometry confidence, source freshness. |
| `negativeMeaning` | What a clean no-hit actually means at this grain. |

This prevents "coverage" from becoming indirection. Each analytics artifact should state what we
have, what we do not have, what can be fetched, what cannot be released yet, and what derived work
is blocked.

### 2. Declarative Panel Specs

Add a small `PanelSpec` system in `@bp/applied-research`.

A panel spec should declare:

| Field | Example |
|---|---|
| `panelId` | `segment_month_panel_v1` |
| `grain` | `route_id + month + direction + stable_segment_key` |
| `timeKey` | `month` |
| `entityKeys` | route, direction, stop order, timepoint pair |
| `measures` | speed, travel time, trips, observation count, ridership exposure |
| `joins` | route catalog, treatment summary, weather, incidents, permits, Tier 2 refs |
| `coverage` | month count, sample count, join state, source freshness |
| `historyWindow` | `2023-04` through release month |
| `releaseFilter` | current public release month, usually latest complete speed month |

The spec is not a generic ORM. It is a typed declaration that lets a command, test, evaluator, and
detector all agree on the same corpus shape.

### 3. Panel Resolvers

Build resolvers behind the specs:

| Resolver | Purpose |
|---|---|
| `SqlitePanelResolver` | Run bounded, indexed SQL over `data/local/pipeline.sqlite`. |
| `ArtifactPanelResolver` | Load already-materialized JSON artifacts such as treatment summaries. |
| `CoveragePanelResolver` | Attach source/derived data coverage and missingness states. |
| `FixturePanelResolver` | Feed small deterministic fixtures into model tests. |

The resolver output is a typed row array plus a manifest. The manifest is as important as the rows:
it proves which corpus, SQL, artifacts, product versions, and coverage states fed the model.

### 4. Statistical Model Artifacts

Detectors should consume model artifacts, not hand-roll all context internally.

Initial artifact families:

| Artifact | Question answered |
|---|---|
| `segment_speed_residuals_v1` | Is a segment slow relative to its own history plus route-month conditions? |
| `segment_daypart_residuals_v1` | Is the problem concentrated in a specific time-of-week or daypart? |
| `route_peer_residuals_v1` | Is a route abnormal relative to route type, borough, and peer history? |
| `treatment_event_panel_v1` | Did treated units change differently from comparable untreated units? |
| `intervention_scope_fit_v1` | Does treatment geography overlap the observed binding constraint? |
| `reliability_exposure_panel_v1` | Where do wait/reliability failures matter most after rider exposure? |
| `pulse_fingerprint_v1` | Which segments/routes have recurring periodicity or non-weekly pulses? |
| `decoupling_quadrants_v1` | Which routes split speed, reliability, ridership, and rider exposure? |
| `source_gap_model_v1` | Which claims are blocked by missing official inventories or stale public sources? |

Each model artifact should include:

- `modelId`, `schemaVersion`, `runId`, `createdAt`;
- input panel ids and artifact hashes;
- release month and history window;
- row-level model outputs;
- summary statistics;
- coverage and missingness;
- known limitations;
- detector ids that consume it.

### 5. Statistical Kernel

Start with transparent, testable methods before heavier modeling.

High-leverage primitives:

| Primitive | Use |
|---|---|
| robust mean/median/MAD/z-score | Replace brittle threshold rankings. |
| percentile/rank by peer group | Explain why a row is unusual in context. |
| rolling windows and seasonality comparison | Avoid false "new issue" claims. |
| route-history residuals | Separate chronic baseline from new abnormality. |
| peer residuals | Separate network-wide movement from local movement. |
| exposure weighting | Prioritize rider impact over visual outliers. |
| event-window summaries | Pre/post treatment screening. |
| difference-in-differences/event-study scaffolds | Promote only when counterfactual gates pass. |
| bootstrap or simple uncertainty intervals | Avoid fake precision on sparse panels. |

Do not jump straight to opaque models. The first 100x gain should come from better panel structure,
better baselines, and better gates.

### 6. Detector V2 Contract

Detector registry entries should declare model dependencies:

```ts
{
  detectorId: "treatment_scope_mismatch",
  featureGrains: ["route_segment_treatment_summary"],
  modelArtifacts: ["segment_speed_residuals_v1", "intervention_scope_fit_v1"],
  requiredCoverage: ["segment_month_panel_v1", "route_treatment_summary"],
  promotionGates: ["geometry_confirmed", "residual_worse_than_expected", "counter_evidence_present"]
}
```

A detector should then read like:

```text
for each eligible scope:
  if coverage is missing, emit skipped/missing coverage
  if model says expected or weak, suppress/context
  if model says abnormal and evidence is reviewable, emit candidate
  attach primary evidence, counter-evidence, caveats, and source gaps
```

This makes detector code shorter and more honest. The detector asks a product question; the model
artifact supplies statistical context.

### 7. Evaluation Loss

The evaluation harness should become the optimization surface.

Core success metrics:

| Metric | Target |
|---|---|
| reviewed precision | More promotable candidates per review hour. |
| false-positive root reduction | Known roots such as terminal artifacts and duplicate physical nodes decline. |
| primary survival | Reviewed primary findings survive new gates. |
| suppress correctness | Suppressed/rejected labels stop reappearing. |
| missingness honesty | Missing source/derived data is explicit, not treated as clean. |
| coverage completeness | The searched universe and skipped universe are measurable. |
| rank stability | Top findings are stable under adjacent months and reasonable thresholds. |
| novelty | Finds useful cases not already obvious from raw speed ranking. |
| evidence density | Packets contain primary, counter, caveat, coverage, and source refs. |
| runtime and artifact size | Fits local batch and serving constraints. |

The key release question becomes:

> Did this model/detector version improve the loss surface without hiding uncertainty?

### 8. Serving Projection

The public site should not serve raw research tables. It should serve page-shaped projections:

| Page surface | Analytics-backed data |
|---|---|
| Route overview | route score, latest metrics, historical trend, coverage labels. |
| Route timeline | curated Tier 2/treatment/source events plus observed metric windows. |
| Segments tab | residual-ranked segment issues, not just raw slowest segments. |
| Interventions tab | treatment posture, source gaps, scope fit, event-study eligibility. |
| Findings tab | reviewed/promoted hypotheses with evidence and caveats. |
| Compare | peer residuals, decoupling quadrants, trend deltas. |
| Internal lab | unreviewed detector candidates, model diagnostics, failure roots. |

This keeps the design clean. The analytics layer prepares the interesting facts; the UI decides how
to tell the story.

## Phased Implementation

### Implementation Status

As of 2026-06-07, the first seven detector-backed model artifacts exist and are included in
standard detector evaluation diagnostics. One additional pattern-mining artifact exists for the
internal lab:

| Artifact | Status | Release rows | Current detector consumers |
|---|---|---:|---|
| `segment_speed_residuals_v1` | built from `segment_month_panel_v1`; consumed by treatment-scope detectors | 3,102 | `treatment_scope_gap`, `treatment_scope_mismatch` |
| `segment_daypart_residuals_v1` | built from `segment_daypart_panel_v1`; consumed by `speed_pace_hotspot` | 12,625 | `speed_pace_hotspot` |
| `route_peer_residuals_v1` | built from `route_month_peer_panel_v1`; consumed by route-level peer/history detectors | 348 | `multi_month_speed_peer`, `degradation_trend`, `positive_deviance` |
| `intervention_scope_fit_v1` | built from route treatment summary rows, segment treatment rows, and source-gap rows | 4,486 | `treatment_scope_gap`, `treatment_scope_mismatch` |
| `source_gap_model_v1` | built from route treatment source-gap rows and blocked-claim policy labels | 381 | `source_gap`, `intervention_gap` |
| `reliability_exposure_panel_v1` | built from stop-direction-hour EWT artifacts plus route-hour ridership proxy allocation | 311,924 supported stop-hour rows | `rider_weighted_excess_wait` |
| `treatment_event_panel_v1` | built from intervention comparison rows as an association-screening panel with explicit causal-method blockers | 236 supported/effect rows | `intervention_event_study` |
| `pulse_fingerprint_v1` | built from route-direction hour-of-week speed history; internal-lab only | 699 route-direction rows | none yet |
| `decoupling_quadrants_v1` | built from route speed/ridership history plus observed reliability history; internal-lab only | 367 route rows | none yet |

`PanelSpec` and `PanelManifest` contracts now exist in `@bp/applied-research/feature-resolvers`.
The residual artifacts carry their panel manifests, input source refs, eligibility rules, coverage
summaries, and limitations. `evaluate detectors` now reads these model artifacts and reports their
availability in `detector-evaluation.json` and `detector-evaluation.md`.
Detector registry entries now declare model dependencies through `modelArtifacts`, and
the standard detector-evaluation artifact projects those dependencies into `detectorVersions` and
model-consumer diagnostics. Current declared consumers are `treatment_scope_gap` and
`treatment_scope_mismatch` for `segment_speed_residuals_v1`,
`speed_pace_hotspot` for `segment_daypart_residuals_v1`, and
`multi_month_speed_peer`, `degradation_trend`, and `positive_deviance` for
`route_peer_residuals_v1`; `treatment_scope_gap` and `treatment_scope_mismatch` consume
`intervention_scope_fit_v1`; `source_gap` and `intervention_gap` consume `source_gap_model_v1`;
`rider_weighted_excess_wait` consumes `reliability_exposure_panel_v1`; and
`intervention_event_study` consumes `treatment_event_panel_v1`.
Model-backed detectors now have an explicit evaluation-loss hard gate: reviewed primary positives
must survive, and reviewed-negative precision must stay above the current floor. The March 2026
evaluation has 0 model-backed evaluation-loss blocked detectors.

`evaluate detectors` also emits a serving-safe model projection at
`model-artifact-serving-projection/<history_window>/<release_month>/model-artifacts.json`. This
projection contains only model status, panel ids, row counts, route/segment counts, detector
consumers, and limitations; it intentionally omits raw model rows, raw model artifact paths, and
residual scalar fields.

The current serving-safe projection has 9 available models, 0 missing models, and 10 detector
consumers. The two Phase 4 pattern-mining artifacts are included with empty detector-consumer lists
because they are internal-lab surfaces, not detector dependencies yet. `reliability_exposure_panel_v1`
contributes 650,264 stop-direction-hour panel rows,
311,924 rows with both rider exposure and computable EWT, 350 routes, 22,800 stops, about 5.53M
estimated boardings, and about 252.8M estimated rider-delay minutes for March 2026. Its manifest
explicitly limits the claim: ridership is a route-hour proxy allocated over stop-direction-hour
rows, not observed stop-level boardings.
`findings run-detector --detector-id rider_weighted_excess_wait` now requires this panel artifact at
runtime. If the model rows are not supplied, the detector run emits an explicit
`skipped_missing_input` / `missing_model_artifact` coverage row instead of rebuilding the old
stop-hour EWT plus route-hour ridership join inside the runner. The March 2026 detector run reads
650,264 panel rows and emits 7 review candidates.
`findings run-detector --detector-id source_gap` now consumes `source_gap_model_v1` rows directly
for treatment/TSP source-gap blockers. The March 2026 run reads 381 model rows and emits 381
`tsp_current_inventory_missing` review candidates with matching coverage rows.
`findings run-detector --detector-id intervention_gap` also consumes `source_gap_model_v1` rows
directly at runtime. The March 2026 run reads the 381-route model surface, emits 8 review
candidates, and records `sourceKind=intervention_gap_from_source_gap_model_v1`. The detector runner
no longer rebuilds this model from raw route-treatment source-gap rows.
`treatment_event_panel_v1` is now built for March 2026 with 741 event-panel rows across 327 routes,
236 supported comparison rows, 236 rows with effect estimates, and 102 rows eligible for
candidate-causal methodology review under the current automated gates. `findings run-detector --detector-id intervention_event_study`
requires this artifact at runtime, reads 741 panel rows, and emits 100 capped
association-screening candidates. The artifact limitations are deliberate: pre-trend, placebo,
autocorrelation, and method-divergence gates are still often `not_tested`, so the detector can
surface review seeds but cannot publish causal or effect claims.
The latest panel build computes deterministic screening diagnostics from route-month speed history
where the public data supports it, using longer pre-intervention route history when the persisted
comparison window is too short. Current gate counts are: pre-trend 231 pass / 1 fail / 509 not
tested; placebo-in-time 211 pass / 8 fail / 522 not tested; placebo-in-space 145 pass / 85 fail /
511 not tested; autocorrelation 171 pass / 60 fail / 510 not tested; and method-divergence 224 pass
/ 12 fail / 505 not tested. The corresponding detector run records these `gateStatusCounts` and
`candidateCausalEligibleFeatureCount=102`, while still using association-pending-review claim text.
The treatment-event build also writes a review-safe candidate-causal projection at
`analytics-models/treatment-event-panel-v1/<history_window>/<release_month>/candidate-causal-review.json`.
For March 2026 it contains 102 review rows across 93 routes, with compact event/window/effect/gate
fields, `reviewDisposition=needs_methodology_review`, and `publicClaimAllowed=false` on every row.
It omits raw model rows and raw artifact paths.

`treatment_scope_gap` now consumes `intervention_scope_fit_v1` and `segment_speed_residuals_v1` at
runtime. The feature resolver attaches scope-fit and residual context to segment inputs, and the
detector suppresses unsafe uncovered-scope claims when the scope-fit model says a segment is covered,
partial-confirmed, geometry-unavailable, or source-gap-blocked. It also suppresses true-uncovered
segments that are not worse than modeled expectation on an already chronically slow route. The
March 2026 detector run loads 4,486 scope-fit rows, attaches context to 4,134 segment inputs, and
emits 54 current candidates after residual gating.

As of the Phase 4 runner contract, `runRegistryDetectorStudy()` checks each detector's declared
`modelArtifacts` before dispatch and records per-run `modelDependencies` plus declared
`dataProductDependencies` in the run artifact. Missing model rows produce a first-class
`skipped_missing_input` coverage row with `reasonCode=missing_model_artifact`, so a model-backed
detector can no longer silently fall back to raw-threshold behavior.

The reviewed treatment-scope calibration rerun is captured in
`data/artifacts/findings/2026-03/treatment-scope-review-set/CALIBRATION-AUDIT-AFTER-MODEL-GATES.md`.
After rerunning `treatment_scope_gap` and `treatment_scope_mismatch` with expanded candidate
retention, all 6/6 adversarially reviewed primary findings still emit, while 37/50 reviewed packets
drop out. No suppress-labeled reviewed packet still emits. Remaining calibration debt is narrow and
named: `treatment_scope_gap` still emits one reviewer-only reviewed packet, while
`treatment_scope_mismatch` still emits three reviewer-only reviewed packets. Those survivors should
stay internal/reviewer-only unless later gates can demote them without losing primary findings.

`decoupling_quadrants_v1` is now built for March 2026 at
`analytics-models/decoupling-quadrants-v1/<history_window>/<release_month>/decoupling-quadrants.json`.
It produces 367 route-level internal-lab rows: 346 have speed/ridership trend support and 346 have
reliability trend support. Historical excess-wait is not populated before the release month in the
current local reliability table, so the artifact uses excess-wait deltas when available and falls
back to observed long-gap-share deltas for historical reliability trend. Current pattern counts are:
271 `coupled_or_weak_signal`, 37 `reliability_worse_speed_stable_or_better`, 18
`speed_better_ridership_down`, 15 `speed_worse_ridership_resilient`, 12 `fast_but_unreliable`, 11
`slow_but_reliable`, and 3 `speed_worse_reliability_stable_or_better`. All rows are
`reviewDisposition=internal_lab` and `publicClaimAllowed=false`.

`pulse_fingerprint_v1` is now built for March 2026 at
`analytics-models/pulse-fingerprint-v1/<history_window>/<release_month>/pulse-fingerprint.json`.
It produces 699 route-direction internal-lab rows across 353 routes, comparing release-month
hour-of-week speeds against prior-month medians for the same route-direction/hour cell. Each
candidate pulse cell must have at least 12 historical months and at least 20 release-month trips,
to avoid ranking tiny overnight samples as findings. The current build has 404 supported pulse rows:
183 `worst_hour_of_week`, 102 `weekend_pulse`, 97 `rush_hour_pulse`, 22 `off_peak_pulse`, and 295
`flat_or_weak_signal`. All rows are `reviewDisposition=internal_lab` and
`publicClaimAllowed=false`, because the model identifies timing fingerprints but does not identify
the external cause.

The detector evaluation artifact now includes a first-class `qualityLab` block. For March 2026 it
reports 200 reviewed decisions, 200 promoted findings, 10 model-backed detectors, 0
model-backed-evaluation-loss blocked detectors, 20 score-vector-backed detectors, 0
score-vector-unavailable detectors, and `thresholdAndRankStabilityStatus=available`. The compact
rank-stability check inspected 20 detector score-vector distributions, marked 4 as fragile under
the current top-rank concentration / near-threshold sensitivity rules, and recorded
`maxTopTenShare=1` and `maxThresholdSensitivityShare=0`. These metrics are intentionally
descriptive: they make review yield, primary finding yield, false-positive roots, and threshold/
rank-stability coverage visible, while the reviewed-decision corpus still controls how strongly
those numbers should be trusted.

### Phase 0: Stabilize The First Statistical Artifact

Status: partially implemented.

Tasks:

1. Treat `segment_speed_residuals_v1` as the first model artifact pattern.
2. Add a manifest sidecar with input SQL/artifact refs, row counts, hash, and coverage summary.
3. Add detector-evaluation comparisons to the standard evaluation report, not only an ad hoc
   comparison file.
4. Add a fixture where residual context suppresses a known false positive without removing known
   primary labels.

Acceptance:

- `treatment_scope_mismatch` keeps the reviewed primary findings and removes at least some known
  false positives.
- Model artifact generation is reproducible from local DB plus artifact inputs.

### Phase 1: PanelSpec Foundation

Status: implemented for segment-month, segment-daypart, route-peer, intervention-scope,
source-gap, reliability-exposure, and treatment-event model artifacts.

Tasks:

1. Add `PanelSpec` and `PanelManifest` contracts in `@bp/applied-research`.
2. Migrate `segment_month_panel_v1` into that spec system.
3. Add tests for fixture-backed panel resolution and bounded SQLite resolution.
4. Add coverage fields to every panel row where absence changes claim meaning.

Acceptance:

- A detector run can list exactly which panel specs and model artifacts it consumed.
- The same panel can be used by a model builder, evaluator, and test without duplicating query
  logic.

### Phase 2: Residual Models For Speed, Reliability, And Exposure

Tasks:

1. Build `segment_daypart_residuals_v1`.
2. Build `route_peer_residuals_v1`.
3. Build `reliability_exposure_panel_v1`.
4. Add rider exposure where public data supports it; otherwise add explicit source/derived
   blockers.
5. Convert `speed_pace_hotspot`, `multi_month_speed_peer`, and treatment-scope detectors to consume
   these models.

Acceptance:

- Raw-speed-only candidates decline.
- Segment/daypart pockets become visible without overclaiming route-level issues.
- Rider impact changes ranking where exposure data is available.

### Phase 3: Intervention And Source-Gap Analytics

Tasks:

1. Build `intervention_scope_fit_v1` from treatment summaries, DOT bus-lane overlap, ACE/ABLE, TSP
   source posture, and Tier 2 refs.
2. Build `treatment_event_panel_v1` with pre/post, peer pool, pre-trend, placebo, and sensitivity
   fields. Current status: association-screening artifact exists; causal-method gates are explicit
   blockers until stronger checks are implemented.
3. Split intervention outputs into:
   - source gap;
   - scope mismatch;
   - underperformance screen;
   - event-study eligible;
   - event-study supported.
4. Make claim language depend on artifact gates, not detector score alone.

Acceptance:

- The system can distinguish "treated but still slow", "treatment does not cover the slow segment",
  "public source inventory is missing", and "effect estimate is weak."
- No detector implies a treatment failed without a valid comparison design.

### Phase 4: Pattern Mining

Status: implemented for the first internal-lab artifacts. `pulse_fingerprint_v1` exists for
route-direction hour-of-week speed signatures, and `decoupling_quadrants_v1` exists for route-level
speed/ridership/reliability splits. Neither artifact has a public serving consumer or detector
consumer yet.

Tasks:

1. Build `pulse_fingerprint_v1` for recurring calendar/hour-of-week signatures. Current status:
   internal-lab route-direction artifact exists; no detector or public serving consumer yet.
2. Build `decoupling_quadrants_v1` for speed, reliability, ridership, and exposure splits. Current
   status: internal-lab route artifact exists; no detector or public serving consumer yet.
3. Build route/segment candidate packs that ask product-useful questions rather than generic
   "which rows are outliers?"
4. Route these to review/internal lab first.

Acceptance:

- The system finds non-obvious cases that a user would not get from raw route ranking.
- Every candidate has a falsifiable explanation and counter-evidence path.

### Phase 5: Quality Lab And Automatic Calibration

Status: implemented for the detector-evaluation artifact. Reviewed labels/gold-set inputs,
false-positive roots, model-backed evaluation-loss gates, score-vector availability, compact
threshold/rank-stability checks, and review/primary-finding yield metrics are now surfaced in
`detector-evaluation.json`. Deeper automatic threshold sweeps that rerun detectors under alternate
parameter grids remain future calibration work, not a public-serving dependency.

Tasks:

1. Promote reviewed labels and adversarial-review outcomes into a detector gold-set artifact.
2. Track false-positive roots by detector and by model artifact.
3. Add before/after evaluation for every model/detector version change.
4. Add threshold sweeps and rank-stability checks.
5. Add "review time saved" and "primary finding yield" as first-class evaluation metrics.

Acceptance:

- We can answer whether a detector got better with numbers, not vibes.
- A new model artifact cannot be adopted unless it preserves reviewed positives or explains why
  they were demoted.

## Immediate Next Slices

1. Decide whether the four remaining reviewer-only treatment-scope reviewed packets need stricter
   demotion gates or should remain internal review candidates.
2. Add release/publish plumbing for the serving-safe model projection once the website needs a
   public diagnostics surface.
3. Review the 102-row `candidate-causal-review.json` projection against methodology expectations;
   automated gates now screen them, but human methodology approval remains required before any
   causal/effect language.

## Non-Goals

- Do not move DB reads into `packages/analytics`.
- Do not add Python, PostGIS, hosted Postgres, FastAPI, or a VPS for this plan.
- Do not load the whole 17M-row speed corpus into JS when SQLite can pre-aggregate.
- Do not use LLMs to compute metric truth, normalize numeric claims, or decide detector outputs.
- Do not publish unreviewed model output directly to the public site.
- Do not refactor frontend designs around internal diagnostic cards.

## Open Questions

1. Which panel grains deserve first-class stable ids across route shape/schedule changes?
2. How much rider exposure can be joined at segment/daypart grain with current public data?
3. Should uncertainty intervals be bootstrap-based first, or should we add a small deterministic
   regression helper once the panel specs settle?
4. Which detector families should be demoted until they consume model artifacts instead of raw
   features?
5. How should serving snapshots expose "interesting but unreviewed" cases: internal lab only,
   private route notes, or hidden debug endpoints?
