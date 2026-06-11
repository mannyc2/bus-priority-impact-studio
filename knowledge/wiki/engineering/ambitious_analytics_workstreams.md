---
title: Ambitious Analytics Workstreams
type: engineering
status: active
last_updated: 2026-05-31
owner: codex
source_count: 0
tags: [analytics, detectors, serving, corpus, codex-prompts, roadmap]
---

# Ambitious Analytics Workstreams

## Purpose

This page turns the 2026-05-31 audit of `packages/analytics`, `tools/pipeline-v2`, `apps/web`,
`packages/domain`, local artifacts, and the active backfill into copy-ready work packages for one
or more Codex sessions.

The active route-schedule backfill should continue running independently. These workstreams are the
most valuable project work that can proceed while the corpus is being fetched or retried.

## Coordination Rules

Use one Codex session per workstream when possible. If several sessions run at once, keep write
sets disjoint and announce the active workstream in the first message.

Global rules for every session:

- Read `CLAUDE.md`, `knowledge/index.md`, this page, and the linked workstream docs first.
- Keep `packages/analytics` pure: no filesystem, DB, network, Worker, app, prompt, or sandbox code.
- Keep pipeline IO in `tools/pipeline-v2`.
- Keep public request handlers out of pipeline/analytics internals.
- Do not add Python, pnpm, FastAPI, hosted Postgres/PostGIS, or VPS dependencies.
- Do not put local personal absolute filesystem paths in docs, logs, prompts, artifacts, or user
  output. Use repo-relative paths in written material.
- Do not treat missing data as no issue. Every new detector/materialization path needs explicit
  coverage or missing-data states.
- Before declaring done, run the smallest relevant Bun verification and report failures honestly.

## Scoring Model

Rank work by a 0-1,000 weighted opportunity score:

```text
overall =
  0.18 * strategic_leverage +
  0.16 * detector_quality +
  0.14 * corpus_unlock +
  0.14 * serving_value +
  0.12 * completeness_closure +
  0.10 * elegance +
  0.08 * risk_reduction +
  0.08 * feasibility
```

The optimization loss for a workstream is:

```text
loss = 1000 - overall
```

Soft dimensions are still scored numerically so the project can compare otherwise fuzzy choices.
`elegance` means fewer special cases, clearer ownership, less duplicated code, stronger contracts,
and better future optimization surfaces.

## Ranked Workstreams

| Rank | Workstream | Score | Loss | Primary value |
|---:|---|---:|---:|---|
| 1 | Registry-driven detector operating system | 945 | 55 | Make detector registry govern execution, coverage, policy, docs, and publication gates. |
| 2 | Serving Snapshot 2.0 | 925 | 75 | Make the public site reflect the richness of the corpus without overclaiming. |
| 3 | Data product completeness registry | 900 | 100 | Track derived tables/artifacts with the same discipline as source manifests. |
| 4 | Detector Quality Lab and soft-loss optimizer | 890 | 110 | Give detector quality, novelty, safety, and elegance a measurable loss surface. |
| 5 | Pipeline-v2/docs drift cleanup | 835 | 165 | Remove stale v1 assumptions, broken checks, giant modules, and demo-shaped residue. |
| 6 | Research-to-detector hardening | 820 | 180 | Translate literature into stronger detector math, gates, and backtests. |

## Post-Orchestration Status And Next Wave

The first orchestration pass on 2026-05-31 launched and integrated scoped Codex sessions for the
original high-priority workstreams:

- **Workstream 1 / Detector registry and policy:** scoped completion. All 18 registered detectors now
  have calibration/readiness policies or waivers; current blockers are data-readiness blockers, not
  policy gaps.
- **Workstream 3 / Data-product completeness registry:** scoped completion. The registry now covers
  54 products across source-derived tables, artifacts, score vectors, serving outputs, docs outputs,
  publish artifacts, and known blocked/fetching products.
- **Workstream 5 / Verification drift cleanup:** scoped completion, not project-wide completion.
  Focused package/build/performance gates are improved, but root `check:types` still fails across
  web brief/admin API contracts, exact optional Studio intervention typing, branded test fixtures,
  and loose pipeline-v2 scripts.

The coverage-control goal is intentionally still open: route-schedule backfill, resume retries, and
the queued derived-product runner are still active. Do not mark the broader external-data coverage
work complete until the final audits show the remaining fetching, partial, missing, and blocked
products are resolved or explicitly waived.

