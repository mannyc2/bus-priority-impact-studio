---
title: Route Intervention Inventory Operations
type: engineering
status: active
last_updated: 2026-07-20
owner: codex
source_count: 0
tags: [studio, interventions, treatments, mta-wiki, r2, reconciliation]
---

# Route Intervention Inventory Operations

This page keeps the historical materializer filename for stable wiki links. Plan 091 replaces the
old release-month summary design with a lossless, per-route intervention inventory. The inventory
is an offline Studio artifact boundary; it is not a Worker endpoint, D1 table, observation store,
or causal result.

`plans/091-route-intervention-inventory.md` remains the executable implementation authority. This
page describes the operating contract and is not a completion receipt.

## Public artifact keys

The export writes one bundle per exact current route and three citywide artifacts:

```text
studio/v2/routes/<exact-route-slug>/intervention-inventory.json
studio/v2/interventions/route-inventory-index.json
studio/v2/interventions/facet-index.json
studio/v2/interventions/route-inventory-reconciliation.json
```

The route index is the discovery surface. It contains route identity, bundle key, exact bundle-byte
SHA-256, byte size, coverage state, compact family/state counts, and source-state summary. The
facet index contains citywide record facets, not source excerpts. A consumer must not infer an
empty inventory from a missing bundle or key.

## Authority and semantic boundaries

The inventory preserves concepts that answer different questions:

| Concept | Meaning in this boundary |
|---|---|
| Project | Lightweight relationship/context refs into the cited route-evidence bundle. Project membership never authorizes a treatment on a route. |
| Treatment | One lossless source component with stable identity, raw wording, reviewed semantic disposition, scope, dates, lineage, and related IDs. |
| Occurrence | A distinct producer-approved implementation or lifecycle event. It retains its own date, phase/state, route, treatment membership, and producer/local-registry lineage. |
| Current state | A derived grouping that references all contributing treatment and occurrence IDs. It never replaces those facts. |
| Observation | A measured value or before/after input. Observations do not belong in the inventory and are owned by the typed relevance/observation work. |
| Study | Eligibility, estimator, effect, verdict, or causal claim. Studies consume inventory facts later and never authorize inventory display. |

The schemas reject observation values, effect estimates, directions, verdicts, and causal language.
Route evidence remains the authority for full cited projects and citations; the inventory stores
only stable refs needed to join back to it.

## Required inputs

Normal export requires all of these inputs to decode strictly before any final-path write:

| CLI input | Authority |
|---|---|
| `--release-artifact` | Studio `releaseId`, `publishedAt`, and dataset `coverage`. These values are inherited unchanged. |
| `--intervention-corpus` | Strict reviewed Studio intervention corpus, including every primary and custom treatment component. |
| `--route-evidence-index` | Route-evidence-v2 index and every referenced exact-route bundle. It is the exact route identity/presentation authority and the pin for the Wiki named release and manifest SHA. |
| `--wiki-occurrences` | `MtaWikiOperationalOccurrenceImportArtifactV5`. A legacy-looking `operational-occurrences-v3.json` filename is acceptable only when the decoded contract is v5. |
| `--mta-wiki-root` | Local mta-wiki checkout containing the immutable named release derived from the route-evidence index. The operator does not supply a second release/hash override. |
| `--artifact-root` | Local artifact root under which the four public key families are written. |

Under `<mta-wiki-root>/data/exports/releases/<derived-release>/`, the exporter verifies the same
manifest-v5 pin for these producer artifacts:

- `treatment_components.jsonl` — lossless treatment records and raw wording;
- `treatment_semantics.json` — record-scoped `atomic`, `bundle`, or `unresolved` dispositions;
- `route_treatment_scopes.jsonl` — the only producer-approved treatment-to-exact-route authority;
- `route_treatment_scope_reconciliation.jsonl` — every treatment without projectable route
  authority.

The current compatible producer candidate is `v1-rc25`, but the exporter derives the named release
and manifest SHA from the strict route-evidence index. It must not consult `LATEST`, accept a
neighboring release, or mix route evidence, occurrences, semantics, and scopes from different
manifests.

`--db` is optional. When supplied, trusted `local_intervention_event` rows add explicit registry
lineage. When omitted or unavailable, the local-registry source state is explicit and affected
routes are partial; empty local arrays are not silently treated as a successful check.

## Treatment and exact-route policy

Producer semantics are fail-closed:

- `atomic` supplies a reviewed canonical kind and family;
- `bundle` preserves every source-backed member rather than flattening to one family;
- `unresolved` retains the exact literal, record IDs, and review reason as reconciliation/source-gap
  evidence.

An rc25 `unresolved` disposition is never coerced to `other_documented`, guessed from prose, or
treated as an atomic kind. Route-relevant unresolved semantics make coverage partial. Unscoped
treatments remain in producer and Tracker reconciliation; they are not fanned out through a shared
project or program.

Only `route_treatment_scopes.jsonl` may authorize a treatment on an exact route. Route IDs are
case-sensitive source identities. Do not strip or manufacture `+`, `-SBS`, zero padding, branch
letters, or express suffixes. Project refs are context only.

## Coverage states

Every projectable exact current route gets a bundle, including checked-empty routes:

