---
title: Analytics / Local DB First-Principles Plan
type: engineering
status: draft
last_updated: 2026-06-07
owner: codex
source_count: 0
tags: [analytics, local-db, packages-db, applied-research, coverage, data-products, validation]
---

# Analytics / Local DB First-Principles Plan

## Purpose

Rethink the relationship between `packages/analytics`, `packages/applied-research/local-db`, and
`packages/db` from first principles.

The goal is not to make the repo prettier or reduce grep noise. The goal is to prevent the actual
mistakes this project keeps running into:

- coverage audits saying "complete" while omitting a product we care about;
- route universes shifting between commands;
- local DB tests passing against stale migrations;
- local projection rows drifting from D1 serving rows;
- source gaps being confused with clean no-hits;
- raw speed thresholds firing without enough statistical context;
- public-facing surfaces inheriting unreviewed research ambiguity.

## Direct answers

### 1. Is there a current mechanical split?

Yes. The current split is real, but it is not yet strong enough.

| Layer | Current mechanical role | What is good | What is still weak |
| --- | --- | --- | --- |
| `@bp/db` | Local SQLite + D1 schema, migrations, typed repo helpers, D1 query/seed helpers. | Drizzle schema is the storage source of truth; local writes now use transactions/chunking; public runtime does not import `@bp/db/local`. | Tests still use a stale local migration root; D1 validation schemas exist but are not wired; local/D1 schema drift is not checked; `@bp/db/local` is large enough that ownership rules need to be sharper. |
| `@bp/analytics` | Pure detector/statistical kernel, feature contracts, registry, calibration and evaluation math. | It is mostly DB-free and suitable for deterministic tests. | Some detector contracts still encode assumptions that should come from model/panel artifacts, not local feature quirks. |
| `@bp/applied-research` | Corpus-backed research layer: local DB row loading, panel/model artifacts, detector studies, review packets, materialization audits. | This is the right bridge between storage and analytics; the 100x model artifacts now live here. | `local-db` can become an unbounded SQL drawer unless we define exactly what it owns: corpus-to-panel reads, not storage truth. |
| `tools/pipeline-v2` | CLI orchestration, local IO, command flags, artifact writes. | Increasingly thin for detector/model work. | Some audit/coverage/data-product semantics still feel command-specific rather than product-owned. |
| D1/R2 serving | Compact public read models and large static artifacts. | Correct public direction: D1 indexes, R2 payloads. | Needs stronger gates so only page-shaped, validated projections cross into serving. |

So yes, there is a mechanical split. The missing piece is a crisp accountability split:

```text
@bp/db owns storage truth.
@bp/applied-research/local-db owns corpus-to-panel extraction.
@bp/applied-research owns model/data-product/review artifacts.
@bp/analytics owns pure math, detectors, and model dependency contracts.
tools/pipeline-v2 owns orchestration and file/database mutation.
D1/R2 own serving projections, not research truth.
```

### 2. Will this reduce future mistakes, or only reduce grep duplication?

Only reducing duplicated SQL would mostly reduce grep duplication. It would not fix the mistakes that
matter.

The plan reduces future mistakes only if each boundary gets an enforceable error-prevention job:

| Mistake class | Preventing mechanism |
| --- | --- |
| Stale tests | Local repo tests must migrate from the same `migrations-drizzle/local` journal as runtime. |
| Local-to-serving drift | D1 seed validation plus local/D1 schema drift tests. |
| Fake completeness | One data-product completeness spine with explicit gap classes: `available_not_fetched`, `upstream_blocked`, `derived_not_built`, `downstream_blocked`, etc. |
| Route universe drift | Data-product and panel specs declare the expected route/month/unit universe before a query runs. |
| Raw SQL shape mistakes | High-value raw SQL outputs parse through focused result schemas; cheap diagnostics can remain unvalidated. |
| Detector false positives | Detectors consume model artifacts and coverage state instead of raw local thresholds alone. |
| Public ambiguity | Serving projections expose only page-shaped summaries, evidence refs, caveats, and availability states. |

That is the distinction: helper extraction is cleanup; owned contracts and gates are correctness.

