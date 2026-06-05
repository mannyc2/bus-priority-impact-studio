---
title: Tier 2 Structured Extraction Harness Plan
type: engineering
status: draft
last_updated: 2026-06-03
owner: codex
source_count: 0
tags: [tier2, documents, ocr, extraction, harness, applied-research, detectors]
---

# Tier 2 Structured Extraction Harness Plan

## Purpose

This page defines the next document-extraction layer after OCR Markdown exists.

The immediate task is not more OCR. It is a harness that lets an agent read one Markdown page or
small page window and submit structured, source-grounded data through a schema-validating tool. The
output should be rich enough to feed:

- detector evidence packets and source-gap findings;
- intervention inventories for event studies and causal panels;
- forecasting/context-regime features;
- event-family response-drift studies;
- public route timelines and evidence cards;
- detector-evaluation gold labels, near misses, and review questions.

The current Tier 2 path proves that the corpus can produce useful intervention records, but the next
system should not collapse all document meaning into timeline rows. It needs page/window evidence,
claims, tables, entities, interventions, context signals, and review questions before synthesis.

## Reviewed Old Structured Data

Local inspection of the historical and current Tier 2 artifacts found several useful layers.

| Artifact family | What it contains | What it teaches the next harness |
|---|---|---|
| Full-corpus candidate bundle | 454 source candidates, 9,871 entity links, 2,251 intervention seeds, 192 review questions, 188 follow-up OCR candidates, and 12,956 unvalidated candidates. | The first pass was recall-heavy and document-wide. It found useful structure, but it overgenerated route/event seeds and needs stricter page/window anchoring and validation. |
| Phase 3 v3 reviewed intervention records | 310 reviewed records across 36 sources and 285 route IDs; all parse as the current `bp.document_intervention_record.v1` contract. | This is the best current research substrate, but it is a curated subset and is shaped around intervention records rather than all applied-research facts. |
| Manual intervention candidates | 30 curated candidates plus 939 event dispositions. Fields include `qualityTier`, `dateRole`, `routeRoles`, component-level evidence support, and review disposition. | This is the best public/event shape. Its field-level evidence support and quality-tier model should graduate into the next schema rather than remain a one-off curation file. |
| Publishable intervention projection | 70 promoted rows, split between canonical milestones and planned/proposed rows. | Useful serving surface, but too compressed for detectors, causal inference, forecasting, or structured extraction evaluation. |
| Raw OCR candidate tool calls | Per-page-window candidate drafts with exact quotes, page refs, candidate types, route/corridor mentions, negative-evidence flags, and per-type fields. | The existing forced-tool-call pattern is a good base. The next schema should keep its quote discipline while adding better entity normalization, table structure, event roles, and research-use tags. |
| OCR Markdown page files | Rich frontmatter with source ID, title, publisher, page number, PDF count, OCR model, artifact keys, hashes, routes/corridors/dates/metric hints, and rendered page metadata. | Page metadata and content hashes should become first-class evidence refs. The harness should not treat Markdown body text as the only source state. |

The audit command for this inventory is:

```sh
bun --filter @bp/pipeline-v2 cli audit tier2-structured-data
```

## Sample Content Review

The plan below is based on a small manual review of representative pages and their old structured
outputs.

| Source sample | Observed structure | Harness implication |
|---|---|---|
| DOT transit-signal-priority report page/window | Rich program-level claims, counts, route/corridor mentions, future rollout language, and official performance claims. | Numeric claims must be recorded as document claims with authority and quote support, not project metrics. Planned/future language must stay proposed or planned until another source proves implementation. |
| 14th Street busway brochure | Precise corridor extent, launch date, vehicle restrictions, operating hours, curb rules, enforcement, and monitoring language. OCR metadata incorrectly treated some street names as route mentions. | Keep raw mentions separate from validated route refs and corridor refs. Street/corridor normalization must be deterministic and separately reviewed. |
| Bronx bus network redesign profile page | Dense route table with checkboxes, stop removals, stop spacing, headway/frequency changes, and proposal language. | Tables need first-class extraction. Route redesign pages should become service-change candidates, not automatically bus-priority treatment events. |
| NYCT KPI / board metric page | Official narrative claims about ACE expansion, route speed changes, collision changes, and blocked-stop reductions. | The schema needs `metricAuthority` and `needsDeterministicMetric` flags. Official claims can support context or priors, but deterministic analytics remain the source of Studio metric truth. |

## Design Doctrine

1. **Extract before synthesizing.** The first structured output should preserve page/window facts,
   not immediately decide the canonical intervention record.
2. **Every extracted claim needs evidence.** No quote, no candidate. Numeric claims need the numeric
   value inside the cited span.
3. **Documents are evidence, not metric authority.** A document can say what an agency claimed. The
   project's computed speed, reliability, ridership, and effect-size values still come from
   deterministic feature tables.
4. **Raw mentions and validated refs are different fields.** The model can extract "14th Street" or
   "M14"; deterministic validators decide whether those are streets, corridors, route IDs, or
   ambiguous mentions.
5. **Do not collapse proposed, planned, implemented, and historical context.** Status and date-role
   errors are more dangerous than missing rows.
6. **Tables are not prose.** Preserve table rows/cells and footnotes where they carry route,
   status, metric, or schedule meaning.
7. **Carry research intent.** A candidate should say whether it might feed detector evidence, a
   causal treatment inventory, a forecasting context feature, a response-drift study, a public
   timeline, a review question, or a source-gap queue.
8. **Validation outranks model confidence.** Model confidence can prioritize review, but promotion
   depends on deterministic validators and human dispositions.

## Discovery-First Update

The first pass should now be a **discovery layer**, not the final normalized extraction layer.
The goal is to collect enough raw candidates to understand the source vocabulary before designing a
stricter final tool schema.

Discovery extraction should:

- preserve free-form labels such as `rawKind`, `familyRaw`, `labelRaw`, `tableKindRaw`, and
  `contextKindRaw`;
- keep optional hints such as `bus_route`, `transit_line`, or `rail_service`, but never throw away
  the source's raw label;
