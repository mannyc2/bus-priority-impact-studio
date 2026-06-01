---
title: Intervention Source Coverage
type: data
status: active
last_updated: 2026-05-25
owner: codex
source_count: 454
tags: [interventions, ace, bus-lanes, sbs, tsp, busways, source-coverage]
---

# Intervention Source Coverage

> **v1 command retirement note (2026-05-27).** References below to `docs:ocr`,
> `docs:ocr-review`, `docs:validate`, `docs:promote`, `docs:audit-promoted-source-backing`,
> `docs:followup-curation-bundle`, `docs:followup-curation-decisions`,
> `docs:followup-curation-queue`, `docs:followup-resolution-audit`, and
> `docs:verify-followup-curation` describe the v1 Tier 2 pipeline state circa 2026-05-24..25
> and the on-disk artifacts that pass produced. The commands themselves have been retired as
> part of the `tools/pipeline-v2` migration. The artifacts (e.g. `candidate-bundle.json`,
> `candidate-validation.json`, `promotion-report.json`, `followup-curation-queue.json`,
> `tier2-intervention-events.json`) are still on disk. See
> `tools/pipeline-v2/inventory-audit.md`.

## Why this matters

The Studio should not imply that every route timeline is a complete history of bus-priority work.
As of the March 2026 serving export, the structured intervention layer knows a narrow set of
source-backed events:

- MTA/NYCT ACE and ABLE route implementation dates.
- NYC DOT bus-lane infrastructure dates where matched `open_dates` are parseable.
- Manually curated Tier 2 document interventions from `manual-intervention-candidates.json`.
- Explicit bus-lane source gaps where a route has matched lane geometry but no route-level
  implementation date suitable for before/after evaluation.

Serving exports, violation counts, source-gap placeholders, and generated artifact milestones are
not intervention timeline points.

## Current coverage

Counts below refer to the canonical local March 2026 pipeline DB and generated evaluation artifact.

| Layer | Current structured source | March 2026 count | Timeline treatment |
|---|---|---:|---|
| MTA/NYCT ACE and ABLE route events | MTA Bus Automated Camera Enforced Routes dataset plus ACE page/press release context | 79 in-scope events, 77 implemented and 2 future, across 59 routes | Show as dated enforcement interventions |
| ACE/ABLE evaluation rows | Route intervention comparison output | 22 evaluated before/after rows; remaining rows are future or insufficient data | Show evaluation status inside event detail |
| NYC DOT bus-lane infrastructure | NYC DOT Bus Lanes - Local Streets `open_dates` joined to route geometry | 166 dated events across 166 routes | Show as dated infrastructure interventions |
| Bus-lane evaluation rows | Route intervention comparison output | 58 evaluated before/after rows | Show evaluation status inside event detail |
| Bus-lane source gaps | Matched bus-lane geometry without parseable implementation dates | 115 source-gap rows | Keep out of timeline; expose as data quality/evidence notes |
| ACE violations | MTA ACE violations dataset | Monthly route/type/status counts | Evidence context only, not an intervention event |
| Manual Tier 2 intervention registry | Reviewed OCR/HTML evidence in `manual-intervention-candidates.json` | 30 treatment-level candidates: 18 canonical milestones, 11 implemented treatment components, 1 planned/proposed | Default route timeline shows canonical milestones; expanded treatment layer shows components; planned layer is separate |
| Tier 2 generated evidence rows | `tier2-intervention-events-combined.json` plus event dispositions | 939 generated rows dispositioned: 45 curated, 329 support, 94 planned-only, 24 context-only, 447 deferred | Never show raw generated rows as public timeline events |
| D1/R2 serving export rows | Pipeline artifacts | Generated rows and manifests | Operational metadata only, not an intervention event |

The UI label should be "curated intervention timeline" or equivalent, with copy making clear that it
is currently promoted structured/manual public-source coverage, not a complete institutional history
and not the Tier 2 OCR candidate queue.
The current Tier 2 promoted-event source-backing audit covers 895 promoted staging events: all
895 have matching validated candidates, matching route/date/type/source fields, and valid cited
document chunks, with 0 source-backing issues. The audit does not change the follow-up OCR queue;
that queue remains manual-curation input until reviewer decisions, validation, and promotion run.

## 2026-05-25 gap-research update

The next high-ROI work is a performance-spine/data-source pass plus table-aware document claim
promotion, not a larger undifferentiated scrape.

