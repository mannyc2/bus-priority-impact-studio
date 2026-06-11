---
title: Route Treatment Summary Materializer Plan
type: engineering
status: planning
last_updated: 2026-06-06
owner: codex
source_count: 0
tags: [snapshot-2, treatments, interventions, tier2, tsp, d1, r2, detectors]
---

# Route Treatment Summary Materializer Plan

## Purpose

Build the deterministic treatment-state layer that sits between the existing intervention evidence
and the public route/corridor product.

This is **not** a new broad extraction pass. The project already has useful intervention evidence:

- Tier 2 generated intervention/event rows;
- reviewed document intervention records;
- publishable per-route intervention projections;
- ACE/ABLE route-month evidence;
- DOT bus-lane route-shape overlap;
- dated TSP source-snapshot evidence;
- local intervention events and comparison windows.

The missing layer is a normalized read model that answers:

> For this route, month, segment, and treatment family, what do we know is current, historical,
> planned, candidate, source-gapped, or evaluation-ready?

## Current Inputs

| Input | Current role | Notes |
|---|---|---|
| `intervention-publishable-v1.json` | Reviewed, source-backed document interventions. | 70 publishable records across 113 routes in the current artifact. |
| `intervention-publishable-v1-by-route.json` | Per-route projection of publishable document interventions. | Good route-level starting point for timelines and treatment components. |
| `tier2-intervention-events-combined.json` | Generated/dispositioned intervention/event rows. | Discovery/backlink layer; not all rows are public interventions. |
| `local_tier2_intervention_event*` | Local staging tables for promoted Tier 2 events. | Good route/event/source-span shape, but still separate from as-of treatment state. |
| `local_intervention_event` | Canonical local intervention events. | Already exported to D1 `intervention_event`. |
| `local_route_intervention_comparison` | Route/month event-study/comparison windows. | Already exported to D1 `route_intervention_comparison`. |
| ACE/ABLE routes and violations | Deterministic enforcement treatment state. | Route/month state and implementation timing are stronger than prose. |
| DOT bus-lane geometry overlap | Deterministic route/segment treatment context. | Route-shape overlap, not audited regulatory lane mileage. |
| `tspEvidenceIndex()` output | Dated 2017 TSP source-snapshot match. | Historical/candidate/unknown posture; current authoritative inventory remains missing. |
| TSP source-gap research | Current inventory gap and aggregate-count evidence. | Should produce source-gap rows, not current installed rows. |

The existing Studio release builder already preserves the distinction:

```text
Interventions are curated, source-backed changes.
Treatments are as-of state snapshots, such as DOT bus-lane overlap, ACE route-month coverage, or TSP source status.
```

This plan builds the missing treatment-state snapshot.

## Non-Goals

- Do not rerun Tier 2 extraction just to create this layer.
- Do not ask an LLM to decide whether a treatment is current.
- Do not collapse historical TSP, planned TSP, source-gap TSP, and current-confirmed TSP into one
  boolean.
- Do not treat bus-lane route-shape overlap as audited lane mileage.
- Do not treat missing public TSP evidence as proof there is no TSP.
- Do not publish raw Tier 2 rows or local artifact paths as public facts.

## Ownership Decision

This materializer should have a fixed owner, not a conditional one.

Package-owned logic lives in:

```text
packages/applied-research/src/treatments/
```

Exported as:

```text
@bp/applied-research/treatments
```

That subpath owns the pure, deterministic treatment-state model:

- canonical treatment vocabulary;
- source-family status mapping;
- source-strength ordering and merge rules;
- route/month treatment rows;
- route/segment treatment rows;
- explicit source-gap rows;
- artifact summary construction;
- validation/audit issue construction.

This is not detector logic. Detectors consume treatment rows after they are materialized. A detector can
say "this route has high pain and no known current treatment" only after the treatment materializer has
distinguished `not_found` from `source_gap`, historical evidence, candidate evidence, and not-applicable
source families.

Boundary:

| Layer | Owns |
|---|---|
| `@bp/applied-research/treatments` | Pure treatment vocabulary, status policy, merge policy, artifact row construction, validation. |
| `@bp/applied-research/local-db` | SQLite row loading for ACE/ABLE, bus lanes, route catalog, intervention events, comparison rows, Tier 2 staging tables, and source-status probes. |
| `@bp/applied-research/artifacts` | Route-treatment artifact path/key conventions. |
| `tools/pipeline-v2/src/commands/studio/route-treatment-summary.ts` | CLI flags, local DB opening, JSON/Markdown file reads/writes, command output. |
| `packages/domain/src/studio/` | Public serving schema once the artifact shape stabilizes. |
| `packages/db` | D1 schema/query/export support once the serving row shape stabilizes. |
| `packages/analytics` detectors | Read materialized treatment features; never build the treatment inventory. |

## Treatment Vocabulary

Use a deterministic canonical treatment vocabulary. Unknown source phrases map only through an
approved alias table or stay as `custom_treatment`.

Initial canonical values:

| Treatment type | Sources |
|---|---|
| `bus_lane` | DOT bus-lane geometry, Tier 2 records, bus-priority PDFs. |
| `busway` | DOT busway pages/PDFs, Tier 2 records. |
| `automated_bus_lane_enforcement` | ACE/ABLE route dataset, MTA ACE pages, comparison rows. |
| `transit_signal_priority` | TSP source snapshots, TSP acquisition/source-gap records, Tier 2 records. |
| `select_bus_service` | SBS route pages, launch docs, Tier 2 records. |
| `queue_jump` | Project PDFs and treatment component records. |
| `stop_change` | Redesign docs, GTFS validation, Tier 2 records. |
| `route_redesign` | Borough redesign docs and implementation schedules. |
| `all_door_boarding` | SBS/fare policy sources. |
| `off_board_fare_collection` | SBS/fare policy sources. |
| `capital_project_milestone` | Capital dashboard/board materials where route/corridor link is valid. |
| `source_gap` | Explicit missing inventory/evaluation/status evidence. |
| `custom_treatment` | Source-backed treatment not yet in the canonical vocabulary. |

## Status Model

Treatment status is not a single yes/no.

| Status | Meaning |
|---|---|
| `current_confirmed` | Current authoritative source confirms active treatment as of `statusAsOf`. |
| `implemented` | Source says treatment was implemented/completed, but current as-of status may be unknown. |
| `historical_confirmed` | Historical source confirms the treatment existed during a period. |
| `planned` | Source gives planned future implementation. |
| `proposed` | Source proposes or recommends treatment without commitment. |
| `under_consideration` | Source says treatment is being studied or included in toolkit/scoping. |
| `candidate` | Indirect or partial evidence suggests a candidate needing validation. |
| `source_gap` | Source or audit proves required treatment data is missing/undisclosed. |
| `not_found` | The materializer checked the relevant source family and found no positive evidence. |
| `not_applicable` | Treatment/source family intentionally does not apply to the route/scope. |

TSP mapping rules:

| Evidence | Treatment status |
|---|---|
| Current DOT/MTA inventory with active status | `current_confirmed` |
| 2017 installed/source-snapshot route match | `historical_confirmed` plus `current_status_unknown` caveat |
| 2017 candidate/planned route match | `planned` or `candidate`, depending on source wording |
| Streets Plan/MTA aggregate counts without location list | `source_gap` |
| DOT PMMR/testimony says "studying" | `under_consideration` |
| Speed anomaly only | `candidate`, never `implemented` |

## Output Contracts

### `route_treatment_summary`

One compact route/month/treatment row for public routing, `/routes` sections, compare, and detector
admission.