## First principles

1. **A database is a ledger, not the analyst.**  
   SQLite records source rows, derived rows, coverage ledgers, and materialized read models. It should
   not own detector judgment or statistical interpretation.

2. **Analytics should be pure after inputs are resolved.**  
   `@bp/analytics` should not know whether inputs came from SQLite, R2, fixtures, or an LLM-reviewed
   artifact. It should receive typed rows and return typed outputs.

3. **Applied research is the adapter between corpus and questions.**  
   `@bp/applied-research` owns panel specs, model artifacts, data-product completeness, review
   artifacts, and corpus-to-detector feature resolution.

4. **Coverage is a product, not a side effect.**  
   A coverage audit must directly answer what we have, what we lack, what is fetchable, what is
   upstream-blocked, and what derived work is blocked by that.

5. **Validate at crossings, not everywhere.**  
   Boundaries worth validating: source ingest DTOs, local-to-D1 seed rows, artifact manifests, public
   API responses, and high-value raw SQL result shapes. Do not wrap every internal function in Zod.

6. **Materialize expensive truth; keep D1 compact.**  
   Expensive panels/models are local tables or R2/data artifacts. D1 stores compact route/page indexes,
   summaries, status rows, and artifact refs.

7. **Every public claim needs a route from data to evidence.**  
   Model output alone can rank candidates. Public language needs reviewed finding/evidence/source refs
   and explicit caveats.

## Ownership model

### `@bp/db`

Owns:

- Drizzle table definitions for local SQLite and D1;
- migrations and migration helpers;
- local repo helpers for base tables and materialized projection tables;
- D1 query helpers and serializers;
- seed SQL generation and seed-row validation;
- table-level invariants such as atomic `replace*` writes and bind-safe inserts.

Does not own:

- detector math;
- panel eligibility policy;
- causal/statistical model construction;
- source fetching;
- high-level "is this product complete enough for Snapshot 2.0?" decisions.

Rule of thumb: if a helper can be described as "read/write this table safely," it belongs in
`@bp/db`. If it can be described as "assemble a research panel/question," it belongs in
`@bp/applied-research`.

### `@bp/applied-research/local-db`

Owns:

- bounded SQL readers that turn local DB rows into panel/model/detector inputs;
- SpatiaLite/raw SQL needed for spatial joins and large aggregate reads;
- data-product check evaluation over the local DB;
- focused result schemas for high-value raw SQL outputs;
- route/month/source universe probes used by research artifacts.

Does not own:

- Drizzle schema or migrations;
- public D1 query contracts;
- pure detector thresholds;
- CLI flag parsing or artifact path side effects, except path helpers exposed from `artifacts`.

Rule of thumb: this package can ask complicated questions of the local corpus, but it should not
redefine storage contracts.

### `@bp/applied-research`

Owns:

- panel specs;
- model artifacts such as residuals, scope fit, pulse fingerprints, decoupling quadrants, and source
  gap models;
- data-product manifest and completeness classification;
- detector study artifacts, review packets, quality lab, promotion queues, and evaluation loss.

Rule of thumb: this layer says what question we searched, what corpus was eligible, what was missing,
and what model/detector output means.

### `@bp/analytics`

Owns:

- pure statistical primitives;
- detector algorithms;
- feature contracts;
- detector registry metadata;
- calibration/evaluation math that does not require storage.

Does not own:

- SQLite/D1/R2 access;
- route artifact paths;
- data-product fetch state;
- page-shaped serving projections.

Rule of thumb: every exported detector should be runnable from fixtures without a local DB.

### `tools/pipeline-v2`

Owns:

- command-line orchestration;
- opening the local DB;
- selecting release months/runs;
- file writes, command output, tmux/background run ergonomics;
- sequencing producer commands.

Does not own reusable research semantics once a second command needs them.

Rule of thumb: command files should read like adapters: parse flags, open resources, call package
logic, write outputs.

## Data truth model

We should consolidate on one route:

```text
source registry / source captures
  -> local SQLite source tables
  -> data-product manifest + completeness checks
  -> declared panel specs
  -> model artifacts
  -> detector outputs / review packets
  -> serving projections
  -> D1/R2 public reads
```

