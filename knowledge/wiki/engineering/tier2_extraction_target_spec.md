---
title: Tier 2 extraction target spec
type: engineering
status: active
last_updated: 2026-06-07
owner: codex
source_count: 6
tags: [tier2, extraction, feature-harness, evidence, product-questions]
---

# Tier 2 Extraction Target Spec

## Purpose

This is the product-facing target for the next Tier 2 feature harness. It answers:

> What specific data do we need extracted from public documents so the Studio can build timelines,
> intervention inventories, evidence cards, source-gap findings, briefs, detector context, and
> applied-research packets?

This page is the bridge between:

- [[wiki/engineering/document_derived_surfaces_v1|Document-Derived Surfaces v1]]
- [[wiki/engineering/tier2_machine_verifiable_feature_harness_plan|Tier 2 Machine-Verifiable Feature Harness Plan]]
- [[wiki/analysis/product_question_inventory|Product Question Inventory]]
- [[wiki/analysis/product_question_discovery_crosswalk|Product Question Discovery Crosswalk]]
- [[wiki/engineering/route_treatment_summary_materializer_plan|Route Treatment Summary Materializer Plan]]
- [[wiki/data/tsp_data_acquisition|Transit Signal Priority Data Acquisition]]

The harness implementation can evolve, but this is the durable target: source-backed document facts
and absence proof that operational datasets cannot provide.

## Core Boundary

Tier 2 extracts **source-observed public-document facts**. It does not compute Studio metrics.

| Belongs in Tier 2 | Belongs outside Tier 2 |
| --- | --- |
| Official dates, status, project scope, public claims, caveats, cost statements, TSP mentions, source gaps, table cells, meeting/report evidence. | Computed bus speed, ridership exposure, CJTP scores, GTFS schedule comparisons, peer residuals, effect sizes, confidence intervals, route-to-area allocation weights. |
| "MTA said the project launched in Fall 2015." | "Observed speed improved by 12% after launch." |
| "This board book reports 16,516 cancelled trips and attributes 77.5% to no operator." | "This route's scheduled-vs-operated miss is statistically unusual." |
| "No public TSP location inventory or evaluation was found in the checked source families." | "This intersection has TSP because a model inferred it from speed changes." |

Documents can provide claims and context about metrics. They do not become the metric authority
unless a deterministic analytics join or explicit reviewer/method gate promotes that value.

## Downstream Consumers

The extraction target exists because these consumers need document facts:

| Consumer | Tier 2 data it needs |
| --- | --- |
| Route timelines | route/corridor scope, event identity, date/status, intervention family, source refs, date precision. |
| Intervention catalog | canonical intervention/event identity, treatment components, route/corridor links, public status, source refs, source-only/ambiguous states. |
| Route treatment summaries | reviewed intervention records, treatment source posture, TSP evidence/source gaps, date assertions, source-only caveats. |
| Evidence cards | claim text, source authority, field-level evidence, caveats, table-cell refs, publication wording gate. |
| Source-gap findings | checked source family, search/query transcript, absence proof, blocked claims, public wording. |
| Detector review packets | source-backed context, official explanations, counter-evidence, source gaps, treatment/timeline refs. |
| Corridor/project evaluation | project scope, treatment dates, official claims, table evidence, costs, caveats, source gaps. |
| Cost-effectiveness packets | cost statements, cost type, funding source, time horizon, project link, benefit denominator if source-stated. |
| Service-delivery packets | official cancellation/service-delivered/CJTP-component statements, source definitions, no-operator/no-vehicle attributions. |
| Geographic/equity rollups | source-stated area names and caveats; deterministic allocation weights come later from `geographic_rollup`. |
| Brief authoring workflow | citations, claim posture, public-safe wording, counter-evidence, unknown/source-gap states. |

## Packet Given To The Agent

The extraction agent should not receive a giant unstructured JSON dump. The runner should provide a
source-local packet shaped for evidence work:

- source identity: `sourceId`, `documentId`, title, publisher/source group, publication/meeting date
  when known, source family, and packet/window hashes;
- concise page/window text in Markdown or TOON-like blocks, with stable evidence handles;
- table slice handles when OCR/table parsing exists;
- route lookup handles generated from source text, not an invitation to invent route IDs;
- treatment vocabulary and allowed escape hatches;
- metric/unit aliases from the approved vocab map;
- date/status examples and allowed date-role vocabulary;
- source-authority metadata derived from the source registry;
- optional source-search/bash transcript handles when absence claims are being requested;
- previous accepted observations for the same source only when needed for dedupe/context.

