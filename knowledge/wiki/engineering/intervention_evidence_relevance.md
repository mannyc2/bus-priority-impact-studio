---
title: Intervention Evidence Relevance
type: engineering
status: active
last_updated: 2026-07-20
owner: codex
source_count: 0
tags: [studio, interventions, observations, analytics, evidence, r2]
---

# Intervention Evidence Relevance

The Studio materializes intervention observations through a reviewed, value-blind contract. Source
evidence establishes what happened, relevance metadata selects the allowed data products, and an
offline pipeline resolves those selections into route observation artifacts. This boundary does not
estimate an effect or authorize causal language.

## Separate display, observation, and study gates

| Gate | Authority | Admission | What it may assert |
|---|---|---|---|
| Inventory display | Strict Plan 091 treatment and occurrence rows | Reviewed source lineage and exact route/treatment/occurrence identity | What was documented, its lifecycle, place, date precision, and source state |
| Descriptive observation | `@bp/analytics/intervention-evidence` plus the pure Plan 093 observation-anchor gate | Supported canonical kind, operational lifecycle, day/month date, usable reviewed source, admitted scope, and exact route identity | Which predeclared route series may be shown around the occurrence, with null gaps and factual coverage |
| Causal study | Existing study candidate, approval, overlap, and estimator gates | The unchanged stricter study contract | A reviewed estimate, interval, direction, and study verdict |

The inventory can display more kinds than the observation layer supports, and observation admission
does not imply study eligibility. The observation gate is deliberately separate from
`study-events.ts`; Plan 093 neither imports it there nor relaxes its source, treatment, date, or
approval rules. ACE observations additionally replay the legacy trusted-registry admission so Plan
090 behavior remains stable.

## Exhaustive treatment coverage

This table is the human-readable form of the sorted
`serializeInterventionRelevanceCoverageMatrix()` output. Tests require the registry to contain
exactly one row for every canonical Plan 091 kind.

| Treatment kind | Disposition | Spec or reason |
|---|---|---|
| `all_door_boarding` | blocked | `stop_dwell_boarding_contract_required` |
| `automated_bus_lane_enforcement` | supported | `automated_bus_lane_enforcement_route_observations_v1` |
| `bench` | not relevant | `passenger_amenity_not_route_operation` |
| `bus_bulb` | blocked | `stop_dwell_boarding_contract_required` |
| `bus_lane` | supported | `bus_lane_route_observations_v1` |
| `bus_shelter` | not relevant | `passenger_amenity_not_route_operation` |
| `bus_stop_adjustment` | blocked | `stop_dwell_boarding_contract_required` |
| `busway` | supported | `busway_route_observations_v1` |
| `capital_project_milestone` | not relevant | `timeline_only_without_typed_treatment` |
| `curb_extension` | blocked | `physical_scope_product_required` |
| `curb_regulation` | blocked | `curb_scope_product_required` |
| `fare_machine_installation` | blocked | `stop_dwell_boarding_contract_required` |
| `frequency_change` | blocked | `route_lineage_comparability_required` |
| `high_visibility_crosswalk` | not relevant | `street_safety_not_route_operation` |
| `left_turn_bay` | blocked | `physical_scope_product_required` |
| `neckdown` | blocked | `physical_scope_product_required` |
| `off_board_fare_collection` | blocked | `stop_dwell_boarding_contract_required` |
| `other_documented` | blocked | `canonical_treatment_semantics_required` |
| `pedestrian_improvement` | not relevant | `street_safety_not_route_operation` |
| `pedestrian_island` | not relevant | `street_safety_not_route_operation` |
| `planting` | not relevant | `passenger_amenity_not_route_operation` |
| `queue_jump` | blocked | `signal_inventory_contract_required` |
| `real_time_passenger_information` | not relevant | `passenger_information_not_route_operation` |
| `red_paint` | blocked | `dated_operational_occurrence_required` |
| `resurfacing` | not relevant | `maintenance_activity_not_typed_operational_treatment` |
| `route_redesign` | blocked | `route_lineage_comparability_required` |
| `select_bus_service` | blocked | `service_package_decomposition_required` |
| `signal_retiming` | blocked | `signal_inventory_contract_required` |
| `stop_change` | blocked | `stop_dwell_boarding_contract_required` |
| `stop_consolidation` | blocked | `stop_dwell_boarding_contract_required` |
| `stop_relocation` | blocked | `stop_dwell_boarding_contract_required` |
| `transit_signal_priority` | blocked | `signal_inventory_contract_required` |
| `truck_loading_zone` | blocked | `curb_scope_product_required` |
| `turn_restriction` | blocked | `physical_scope_product_required` |
| `wayfinding_sign` | not relevant | `passenger_information_not_route_operation` |