- accept rail, subway, PATH, LIRR, NJ Transit, Amtrak, stations, neighborhoods, street-user groups,
  curb rules, and design elements as first-pass entities when they appear;
- use deterministic block/page/line evidence refs rather than requiring long evidence quotes;
- keep metrics as raw observations with `labelRaw`, `valueRaw`, `unitRaw`, `subjectRaw`,
  `geographyRaw`, `periodRaw`, and `comparisonRaw` until the metric taxonomy is reviewed.

The normalization layer comes later: after candidate distributions have been reviewed, we design a
better final tool-argument shape and rerun or transform the discovery corpus into detector-ready
claims, intervention records, context signals, and review packets.

## Discovery Curation Audit

The first discovery curation pass is now available through:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 curate-discovery --top-clusters 75
```

It reads the current discovery roots and writes the curation audit, Markdown summary, and manual
rules seed under the Tier 2 full-corpus artifact run:

- `document-discovery-curation-audit-v1.json`
- `document-discovery-curation-audit-v1.md`
- `document-discovery-curation-rules-v1.json`
- `document-discovery-normalized-candidates-v1.json`

The audit currently covers 582 extraction windows across 37 sources and 7 source groups. The
curation rules normalize raw discovery labels into source-observed families such as bus routes,
rail/transit lines, streets, corridors, agencies, programs, treatment/design elements, ridership,
bus speed, travel time, reliability/dwell, traffic volume, route/stop/treatment inventory,
enforcement/violation metrics, public feedback, methodology/source notes, service connectivity,
and causal/effect claims.

The normalized candidate artifact is not the final extraction schema. It is the curated bridge
between free-form discovery and final schema design. It emits one row per raw candidate with a
stable row ID, source/window refs, candidate type, canonical family, raw family/label, cluster key,
evidence refs, and the original raw candidate payload. The current artifact has 11,368 rows:

| Candidate type | Rows |
|---|---:|
| Entities | 5,489 |
| Metrics | 1,823 |
| Events | 468 |
| Tables | 259 |
| Claims | 1,405 |
| Context signals | 821 |
| Review questions | 1,103 |

The densest normalized families are useful schema-design pressure points: streets, bus routes,
treatments/design elements, agencies, intersections, and corridors for entities; ridership, traffic
volume, street-design dimensions, bus speed, safety outcomes, and travel time for metrics;
proposed treatments, performance observations, existing conditions, public feedback, and problem
statements for claims; and performance-comparison / map-legend / street-design-dimension tables.

Current unresolved family counts in the rules seed are:

| Candidate type | Unresolved count | Notes |
|---|---:|---|
| Entities | 0 | Remaining entity raw kinds have been assigned reviewable families. |
| Metrics | 0 | Metric raw labels have a curation family; final numeric normalization is still separate. |
| Tables | 0 | Table raw kinds have a curation family. |
| Claims | 0 | The lone generic `assertion` row was audited and assigned to `performance_observation`. |

The audited `assertion` row came from the 116th Street CB11 June 2025 presentation, page 9. The
claim text says there is high ridership across 10 bus routes in the study area, and the same page
anchors it to daily on-bus ridership bins, October 2024 weekdays, and MTA leave-load data. The
curation rule now treats high-ridership / ridership-across statements as `performance_observation`
claims while preserving the raw family `assertion` in the normalized row.

Important curation decisions from the audit:

- Evidence refs should use page/block/line information; the runner should attach canonical hashes.
- Documents provide claimed metrics and context, not deterministic Studio metric truth.
- Bus routes, subway lines, PATH, LIRR, NJ Transit, Amtrak, and stations are allowed in discovery,
  but bus routes stay separate from rail/transit-line entities.
- Repeated claims across sources should be preserved as corroboration, not blindly deduplicated.
- The final normalized extraction schema should use these observed families as input vocabulary,
  while still preserving raw labels for later reviewer/audit use.

## Focused Opus Research Audit Shards

The first stronger-model review path is `docs tier2 research-audit`. It builds a deterministic
fixture pack from the canonical normalized discovery corpus and can either dry-run the prompt pack
or execute a Pioneer/Opus forced-tool call.

The command intentionally supports focused shards because a monolithic schema + gold + adversarial
+ causal audit is too output-heavy for reliable interactive runs. Use `--focus` with one of
`schema`, `gold`, `adversarial`, or `causal`; keep `all` for dry-run planning only.

Representative shard command:

```sh
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- docs tier2 research-audit \
  --normalized-candidates data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-normalized-candidates-canonical-v1.json \
  --page-markdown-audit data/artifacts/docs/tier2-ocr-audits/gemini35-lowhanging-v1/ocr-page-markdown-audit.json \
  --markdown-run-root data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2 \
  --focus schema \
  --fixture-count 4 \
  --max-markdown-chars-per-fixture 1500 \
  --max-candidate-sample-per-fixture 4 \
  --max-raw-candidate-chars 300 \
  --model claude-opus-4-5 \
  --max-tokens 4000 \
  --execute
```

First successful shard outputs live under
`data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/`:

- `tier2-research-audit-opus-v1-schema-shard-a-live-tool-call.json`
- `tier2-research-audit-opus-v1-gold-shard-a-live-tool-call.json`
- `tier2-research-audit-opus-v1-adversarial-shard-a-live-tool-call.json`
- `tier2-research-audit-opus-v1-causal-shard-a-live-tool-call.json`

The first Opus shard set converged on these schema requirements:

- default extracted metrics to `document_claimed` until deterministic analytics or external
  validation promote them;
- add implementation status evidence and date resolution for intervention events;
- separate bus routes from subway/rail/transit-line entities with explicit mode;
- split table families so map legends, stop-level ridership tables, before/after comparisons, and
  generic performance tables are not one bucket;
- add causal-claim flags and claim-basis fields so agency-attributed effects do not enter causal
  panels as facts;
- track metric geography scope and measurement methodology.

The first causal shard identified review candidates for 14th Street busway ITS, M86 SBS travel-time
decomposition, Second Avenue Subway/M86 ridership response, staggered SBS program effects, and Bx6
baseline construction. All remain candidate studies: they need implementation dates, time series
rather than single snapshots, control corridors/routes, and method review before any causal wording.

## Normalization Workbench Loop

The next layer is now a repeatable normalization workbench rather than an ad hoc manual review.
It implements the six-step loop:

1. group normalized discovery candidates by candidate type, curated family, and raw family;
2. ask a stronger model for normalization, merge, suppression, and denormalization rules on a
   selected high-risk/breadth-balanced batch;
3. persist proposed rules and review questions as artifacts;
4. apply only approved deterministic seed rules to the full normalized corpus;
5. emit unresolved/review queues and denormalized source surfaces;
6. repeat on the unresolved or ambiguous long tail.

The command is:

```sh
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- docs tier2 normalization-workbench \
  --normalized-candidates data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-normalized-candidates-canonical-v1.json \
  --group-count 40 \
  --examples-per-group 4
