# Agentic Tier 2 Extraction Harness Goal

## Goal

Build a source-scoped, agentic Tier 2 extraction harness that turns OCR Markdown,
PDF/source files, prior extracted candidates, and deterministic lookup context into
rich document research surfaces. The harness should preserve more raw evidence than
the previous passes, but it must only allow research, detector, brief, timeline, or
causal use after deterministic field-level verification.

The immediate target is not "one better prompt." It is a repeatable harness:

1. A bounded agent investigates one source or page window at a time.
2. The agent can inspect page text, line numbers, source metadata, tables, and prior
   extracted candidates without guessing paths or coordinates.
3. The runner records every source, tool call, query, output hash, and model prompt.
4. The output schema keeps raw observations broad and promotion claims narrow.
5. A verifier independently checks source/page/block/line/hash support for every
   useful field before downstream code can consume it.

## Current Implementation Status

As of 2026-06-04, the first executable harness exists in `tools/pipeline-v2`:

- `docs tier2 agentic-batch` builds request files from discovery windows, runner-owned
  block indexes, source metadata, OCR evidence handles, route lookups generated only
  from evidence block text, and prior discovery context marked as hint-only.
- `docs tier2 agentic-extract` runs the existing forced-tool LLM repair loop over one
  request and materializes validated `DocumentResearchSurfaceDraftV2` rows.
- `docs tier2 agentic-audit` writes deterministic blocker audits for final validation
  failures, route lookup text not backed by evidence, non-canonical route field paths,
  missing/absent support without search transcripts, unresolved evidence paths, and
  unresolved route raw-text paths.
- The runner now deterministically fills `rawPayload.routeTextRaw` from evidence-backed
  route lookup text when the model selected validated route IDs but omitted the raw
  route text field. This is runner-owned data derived from exact source evidence; the
  model still owns the canonical route selection.
- For `metric_observation`, `claim`, and `causal_claim` surfaces, the runner now
  deterministically adds canonical source-statement authority fields:
  `sourceClaimAuthority`, `truthStatus`, and `publicationWordingGate`. It derives these
  from explicit payload authority fields first, then stable official source metadata
  such as `nyc_dot_*` source ids/groups. The audit blocks source-statement rows missing
  these canonical fields and blocks agentic rows that try to label themselves as
  `deterministic_project_metric`.
- The runner exposes bounded live-run controls (`timeoutMs` and `maxAttempts`),
  preserves provider failures as audit-blocked artifacts instead of aborting the batch,
  and normalizes empty optional `agentNotes`/tool `notes` strings before schema parsing.

Live smoke results:

- M34/M34A Winter 2016 newsletter pages 1-4: 58 accepted surfaces, 0 rejected, 0
  validation issues, 0 audit blockers.
- Cross-source sample (Nostrand/B44 progress report page 24, Woodhaven after-study
  page 21, Flatbush CAB3 page 6): 56 accepted surfaces, 0 rejected, 0 validation
  issues, 0 audit blockers.
- Combined clean smoke: 7 windows, 114 accepted surfaces, 0 rejected, 0 validation
  issues, 0 audit blockers.

Larger canary results:

- `batch-canary18-live-pioneer-v1`: 18 attempted windows, 178 accepted surfaces, 0
  rejected, 0 validation issues, 8 audit blockers. Every blocker was provider/runtime
  failure (`llm_provider_failed`), not unsupported evidence or route normalization.
- `batch-canary18-failed-rerun-pioneer-v2`: reran the 8 blocked windows after adding
  empty optional string normalization. 7/8 cleared, producing 112 accepted surfaces, 0
  rejected, 0 validation issues, and 0 audit blockers on cleared windows.
- `batch-extra3-live-pioneer-v1`: 3 additional table/metric-heavy bus-priority windows,
  45 accepted surfaces, 0 rejected, 0 validation issues, 0 audit blockers.
- Effective clean live coverage is now 27 windows and 449 accepted surfaces across the
  initial smoke, cross-source smoke, main canary, rerun-cleared windows, and extra
  canary, all with zero final validation failures and zero audit blockers on the clean
  outputs.

Known residual: `nyc_dot_bus_priority_document_pdf_lower_montauk_final_report_jan2018:218`
still times out as a single-window Pioneer run. The page is a rail-study station/time
table and O&M methodology page with no local bus route lookup. Treat it as a
retry/sharding/skip-policy item for non-bus rail-heavy context, not as a route
normalization or field-evidence failure.

Current go/no-go: ready for a controlled full run with audit-driven retry queues and
residual review, not a fire-and-forget unattended run. The current behavior remains
conservative: it does not assign route IDs from prior context alone when local block
text has no route-shaped mention.

## Latest Harness Outputs And Downstream Use

Each batch window writes the same four artifacts:

| Artifact | What it contains | Downstream use |
| --- | --- | --- |
| `request.json` | Runner-owned source context: source/page metadata, evidence handles with page/block/line/hash, route lookup requests generated only from evidence text, route universe, lookup context, and prior extraction hints marked as not-truth. | Reproducible task packet; lets us rerun one page/window and prove what the model could inspect. |
| `artifact.json` | Model-submitted `DocumentResearchSurfaceDraftV2` rows after deterministic repair/evaluation, accepted/rejected transaction result, route lookup results, LLM attempt trace, provider settings, and prior context. | Candidate research surface corpus. Only accepted rows from audit-clean artifacts should flow into detector evidence, route brief inputs, source-gap seeds, and finding review packets. |
| `audit.json` | Deterministic blocker report: final validation failures, provider failures, unsupported route lookup text, bad route field paths, unresolved evidence paths, unresolved raw route text paths, and invalid missing-data support. | Scale gate and retry queue. Any blocker keeps that window out of downstream consumers until rerun, sharded, or manually reviewed. |
| `manifest.json` | Batch-level ledger of every window path, summary counts, accepted/rejected totals, validation issue totals, LLM attempt count, and audit blocker count. | Run accounting, full-corpus resume planning, and release-readiness evidence. |

How the clean outputs are good:

- Field support is explicit. `evidenceByField` points from each useful draft field to
  source/page/block/line/hash evidence, rather than trusting prior candidate ids.
