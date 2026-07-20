# Plan 091: Promote the route-treatment materializer into an exact, lossless route intervention inventory

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do
> not improvise. When done, update this plan's row in `plans/README.md`.
>
> **External dependency check (run first)**: the Tracker half of MTA Wiki
> Plan 035, task `019f7640-fd5c-7be2-8a40-a7c264284c0f`, must be merged into
> this branch. All of these checks must succeed before implementation:
>
> ```sh
> test -f tools/pipeline-v2/src/lib/mta-wiki-route-identities.ts
> test -f tools/pipeline-v2/test/mta-wiki-route-identities.test.ts
> test -f tools/pipeline-v2/test/studio-mta-wiki-route-evidence-v2.test.ts
> bun test tools/pipeline-v2/test/mta-wiki-route-identities.test.ts tools/pipeline-v2/test/studio-mta-wiki-route-evidence-v2.test.ts packages/domain/test/studio-route-identity-presentation.test.ts apps/web/test/shared/route-badge.test.ts --timeout 5000
> ```
>
> Expected: exit 0; the fixtures prove B44 and B44+ remain distinct and the
> browser does not manufacture `-SBS`. If the exact-identity consumer has not
> landed, STOP. Do not copy its route-normalization work into this plan.
>
> **Repository dependency check (run next)**: plans 084, 088, 085, and 086
> must say `DONE` in `plans/README.md`. This artifact uses their
> `releaseId`/`publishedAt`/`coverage` vocabulary and must not introduce a new
> month-keyed public release identity.
>
> **Drift check**:
> `git diff --stat ac940967..HEAD -- packages/analytics/src/interventions packages/analytics/src/data-products/registry.ts packages/domain/package.json packages/domain/src/studio tools/pipeline-v2/src/commands/studio tools/pipeline-v2/src/lib/local-db-aggregates tools/pipeline-v2/test/commands/studio tools/pipeline-v2/test/cli/registry.test.ts knowledge/wiki/engineering/route_treatment_summary_materializer_plan.md knowledge/wiki/engineering/cli_commands.md knowledge/wiki/engineering/cloudflare_operations_runbook.md`
>
> Changes from the exact-identity task, plans 085/086, or Plan 090 are not a
> license to guess. Compare the live route identity type, release schema,
> artifact-key convention, and source adapters with "Current state" below.
> If their semantics differ, STOP and report the exact symbols that moved.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (repairs lossy normalization and creates a public truth
  boundary; bounded by exact-identity prerequisites, strict schemas,
  zero-loss reconciliation, and fixture-backed publication gates)
- **Depends on**: Tracker exact-route task
  `019f7640-fd5c-7be2-8a40-a7c264284c0f` (HARD),
  `plans/084-retire-month-anchors-doctrine.md`,
  `plans/088-month-doctrine-gate.md`,
  `plans/085-demonth-serving-contract.md`, and
  `plans/086-demonth-release-identity.md` (all HARD); Plan 073 is DONE and
  supplies the reviewed corpus
- **Category**: migration
- **Planned at**: commit `ac940967`, 2026-07-18

## Why this matters

Tracker already computes a broad `route_treatment_summary`, but it is an
11 MB analytics artifact rather than a strict serving contract. Its reviewed
document adapter emits only the first treatment from a multi-treatment
record, its merge key folds distinct occurrences into one route/family row,
and its route canonicalizer strips or aliases exact service identities. The
web therefore falls back to lane/ACE/TSP/SBS flags and prose matching, which
is why many real interventions appear only as generic timeline text.

This plan repairs and reuses that materializer. It produces a compact,
strictly decoded bundle for every exact route, preserving projects,
treatments, operational occurrences, lifecycle state, source lineage, and
source gaps as separate concepts. It does **not** add observations, effects,
study eligibility, or UI: Plan 090 owns typed data relevance, studies remain
Plans 074/075, and Plan 092 consumes this inventory in the app.

## Current state

### The existing asset is useful but not a public contract

- `packages/analytics/src/interventions/route-treatment-summary.ts:3-16`
  declares 12 treatment types. Rows already carry status, effective date,
  date precision, geography scope, source refs, confidence, caveats, method
  limitations, and event IDs (`:56-72`). Reuse these semantics; do not build a
  second unrelated normalizer.