```ts
type RouteTreatmentSummaryRow = {
  routeId: string;
  month: string;
  treatmentType: string;
  status: string;
  statusAsOf: string | null;
  effectiveDate: string | null;
  datePrecision: "day" | "month" | "season" | "year" | "range" | "unknown";
  geographyScope: "route" | "corridor" | "segment" | "intersection" | "source_only";
  sourceRefs: string[];
  evidenceLabel:
    | "deterministic_source"
    | "reviewed_document"
    | "historical_snapshot"
    | "aggregate_source_gap"
    | "candidate_inferred"
    | "not_found";
  confidence: "high" | "medium" | "low";
  caveats: string[];
  methodLimitations: string[];
  relatedEventIds: string[];
};
```

### `route_segment_treatment_summary`

Segment-level treatment state for slow-segment rows and treatment-gap ranking.

```ts
type RouteSegmentTreatmentSummaryRow = RouteTreatmentSummaryRow & {
  segmentId: string;
  directionId: string | null;
  segmentOrder: number | null;
  matchMethod:
    | "route_level"
    | "route_shape_overlap"
    | "segment_endpoint_text_match"
    | "intersection_geometry"
    | "source_only"
    | "not_matched";
  overlapShare: number | null;
};
```

### `route_treatment_source_gap`

Explicit missing-data rows for Data Notes and source-gap findings.

```ts
type RouteTreatmentSourceGapRow = {
  routeId: string | null;
  month: string;
  treatmentType: string;
  gapKind:
    | "current_inventory_missing"
    | "implementation_date_missing"
    | "route_mapping_missing"
    | "intersection_geometry_missing"
    | "evaluation_missing"
    | "status_currentness_unknown";
  sourceRefs: string[];
  publicStatement: string;
  blocksClaims: string[];
};
```

## Materializer Design

Add a new pipeline command:

```sh
bun --filter @bp/pipeline-v2 cli -- studio route-treatment-summary \
  --year 2026 \
  --month 3 \
  --tier2-publishable-path data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json \
  --tier2-by-route-path data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-publishable-v1-by-route.json \
  --tsp-source-path knowledge/raw/downloads/... \
  --output data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json
```

Implementation placement:

- pure package logic in `@bp/applied-research/treatments`;
- local SQLite readers in `@bp/applied-research/local-db`;
- artifact path helpers in `@bp/applied-research/artifacts`;
- pipeline command in `tools/pipeline-v2/src/commands/studio/`;
- domain contracts in `packages/domain/src/studio/` once serving API needs them;
- D1 export support only after JSON artifact shape stabilizes.

High-level flow:

1. Load route universe for the release month.
2. Load Tier 2 publishable intervention records and per-route projection.
3. Load local deterministic treatment state:
   - ACE/ABLE route status and comparison rows;
   - DOT bus-lane route/segment overlap already computed for Studio release;
   - TSP source-snapshot evidence from `tspEvidenceIndex()`;
   - local `intervention_event` and `route_intervention_comparison` rows.
4. Normalize treatment types through a fixed map.
5. Normalize statuses through source-specific status rules.
6. Emit route-level summary rows.
7. Emit segment-level rows only where geometry/match method supports the grain.
8. Emit source-gap rows for known missing layers, especially current TSP inventory and missing
   implementation dates.
9. Write artifact, Markdown summary, and validation report.

## Deterministic Merge Rules

Use monotonic evidence strength. Stronger evidence can refine weaker evidence, but weaker evidence
must not overwrite stronger evidence.

Strength order:

1. `current_confirmed` from current authoritative inventory.
2. deterministic source rows with explicit status/date, such as ACE route records.
3. reviewed document intervention records.
4. historical source snapshots.
5. planned/proposed/under-consideration source statements.
6. aggregate source-gap records.
7. candidates.
8. not-found rows.

Merge keys:

```text
routeId + month + treatmentType + geographyScope + optional segmentId
```

Dedup hints:

- preserve all source refs;
- prefer exact day over month, month over season/year, and dated source over undated source;
- do not merge planned and implemented rows unless the same source-backed event has a status history
  connecting them;
- do not merge route-level and segment-level rows into one fact;
- do not infer currentness from old implementation evidence.

## Serving Integration

Phase 1: artifact only.

