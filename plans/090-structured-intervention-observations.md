# Plan 090: Materialize typed intervention-relevance specs and route observation bundles

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Required exact-identity check (run before the drift check)**: the Tracker
> half of MTA Wiki Plan 035, task
> `019f7640-fd5c-7be2-8a40-a7c264284c0f`, must be merged. These commands must
> exit 0:
>
> ```sh
> test -f tools/pipeline-v2/src/lib/mta-wiki-route-identities.ts
> test -f tools/pipeline-v2/test/mta-wiki-route-identities.test.ts
> test -f tools/pipeline-v2/test/studio-mta-wiki-route-evidence-v2.test.ts
> bun test tools/pipeline-v2/test/mta-wiki-route-identities.test.ts tools/pipeline-v2/test/studio-mta-wiki-route-evidence-v2.test.ts packages/domain/test/studio-route-identity-presentation.test.ts apps/web/test/shared/route-badge.test.ts --timeout 5000
> ```
>
> Expected: manifest-v5/exact-route fixtures pass, including distinct B44 and
> B44+ bundles. Commit `27ceded6` is only the historical rc23-capable base on
> which this plan was first written; it is not sufficient after the exact
> identity defect was discovered.
>
> **Dependency check (run next)**: Plan 091 and the Generation 11 rows for
> plans 084, 088, 085, and 086 in `plans/README.md` must all say `DONE`.
> Plan 091 supplies exact canonical treatment/occurrence IDs and the shared
> presentation family crosswalk. Generation 11 establishes the publication-
> event, `publishedAt`, and coverage-window vocabulary used below.
>
> **Drift check**:
> `git diff --stat 27ceded6..HEAD -- packages/analytics/package.json packages/analytics/src/data-products packages/analytics/src/features packages/analytics/src/feature-history packages/analytics/src/interventions packages/domain/package.json packages/domain/src/studio packages/db/src/local/schema.ts tools/pipeline-v2/src/cli tools/pipeline-v2/src/commands/studio tools/pipeline-v2/src/lib/local-db-aggregates tools/pipeline-v2/src/lib/study-engine tools/pipeline-v2/test knowledge/index.md knowledge/log.md knowledge/wiki/engineering`
> Changes made by the required dependency plans are expected. Compare the
> symbols and invariants in "Current state" to the live post-dependency code.
> If a named table, product id, feature resolver, artifact path convention, or
> rc23 approval invariant no longer exists with equivalent semantics, stop and
> report the drift.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (new cross-package artifact contract and offline materializer;
  bounded by a closed registry, strict schemas, fixture-backed tests, and no
  public UI or causal calculations in this plan)
- **Depends on**: `plans/091-route-intervention-inventory.md` (HARD),
  `plans/084-retire-month-anchors-doctrine.md`,
  `plans/088-month-doctrine-gate.md`, `plans/085-demonth-serving-contract.md`,
  and `plans/086-demonth-release-identity.md` (all HARD), plus the Tracker
  exact-route task `019f7640-fd5c-7be2-8a40-a7c264284c0f`. Plan 075's UI code
  has landed but activation remains blocked by its recorded gates; it remains
  the authority for study-result presentation.
- **Category**: direction
- **Planned at**: workspace commit `b41169df` on 2026-07-18; rc23 contracts
  verified against `origin/main` commit `27ceded6`
- **Binding amendment**: commit `ac940967`, 2026-07-18; exact-route and Plan
  091 dependencies supersede the historical rc23 identity premise

## Binding amendment — consume exact route/treatment identity (2026-07-18)

This amendment controls wherever the historical text below conflicts with
it. Plan 090 remains the narrow ACE observation foundation, but it must not
create a parallel treatment or route-normalization path.

1. Consume Plan 091's canonical treatment kind/family and stable treatment/
   occurrence IDs. `normalizeRouteTreatmentType` may remain an internal
   compatibility adapter for old analytics rows, but it is not the new
   observation contract's authority.
2. Resolve route keys through the exact identity/presentation contract landed
   by the external task. Do not call a slug helper that strips, adds, or
   aliases `+`, `-SBS`, zero padding, branch letters, or service variants.
3. Use only Plan 091 occurrences that retain the existing full trusted
   registry admission facts for ACE. Exporting the shared study gate must
   remain behaviorally identical; inventory displayability alone does not
   authorize an observation or study.
4. `StudioRouteInterventionObservationBundle` references Plan 091 occurrence
   and treatment IDs but does not copy projects/current-state/source gaps or
   merge the inventory and observation schemas.
5. Unsupported families remain explicit in Plan 090. Plan 093 is the separate
   reviewed expansion; do not broaden this plan opportunistically.

## Why this matters

The app can currently tell a reader that an intervention happened and, for a
small approved subset, show a gated study. It cannot programmatically answer
the broader question "which of our own data products are relevant to this
kind of intervention, and what did those observations look like around the
implementation date?" UI code therefore either stops at source-text claims or
derives chart annotations from display text. This plan introduces a typed,
value-blind relevance registry and deterministically resolves it against the
existing local corpus into small per-route artifacts. Plan 082 then consumes
those artifacts for the first route-chart marker slice; source evidence still
establishes what/when/where, and only a gated `StudyArtifact` may support a
causal effect claim.

The central anti-bias rule is binding: **metric selection occurs from treatment
family, scope, product metadata, and coverage requirements before observation
values are inspected.** A speed increase, decline, or null result must never
change which series is selected or its presentation priority.

## Current state

### Four lanes that must remain separate

| Lane | Existing/new authority | What it may assert |
|---|---|---|
| Event anchor | strictly decoded Plan 091 occurrence + treatment rows, including exact route identity and optional local-registry lineage | What happened, on which route, when, and from which reviewed source |
| Relevance spec | **new** `@bp/analytics/intervention-evidence` registry | Which canonical products/metrics are relevant, their role, scope policy, display window, and claim ceiling |
| Observation bundle | **new** `@bp/domain/studio/intervention-observations` artifact, materialized offline | The actual time-series values, null gaps, coverage, and provenance for the selected bindings |
| Causal study | existing `StudyArtifact` / route studies artifacts from plans 074-075 | A gated estimate, confidence interval, direction, and study verdict |