Blocked reasons name the contract that must exist before another family can be reviewed:

| Reason | Required unlock |
|---|---|
| `canonical_treatment_semantics_required` | Review the preserved raw label into a canonical kind and register that kind's data contract. |
| `curb_scope_product_required` | Register a dated curb-segment inventory, exact route projection, and matching curb or travel-time history. |
| `dated_operational_occurrence_required` | Publish a reviewed day- or month-precision occurrence with exact route and source lineage. |
| `physical_scope_product_required` | Map physical scope to stable served segment or stop IDs and register a matching historical metric product. |
| `route_lineage_comparability_required` | Prove longitudinal route-lineage comparability across the change. |
| `service_package_decomposition_required` | Resolve the package to dated typed operational occurrences. |
| `signal_inventory_contract_required` | Register a current dated signal/queue-jump inventory with exact route/intersection projection and an appropriate metric product. |
| `stop_dwell_boarding_contract_required` | Register stop-level dwell or boarding history, exact stop identities, and a dated operational occurrence. |

## Value-blind first specifications

The relevance lookup receives only typed occurrence metadata. It fixes the product, feature grain,
resolver, metric, scope role, window, claim ceiling, and display priority before any route-month
values are read. Magnitude, sign, apparent direction, completeness beyond the declared minimum,
p-value, and study result cannot change selection or ordering.

| Kind | Speed binding | Ridership binding | Route speed role | Corridor/segment speed role |
|---|---|---|---|---|
| ACE | `route_speed_around_implementation_v1` | `route_ridership_around_implementation_v1` | primary outcome | blocked |
| Bus lane | `bus_lane_route_speed_around_implementation_v1` | `bus_lane_route_ridership_around_implementation_v1` | primary outcome | context, with scope limitation |
| Busway | `busway_route_speed_around_implementation_v1` | `busway_route_ridership_around_implementation_v1` | primary outcome | context, with scope limitation |

All six bindings use `local_route_month_trends_history`, feature grain `route_metric_history`, and
resolver `sqlite.local_route_month_trend.history.v1`. Speed uses
`route_average_speed_mph`; ridership uses `route_monthly_ridership`. Each keeps a 25-month inclusive
window (implementation month ±12), explicit null months, at least one observed month, and the
`descriptive_observation` claim ceiling. Route-level metrics around corridor/segment work are
labeled context and carry: “Route-level observations are context for a treatment scoped below the
full route.” `source_only` and intersection scopes receive no guessed values.

## Descriptive anchor admission

The pure observation gate works over strictly decoded Plan 091 bundles and resolves one exact
`(routeId, occurrenceId, treatmentId)` anchor at a time. It admits only supported kinds with
`current_confirmed`, `implemented`, or `historical_confirmed` lifecycle; canonical day/month dates;
usable reviewed source refs; route identity equal to the containing bundle; and a scope admitted by
the selected spec. Exact duplicates are counted and removed, but same-date or same-family events
remain distinct.

