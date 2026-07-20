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

## Four separate evidence lanes

| Lane | Authority | What it may assert |
|---|---|---|
| Event anchor | Strictly decoded Plan 091 occurrence and treatment rows, including exact route identity and optional trusted local-registry lineage | What happened, on which route, when, and from which reviewed source |
| Relevance spec | `@bp/analytics/intervention-evidence` | Which canonical products and metrics are relevant, their role, route-scope policy, display window, and claim ceiling |
| Observation bundle | `@bp/domain/studio/intervention-observations`, materialized offline by `tools/pipeline-v2` | Actual time-series values, explicit null gaps, coverage, and provenance for the selected bindings |
| Causal study | Existing gated `StudyArtifact` and route-study artifacts | A reviewed estimate, confidence interval, direction, and study verdict |

These lanes remain distinct. The route intervention inventory does not contain observations, the
observation bundle does not contain before/after summaries or study verdicts, and a displayed date
or series is not evidence that an intervention caused a change.

## Value-blind selection

The relevance lookup receives only the canonical Plan 091 treatment kind. It selects bindings from
reviewed treatment-family metadata, scope, registered product metadata, and coverage requirements
before any route-month values are read. Magnitude, sign, apparent direction, null result, p-value,
or study verdict never changes which series is selected, its role, its order, or its limitation
language.

Version 1 supports only route-scoped `automated_bus_lane_enforcement`. The fixed bindings are:

| Binding | Product and resolver | Metric and source field | Role | Public label and unit | Claim ceiling | Priority |
|---|---|---|---|---|---|---:|
| `route_speed_around_implementation_v1` | `local_route_month_trends_history` through `sqlite.local_route_month_trend.history.v1` | `route_average_speed_mph` from `average_speed_mph` | `primary_outcome` | Observed average speed (`mph`) | `descriptive_observation` | 1 |
| `route_ridership_around_implementation_v1` | `local_route_month_trends_history` through `sqlite.local_route_month_trend.history.v1` | `route_monthly_ridership` from `ridership` | `context` | Monthly riders (`riders`) | `descriptive_observation` | 2 |

Both bindings use the registered `route_metric_history` feature contract and a 25-month inclusive
display window: 12 months before the implementation month, the implementation month, and 12 months
after. Every requested month is present. Missing data stays visible as a null point, and coverage
determines whether a series is `available`, `partial`, or `missing`.

Every other admitted canonical treatment kind is explicit
`unsupported_treatment_family`, with a null analysis family and no series. There is no generic
"route interventions use speed" fallback and no inference from titles, descriptions, projects, or
other prose. A non-route scope is likewise explicit `unsupported_scope`; it is not projected onto a
route.

## Trusted event admission

An inventory occurrence may enter observation materialization only when it retains trusted
`local_intervention_event` registry lineage. The pipeline replays that lineage through the same
`admitTrustedRegistryStudyEvent` gate used by study-event candidate generation, then cross-checks
the admitted route and implementation date/month against the exact Plan 091 occurrence.

The shared gate rejects these conditions:

- `untrusted_or_retired_registry_source`
- `registry_event_not_implemented`
- `unsupported_treatment_family`
- `invalid_registry_implementation_date`
- `registry_month_date_mismatch`
- `missing_route_id`

Rejected registry anchors are counted in deterministic operational summaries, including every
applicable reason, but they never appear in a route bundle or the citywide observation index. Gate
admission occurs once per occurrence before treatment fan-out. An admitted occurrence produces one
uniquely keyed observation event for each exact `(occurrenceId, treatmentId)` pair. An admitted
non-ACE study family may become an explicit unsupported relevance entry; a row rejected by the
shared gate does not.

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
| `tools/pipeline-v2` | Strictly verifies the release and Plan 091 inventory, replays trusted admission, loads `local_route_month_trend`, resolves the fixed bindings, validates outputs, and writes deterministic JSON. |
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

Add another treatment family only through a reviewed extension:

1. Register the required canonical data product and feature contract first.
2. Add a treatment-family relevance spec that references only registered product and feature IDs;
   do not add SQL expressions or arbitrary source-field paths.
3. Add registry consistency, strict artifact, coverage, admission, and value-invariance tests.
4. Preserve explicit unsupported behavior for every family that is not reviewed.
5. Add a renderer only after the contract and deterministic materializer pass their gates.

Never infer relevance from prose or from the observed effect magnitude. If an upstream release,
inventory bundle, hash, exact route identity, registry lineage, trend table, or feature contract is
missing or invalid, rebuild that prerequisite through its documented upstream workflow instead of
hand-authoring metadata or weakening the gate.

## See also

- [[wiki/engineering/route_treatment_summary_materializer_plan|Route Intervention Inventory Operations]]
- [[wiki/engineering/cli_commands|CLI Commands]]
- [[wiki/engineering/cloudflare_operations_runbook|Cloudflare Operations Runbook]]
- `plans/090-structured-intervention-observations.md`