Do not merge these lanes into one schema. In particular, the observation
bundle must not grow `beforeMean`, `afterMean`, `delta`, `effectEstimate`,
`direction`, or `verdict` fields.

### Existing contract inventory

- `packages/analytics/src/feature-history/panel-spec.ts` defines `PanelSpec`
  with `grain`, `timeKey`, `entityKeys`, `measures`, `joins`, `coverage`,
  `historyWindow`, `requiredProducts`, `eligibilityRules`, and
  `negativeMeaning`. This proves the repo already models data prerequisites
  explicitly. Do not turn the new registry into a free-form query language or
  duplicate `PanelSpec`; the new spec is a smaller, presentation-oriented
  binding registry that references canonical product/feature ids.
- `packages/analytics/src/data-products/registry.ts` declares each product's
  id, owner, grain, producer command, expected universe, required inputs,
  downstream consumers, freshness policy, and checks. The relevant existing
  products at the rc23 base are:
  - `local_route_month_trends_history` — `local_route_month_trend`, route ×
    month, speed and ridership history.
  - `local_intervention_events_release` — trusted route intervention events,
    retained as source lineage inside Plan 091 inventory occurrences.
  Plan 086 may update their descriptions/vocabulary but is not expected to
  change these ids. If it does, use the live equivalent ids only after
  reporting the rename.
- `packages/analytics/src/features/contracts.ts` declares
  `route_metric_history` with resolver id
  `sqlite.local_route_month_trend.history.v1`, retained month/coverage axes,
  and source table `local_route_month_trend`. Obtain it through
  `getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN)`; never copy its
  resolver string into multiple registries without a consistency test.
- `packages/db/src/local/schema.ts` defines:

```text
local_intervention_event:
  event_id, route_id, intervention_type, source_id, program,
  implementation_date, implementation_month, event_status, description

local_route_month_trend:
  route_id, month, speed_observation_count, speed_bus_trip_count,
  average_speed_mph, ridership, transfers,
  has_speed_trend, has_ridership_trend
```

  The ridership producer sums MTA route ridership rows by route and calendar
  month (`tools/pipeline-v2/src/commands/ingest/route-trends.ts`); its honest
  public label is "Monthly riders", not estimated daily riders.
- `tools/pipeline-v2/src/lib/study-engine/study-events.ts` already has the
  full trusted-registry admission semantics inside private `registryDrafts`:
  source must be `mta_ace_routes` or `nyc_dot_bus_lanes`; status must be
  `implemented`; `studyTreatmentFamily` must recognize the family; the
  implementation date must be a valid ISO day; implementation month must
  agree with that day; and the normalized route must be nonempty. Its exact
  rejection reasons are `untrusted_or_retired_registry_source`,
  `registry_event_not_implemented`, `unsupported_treatment_family`,
  `invalid_registry_implementation_date`, `registry_month_date_mismatch`,
  and `missing_route_id`. Plan 090 exposes this gate as one tagged helper and
  reuses it; it must not replace the gate with a status-only filter. The rc23
  merge artifact remains fail-closed and is not an observation input.
- `packages/analytics/src/interventions/route-treatment-summary.ts` exports
  legacy `normalizeRouteTreatmentType`. Plan 091 may use it only inside its
  compatibility adapter while repairing historical summary rows. Plan 090
  receives Plan 091's canonical presentation kind/family and must not make
  that legacy normalizer a public observation authority.
- `packages/analytics/src/feature-history/route-speed-spine.ts` exports the
  legacy `routeSpeedSpineRouteSlug`, which converts `+` into an SBS-shaped
  slug. It is not an authority for this path. Copy `routeId`, exact route ref,
  official display identity, and `routeSlug` from the strict Plan 091 bundle.
- `tools/pipeline-v2/src/lib/study-engine/panel.ts` exports `monthIndex` and
  `isoMonthFromIndex`; use them for the event-centered month window. A month
  here is source grain/time-series coordinate, explicitly permitted by
  ADR-0022 and the plan-088 doctrine gate.
- Domain Studio artifacts use Effect v4 `Schema.Struct`, closed
  `Schema.Literals`, `Schema.NullOr` for JSON nulls, strict decoding at IO
  boundaries, explicit named exports, and key-only modules for browser-safe
  path imports. Exemplars:
  `packages/domain/src/studio/intervention-corpus.ts`,
  `intervention-corpus-key.ts`, `study.ts`, `study-key.ts`, and
  `packages/domain/src/studio/index.ts`.
- Pipeline command discovery is automatic for default-exported
  `defineCommand` descriptors under `tools/pipeline-v2/src/commands/**`.
  `tools/pipeline-v2/src/commands/studio/export-intervention-corpus.ts` is the
  command/test pattern; adding a command also requires updating the expected
  Studio list in `tools/pipeline-v2/test/cli/registry.test.ts`.
- After Plan 086, `data/artifacts/studio/v1/release.json` strictly decodes
  through `StudioReleasePayloadSchema` and owns publication identity via
  `releaseId` and `publishedAt`. The observation command must inherit those
  fields from that artifact; independent CLI identity flags would allow two
  artifacts from one publication event to disagree.
- Artifact publication already includes the entire `studio` prefix
  (`tools/pipeline-v2/src/commands/publish/r2-artifacts.ts`), and
  `scripts/seed-local-studio-r2.sh` recursively seeds `data/artifacts/studio`.
  A correctly keyed artifact needs no Worker route, D1 table, or bespoke R2
  uploader.
- Package boundaries are binding: domain imports no local package; analytics
  may import domain; pipeline may import domain + analytics; web may import
  domain but never analytics or pipeline. Root/package barrels use explicit
  named exports only and never `export *`.

### MVP relevance decision