- Route normalization is bounded. The model can only select canonical `routeIds` from
  runner-generated route lookups, and route lookup raw text must be present in source
  evidence. SBS/local/limited wording stays in raw payload/notes, not inside route ids.
- Prior extractions improve recall but cannot prove facts. They are carried as
  `priorContext` with `validationState: prior_hint_not_truth`.
- Provider and parser failures remain visible. The batch now writes audit-blocked
  artifacts for provider failures, so full runs can resume failed windows instead of
  losing state.
- Optional string cleanup is deterministic. Empty optional notes are normalized away
  before schema parse; substantive fields still require schema validation and source
  support.

How downstream should consume them:

- Detector review packets should consume accepted, audit-clean surfaces with
  `requestedUses` like `detector_evidence`, route ids, metric/treatment/date raw
  payloads, and field-level evidence links.
- Route briefs should use accepted audit-clean route-scoped claims, metrics, caveats,
  and context surfaces as source-backed evidence/caveat material, not as deterministic
  KPI truth unless a later metric cross-check promotes them.
- Finding proposals should use accepted surfaces as evidence links, source-gap seeds,
  duplicate/corroboration context, and review-packet material. A document claim can
  support or explain a finding; it should not create a metric finding by itself.
- Source-gap queues should use review/source-gap surfaces and audit/provider residuals
  to decide what needs another source, another page shard, or manual review.
- Public timelines and causal panels should consume only later-promoted event/date
  surfaces after status/date/treatment gates, not raw accepted research surfaces.

## What This Is For Beyond Briefs

The agentic Tier 2 corpus is not just a brief generator. Briefs are one presentation
surface at the end of the chain. The primary purpose is to turn agency documents into
reviewable evidence packets that detectors, findings, causal studies, source-gap
queues, and briefs can all consume without trusting LLM prose as fact.

The intended flow is:

```text
agentic source-window output
  -> deterministic validation/audit
  -> accepted document research surfaces with field support
  -> applied-research and detector evidence projections
  -> detector review packets / source-gap queues / treatment inventories
  -> promoted findings, causal panels, timelines, and route/corridor briefs
```

Detector uses are broader than "add citations to a card":

- `official_context`: attach DOT/MTA source evidence that explains what an intervention,
  project, study, board action, or agency claim actually says.
- `detector_context`: add source-stated context that can caveat or prioritize a
  deterministic signal, such as project limits, bus lanes, service changes, construction
  phasing, enforcement status, or corridor constraints.
- `counter_evidence`: preserve source text that weakens a candidate, such as a document
  saying work is proposed, delayed, outside the route scope, rail-only, temporary, or
  not yet implemented.
- `missing_data` and `coverage_audit`: support source-gap detectors and "we looked but
  cannot evaluate this" states, but only when the absence is backed by a source-scoped
  search/shell transcript.
- `causal_treatment_inventory` and `event_study_window`: seed treatment/date/status
  inventories that later deterministic gates can accept or reject for causal panels.
- `gold_label_seed` and `review_packet_context`: give reviewers and backtests concrete,
  evidence-linked examples of true positives, false positives, near misses, and source
  gaps.

Finding proposals should use these surfaces as evidence and reasoning material, not as
the detector of record. Detectors still decide what candidate structure exists from
typed feature corpora; document surfaces explain, caveat, corroborate, contradict, or
fill official-source gaps around those candidates. Route/corridor briefs should then
read reviewed/promoted detector packets and verified document evidence, not raw
agentic outputs directly.

## Official Source-Statement Authority Audit

Do not flatten all "deterministic" language into one rule. A strict, line-backed
LLM extraction from an official MTA/DOT source is authoritative for what that source
states. The right distinction is:

- **Authoritative as source-stated agency evidence:** official page/PDF says a project
  launched, a plan is scheduled, a treatment exists, a corridor is in scope, or an
  agency-reported metric/effect appears in the document.
- **Not automatically authoritative as Studio-measured truth:** project KPIs,
  detector scores, causal claims, current performance findings, or public-ready
  conclusions still need the detector/review/causal gates that own those claims.

Target rule: accepted official-source surfaces with exact field support may be trusted
as `official_source_statement` or `official_agency_metric_claim`. They should not stay
as vague research-only rows when the source authority is clear. The publication wording
must still say "NYC DOT/MTA reported/stated" unless a later deterministic/reviewer gate
promotes the same value into a Studio metric or causal conclusion.

Audit snapshot, 2026-06-04:

- 27 clean executed source/page windows after deduping reruns; 1 blocked residual
  (`Lower Montauk` page 218 provider timeout).
- All 27 clean windows are `nyc_dot` source ids: 19 `bus_priority_document`, 8
  `select_bus_service`.
- 449 accepted surfaces: 99 `metric_observation`, 67 `claim`, 60
  `table_observation`, 42 event/treatment/service surfaces, plus context, entities,
  review questions, and seeds.
- 98/99 metric observations have exact verified `rawText` support.
- 65/67 claim surfaces carry an authority-like payload field.
- Original gap: 0/99 metric observations carried the canonical
  `sourceClaimAuthority`/`truthStatus` fields in the accepted agentic surface, even
  though several preserved source authority as ad hoc `authorityRaw`, and only 20/99
  metric observations had a separately verified metric-value field path beyond exact
  raw text support.

Implemented P0: the runner now requires or deterministically derives canonical authority
fields for `metric_observation`, `claim`, and `causal_claim` surfaces. The audit blocks
source-stated metrics/effect claims that lack one of:

- `sourceClaimAuthority: official_mta | official_nyc_dot | official_joint_mta_dot | third_party | unknown`;
- `truthStatus: official_source_statement | official_agency_metric_claim | document_claim_only | deterministic_project_metric`;
- `publicationWordingGate: quote_as_source_statement | needs_metric_crosscheck | needs_causal_review | review_only`.

Confirmation runs:

- Replaying old B44/Nostrand page 24 model output through the patched runner accepted
  22/22 drafts, with 9/9 source-statement rows labeled `official_nyc_dot`; the audit
  had 0 blockers.
- Replaying old BX6 page 9 model output accepted 18/18 drafts, with 8/8
  source-statement rows labeled `official_nyc_dot`; the audit had 0 blockers.