Manifest additions now queue the MTA performance bundle that joins cleanly on route/month where
applicable: Wait Assessment (`v4z4-2h6n`, already implemented locally), Customer Journey-Focused
Metrics (`8mkn-d32t`), Bus Speeds (`cudb-vcni`), Bus Service Delivered (`6qwi-vjde`), CBD Bus Speeds
(`r6db-kkzj`), CBD Bus Routes (`cgzt-smqf`), and the CBD geofence/map (`srxy-5nxn`, `vaq5-qfkz`).
Context/watchlist sources now in the manifest include Bus Fare Evasion (`uv5h-dfhp`), Daily
Ridership and Traffic (`sayj-mze2`), Bus MDBF (`7mt2-y7ip`), the MTA Open Data Catalog
(`f462-ka72`), MTA capital project datasets (`9hy6-8j6t`, `f6fd-xfps`, `nswv-d6bz`), CRZ vehicle
entries, bridge/tunnel crossings, accessibility context, and service alerts.

The reviewed Tier 2 OCR backlog now has 61 seeds. The expansion adds Open Data Plan annual
updates, NYCT Key Performance Metrics PDFs, route-redesign final/addendum documents for Bronx,
Queens, and Brooklyn, Jamaica and 14th Street monitoring reports, B44/M86 SBS progress reports,
Comptroller and IBO evaluations, the MTA Fare-Free Bus Pilot evaluation, and the NYC Streets Plan
update stream. These sources should produce first-class table/claim/methodology candidates before
any public prose or timeline promotion.

## Gap plan: what we have and what is needed

These eight gaps define the next intervention-timeline work. They are ordered so the product stops
overclaiming first, then expands coverage through source-backed promotion.

| # | Gap | What we have | What is needed | Done when |
|---:|---|---|---|---|
| 1 | Canonical intervention inventory beyond ACE and bus lanes | `intervention_event` and `route_intervention_comparison` cover ACE/ABLE and dated bus-lane rows; source gaps are explicit; the manual Tier 2 registry now promotes 30 treatment-level candidates and dispositions all 939 generated rows; Studio release reads curated manual candidates instead of raw Tier 2 staging rows | Full-page chunk browsing/search from public route timelines and a durable D1/R2 registry export beyond the release JSON projection | The public timeline displays only curated canonical milestones by default, exposes implemented treatment components in an expanded layer, keeps planned/proposed work separate, and never presents raw OCR/generated co-mentions as interventions |
| 2 | Tier 2 document extraction | A 61-source reviewed seed backlog, `docs:discover`, `docs:capture`, `docs:ocr-plan`, `docs:ocr`, `docs:ocr-review`, first-pass `docs:extract`, first-pass `docs:chunk`, and first-pass `docs:validate`; the 2026-05-25 no-LLM acquisition pass captured 54/61 sources and queued 35 PDFs / 345.246 MB for OCR; the 2026-05-24 live loop reached a 454-source official/officially linked corpus fixed point with 426 captures, 368 OCR-required PDFs, a candidate bundle with 454 source candidates, 9,875 entity-link candidates, 2,145 unvalidated intervention seeds, 192 review questions, and 188 follow-up OCR candidates, plus 9,374 document chunks; the full follow-up OCR run selected all 188 targeted ranges, completed 179 OCR outputs, and reviewed 176 as good, with 175 marked extract-worthy; `followup-curation-queue.json` packages those 175 sources for manual review | Manual candidate curation from reviewed follow-up OCR, then deterministic validators/promotion; OCR triage now exposes a `record_tier2_ocr_triage` tool so the model can create source-grounded `candidateDrafts` and richer `evidenceCandidateDrafts` during OCR, but those drafts are still unvalidated; board/committee packet acquisition continues through targeted project pages, brochures, and official linked decks | Fixture-backed curation or extraction plus validation produces a promoted candidate bundle, not only intervention seeds: document cards, chunks/citation refs, claim candidates, entity-link candidates, intervention seeds, source-gap/review questions, evidence-link candidates, and audit summaries |
| 3 | Route and corridor validation | Route catalog, route geometry, corridor model, route-to-LION street links, and some street evidence; `docs:validate` now validates route IDs, date normalization, matching chunk-backed source spans, intervention-family mapping, and corridor mentions that match route-linked LION streets for intervention seeds; `docs:chunk` creates stable excerpts/hashes for review | Stronger validators for old/new aliases, busways, duplicate fingerprints, and exact excerpt/claim-span proof during canonical promotion | A candidate cannot promote unless its route/corridor link is validated or explicitly marked human-review-only |
| 4 | Date precision and event status | ACE/ABLE exact dates and bus-lane parseable `open_dates`; source gaps for missing dates | A common date model for exact date, month, year, planned date, warning-period start, summons start, completion, and unknown date | Every promoted intervention records `implementationDate`, `datePrecision`, and `eventStatus`; unknown dates remain source gaps |
| 5 | Source references in the UI | Timeline items show event month, title, evaluation status, and tone | Compact source affordance or detail payload with source title, URL/dataset, retrieved date, and span/row reference | Users can tell why a timeline point exists without reading pipeline artifacts |
| 6 | Data-quality panel for excluded evidence | Source gaps are filtered out of timelines; ACE violation counts stay out of event titles | A route-level evidence/data-quality section for undated bus-lane matches, ACE violation counts, insufficient pre/post windows, and source freshness | Excluded evidence is visible as caveated context, never as a timeline intervention |
| 7 | ACE scope-change events | ACE/ABLE implementation rows and monthly violation summaries | Source-backed `ace_scope_change` extraction for all-day rollout, warning-period start, summons start, hours/scope changes, and affected routes | "ACE all-day rollout" appears only when an official source identifies route scope and date |
| 8 | Audit guardrails | Studio projection now filters source gaps and synthetic export milestones in code | Tests/audits that reject timeline titles/details from operational metadata and reject source-gap leakage | CI/QA fails if "Serving export generated", "ACE evidence present", or source-gap rows appear as timeline events |