- Produce JSON + Markdown summary.
- Use it for audits, route evidence packets, and detector input review.

Phase 2: D1 compact rows.

- Add D1 table(s) after artifact shape stabilizes.
- Export from `export d1`.
- Verify with `verify d1` and route surface audits.

Phase 3: Worker/API.

- Add route-scoped endpoint or embed in route detail:

```text
GET /api/v1/studio/routes/:routeId/treatments
```

- Compare endpoint consumes compact route treatment rows.
- `/routes` Treatment Gaps section consumes treatment summary counts/scores.

Phase 4: UI.

- Interventions tab reads `route_treatment_summary`.
- Slow Segments tab uses `route_segment_treatment_summary`.
- Data Notes shows `route_treatment_source_gap`.
- Keep current design elements; replace data backing before changing layout.

## Detector Integration

The materialized rows should feed:

| Detector | Use |
|---|---|
| `intervention_gap` | High rider pain plus weak/unknown treatment state. |
| `intervention_underperformance` | Treatment exists but route/segment remains poor. |
| `intervention_event_study` | Dated implemented rows with enough pre/post history. |
| `source_gap` | Missing current inventory, dates, route mapping, or evaluations. |
| `persistent_speed_hotspot` / `delay_concentration` | Add treatment context to slow segment review. |

Admission rule:

> A detector can treat missing treatment data as a source gap only when `route_treatment_source_gap`
> says the relevant source family was checked or known unavailable.

## Validation And Tests

Unit tests:

- TSP historical snapshot maps to `historical_confirmed`, not `current_confirmed`.
- TSP aggregate count maps to `source_gap`, not a route/intersection row.
- Toolkit/study language maps to `under_consideration`, not `implemented`.
- ACE deterministic route rows outrank weaker document mentions.
- Bus-lane route-shape overlap emits method caveats and never audited lane-mileage claims.
- Planned and implemented rows do not collapse unless a source-backed status history connects them.
- Route-level evidence does not become segment-level evidence unless the match method supports it.

Fixture tests:

- B41/Flatbush: TSP/source-gap and bus-lane treatment posture.
- B46/Utica: historical TSP/SBS treatment posture.
- Bx41/Webster and M15/Lower Manhattan: 2017 TSP snapshot posture.
- B82 or Q66: planned/candidate/source-gap posture.

Command verification:

```sh
bun test tools/pipeline-v2/test/commands/studio/route-treatment-summary.test.ts
bun --filter @bp/pipeline-v2 typecheck
bun --filter @bp/pipeline-v2 cli -- studio route-treatment-summary --year 2026 --month 3
```

Serving verification once D1 is added:

```sh
bun --filter @bp/pipeline-v2 cli -- export d1 --year 2026 --month 3 --route-treatment-summary-path ...
bun --filter @bp/pipeline-v2 cli -- verify d1 --year 2026 --month 3
bun --filter @bp/studio-api test
```

## Acceptance Gates

The materializer is usable when:

- every current catalog route has a treatment summary status row or an explicit checked/no-data row
  for the release month;
- TSP rows preserve historical/planned/source-gap/current distinctions;
- every public row has source refs or a deterministic source family/method caveat;
- segment rows include match method and do not inherit route-level evidence silently;
- the artifact summary reports counts by treatment type, status, geography scope, source family, and
  caveat;
- detector admission can distinguish "no treatment found" from "treatment source unavailable";
- route evidence packets can consume the artifact without reading raw Tier 2 outputs.

## See Also

- [[wiki/project/opportunity_data_map|Opportunity Data Map]]
- [[wiki/data/tsp_data_acquisition|Transit Signal Priority Data Acquisition]]
- [[wiki/data/intervention_source_coverage|Intervention Source Coverage]]
- [[wiki/engineering/website_surface_data_plan|Website Surface Data Plan]]
- [[wiki/engineering/serving_snapshot_2_surface_manifest|Serving Snapshot 2.0 Surface Manifest]]
- [[wiki/analysis/ideal_detector_system|Ideal Detector System]]