- The artifact is still release-month shaped and monolithic
  (`route-treatment-summary.ts:156-183`). The checked local artifact contains
  one `not_found` row for every route × treatment type plus segment rows. It
  is appropriate for offline diagnostics, not per-route browser delivery.
- `knowledge/wiki/engineering/route_treatment_summary_materializer_plan.md`
  already names the missing serving/UI phases. Treat it as historical design
  context; update it to point at this executable plan rather than creating a
  parallel architecture.

### Two correctness defects discard intervention truth

`routeTreatmentSourceRowsFromPublishableInterventions` currently builds all
candidate treatments and then selects only one
(`packages/analytics/src/interventions/route-treatment-summary.ts:771-813`):

```ts
const treatmentInputs = [...primaryTreatments, ...customTreatments];
const firstTreatment = treatmentInputs[0];
if (firstTreatment === undefined) return [];
// exactly one RouteTreatmentEvidenceInput follows
```

The served corpus has records with multiple primary and custom treatments.
Every component must survive with a stable source-derived treatment ID and
its raw kind/label.

The summary merge key is only route + month + treatment type + geography
scope (`route-treatment-summary.ts:384-388`). `betterRouteTreatmentRow`
selects one status-ranked winner and merges refs (`:488-509`). That is valid
only for a derived current-state snapshot. It is not an occurrence identity:
planned and implemented events with different dates must remain distinct.

### Current route matching is incompatible with the exact-identity contract

`canonicalRouteId` (`route-treatment-summary.ts:369-381`) currently removes a
trailing `+`, adds one when a catalog match exists, collapses Q20 branches,
and collapses SIM `X` variants. The corpus exporter and current web joins also
strip `-SBS`/`+`. The external prerequisite replaces those rules with the
dataset namespace + exact case-sensitive `source_route_id` contract. This
plan consumes that contract and records unresolved projections; it never
guesses a neighboring route.

### Reviewed evidence already has the semantic pieces

- `packages/domain/src/studio/intervention-corpus.ts` strictly models 310
  reviewed records, including arrays of primary/custom treatments, exact
  source metadata, dates, route references, and registry matches.
- `packages/domain/src/studio/route-evidence.ts:48-118` models cited Wiki
  treatment components, projects, timeline events, source gaps, and stable
  record IDs. Do not duplicate citation text or full project payloads in the
  new bundle; retain their IDs and source/citation keys and let this existing
  artifact remain the cited-record authority.
- `packages/domain/src/documents/operational-occurrence/index.ts` separates a
  reviewed operational occurrence from its treatment members, phases,
  physical scope, exact route refs, and evidence bindings. Only occurrences
  admitted into a pinned producer release may be projected. After the exact-
  route task, the required input is a strict
  `MtaWikiOperationalOccurrenceImportArtifactV5` generated from the same
  manifest-v5 release and manifest SHA as route evidence. Its producer-
  approved occurrence decisions are display facts; a Tracker study-candidate
  receipt is deliberately **not** required for inventory display. Candidate-
  set rows, Codex recommendations, and `awaiting_approval` study artifacts are
  never inputs. The old rc23 occurrence import is also ineligible because its
  route projection is quarantined; generate a fresh v5 import instead.

### Serving convention

Domain Studio artifacts use Effect v4 `Schema.Struct`, closed
`Schema.Literals`, `Schema.NullOr`, strict decoding at IO boundaries, named
exports, and a key-only browser-safe module. Match
`packages/domain/src/studio/intervention-corpus.ts`,
`route-evidence.ts`, and `study-key.ts`. The generic R2 publisher already
publishes the `studio` prefix, and `scripts/seed-local-studio-r2.sh` seeds it
recursively. No Worker endpoint or D1 migration is needed.

## Target contract

Create `StudioRouteInterventionInventoryBundle` with these non-negotiable
semantic lanes:

| Field group | Required meaning |
|---|---|
| `route` | the dependency's exact route identity, stable slug, and official display label; no family-derived identity |
| release metadata | inherited `releaseId`, `publishedAt`, and `coverage`; no independent CLI overrides |
| `sourceStates` | required/optional source availability with `available`, `partial`, or `unavailable` and explicit checked coverage |
| `treatments` | one stable row per source-backed primary/custom/component identity; canonical kind/family plus raw kind/label, state, scope, dates, refs, and related IDs |
| `occurrences` | distinct implementation/lifecycle events with stable IDs, dates/precision, state/phase, raw source ID/status/program, treatment IDs, project IDs, and lineage; a local-registry occurrence additionally carries `registryLineage: { dataProductId: "local_intervention_events_release", eventId, rawRouteId, rawInterventionType, sourceId, rawStatus, program, implementationDate, implementationMonth }`, enough for Plan 090 to replay the exact stricter gate without reading prose |
| `currentState` | a derived per-kind/family summary that references all contributing treatment/occurrence IDs; never the only retained representation |
| `projectRefs` | lightweight IDs/relationship refs into `StudioRouteEvidenceBundle`; do not copy full projects or citations |
| `sourceGaps` | route/source/treatment-specific unknowns; separate from a checked no-positive-evidence result |
| `coverageState` | exactly `available`, `partial`, or `checked_no_positive_evidence`; a missing bundle is never interpreted as "none" |

Also create a compact `StudioInterventionFacetIndex` for citywide consumers.
Each row is keyed by stable source record/occurrence ID and contains only its
exact route refs, treatment IDs, canonical kinds/families, lifecycle/date
facets, related project IDs, and route-bundle keys. It contains no source
excerpt or observation value. This is how `/interventions` can filter every
treatment component without downloading every route bundle or reimplementing
open-string crosswalks in the browser.

The schema must not contain observation values, before/after aggregates,
effect estimates, directions, verdicts, or causal language. Add a schema test
that rejects representative forbidden fields as excess properties.

Define a closed presentation taxonomy in the domain contract:

- a canonical treatment **kind** preserves distinctions needed by records;
- a smaller treatment **family** supports grouping/filtering;
- `other_documented` preserves a reviewed raw kind and source-backed label;
- source adapters return a tagged disposition: `mapped`,
  `other_documented`, or `unmapped_review_required`.

Every closed `DocumentTreatmentType` must have an explicit mapped
disposition. Every open Wiki/custom value in the pinned input must be mapped
or explicitly reviewed into `other_documented`; a new unreviewed value blocks
publication and appears in reconciliation. Do not collapse presentation
families and Plan 090's study-analysis families into one enum.

The closed mapping below is binding for v1; the executor may not redesign it
after inspecting observation values:

| Source `DocumentTreatmentType` | Canonical presentation kind | Presentation family |
|---|---|---|
| `bus_lane` | `bus_lane` | `bus_priority_lane` |
| `busway` | `busway` | `bus_priority_lane` |
| `transit_signal_priority` | `transit_signal_priority` | `signal_priority` |
| `queue_jump` | `queue_jump` | `signal_priority` |
| `stop_consolidation` | `stop_consolidation` | `stop_change` |
| `stop_relocation` | `stop_relocation` | `stop_change` |
| `bus_bulb` | `bus_bulb` | `street_design` |
| `neckdown` | `neckdown` | `street_design` |
| `red_paint` | `red_paint` | `bus_priority_lane` |
| `off_board_fare_collection` | `off_board_fare_collection` | `boarding_and_fare` |
| `all_door_boarding` | `all_door_boarding` | `boarding_and_fare` |
| `ace` | `automated_bus_lane_enforcement` | `enforcement` |
| `able` | `automated_bus_lane_enforcement` | `enforcement` |
| `reroute` | `route_redesign` | `service_change` |
| `pedestrian_improvement` | `pedestrian_improvement` | `street_design` |
| `signal_retiming` | `signal_retiming` | `signal_priority` |

The existing `ROUTE_TREATMENT_TYPES` compatibility vocabulary is also
closed. Map its identically named values to the canonical kinds above, plus:
`select_bus_service → select_bus_service / service_package`,
`stop_change → stop_change / stop_change`,
`capital_project_milestone → capital_project_milestone / capital`, and
`custom_treatment → other_documented / other` only when a reviewed nonempty
raw label is present. A bare `custom_treatment` without that label is
`unmapped_review_required`. This adapter is for existing analytics/local
rows; it must not erase the more specific document kinds.