- Replaying the earlier successful Woodhaven page 19 live output accepted 15/15 drafts,
  with 5/5 source-statement rows labeled `official_nyc_dot`; the audit had 0 blockers.
- A fresh one-window Woodhaven live call after the patch ended as `llm_provider_failed`
  and was audit-blocked. Treat that as a provider/retry-queue signal, not a schema or
  source-support failure.

## `evidenceByField` Stability Contract

`evidenceByField` is the field-support matrix for a submitted
`DocumentResearchSurfaceDraftV2`. Its keys are canonical field paths into that draft,
and its values name evidence handles plus support roles. Today the deterministic
resolver accepts the `document-research-draft-v2-dotpath` scheme:

- dot-separated draft paths such as `rawText`, `displayLabel`, `routeIds`, and
  `rawPayload.routeTextRaw`;
- numeric array segments by dot or bracket normalization, such as
  `rawPayload.metrics.0.value` or `rawPayload.metrics[0].value`;
- paths must resolve on the submitted draft before the surface can be accepted;
- support handles must be runner-owned evidence handles, not prior candidate ids or
  lookup text.

This path scheme is part of the artifact contract, even if future code replaces the
current path resolver with a helper that emits field ids. Future changes must either:

1. keep resolving existing `document-research-draft-v2-dotpath` keys forever; or
2. add an explicit `fieldPathScheme`/resolver version to new artifacts and provide a
   migration that materializes old `evidenceByField` keys into the new field ids.

Downstream consumers should prefer the verifier-materialized `fieldSupport` rows on
accepted surfaces. Those rows preserve the original `fieldPath` plus verified evidence
pointers. Consumers should not rebuild support by ad hoc string manipulation over raw
LLM drafts. If a future helper computes field ids, it must be tested against old
fixtures for `rawText`, `displayLabel`, `rawPayload.routeTextRaw`, route selections,
array payload fields, unresolved paths, and missing-data support.

## Why This Exists

The current Tier 2 corpus has valuable recall, but too many artifacts are either too
raw for direct use or too compressed for future analysis.

Observed corpus state:

- Discovery coverage: 9,262 windows, 8,848 discovered windows, 79 runnable failed
  windows, 335 blocked windows from OCR-complete sources absent from the current
  OCR plan.
- Canonical normalized discovery pool: 155,886 rows over 368 sources, including
  76,529 entities, 19,646 metric candidates, 8,428 event candidates, 2,835 tables,
  22,038 claims, 12,170 context signals, and 14,240 review questions.
- Document-derived surfaces: 155,886 candidate surfaces with 184,355 evidence refs,
  all still in candidate lifecycle.
- Operational-date assertions: 8,428 event rows produced 1,157 trusted source-stated
  dates, but only 240 causal-anchor-eligible rows.
- Proof harness: 240 proof requests had source context and 210 model results marked
  themselves "proven", but deterministic revalidation accepted only 88 valid proven
  rows. That gap is the central lesson.

The next pass should preserve the recall of discovery while adding the verification
discipline of the proof harness and the downstream shape needed by detector review,
Studio briefs, causal panels, source-gap queues, and public timelines.

## Prior Attempts And Lessons

| Attempt | What worked | What went wrong | Carry forward |
| --- | --- | --- | --- |
| Full-corpus candidate bundle | High recall across many document types | Overgenerated route/event seeds; proposal, context, and implementation were easy to blur | Use as prior context, never truth |
| Phase 3 intervention records | Produced reviewable intervention records with routes, treatments, metrics, caveats | Too compressed; evidence refs point to prior candidates, not field-level PDF/page/line support | Keep as hints and reviewed seeds |
| Manual intervention verification | Checked support paths, chunk/source mismatches, canonical tiers | Verified against candidate/chunk ids, not every source field | Preserve support-path idea at field level |
| Discovery extraction v1 | Block ids, page numbers, line ranges, hashes, raw vocabulary | Candidate-level evidence refs only; table cells and field support weak; line-range/hash issues appeared | Runner-owned block indexes and hashes |
| Structured extraction v1 | Quote-backed claims, tables, events, service changes, context, review questions | Quote-native, not line-native; narrow entity kinds; no general field support matrix | Merge quote plus block-line evidence |
| Normalization workbench | 155,886 normalized rows and good candidate family distributions | Still recall substrate; review questions and "other" families too noisy | Use distribution audit to tune schema and fixtures |
| Document-derived surfaces v1 | Good lifecycle/truth/review/promotion vocabulary | Surface rows still lack enough field-level evidence and table-cell support | Keep lifecycle and truth status enums |
| Operational-date assertions | Deterministic status/date classifier fixed many LLM errors | Depended on upstream event quality; needed proof harness for exact source support | Keep status/date deterministic gates |
| Proof harness | Exact quote validation caught fabricated or weak proof | Narrow to operational dates; quote search can miss table/page coordinates | Generalize proof pattern to all critical fields |
| Research audit shards | Focused schema/gold/adversarial/causal review was useful | Audit output is advice, not an extraction contract | Use as fixture/scorecard source |

## Mistakes To Avoid

1. Treating extracted candidates as facts.
   Prior candidates are input context and recall hints. They must be explicitly
   marked `priorHint` and cannot satisfy verification unless they resolve back to
   source coordinates.

2. Letting the model invent evidence coordinates.
   The runner should create page manifests, block indexes, line ranges, markdown
   hashes, block hashes, and table-cell coordinates. The agent may choose pointers,
   but the verifier must canonicalize or reject them.

3. Compressing too early.
   Publishing-ready intervention records dropped tables, context signals, raw status
   wording, metric provenance, route uncertainty, and open questions that future
   briefs/findings need.

4. Mixing document claims with project metrics.
   A document's "27% faster" claim is useful evidence, not a deterministic Studio
   metric. The schema must carry metric authority and force deterministic cross-check
   before numeric claims enter briefs or findings.

5. Conflating proposed/planned/process text with implemented events.
   Proposal pages, meetings, studies, design milestones, reports, and future-tense
   language need separate status/date roles. Implementation words require exact
   source support.