The next highest-value workstreams are:

| Rank | Next-wave workstream | Why now | Suggested session count |
|---:|---|---|---:|
| 1 | Serving Snapshot 2.0 execution | The site still under-represents the corpus; route pages and APIs need full-route-aware, missing-data-honest serving behavior. | 1 |
| 2 | Root typecheck and API-contract cleanup | `check:types` is the clearest remaining verification debt and blocks honest "green repo" claims. | 1 |
| 3 | Detector Quality Lab implementation | Gives detector improvement a measurable loss surface and supports Ralph/Codex detector iteration. | 1 |
| 4 | Research-to-detector hardening | Turns the literature spec into stronger detector math, counter-evidence, fixtures, and validation gates. | 1-2 |
| 5 | Drizzle query modernization preflight | A planned modernization can reduce DB/query drift, but should start with inventory and low-risk schema mirroring before dependency upgrades. | 1 |
| 6 | Pipeline-v2 module/CLI complexity reduction | Continue Workstream 5 by shrinking monoliths and retiring stale v1 docs/scripts without changing behavior. | 1 |

Recommended immediate parallel set: start **three** sessions, one each for Serving Snapshot 2.0,
root typecheck cleanup, and Detector Quality Lab. Start Drizzle modernization after the typecheck
cleanup has settled, because DB/API contract churn can otherwise obscure failures.

## Parallelization Map

| Workstream | Can start now? | Good parallel slices | Avoid touching at same time |
|---|---|---|---|
| 1. Detector OS | Yes | Registry/domain drift; calibration policy expansion; registry-driven materialization audit | Same detector files another session is editing |
| 2. Serving Snapshot 2.0 | Yes | Worker/API truthfulness; route-detail full-route fallback; frontend richness components | Domain Studio schemas if another session owns them |
| 3. Completeness Registry | Yes | Data-product manifest schema; audit command; docs/runbook integration | Same audit commands as workstream 1 unless coordinated |
| 4. Quality Lab | Yes | Pure analytics scoring module; artifact builder; docs/test fixtures | Detector scoring math in workstream 6 unless coordinated |
| 5. Drift Cleanup | Yes | Root scripts/tests; docs stale references; large-module splits | Package.json/check scripts another session is editing |
| 6. Research Hardening | Yes | Speed decomposition; schedule mismatch; intervention gates; positive deviance/bunching | Calibration policy files if workstream 1 owns them |

Recommended first pairing:

1. Run workstream 3 to define data-product completeness.
2. Run workstream 1 in parallel on registry/domain/policy drift.
3. Let workstreams 2, 4, 5, and 6 start once their write sets are clear.

## Workstream 1: Registry-Driven Detector Operating System

**Score:** 945

### Audit Basis

- `packages/analytics/src/registry/detectors.ts` registers 18 detectors.
- `packages/domain/src/schemas.ts` still documents only the older 8 detector IDs in
  `KNOWN_DETECTOR_IDS`.
- `packages/analytics/src/calibration/detector-policy.ts` covers only 5 detector families.
- `tools/pipeline-v2/src/commands/audit/analytics-materialization-coverage.ts` and
  `analytics-detector-readiness.ts` use hand-authored surface lists instead of the full registry.

### Target Outcome

The analytics registry becomes the governing object for detector identity, feature grains,
calibration policy, materialization expectations, readiness, claim-tier gates, and generated docs.

### Deliverables

- Domain detector/reason-code documentation generated or validated from the analytics registry.
- Calibration/readiness policies for all active detectors, or explicit `policy_pending` states.
- Registry-driven materialization coverage by detector feature grain.
- A detector run/readiness packet shape that says what each detector looked for, found, skipped, or
  could not evaluate.
- Wiki updates describing registry ownership and how publication gates are enforced.

### Copy-Ready Codex Prompt