```

The current deterministic dry run writes:

- `document-discovery-normalization-workbench-v1.json`
- `document-discovery-normalization-workbench-batch-v1.json`
- `document-discovery-denormalized-surfaces-v1.json`
- `document-discovery-normalization-workbench-v1.md`

Dry-run summary:

| Measure | Value |
|---|---:|
| Input rows | 155,886 |
| Candidate groups | 23,584 |
| Selected review groups | 40 |
| Approved seed rules | 6 |
| Model proposed rules | 0 |
| Deterministic review queue rows | 38,769 |

The approved seed rules produce full-corpus denormalized surfaces for document metric claims,
document entities, intervention events, document tables, document claims, and the source-gap queue.
These are source-document surfaces, not deterministic Studio metric truth.

A first live `claude-opus-4-5` normalization shard was run with 28 selected groups and three
examples per group. The selected batch covered 6 claim groups, 6 event groups, 6 metric groups, 4
review-question groups, 4 table groups, and 2 entity groups. The model returned 12 proposed rules
and 3 review questions:

- merge planning/effect claim families such as `screening_conclusion`, `alternatives_analysis`,
  `next_step`, `projected_outcome`, and `projected_impact` into more explicit planning/effect
  claim families with causal/status gates;
- merge community engagement/outreach/presentation events and project phase/capital-project
  milestone events under status-gated event families;
- suppress qualitative benefit phrases such as "Faster bus rides" from metric surfaces unless a
  numeric document claim exists;
- merge stop/station/stop-spacing tables into a stop-station table family;
- suppress map/commercial-property entities from transit entity surfaces;
- merge missing-detail/content-gap/design-detail/data-gap review questions into a source-gap family.

Live shard artifacts:

- `document-discovery-normalization-workbench-opus-shard-a-v1.json`
- `document-discovery-normalization-workbench-opus-shard-a-v1-tool-call.json`
- `document-discovery-normalization-workbench-opus-shard-a-v1-response.json`
- `document-discovery-normalization-workbench-opus-shard-a-v1.md`
- `document-discovery-denormalized-surfaces-opus-shard-a-v1.json`

The Opus rules are intentionally `proposed`, not `approved_seed`. They should be reviewed and
converted into deterministic rules before they affect applied surfaces. The first unresolved design
questions are whether rail station distance metrics should be routed to a rail-specific surface or
suppressed, whether traffic-diversion estimates belong in document metric claims or a traffic-impact
surface, and whether alternatives-analysis scoring matrices need a dedicated evaluation-table
family.

## Discovery Coverage and Targeted Reruns

The discovery layer now has an explicit coverage loop:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 discovery-coverage \
  --ocr-plan data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/ocr-plan.json \
  --page-markdown-audit data/artifacts/docs/tier2-ocr-audits/gemini35-lowhanging-v1/ocr-page-markdown-audit.json \
  --page-window-size 1 \
  --output data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-coverage-refactored-v1.json \
  --missing-window-manifest data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-missing-windows-refactored-v1.json
```

The coverage artifact classifies every OCR-complete page/window into:

- `discovered` — a current-prompt extraction exists;
- `needs_rerun_old_schema` — only an older extraction exists;
- `failed` — a previous attempt wrote an error artifact;
- `missing` — OCR Markdown exists but no discovery extraction exists;
- `skipped_no_ocr` — OCR Markdown is not available;
- `blocked_no_plan_source` — the OCR audit has a source that the current extraction plan cannot
  run because it is absent from the OCR plan.

It also writes a missing-window manifest containing only runnable `missing`, `failed`, and
`needs_rerun_old_schema` windows. `docs tier2 discovery-extract` accepts that manifest through
`--window-manifest`, so reruns can target only incomplete windows while reusing already-complete
per-window artifacts:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 discovery-extract \
  --ocr-plan data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/ocr-plan.json \
  --page-markdown-audit data/artifacts/docs/tier2-ocr-audits/gemini35-lowhanging-v1/ocr-page-markdown-audit.json \
  --window-manifest data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-missing-windows-refactored-v1.json \
  --discovery-root document-discovery-refactored-v1 \
  --provider deepseek \
  --model deepseek-v4-flash \
  --page-window-size 1 \
  --window-concurrency 4 \
  --max-estimated-cost-usd 20 \
  --execute
```

This is the bridge from "we ran discovery on a sample" to "we know exactly which OCR pages have
current discovery data, which pages need rerun, and which pages are blocked before extraction."
The extraction runner now also canonicalizes evidence refs from the block index: the model submits
`blockId`, `pageNumber`, `lineStart`, and `lineEnd`, while `blockHash` is optional and filled by
the runner. That keeps prompt tokens lower and prevents stale or hallucinated hashes from becoming
the source of truth.

### Output audit after broad Pioneer/DeepSeek discovery

The latest broad curation review is:

- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-curation-review-all-roots-latest.json`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-curation-review-all-roots-latest.md`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-normalized-candidates-review-all-roots-latest.json`