### Expanded plan for gap #2: Tier 2 document extraction

Tier 2 is not just an `InterventionSeed` generator. It is the official-document intake layer for
the Studio. Intervention seeds are one promoted output stream, alongside evidence, caveats, review
questions, recall seeds, and wiki/search material.

The planned outputs are:

| Output | Purpose | Promotion target |
|---|---|---|
| `document_source_candidate` | Register a discovered official page, PDF, press release, board packet, dashboard row, or dataset dictionary with source group, owner, document date, retrieval metadata, and intended use | Source backlog, source cards, docs search |
| `document_chunk` | Preserve stable source spans with chunk IDs, hashes, page/section/offset refs, and excerpts | Search index, citation refs, validation |
| `document_claim_candidate` | Capture source-grounded official/third-party/context claims that do not fit a stricter metric/table/methodology shape | Finding evidence links, public caveats, source cards |
| `document_metric_claim_candidate` | Preserve before/after rows, percent changes, values, units, baseline/comparison windows, direction/time-of-day, geography, and fact classification | Route findings, busway/SBS evaluation evidence, source cards |
| `document_table_candidate` | Store extracted headers/rows/captions for official tables, including SBS progress and board-book tables | Manual review, metric claim validation, evidence resolver |
| `document_methodology_candidate` | Capture dataset/metric definitions, aggregation units, comparison bases, and field caveats | Methodology refs and source-card caveats |
| `document_caveat_candidate` | Capture limitations, source lag, missing public inventory statements, and non-route-level warnings | Data-quality panels and finding caveats |
| `document_project_status_candidate` | Preserve proposed/planned/implemented/canceled/superseded project status statements | Intervention status validation and negative evidence |
| `document_treatment_component_candidate` | Capture bus lanes, busways, queue jumps, TSP, bus bulbs, off-board fare, ACE enforcement, stop balancing, and similar components | Treatment-layer review and route/corridor evidence |
| `document_supersession_candidate` | Link draft/final/addendum/pilot/permanent/canceled source chains | Source cards, route redesign timelines, negative evidence |
| `document_source_gap_candidate` | Preserve explicit source absence statements, such as no public stop boardings or no current TSP inventory | Data-quality/source-gap findings |
| `document_entity_link_candidate` | Link mentions to route IDs, route aliases, corridors, streets, sources, interventions, dates, and project IDs | Deterministic validators and review queue |
| `document_intervention_seed` | Propose dated or planned bus-priority events such as SBS launches, TSP, busways, stop changes, fare/boarding changes, redesigns, capital milestones, or ACE scope changes | `intervention_event` staging and timeline promotion |
| `document_evidence_link_candidate` | Attach validated document claims/spans to deterministic findings, route briefs, methodology notes, and intervention events | Finding evidence links and Studio evidence refs |
| `llm_extraction_audit` | Record prompt hash, model/tool version, source hashes, candidate counts, validation outcomes, and failures | Pipeline QA and reproducibility artifacts |
| Wiki/search summary | Human-readable synthesis after validation | `knowledge/wiki/`, static search artifacts, public document cards |