Freeze **every** open treatment literal in the pinned inputs in a versioned
`REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1` table. The vocabulary snapshot is
the sorted union of:

- every `customTreatments` literal in the strictly decoded reviewed corpus;
- every raw/open component kind or label in the same-release Wiki route-
  evidence and manifest-v5 operational-occurrence artifacts; and
- every trusted local-registry `rawInterventionType` not already represented
  by a closed enum.

Do not hand-maintain a partial sample and call it exhaustive. Add a pure
vocabulary collector plus a review command/test fixture that prints the
sorted missing/extra literals with per-source counts. Publication requires
exact set equality between that collected vocabulary and the disposition
table; a missing or stale entry fails before any route bundle is built. Each
table row is an explicit reviewed disposition to a canonical kind/family or
to `other_documented` while retaining the exact raw label. There is no
catch-all branch that automatically maps an unseen string to
`other_documented`.

The following are binding seed decisions, not the complete current table:
map `busway` and `busway_pilot` to `busway`; `center-running protected bus
lane` and `double_bus_lanes` to `bus_lane`;
`bus_lane_enforcement_improvement` to
`automated_bus_lane_enforcement`; `bus_boarding_islands` and `expanded median
bus stops` to `bus_bulb`; `frequency_increase` to a `frequency_change` kind
in `service_change`; `select_bus_service_conversion` to
`select_bus_service`; and `turn_ban` to a `turn_restriction` kind in
`street_design`. The executor must generate the full snapshot, review and
record a disposition for every remaining literal, and stop for operator
review if any semantic mapping is uncertain. Tests pin the complete reviewed
set; any later addition or removal is a review-blocking diff.

Use these keys:

```text
studio/v2/routes/<exact-route-slug>/intervention-inventory.json
studio/v2/interventions/route-inventory-index.json
studio/v2/interventions/facet-index.json
studio/v2/interventions/route-inventory-reconciliation.json
```

Generate a bundle for every projectable exact current route, including
checked-empty routes. The route index contains only route identity, key,
bundle SHA-256, coverage state, family/state counts, source-state summary, and
byte size. The separate facet index contains the lossless citywide record
facets described above.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Analytics tests | `bun --filter @bp/analytics test` | exit 0; lossless normalization/crosswalk tests pass |
| Domain tests | `bun --filter @bp/domain test` | exit 0; strict bundle/index/key tests pass |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | exit 0; command, completeness, and determinism tests pass |
| Command discovery | `bun run pipeline -- studio export-route-intervention-inventory --help` | exit 0; lists `--db`, `--release-artifact`, `--intervention-corpus`, `--route-evidence-index`, `--wiki-occurrences`, `--artifact-root`, and `--check-vocabulary`, but no release-id/month override |
| Vocabulary review | `bun run pipeline -- studio export-route-intervention-inventory --db data/local/pipeline.sqlite --release-artifact data/artifacts/studio/v1/release.json --intervention-corpus data/artifacts/studio/v2/interventions/corpus.json --route-evidence-index data/artifacts/studio/v2/wiki/index.json --wiki-occurrences data/artifacts/studio/v2/wiki/operational-occurrences-v3.json --artifact-root data/artifacts --check-vocabulary` | emits the complete sorted per-source vocabulary/disposition diff without opening outputs; exits 0 only at exact key-set equality |
| Real/local export preflight | `bun run pipeline -- studio export-route-intervention-inventory --db data/local/pipeline.sqlite --release-artifact data/artifacts/studio/v1/release.json --intervention-corpus data/artifacts/studio/v2/interventions/corpus.json --route-evidence-index data/artifacts/studio/v2/wiki/index.json --wiki-occurrences data/artifacts/studio/v2/wiki/operational-occurrences-v3.json --artifact-root data/artifacts` | exit 0 only when the occurrence artifact is v5 and all release/hash/route-identity checks agree |
| Typecheck | `bun run check:types` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0; no package-boundary or month-doctrine exception added |
| Style | `bun run check:style` | exit 0 |
| Knowledge | `bun run check:knowledge` | exit 0 |
| Full gate | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use the `effect-ts` skill, if available, for the strict Effect v4 artifact
  schemas and decoders. This is a deterministic transform; do not introduce a
  service/layer abstraction.