The key is that each step carries a manifest:

- input products and versions;
- route/month/unit universe searched;
- query or artifact family used;
- coverage/gap classes;
- output schema version;
- downstream consumers.

The data-product registry in `@bp/applied-research/data-products` is already the embryo of this.
The plan is to promote it into the canonical local-truth spine instead of adding another audit
system.

## Plan

### Phase 1: Storage correctness gates

Purpose: make `@bp/db` trustworthy before doing more analytics on top.

Actions:

1. Point every local DB repo test at `packages/db/migrations-drizzle/local`, using the same Drizzle
   migrator path as runtime. **Status 2026-06-07:** `packages/db/test/local-test-db.ts` and
   `packages/db/src/local/migrate.ts` both use `migrations-drizzle/local`.
2. Add a guardrail test that fails if any test helper reads `packages/db/migrations/local` for the
   live local schema. **Status 2026-06-07:** `packages/db/test/local-migration-root.test.ts`
   scans DB tests for the stale root.
3. Wire existing D1 validation schemas into `build-seed-sql`, or delete them. Preferred: wire them
   at the seed boundary. **Status 2026-06-07:** `buildD1SeedSql()` and
   `buildD1AppendixSeedSql()` validate rows before rendering SQL; malformed seed rows fail in
   `packages/db/test/d1-seed-validation.test.ts`.
4. Add a local/D1 schema drift test for mirrored projection tables: column presence, `notNull`,
   defaults, and enum value sets where available. **Status 2026-06-07:**
   `packages/db/test/local-d1-schema-drift.test.ts` checks shared serving columns for type,
   nullability, default, and enum parity.
5. Add explicit JSON schemas for the JSON payloads that can reach public findings/briefs first:
   `local_context_event.payload_json`, then coverage-audit `inputs_seen/expected_json` if those are
   publicly surfaced. **Status 2026-06-07:** `local_context_event.payload_json` now validates in
   `@bp/applied-research/local-db` at event construction/parse time. Coverage-audit
   `inputs_seen_json` and `inputs_expected_json` now validate as syntactic JSON at the
   `@bp/db/local` findings repository boundary before insert or replacement; invalid payloads fail
   before any replace deletes existing rows. The persistent-speed coverage repair command now writes
   through that repository helper instead of owning raw `local_finding_coverage_audit` insert SQL.
6. Keep `readonly` local opens for read-only audits/exports and gradually route eligible commands
   through that mode. **Status 2026-06-07:** `audit source-coverage`, `audit studio-coverage`,
   and `verify d1` now use `withLocalDb({ readonly: true })`, with command-boundary tests locking
   that in. Many model/audit builders already open Bun SQLite with `{ readonly: true }` directly.
7. Keep broad FK/cascade rollout deferred; add only ownership-specific FKs when the migration
   benefit is obvious.

Acceptance:

- `bun --filter @bp/db test` builds test DBs from the live migration journal. **Covered by**
  `packages/db/test/local-migration-root.test.ts`.
- A malformed D1 seed row fails before seed SQL is emitted. **Covered by**
  `packages/db/test/d1-seed-validation.test.ts`.
- A drift between local and D1 serving mirrors fails a focused test. **Covered by**
  `packages/db/test/local-d1-schema-drift.test.ts`.

### Phase 2: Canonical data-product completeness

Purpose: replace scattered "coverage" interpretations with a single product-owned truth.

Actions:

1. Treat `DATA_PRODUCT_MANIFEST` as canonical for product completeness.
2. Expand each product with:
   - expected route universe;
   - expected month universe;
   - required upstream products;
   - producer command;
   - downstream consumers;
   - lifecycle/gap class.
   **Status 2026-06-07:** `requiredInputs` now resolve through a package-owned resolver rather
   than private classifier behavior. Inputs must be a manifest product ID, a `source_manifest:*`
   ref, a reviewed product alias, or an explicit approved external ref. The manifest test fails on
   unresolved input strings and on aliases that point at missing products, which makes dependency
   closure auditable instead of silently skipping legacy table/artifact nicknames.