The first implementation slice should prove the whole flow on a small reviewed backlog, not scrape a
large corpus:

1. Backlog: 10-20 reviewed documents covering ACE/ABLE, SBS/BRT route pages, busways, one TSP
   source, one borough redesign source, one capital dashboard/data source, and active dataset
   dictionaries.
2. Capture: store final URL, publisher, retrieved time, document date, content hash, MIME type,
   terms note, raw artifact key, and text extraction status.
3. Chunk/index: `docs:chunk` now produces deterministic chunks before stronger extraction; the next
   addition is a lexical search artifact and exact claim-span references.
4. Curate/extract: `docs:extract` now emits the first bundle from OCR triage artifacts. If the OCR
   model called `record_tier2_ocr_triage`, `candidateDrafts` seed the draft intervention rows and
   `evidenceCandidateDrafts` seed richer unvalidated evidence rows for metric, table, methodology,
   caveat, status, treatment, supersession, and source-gap review. When no tool call is present, the
   command falls back to the older family/route/corridor/date triage arrays. For the full follow-up
   OCR set, manually audit the reviewed OCR/text first and curate structured candidates plus evidence
   refs directly when the volume is manageable. Deterministic validation and promotion gates remain
   unchanged.
   Chunking is citation packaging/search support, not the core extraction step.
5. Validate: route IDs, route aliases, street/corridor links, dates/date precision, source spans,
   duplicate fingerprints, and source-registry matches are checked deterministically.
6. Promote: validated candidates can create intervention staging rows, document evidence links,
   source-gap/review questions, recall-backtest seeds, wiki summaries, and compact public document
   cards.
7. Audit: every run reports source count, chunk count, candidate counts by type, validation
   pass/fail counts, reviewed/promoted counts, and blocked sources.

The key acceptance test for gap #2 is a fixture-backed extraction run that demonstrates all major
candidate types and proves that no document-derived prose becomes a metric claim or public timeline
event without validation/promotion.

### Deferred generated-row source-gap queue

The 447 deferred Tier 2 generated rows are a source-gap queue, not hidden timeline events. They
should be reviewed in larger buckets only when a bucket has a likely structured or canonical source:

| Priority | Bucket | Next source action | Promotion rule |
|---:|---|---|---|
| 1 | ACE scope/all-day rollout rows | Use the structured ACE source and official MTA ACE pages/press releases before any OCR-only promotion | Promote `ACE all-day rollout` only with route scope, effective date, and official source span |
| 2 | Bus-lane infrastructure rows | Cross-check against DOT bus-lane geometry/open dates, project pages, and corridor PDFs | Promote only when the lane extent/date is source-backed and not already represented by structured geometry |
| 3 | Stop consolidation and service-change rows | Prefer SBS route pages, redesign implementation notices, and official service-change documents | Promote only when before/after service or stop pattern and effective date are stated |
| 4 | TSP rows beyond the 2017/2018 report candidates | Look for intersection-level or corridor implementation inventories | Promote as treatment components, not timeline launches, unless an implementation milestone is stated |
| 5 | Capital milestones and busway/proposal rows | Review project pages/decks for construction start/opening/completion language | Keep proposal/presentation dates in the planned layer until an implemented date is stated |

Rows that stay broad route/treatment co-mentions remain `defer` or `merged_as_support`; they should
feed search/backlinks and source-gap notes, not the default route timeline.

Implemented corpus acquisition:

- `knowledge/raw/tier2_document_backlog.json` now seeds 61 reviewed official MTA/DOT/Open Data
  sources across ACE/ABLE, SBS, busways, TSP, Better Buses, route redesign, fare policy, capital
  projects, board books, dataset methodology, dataset dictionaries, official project pages,
  third-party government evaluations, and OCR-worthy PDFs.
- Live run `tier2-seed-expansion-2026-05-25` captured 26 of the initial 32 seeds, queued 10 PDFs for OCR
  triage, and discovered 132 additional official/officially linked candidates into a 164-source
  merged backlog for the next capture pass.