6. Confusing bus routes with subway/rail/station entities.
   The schema needs explicit entity mode and route-resolution state. Rail context can
   be valuable caveat/context, but it is not bus-route proof.

7. Ignoring table structure.
   Tables often carry the best evidence. Row/column coordinates, headers, footnotes,
   approximate/chart-derived flags, and cell-level support are needed.

8. Losing source gaps and negative searches.
   Search misses, missing pages, unresolved cited documents, and "not found in this
   source" observations are valuable for detector coverage and future source work.

9. Running one monolithic live review.
   Focused shards worked better than broad "all" prompts. The final harness should
   support source-scoped and task-scoped runs with fixture scorecards before scale.

## Downstream Consumers

The desired output is shaped by the future products:

- Detector review packets need considered/hit/no-hit/skipped/source-gap status,
  evidence roles, counter-evidence, missing-data refs, claim-safe labels, promotion
  blockers, and detector version/run provenance.
- Finding proposals need resolvable evidence refs, numeric payloads for metric
  consistency, route refs, intervention status support, duplicate evidence overlap,
  and language gates against unsupported causal or public-ready claims.
- Brief proposals need evidence provenance, supported KPI numbers, structured claims,
  caveats, existing-brief/finding dedupe, and draft-only status until review.
- Causal panels need realized onset dates, route/corridor scope, treatment family,
  pre/post windows, control eligibility notes, method/caveat context, and no causal
  language without methodology gates.
- Public timelines need reviewed implemented/planned/proposed distinctions, exact
  date roles, source citations, and promotion history.
- Source-gap detectors need missing context, unresolved citations, failed joins,
  source freshness, and explicit "could not evaluate" records.

## Harness Design

### Unit Of Work

Default unit: one source, with an internal loop over page windows. A large source can
be sharded by route, topic, table, or page range, but each shard must keep a stable
`sourceInvestigationId`.

The agent receives:

- Source manifest: source id, title, publisher, source group, final URL, raw artifact
  key, source content hash, OCR plan lineage, document date state.
- Page manifest: page numbers, OCR Markdown artifact keys, page hashes, render keys
  when available, visual flags, table/map/chart flags.
- Block index: block ids, page numbers, lineStart/lineEnd, text, block hash.
- Table index: detected table ids, page/block coordinates, headers, rows, cells,
  footnotes, and markdown/source line ranges when available.
- Prior extractions: discovery candidates, normalized rows, derived surfaces,
  intervention records, operational-date assertions, proof results. These are
  marked as hints and include their own validation state.
- Lookup context: current route catalog, route aliases/SBS variants, street/corridor
  gazetteer, intervention record lookup, detector/brief intended-use dictionary.
- Fixture expectations when running held-out evaluation.

### Agent Tools

Prefer narrow read-only tools over unconstrained shell. If shell is included, expose it
through a source-scoped wrapper that logs commands, enforces read-only roots, and
returns output refs/hashes.

Required tools:

- `source_manifest(sourceId)` returns stable source metadata and artifact keys.
- `page_index(sourceId)` returns page list, OCR status, markdown keys, render keys,
  page hashes, and page-level hints.
- `doc_page(sourceId, pageNumber, options)` returns markdown with line numbers and
  block ids.
- `doc_search(sourceId, query, options)` searches OCR Markdown, returning page,
  block, line ranges, snippets, and search observation id.
- `block_context(sourceId, blockId, before, after)` returns neighboring blocks with
  canonical line numbers and hashes.
- `table_slice(sourceId, tableId, rows, columns)` returns table cell coordinates,
  headers, values, footnotes, and source lines.
- `pdf_page_metadata(sourceId, pageNumber)` returns PDF page dimensions, render key,
  OCR/render availability, and image/table/chart flags.
- `route_lookup(text)` returns candidate bus route ids, mode, aliases, current GTFS
  status, ambiguity notes, and stable lookup result handles.
- `street_lookup(text)` returns street/corridor candidates and ambiguity notes.
- `existing_intervention_lookup(query)` returns current reviewed/publishable
  intervention hints, not truth.
- `metric_dictionary_lookup(text)` returns metric family candidates and required
  deterministic cross-check policy.
- `prior_candidate_lookup(sourceId, filters)` returns prior discovery/structured rows
  with validation state and evidence pointers.
- `validate_surface_draft(payload)` performs the same deterministic checks as
  submission without committing the row. It returns accepted canonical fields,
  rejected fields, repair codes, and suggested lookup/search actions.
- `source_shell(sourceId, command)` optional controlled shell. Allow only read-only
  commands such as `rg`, `sed`, `awk`, `pdfinfo`, `pdftotext`, `qpdf --show-pages`,
  and repo-local inspection scripts. Every command writes an action transcript with
  stdout/stderr hashes.
- `submit_surfaces(payload)` submits one or more `DocumentResearchSurfaceDraftV2`
  rows transactionally. Invalid rows are rejected with field-level repair errors;
  valid rows are materialized as persisted `DocumentResearchSurfaceV2` rows.
- `report_source_gap(payload)` submits search misses, missing pages, unresolved
  citations, and evidence that a desired fact is absent from the source.

The tool transcript is not optional. It is part of the artifact, and verifier checks
can replay or hash-check source reads and shell outputs.

### Run Artifacts

Proposed layout:

```text
data/artifacts/docs/<run-id>/agentic-extraction-v2/
  manifest.json
  scorecard.json
  sources/<source-id>/source-manifest.json
  sources/<source-id>/page-index.json
  sources/<source-id>/block-index.jsonl
  sources/<source-id>/table-index.jsonl
  sources/<source-id>/prior-hints.jsonl
  sources/<source-id>/agent-actions.jsonl
  sources/<source-id>/search-observations.jsonl
  sources/<source-id>/tool-calls/<investigation-id>.json
  sources/<source-id>/surfaces.jsonl
  sources/<source-id>/field-support.jsonl
  sources/<source-id>/source-gaps.jsonl
  sources/<source-id>/verification-report.json
  review-queues/field-support.jsonl
  review-queues/status-date.jsonl
  review-queues/route-identity.jsonl
  review-queues/table-cells.jsonl
  derived/brief-claim-seeds.jsonl
  derived/finding-reasoning-seeds.jsonl
  derived/detector-context.jsonl
  derived/causal-candidates.jsonl
  derived/source-gap-seeds.jsonl
```