3. Standardize gap classes:
   - `available_not_fetched`;
   - `upstream_blocked`;
   - `downstream_blocked`;
   - `derived_not_built`;
   - `derived_from_available_not_fetched`;
   - `derived_from_upstream_blocked`;
   - `source_absent`;
   - `waived`;
   - `unknown`.
   **Status 2026-06-07:** the applied-research completeness classifier and pipeline command output
   schema now support this vocabulary, including explicit `source_absent` lifecycle gaps.
4. Make existing coverage commands consume the registry rather than maintaining separate product
   definitions. **Status 2026-06-07:** detector corpus-grain and analysis dependency-closure now
   consume data-product completeness through the shared
   `dataProductCompletenessStatusMap()` parser instead of each maintaining a local status parser.
   Detector readiness surfaces now carry an explicit registry product ref through
   `DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE`, and tests assert those refs exist in
   `DATA_PRODUCT_MANIFEST`. Materialization coverage was already registry-backed through
   `MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE`.
   **Status 2026-06-07 follow-up:** route-bearing and month-bearing product checks now have a
   manifest integrity test requiring concrete `expectedUniverse.routes` and
   `expectedUniverse.months`. Historical segment speed, hourly ridership, and route intervention
   comparison products now declare their route universes instead of relying on row-count thresholds
   alone.
5. Materialize the latest data-product completeness result into a local table or stable artifact,
   then project the compact subset to D1/R2 for Snapshot 2.0 data notes. **Status 2026-06-07:**
   `audit data-product-completeness` writes a stable `completeness.json` artifact and source-month
   matrix from a read-only SQLite handle. The completeness artifact now validates through
   `DataProductCompletenessArtifactSchema` immediately before publication, so malformed product,
   check, coverage, root-cause, or summary shapes fail before disk write.
6. Rename or demote old audits whose names imply product completeness but only check a narrow
   surface. **Status 2026-06-07:** `analytics-materialization-coverage` now declares
   `auditScope.role = "route_surface_materialization_audit"` and points to
   `audit data-product-completeness` as the canonical product-completeness command. Its CLI summary
   also states that it audits selected materialization surfaces, not canonical completeness.
   Downstream `detector-corpus-grain` and `detector-closure` consumers now parse
   `DataProductCompletenessArtifactSchema` when a completeness artifact is present, rather than
   accepting arbitrary JSON.

Acceptance:

- One command answers: what do we have, what do we lack, what is fetchable, what is blocked, and what
  derived products are blocked.
- Snapshot 2.0, detector readiness, and materialization coverage all use the same product registry.
- No product can be called complete without declaring its expected universe, and no derived product
  can hide an unresolved upstream input behind prose or a stale table nickname.

### Phase 3: Panel specs and local DB adapters

Purpose: stop detectors from inheriting accidental query shapes.

Actions:

1. Define `PanelSpec` contracts in `@bp/applied-research` for route-month, segment-month,
   segment-daypart, treatment-event, reliability-exposure, pulse, decoupling, and source-gap
   panels.
2. Each spec declares:
   - grain;
   - entity keys;
   - time key;
   - required products;
   - eligibility rules;
   - expected coverage states;
   - negative meaning.
   **Status 2026-06-07:** built-in panel specs now use canonical `DATA_PRODUCT_MANIFEST`
   product IDs in `requiredProducts`, not raw table/artifact nicknames.
   `@bp/applied-research/feature-resolvers` now exports `PanelSpecSchema`,
   `PanelManifestSchema`, `parsePanelSpec()`, `parsePanelManifest()`, and
   `builtInPanelModelSpecsV1()`. The catalog covers all nine current model artifacts
   (`segment_speed_residuals_v1`, `segment_daypart_residuals_v1`,
   `route_peer_residuals_v1`, `reliability_exposure_panel_v1`,
   `intervention_scope_fit_v1`, `source_gap_model_v1`, `treatment_event_panel_v1`,
   `pulse_fingerprint_v1`, and `decoupling_quadrants_v1`). Tests assert every catalog spec
   declares grain, entity/time keys, measures, coverage fields, negative meaning, and registered
   required products.