Tagged rejections include `unsupported_treatment_kind`, `non_operational_lifecycle`,
`date_precision_insufficient`, `source_unavailable`, `scope_unresolved`,
`route_identity_mismatch`, and `occurrence_treatment_mismatch`. ACE then passes through the existing
trusted-registry admission, retaining its established rejection taxonomy. All rejection reasons
are reported in deterministic export summaries before observation values are loaded; rejected
anchors never become generic route-speed events.

## Artifact contract and ownership

The materializer writes:

```text
studio/v2/routes/<exact-route-slug>/intervention-observations.json
studio/v2/interventions/observation-index.json
```

Route bundles preserve the exact Plan 091 route identity and slug, exact occurrence and treatment
IDs, fixed ordered input references, series points, coverage, and factual limitations. The compact
index repeats event identity, anchor fields, resolution status, available metric IDs, and bundle
keys, but carries no series values or effect summaries.

| Layer | Responsibility |
|---|---|
| `@bp/analytics/intervention-evidence` | Owns the closed treatment-kind dispositions, reviewed binding specs, and product/feature consistency checks. |
| `@bp/domain/studio/intervention-observations` | Owns strict JSON schemas, caps, identity/coverage invariants, and public artifact keys. It imports no analytics or pipeline code. |
| `tools/pipeline-v2` | Strictly verifies the release and Plan 091 inventory, resolves the descriptive gate and ACE compatibility gate before loading `local_route_month_trend`, validates outputs, and writes deterministic JSON. |
| `apps/web` and other consumers | Read domain-typed artifacts from the existing generic Studio artifact path. They do not import analytics or pipeline code and do not derive markers from prose. |

Every bundle and the index carry the same two ordered inputs: the Plan 091 route intervention
inventory as `event_anchor`, then `local_route_month_trends_history` as `observation_source` with
the live route-metric-history feature grain and resolver. Publication identity comes only from a
strictly decoded post-Plan-086 `StudioReleasePayload`: its `releaseId` and `publishedAt` are copied
unchanged. The export command has no independent release-ID or publication-time flags.

The keys already live under the recursively published `studio` prefix. No observation-specific
Worker endpoint, D1 table, R2 uploader, or bucket binding is required.

## Claim language

An observation chart may label a value as "observed," name its metric, report factual coverage, and
mark a reviewed implementation date. It may not report an effect number, before/after delta,
direction, verdict, or causal interpretation from this artifact. Only a separately gated
`StudyArtifact` may supply those claims.

## Extension recipe

Add one treatment family at a time through a reviewed extension:

1. Name the authoritative typed occurrence source, operational lifecycle states, date precision,
   exact entity join, and required lineage. Do not infer any of them from project titles or prose.
2. Register the canonical product, feature grain, resolver, metric, and unit before adding a spec.
3. Fix admitted physical scopes, route/context role, method limitation, implementation-centered
   window, minimum coverage, null policy, claim ceiling, and presentation priority before reading
   values.
4. Add the stable spec and binding IDs, update exactly one exhaustive disposition row, and keep raw
   `other_documented` labels blocked until they receive canonical semantics.
5. Add registry consistency, gate rejection, strict artifact, coverage, exact-identity, and
   rising/falling/flat/null-heavy value-invariance tests.
6. Add a typed renderer label and annotation stem only after the deterministic materializer passes;
   unsupported or unavailable cases must retain the ordinary zero-marker fallback.

Never infer relevance from prose or from the observed effect magnitude. If an upstream release,
inventory bundle, hash, exact route identity, registry lineage, trend table, or feature contract is
missing or invalid, rebuild that prerequisite through its documented upstream workflow instead of
hand-authoring metadata or weakening the gate.

## See also

- [[wiki/engineering/route_treatment_summary_materializer_plan|Route Intervention Inventory Operations]]
- [[wiki/engineering/cli_commands|CLI Commands]]
- [[wiki/engineering/cloudflare_operations_runbook|Cloudflare Operations Runbook]]
- `plans/090-structured-intervention-observations.md`