It intentionally reads every non-empty discovery root, including earlier DeepSeek breadth/budget
passes, Pioneer canaries, `document-discovery-refactored-v1`, and the active Pioneer resume/retry
roots. Because several roots contain duplicate extraction attempts for the same page/window, this is
a **schema-design review corpus**, not yet a deduped final dataset.

Snapshot generated on 2026-06-02:

| Measure | Value |
|---|---:|
| Extraction artifacts parsed | 8,657 |
| Sources represented | 364 |
| Source groups represented | 7 |
| Validation issues | 1,123 |
| Normalized candidate rows | 150,558 |
| Rows with evidence refs | 150,503 |
| Evidence refs | 178,179 |
| Evidence refs with block hash | 178,172 |
| Evidence line-span p50 / p90 / p99 | 1 / 9 / 29 lines |

Candidate volume:

| Candidate type | Rows |
|---|---:|
| Entity | 73,553 |
| Metric | 18,881 |
| Event | 8,230 |
| Table | 2,756 |
| Claim | 21,413 |
| Context signal | 11,845 |
| Review question | 13,880 |

Source-group coverage in the review corpus:

| Source group | Sources | Extractions |
|---|---:|---:|
| `bus_priority_document` | 304 | 7,450 |
| `select_bus_service` | 46 | 953 |
| `capital_projects` | 4 | 133 |
| `ace_able` | 3 | 51 |
| `better_buses` | 1 | 48 |
| `busway` | 5 | 11 |
| `transit_signal_priority` | 1 | 11 |

The main validation problems are evidence-reference hygiene, not malformed records. Aggregated
issue counts:

| Issue | Count | Interpretation |
|---|---:|---|
| `evidence_line_range_outside_block` | 982 | Model line ranges sometimes extend beyond the cited block; final extraction should make line refs runner-normalizable and never require model-supplied hashes. |
| `evidence_block_hash_mismatch` | 109 | The model sometimes copied or generated stale hashes; block hashes should be runner-owned. |
| `proceed_page_has_no_candidates` | 12 | Page profile says proceed, but candidate arrays are empty; this is a prompt/evaluator gate. |
| `block_index_hash_mismatch` | 9 | Mostly stale or duplicate-root artifact drift; final curation should pick one canonical root per window. |
| `unknown_evidence_block_ref` | 7 | Rare block-id errors; final validator should repair only if the intended block is unambiguous, otherwise reject. |
| `markdown_hash_mismatch` | 3 | Artifact drift; final outputs need input snapshot hashes. |
| `duplicate_candidate_id` | 1 | Easy validator rejection. |

The discovery pass is useful. Spot checks show it can extract:

- before/after travel-time tables with row-level metric cells, such as the M60 125th Street page
  comparing October 2013 versus October 2014 travel times;
- document-claimed bus-speed improvements and agency caveats;
- reliability/dwell breakdowns such as in-motion, red-light, and bus-stop shares;
- treatment/event candidates for bus lanes, SBS service changes, curb changes, stop changes,
  off-board fare collection, and public-engagement milestones;
- curb-context tradeoffs, enforcement/access-rule context, public-feedback constraints, and
  follow-up research questions;
- explicit causal/effect claims that should be routed to review-gated applied-research artifacts,
  not accepted as causal truth.

It is **not** safe yet as a final structured source of truth. The current outputs are recall-heavy
and deliberately permissive. They preserve raw source vocabulary well, but downstream systems need a
stricter normalized layer before using the data for detector packets, causal panels, forecasting
features, or public timelines.

### Final discovery coverage reconciliation

The latest coverage reconciliation artifacts are:

- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-final-failure-classification-v1.json`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-final-failure-classification-v1.md`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-blocked-source-reconciliation-v1.json`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-blocked-source-reconciliation-v1.md`

Against the current `document-discovery-coverage-progress-latest.json` snapshot:

| Window state | Count | Meaning |
|---|---:|---|
| Discovered | 8,848 | Current discovery extraction exists. |
| Failed | 79 | Runnable extraction windows whose latest/highest-priority attempts failed. |
| Blocked no plan source | 335 | OCR-complete windows across 18 sources absent from `ocr-plan.json`. |
| Missing / old-schema / no-OCR | 0 | No remaining uncovered runnable windows outside the failed set. |

The 79 failed windows split by selected latest/highest-priority error class into 38
`provider_http_error` rows, 29 legacy gateway-timeout rows, 8 `tool_arguments_unparseable` rows,
and 4 legacy missing-tool-call rows. They remain runnable and should go through a focused retry
pass after active discovery processes settle.

The 335 blocked windows are not provider failures. OCR Markdown exists for them, but the current
discovery plan has no matching source row. Resolution is either to add those 18 sources to
`ocr-plan.json` or to record explicit lineage mappings if any are aliases/duplicates of planned
sources.

The canonical one-extraction-per-window curation artifact is:

- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-curation-canonical-v1.json`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-curation-canonical-v1.md`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-curation-rules-canonical-v1.json`
- `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-normalized-candidates-canonical-v1.json`

It selects one extraction per source/page window using root priority first, then fewer validation
issues, then richer candidate payloads, then stable labels/IDs. The current canonical curation has
8,848 extractions, 368 sources, 7 source groups, and 155,886 normalized candidate rows. This is now
the preferred review corpus; the all-roots curation remains a schema-design pressure-test corpus.

### Schema lessons from the audit

1. **Evidence should be block/line native, not quote native.** Discovery worked better when the
   model submitted `blockId`, `pageNumber`, `lineStart`, and `lineEnd`, with the runner filling
   hashes. The final structured schema should carry canonical evidence refs and let the runner
   materialize quotes/hashes for review packets. Verbatim quotes may remain derived display fields,
   not expensive model-output requirements.

2. **Entity vocabulary must expand but stay typed.** Discovery found useful non-bus entities:
   subway/rail/PATH/LIRR/NJ Transit/Amtrak services, stations, intersections, neighborhoods,
   community boards, vehicle/user classes, destinations, infrastructure assets, and time periods.
   Final schema should accept these as entity kinds while keeping bus routes separate from rail or
   branded transit-line mentions.

3. **Metrics need two layers.** A page can contain a claimed metric observation, but that does not
   make it a project metric. Final output should split:
   `DocumentClaimedMetricObservation` (raw/document authority) from deterministic Studio metrics
   computed from source datasets. Metric rows should carry family, label, raw value, parsed value
   when available, unit, subject, geography, period, comparison role, authority, and whether a
   deterministic cross-check is required.

4. **Tables need table-cell coordinates.** Performance-comparison tables are among the most useful
   outputs, but final extraction should link metric observations to table id, row index, column
   index/header, and footnotes. That lets us reconstruct before/after surfaces without turning a
   whole table into loose prose claims.

5. **Events need stricter status/date discipline.** The largest event families are planned
   interventions and implementation milestones. Final extraction should distinguish public
   engagement, report publication, proposal, approval, implementation, warning-period start, and
   service launch. It should reject causal/event-study tags unless date role plus route/corridor
   scope are present.

6. **Context and review questions need usefulness gates.** `other_context` and `other_question`
   are high-volume. Final output should require `whyItMatters`, downstream use tag, and priority
   for review questions, and should route generic page headings or vague questions to low priority
   or suppress them.

7. **Deduplication must preserve corroboration.** Repeated claims across documents are useful
   corroborating evidence. Do not dedupe solely by label, route, or source. Deduped synthesis should
   cluster by normalized family, route/corridor scope, date/date role, treatment components,
   metric family, and evidence source while retaining all supporting source refs.

8. **One canonical extraction per page/window is needed before evaluation.** The all-roots curation
   artifact is intentionally broad. The next curation command should produce a deduped
   `best_extraction_per_window` view using a root-priority order: latest successful Pioneer retry,
   latest Pioneer resume, refactored prompt, earlier breadth/budget passes, then smoke/canary roots.

### Next-step plan after discovery backfill settles

1. **Resolve the remaining failed and blocked windows.** Retry the 79 runnable failed windows with
   patched observability, and add or lineage-map the 18 OCR-complete sources missing from
   `ocr-plan.json`.

2. **Refactor the structured schema to v2 before a full run.** The schema should use block-line
   evidence refs, expanded entity kinds, claimed-metric observations, table-cell coordinates,
   stricter event date/status roles, and usefulness-gated context/review-question fields.

3. **Create a held-out fixture set from observed discovery pressure points.** Include at least:
   one M60/M15/B46 before-after metric table, one 14th Street busway/traffic-speed report page, one
   route-redesign table, one ACE/ABLE enforcement page, one CB presentation with proposed
   treatments, one methodology/source-note page, and one title/boilerplate page.

4. **Run a small structured-extraction comparison.** Use Pioneer `deepseek-ai/DeepSeek-V4-Flash`
   first, with the same Pi harness and provider-attempt observability. Compare against the current
   discovery output on evidence support, table fidelity, status/date discipline, metric-authority
   discipline, and research usefulness.

5. **Add an extraction evaluation scorecard.** Use the 0-1000 extraction-quality dimensions below,
   but enforce hard gates first: no unsupported numeric metrics, no proposal-to-implemented
   promotion, no causal/event-study tag without date and scope, and no missing evidence refs for
   public/research candidates.

6. **Synthesize intermediate applied-research artifacts.** Before publishing anything, derive
   separate artifacts for `document_claimed_metric_observation`, `intervention_event_candidate`,
   `context_signal_candidate`, `review_question_candidate`, and `source_gap_seed`. These are the
   inputs to detector packets, causal panels, forecasting context features, response-drift studies,
   and public timelines.

7. **Only then run full structured extraction.** Full-corpus final extraction should wait until the
   held-out fixture scorecard passes and the deduped discovery review confirms the normalized
   families are stable enough.

## Target Data Flow

```text
OCR Markdown page/window
  -> structured extraction submission
  -> deterministic validators
  -> page/window candidate artifact
  -> synthesis into intervention events, context signals, claims, tables, review questions
  -> applied-research panels, detector packets, source-gap queues, serving projections
```

The CLI in `tools/pipeline-v2` should orchestrate files, model calls, retry/resume, and artifacts.
Reusable schemas belong in `packages/domain` when they define cross-package data contracts. Scoring,
gold-set evaluation, and applied-research joins can live in `packages/applied-research` once that
package is implemented. `packages/analytics` should only consume validated document evidence where
the detector registry declares it as context or an intervention inventory dependency.

The initial v2 command is:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 structured-extract \
  --run-id <docs-run-id> \
  --provider auto \
  --page-window-size 1
```

By default, this command is prepare/resume only: it enumerates page windows and writes the summary
artifact without calling a model. Add `--execute` to spend LLM credits. `--provider auto` uses the
Pi harness with Pioneer first when `PIONEER_API_KEY` is present, then falls back to DeepSeek when
`DEEPSEEK_API_KEY` is available. Explicit `--provider pioneer` and `--provider deepseek` modes are
also available. The default page window is one page; increase `--page-window-size` only for source
families where tables or maps need adjacent-page context.

The discovery-first command is:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 discovery-extract \
  --run-id <docs-run-id> \
  --provider deepseek \
  --model deepseek-v4-flash \
  --page-window-size 1