## Output Schema

The schema should be generous for observations and strict for claims.

### Data Ownership Contract

The model should not be asked to emit the final persisted row. It should emit a
draft observation with semantic fields and evidence handles. The harness should
validate and materialize the canonical persisted row while the agent is still in
the loop. Validation errors are returned to the agent as repairable tool results,
not discovered only after the full run is over.

Model-owned data:

- semantic observation type: candidate surface kind, claim kind, event family,
  table purpose, context kind, relation kind, source-gap kind;
- source-faithful raw strings: route text, street text, date text, status text,
  treatment text, metric label/value text, caveat text, table title/header text,
  claim text, question text;
- evidence selections: pointer ids, table-cell ids, figure/render refs, and
  support roles returned by harness tools;
- interpretation that needs reading judgment: observed vs projected vs attributed
  claim basis, whether language is a caveat/counter-evidence/methodology note,
  whether a table row is useful, whether a source gap was exhausted enough to log;
- relation hypotheses between observations, such as "this metric qualifies that
  event" or "this caveat limits that claim";
- agent confidence and short uncertainty notes.

Tool-owned data:

- source manifests, source titles, source groups, publisher, final URLs, source
  content hashes, page artifact keys, OCR/page/block/table/render artifact paths;
- page numbers, block ids, line ranges, block hashes, quote hashes, table row and
  cell coordinates, render bounding boxes, and shell/search transcript hashes;
- prior candidates and reviewed records supplied as hints, including validation
  state and source coordinates;
- route/street/metric/intervention lookup candidates, ambiguity notes, and stable
  lookup handles that the agent can reference in drafts.

Deterministically validated, inferred, or added by the harness:

- stable ids: surface ids, support ids, pointer ids, observation ids, artifact ids,
  duplicate fingerprints, cluster keys, run/investigation ids;
- canonical source metadata and artifact refs copied from runner manifests;
- exact evidence pointer materialization from tool-returned handles, including
  hashes and line/page/table coordinates;
- field-support rows, verifier states, verifier codes, support completeness, and
  counter-evidence linkage;
- normalized route ids, street/corridor refs, metric families, units, parsed
  numeric values, normalized dates/date precision, and status/date classifications
  whenever rules or catalogs can decide them;
- lifecycle, review, promotion, intended-use gates, blockers, verifier confidence,
  causal-anchor eligibility, public/brief/detector eligibility, and source-gap
  queue placement;
- cross-source dedup, intervention ids, route-scope joins, event-study windows,
  metric cross-check requirements, and downstream projection artifacts.

The harness may infer a canonical value only when the referenced evidence and
lookup handles make the value deterministic. Otherwise it must reject or quarantine
the field and return a repair code. This applies to route ids, street/corridor refs,
metric families, units, parsed dates, status classifications, treatment families,
entity modes, source identities, and artifact references.

Reviewer-owned data:

- human acceptance/rejection, promotion decisions, issue tags, reviewer notes,
  method-review approvals, public language approvals, and publication receipts.

Never model-owned:

- source ids, source metadata, page numbers, block ids, line numbers, hashes, final
  artifact paths, validation states, promotion states, deterministic metric
  authority, causal/public eligibility, or "no source exists" conclusions without
  a recorded search/source-gap transcript.

The agent-facing tool should therefore accept a smaller draft shape:

```ts
type DocumentResearchSurfaceDraftV2 = {
  surfaceKind: DocumentResearchSurfaceV2["surfaceKind"];
  corpusRole: DocumentResearchSurfaceV2["corpusRole"];
  rawText: string;
  displayLabel: string;
  payloadSchemaId: string;
  rawPayload: Record<string, unknown>;
  evidenceByField: Record<
    string,
    Array<{
      evidenceHandle: string;
      supportRole: FieldSupportV2["supportRole"];
      supportCompleteness?: FieldSupportV2["supportCompleteness"];
    }>
  >;
  counterEvidenceByField?: Record<string, string[]>;
  canonicalSelections?: Array<{
    fieldPath: string;
    lookupKind:
      | "route"
      | "street"
      | "corridor"
      | "metric"
      | "date"
      | "status"
      | "treatment"
      | "entity"
      | "prior_candidate";
    lookupHandle: string;
    selectedIds: string[];
    rawTextFieldPath?: string;
    evidenceHandles: string[];
    selectionReason?: string;
  }>;
  parentSurfaceIds?: string[];
  priorHintUses?: Array<{
    hintId: string;
    usedAs: "context_only" | "candidate_seed" | "conflict" | "ignored";
  }>;
  requestedUses?: DocumentResearchSurfaceV2["intendedUses"];
  agentConfidence: "low" | "medium" | "high";
  agentNotes?: string;
};
```

The persisted `DocumentResearchSurfaceV2` is produced only after the harness
resolves handles, validates payloads, creates field support, attaches artifact
refs, and applies use gates. Rejected drafts do not become corpus rows; they return
structured repair results so the agent can call lookup/search tools and resubmit
within the same source investigation.

### Canonical Field Validation Loop

Canonical fields should be validated before commit, not repaired in a blind
post-run cleanup pass. Any field backed by a catalog, parser, deterministic rule,
or source coordinate system must follow this loop:

1. The agent extracts raw source text and cites exact evidence handles.
2. The agent calls the relevant lookup or parser tool, such as `route_lookup`,
   `street_lookup`, `metric_dictionary_lookup`, date/status parsing, table-cell
   lookup, or prior-candidate lookup.
3. The agent submits a draft that references lookup result handles rather than
   hand-typed canonical values when possible.
4. `validate_surface_draft` or `submit_surfaces` resolves those handles, checks the
   raw evidence, and returns one of:
   - `accepted`, with canonical fields that will be persisted;
   - `repairable_rejected`, with field paths, error codes, and suggested tool calls;
   - `quarantined`, for research-only observations that are useful but cannot be
     promoted;
   - `hard_rejected`, for fabricated, source-mismatched, or policy-invalid rows.