| State | Meaning |
|---|---|
| `available` | Required sources decoded and reconciled, configured source states are usable, and the route has represented positive inventory without a route-relevant unresolved gap. |
| `partial` | Represented evidence exists but an optional source is unavailable/omitted, a route-relevant producer semantic is unresolved, or another explicit source gap limits coverage. |
| `checked_no_positive_evidence` | Required and configured optional sources were successfully checked for the exact route and produced no positive inventory or unresolved route-specific gap. |

`checked_no_positive_evidence` means “checked and none found,” not “no intervention exists.” A
missing bundle, failed decode, mismatched manifest, or failed route projection is never this state.

## Reconciliation and publication gates

The reconciliation artifact accounts for source records, treatment components, occurrences,
relationships, exact-route projections, semantic dispositions, source states, and checked-empty
routes. Every input component is represented in a route bundle/facet or in a typed reconciliation
reason. Status ranking may produce `currentState`, but it must not delete an underlying fact.

Publication fails before final-path writes for an invalid required input, manifest/hash mismatch,
wrong occurrence version, unexplained record loss, new unreviewed consumer vocabulary, unequal
stable-ID tuples sharing a hash, or an unresolved exact-route projection.

Size gates are measured on canonical bytes:

| Artifact | Maximum |
|---|---:|
| One route bundle | 128 KiB |
| Route inventory index | 320 KiB |
| Citywide facet index | 2 MiB |

Do not truncate to meet a budget. Report the failing counts and redesign the compact projection.

Each file is written to a same-directory temporary path, strict-decoded, flushed, and atomically
renamed. Route bundles are promoted first; their exact bytes determine the route-index hashes.
Indexes and reconciliation are promoted last. The exporter never replaces
`studio/v2/routes/` or `studio/v2/interventions/` as directories, because unrelated dossiers,
evidence, observations, and studies share those prefixes.

## Export and vocabulary preflight

Use the same inputs for review and export:

```bash
bun run pipeline -- studio export-route-intervention-inventory \
  --release-artifact <studio-release.json> \
  --intervention-corpus <studio-intervention-corpus.json> \
  --route-evidence-index <route-evidence-v2-index.json> \
  --wiki-occurrences <operational-occurrence-import-v5.json> \
  --mta-wiki-root <mta-wiki-checkout> \
  --artifact-root data/artifacts \
  --check-vocabulary

bun run pipeline -- studio export-route-intervention-inventory \
  --release-artifact <studio-release.json> \
  --intervention-corpus <studio-intervention-corpus.json> \
  --route-evidence-index <route-evidence-v2-index.json> \
  --wiki-occurrences <operational-occurrence-import-v5.json> \
  --mta-wiki-root <mta-wiki-checkout> \
  --artifact-root data/artifacts \
  --db data/local/pipeline.sqlite
```

`--check-vocabulary` exits before opening output paths. Neither mode accepts `--month`,
`--release-id`, `--wiki-release`, `--wiki-manifest-sha256`, or `--published-at`; those values come
from strict pinned artifacts.

## R2 publication and local seeding

No inventory-specific uploader is needed. The generic R2 publisher recursively walks the entire
`studio` prefix, so nested per-route bundles and the citywide indexes are included with their public
keys. Dry-run and review the candidate list before remote mutation:

```bash
bun run pipeline publish r2-artifacts \
  --month <coverage-end-YYYY-MM> \
  --bucket bus-priority-artifacts \
  --dry-run
```

The month selects the already-built release partition for the coordinated publisher; it does not
become inventory identity. Use the reviewed serving-release flow for execution.

For local Worker/R2 development, this command recursively seeds `data/artifacts/studio`:

```bash
bun run seed:local-studio-r2
```

## Recovery

### New or unmapped treatment value

1. Stop publication; do not edit generated bundles or add a catch-all mapping.
2. Run `--check-vocabulary` and inspect the sorted source counts and reconciliation reason.
3. If the pinned producer marks the record `unresolved`, preserve it as a source gap/partial route
   until mta-wiki publishes a reviewed atomic or bundle disposition in a new immutable release.
4. If a trusted consumer source introduced the literal, add an explicit reviewed disposition and
   fixture; never default it to `other_documented`.
5. Regenerate the pinned inputs, rerun vocabulary/reconciliation checks, then export again.

### Exact-route projection failure

1. Stop publication and retain the raw source route plus typed failure reason in reconciliation.
2. Verify the route-evidence-v2 identity and producer route scope are from the same manifest.
3. Correct the authoritative route identity/scope upstream and produce a new immutable Wiki release
   or corrected strict Tracker import. Do not family-match or borrow a project member's route.
4. Reimport route evidence and occurrences from that same release/hash, then rerun the full export.

Safe reruns may replace individual inventory files atomically, but must preserve unrelated siblings
under the shared Studio prefixes.

## See also

- `plans/091-route-intervention-inventory.md`
- [[wiki/engineering/cloudflare_operations_runbook|Cloudflare Operations Runbook]]
- [[wiki/engineering/cli_commands|CLI Commands]]
- [[wiki/engineering/mta_wiki_rc22_consumer|MTA Wiki Consumer Boundary]]