- `docs:discover` reads captured HTML pages, extracts official Tier 2 links, records discovery
  provenance, and writes a merged discovered backlog for the next capture pass.
- `docs:capture` fetches the backlog into ignored `data/artifacts/docs/<run_id>/`, records per-source
  metadata/checksums, stores HTML/JSON/PDF raw artifacts, and extracts basic HTML text.
- `docs:ocr-plan` reads the capture manifest and writes the Pi/OpenRouter OCR plan for
  `ocr_required` PDFs before any model call.
- `docs:ocr` slices each queued PDF to pages `1-10` or all pages when shorter, prepares ignored
  triage input artifacts, and sends one PDF at a time through OpenRouter with `service_tier = "flex"`
  and `max_tokens = 4096` by default when `--execute` is passed. The request includes the
  `record_tier2_ocr_triage` tool so the OCR model can write source-grounded `candidateDrafts` and
  `evidenceCandidateDrafts` while preserving JSON fallback behavior. The default broad triage model is `google/gemini-3.5-flash`;
  use GPT-5.5 only for comparison/escalation. Completed source artifacts are reused on resume.
- `docs:ocr-review` reads the current OCR artifacts and writes `ocr-quality-review.json` so extraction
  work can separate OCR problems from merely non-canonical intervention material. The review flags
  OpenRouter error responses, missing parsed JSON, low OCR text density, partial/poor OCR labels,
  missing route/date/corridor fields, and map/chart/table visual-review hints.
- `docs:extract` reads the OCR plan, OCR quality review, capture manifest, and parsed triage JSON,
  then writes `candidate-bundle.json` with document source candidates, OCR-derived entity-link
  candidates, OCR/tool-derived intervention seeds, review questions, follow-up OCR candidates, and
  an extraction audit. All intervention seeds from this command are `unvalidated`.
- `docs:chunk` reads the candidate bundle and writes `document-chunks.json` with stable chunk IDs,
  text hashes, excerpts, HTML/OCR extraction modes, and OCR page references where available.
- `docs:validate` reads the candidate bundle, document chunks, and generated route catalog, then
  writes `candidate-validation.json`. It currently validates route IDs, date normalization,
  matching document chunks/source-span artifacts, intervention-family mapping, and corridor
  mentions that match route-linked LION street names.
- `docs:promote` reads validation results and writes `promotion-report.json`. It defaults to
  dry-run; `--execute` also writes the canonical Tier 2 staging artifact
  `tier2-intervention-events.json`.
- `docs:dedupe` reads the canonical staging artifact and writes
  `tier2-intervention-duplicate-audit.json`, grouping likely duplicate staged events before any
  public serving integration.
- `docs:followup-ocr-plan` reads the candidate bundle and writes `followup-ocr-plan.json` from
  follow-up OCR candidates for targeted proposal/timeline ranges.
- Live run `tier2-docs-2026-05-24` captured 14 of 15 sources, extracted 9 HTML text artifacts,
  stored 2 JSON dictionaries, queued 3 PDFs for OCR planning, and left the MTA Queens redesign
  press-release URL as a 403 source gap.
- Live full-corpus run `tier2-full-corpus-2026-05-24-pass2` captured the merged 454-source backlog.
  Final discovery over that capture found 0 new candidates, so this is the current fixed-point
  corpus from the reviewed seeds and captured official HTML pages. Pass 2 captured 426 sources,
  left 28 failures as source gaps, extracted 55 HTML text artifacts, and queued 368 PDFs for OCR
  planning.
- 2026-05-31 preservation reconciliation corrected that picture: the pass-2 fixed point was a
  discovery fixed point, not a complete reviewed-seed fixed point. A reproducible supplement in
  `data/ops/docs/tier2-ocr-preservation-20260531/` re-adds 31 absent OCR-backed seed sources,
  records 7 renamed/current source-id aliases, and writes a 485-source augmented backlog plus a
  filtered capture manifest that reuses the already-downloaded May 25 artifacts.

OCR runs after corpus capture. Tier 2 should first fetch the reviewed corpus, prefer HTML and
text-layer PDFs, classify scanned or explicitly reviewed PDFs as `ocr_required`, then run a separate
OCR pass over that subset through the project-local Pi harness and OpenRouter, using a configured
multimodal model such as `google/gemini-3.5-flash`. The current full-corpus OCR plan totals 1,778.58 MB
across 368 PDFs and uses first-10-page triage before focused extraction. OCR-derived claims require
quality review plus source-span validation before promotion.