```text
Workstream: Registry-driven detector operating system.

Goal: Make the analytics detector registry the governing source for detector identity,
calibration/readiness policy, materialization expectations, and docs. Start by auditing drift
between packages/analytics registry metadata, packages/domain detector/reason-code docs, pipeline-v2
readiness/materialization audits, and the wiki. Then implement the smallest coherent slice that
moves the repo toward registry-governed detector operation.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/ambitious_analytics_workstreams.md
- knowledge/wiki/engineering/analytics_architecture.md
- knowledge/wiki/engineering/analytics_detector_calibration.md
- knowledge/wiki/analysis/ideal_detector_system.md
- docs/decisions/0012-agent-authored-detectors.md

Important constraints:
- Keep packages/analytics pure.
- Do not add IO, DB, network, Worker, prompt, sandbox, or app code to packages/analytics.
- Do not put personal absolute filesystem paths in docs or output.
- Preserve unrelated dirty worktree changes.

Suggested implementation path:
1. Audit the 18 registered detectors against packages/domain KNOWN_DETECTOR_IDS and documented
   reason codes.
2. Add a test that fails when registry detector IDs drift from the documented domain list or the
   generated detector spec artifact path.
3. Expand calibration/readiness coverage for detectors currently missing policies, or add explicit
   policy_pending metadata and pipeline audit output so absence is visible.
4. Refactor readiness/materialization audits toward registry feature-grain metadata rather than
   hard-coded partial detector lists.
5. Update the relevant wiki pages with the new source of truth and verification command.

Verification:
- Run focused package tests for analytics/domain changes.
- Run the relevant pipeline-v2 audit test if you touch audit commands.
- If a broad check is blocked by pre-existing drift, report the exact blocker.
```

## Workstream 2: Serving Snapshot 2.0

**Score:** 925

### Audit Basis

- March 2026 materialization has 9 audited surfaces: 4 complete, 5 partial.
- May 2026 materialization has 9 audited surfaces: 0 complete, 1 partial, 8 missing.
- `/api/v1/studio/routes` can use D1 route cards, but route details still rely on release-static R2
  projections.
- Worker route cards synthesize values such as scheduled speed, sparkline, miles, and rider-hours
  lost.
- Route-list copy refers to week-over-week decline even though the backing data is monthly.

### Target Outcome

The serving snapshot is an explicit, audited bundle of what the site can honestly present. The
public route experience should cover the full public route universe where compact D1 data exists,
degrade cleanly when detailed R2 projections are missing, and surface richer existing axes without
invented values.

### Deliverables

- A serving snapshot manifest with route count, route-detail count, brief count, finding count,
  observed/current-signal months, detector-feature coverage, and caveats.
- Route detail/API behavior that is full-route aware and missing-data honest.
- Removal or explicit labeling of synthesized fields in Worker/frontend route cards.
- Product richness improvements using existing data: route map, route daypart grid, direction
  split, headway histogram, or context strip.
- Updated website/support docs and tests.

### Copy-Ready Codex Prompt

```text
Workstream: Serving Snapshot 2.0.

Goal: Make the public Studio serving snapshot accurately reflect the data corpus and stop hiding
rich data behind partial release projections. Audit the Worker, Studio schemas, route pages, R2/D1
projection builders, and materialization coverage outputs. Then implement a coherent slice that
makes route serving more complete, more truthful, or richer without overclaiming.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/ambitious_analytics_workstreams.md
- knowledge/wiki/engineering/serving_storage_split_plan.md
- knowledge/wiki/engineering/web_api_endpoint_architecture.md
- knowledge/wiki/engineering/website_data_support_audit.md
- knowledge/wiki/engineering/information_richness_audit.md
- knowledge/wiki/engineering/synthetic_data_inventory.md

Important constraints:
- apps/web must not import packages/analytics, packages/sources, tools/pipeline-v2, or knowledge.
- Worker handlers read D1/R2 serving projections only.
- Missing sections should return designed unavailable/quality states, not sample data.
- Do not put personal absolute filesystem paths in docs or output.

Suggested implementation path:
1. Audit apps/web/src/worker/index.ts, Studio route schemas, and route pages for synthesized or
   stale claims.
2. Define or extend a serving snapshot manifest/projection that records public route coverage,
   detail coverage, brief/finding coverage, current signal month, and caveats.
3. Pick one high-value route-page richness upgrade already supported by local/R2 data, such as a
   real route map, daypart profile, direction split, or headway histogram.
4. Add Worker/frontend tests that prove missing detailed projections do not imply missing route
   identity or fabricated metrics.
5. Update website docs with the new serving contract.

Verification:
- Run focused Worker tests if Worker/API code changes.
- Run focused web tests/build checks if frontend/schema code changes.
- Run materialization/coverage audit commands if projection coverage changes.
```