5. The agent repairs and resubmits while the source context, tool transcript, and
   prior failed validation result are still available.

This removes the "rerun the whole corpus because route normalization failed" mode.
The run artifact should still keep rejected draft attempts and validation errors,
but failed canonical fields should not wait until downstream projection time to be
discovered.

### Route Identity Contract

The previous extraction produced route names in many incompatible forms: bare
routes, SBS-suffixed routes, Select Bus Service prose, branch groups, slash lists,
corridor-only descriptions, and route-redesign prose. This must be impossible in
the new persisted layer.

The model may provide:

- `routeTextRaw`: verbatim source text such as `M15 SBS`, `M15 Select Bus Service`,
  `M14 A/D`, `Q52/Q53 SBS`, `Bx6 Local`, or `Brooklyn bus routes`;
- `routeMentionEvidence`: field support handles for where that text appears;
- `routeLookupSelections`: lookup handles plus selected route ids from `route_lookup`
  results, proposed by the agent and validated by `submit_surfaces`;
- `routeRole`: source-faithful role such as affected, comparison, context,
  proposed, retained/no-change, corridor-only, or unclear;
- `serviceVariantRaw`: source text for SBS/local/limited/express/branch wording;
- `routeAmbiguityNote`: why the source wording is ambiguous.

The model must not invent canonical route ids or provide them as trusted facts. It
may propose route ids only by selecting from `route_lookup` results and citing the
evidence that supports the selection.

The runner deterministically produces:

- `routeMentionsRaw[]`: all source strings exactly as written;
- `routeResolutionCandidates[]`: catalog/alias matches from `route_lookup`, each
  with route id, alias matched, mode, current/historical/proposed state, and score;
- `routeIds[]`: canonical bare route ids, such as `M15`, `M14A`, `M14D`, `Q52`,
  `Q53`, only when lookup plus evidence support is decisive;
- `routeFamilies[]`: normalized family ids used for branch/family logic, such as
  `M14` for `M14A/M14D`, only for grouping/search and never as a replacement for
  exact route ids;
- `serviceVariants[]`: SBS/local/limited/express/branch tags separated from the
  bare route id;
- `routeResolutionTier`: `direct_route_text`, `route_family_branch_group`,
  `source_single_route_context`, `catalog_alias`, `corridor_only`, `systemwide`,
  `historical_or_proposed_route`, `ambiguous`, or `rejected`;
- `routeResolutionIssues[]`: unknown route, subway/rail/station-only, route-count
  prose, route family collapsed too far, corridor mismatch, unsupported branch,
  stale/historical route, or generic route-redesign context.

Submission repair examples:

- `unknown_route_id`: selected id is not in the route universe;
- `selected_route_not_in_lookup_result`: selected id was not returned by the
  referenced lookup handle;
- `route_text_not_supported_by_evidence`: cited evidence does not contain the raw
  route mention or acceptable alias;
- `route_family_requires_branch_review`: source says a family such as `M14 A/D` or
  `Q52/Q53`, but exact branches cannot be deterministically separated;
- `service_variant_in_route_id`: selected route id includes SBS/local/limited prose
  that belongs in `serviceVariants[]`;
- `non_bus_mode_route_selection`: lookup resolves to subway/rail/station-only
  context, not a bus route.

Promotion rules:

- `routeIds[]` is required for route-level detector, causal, timeline, and brief
  claims. `routeMentionsRaw[]` alone is never enough.
- `routeResolutionTier=direct_route_text` or `source_single_route_context` can
  support route-level evidence when the source and evidence are otherwise clean.
- `route_family_branch_group` is allowed for grouping and review queues, but public
  claims must either name the family explicitly or keep exact branch ids.
- `corridor_only`, `systemwide`, `ambiguous`, `historical_or_proposed_route`, and
  `rejected` cannot be promoted as route-level proof without human review.
- SBS/local/limited/express is a service variant, not part of the canonical route
  id. The persisted route id remains the bare MTA route id, with the variant in a
  separate field.

### Evidence Pointer

Every supportable field points to one or more evidence pointers.

```ts
type DocumentEvidencePointerV2 = {
  pointerId: string;
  sourceId: string;
  sourceContentHash: string;
  pageNumber: number;
  pageArtifactKey: string;
  markdownHash: string;
  blockIndexHash: string;
  blockId: string;
  blockHash: string;
  lineStart: number;
  lineEnd: number;
  quoteText?: string;
  quoteHash?: string;
  tableId?: string;
  tableCell?: {
    rowIndex: number;
    columnIndex: number;
    headerText?: string;
    rowHeaderText?: string;
  };
  renderRef?: {
    renderArtifactKey: string;
    bbox?: [number, number, number, number];
  };
  observationId?: string;
  extractionMethod: "ocr_markdown" | "table_index" | "pdf_text" | "render_inspection" | "prior_hint";
};
```

### Field Support

Field support is the deterministic verification artifact. It answers: "Can this
specific field be independently checked?"

```ts
type FieldSupportV2 = {
  supportId: string;
  surfaceId: string;
  fieldPath: string;
  supportRole:
    | "primary"
    | "context"
    | "caveat"
    | "counter_evidence"
    | "missing_data"
    | "coverage_audit"
    | "methodology"
    | "route_scope"
    | "date_support"
    | "status_support"
    | "metric_value"
    | "table_cell";
  evidencePointers: string[];
  counterEvidencePointers: string[];
  verifierState: "verified" | "warning" | "rejected" | "not_checked";
  verifierCodes: string[];
  supportCompleteness: "exact" | "partial" | "context_only" | "absent";
  notes?: string;
};
```

### Surface Row

Surface rows are the canonical shape for extracted document observations, not
the only shape in the corpus. The full package also keeps source manifests, page
indexes, block indexes, table indexes, tool transcripts, source gaps, and derived
research artifacts as sibling files. A surface row may reference those artifacts,
but it should not inline an entire PDF, a full OCR page index, a large table, or
a computed event-study panel.