Version 1 supports only route-scoped
`automated_bus_lane_enforcement`. That is the one treatment family with the
existing approved study vertical slice. Every other admitted normalized study family must
produce an explicit `unsupported_treatment_family` event entry with no
bindings; do not apply a generic speed/ridership profile based on title or
description text.

The two v1 bindings are fixed before values are read:

| Binding id | Product / resolver | Metric | Role | Claim ceiling | Priority |
|---|---|---|---|---|---|
| `route_speed_around_implementation_v1` | `local_route_month_trends_history` / `sqlite.local_route_month_trend.history.v1` | `route_average_speed_mph` (`average_speed_mph`, label "Observed average speed", unit `mph`) | `primary_outcome` | `descriptive_observation` | 1 |
| `route_ridership_around_implementation_v1` | same | `route_monthly_ridership` (`ridership`, label "Monthly riders", unit `riders`) | `context` | `descriptive_observation` | 2 |

Both use the route scope and an inclusive 25-month display window: 12 months
before the implementation month, the implementation month, and 12 months
after. This is a visualization window, not the study engine's pre/post
analysis window. The registry-level effect policy is
`gated_study_artifact_only`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Analytics tests | `bun --filter @bp/analytics test` | exit 0; relevance-registry tests pass |
| Domain tests | `bun --filter @bp/domain test` | exit 0; strict artifact tests pass |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | exit 0; resolver/command/CLI registry tests pass |
| Command discovery | `bun run pipeline -- studio export-intervention-observations --help` | exit 0; lists `--db`, `--inventory-index`, `--release-artifact`, `--artifact-root` and no identity override flags |
| Typecheck | `bun run check:types` | exit 0 |
| Architecture/doctrine | `bun run check:architecture` | exit 0 with no new month-doctrine allowlist entry |
| Style | `bun run check:style` | exit 0 |
| Knowledge | `bun run check:knowledge` | exit 0 |
| Final unit suite | `bun run test:unit` | exit 0 |

## Suggested executor toolkit

- Use the `effect-ts` skill if available when defining the Effect v4 schemas
  and command boundary. Follow this repo's established transport-artifact
  convention (`Schema.Struct` + strict decode) instead of introducing a
  service/layer abstraction for a deterministic offline transform.
- Read `packages/domain/src/studio/study.ts`,
  `packages/domain/src/studio/intervention-corpus.ts`, and
  `tools/pipeline-v2/src/commands/studio/export-intervention-corpus.ts` before
  writing the new files.

## Scope

**In scope** (the only files you should create/modify):

- `packages/analytics/package.json`
- `packages/analytics/src/intervention-evidence/index.ts` (new)
- `packages/analytics/src/intervention-evidence/spec.ts` (new)
- `packages/analytics/src/data-products/registry.ts`
- `packages/analytics/test/intervention-evidence-spec.test.ts` (new)
- `packages/domain/package.json`
- `packages/domain/src/studio/intervention-observations.ts` (new)
- `packages/domain/src/studio/intervention-observations-key.ts` (new)
- `packages/domain/src/studio/index.ts`
- `packages/domain/test/studio-intervention-observations.test.ts` (new)
- `tools/pipeline-v2/src/lib/study-engine/study-events.ts` (narrow shared
  admission export/refactor only)
- `tools/pipeline-v2/test/lib/study-events.test.ts` (admission parity and
  rejection-reason coverage)
- `tools/pipeline-v2/src/lib/local-db-aggregates/intervention-observation-rows.ts` (new)
- `tools/pipeline-v2/src/lib/local-db-aggregates/index.ts`
- `tools/pipeline-v2/src/lib/intervention-observations.ts` (new)
- `tools/pipeline-v2/src/commands/studio/export-intervention-observations.ts` (new)
- `tools/pipeline-v2/test/lib/intervention-observations.test.ts` (new)
- `tools/pipeline-v2/test/commands/studio/export-intervention-observations.test.ts` (new)
- `tools/pipeline-v2/test/cli/registry.test.ts`
- `knowledge/wiki/engineering/intervention_evidence_relevance.md` (new)
- `knowledge/wiki/engineering/cli_commands.md`
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md`
- `knowledge/index.md`
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/**` — Plan 082 is the first consumer after this contract lands.
- `packages/studio-api/**`, Worker handlers, D1 schemas/migrations — the
  existing generic artifact endpoint serves the new R2 keys.
- `packages/domain/src/studio/study.ts`, study estimators, approval artifacts,
  Wiki admission, merge/conflict logic, and causal gates — causal studies
  remain a separate lane. The only study-engine change in scope is exporting
  the existing registry-row gate and making `registryDrafts` call it without
  changing candidate/rejection behavior.
- rc23 candidate/approval/import schemas and artifacts — rc23's route
  projection is quarantined by the exact-identity work. This plan consumes
  only Plan 091 occurrences that retain already-published trusted
  `local_intervention_event` lineage and raw status `implemented`.
- `TreatmentsHistorySection` text/citation merge logic — never use it in the
  resolver.
- Any generic metric-expression/query DSL, embedding search, LLM selection,
  or value-ranked metric discovery.
- Any before/after aggregate, percent change, direction, verdict, or causal
  wording in the new artifact.
- `data/**` and `knowledge/raw/**` — tests write only to a temporary directory;
  no generated artifact is committed by this plan.

## Git workflow

- Branch: `codex/090-structured-intervention-observations` from a clean commit
  containing the exact-route Tracker consumer, Plan 091, and the four required
  Generation 11 plans. The existing branch of this name contains the original
  plan only; rebase/recreate it rather than executing on its stale base.
- Commit per logical layer: analytics registry; domain contract; pipeline
  materializer; docs/gates.
- Use imperative messages matching repo history, e.g. "Define intervention
  relevance registry" and "Materialize route intervention observations".
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Define the closed, value-blind relevance registry