```

By default it is also prepare/resume only. It writes per-window block indexes and request artifacts
without calling a model; add `--execute` plus a budget such as `--max-estimated-cost-usd 5` to run
LLM extraction. The discovery pass is intentionally looser than `structured-extract`; its output is
the candidate vocabulary substrate for the later normalization-layer design.

Provider setup note: local LLM keys are repo-local `.env` values, so plain `printenv` can report a
false negative. Check provider readiness with `bun run env:check:llm`, and wrap tmux or
shell-launched jobs with `scripts/with-repo-env.sh -- ...`.

Pioneer status as of 2026-06-02: direct Pioneer discovery extraction works with
`deepseek-ai/DeepSeek-V4-Flash`. The live catalog exposes that exact model ID, a minimal forced-tool
smoke passed, a one-window discovery smoke passed, and a four-window concurrency smoke passed with
zero validation issues. Pioneer is slower than direct DeepSeek on this workload, so use conservative
concurrency until larger runs show stable latency. Raw Pioneer responses for this model currently
return `prompt_tokens`, `completion_tokens`, `total_tokens`, and `prompt_tokens_details: null`, but
no `cache_read_tokens` or `cache_write_tokens`. The summary code already parses both top-level
cache counters and `prompt_tokens_details.cached_tokens`; therefore cache read/write zeros mean the
split is not observable from the current Pioneer DeepSeek Flash response shape, not that the parser
is dropping it.

Do not generalize that DeepSeek Flash result to all Pioneer models or endpoints. Pioneer also
exposes an Anthropic-compatible `/v1/messages` endpoint, and Opus streaming responses can expose
cache-event counters such as `cache_creation_input_tokens` and `cache_read_input_tokens`. However,
those streamed deltas may omit the ordinary uncached `input_tokens` needed to reconcile local token
cost exactly. The cost tracker should therefore preserve raw usage events, distinguish `unknown`
from `0`, and mark exact local cost as unavailable when uncached input tokens are missing even if
cache read/write counters are visible.

Use this explicit live check before relying on Pioneer for a large Tier 2 run:

```sh
bun run check:pioneer-provider -- --model deepseek-ai/DeepSeek-V4-Flash --max-tokens 512
```

The check loads repo-local keys, verifies the live catalog, runs a forced structured tool call, and
probes cache usage shape. On 2026-06-02 it passed all checks in about 7 seconds and observed
`prompt_tokens_details.cached_tokens` on the repeated short prompt. A separate 12-window real
discovery canary across representative bus-priority documents then passed at `--window-concurrency
8`: 12 extracted windows, 0 failures, 0 validation errors/warnings, 125,870 total tokens, and about
$0.024 local estimated cost. The full extraction canary did not expose cache-read counters, so
cache accounting is a nice-to-have observability field rather than a provider-readiness gate.

## Proposed Extraction Tool

Use one primary forced tool call per page/window:

```ts
submit_structured_document_extraction({
  source: SourcePageRef,
  pageProfile: DocumentPageProfile,
  evidenceSpans: EvidenceSpan[],
  entityMentions: EntityMention[],
  claims: ExtractedClaim[],
  tables: ExtractedTable[],
  interventionEvents: InterventionEventCandidate[],
  serviceChanges: ServiceChangeCandidate[],
  contextSignals: ContextSignalCandidate[],
  reviewQuestions: ReviewQuestionCandidate[],
  extractionAudit: ExtractionAudit
})
```

One consolidated submission keeps a page/window internally consistent. The harness can still expose
read-only lookup tools such as `route_lookup`, `street_lookup`, `source_lookup`, and
`existing_intervention_lookup` before the final submit call.

The agent should not get arbitrary filesystem or shell tools during extraction. It should receive:

- the Markdown page/window text;
- source/page metadata and content hashes;
- optional adjacent-page summaries;
- route, street, intervention, and metric-dictionary lookup tools;
- the schema-validating submission tool.

## Proposed Core Structures

The following is intentionally TypeScript-like. Final contracts should be Zod schemas with
fixture-backed tests.

```ts
type SourcePageRef = {
  sourceId: string;
  sourceTitle: string;
  publisher: string;
  sourceGroup: string;
  finalUrl?: string;
  documentDate?: string;
  documentDateState: "known" | "unknown" | "inferred_from_source_metadata";
  pageNumbers: number[];
  pageArtifactKeys: string[];
  markdownHash: string;
  sourceContentHash?: string;
};

type DocumentPageProfile = {
  documentMode:
    | "implementation_report"
    | "project_brochure"
    | "board_metrics"
    | "route_redesign_plan"
    | "methodology"
    | "press_release"
    | "community_presentation"
    | "source_dictionary"
    | "other";
  pageRole:
    | "substantive"
    | "table"
    | "map"
    | "methodology"
    | "appendix"
    | "title_or_boilerplate"
    | "unclear";
  containsInterventionEvidence: boolean;
  containsMetricClaim: boolean;
  containsTable: boolean;
  containsMapOrFigure: boolean;
  extractionShouldProceed: boolean;
  skipReason?: string;
};

type EvidenceSpan = {
  spanId: string;
  pageRefs: number[];
  quote: string;
  quoteHash: string;
  spanRole:
    | "claim_support"
    | "date_support"
    | "route_support"
    | "location_support"
    | "treatment_support"
    | "metric_support"
    | "methodology_support"
    | "caveat_support"
    | "table_support";
};

type EntityMention = {
  mentionId: string;
  evidenceSpanIds: string[];
  rawText: string;
  entityKind: "route" | "street" | "corridor" | "borough" | "stop" | "program" | "agency" | "date";
  rawRole: "affected" | "comparison" | "context" | "location" | "unclear";
  normalizedRef?: {
    refType: "route_id" | "street_id" | "corridor_id" | "program_id" | "date";
    refId: string;
    matchMethod: "exact_catalog" | "alias_catalog" | "spatial_join" | "model_suggested";
    matchConfidence: "high" | "medium" | "low";
  };
  validationState: "unvalidated" | "validated" | "ambiguous" | "rejected";
};

type ExtractedClaim = {
  claimId: string;
  evidenceSpanIds: string[];
  claimKind:
    | "official_fact"
    | "official_metric_claim"
    | "third_party_evaluation"
    | "methodology"
    | "caveat"
    | "source_quality"
    | "project_status"
    | "recommendation"
    | "review_question_seed";
  claimText: string;
  factAuthority:
    | "agency_official"
    | "agency_self_reported_metric"
    | "independent_audit"
    | "consultant_or_advocacy"
    | "unknown";
  metric?: MetricClaim;
  dateMentions?: string[];
  entityMentionIds: string[];
  researchUseTags: ResearchUseTag[];
  needsDeterministicMetric: boolean;
  caveatCodes: string[];
};