```ts
type DocumentResearchSurfaceV2 = {
  schemaVersion: 2;
  surfaceId: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  sourceInvestigationId: string;
  corpusRole:
    | "atomic_observation"
    | "source_level_observation"
    | "relation_edge"
    | "gap_assertion"
    | "derived_seed";
  sourceScope: {
    kind:
      | "document"
      | "page_window"
      | "page"
      | "block"
      | "table"
      | "figure"
      | "map"
      | "cross_document";
    blockIds?: string[];
    tableId?: string;
    figureId?: string;
    parentSurfaceIds?: string[];
  };
  surfaceKind:
    | "source_note"
    | "entity_mention"
    | "metric_observation"
    | "table_observation"
    | "event_candidate"
    | "service_change_candidate"
    | "treatment_component"
    | "claim"
    | "causal_claim"
    | "context_signal"
    | "review_question"
    | "source_gap_seed"
    | "brief_claim_seed"
    | "finding_reasoning_seed"
    | "relation";
  rawText: string;
  displayLabel: string;
  payloadSchemaId: string;
  rawPayload: Record<string, unknown>;
  artifactRefs: Array<{
    artifactId: string;
    artifactKind:
      | "source_manifest"
      | "page_markdown"
      | "block_index"
      | "table_index"
      | "table_slice"
      | "render_image"
      | "tool_transcript"
      | "prior_extraction"
      | "analysis_artifact";
    path: string;
    contentHash: string;
    role: "primary" | "context" | "provenance" | "bulk_payload" | "derived_from";
  }>;
  priorHints: Array<{
    hintId: string;
    hintKind: string;
    sourceArtifactKey: string;
    validationState: string;
    usedAs: "context_only" | "candidate_seed" | "conflict" | "ignored";
  }>;
  fieldSupportIds: string[];
  lifecycle: {
    extractionState: "candidate" | "verified_candidate" | "reviewed" | "promoted" | "rejected";
    reviewState: "unreviewed" | "needs_review" | "approved" | "rejected";
    promotionState: "none" | "research_only" | "detector_context" | "brief_context" | "public_candidate";
  };
  intendedUses: Array<
    | "detector_evidence"
    | "detector_context"
    | "brief_claim_seed"
    | "finding_reasoning_seed"
    | "public_timeline_candidate"
    | "causal_treatment_inventory"
    | "event_study_window"
    | "source_gap_queue"
    | "gold_label_seed"
    | "review_packet_context"
  >;
  blockers: string[];
  confidence: {
    agentConfidence: "low" | "medium" | "high";
    verifierConfidence: "none" | "low" | "medium" | "high";
    confidenceReasons: string[];
  };
};
```

This is enough to represent the agent's working corpus when "represent" means
"give every observation, gap, relation, and seed a stable, evidence-backed handle."
It is not enough if interpreted as "all useful bytes live inside one JSONL row."
Large or specialized objects stay in sibling artifacts:

- full source OCR, page/block indexes, renders, and shell/search transcripts;
- full table bodies when the table is too large for one useful slice;
- source-level absence/search-gap logs;
- deterministic project metric panels, source-gap detector outputs, event-study
  estimates, natural-experiment candidate libraries, visuals, and brief drafts;
- human review decisions and promotion receipts.

Those sibling artifacts should link back to surface ids, and surface rows should
link forward to the artifact refs that explain or bulk-store their evidence.

### Specialized Payloads

Keep specialized payloads inside `rawPayload`, but require `payloadSchemaId` so
the verifier can validate known variants and quarantine unknown ones. The first
implementation can accept an escape-hatch payload only when `corpusRole` is
`source_level_observation`, `gap_assertion`, or `derived_seed`; public, causal,
brief, and detector uses require a known payload schema.

- Entity mention: raw text, entity mode (`bus_route`, `subway_line`, `rail_service`,
  `station`, `street`, `corridor`, `agency`, `program`, etc.), normalized refs,
  validation state, ambiguity notes.
- Metric observation: label, raw value, parsed value, unit, period, geography,
  comparison, direction, authority, source method, approximate/chart-derived flag,
  deterministic cross-check requirement, cited table cells.
- Table observation: table kind, title, headers, row/column counts, completeness,
  every useful row/cell coordinate, footnotes, approximate values, table purpose.
- Event candidate: event family, raw status, normalized status, status timeline,
  date assertions, date precision, date role, route/corridor scope, treatment
  components, proposal/planning/process flags, causal-anchor eligibility blockers.
- Service change: route roles, added/removed/modified service, retained/no-change
  flags, declined-comment flags, proposal status, source route text.
- Claim/causal claim: claim text, claim basis (`observed`, `projected`,
  `attributed`, `methodology`, `policy_statement`), causal flag, metric refs,
  caveats, counter-evidence, allowed claim tier.
- Context signal: context kind, mechanism, geography, time period, evidence role,
  whether it is official context, caveat, or counter-evidence.
- Review question/source gap: question type, priority, missing source, search
  attempts, affected downstream products, suggested next action.
- Relation edge: relation kind, from/to surface ids, relation direction, evidence
  role, conflict state, confidence, and whether the relation is intra-source,
  cross-source, or derived by deterministic lookup.
- Source note: document mode, page families, source date state, publisher,
  retrieval/provenance notes, source-wide caveats, OCR quality, table/map/chart
  availability, and skip/scope decisions.
- Derived seed: target artifact family, projection rule, required upstream
  surface ids, required deterministic inputs, blocked language tiers, and review
  gates.

## Deterministic Verification

Required hard gates:

1. Source identity: source id, page numbers, page artifact keys, source content hash,
   markdown hash, and block-index hash match runner-owned manifests.
2. Evidence pointers: every block id exists, page number matches, line range stays
   inside block, block hash matches, quote text if present is inside the block/window.
3. Field support: every required public/research-critical field has at least one
   `FieldSupportV2` row with exact or acceptable partial support.
4. Metric support: parsed numeric values and units appear in cited text or table cells.
   Document metrics default to document-claimed; project metric authority is rejected.
5. Status/date support: implementation, launch, activation, installed, planned, proposed,
   scheduled, canceled, report-date, and meeting/study words are checked against exact
   status/date evidence.
6. Route/mode support: bus route ids require route text or deterministic lookup support;
   subway/rail/station-only text cannot support bus-route claims.