3. `@bp/applied-research/local-db` implements resolvers that return typed rows plus a manifest.
   **Status 2026-06-07:** the main model-panel SQL readers now have manifest-returning
   `load*PanelV1Resolution()` wrappers: segment-month, segment-daypart, route peer residual,
   reliability-exposure ridership, pulse fingerprint, decoupling quadrants, and treatment event.
   The wrappers keep existing row loaders intact while returning a `PanelManifest` that records
   the panel spec, input query/table refs, row counts, route/entity/month counts, and limitations.
4. Keep heavy aggregation in SQLite; use `@tidy-ts/dataframe` for legible panel/statistical
   transforms once the corpus is narrowed.
5. Add focused Zod schemas for high-value raw SQL output shapes. Do not try to force
   `createSelectSchema(table)` onto aggregate queries.
   **Status 2026-06-07:** high-value aggregate SQL outputs now parse through focused Zod schemas
   before returning rows for segment-month, segment-daypart, route peer residual, reliability
   exposure ridership, pulse fingerprint, decoupling route trends/reliability, and treatment-event
   comparison rows.

Acceptance:

- A detector/model run can report exactly which panel spec and product versions fed it.
  **Covered by** the built-in panel/model catalog and panel manifest schemas.
- Fixture panel resolvers can test model logic without a SQLite file.
  **Covered by** existing model-builder tests plus `local-db-panel-resolution.test.ts`, which uses
  in-memory SQLite only.
- Local DB SQL in command files keeps shrinking toward orchestration only.
  **Covered for this slice by** package-owned panel SQL/resolution exports and pipeline-v2
  typecheck; command rewiring can now happen without inventing new query shapes.

### Phase 4: Model artifacts become detector inputs

Purpose: make detectors ask product questions instead of rediscovering statistical context.

Actions:

1. Keep the current model artifact families as the first target set:
   - `segment_speed_residuals_v1`;
   - `segment_daypart_residuals_v1`;
   - `route_peer_residuals_v1`;
   - `reliability_exposure_panel_v1`;
   - `intervention_scope_fit_v1`;
   - `source_gap_model_v1`;
   - `treatment_event_panel_v1`;
   - `pulse_fingerprint_v1`;
   - `decoupling_quadrants_v1`.
2. Detector registry entries declare required model artifacts and required data products.
   **Status 2026-06-07:** detector registry entries now expose `requiredDataProducts` derived from
   their feature grains, and applied-research tests assert every declared detector product exists in
   `DATA_PRODUCT_MANIFEST`. Detector evaluation artifacts now copy those product refs into each
   `detectorVersions[]` row alongside model artifacts.
3. Detector runners resolve model dependencies before running and emit explicit skipped/missing
   rows when dependencies are unavailable.
   **Status 2026-06-07:** `runRegistryDetectorStudy()` now checks each detector's declared
   `modelArtifacts` before dispatch. Missing model rows emit a `skipped_missing_input` coverage row
   with `reasonCode=missing_model_artifact`, `scopeKind=system`, and explicit required/missing model
   IDs in `inputsExpectedJson`. The run artifact also records `modelDependencies` and
   `dataProductDependencies`. The old inline fallbacks for source-gap, reliability-exposure,
   treatment-event, and treatment-scope model construction were removed from the detector runner;
   `findings run-detector` now loads the corresponding model artifacts from their canonical
   `@bp/applied-research/artifacts` paths when present.
4. Evaluation tracks model-backed detectors, blocked model dependencies, false-positive roots, rank
   stability, and reviewed-primary survival.

Acceptance:

- A detector cannot silently fall back from model-backed to raw-threshold behavior.
  **Covered by** detector-run dependency gating plus tests that pass old raw source-gap inputs
  without `sourceGapModelRows` and assert a missing-model coverage row instead of a candidate.
- Missing model/data-product state becomes a coverage row, not an absent candidate.
  **Covered for model artifacts.** Data-product dependencies are declared in run artifacts and still
  rely on the data-product completeness/readiness surface for upstream availability classification.
- Quality Lab reports whether the model layer improved reviewed precision and false-positive roots.

