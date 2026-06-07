---
title: Applied Research and Detector Authoring
type: engineering
status: active
last_updated: 2026-06-07
owner: codex
source_count: 0
tags: [analytics, applied-research, detectors, local-db, sqlite, evaluation, authoring]
---

# Applied Research and Detector Authoring

This is the working guide for adding new detectors or new applied-research work without turning the
analytics stack back into a pile of one-off SQL and scripts.

The short version:

- `@bp/analytics` owns pure detector/statistical logic.
- `@bp/applied-research` owns corpus-to-panel/model/review/evaluation logic.
- `@bp/applied-research/local-db` owns local SQLite reads that assemble research panels.
- `tools/pipeline-v2` owns command orchestration only.
- `@bp/db` owns storage contracts, migrations, table-shaped repositories, and D1/R2 serving
  plumbing.

## Start With The Question

Before writing code, write the smallest answer to these questions in the PR, issue, or working note:

1. What user or analyst question is this answering?
2. What is the exact universe: routes, segments, stops, months, documents, events, or source scopes?
3. What is the grain of one row or one candidate?
4. What evidence directly supports the claim?
5. What counter-evidence or missing input blocks the claim?
6. What does a clean no-hit mean?
7. What will consume the result: detector run, review packet, serving projection, brief, audit, or
   internal research only?

If those cannot be answered yet, build an applied-research panel or audit first. Do not start with a
public-facing detector.

## Decision Tree

Use this placement rule:

| Work | Home |
| --- | --- |
| Pure metric, baseline, threshold, score, or candidate emission from prepared rows | `packages/analytics` |
| New detector input panel, model artifact, query baseline, coverage audit, review/evaluation artifact | `packages/applied-research` |
| Local SQLite read that shapes source tables into research rows | `packages/applied-research/src/local-db` |
| Storage schema, migration, table-shaped local repository, D1 repository, transaction helper | `packages/db` |
| Source fetch/probe/DTO parsing | `packages/sources` plus pipeline orchestration |
| CLI flags, path resolution, DB opening, artifact read/write | `tools/pipeline-v2` |
| Worker/API/public serving shape | `packages/studio-api`, `apps/web`, `packages/db` |

Ask one sharper question when unsure: is this code defining an analytical meaning, or just safely
reading/writing a table? Analytical meaning belongs in applied research; table mechanics belong in
DB.

## New Applied-Research Work

Use applied research for work that prepares, evaluates, or audits the corpus, even when it may later
feed a detector. Examples: route peer residuals, segment-daypart residuals, treatment event panels,
source-gap models, query baselines, detector evaluation artifacts, and timeline/tier-2 projections.

### Required Shape

A durable applied-research unit should have:

- A named artifact or panel ID.
- A declared grain.
- Source tables/artifacts and required data products.
- Coverage states for missing, blocked, available-not-fetched, and derived-not-built inputs.
- A row schema or artifact schema at the package boundary.
- A summary with row counts and route/month/entity coverage.
- Limitations that explain what the result cannot prove.
- Fixture-backed tests that do not need the live database.

If the output is a reusable panel/model artifact, return a `PanelManifest` or equivalent manifest.
The manifest should say what was searched, what was eligible, what was emitted, and what negative
results mean.

### Implementation Steps

1. Define the research contract.
   - Put panel/model specs in `packages/applied-research/src/feature-resolvers/` when the output is a
     reusable model input.
   - Use `PanelSpec` / `PanelManifest` from
     `packages/applied-research/src/feature-resolvers/panel-spec.ts` for reusable panel products.
   - If this is a durable product, add or reuse a `DATA_PRODUCT_MANIFEST` entry in
     `packages/applied-research/src/data-products/registry.ts`.

2. Add local SQLite reads only if needed.
   - Put explicit `bun:sqlite` SQL in `packages/applied-research/src/local-db/<name>-rows.ts`.
   - Export a small loader from `packages/applied-research/src/local-db/index.ts`.
   - Parse aggregate SQL results through focused Zod schemas before returning typed rows.
   - Prefer read-only DB handles for audits and analysis commands.
   - Do not put reusable SQL inside `tools/pipeline-v2` commands.

3. Keep the model builder pure.
   - Put transforms in `feature-resolvers`, `feature-history`, `evaluation`, `causal`,
     `forecasting`, `route-briefs`, or another applied-research submodule based on the product.
   - Accept typed rows and return typed rows/artifacts.
   - Do not open SQLite, read files, fetch network sources, or write artifacts in the builder.

4. Add artifact path helpers.
   - Put path/key helpers in `packages/applied-research/src/artifacts/`.
   - Export only focused named helpers from `packages/applied-research/src/artifacts/index.ts`.
   - If a public-safe projection is needed, create a compact projection artifact instead of serving
     the raw research rows.

5. Add a thin pipeline command if humans or tmux need to run it.
   - The command should parse flags, open the DB, call applied-research, and write JSON/Markdown.
   - It should not contain the analysis SQL or research policy.
   - Use `scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- ...` for long-running
     provider/source commands that need repo env.

6. Add tests.
   - Package tests live in `packages/applied-research/test/`.
   - Command-boundary tests live in `tools/pipeline-v2/test/`.
   - Add query-plan coverage when the local DB read is large or hot.

### Applied-Research Done Means

- The output has a stable ID, schema, and artifact path.
- The expected universe and negative meaning are explicit.
- Missing data is classified, not hidden.
- The builder is fixture-testable without SQLite.
- Live DB reads, if any, can be audited with row counts and query plans.
- Downstream consumers do not have to know how the source corpus was joined.

## New Detectors

Use a detector only when the output is a reviewable finding candidate: a specific, evidence-backed
claim or source-gap warning that can be routed through review packets, promotion, and public
serving gates.