Create `packages/analytics/src/intervention-evidence/spec.ts` and its explicit
barrel `index.ts`; add the focused package export
`"./intervention-evidence": "./src/intervention-evidence/index.ts"`.

Use Effect `Schema.Struct`/`Schema.Literals` plus inferred types for:

```ts
InterventionEvidenceBindingRole =
  "primary_outcome" | "secondary_outcome" | "exposure" |
  "mechanism" | "confounder" | "context"

InterventionEvidenceClaimCeiling =
  "annotation_only" | "descriptive_observation" | "gated_study_only"

InterventionEvidenceBinding = {
  bindingId, dataProductId, featureGrain, resolverId,
  metricId,
  sourceField: "average_speed_mph" | "ridership",
  label, unit, role,
  scopePolicy: "route",
  window: { monthsBefore: 12, monthsAfter: 12, includeAnchorMonth: true },
  claimCeiling, presentationPriority
}

InterventionEvidenceSpec = {
  specId, schemaVersion: 1, analysisFamily,
  supportedScopeKinds: ["route"],
  effectClaimPolicy: "gated_study_artifact_only",
  bindings
}
```

`sourceField` is a closed literal union, not an arbitrary string or SQL/field
expression. Adding another source column requires a reviewed schema change and
registry test.

Export a readonly `INTERVENTION_EVIDENCE_SPECS` registry containing exactly
the ACE spec. Also export an exhaustive, typed
`INTERVENTION_ANALYSIS_DISPOSITIONS_V1` bridge from every Plan 091 canonical
presentation kind to either
`{ status: "supported", analysisFamily: "automated_bus_lane_enforcement", specId }`
or `{ status: "unsupported_treatment_family", analysisFamily: null, reasonId }`.
In v1 only the
Plan 091 kind `automated_bus_lane_enforcement` is supported. The bridge is
reviewed metadata; it must not collapse or replace Plan 091's presentation
kind/family enums.

Export
`interventionEvidenceSpecFor(kind: StudioInterventionTreatmentKind)` over the
canonical Plan 091 kind. It returns the disposition plus resolved spec and
never accepts raw source strings, observation rows, or metric values.
`normalizeRouteTreatmentType` may be covered by separate legacy compatibility
tests but is not called by this lookup or builder.

At module initialization (or an exported validator called by tests), validate
each binding against live registries:

- `dataProductId` exists in `DATA_PRODUCT_MANIFEST.products`;
- `featureGrain` resolves through `getFeatureContract`;
- the declared `resolverId` equals that contract's resolver id;
- binding ids are globally unique;
- priorities within a spec are unique and ascending;
- the display window is exactly 12/12 inclusive for v1.

Add the two downstream artifact products to
`packages/analytics/src/data-products/registry.ts`:

- `studio_intervention_observation_route_bundles` — artifact family, grain
  `route x implemented intervention event x metric x month`, producer
  `studio export-intervention-observations`, inputs Plan 091's
  `studio_route_intervention_inventory` +
  `local_route_month_trends_history`,
  artifact-glob check rooted at `{artifactRoot}/studio/v2/routes` with pattern
  `*/intervention-observations.json` and minimum one file.
- `studio_intervention_observation_index` — serving projection, grain
  `implemented intervention event`, same producer, requires the route-bundle
  product, JSON-artifact check at
  `{artifactRoot}/studio/v2/interventions/observation-index.json` requiring
  artifact kind `bp.studio.intervention_observation_index.v1` and schema
  version 1.

Use post-Plan-086 vocabulary (`history_window`, `publishedAt`, coverage), and
do not add a month-doctrine allowlist entry.

Tests in `intervention-evidence-spec.test.ts` must cover: strict decode;
exact ACE binding order/roles; every referenced product and resolver exists;
every Plan 091 canonical kind has one disposition; the canonical ACE kind
resolves to the supported spec; `bus_lane`, `route_redesign`, and
`other_documented` return explicit unsupported status with
`analysisFamily: null`; and the lookup
function's type/signature has neither a raw string nor observation-value
input. Plan 091 owns alias tests such as `ace`/`able`.

**Verify**: `bun --filter @bp/analytics test` → exit 0; new test file passes.

### Step 2: Define the public route bundle and compact index

Create `packages/domain/src/studio/intervention-observations.ts` using the
repo's plain JSON transport convention (`Schema.Struct`, not a stateful
service). Export strict schemas and inferred types for:

- `StudioInterventionObservationPoint`:
  `{ month: YYYY-MM, value: number | null, sampleCount: nonnegative integer | null }`.
  Every month in the requested 25-month window is present; unavailable months
  are explicit null points, never removed.
- `StudioInterventionObservationCoverage`:
  `{ requestedStart, requestedEnd, expectedPointCount,
  observedStart: string | null, observedEnd: string | null,
  observedPointCount, nullPointCount }` with nonnegative integer fields.
- `StudioInterventionObservationSeries`:
  `{ bindingId, metricId, label, unit, role, grain, dataProductId, resolverId,
  claimCeiling, presentationPriority, status, coverage, points, limitations }`,
  where status is `available | partial | missing`; arrays are bounded
  (points max 61, limitations max 12).
- `StudioInterventionObservationEvent`:
  `{ eventId, occurrenceId, treatmentId, routeId, treatmentKind,
  analysisFamily, program, sourceId, implementationDate,
  implementationMonth, resolutionStatus, series }`, where `occurrenceId` and
  `treatmentId` are exact references into the same-release Plan 091 bundle,
  `treatmentKind` is Plan 091's presentation kind, and `analysisFamily` is the
  reviewed bridge result rather than the presentation family. It is nullable:
  supported entries require the resolved analysis family, while
  `unsupported_treatment_family` entries require null. Do not copy a prose
  description into this contract. Resolution status is
  `available | partial | missing | unsupported_treatment_family |
  unsupported_scope` and series is max 8.