### Phase 5: Serving boundary

Purpose: keep public output page-shaped, not research-shaped.

Actions:

1. D1 stores compact indexes, statuses, summaries, route/page refs, and review-safe metadata.
2. R2 stores large route artifacts, model projections, timeline/event payloads, and chart payloads.
   **Status 2026-06-07:** `evaluate detectors` now writes the compact
   `model_artifact_serving_projection` both to its canonical research path and to
   `studio/v2/detectors/model-artifacts.json`, which is picked up by the default R2 `studio`
   publish prefix. Snapshot 2.0 validates that safe R2 payload in the Studio API without importing
   `@bp/applied-research`, exposes a `detector_model_status` projection ref, and adds a
   `detector_model_artifact_status` source-month state. The projection contains model status,
   panel ids, release row counts, route/segment counts, detector consumers, and limitations, but no
   raw model rows or candidate diagnostics.
3. Public APIs never read local SQLite or raw model artifacts.
4. Serving projections include:
   - route support level;
   - data-product coverage/gap states;
   - evidence refs;
   - caveats;
   - artifact refs;
   - freshness/release month.
5. Internal lab surfaces can expose unreviewed model/candidate diagnostics, but public route pages
   should use reviewed/promoted findings or explicitly caveated model summaries.

Acceptance:

- A route page can say "available", "not built", "blocked", or "missing because..." from the same
  data-product spine.
- Public APIs validate response contracts independently from D1 table schemas.
- D1/R2 export cost remains bounded because D1 stays narrow and large time-series payloads stay in
  R2.
  **Covered by** Snapshot 2.0's D1 route/source-month coverage rows plus R2 refs for route speed
  history, Tier 2 route evidence, route timelines, and detector model status.

### Phase 6: Performance and query-plan discipline

Purpose: make richer analytics safe to rerun.

Actions:

1. Add small query-plan/perf tests for hot panel reads:
   - route-month history;
   - segment-month panel;
   - segment-daypart panel;
   - treatment event panel;
   - reliability exposure;
   - pulse fingerprint;
   - source gap.
2. Require `EXPLAIN QUERY PLAN` snapshots or assertions for indexes used by the largest reads.
   **Status 2026-06-07:** segment-month and segment-daypart speed-panel SQL now has exported query
   handles in `@bp/applied-research/local-db`, backed by
   `local_route_segment_speed_month_route_idx` on `(month, route_id)`. A focused in-memory
   `EXPLAIN QUERY PLAN` test asserts the month-range panel reads use an index and do not regress to
   a full `local_route_segment_speed` scan. Route-filtered reads may use the table primary key
   instead, which is also an indexed search.
   **Status 2026-06-07 follow-up:** the same query-plan guard now covers pulse fingerprints,
   reliability exposure ridership rows, decoupling route trends, decoupling reliability rows, and
   intervention panel rows. New month-first local indexes back the broad panel reads for
   `local_route_hourly_ridership`, `local_route_month_trend`, and
   `local_route_intervention_comparison`; existing reliability and segment-speed indexes cover the
   other guarded reads.
   **Status 2026-06-07 final slice:** `@bp/applied-research/local-db` now owns a
   `local_db_hot_query_baselines` artifact builder and `audit local-db-query-baselines` records
   row counts, elapsed milliseconds, `EXPLAIN QUERY PLAN` lines, index-use flags, and full-scan
   warnings for route-month history, segment-month, segment-daypart, route-peer residual,
   treatment-event, reliability-exposure, pulse-fingerprint, decoupling, and artifact-backed
   source-gap panels. A March 2026 read-only smoke run against `data/local/pipeline.sqlite` found
   the live DB had not applied the schema-declared month-first indexes; after applying
   `CREATE INDEX IF NOT EXISTS` for segment speed, hourly ridership, route month trend, and route
   intervention comparison, the smoke baseline reported 10 queries, 9 measured SQL reads, 1
   artifact-backed source-gap panel, 0 errors, and 0 full-scan warnings.
   A full-window run for 2023-04 through 2026-03 also passed with 0 full-scan warnings; rough
   measured row/runtime baselines were: segment-month 153,479 rows in 14.8s, segment-daypart
   520,825 rows in 20.3s, pulse fingerprint 3,015,641 rows in 16.4s, treatment events 20,796 rows
   in 9.6ms, route-month trend/residual/decoupling reads about 13,154 rows in 2.7-3.4ms, and
   decoupling reliability 13,716 rows in 29.3ms.