- Read the exact-route dependency's new shared identity type and
  `tools/pipeline-v2/src/lib/mta-wiki-route-identities.ts` before coding.

## Scope

**In scope** (the only files to create/modify):

- `packages/domain/package.json` (new key-only subpath export)
- `packages/domain/src/studio/route-intervention-inventory.ts` (new)
- `packages/domain/src/studio/route-intervention-inventory-key.ts` (new)
- `packages/domain/src/studio/index.ts`
- `packages/domain/test/studio-route-intervention-inventory.test.ts` (new)
- `packages/analytics/src/interventions/route-treatment-crosswalk.ts` (new)
- `packages/analytics/src/interventions/route-treatment-summary.ts`
- `packages/analytics/src/interventions/index.ts`
- `packages/analytics/src/data-products/registry.ts`
- `packages/analytics/test/route-treatment-crosswalk.test.ts` (new)
- `packages/analytics/test/route-treatment-summary.test.ts` (new)
- `tools/pipeline-v2/src/lib/local-db-aggregates/route-treatment-summary-rows.ts`
- `tools/pipeline-v2/src/lib/local-db-aggregates/index.ts`
- `tools/pipeline-v2/src/lib/route-intervention-inventory.ts` (new)
- `tools/pipeline-v2/src/commands/studio/export-route-intervention-inventory.ts` (new)
- `tools/pipeline-v2/test/lib/route-intervention-inventory.test.ts` (new)
- `tools/pipeline-v2/test/commands/studio/export-route-intervention-inventory.test.ts` (new)
- `tools/pipeline-v2/test/commands/studio/route-treatment-summary.test.ts`
- `tools/pipeline-v2/test/cli/registry.test.ts`
- `knowledge/wiki/engineering/route_treatment_summary_materializer_plan.md`
- `knowledge/wiki/engineering/cli_commands.md`
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md`
- `knowledge/index.md` only if a new wiki page is added
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope**:

- `apps/web/**` — Plan 092 owns consumers and presentation.
- `packages/studio-api/**`, Worker handlers, D1 schema/migrations — generic
  R2 artifact serving is sufficient.
- Exact route identity, official route labels, slug derivation, or
  `RouteBadge` — owned by the external prerequisite.
- Plan 090 relevance specs/observation values and Plans 074/075 estimators,
  approvals, results, or claim language.
- Segment UI. Keep the internal segment-treatment rows available for
  analytics, but do not fan route-level inventory facts onto segments.
- Rewriting the reviewed corpus, Wiki source records, approvals, receipts,
  named releases, or `LATEST`.
- The full visual redesign in
  `plans/mockups/089-interventions-redesign/interventions-comp.html`; its
  unresolved design decisions are not a serving-contract dependency.

## Git workflow

- Start from a clean branch named `codex/091-route-intervention-inventory`
  after all hard dependencies land.
- Make logical commits: domain contract; analytics repair; pipeline export;
  docs/plan receipt. Match the repository's imperative commit style (for
  example, `Export exact route intervention inventory`).
- Do not push, publish artifacts, mutate production, or open a PR unless the
  operator separately requests it.

## Steps

### Step 1: Freeze the exact identity and treatment crosswalk

1. Import the live exact route/presentation type introduced by the dependency;
   do not create another route ID type.
2. Add `route-treatment-crosswalk.ts` with the exact closed and reviewed-open
   mapping tables above plus tagged dispositions. Add the pure vocabulary
   collector and a command/test fixture that derives the complete sorted open
   set from the pinned corpus, Wiki artifacts, and trusted local rows. Require
   exact key-set equality before materialization and emit missing/extra values
   with per-source counts for review. Put labels/icons nowhere in analytics.
   The presentation taxonomy remains separate from Plan 090's study-analysis-
   family disposition bridge.
3. Generate the current vocabulary snapshot and review every row. Apply the
   binding seed decisions above; assign no unresolved literal by fallback. If
   any remaining literal's canonical meaning is uncertain, STOP for operator
   review before committing `REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1`.
4. Remove heuristic route aliasing from the normalized fact path. An exact
   projectable match succeeds; an unresolved source route becomes a typed
   reconciliation row with source vocabulary, raw ID, and reason.
5. Preserve the legacy analytics summary projection only where an existing
   internal consumer requires it. It must call the exact resolver and may not
   strip `+`, `-SBS`, zero padding, branch letters, or express suffixes.

**Verify**:
`bun test packages/analytics/test/route-treatment-crosswalk.test.ts tools/pipeline-v2/test/commands/studio/route-treatment-summary.test.ts --timeout 5000`
→ all pass, including B44/B44+, Q6/Q06, raw custom, and unknown-value cases.

### Step 2: Preserve normalized facts before deriving current state

1. Introduce an internal normalized fact with stable `treatmentId`, source
   record/component position, exact route ref, raw/canonical kind, family,
   lifecycle/date/scope fields, refs, occurrence IDs, and project IDs.
   Define IDs once in this module: `treatment:v1:<24-hex>` hashes the
   canonical JSON tuple of source
   namespace + immutable source record ID + component collection
   (`primary|custom|wiki|registry`) + zero-based component position + raw
   kind with SHA-256 and retains the first 24 lowercase hex characters;
   `occurrence:v1:<24-hex>` applies the same algorithm to source namespace +
   immutable producer occurrence/event/record ID + explicit producer phase or
   occurrence position + exact route ref + treatment ID.
   Preserve the original Wiki `occurrence_id` and local registry `event_id` as
   lineage fields. Dates, family, lifecycle ranking, and display labels are
   not ID inputs, so later corrections do not silently merge identities.
   Detect any 24-hex collision between unequal tuples and fail publication.
2. Change the reviewed-document adapter to emit every primary and custom
   treatment. A fixture with two primary and two custom treatments must emit
   four facts in deterministic source order.
3. Retain independent occurrences. Only a separate `currentState` reducer may
   status-rank facts; it returns references to every contributor and never
   erases the underlying facts.
4. Add characterization reconciliation over the current corpus: input
   treatment-component count equals mapped + explicitly-other + blocking
   unmapped counts. No row disappears because another family/status wins.

**Verify**:
`bun test packages/analytics/test/route-treatment-summary.test.ts --timeout 5000`
→ all preservation, occurrence-identity, and deterministic-order tests pass.

### Step 3: Define the strict public bundle and key modules

1. Add Effect schemas/types for bundle, route index, citywide facet index,
   reconciliation, source states, treatments, occurrences, project refs,
   current state, and source gaps. A route-index row's `sha256` is exactly 64
   lowercase hex characters and authenticates the canonical bytes at its
   `bundleKey`.
2. Use exact route identity/display data verbatim. Add all four key helpers —
   `routeInterventionInventoryBundleKey`,
   `routeInterventionInventoryIndexKey`, `interventionFacetIndexKey`, and
   `routeInterventionInventoryReconciliationKey` — plus a browser-safe
   package subpath for the key module.
3. Enforce bounded strings/arrays and strict excess-property rejection. Keep
   citations as keys/refs; do not copy full source excerpts.
4. Add round-trip, wrong-version, excess-field, missing-source-state,
   checked-empty, partial, multi-treatment facet, and forbidden-effect-field
   tests.

**Verify**: `bun --filter @bp/domain test` → exit 0.

### Step 4: Materialize one bundle per exact route, fail closed, and report loss

1. Add a pure builder in `tools/pipeline-v2/src/lib/route-intervention-inventory.ts`.
   Join normalized deterministic facts, the reviewed corpus, the exact route
   evidence v2 index/bundles, the v5 Wiki occurrence import, and local
   registry rows by stable IDs. A Wiki occurrence is display-eligible because
   its producer decision is approved in the pinned named release, not because
   a Tracker study candidate is approved. Candidate-set artifacts are not an
   accepted input type.
2. Required inputs are: strictly decoded Studio release metadata,
   `StudioInterventionCorpus`, `StudioRouteEvidenceIndexV2` plus every
   referenced v2 bundle, and
   `MtaWikiOperationalOccurrenceImportArtifactV5`. Require the route-evidence
   and occurrence artifacts to have the same Wiki release ID and manifest
   SHA, and require every projected occurrence exact route ref to resolve to
   the route-evidence identity. A missing, invalid, hash-mismatched,
   quarantined, or wrong-version required input fails before any final-path
   write. The local DB is optional as a source, but when present its
   `local_intervention_event` rows become explicit registry lineage; absence
   produces a `sourceStates` entry, never silent empty arrays.
3. Write every artifact to a same-directory temporary file, strict-decode and
   fsync it, then rename that file atomically. Promote route bundles first,
   compute each route-index `sha256` over the exact promoted bundle bytes,
   verify key/hash/byte-size agreement, then promote the route and facet
   indexes and reconciliation last. Never rename or
   replace the shared `studio/v2/routes` or `studio/v2/interventions`
   directories: they also contain dossiers, evidence, observations, and
   studies. Tests must seed unrelated sibling files and prove they survive a
   failed and successful rerun. Sort every array by documented stable keys and
   accept a fixed `generatedAt` in tests.
4. The reconciliation artifact reports source record/treatment/occurrence
   counts, mapped/other/unmapped counts, exact-route projection failures by
   reason, family/status counts, project/treatment/occurrence relationship
   counts, checked-empty route count, source availability, and the reviewed-
   open vocabulary hash/counts by source (never the raw source excerpts).
5. Add budgets: route index ≤320 KiB, facet index ≤2 MiB, and each compact
   route bundle ≤128 KiB. If a real artifact exceeds its cap, STOP and report
   its counts; do not truncate.

**Verify**:
`bun test tools/pipeline-v2/test/lib/route-intervention-inventory.test.ts --timeout 5000`
→ all pass, including missing required input, partial optional source, no
write-on-failure, byte determinism, and size budgets.

### Step 5: Add the export command and register the data product

1. Add `studio export-route-intervention-inventory` with optional `--db` and
   required `--release-artifact`, `--intervention-corpus`,
   `--route-evidence-index`, `--wiki-occurrences`, and `--artifact-root`, plus
   boolean `--check-vocabulary`. That mode prints deterministic JSON containing
   the collected literals, source counts, dispositions, missing keys, and
   extra keys, then exits before opening any output path; normal export runs
   the identical equality check before materialization.
   Release identity is inherited from the strict Studio release payload. The
   Wiki occurrence input must strict-decode specifically as v5 even though the
   current importer default filename retains `operational-occurrences-v3`.
   Do not add `--month`, `--release-id`, or `--published-at` overrides.
2. Register the command in CLI discovery tests and register exactly these
   stable products: `studio_route_intervention_inventory` (route bundles +
   route index), `studio_intervention_facet_index`, and
   `studio_intervention_inventory_reconciliation`. Declare corpus, route-
   evidence-v2, Wiki-occurrence-v5, Studio release, and optional local-event
   lineage inputs; add key, kind/version, count, hash, and byte-budget checks.
3. Run the command twice against fixtures with fixed time and compare hashes.
   If current local artifacts satisfy dependency versions, also run the real
   export and inspect only the machine-generated summary/counts.

**Verify**:

```sh
bun run pipeline -- studio export-route-intervention-inventory --help
bun run pipeline -- studio export-route-intervention-inventory --db data/local/pipeline.sqlite --release-artifact data/artifacts/studio/v1/release.json --intervention-corpus data/artifacts/studio/v2/interventions/corpus.json --route-evidence-index data/artifacts/studio/v2/wiki/index.json --wiki-occurrences data/artifacts/studio/v2/wiki/operational-occurrences-v3.json --artifact-root data/artifacts
bun --filter @bp/pipeline-v2 test
```

Expected: exit 0; CLI is discoverable, no identity override exists, and all
fixture-backed export/reconciliation tests pass.

### Step 6: Replace the historical design note with operational truth

Update the materializer note and CLI/runbook docs with:

- exact input artifacts and authority boundaries;
- public keys and generic R2 publication/seed flow;
- required versus optional sources and coverage-state meanings;
- reconciliation and size gates;
- explicit separation of project, treatment, occurrence, observation, and
  causal study;
- recovery procedure for an unmapped treatment or exact-route projection.

Append a concise receipt to `knowledge/log.md`; never paste source excerpts,
secrets, or absolute private worktree paths.

**Verify**: `bun run check:knowledge` → exit 0.

### Step 7: Run the full gate and record status

Run:

```sh
bun run check:types
bun run check:architecture
bun run check:style
bun run test:unit
bun run check
```

Expected: all exit 0. Update only Plan 091's status row in
`plans/README.md` and include generated counts/hashes in the implementation
receipt, not in this plan.

## Test plan

- Exact identity: B44/B44+, Q6/Q06, official labels, unresolved raw ID, and
  no suffix/zero-padding manufacture.
- Losslessness: 2 primary + 2 custom → 4 stable treatments; independent
  planned/implemented occurrences remain distinct; all source refs survive.
- Taxonomy: every closed document kind has one explicit disposition; reviewed
  open values from all three pinned source classes have one explicit
  disposition; missing and stale table keys are reported and block
  publication; no unseen value falls through to `other_documented`.
- Completeness: missing corpus/identity/release/evidence input fails before
  writes; optional table absence yields `partial` plus source state.
- Semantics: checked-empty differs from missing bundle; projects are refs,
  occurrences are not current-state rows, and effect fields are rejected.
- Determinism/budget: shuffled inputs produce identical bytes; all keys are
  stable; every route-index SHA-256 matches the exact bundle bytes;
  index/bundles remain within caps; unrelated sibling artifacts survive
  failure and rerun.
- Authority: v5 producer-approved occurrences may display without a Tracker
  study receipt; candidate-set/awaiting-approval artifacts and quarantined
  rc23 route projections are rejected as inputs.

## Done criteria

- [ ] External exact-route tests and all four Generation 11 dependency checks pass.
- [ ] Every reviewed treatment component is emitted or appears as a blocking reconciliation disposition; none is silently selected away.
- [ ] The reviewed-open disposition table exactly covers the generated union
      from corpus, Wiki, and trusted local inputs; missing/extra literals fail
      before writes and no raw string has an automatic fallback.
- [ ] Every projected route uses exact identity; no new-path join strips or manufactures route suffixes.
- [ ] Strict per-route bundle, compact route/facet indexes, reconciliation artifact, and browser-safe key helpers exist and round-trip.
- [ ] Every route-index row carries the canonical bundle's 64-hex SHA-256,
      byte size, and key; dangling or mismatched rows fail strict verification.
- [ ] Projects, treatments, occurrences, observations, and causal studies remain distinct; this artifact contains no observation/effect fields.
- [ ] Required source absence fails before writes; optional absence is explicit.
- [ ] Route evidence and operational occurrences are v2/v5 inputs from the
      same named Wiki release/manifest SHA; candidate-set artifacts cannot be
      decoded as inventory input.
- [ ] All four key helpers and all three stable data-product registrations
      exist, and per-file atomic writes preserve unrelated sibling artifacts.
- [ ] `bun run check` exits 0 with no new architecture/month-doctrine allowlist entry.
- [ ] No files outside Scope are modified; Plan 091 row is updated.

## STOP conditions

Stop and report if:

- the exact-route Tracker consumer is not merged or its B44/B44+ tests fail;
- plans 084/088/085/086 are not DONE;
- the live identity/release contract cannot express the target bundle without
  modifying the dependency's files;
- the Wiki occurrence source is not a producer-approved manifest-v5 import
  matching the route-evidence release/hash, or any candidate-set/
  `awaiting_approval` artifact is proposed as its substitute;
- any source treatment/occurrence disappears without a reconciliation reason;
- the generated open vocabulary contains a literal whose explicit canonical
  or `other_documented` disposition cannot be reviewed confidently;
- an executor would need prose substring matching, route-family matching, or
  observed performance values to choose a treatment mapping;
- a route bundle exceeds the size cap, an atomic-write test fails, or a
  verification command fails twice after a reasonable fix;
- implementation requires an out-of-scope Worker/D1/UI/source-record change.

## Maintenance notes

- Adding a source treatment value requires an explicit crosswalk disposition
  and fixture before publication. `other_documented` is visible preservation,
  not a place to hide known canonical kinds.
- A future new family can be displayable before it is observation- or
  study-supported. Plan 090/093 own those separate gates.
- Reviewers should scrutinize zero-loss reconciliation, exact-route joins,
  occurrence cardinality, and whether any current-state convenience reducer
  became the de facto source of truth.
- Do not add route-level treatment badges to segment rows. Only an
  independently evidenced segment-scope contract may do that.