Current OCR quality status for `tier2-full-corpus-2026-05-24-pass2`: all 368 planned PDFs have
parsed first-10-page triage JSON after the Gemini Flash completion pass (`351 good`, `17 partial`,
`0 poor`; `367 extract`, `1 skip`). The completion pass retried 191 unfinished/non-parsed sources
with OpenRouter `service_tier = "flex"` and cost `$6.096778125`. The completed triage set is enough
to begin focused chunking/extraction, but OCR-derived candidates still need source-span validation
before promotion.

Current first-pass extraction status for `tier2-full-corpus-2026-05-24-pass2`: `docs:extract`
created `candidate-bundle.json` with 454 document source candidates, 9,875 entity-link candidates,
2,145 OCR-derived intervention seeds, 192 review questions, 188 follow-up OCR candidates, and 1
audit row. These counts are useful for prioritization only; none are canonical timeline events yet.

Current chunking status for the same run: `docs:chunk` created `document-chunks.json` with 9,374
chunks across 423 sources: 5,707 captured-HTML chunks and 3,667 OCR-annotation chunks. This gives
manual review and future extraction stable chunk IDs, hashes, excerpts, and OCR page refs, but the
current validator only checks matching source chunks by source/artifact/page; exact excerpt-level
claim proof is still a canonical-promotion requirement.

Current first-pass validation status for the same run: `docs:validate` reviewed all 2,145
intervention seeds, route-validated 1,899, date-validated 2,098, mention-backed source-span
validated 1,562, found matching chunks for all 2,145, and intervention-type-validated 1,200. The
route-to-LION corridor pass validated 1,763 seeds on street mentions; the combined gate marks 895
seeds `validated` and 1,250 `needs_review`.

Current staging promotion status: `docs:promote --execute` reviewed the 2,145 validation results,
wrote `promotion-report.json` and `tier2-intervention-events.json`, promoted 895 validated staging
events with source chunk IDs from 250 sources, blocked 1,250 as `needs_review`, and rejected 0.
This is not a direct public timeline write: the serving schema/export consumes only eligible staged
rows after duplicate gating, structured ACE/bus-lane filtering, and route/month/title
de-duplication.

Current duplicate-review status: `docs:dedupe` reviewed the 895 staged events and found 533 event
fingerprints. It marks 175 duplicate-candidate groups covering 537 staged events for review, leaving
358 staged events unique by the current type/date/route-set fingerprint.
`docs:duplicate-review` expands those 175 groups into `tier2-intervention-duplicate-review.json`
with source titles/URLs, source chunk IDs, route/corridor/date mentions, and review
recommendations: 35 single-source duplicate-collapse candidates and 140 multi-source comparison
candidates.
`docs:duplicate-decisions` writes the editable decision template. All 175 groups remain
`needs_human_review` until a reviewer fills the decision, selected event, reviewer, reviewed-at, and
rationale fields.
`docs:verify-duplicate-decisions` currently reports `complete: false`: 0 decisions complete, 175
incomplete, and reviewer/reviewed-at metadata missing for all 175 rows.
`docs:load-staging` now applies the decision template when it is present: reviewed
`keep_separate_events` groups become eligible, reviewed `collapse_to_one_event` groups keep only
the selected event eligible while non-selected duplicates become `suppressed_duplicate`, and
incomplete groups remain `blocked_duplicate_review`. The current run still has 0 complete duplicate
decisions, 175 incomplete duplicate decisions, 358 eligible events, 537 blocked events, and 0
suppressed duplicates.