- `StudioRouteInterventionObservationBundle`:
  artifact kind `bp.studio.route_intervention_observations.v1`, schema 1,
  `releaseId`, `publishedAt`, Plan 091's exact `route` presentation identity,
  consistent `routeId`, and copied `routeSlug`, aggregate
  `dataCoverage: { start: string | null, end: string | null,
  grain: "month" }`, exactly two unique `inputRefs` in this deterministic
  order, max 100 events, and limitations:
  1. `{ dataProductId: "studio_route_intervention_inventory",
     role: "event_anchor", featureGrain: null, resolverId: null }`;
  2. `{ dataProductId: "local_route_month_trends_history",
     role: "observation_source", featureGrain, resolverId }`, where
     `featureGrain` is the live serialized value of
     `ROUTE_METRIC_HISTORY_FEATURE_GRAIN` and `resolverId` is read from
     `getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN).resolverId`.
- `StudioInterventionObservationIndex`:
  artifact kind `bp.studio.intervention_observation_index.v1`, schema 1,
  same release metadata/coverage and the same exact two ordered `inputRefs`
  as every route bundle, plus sorted event rows containing only
  `eventId`, `occurrenceId`, `treatmentId`, exact route/anchor fields,
  treatment kind, nullable analysis family, resolution status, available metric ids,
  and `bundleKey`.
  It contains no series values or effect summaries.

Coverage semantics are binding:

- A route bundle's `dataCoverage.start`/`end` are the minimum/maximum calendar
  months among all series points in that bundle whose value is non-null. When
  the bundle has no non-null series point, both are null. `grain` is always
  `"month"`.
- The index's `dataCoverage.start`/`end` are the minimum non-null bundle start
  and maximum non-null bundle end across all route bundles. When every bundle
  has null coverage (or there are no non-null bounds), both are null. Its
  `grain` is always `"month"`.

Use schema checks for ISO month, non-empty ids, finite numbers, `observed +
null === expected`, and points sorted/unique and within requested coverage.
Require unique `eventId` and unique `(occurrenceId, treatmentId)` pairs per
bundle; an occurrence or treatment ID may legitimately repeat across the
fan-out. Binding IDs are unique within an event, not globally across events.
Require non-null `analysisFamily` exactly for supported resolutions and null
for `unsupported_treatment_family`. Require every event's occurrence/
treatment reference to resolve in the materializer's decoded Plan 091 bundle
before schema emission, and require `route.routeId === routeId`.
Follow the existing domain test convention:
construct fixture objects, decode through `decodeStrict`, and assert malformed
duplicates/counts/dates are rejected. Include one multi-treatment occurrence
that yields two valid composite-keyed events, plus invalid supported-null and
unsupported-non-null analysis-family cases.

Create the key-only module with exactly:

```ts
interventionObservationBundleKey(routeSlug)
  // studio/v2/routes/<routeSlug>/intervention-observations.json
interventionObservationIndexKey()
  // studio/v2/interventions/observation-index.json
```

Add explicit subpath exports for the contract and key module in
`packages/domain/package.json`, then explicit named type/value exports in
`packages/domain/src/studio/index.ts`. Do not use `export *`.

Tests must prove both keys, valid round-trip decoding, bounded arrays,
duplicate rejection, coverage arithmetic, null-gap retention, and the exact
two-ref contract/order above. Reject missing, duplicate, reversed, wrong-id,
wrong-role, or wrong feature/resolver input refs. Cover bundle coverage with
mixed non-null/null series, all-null series (both bounds null), index min/max
aggregation across bundles, all-null index coverage, and any grain other than
`"month"`. Also prove the serialized event/series shape has none of these keys:
`beforeMean`, `afterMean`, `delta`, `percentChange`, `effectEstimate`,
`direction`, `verdict`.

**Verify**: `bun --filter @bp/domain test` → exit 0 including the new tests.

### Step 3: Resolve specs against local rows without looking at magnitude

Create
`tools/pipeline-v2/src/lib/local-db-aggregates/intervention-observation-rows.ts`.
It must fail closed when `local_route_month_trend` is absent, then load all
trend columns listed in Current state, ordered by exact route and month. Event
anchors do **not** come from a second raw-table path after the 2026-07-18
amendment; they come from strictly decoded Plan 091 route inventory bundles.

Use typed row interfaces, parameter-free SELECTs, and export the loader from
the local-db-aggregates barrel with explicit named exports. Filtering and
materialization stay pure in the next file so tests can exercise them without
SQLite.

Before creating the observation builder, make a narrow semantics-preserving
refactor in `tools/pipeline-v2/src/lib/study-engine/study-events.ts`: export a
tagged `admitTrustedRegistryStudyEvent(row)` over a structural input containing
the raw route ID, source ID, raw status, raw intervention type, program, and
implementation day/month. It returns the admitted normalized route/study
family/date and
registry provenance needed by `registryDrafts`, or the same sorted rejection
reasons `registryDrafts` emits today. `registryDrafts` passes its local DB row;
the observation builder passes only the equivalent fields preserved in a Plan
091 occurrence's `registryLineage`. The `registryLineage.eventId` must equal
the local event's stable `event_id` from the `local_intervention_events_release`
product; raw route/type/source/status/program/date/month are replay facts, not
a fuzzy join. Cross-check the gate's admitted route against the occurrence's
exact route identity and its date/month against the occurrence fields. An
occurrence without that lineage cannot enter Plan 090. Move no Wiki, merge,
conflict, approval, route-normalization, or estimator logic. Existing study
merge artifacts must be byte-/deep-equal for the same fixtures before and
after the refactor.

Create `tools/pipeline-v2/src/lib/intervention-observations.ts` with one main
pure builder:

```ts
buildInterventionObservationArtifacts({
  inventoryBundles,
  trendRows,
  releaseId,
  publishedAt,
}) => { bundles, index, admissionSummary }
```

`admissionSummary` is deterministic and contains `admittedAnchorCount`,
`rejectedAnchorCount`, and `admissionReasonCounts`. The unit is one Plan 091
occurrence/registry anchor, before treatment fan-out. Counts include an
`admitted` tag plus every rejection-reason tag emitted by the shared helper;
one multi-reason occurrence increments each applicable reason once. Rejected
row details are not copied into public bundles or the index.