## Workstream 3: Data Product Completeness Registry

**Score:** 900

### Audit Basis

- `knowledge/raw/source_manifest.yaml` tracks source datasets well.
- There is no equivalent manifest for derived products: local tables, artifact families, serving
  projections, detector feature artifacts, score vectors, and release manifests.
- `analytics-backfill-coverage` currently audits only three backfill surfaces.
- `analytics-corpus-profile` currently profiles only ten observation groups and misses newer
  schedule, ABST, GTFS-static, feature-artifact, and serving-output products.

### Target Outcome

The project can answer four questions deterministically:

1. What source data exists?
2. What derived data products should exist?
3. Which products are complete, partial, missing, stale, blocked, or actively being fetched?
4. Which detectors, serving routes, and briefs are blocked by each missing product?

### Deliverables

- A data-product manifest schema for local tables, artifact families, score vectors, serving
  projections, and release manifests.
- A pipeline-v2 audit that joins the manifest to actual SQLite/artifact state.
- Status vocabulary that distinguishes `complete`, `partial`, `missing`, `stale`, `waived`,
  `blocked`, and `fetching`.
- Docs/runbook updates so future backfills register expected products before work starts.
- Optional generated Markdown summary for humans and prompt bundles for Ralph/Codex.

### Copy-Ready Codex Prompt

```text
Workstream: Data product completeness registry.

Goal: Add a derived-data-product registry that complements knowledge/raw/source_manifest.yaml. The
registry should track local tables, generated artifacts, score vectors, detector feature surfaces,
and serving projections, then provide an audit that reports complete/partial/missing/stale/fetching
state and downstream blockers.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/ambitious_analytics_workstreams.md
- knowledge/wiki/engineering/analytics_corpus_profile.md
- knowledge/wiki/engineering/analytics_backfill_runbook.md
- knowledge/wiki/engineering/information_richness_audit.md
- docs/architecture/data-corpus-overview.md
- knowledge/raw/source_manifest.yaml

Important constraints:
- Keep source manifests and derived-product manifests conceptually separate.
- Do not claim source availability means derived product completeness.
- Do not put personal absolute filesystem paths in docs or output.
- Pipeline-v2 owns DB/artifact reads and writes.

Suggested implementation path:
1. Design a small typed manifest format for derived products: product id, kind, owner, grain,
   producer command, expected universe, required inputs, downstream consumers, freshness policy,
   and waiver/fetching state.
2. Seed it with current high-value products: route segment speed, hourly ridership, intervention
   comparisons, GTFS static schedules, Socrata route schedules, ABST score vectors,
   stop-direction-hour EWT artifacts, Studio route projections, map/evaluation/brief manifests.
3. Add a read-only pipeline-v2 audit that compares expected products to local SQLite tables and
   artifact paths.
4. Update analytics corpus/materialization docs to point to this registry as the completeness
   source of truth.
5. Add focused tests with tiny fixture tables/artifacts.

Verification:
- Run the new audit test.
- Run any existing audit tests you touch.
- If broad docs checks are blocked by old pipeline-v1 drift, report the blocker.
```

## Workstream 4: Detector Quality Lab And Soft-Loss Optimizer

**Score:** 890

### Audit Basis

- `packages/analytics/src/calibration/gold-set.ts` currently reports only TP/FP/TN/FN.
- `packages/analytics/src/calibration/score-vectors.ts` currently reports only counts, score
  min/max, flagged share, and Jaccard overlap.
- There is no unified detector quality score for precision, recall, novelty, evidence quality,
  counter-evidence quality, causal safety, stability, reviewer value, or elegance.

### Target Outcome

Every detector version can be scored against a multi-factor 0-1,000 quality model and optimized
against a numeric loss. This gives Ralph, Codex, and human reviewers a shared way to compare detector
changes beyond "this sounds better."

### Deliverables

- Pure analytics quality-score module and tests.
- Quality dimensions for statistical performance, coverage honesty, evidence completeness,
  counter-evidence quality, causal safety, novelty, stability, reviewer utility, and elegance.
