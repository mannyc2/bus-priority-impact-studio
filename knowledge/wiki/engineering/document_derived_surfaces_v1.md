# Document-Derived Surfaces v1

**Owner:** `tools/pipeline-v2/docs/tier2`, `packages/domain`  
**Status:** v1 storage contract, draft for implementation review  
**Last updated:** 2026-06-03

## Purpose

Tier 2 documents now have three different layers that must not be confused:

1. **Evidence substrate:** original PDFs, rendered page PNGs, OCR Markdown, per-page hashes, and line/block refs.
2. **Recall substrate:** broad discovery candidates from OCR Markdown. This layer is intentionally noisy and useful for finding possible facts, tables, events, questions, and context.
3. **Research substrate:** normalized, source-grounded, lifecycle-stamped rows that applied research, detector review packets, source-gap queues, and serving projections can consume.

`document-derived-surfaces-v1` is the research substrate. It does not replace PDFs or OCR Markdown; it gives downstream systems stable row IDs, typed surface families, provenance, and review/promote states.

## Artifact Layout

Default output:

```text
data/artifacts/docs/{docsRunId}/document-derived-surfaces-v1/
  manifest.json
  entities.jsonl
  metric-claims.jsonl
  events.jsonl
  tables.jsonl
  claims.jsonl
  context-signals.jsonl
  review-questions.jsonl
  relations.jsonl
  document-event-route-resolution-v1.json
  document-route-review-queue-v1.json
```

The current materializer command is:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 derive-surfaces \
  --normalized-candidates data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-normalized-candidates-canonical-v1.json
```

The command is deterministic and does not call an LLM.

The route-resolution audit command is also deterministic:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 event-route-resolution \
  --run-id tier2-full-corpus-2026-05-24-pass2
```

It reads `events.jsonl`, `entities.jsonl`, and the current local GTFS-backed
`local_route_catalog` / `local_route_stop` tables. It writes
`document-event-route-resolution-v1.json`.

The route-specific review queue command consumes the route-resolution artifact:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 route-review-queue \
  --run-id tier2-full-corpus-2026-05-24-pass2