type MetricClaim = {
  metricName:
    | "bus_speed"
    | "travel_time"
    | "ridership"
    | "headway"
    | "excess_wait"
    | "collisions"
    | "blocked_stop"
    | "on_time_performance"
    | "custom";
  customMetricName?: string;
  valueText: string;
  valueNumeric?: number;
  unit?: string;
  direction?: "increase" | "decrease" | "no_change" | "mixed" | "unclear";
  comparatorText?: string;
  baselinePeriodText?: string;
  comparisonPeriodText?: string;
  metricAuthority:
    | "document_claim_only"
    | "official_customer_metric"
    | "deterministic_project_metric"
    | "third_party_estimate";
};

type ExtractedTable = {
  tableId: string;
  evidenceSpanIds: string[];
  title?: string;
  tableKind:
    | "route_profile"
    | "metric_summary"
    | "implementation_schedule"
    | "stop_change"
    | "treatment_inventory"
    | "methodology"
    | "other";
  headers: string[];
  rows: Array<{
    rowIndex: number;
    cells: string[];
    entityMentionIds: string[];
    extractedClaimIds: string[];
  }>;
  footnotes: string[];
  tableCompleteness: "complete_small_table" | "contiguous_slice" | "too_large_summarized";
};

type InterventionEventCandidate = {
  eventId: string;
  canonicalName?: string;
  eventFamily:
    | "busway"
    | "bus_lane"
    | "transit_signal_priority"
    | "camera_enforcement"
    | "select_bus_service"
    | "stop_consolidation"
    | "route_redesign"
    | "service_change"
    | "curb_management"
    | "other";
  eventSubtype?: string;
  status: "proposed" | "planned" | "approved" | "implemented" | "historical_context" | "unclear";
  qualityTier:
    | "canonical_milestone_candidate"
    | "implemented_treatment_component_candidate"
    | "planned_or_proposed_candidate"
    | "context_only"
    | "needs_review";
  date?: string;
  datePrecision?: "day" | "month" | "year";
  dateRole:
    | "launch"
    | "service_start"
    | "implemented"
    | "approved"
    | "proposal_date"
    | "report_date"
    | "warning_period_start"
    | "unknown";
  routeRoles: Array<{ mentionId: string; routeId?: string; role: "affected" | "comparison" | "context" | "unknown" }>;
  location: {
    corridorRaw?: string;
    fromRaw?: string;
    toRaw?: string;
    boroughRaw?: string;
    normalizedCorridorRef?: string;
  };
  components: TreatmentComponent[];
  evidenceSpanIds: string[];
  claimIds: string[];
  researchUseTags: ResearchUseTag[];
  duplicateFingerprint: string;
};

type TreatmentComponent = {
  componentType:
    | "red_bus_lane"
    | "busway_restriction"
    | "tsp"
    | "queue_jump"
    | "all_door_boarding"
    | "off_board_fare_collection"
    | "camera_enforcement"
    | "stop_change"
    | "curb_rule_change"
    | "signal_retiming"
    | "other";
  status: "proposed" | "planned" | "implemented" | "historical_context" | "unclear";
  description: string;
  extentRaw?: string;
  evidenceSpanIds: string[];
};

type ServiceChangeCandidate = {
  serviceChangeId: string;
  changeType:
    | "route_added"
    | "route_removed"
    | "route_modified"
    | "stop_added"
    | "stop_removed"
    | "frequency_change"
    | "headway_change"
    | "span_change"
    | "terminus_change"
    | "branch_change";
  status: "proposed" | "planned" | "implemented" | "unclear";
  routeRoles: Array<{ mentionId: string; routeId?: string; role: "affected" | "context" | "unknown" }>;
  date?: string;
  datePrecision?: "day" | "month" | "year";
  evidenceSpanIds: string[];
  sourceDocumentMode: DocumentPageProfile["documentMode"];
};

type ContextSignalCandidate = {
  signalId: string;
  signalKind:
    | "curb_friction"
    | "enforcement_rule"
    | "traffic_access_rule"
    | "construction_or_permit"
    | "street_design_constraint"
    | "terminal_or_stop_constraint"
    | "schedule_or_service_context"
    | "data_quality_caveat"
    | "methodology_caveat";
  regimeLabels: string[];
  locationMentionIds: string[];
  evidenceSpanIds: string[];
  researchUseTags: ResearchUseTag[];
};

type ReviewQuestionCandidate = {
  questionId: string;
  questionKind:
    | "needs_route_validation"
    | "needs_corridor_validation"
    | "needs_implementation_date"
    | "needs_metric_crosscheck"
    | "needs_duplicate_resolution"
    | "needs_followup_source"
    | "possible_source_gap"
    | "possible_detector_gold_label";
  question: string;
  evidenceSpanIds: string[];
  priority: "high" | "medium" | "low";
};

type ResearchUseTag =
  | "detector_evidence"
  | "detector_counter_evidence"
  | "source_gap_seed"
  | "causal_treatment_inventory"
  | "event_study_window"
  | "natural_experiment_context"
  | "forecasting_context_feature"
  | "event_family_response_drift"
  | "public_timeline_candidate"
  | "review_packet_context"
  | "gold_label_seed";