Current follow-up OCR planning status: `docs:followup-ocr-plan` created 188 targeted source/range
entries totaling 1,024.99 MB of original source PDFs and skipped 180 originally planned OCR sources.
The full follow-up execution uses Gemini Flash through OpenRouter `service_tier = "flex"` under
`ocr-followup-gemini35-flash`. It selected all 188 entries from the full plan, reused 60 existing
outputs, completed 179 OCR outputs, and found 9 no-page/exhausted page-selection failures. The full
review marks 176 outputs `good`, with 175 `extract`, 1 `skip`, 0 partial, 0 poor, 12 unknown
quality/decision rows, 671,060 annotation text chars, and 79 manual visual-review hints.
`docs:followup-curation-queue` now writes `followup-curation-queue.json` from that full review and
triage manifest. It has 175 manual curation items: 131 high priority and 44 medium priority. The
queue packages useful pages, review notes, triage summaries, route/corridor/date/family mentions,
OCR artifact keys, normalized intervention-type counts, and blank `manualCuration` fields for
review decisions.
`docs:followup-curation-decisions` now writes the editable decision template, and
`docs:verify-followup-curation` writes the verifier. A metadata-derived draft fill was discarded
because it was not true manual review. The current verifier is complete: 175 complete decisions,
0 incomplete decisions, and 0 missing reviewer/reviewed-at/rationale fields.

Current follow-up extraction status: `candidate-bundle-followup-top60.json` remains a historical
dry-run over an earlier reviewed slice. It extracts top-60 follow-up OCR outputs into 878
entity-link candidates, 218 intervention seeds, 169 review questions, 22 additional follow-up OCR
candidates, and 1 audit row. `document-chunks-followup-top60.json` adds 6,213 chunks, including
506 follow-up OCR annotation chunks. `candidate-validation-followup-top60.json` validates 49 of the
218 follow-up seeds and leaves 169 as `needs_review`; the dry-run
`promotion-report-followup-top60.json` finds 49 promotable follow-up events and writes no canonical
follow-up staging artifact. Do not extend this as another slice-by-slice LLM/chunking layer. The
next step is manual curation from the full reviewed OCR/text, with optional single-pass LLM
candidate extraction only if the manual audit shows it is worth the cost.

Current completion-gate status: `docs:status` writes `tier2-pipeline-status.json` for the full
1-8 Tier 2 effort. The current artifact is `complete: false`: corpus/extraction,
validation/promotion, and Studio timeline source affordances are complete; duplicate decisions are
blocked by 537 staged events pending review; follow-up OCR is complete for manual curation with 179 completed outputs,
176 reviewed outputs, 175 manual curation queue items, 175 complete follow-up curation decisions, and
169 historical top-60 follow-up seeds still needing review.

See [[wiki/data/tier2_document_corpus|Tier 2 document corpus]] for current promotion state, the
governing rules, and remaining gaps.

The manual review of existing OCR/text established that `extract` means
candidate-for-structured-extraction, not "OCR the rest of the PDF"; broad full-document OCR is not
recommended. The OCR review policy and quality-tier doctrine now live in
[[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 document corpus pipeline]].

A five-source cheap-model comparison under `ocr-triage-gemini35-flash-sample` found Gemini Flash
good enough for broad page-selection triage: all five parsed, all five were `decision = extract`,
and all five were `ocrQuality = good`, at 53.9% of the GPT-5.5 sample cost. It was less complete on
exact corridor wording and intervention-family vocabulary, so final extraction should still validate
source spans and escalate source-critical/low-confidence documents.

## Event promotion rules

Promote a candidate intervention into `intervention_event` only when it has:

1. A source URL or dataset ID.
2. A stable event type.
3. A route, corridor, street segment, or route-alias mapping that can be validated.
4. An implementation, launch, warning-period, planned, or completion date with date precision
   recorded.
5. A source span, row ID, document page, or artifact reference.
6. A status: `implemented`, `planned`, `future`, `source_gap`, or `superseded`.

If a source confirms a treatment exists but does not provide a usable date, keep it as a source gap.
If a source is a generated pipeline milestone, export summary, or evidence count, keep it out of
the intervention model.
Run `docs:audit-promoted-source-backing` after validation/promotion to confirm every promoted event
still has a validated candidate and chunk-backed source span before treating the staging artifact as
timeline-ready.

## Missing intervention families and acquisition path