7. Route normalization: persisted `routeIds[]` must be canonical bare route ids from
   `route_lookup` or the route catalog, while SBS/local/limited/express/branch prose
   stays in service-variant fields. Ambiguous, corridor-only, systemwide, route-count,
   and historical/proposed route references cannot satisfy route-level promotion gates.
8. Table support: table values include row/column coordinates, header context, footnotes,
   and approximate/chart-derived flags.
9. Prior-hint separation: prior candidates cannot be the only evidence for a verified
   surface unless they resolve to the same source coordinates.
10. Tool transcript integrity: every `observationId` or source-shell output referenced by
   a surface exists and its output hash matches the transcript.
11. Payload schema: every known `payloadSchemaId` validates against its payload schema.
    Unknown payloads are allowed only for quarantined observation/gap/seed rows and
    cannot be promoted to detector, brief, causal, or public use.
12. Artifact refs: every `artifactRefs[]` path exists in the run manifest, has the
    declared content hash, and uses a role compatible with the surface kind. Bulk table
    or figure claims require a `table_slice`, `table_index`, or `render_image` ref.
13. Use gates: causal/public/detector/brief tags require the corresponding field support
    and blocker checks.

Warnings, not blockers:

- Context-only fields without exact numeric support.
- Useful but low-confidence route/corridor ambiguity.
- Review questions with weak but explicit evidence.
- Truncated source windows when the missing tail is recorded as a source gap.
- Unknown payload schemas on rows that are explicitly research-only and blocked from
  public, detector, brief, and causal projections.

## Evaluation Scorecard

Run a small held-out fixture scorecard before any full run.

Hard fail if any fixture has:

- Fabricated source/page/block/line evidence.
- Unsupported numeric value in a public/research-critical field.
- Proposed/planned/process text promoted to implemented.
- Rail/subway/station text used as bus-route proof.
- Project metric authority assigned to document-claimed numbers.
- Tool transcript missing for any search/shell-derived observation.

Score dimensions:

- Evidence correctness: refs resolve, hashes match, quotes/cells support fields.
- Recall of useful surfaces: tables, metrics, events, context, caveats, source gaps.
- Suppression quality: boilerplate, generic SBS toolkit, page numbers, map legend noise.
- Status/date discipline: proposal vs planned vs implemented vs report/meeting/study.
- Route/mode discipline: bus route, SBS variants, subway/rail/station separation.
- Metric discipline: authority, units, periods, geography, approximate flags.
- Table quality: row/cell coordinates and footnote handling.
- Downstream usefulness: can produce finding/brief/source-gap/causal seed artifacts.
- Agent reproducibility: tool transcript completeness, deterministic replayability.
- Cost/tool economy: focused source-scoped work without monolithic live calls.

Fixture families to include:

- 14th Street busway before/after tables.
- M86 SBS with Second Avenue Subway confound.
- Bx6 or route-redesign proposal with stop-level ridership.
- Better Buses program page with aggregate claimed speed/ridership metrics.
- ACE/ABLE/camera-enforcement pages and lowercase `able` traps.
- Generic SBS feature/toolkit pages with no project anchor.
- Community-board proposal/comment-response pages with declined or retained service.
- Rail/subway/station-heavy pages near bus context.
- Methodology/report-date pages.
- Source-gap pages that cite a missing external report.

## Implementation Plan

1. Define schemas in `packages/domain`.
   Add `DocumentEvidencePointerV2`, `FieldSupportV2`, `DocumentResearchSurfaceV2`,
   tool transcript rows, source-gap rows, and verification report schemas.

2. Build runner-owned source indexes in `tools/pipeline-v2`.
   Generate source manifests, page indexes, block indexes, table indexes, and prior-hint
   bundles from existing OCR/discovery artifacts.

3. Add read-only source tools.
   Start with `source_manifest`, `page_index`, `doc_page`, `doc_search`,
   `block_context`, `table_slice`, lookup tools, and `prior_candidate_lookup`.
   Add `source_shell` only behind an allowlist and transcript hash.

4. Add the forced-tool extraction loop.
   One source or page-window investigation per call. The prompt must say prior
   candidates are hints, not truth, and the agent must submit surfaces plus field support.

5. Add deterministic verifier.
   Verify source/hash/pointer support, field support, metrics, status/date, route/mode,
   table cells, prior-hint separation, and transcript integrity.

6. Add fixture scorecard.
   Convert research-audit gold/adversarial/causal outputs into stable fixture labels.
   Gate live full-corpus runs on fixture pass.

7. Run staged extraction.
   Start with 5-10 high-value sources, then one source group, then full corpus after
   coverage/failure/retry reporting is stable.

8. Emit derived downstream artifacts.
   Build `brief-claim-seeds`, `finding-reasoning-seeds`, `detector-context`,
   `causal-candidates`, and `source-gap-seeds` as projections from verified surfaces,
   not as separate LLM inventions.

## Acceptance Criteria

- The harness can inspect a PDF/source one source at a time and produce line-numbered,
  field-supported surfaces without manual path guessing.
- Every run has source manifests, page/block/table indexes, tool transcripts,
  surfaces, field support rows, source gaps, and a verification report.
- All public/research-critical fields have independently verifiable evidence support.
- Prior extracted data improves recall but cannot become truth without source support.
- The held-out fixture scorecard passes with zero hard failures.
- Derived brief/finding/detector/causal/source-gap artifacts are projections from
  verified surfaces and preserve provenance.

## Non-Goals

- Do not load candidate surfaces directly into D1 serving tables.
- Do not let the agent compute project KPIs or causal effects.
- Do not replace analyst/reviewer promotion decisions.
- Do not add Python/PostGIS/VPS dependencies for this harness.
- Do not treat provider/model success as validation success.

## Open Questions

- Should `source_shell` be enabled in the first implementation, or should narrow tools
  cover all PDF/text needs before shell is allowed?
- Which fields are mandatory for `verified_candidate` by surface kind?
- How much table-cell data should be retained for very large tables before switching
  to table slices plus artifact refs?
- Should the verifier require quote text for every pointer, or allow block-line-only
  support for table cells and long paragraphs?
- Which prior reviewed intervention records should seed gold fixtures versus remain
  ordinary prior hints?