Algorithm, in this order:

1. Strictly use each Plan 091 bundle's exact route ID/slug and stable
   occurrence/treatment IDs. Validate each occurrence's sorted, nonempty,
   unique `treatmentIds` against the same bundle, require its registry-lineage
   event ID to be unique, and call `admitTrustedRegistryStudyEvent` exactly
   once for that occurrence before grouping, fan-out, or reading trend
   values. Count admission/rejection once per occurrence and preserve all
   rejection reasons in the internal summary; never place a rejected
   occurrence in a bundle or index. For each admitted occurrence, emit one
   observation event per `(occurrenceId, treatmentId)` pair. Derive its
   `eventId` deterministically from exact route ref + occurrenceId +
   treatmentId; do not reuse a date/family merge key. Occurrence and treatment
   IDs may therefore repeat across events, while each composite pair/event ID
   is unique. A dangling occurrence/treatment/registry-lineage reference is a
   fatal integrity error, not an unsupported event.
2. Sort/group by the inventory bundle's exact route ref and copy its stable
   slug verbatim. Assert occurrence route ref equals bundle route ref. Do not
   call `routeSpeedSpineRouteSlug`, strip/add a suffix, or normalize the raw
   route a second way.
3. Resolve the relevance spec from the referenced Plan 091 canonical
   treatment kind through `INTERVENTION_ANALYSIS_DISPOSITIONS_V1` **before**
   reading that route's trend values. Cross-check the ACE bridge result with
   the shared helper's admitted study family. Admitted ACE events receive the
   v1 bindings. Only events that pass the full shared registry gate but whose
   canonical kind maps to another study family become explicit
   `unsupported_treatment_family` relevance entries with
   `analysisFamily: null` and no series. A row
   rejected by the shared gate never becomes an unsupported relevance entry.
4. For each supported relevance binding, construct the fixed 25-month key list with
   `monthIndex`/`isoMonthFromIndex`; index trend rows by route/month; map each
   requested month to a point. For speed, a point is observed only when
   `has_speed_trend` is true, `average_speed_mph` is finite, and
   `speed_observation_count > 0`; `sampleCount = speed_observation_count`.
   For ridership, observed requires `has_ridership_trend` and finite,
   nonnegative `ridership`; `sampleCount = null` because this table stores a
   monthly total rather than a comparable observation count.
5. Set binding status: `available` only when all 25 points are observed;
   `partial` when 1-24 are observed; `missing` when zero are observed. Event
   status is `available` if every binding is available, `partial` if at least
   one binding has data but not all are available, and `missing` if supported
   bindings have zero observations.
6. Preserve null points and generate factual limitations from status/coverage
   only (for example, "9 of 25 requested route-month values are published").
   Do not describe value direction or compare either side of the marker.
7. Sort bundles by route slug, events by implementation month/occurrence ID,
   series by presentation priority, points by month, and index rows by month,
   route slug, occurrence ID. The same rows plus the same release metadata must
   serialize byte-identically.

Tests must cover: exact 25-month expansion across a year boundary; null-gap
retention; speed/ridership eligibility rules; all three series statuses;
an admitted non-ACE study family still indexed as unsupported relevance;
every shared-gate rejection excluded from bundles/index; deterministic
ordering; two events on one route; exact B44/B44+ bundle/slug separation; an
occurrence/bundle route mismatch; dangling treatment ID; duplicate registry
lineage event ID; every emitted occurrence/treatment reference resolving in
its bundle; and no trend rows producing a truthful
`missing` event rather than a crash. Assert
the admitted/rejected totals and per-reason counts, including a row with
multiple simultaneous rejection reasons.

In `tools/pipeline-v2/test/lib/study-events.test.ts`, add direct tagged-helper
tests for success and each exact rejection reason: untrusted source,
non-implemented status, unsupported study family, invalid ISO day,
month/date mismatch, and empty normalized route. Add a multi-reason case and
a parity fixture proving `buildStudyEventMergeArtifact` still emits unchanged
registry candidates/rejections after `registryDrafts` delegates to the helper.

Add the anti-cherry-picking regression: build two inputs with identical
events, coverage/null pattern, and sample counts but materially different
numeric magnitudes (one rising, one falling). Assert that event resolution,
selected binding ids, roles, priorities, windows, and limitations are
deep-equal; only point values may differ.

Builder tests must also assert that every bundle emits exactly the two unique
input refs in the prescribed order, with the observation ref's feature grain
and resolver copied from the live route-metric-history contract. Cover bundle
coverage min/max across multiple series, an all-null bundle, index min/max
across differently covered bundles, and an all-null index; every emitted
coverage grain must equal `"month"`. The index must repeat the exact same two
ordered refs and reject missing, extra, reordered, or divergent refs.

**Verify**: `bun --filter @bp/pipeline-v2 test` → exit 0 including the new
pure-builder tests.

### Step 4: Add the deterministic export command

Create
`tools/pipeline-v2/src/commands/studio/export-intervention-observations.ts`,
modeled on `export-intervention-corpus.ts` and using
`runLocalDbCommandBoundary`. Export a directly testable
`runExportInterventionObservations` function and default-export a
`defineCommand` descriptor at path
`["studio", "export-intervention-observations"]`.

Options:

- existing `dbOptions` fields;
- optional `--inventory-index`, resolved with `fromCliPath`, defaulting under
  `--artifact-root` to Plan 091's
  `studio/v2/interventions/route-inventory-index.json`; every referenced
  bundle is strict-decoded before observation materialization;
- optional `--release-artifact`, resolved with `fromCliPath`, defaulting to
  `data/artifacts/studio/v1/release.json`;
- optional `--artifact-root`, resolved with `fromCliPath`, defaulting through
  `defaultArtifactRootPath()`.