3. Add indexes only after measuring the query that needs them.
4. Prefer materialized local tables or artifacts over SQLite views for expensive/reused derived
   reads.
5. Introduce SQL views only when all are true:
   - the read is duplicated in several places;
   - it is cheap enough not to materialize;
   - a typed/validatable handle is useful.

Acceptance:

- A schema/index change cannot accidentally turn core model builds into obvious full scans.
- Hot models have rough runtime/row-count baselines.
- Views remain rare and justified.

### Phase 7: Boundary enforcement and docs

Purpose: keep the split alive after this refactor.

Actions:

1. Extend architecture tests:
   - `@bp/analytics` cannot import `@bp/db`, `@bp/applied-research`, filesystem, or dataframe runtime
     unless explicitly approved;
   - public runtime cannot import `@bp/applied-research` or `@bp/db/local`;
   - command files should not contain new reusable SQL shapes if an applied-research/local-db helper
     already exists.
   **Status 2026-06-07:** `tests/harness/production-boundaries.test.ts` now enforces the
   analytics purity rule and public-runtime `@bp/applied-research`/`@bp/db/local` import ban.
2. Add README sections for:
   - `@bp/db` storage ownership;
   - `@bp/applied-research/local-db` panel extraction ownership;
   - data-product completeness ownership.
   **Status 2026-06-07:** `packages/db/README.md`, `packages/applied-research/README.md`, and
   `packages/analytics/README.md` now document these ownership rules and purity constraints.
3. Add a code-review checklist:
   - What is the expected universe?
   - What product/gap state is represented?
   - What validation boundary protects this?
   - Is this public-serving, internal-lab, or local-only?
   - Does this belong in DB, applied research, analytics, or pipeline orchestration?
   **Status 2026-06-07:** [[wiki/engineering/package_structure]] now includes the
   Analytics / Local DB review checklist, including SQLite safety.
4. Keep `knowledge/index.md` and `knowledge/log.md` updated whenever these boundaries change.

Acceptance:

- New analytics work has an obvious home.
- New DB tables declare whether they are source, derived local, serving projection, review artifact,
  or coverage/product state.
- Review focuses on correctness gates instead of arguing about folder placement every time.

## What not to do

- Do not move all SQL into `@bp/db`. That would make `@bp/db` the analytics package by accident.
- Do not make `@bp/analytics` a database client or dataframe app.
- Do not add a generic declarative DB client before the panel specs prove what abstraction is
  needed.
- Do not add a blanket SQL view layer.
- Do not validate every internal row with Zod; validate crossings and high-value untyped outputs.
- Do not add Postgres/PostGIS/Python to solve ownership confusion. Escalate storage only for a
  measured requirement and record the decision.

## Implementation order

Recommended sequence:

1. Fix local DB migration-test drift.
2. Wire D1 seed validation and add local/D1 drift check.
3. Promote data-product completeness to the canonical coverage spine.
4. Make panel specs/manifests first-class for the 9 current model artifacts.
5. Add model dependency gates to detector execution.
6. Project compact data-product/status surfaces to Snapshot 2.0.
7. Add query-plan/perf gates for the hot panel reads.
8. Add boundary tests and README/checklist updates so the split stays enforceable.

## Success criteria

This plan is working when:

- tests and runtime use the same local schema journal;
- seed/export rejects malformed public-serving rows before D1 load;
- there is one authoritative answer for data coverage/product completeness;
- every model artifact states its input panel, product dependencies, and searched universe;
- detector clean no-hits distinguish "searched and clean" from "missing input";
- false-positive roots decline in reviewed detector sets;
- public routes can surface honest availability and caveats without reading research internals;
- package boundaries catch the next mistake before it becomes another long audit.