A detector should not be a broad research notebook. It is a deterministic decision rule over
prepared features.

### Detector Quality Bar

A detector must:

- Answer one specific question.
- Declare the strongest safe claim tier.
- Emit candidates, evidence, and coverage audits.
- Preserve skipped and missing-input cases as coverage rows.
- Use stable IDs.
- Keep claim text scoped to the feature grain.
- Include counter-evidence and known failure modes in the spec.
- Avoid causal language unless a causal gate and reviewer policy explicitly support it.

### Implementation Steps

1. Choose the detector ID and claim tier.
   - Add the ID to `KNOWN_DETECTOR_IDS` in `packages/domain/src/findings/index.ts`.
   - Use stable `snake_case`.
   - Pick the weakest honest claim tier: data-quality, descriptive, associational, or
     candidate-causal-needs-review.

2. Define or reuse feature grains.
   - Existing feature contracts live in `packages/analytics/src/features/`.
   - If adding a new grain, define its type, key builder, and feature contract.
   - Register the feature contract so `packages/analytics/test/registry.test.ts` can verify it.
   - Do not make the detector read local DB tables directly.

3. Implement the pure detector.
   - Put it in `packages/analytics/src/findings/<detector-id>.ts`.
   - Export:
     - `DETECTOR_ID`
     - default thresholds
     - input/output types
     - `detectSomething(input)`
   - Use `FindingCandidateSchema`, `FindingCoverageAuditSchema`, and evidence helpers from
     `@bp/domain` / `@bp/analytics/core`.
   - Use `stableId(...)` for candidate/evidence/audit IDs.
   - Emit coverage for every meaningful skipped input class.

4. Export and register it.
   - Add exports in `packages/analytics/src/detectors/index.ts`.
   - Add a detector spec in `packages/analytics/src/registry/specs.ts`.
   - Add a registry row in `packages/analytics/src/registry/detectors.ts`.
   - Declare feature grains, baseline families, promotion gates, missing-data states, retirement
     status, and model artifacts when applicable.
   - Let registry-derived `requiredDataProducts` come from feature grains where possible; add new
     data-product mappings only when a new feature grain/model requires them.

5. Wire the detector runner.
   - Add or reuse local rows in `packages/applied-research/src/local-db/detector-study-rows.ts` and
     supporting local-db modules.
   - Add feature-resolver logic in `packages/applied-research/src/feature-resolvers/` if the detector
     needs model-shaped input.
   - Update `runRegistryDetectorStudy()` in
     `packages/applied-research/src/detector-runs/detector-study.ts`.
   - If the detector declares `modelArtifacts`, make sure `detectorModelDependencySatisfaction()`
     can see the corresponding row slot and blocks the run when the model is missing.

6. Add evaluation support.
   - Make sure review packets include the primary evidence and counter-evidence needed by the spec.
   - Add score-vector/model artifact support if the detector ranking needs calibration.
   - Add gold-set or reviewer-decision hooks when the detector is meant to become public-facing.

7. Add tests.
   - Add a detector unit test in `packages/analytics/test/`.
   - Update `packages/analytics/test/registry.test.ts`.
   - Add applied-research tests for feature resolution, model dependency gates, or detector-run
     artifact construction.
   - Add a command-boundary test only when a new CLI command is needed.

### Detector Done Means

- `getAnalyticsDetector(detectorId)` returns the registered detector.
- Registry tests prove the detector has a spec, feature grains, gates, required products, and known
  failure modes.
- Unit tests cover hit, no-hit, and skipped/missing-input paths.
- A detector run artifact records input summary, model dependencies, candidates, evidence, and
  coverage.
- Review packets contain enough evidence for a human or agent to refute the finding.

## Common Mistakes To Avoid

- Do not use a detector to explore an unknown research question. Build a panel/audit first.
- Do not silently filter missing inputs. Emit a coverage row with a reason code.
- Do not transform raw route names or source labels into canonical IDs inside a detector. Canonical
  joins belong in source, DB, or applied-research input preparation, with validation.
- Do not put causal language in `claimText` just because the pattern is interesting.
- Do not make `tools/pipeline-v2` own reusable SQL.
- Do not import `@bp/applied-research`, `@bp/db`, filesystem, SQLite, or dataframe runtimes from
  `@bp/analytics`.
- Do not serve raw model rows publicly. Project compact, reviewed, public-safe artifacts.
- Do not treat source absence as evidence that a treatment, event, or issue did not exist.

## Verification Commands

Run the narrowest relevant set first:

```bash
bun test packages/analytics/test/<detector>.test.ts
bun test packages/analytics/test/registry.test.ts
bun test packages/applied-research/test/<research-unit>.test.ts
bun test tools/pipeline-v2/test/<command-or-boundary>.test.ts
bun --filter @bp/analytics typecheck
bun --filter @bp/applied-research typecheck
bun run check:knowledge
```

For hot local SQLite panels, also run:

```bash
bun --filter @bp/pipeline-v2 cli -- audit local-db-query-baselines --start-year 2026 --start-month 3 --end-year 2026 --end-month 3 --json
```

If the work changes public serving, add the smallest relevant `@bp/studio-api` or Worker harness
test and verify that public runtime does not import applied-research.

## Review Checklist

Use this checklist before calling a detector or research unit done:

- The expected universe is explicit.
- The row/candidate grain is explicit.
- Required inputs are connected to data-product completeness where durable.
- Missing, blocked, stale, and not-built states are represented.
- Evidence and counter-evidence are available in the output.
- The code lives in the narrowest package that owns the meaning.
- The public-serving projection is smaller and safer than the research artifact.
- Tests cover positive, negative, and missing-input cases.
- Any live DB write or index change is deliberate and documented.