Before opening output files, read and strictly decode `--release-artifact`
with the post-Plan-086 `StudioReleasePayloadSchema`. Pass its `releaseId` and
`publishedAt` to the builder; there is no `--release-id`, `--published-at`,
environment fallback, `Date.now()` identity, or other override path. A
missing/invalid release artifact fails before any write.

Strict-decode the inventory index and every referenced bundle before opening
outputs. Every inventory artifact must have the same `releaseId` and
`publishedAt` as the Studio release payload and a compatible coverage
identity; every index route/key/hash must resolve. A stale/mixed release,
dangling key, or hash mismatch fails before trend loading or writes.

The command then loads the Plan 091 inventory and trend rows, builds
artifacts, strictly decodes every output object with the domain schemas before
writing, writes each route bundle under
its key and then the index, and returns only display paths/counts/coverage:
`routeBundleCount`, `eventCount` (published treatment-fan-out events),
`admittedAnchorCount`, `rejectedAnchorCount`, `admissionReasonCounts`, `supportedEventCount`,
`unsupportedEventCount`, `availableSeriesCount`, `partialSeriesCount`,
`missingSeriesCount`, `indexPath`. Rejected rows are counted but never
published. It must throw before writing when the release/inventory artifact is
missing, invalid, stale, or hash-inconsistent; there are zero admitted
occurrence anchors; registry-lineage IDs collide across occurrences; event IDs
or `(occurrenceId, treatmentId)` pairs collide; or the required trend table is absent.
Use sorted writes and the same
two-space JSON + trailing-newline convention as the exemplar.

Update `tools/pipeline-v2/test/cli/registry.test.ts` to include the command.
The command test must create a temporary SQLite database with the required
trend table plus small fixtures, a minimal valid post-086 release artifact,
and strict Plan 091 route-index/bundle fixtures. Call the exported runner,
decode every written artifact,
assert index `bundleKey` targets exist, and assert rerunning with identical
inputs produces identical bytes. Include admitted ACE, admitted non-ACE, and
rejected registry rows plus one admitted multi-treatment occurrence; assert
anchor counts, treatment-fan-out `eventCount`, and every applicable
`admissionReasonCounts` entry while proving no rejected occurrence appears in
a written artifact. Cover missing/invalid release or inventory artifacts,
mixed `releaseId`/`publishedAt`/coverage, dangling bundle key/hash, missing
trend table, colliding registry-lineage/event/composite IDs, and zero admitted
anchors; every failure must
occur before writes. Clean up the temp directory in `afterAll`; do not touch
`data/`.

**Verify**:

- `bun --filter @bp/pipeline-v2 test` → exit 0.
- `bun run pipeline -- studio export-intervention-observations --help` → exit
  0 and lists `--db`, `--inventory-index`, `--release-artifact`, and
  `--artifact-root`; output has no `--release-id` or `--published-at`.

### Step 5: Document the contract and run the full gates

Create `knowledge/wiki/engineering/intervention_evidence_relevance.md` and
write, in durable present-tense documentation:

- the four-lane table from Current state;
- the value-blind selection rule;
- the v1 ACE-only support boundary and explicit unsupported behavior;
- the two bindings and 25-month display window;
- artifact keys and ownership across domain/analytics/pipeline/web;
- claim-language rule: observation charts may say "observed" and mark dates,
  but only a gated StudyArtifact may supply an effect number or causal
  interpretation;
- extension recipe: add a reviewed treatment-family spec, reference only
  registered product + feature ids, add consistency/selection-invariance
  tests, then add a renderer. Never infer relevance from prose or effect
  magnitude;
- the shared trusted-registry admission gate, its rejection reasons, and the
  rule that rejected rows are counted operationally but never published;
- publication identity comes only from the strictly decoded Studio release
  artifact, never independent flags.

Link the page from `knowledge/index.md` in the engineering/data-contract area
and append a dated `knowledge/log.md` entry. Do not edit raw source captures.

Update `knowledge/wiki/engineering/cli_commands.md` and
`knowledge/wiki/engineering/cloudflare_operations_runbook.md` with the local
materialization prerequisite/recovery path and this exact command:

```bash
bun run pipeline -- studio export-intervention-observations --db data/local/pipeline.sqlite --inventory-index data/artifacts/studio/v2/interventions/route-inventory-index.json --release-artifact data/artifacts/studio/v1/release.json --artifact-root data/artifacts
```

Both pages must say the database must contain the required route-trend table,
the Plan 091 inventory index/bundles must strictly decode, the release artifact
must be a valid post-086 `StudioReleasePayload`, and a missing/invalid
prerequisite is rebuilt through the documented upstream workflow. Never
hand-author inventory or release metadata to unblock this command.

Run, in order:

1. `bun run check:types`
2. `bun run check:style`
3. `bun run check:architecture`
4. `bun run test:unit`
5. `bun run check:knowledge`

All must exit 0. `check:architecture` must pass without growing the
month-doctrine allowlist.

## Test plan

- Analytics: registry schema, exhaustive Plan 091 kind → analysis-family
  dispositions, unsupported families, product/feature referential integrity,
  binding uniqueness/order/window.
- Domain: strict transport decode, key paths, caps, uniqueness, coverage
  arithmetic, nulls, forbidden effect fields.
- Pipeline pure builder: 25-month window, eligibility/status semantics,
  full shared registry admission and per-reason counts, deterministic
  ordering, exact route/slug preservation, resolved occurrence/treatment/
  registry-lineage references, admitted-non-ACE unsupported relevance,
  rejected-row exclusion, unsupported/missing states, and value-magnitude
  selection invariance.
- Shared study-event gate: direct success/every-reason tagged results,
  multi-reason sorting, and unchanged existing registry merge behavior.
- Pipeline command: fixture SQLite happy path, decoded writes/index links,
  minimal valid release fixture, byte determinism, rejection visibility,
  missing/invalid/mixed-release inventory before writes, dangling inventory
  key/hash, missing tables, lineage/event/composite collisions, zero admitted
  anchors, and CLI
  registry discovery with no identity override flags.