- Weighted score and `loss = 1000 - score`.
- Threshold/version comparison artifact shape.
- Pipeline-v2 artifact builder over detector score vectors and reviewer/gold-set inputs.
- Wiki documentation on interpreting scores without pretending soft metrics are objective truth.

### Copy-Ready Codex Prompt

```text
Workstream: Detector Quality Lab and soft-loss optimizer.

Goal: Build the first pure analytics model for detector quality scoring. It should turn hard metrics
and soft review dimensions into a 0-1,000 weighted score plus optimization loss. Start with typed
inputs and tests in packages/analytics, then add a pipeline-v2 artifact builder only if the pure
module is solid.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/ambitious_analytics_workstreams.md
- knowledge/wiki/analysis/ideal_detector_system.md
- knowledge/wiki/engineering/analytics_detector_calibration.md
- docs/decisions/0012-agent-authored-detectors.md
- packages/analytics/src/calibration/*

Important constraints:
- packages/analytics stays pure and deterministic.
- Soft scores are review aids, not proof of truth.
- Do not change detector thresholds in the same slice unless the quality packet proves why.
- Do not put personal absolute filesystem paths in docs or output.

Suggested implementation path:
1. Add a pure `DetectorQualityScore` model with dimensions, weights, score, loss, and caveats.
2. Extend gold-set summaries with precision, recall, F1, specificity, and false-positive rate.
3. Add novelty/stability helpers using score vectors and overlap/rank-style comparisons.
4. Add an elegance/complexity input that can be scored from reviewer-entered or static analysis
   fields, not magic.
5. Write tests with fixture detectors showing a high-quality detector, a noisy detector, a
   high-recall review-queue detector, and a causally unsafe detector.
6. Optionally add a pipeline-v2 command that writes a detector-quality artifact from existing
   score-vector/gold-set/reviewer inputs.

Verification:
- Run focused analytics calibration tests.
- Run pipeline-v2 tests only if adding an artifact command.
```

## Workstream 5: Pipeline-v2 And Docs Drift Cleanup

**Score:** 835

### Audit Basis

- `tests/harness/production-boundaries.test.ts` had drifted to `tools/pipeline/package.json`; the
  first Workstream 5 slice retargeted it to the `@bp/pipeline-v2` CLI wrapper.
- Root `package.json` had scripts pointing at deleted or stale `tools/pipeline/src/checks/*` paths;
  the first Workstream 5 slice retargeted lightweight checks to `tools/pipeline-v2/src/checks/`.
- Many wiki pages still describe old `@bp/pipeline` / pipeline-v1 commands as current.
- Complexity hotspots include `tools/pipeline-v2/src/commands/docs/tier2/_shared.ts`,
  `apps/web/src/worker/index.ts`, and `apps/web/src/studio/sample-data.ts`.

### Target Outcome

The repo's tests, scripts, and docs should agree that `tools/pipeline-v2` is canonical. Stale v1
references should be either removed, marked historical, or converted. Giant modules should be split
when doing so reduces real complexity without changing behavior.

### Deliverables

- Fixed production-boundary harness for pipeline-v2.
- Root scripts updated to existing v2 commands or removed if obsolete.
- Wiki pages that still mention old commands marked historical or updated.
- One or more focused module splits with no behavioral change.
- Verification notes listing any remaining intentionally historical docs.

### Copy-Ready Codex Prompt

```text
Workstream: Pipeline-v2 and docs drift cleanup.

Goal: Remove or quarantine stale pipeline-v1 assumptions from tests, root scripts, and docs. Then
make one targeted complexity reduction where it lowers future maintenance risk without changing
behavior.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/ambitious_analytics_workstreams.md
- knowledge/wiki/engineering/package_structure.md
- knowledge/wiki/engineering/testing_standards.md
- tools/pipeline-v2/migration-plan.md
- tests/harness/production-boundaries.test.ts
- package.json

Important constraints:
- Do not delete historical docs unless the project convention supports it; prefer explicit
  historical labels for old evidence.
- Do not change pipeline behavior while doing script/doc cleanup unless required by tests.
- Keep package boundary tests meaningful.
- Do not put personal absolute filesystem paths in docs or output.

Suggested implementation path:
1. Run the production boundary harness and confirm current failures.
2. Update the harness and root scripts to reference tools/pipeline-v2 or documented orchestration
   commands.
3. Use rg to inventory stale `tools/pipeline`, `@bp/pipeline`, and `check:pipeline-v1` references.
4. Update high-traffic docs first: wiki index, CLI commands, package structure, testing standards,
   methodology validation.
5. Pick one low-risk large-module split, such as extracting Worker Studio route handlers or Tier 2
   shared helpers, and keep tests passing.

Verification:
- Run production-boundary tests.
- Run focused checks for any touched package.
- Report any remaining stale references that are intentionally historical.
```