```

It writes `document-route-review-queue-v1.json`.

## Storage Contract

All surface rows share:

- `surfaceId`: deterministic hash over source, candidate, surface kind, family, and evidence refs.
- `surfaceKind`: one of `entity`, `metric_claim`, `event`, `table`, `claim`, `context_signal`, `review_question`, `relation`.
- `sourceId`, `sourceTitle`, `sourceGroup`, `pageNumbers`.
- `evidenceRefs`: source/page/block/line refs. Quotes are optional; block-line provenance is mandatory when available.
- `displayLabel`, `canonicalFamily`, `rawFamily`, `clusterKey`.
- `sourceCandidate`: original discovery row ID/type/candidate ID and extraction ID when available.
- `inputSnapshotHash`, `extractionVersion`, `normalizationVersion`.
- `rawCandidate`: preserved original candidate payload for future schema redesign.
- lifecycle fields: `lifecycleState`, `validationState`, `promotionState`, `reviewState`, `truthStatus`.

Initial materialization defaults all rows to `candidate`, `unvalidated`, `research_only`, and `unreviewed`. A row becoming useful for the public app must pass later review and projection gates.

## Surface Families

**Entities** preserve bus, subway, PATH, LIRR, NJ Transit, Amtrak, street, corridor, station, stop, agency, program, and treatment mentions. Rail/subway entities are retained because they may matter later, but they are explicitly not bus-route facts.

**Metric claims** preserve source-stated values, units, geography, period, comparison, and metric authority. They are not detector metrics unless `truthStatus` becomes `deterministic_project_metric` through an analytics join or reviewer disposition.

**Events** preserve candidate interventions, service changes, implementation dates, location text, treatment text, affected raw entities, and status. They are candidate event inventory rows, not causal proof.

## Event Route Resolution v1

`document-event-route-resolution-v1.json` is the first deterministic bridge from broad
document event extraction to route-review candidates.

It adds four separate concepts that should not be collapsed:

- `timelineEligibility`: whether the event is an intervention timeline candidate,
  process-only/public engagement, evaluation/monitoring, context-only, needs review, or a
  source gap.
- `eventKind` and `interventionFamily`: normalized audit fields for comparing bus lanes,
  busways, SBS/service changes, camera enforcement, TSP, queue jumps, stop consolidation, and
  related bus-priority work.
- `routeResolutionTier`: the route-identity evidence source, ordered as direct event route
  text, single-route source context, current-GTFS corridor gazetteer, ambiguous match, or
  unresolved.
- `dateValidationState`: currently always `requires_historical_gtfs`.

The current GTFS snapshot is allowed to confirm route identity and build a corridor/street
gazetteer. It is not allowed to validate launch/change dates for 2008-2025 document claims.
Historical date validation needs a separate historical GTFS archive ingest.

The first full-corpus run over `tier2-full-corpus-2026-05-24-pass2` produced:

- 8,428 document-derived event rows.
- 5,020 intervention timeline candidates after process/evaluation/context gating.
- 2,960 route-resolved intervention candidates promotable to a route-review queue.
- 965 ambiguous intervention candidates and 1,095 unresolved intervention candidates.
- 2,203 process-only events kept out of the intervention timeline despite bus-priority
  mentions in some meeting/outreach rows.
- 8,428 rows with `dateValidationState = requires_historical_gtfs`.

This means the artifact can support route-specific review queues today, but it still cannot
support "this route changed on this date" validation without historical GTFS.

## Route Review Queue v1

`document-route-review-queue-v1.json` fans route-resolved intervention candidates into one
review item per `(route, event)` pair. This is intentionally reviewer-facing rather than
serving-facing.

Each item carries:

- route id and source event surface id.
- title, status, date text, event kind, intervention family, and source metadata.
- route-resolution tier and evidence.
- evidence refs back to source/page/block/line.
- review priority and priority band.
- review tasks and allowed reviewer decisions.
- promotion caveats, including historical-GTFS date validation.

The first full-corpus run produced:

- 250 route queues.
- 7,472 route-specific queue items from 2,960 source event rows.
- 3,819 high-priority items, 3,476 medium-priority items, and 177 low-priority items.
- 7,472 default decisions of `needs_historical_gtfs_date_validation`.
- Backlog counts preserved from route resolution: 965 ambiguous intervention candidates and
  1,095 unresolved intervention candidates.

The queue is the tangible next-review surface. It does not promote rows by itself.

**Claims** preserve source-stated assertions and carry `causalClaimFlag` when the language implies causation or effect. Causal/effect rows are review inputs only.

**Tables** preserve table titles, kind labels, headers, dimensions, semantic notes, and important linked candidate IDs. Full table-cell reconstruction is a later relation/table extraction pass.

**Context signals** preserve construction, curb friction, enforcement, methodology caveats, and other street-context signals that may become controls or counter-evidence.

**Review questions** preserve source-gap and validation questions, especially route validation, implementation-date uncertainty, metric cross-checks, and causal caveats.

**Relations** are reserved for later deterministic linking between claims, metrics, events, entities, and tables.

## Storage Tiers

`document-derived-surfaces-v1` should live as a full artifact family in local `data/artifacts` and eventually R2. It is too broad for public D1.

Small serving projections can be derived from reviewed/promoted rows:

- route/corridor timelines
- evidence cards
- source-gap queues
- applied-research candidate sets
- detector review-packet context

Local SQLite tables may be added for query speed, but they should load this artifact rather than redefine the contract.

## Downstream Uses

This contract supports the higher-order analytics plan:

- Detectors find candidate structure from detector-grade feature corpora.
- Causal inference tests intervention claims using reviewed event/context rows plus deterministic metric panels.
- Forecasting predicts future distributions using context rows as candidate covariates, not as outcomes.
- The shared detector/research scoring system can optimize evidence quality, novelty, calibration, parsimony, and review usefulness without pretending all systems are the same problem.

## Guardrails

- Do not treat broad discovery candidates as public truth.
- Do not collapse all rows to route-month before preserving source, page, family, and evidence references.
- Do not promote source-stated metric claims to deterministic metrics without an analytics join or reviewer disposition.
- Do not merge subway/rail lines into bus routes.
- Do not auto-publish causal language from event/claim rows.
- Do not discard raw candidate payloads; they are the escape hatch for future normalization redesign.

## Next Work

1. Run the operational-date extraction audit in
   [[wiki/engineering/tier2_operational_date_extraction_audit_handoff|Tier 2 operational-date extraction audit handoff]]
   so source-backed installation, launch, activation, enforcement, planning, and evaluation dates
   are not collapsed into one `dateText` field.
2. Add a supplemental `document-event-date-assertions-v1.json` artifact so official
   operational-date statements, non-operational milestones, causal-anchor readiness, and GTFS route
   exposure checks are explicit.
3. Add deterministic relation building across entities, claims, metrics, events, and tables.
4. Add reviewer disposition artifacts that can promote, reject, suppress, or waive rows.
5. Add an applied-research candidate-set builder from reviewed event/context surfaces.
6. Add local SQLite loading for fast corpus queries and audit dashboards.
7. Add a serving projection builder that emits only reviewed/promoted route timeline and evidence rows.
8. Add historical GTFS archive ingest for route/service first-seen, last-seen, and exposure checks.