- Final verification: `bun run test:unit` plus all type/style/architecture/wiki
  gates listed in Step 5.

## Done criteria

- [ ] `@bp/analytics/intervention-evidence` exports exactly one v1 supported
      treatment spec and both required bindings; every referenced product and
      feature resolver is registry-valid
- [ ] `@bp/domain/studio/intervention-observations` strictly decodes bounded
      route bundles and the compact index; key-only imports are available
- [ ] `admitTrustedRegistryStudyEvent` is the single full registry-row gate
      used by both `registryDrafts` and the observation builder; every reason
      and unchanged merge behavior have tests
- [ ] The export command writes one bundle per route with at least one
      admitted occurrence anchor plus a
      sorted index, and all artifacts decode through the domain schemas;
      rejected rows appear only in deterministic counts, never artifacts
- [ ] The observation index and every route bundle carry the identical two
      ordered inventory/trend `inputRefs`; missing, extra, reordered, or
      divergent refs fail strict decoding or export verification
- [ ] Every emitted `occurrenceId`/`treatmentId` resolves in the same Plan 091
      bundle; each occurrence is admitted/counts once and fans out to one
      uniquely keyed event per treatment; every admitted anchor has one
      unique registry-lineage event ID; and route identity/slug are copied
      without secondary normalization
- [ ] The command strictly inherits `releaseId`/`publishedAt` from
      `--release-artifact` (default `data/artifacts/studio/v1/release.json`),
      exposes no identity override flags, and separately returns published
      `eventCount`, `admittedAnchorCount`, `rejectedAnchorCount`, and
      `admissionReasonCounts`
- [ ] Inventory index/bundles strictly match that release metadata/coverage
      and their declared keys/hashes before any observation output is opened
- [ ] The rising-vs-falling anti-cherry-picking test proves binding selection,
      role, priority, window, and limitations are value-invariant
- [ ] `rg -n 'beforeMean|afterMean|percentChange|effectEstimate|verdict' packages/domain/src/studio/intervention-observations.ts tools/pipeline-v2/src/lib/intervention-observations.ts` returns no matches
- [ ] `rg -n 'mergedTreatmentTimelineRows|TreatmentsHistorySection|StudyEventMergeArtifactV3' packages/analytics/src/intervention-evidence tools/pipeline-v2/src/lib/intervention-observations.ts tools/pipeline-v2/src/commands/studio/export-intervention-observations.ts` returns no matches
- [ ] `bun run pipeline -- studio export-intervention-observations --help`
      lists `--db`, `--inventory-index`, `--release-artifact`,
      `--artifact-root` and does not list `--release-id` or `--published-at`
- [ ] `rg -n 'export-intervention-observations --db data/local/pipeline.sqlite --inventory-index data/artifacts/studio/v2/interventions/route-inventory-index.json --release-artifact data/artifacts/studio/v1/release.json --artifact-root data/artifacts' knowledge/wiki/engineering/cli_commands.md knowledge/wiki/engineering/cloudflare_operations_runbook.md` finds the exact command in both docs
- [ ] `bun --filter @bp/analytics test`, `bun --filter @bp/domain test`, and
      `bun --filter @bp/pipeline-v2 test` all exit 0
- [ ] `bun run check:types`, `bun run check:style`,
      `bun run check:architecture`, `bun run test:unit`, and
      `bun run check:knowledge` all exit 0; no new doctrine allowlist entry
- [ ] `git status --short` lists no modified file outside Scope
- [ ] `plans/README.md` status row is updated

## STOP conditions

Stop and report back (do not improvise) if:

- the exact-route dependency tests fail, Plan 091 is not DONE, or any required
  Generation 11 plan is not DONE.
- Post-dependency code no longer has equivalent trusted intervention-event,
  route-month trend, data-product, or route-metric-history contracts.
- Exporting/reusing `admitTrustedRegistryStudyEvent` changes any existing
  registry candidate, rejection, deduplication, conflict, or approval output;
  report the parity failure instead of creating a second gate.
- The implementation would need to read rc23 `candidates` or an
  `awaiting_approval`/blocked merge artifact to obtain events. Candidate
  review is not publication.
- The post-086 release artifact lacks strictly decoded `releaseId` or
  `publishedAt`, or the command would need to invent/override either value.
- Anyone proposes selecting, ordering, hiding, or labeling bindings based on
  observed magnitude, sign, apparent change, p-value, or study verdict.
- Supporting a family other than ACE seems "obvious" from its prose. V1 is
  intentionally explicit and unsupported elsewhere; expansion needs its own
  reviewed spec.
- A public schema appears to need before/after aggregates, causal language,
  or a StudyArtifact field. Keep the lanes separate and report the requested
  change.
- Domain would need to import analytics/pipeline, web would need to import
  analytics, or a Worker/D1 change appears necessary.
- The generic artifact publisher no longer includes the `studio` prefix or
  the generic public artifact endpoint no longer serves arbitrary safe keys.
- A verification fails twice after a reasonable fix, or the implementation
  requires a file outside Scope.

## Maintenance notes

- Plan 082 is the first consumer and must derive markers from the new bundle,
  never from merged display text. Its 2026-07-18 amendment is binding.
- The index intentionally carries no time-series values. A future
  `/interventions` enhancement can use it for availability/deep-link state
  without downloading every route bundle.
- Plan 093 owns the first reviewed non-ACE expansion. Add future treatment
  families one reviewed spec at a time. A generic
  "route interventions use speed" fallback would erase the main safety
  property of this design.
- When a new corpus product becomes relevant (reliability, wait time,
  customer journey, weather/context, segment history), add its canonical data
  product and feature ids first, then a binding and renderer. Do not put SQL
  expressions or arbitrary field paths in the public artifact.
- Reviewers should scrutinize the event admission boundary, value-invariance
  test, null-gap preservation, deterministic sorting, and absence of effect
  summaries more than visual labels.