type ExtractionAudit = {
  promptVersion: string;
  modelId: string;
  toolSchemaVersion: string;
  extractedAt: string;
  pageWindowId: string;
  candidateCounts: Record<string, number>;
  skippedReasons: string[];
  modelNotes: string;
};
```

## Validator Requirements

The first harness should be validator-heavy. A candidate can exist as draft data before all of these
pass, but promotion should require the relevant gates.

| Validator | Purpose |
|---|---|
| Schema validation | Reject malformed submissions and unknown fields. |
| Quote containment | Confirm each `EvidenceSpan.quote` exists contiguously in the supplied Markdown. |
| Numeric support | Confirm every numeric metric value is present in the cited quote or explicitly absent as text-only. |
| Page/hash validation | Confirm page refs, artifact keys, Markdown hash, and source ID match the page/window input. |
| Route validation | Convert raw route mentions to catalog route IDs; keep ambiguous/rejected states visible. |
| Street/corridor validation | Normalize street/corridor names through deterministic geographic lookup, not model memory. |
| Date normalization | Parse dates, assign precision, and preserve date role. Do not use report dates as implementation dates. |
| Document-mode gating | Prevent route redesign plans from becoming implemented bus-priority interventions unless evidence says so. |
| Metric-authority gating | Keep official narrative metrics separate from deterministic project metrics. |
| Duplicate fingerprinting | Cluster event candidates by source, family, date, route/corridor, and component. |
| Table consistency | Verify extracted headers/rows are a contiguous small table or an explicitly summarized large table. |
| Research-use gating | Reject causal or forecasting use tags when required route/date/location evidence is missing. |

## Evaluation Harness

The extraction harness needs its own scorecard. It should reuse the detector-evaluation doctrine but
score extraction quality, not detector quality.

| Dimension | Weight | What it measures |
|---|---:|---|
| Evidence support | 180 | Quote containment, page refs, hashes, and per-field support. |
| Schema validity | 120 | Parse rate, unknown-field rate, enum discipline, and resumable artifact shape. |
| Entity precision | 130 | Route/street/corridor/date normalization accuracy on curated pages. |
| Status/date discipline | 130 | Avoiding false promotion from proposed/planned/report-date text into implemented events. |
| Metric-authority discipline | 110 | Separating official prose claims from deterministic metrics. |
| Table fidelity | 90 | Preserving small tables and useful contiguous slices without filtered row fabrication. |
| Research usefulness | 120 | Producing data that can feed detector packets, causal panels, forecasts, drift studies, and source-gap queues. |
| Duplicate control | 70 | Avoiding redundant event rows while retaining supporting evidence. |
| Review usefulness | 80 | Clear ambiguity notes, review questions, and missing-source/source-gap candidates. |
| Elegance | 70 | Minimal schema complexity for maximum downstream reuse; low bespoke one-off fields. |

The overall score is a weighted 0-1000 score, but gates matter more than the number:

- zero fabricated evidence refs;
- zero numeric metric claims without quote support;
- no implemented-event promotion from proposal-only evidence in the curated set;
- no public-timeline candidate without date evidence or an explicit unknown-date reason;
- no causal/effect-study use tag without route or corridor scope plus date role.

Initial gold fixtures should cover:

- one TSP/program report page;
- one busway or bus-lane brochure page;
- one route-redesign table page;
- one board/KPI metric narrative page;
- one methodology/source-dictionary page;
- one title/boilerplate page that should produce no candidates;
- one page with street names that could be mistaken for routes.

## Product Outputs Enabled

Once this harness exists, downstream products become much more grounded:

| Product | Needed extraction output |
|---|---|
| Detector review packets | Claims, caveats, source-quality notes, and context signals with quote-backed evidence spans. |
| Intervention event studies | Implemented/planned event candidates with date role, route/corridor scope, components, and quality tier. |
| Natural experiments | Context signals, constraints, exclusion notes, and event-window seeds. |
| Forecasting | Regime labels, service-change candidates, schedule/service context, and data-quality caveats. |
| Event-family response drift | Event families, comparable components, context-regime labels, dates, and treated route/corridor scopes. |
| Public route timelines | Promoted canonical milestone candidates with field-level evidence support. |
| Source-gap findings | Review questions where documents mention interventions or metrics but deterministic source products are missing. |
| Detector gold sets | Positive, negative, near-miss, and ambiguity seeds from reviewed document evidence. |

## Implementation Slices

1. **Fixture pack.** Build a small sample pack from old artifacts: Markdown pages, old OCR candidate
   tool calls, reviewed intervention records, manual candidates, and expected validation outcomes.
2. **Domain schemas.** Add `StructuredDocumentExtraction` schemas in `packages/domain`, keeping
   current `DocumentEvidenceCandidate` and `DocumentInterventionRecord` stable while the richer
   contract lands behind a new schema version.
3. **Validator library.** Add pure validators for quote containment, numeric support, page/hash refs,
   route/date status gates, table contiguity, and metric-authority discipline.
4. **Pipeline command.** Add a `docs tier2 structured-extract` v2 command that reads Markdown
   page/window files, calls the forced tool, writes immutable tool-call artifacts, and resumes
   without repeating successful windows. Initial scaffolding exists with prepare-only and execute
   modes, Pi-harness Pioneer/DeepSeek provider routing, exact quote validation, metric-authority
   validation, and deterministic per-window artifact paths.
5. **Evaluation command.** Add `evaluate tier2-structured-extraction` over the fixture pack and old
   artifacts, producing a scorecard and blocker list.
6. **Synthesis bridge.** Derive existing `DocumentInterventionRecord` and manual-candidate-like
   records from the new structured extraction rather than asking the model to jump directly to a
   canonical intervention row.
7. **Coverage audit integration.** Extend `audit tier2-structured-data` to distinguish OCR Markdown
   coverage, structured page/window extraction coverage, reviewed event coverage, and serving
   projection coverage.
8. **Full-corpus backfill.** Only after the evaluation gate passes, run structured extraction across
   the OCR Markdown corpus and promote reviewed subsets into applied-research panels.

## Open Questions

1. Should `StructuredDocumentExtraction` live entirely in `packages/domain`, or should only the
   durable/public parts live there while harness-only evaluation fields stay in `packages/applied-research`?
2. Should field-level evidence support be required for every synthesized event field, matching the
   manual candidate registry, or only for public/promotion-critical fields?
3. How much table structure is worth extracting from large route redesign appendices before the
   marginal value drops below manual review cost?
4. Should source-page profiles be model-extracted, deterministic, or a hybrid of OCR metadata plus
   model page-role classification?
5. What is the cheapest model that can meet the evidence-support and status/date gates on the
   fixture pack?

## Near-Term Recommendation

Do not start with a full-corpus LLM run. Start with the fixture pack and scorecard. The goal is to
make the structured extraction harness measurable before spending tokens on the whole corpus. Once
the harness can beat the old candidate bundle on evidence support, entity precision, status/date
discipline, and research usefulness, it becomes the right path for full-corpus Tier 2 structured
backfill.