| Intervention family | Likely authoritative sources | Extraction approach | Promotion caveat |
|---|---|---|---|
| SBS launch dates | NYC DOT BRT route pages and route index; MTA press releases and service-change pages | Seed each BRT route page, extract route IDs, launch date, corridor, and SBS feature bundle into `select_bus_service_launch` candidates | Launch date can be route-level while features vary by segment; do not infer TSP, bus lanes, or all-door boarding unless the source states them |
| Transit Signal Priority installs | NYC DOT TSP status report/press releases, Better Buses pages, project PDFs, and possible current/open-data feeds if discovered | Extract route/corridor/intersection lists and implementation year/month into `transit_signal_priority_install` candidates; validate route IDs and, where possible, intersection geometry. Interim Studio serving now reads the captured 2017 NYC DOT TSP status source into route/segment `tspStatus` fields without promoting broad intervention events. | Current public sources may be report-like snapshots rather than a current complete inventory; mark stale or partial |
| Stop consolidation | MTA borough bus network redesign pages, implementation schedules, board materials, and GTFS stop/schedule snapshots | Use MTA docs for canonical effective dates; use GTFS diffs as validation for stop-count changes and old/new route aliases | A GTFS stop-count delta alone is not an intervention unless tied to a promoted MTA service-change source |
| All-door boarding / fare policy | SBS feature pages, MTA fare-policy pages, SBS launch docs, OMNY/fare collection updates | Treat as an attribute of SBS launch when route-specific; create a separate `fare_policy_change` only when a source names affected routes and date | Do not infer all-door boarding for every route without source-backed SBS/fare-policy coverage |
| Busway launches | NYC DOT busway page, corridor project pages, press releases, and project PDFs | Extract busway corridor, affected routes, hours, launch/planned dates, and status into `busway_launch` candidates | Busway date is corridor-level; route mapping must be validated against route geometry and service dates |
| Route redesign / service changes | MTA borough bus network redesign plans, implementation press releases, schedules, and GTFS releases | Extract network phase dates and affected route IDs into `route_redesign_service_change` candidates; validate old/new aliases against route catalog and GTFS | Treat as service context unless the source identifies a bus-priority treatment or stop-pattern change |
| Capital project milestones | MTA Capital Program Dashboard, Capital Project Schedules dataset, committee materials, and DOT project pages | Capture project ID, phase, start/completion milestone, asset/category, location, and route/corridor links into `capital_project_milestone` candidates | Many capital records are facility- or asset-level rather than route-level; promote only with a defensible route/corridor link |
| ACE all-day rollout / scope changes | MTA ACE page, ACE route dataset, ACE brochures, and ACE expansion press releases | Add an `ace_scope_change` extraction path for warning-period start, summons start, hours/scope changes, and affected route IDs | Do not create "ACE all-day rollout" from ACE active status alone; promote only when a source explicitly gives route scope and date |

## Tier 2 implementation plan

1. Add reviewed seed URLs for NYC DOT BRT routes, busways, Better Buses pages, MTA ACE updates,
   borough bus redesign pages, and MTA capital dashboard/data pages.
2. Extend the Tier 2 document corpus extractor with strict `InterventionSeed` candidates:
   `eventType`, `sourceId`, `sourceUrl`, `documentDate`, `routeIds`, `corridorName`,
   `streetNames`, `implementationDate`, `datePrecision`, `eventStatus`, `sourceSpan`, and
   `needsHumanReview`.
3. Add deterministic validators:
   - route ID validation against route catalog;
   - route alias validation for redesigned routes;
   - street/corridor text match against route shape street evidence where available;
   - date normalization with precision tracking;
   - duplicate fingerprinting by event type, route/corridor, source, and date.
4. Promote only reviewed or high-confidence validated candidates into local intervention tables.
5. Keep public language descriptive until the methodology gate allows stronger before/after claims.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y — verified_at: 2026-05-24
- https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforcement-Violations-Be/kh8p-hcbm — verified_at: 2026-05-24
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-05-24
- https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3 — verified_at: 2026-05-24
- https://www.nyc.gov/html/brt/html/routes/routes.shtml — verified_at: 2026-05-24
- https://www.nyc.gov/html/brt/html/about/sbs-features.shtml — verified_at: 2026-05-24
- https://www.nyc.gov/html/brt/html/routes/14th-street.shtml — verified_at: 2026-05-24
- https://www.nyc.gov/html/brt/html/busways/busways.shtml — verified_at: 2026-05-24
- https://www.nyc.gov/html/brt/html/betterbuses/betterbuses.shtml — verified_at: 2026-05-24
- https://www.nyc.gov/html/dot/html/pr2017/pr17-055.shtml — verified_at: 2026-05-24
- https://www.mta.info/press-release/mta-announces-planned-implementation-dates-queens-bus-network-redesign — verified_at: 2026-05-24
- https://capitaldashboard.mta.info/ — verified_at: 2026-05-24