The agent should submit handles and raw source wording. The runner resolves identity, normalizes
canonical fields, and decides promotion eligibility.

## Common Observation Contract

Every extracted item should share this shape conceptually, even if the final TypeScript schema splits
it into family-specific arrays:

```ts
type Tier2ExtractedObservation = {
  localObservationId: string;
  observationFamily: string;
  rawLabel?: string;
  rawText: string;
  sourceStatedContext?: string;
  evidenceByField: Record<string, string[]>;
  requestedUses?: Array<
    | "detector_context"
    | "brief_evidence"
    | "public_timeline"
    | "treatment_inventory"
    | "source_gap_finding"
    | "cost_value_packet"
    | "service_delivery_packet"
    | "route_diagnosis_packet"
  >;
  relatedLocalObservationIds?: string[];
  notes?: string;
};
```

`evidenceByField` is load-bearing. It should map semantic field paths to evidence handles:

```ts
{
  "routeScope.routeTextRaw": ["p12.b04.l02"],
  "dateStatus.rawDateText": ["p12.b06.l01"],
  "treatment.rawTreatmentText": ["p12.b05.l03"],
  "metricClaim.valueRaw": ["p13.table2.r04.c05"],
  "costValue.amountRaw": ["p14.table1.r08.c03"]
}
```

The runner may later convert those handles into stable page/block/line/table-cell refs, hashes, and
source quote snippets. The agent should not rewrite page numbers, dates, or source metadata when a
handle already identifies them.

## Required Feature Sections

The vNext tool schema should expose explicit arrays for these sections. Unknown labels go in
`rawLabel`, `rawText`, `sourceStatedContext`, or quarantine. They should not become ad hoc taxonomy
keys.

### `routeScopeCandidates[]`

Extract source wording that ties an observation to a route, branch, route family, corridor, street,
borough, or area.

LLM submits:

- `routeTextRaw`
- `routeLookupHandle` or selected lookup candidate, if supplied by the runner
- corridor/street/location text exactly as stated
- direction/terminal/branch/service-variant wording when stated
- area wording such as borough, neighborhood, community board, council district, or county when
  source-stated

Runner fills or validates:

- `routeIds`
- `routeResolutionTier`
- `serviceVariants`
- `currentOrHistoricalRouteState`
- `requiresReview`
- geography resolver state and source-only caveats

Do not let the LLM mint route IDs or collapse "people", "residents", "riders", "passengers", route
families, branches, or areas without an approved resolver policy.

### `dateStatusCandidates[]`

Extract source-stated dates and statuses. This is not just one `dateText` field.

LLM submits:

- `rawDateText`
- `rawStatusText`
- `dateRole`: implementation, launch, activation, enforcement, proposal, plan, board action,
  outreach, construction, evaluation, report/publication, deadline, unknown
- whether the source language is realized, planned, proposed, future, existing, cancelled, delayed,
  or unclear
- event/claim/table field the date belongs to

Runner fills or validates:

- `effectiveDateStart`
- `effectiveDateEnd`
- `datePrecision`
- `sourceStatedStatus`
- `operationalDateValidationState`
- `causalAnchorEligible`

"Completed Fall 2015" can remain deterministic as a season/year precision range. The model should
not normalize it to a fake exact day.

### `interventionTreatmentCandidates[]`

Extract official or source-stated intervention/treatment language.

LLM submits:

- project/event name as stated
- treatment/design/service component wording
- source-stated scope and affected route/corridor/location text
- status/date links
- whether it appears to be a public project, operational change, enforcement program, street
  treatment, planning proposal, evaluation, source-only mention, or context

Runner fills or validates:

- `interventionIdentityKey`
- `treatmentFamily`
- `treatmentSubtype`
- `treatmentComponentType`
- `treatmentStatus`
- `treatmentProofTier`
- `sourceOnlyOrGeometryBackedState`

Minimum families to support:

- bus lane, busway, SBS/BRT, route redesign/service change, ACE/ABLE/camera enforcement, TSP/signal
  priority, queue jump, stop consolidation/spacing, boarding/fare change, curb/loading/parking
  treatment, capital/construction milestone, outreach/planning process, custom/unknown.

### `timelineEventCandidates[]`

Extract source-backed events that may belong on a route/corridor timeline.

LLM submits:

- event title/label
- event kind and source-stated subtype
- linked route/corridor/geography/date/status candidates
- why it is timeline-relevant
- process/evaluation/context-only flag when it is not an intervention event

Runner fills or validates:

- `timelineEligibility`
- `eventKind`
- `interventionFamily`
- `clusterId`
- `duplicateFingerprint`
- `mergeProofState`
- route-level promotion caveats

Timeline rows are non-causal by default. They say "what changed or was stated near this route," not
"what caused the observed metric."

### `metricClaimCandidates[]`

Extract source-stated numeric or directional metric claims at value level.

LLM submits:

- `valueRaw`
- `unitRaw`
- `metricLabelRaw`
- metric subject/geography/route/corridor/area text
- baseline period and comparison period text, if stated
- comparator/direction text such as increase, decrease, faster, slower, improved, worsened
- source-stated authority wording
- caveats or denominator wording

Runner fills or validates:

- `valueNumeric`
- `unit`
- `metricFamily`
- `metricSubjectFamily`
- `direction`
- `baselinePeriod`
- `comparisonPeriod`
- `sourceClaimAuthority`
- `publicationWordingGate`

The extracted value remains a document claim until deterministic analytics or method gates own the
computed metric. A board-book claim like "31% faster AM" must preserve "faster than what, for which
route/corridor, in which period, and according to whom."

### `tableObservations[]`

Extract table structure when the document contains row/cell facts.

LLM submits:

- table title/caption as stated
- table kind label if obvious from the source
- header text, row label, column label, and cell text for extracted facts
- footnote markers and notes
- linked local observation ids when a metric, cost, route, or treatment comes from the table

Runner fills or validates:

- `tableId`
- `rowIndex`
- `columnIndex`
- `tableCellRef`
- `headerContext`
- `rowContext`
- `footnoteRefs`
- `tableCompleteness`

Public exact values should point to cells or contiguous row slices, not prose summaries of a large
table.

### `sourceStatementClaims[]`

Extract official statements, explanations, caveats, and causal language.

LLM submits:

- claim text exactly enough to support the assertion
- speaker/source authority wording
- claim kind: status, effect, explanation, methodology, caveat, commitment, evaluation, compliance,
  cost, source availability, unknown
- whether the language implies causation or attribution
- linked metric/event/treatment/table observations
- counter-evidence or caveat text when nearby

Runner fills or validates:

- `sourceClaimAuthority`
- `truthStatus`
- `claimKind`
- `claimBasis`
- `publicationWordingGate`
- `causalClaimFlag`
- `caveatCodes`

The LLM can quote "DOT says X improved Y." It cannot promote that to "X caused Y" without method
gates.

### `sourceGapCandidates[]`

Extract absence claims only when the runner provides source-search or filesystem/bash transcript
handles.

LLM submits:

- source-gap question
- checked source family
- query/source-search transcript handle
- what the missing evidence would have supported
- public-safe absence wording

Runner fills or validates:

- `gapKind`
- `checkedSourceFamily`
- `searchTranscriptRefs`
- `blocksClaims`
- `sourceGapProofState`
- `publicStatement`

Use this for TSP inventory/evaluation gaps, missing project dates, missing cost evidence, missing
geometry/date corroboration, and missing route-specific source support.

### `costValueCandidates[]`

Extract cost/value evidence for `cost_effectiveness`.

LLM submits:

- `amountRaw`
- currency and unit wording
- cost type: capital, operating, maintenance, enforcement, planning, consultant/procurement,
  grant/funding, contract, unknown
- project/treatment/route/corridor scope
- time horizon or fiscal year
- funding source, grant, contract, board item, or procurement reference when stated
- benefit denominator if stated in the source, such as rider-hours, trips, minutes saved, crashes
  reduced, violations, locations, or route miles
- uncertainty/caveat wording

Runner fills or validates:

- `amountNumeric`
- `currency`
- `costType`
- `timeHorizon`
- `projectOrInterventionRef`
- `fundingSourceRef`
- `benefitDenominatorKind`
- `costClaimAuthority`
- `costPublicationGate`

Tier 2 can say what public documents say the cost is. Cost-effectiveness ratios require deterministic
benefit metrics and uncertainty logic outside the extraction step.

### `serviceDeliveryClaims[]`

Extract source-stated scheduled-vs-operated, cancellation, service-delivered, and CJTP-component
evidence for `service_delivery`.

LLM submits:

- service-delivery claim text
- metric/source definition text
- route/corridor/area and period
- cancellation/dropped-trip/no-operator/no-vehicle/service-delivered wording
- CJTP component wording when the source decomposes customer journey time into wait,
  in-vehicle/runtime, and service-delivery/scheduled-vs-operated pieces
- attribution/cause wording
- caveats and source definition notes

Runner fills or validates:

- `serviceDeliveryComponent`
- `componentAuthority`
- `period`
- `routeOrAreaScope`
- `decomposedCjtpComponent`
- `doubleCountRisk`
- `publicationWordingGate`

This family owns CJTP decomposition. Reliability, schedule/runtime, and root-cause packets consume
the decomposed components instead of reusing a raw composite as an independent factor.

### `ridershipDemandClaims[]`

Extract source-stated ridership and demand trend claims for `history_change`.

LLM submits:

- ridership/demand claim text
- route/corridor/area
- period and comparison period
- value/unit if stated
- recovery/decline/shift language
- source caveats and denominator definition

Runner fills or validates:

- `ridershipClaimKind`
- `period`
- `comparisonPeriod`
- `metricSubjectFamily`
- `sourceClaimAuthority`
- `publicationWordingGate`

Operational ridership datasets still own computed ridership history. Tier 2 preserves official or
public narrative claims about demand.

### `geographicContextClaims[]`

Extract source-stated geography and equity context without computing allocation.

LLM submits:

- area names as stated: borough, neighborhood, community board, council district, county, corridor,
  district, project area, station area, catchment, or service area
- demographic/equity context claims when source-stated
- caveats about affected populations or places
- route/corridor links if stated

Runner fills or validates:

- `areaTextRaw`
- `areaKind`
- `areaResolverState`
- `routeAreaAllocationNeeded`
- `equityContextKind`
- `publicationWordingGate`

The shared `area_route_allocation` layer belongs to `geographic_rollup`. Tier 2 should provide
source-stated geography/equity claims and caveats, not allocate long-route outcomes to districts by
itself.

### TSP Evidence And Gaps

TSP does not need a separate top-level ontology if the harness handles treatment and source gaps
well, but it must be represented explicitly enough to avoid losing the business opportunity.

Extract TSP facts as:

- `interventionTreatmentCandidates[]` when the source states signal priority, transit signal
  priority, signal timing, queue jump signal, or intersection-level signal work;
- `timelineEventCandidates[]` when an official source dates a TSP rollout, target, evaluation,
  report, or board action;
- `metricClaimCandidates[]` when the source states TSP installation counts, performance effects, or
  target compliance;
- `sourceGapCandidates[]` when public TSP locations, dates, or evaluations are unavailable after a
  bounded source search;
- `geographicContextClaims[]` when the source names intersections, corridors, boroughs, or program
  areas.

Do not infer installed TSP from speed changes alone.

### `relationCandidates[]`

Extract explicit or obvious source-local links between observations.

LLM submits:

- local source observation ids and relation kind
- source text or table evidence supporting the relation

Minimum relation kinds:

- `claim_about_event`
- `metric_about_route_or_area`
- `metric_about_intervention`
- `cost_about_project`
- `date_for_event`
- `table_cell_supports_claim`
- `source_corroborates`
- `source_contradicts`
- `source_gap_blocks_claim`
- `caveat_limits_claim`

Runner fills or validates:

- stable observation refs
- cross-source dedupe/cluster state
- relation proof state

Relations are how the downstream product avoids asking an LLM to rewrite known metadata. A timeline
agent can cite an event id; the runner can fill source title, date, page, route, and evidence refs.

## Normalization Authority Matrix

| Concept | LLM provides | Runner owns |
| --- | --- | --- |
| Source identity | Nothing beyond packet-local ids | `sourceId`, `documentId`, source group, hashes, page/window refs |
| Evidence | field-to-handle refs and raw source text | stable evidence ids, quote hashes, page/block/line/cell refs |
| Routes | raw route wording and selected lookup handle | canonical route ids, tier, route state, review flags |
| Dates | raw date/status wording and role hint | parsed precision/range, status enum, causal-anchor gate |
| Treatments | source wording and component hints | canonical family/subtype, support tier, custom/quarantine policy |
| Metrics | value text, unit text, subject/geography/period text | numeric parse, normalized unit/family, authority gate |
| Cost | amount/currency/source wording | numeric parse, cost type, funding/project refs, public claim gate |
| Service delivery | source-stated component and definition text | CJTP decomposition mapping, double-count risk, publication gate |
| Geography/equity | source-stated area/population wording | resolver state, allocation-needed flag, method caveat |
| TSP | source-stated program/location/date/gap text | treatment/source-gap classification and no-inference gate |
| Absence | source-gap question and transcript handle | proof state, blocked claims, public absence wording |
| Promotion | requested use hint | detector/brief/public/causal eligibility |

## Evidence Standards

Use these as validator grades:

| Grade | Meaning | Allowed public use |
| --- | --- | --- |
| `exact` | The cited evidence directly contains the field value or statement. | Eligible after resolver/proof gates. |
| `partial` | The evidence supports nearby context but not the full normalized value. | Context/review only unless another exact ref completes it. |
| `context_only` | The source is relevant but does not prove the field. | Detector/reviewer context only. |
| `absent_proven` | A bounded source search proves absence within declared source families. | Source-gap finding only. |
| `unsupported` | No resolving evidence. | Quarantine or discard from projections. |

Every publishable field must have a field-level evidence path. A candidate can be useful with partial
or context-only support, but the projection must label it that way.

## Priority Order

### P0: Required Before Another Full-Corpus Harness Run

- common source/evidence contract with `evidenceByField`;
- route/corridor/geography raw scope plus resolver handles;
- date/status roles and precision;
- intervention/treatment candidates;
- timeline event candidates;
- metric claims and table observations;
- source statement claims and caveats;
- source gap candidates with transcript handles;
- relation candidates;
- no ad hoc category keys outside approved raw/notes fields.

### P1: Required To Match Current Product Questions

- cost/value candidates;
- service-delivery and CJTP-component claims;
- ridership/demand trend claims;
- geographic/equity context claims and allocation-needed flags;
- explicit TSP evidence/source-gap posture;
- downstream consumer tags for cost packets, service-delivery packets, route diagnosis, and board or
  compliance packages.

### P2: Useful Extensions

- procurement/contract details beyond costs;
- richer external context windows such as construction permits, weather reports, incidents, school
  calendars, event permits, and curb/loading context;
- reviewer question candidates by family;
- source contradiction/corroboration across documents.

P2 should not block the next harness if P0/P1 are working and measurable.

## Projection Targets

The proof ledger should compile accepted observations into these read-model or artifact families:

| Projection | Source observations |
| --- | --- |
| `route_timeline_event` | route scope, timeline event, date/status, intervention, source refs. |
| `intervention_catalog` | intervention/treatment, event identity, dates, source refs, route/corridor links. |
| `route_intervention_index` | route scope, intervention identity, timeline eligibility, source caveats. |
| `route_treatment_source_gap` | treatment candidates, TSP candidates, source gaps, checked source families. |
| `evidence_card` | source statement, metric claim, table observation, caveat/counter-evidence refs. |
| `project_cost_value_packet` | cost value, project/treatment refs, benefit-denominator hints, caveats. |
| `service_delivery_source_packet` | service delivery claims, CJTP component definitions, source refs. |
| `ridership_demand_source_packet` | ridership/demand claims, period/comparison refs. |
| `geographic_context_packet` | source-stated area/equity claims, allocation-needed flags. |
| `route_diagnosis_context_packet` | source statements, external context, source gaps, relation refs. |

These projections should say what is verified, downgraded, ambiguous, source-gapped, or quarantined
by product family. Detector and UI code should not have to rediscover this from raw document rows.

## Acceptance Gates

The next harness is usable when these checks pass:

1. Tool schema exposes every P0 and P1 section above, or explicitly marks unsupported sections as
   not requested for that queue.
2. Every non-note field has at least one `evidenceByField` entry or is runner-owned.
3. The proof ledger reports `publishableFieldWithoutProofCount = 0`.
4. Route IDs, dates, treatment families, metric units, cost types, and source authorities are
   resolver-validated or downgraded.
5. Source-gap findings include search/source transcript refs.
6. Cost, service-delivery, ridership, geographic/equity, and TSP fields are visible in family-level
   proof summaries, even if many rows are unknown.
7. Corpus summaries report coverage by product-question family, not just by raw surface kind.
8. Replay fixtures include the known bad collapses: title-as-kind fallback, broad route text
   over-normalization, source-stated metric as computed metric, planned language as implemented
   launch, all-vehicle speed as bus speed, raw CJTP composite double-counting, and source gap without
   transcript.

## What We Still Need To Implement

1. Add these P1 families to the vNext contract and validator:
   `costValueCandidates`, `serviceDeliveryClaims`, `ridershipDemandClaims`,
   `geographicContextClaims`, and explicit TSP source-gap handling.
2. Generate the agent prompt from this spec and the product-question inventory, not from old
   timeline-only examples.
3. Add proof-ledger summaries by product-question family and projection target.
4. Add fixture packets for cost table rows, CJTP/service-delivery board statements, TSP source gaps,
   ridership trend claims, and geography/equity caveats.
5. Keep old document-derived surfaces immutable; compile new fields into additive projections.