## Workstream 6: Research-To-Detector Hardening

**Score:** 820

### Audit Basis

- `knowledge/wiki/analysis/bus-reliability-detectors-spec.md` defines literature-backed detector
  families, thresholds, missing-data states, claim tiers, and validation plans.
- The registry has implementations, but not every detector has equal calibration, score-vector,
  feature-materialization, or method-gate maturity.
- Schedule mismatch remains blocked until schedule/runtime baselines are complete and recognized by
  readiness audits.
- Intervention methods need divergence flags and human-gated causal language.

### Target Outcome

The literature review becomes stronger detector math, stronger feature contracts, and stronger
validation gates. The system should improve detector quality by precision, coverage honesty,
counter-evidence quality, claim safety, and reviewer usefulness.

### Deliverables

- Detector-by-detector gap matrix from literature spec to actual registry implementation.
- Hardening patches for one detector family at a time: speed decomposition, schedule mismatch,
  bunching, positive deviance, intervention event study, or context correlation.
- Backtests or fixtures covering false positives and missing-data states.
- Updated docs on claim language and validation gates.
- Calibration hooks or score-vector output where relevant.

### Copy-Ready Codex Prompt

```text
Workstream: Research-to-detector hardening.

Goal: Use the bus reliability detector literature spec to improve one detector family deeply. Start
by comparing the spec to the actual registry implementation, feature contracts, tests, calibration
policy, and pipeline materializers. Then implement one high-quality hardening slice with tests and
docs.

Read first:
- CLAUDE.md
- knowledge/index.md
- knowledge/wiki/engineering/ambitious_analytics_workstreams.md
- knowledge/wiki/analysis/bus-reliability-detectors-spec.md
- knowledge/wiki/analysis/ideal_detector_system.md
- knowledge/wiki/engineering/analytics_architecture.md
- knowledge/wiki/engineering/analytics_detector_calibration.md
- packages/analytics/src/registry/*
- packages/analytics/src/findings/*

Important constraints:
- Do not auto-publish causal claims.
- Every detector must emit evidence, counter-evidence, coverage, caveats, and missing-data states.
- Keep structured math deterministic and auditable.
- Do not put personal absolute filesystem paths in docs or output.

Suggested implementation path:
1. Choose exactly one detector family for the first slice.
2. Write a short gap matrix: spec requirement, current code state, missing tests, missing features,
   missing calibration, and false-positive risks.
3. Implement the smallest deep improvement, such as:
   - speed/pace systematic-vs-stochastic decomposition and score vectors;
   - schedule mismatch service-period/version gates;
   - bunching black-spot propagation caveats;
   - positive deviance reciprocal-metric checks;
   - intervention event-study divergence flags;
   - context-correlation reporting-bias caveats.
4. Add fixture-backed tests for both hit and suppression behavior.
5. Update the detector spec or calibration docs with the implemented gate.

Verification:
- Run focused analytics tests for the detector.
- Run pipeline materializer tests if feature inputs change.
- Report any method assumptions that still need external review.
```

## Session Assignment Suggestions

For two sessions:

- Session A: workstream 3, then feed its manifest vocabulary into workstream 1.
- Session B: workstream 5, then start the truthfulness portion of workstream 2.

For three sessions:

- Session A: workstream 3 data-product registry.
- Session B: workstream 1 detector registry/policy drift.
- Session C: workstream 2 serving snapshot truthfulness or workstream 5 drift cleanup.

For five or six sessions:

- Run all workstreams, but reserve `packages/domain/src/studio-schemas.ts`, root `package.json`,
  and pipeline audit commands for one owner at a time.

## Definition Of Done

A workstream is done only when:

- the implemented slice is documented;
- tests or audits prove the new behavior;
- missing data is represented explicitly;
- public wording remains within claim-strength gates;
- wiki/index/log entries point to the new source of truth;
- known blockers are named with exact follow-up commands or files.
