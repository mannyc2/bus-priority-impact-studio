---
title: Tier 2 processing status and resume runbook
type: engineering
status: active
last_updated: 2026-06-06
owner: codex
tags: [tier2, llm, vocabulary, normalization, runbook, audit]
---

# Tier 2 Processing Status And Resume Runbook

This page records the current Tier 2 document-processing state after the qv8/qv9/qv10
canonical merge, raw-field graduation, vocabulary synthesis queue, and follow-up audits.
It is meant to be the durable handoff, not a chat transcript.

## Current State

The Tier 2 vocabulary queue is complete. The selected agentic extraction corpus is usable
as verified candidate research material, but the full-corpus intervention promotion layer
is still incomplete.

Primary current artifacts:

- Canonical extraction merge:
  `data/artifacts/docs/agentic-runs-20260604/canonical-merge-qv8-qv9-qv10-v1.json`
- Raw-field graduation plan:
  `data/artifacts/docs/agentic-runs-20260604/raw-field-graduation-canonical-qv8-qv9-qv10-v1.json`
- Vocab synthesis queue root:
  `data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605`
- Cleaned vocab map pack:
  `data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/vocab-map-pack-cleaned-v1-20260606/`
- Surface-level vocab application:
  `data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/`
- Compact vocab consumer index:
  `data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/`
- Materialized vocab views:
  `data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/`
- Document-derived surface corpus:
  `data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1/`
- Structured-data inventory audit:
  `data/artifacts/audits/tier2-structured-data-inventory.json`

## Extraction And Surface Corpus

The selected agentic extraction merge contains:

| Layer | Count |
| --- | ---: |
| Unique page windows | 1,374 |
| Canonical page windows | 1,339 |
| Unresolved page windows | 35 |
| Accepted verified surfaces | 15,925 |
| Superseded candidate records | 451 |

Surface kinds in the canonical merge:

| Surface kind | Count |
| --- | ---: |
| entity_mention | 3,760 |
| claim | 2,822 |
| review_question | 2,220 |
| metric_observation | 2,133 |
| context_signal | 1,713 |
| event_candidate | 1,184 |
| treatment_component | 797 |
| source_note | 603 |
| table_observation | 483 |
| service_change_candidate | 159 |
| finding_reasoning_seed | 32 |
| brief_claim_seed | 10 |
| source_gap_seed | 4 |
| causal_claim | 3 |
| relation | 2 |

The broader document-derived surface layer contains 155,886 candidate surfaces from 368
sources. That layer is complete for discovery/review uses, but it remains candidate-grade
unless promoted through the newer verified surface and review flows.

## Vocabulary Queue Result

The full vocab queue completed successfully in tmux session
`vocab-v3-family-deepseek-v4-100` with exit status 0.

Queue completion markers:

```text
data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/QUEUE_COMPLETE
data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/TMUX_DEEPSEEK_V4_100_EXIT_0
```

Full-key totals, excluding the `01-metricUnit-slice40` smoke run:

| Metric | Count |
| --- | ---: |
| Full keys | 13 |
| Chunks | 200 |
| Accepted chunks | 200 |
| Rejected chunks | 0 |
| Distinct raw values covered | 7,729 |
| Canonical values emitted | 1,681 |
| Mapped raw values | 5,297 |
| Preserve-raw values | 2,302 |
| Unresolved values | 130 |
| Graduation instances represented | 21,174 |

Per-key result:

| Key | Provider/model | Values | Canonical | Mapped | Preserve raw | Unresolved |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| metricUnit | claude-opus-4-5 | 208 | 131 | 182 | 18 | 8 |
| tableKind | claude-opus-4-5 | 177 | 43 | 173 | 2 | 2 |
| eventFamily | claude-opus-4-5 | 248 | 23 | 237 | 8 | 3 |
| claimKind | claude-opus-4-5 | 303 | 23 | 291 | 10 | 2 |
| claimResearchUseTag | deepseek-v4-flash | 384 | 63 | 372 | 10 | 2 |
| entityKind | deepseek-v4-flash | 464 | 93 | 328 | 75 | 61 |
| contextKind | deepseek-v4-flash | 490 | 67 | 472 | 16 | 2 |
| questionKind | deepseek-v4-flash | 493 | 80 | 487 | 6 | 0 |
| eventSubtype | deepseek-v4-flash | 556 | 162 | 337 | 205 | 14 |
| eventTreatmentFamily | deepseek-v4-flash | 640 | 60 | 235 | 392 | 13 |
| entityRole | deepseek-v4-flash | 1,095 | 209 | 857 | 235 | 3 |
| metricSubjectFamily | deepseek-v4-flash | 1,304 | 281 | 679 | 613 | 12 |
| metricFamily | deepseek-v4-flash | 1,367 | 446 | 647 | 712 | 8 |

The queue root has mixed model provenance: jobs 02-05 were completed with
`claude-opus-4-5`; jobs 06-14 were completed with `deepseek-v4-flash`. Treat the output as a
map pack with per-map provenance, not as a single-model run.

## Cleaned Vocab Map Pack

The deterministic cleanup/projection pass has produced a frozen additive map pack:

```text
data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/vocab-map-pack-cleaned-v1-20260606/vocab-map-pack-manifest.json
data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/vocab-map-pack-cleaned-v1-20260606/vocab-map-pack-summary.md
data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/vocab-map-pack-cleaned-v1-20260606/vocab-normalization-projection.json
```

Cleanup totals:

| Metric | Count |
| --- | ---: |
| Cleaned maps | 13 |
| Aliases | 7,729 |
| Canonical values | 1,605 |
| Mapped aliases | 5,769 |
| Preserve-raw aliases | 1,830 |
| Unresolved aliases | 130 |
| Duplicate canonical merges | 1 |
| Deterministic exact remaps | 472 |
| Modifier-annotated aliases | 2,775 |
| Coarse-rollup aliases | 7,729 |
| Source-audit sample failures | 0 |

The original model maps are unchanged. The cleaned artifacts add canonical leaf ids,
coarse families, extracted modifiers such as route ids and periods, and evidence
provenance. The projection is currently alias-level: it tells a downstream pass how to map a
`keyId + rawValue`, but it does not yet rewrite the accepted surface corpus into per-surface
`canonicalPayload` records.

## Surface-Level Vocab Application

The deterministic surface application pass has applied the cleaned alias projection to the
selected qv8/qv9/qv10 accepted surfaces:

```text
data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application.json
data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application-summary.json
data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application.md
```

Application totals:

| Metric | Count |
| --- | ---: |
| Canonical artifacts | 1,339 |
| Accepted surfaces | 15,925 |
| Surfaces with graduated fields | 12,759 |
| Surfaces with mapped fields | 12,355 |
| Surfaces with unresolved fields | 2,313 |
| Graduated field instances | 21,174 |
| Mapped field instances | 18,529 |
| Preserve-raw field instances | 2,454 |
| Unresolved field instances | 191 |
| Missing projection field instances | 0 |
| Target writes | 18,244 |
| Target conflicts | 0 |

Each normalized surface keeps its original `rawPayload`, adds deterministic
`canonicalPayload` fields where a vocab row mapped cleanly, and records
`normalization.fieldMappings[]`, `normalization.unresolvedFields[]`, and
`normalization.targetWrites[]`. The artifact is audit-rich and large because it carries
accepted surfaces plus field support and evidence pointers; downstream serving jobs should
usually read the summary or derive a compact consumer index instead of loading the full
337 MB artifact into the app.

## Compact Vocab Consumer Index

The compact detector/UI-oriented index has been derived from the full surface application:

```text
data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index.json
data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index-summary.json
data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index.md
```

Consumer-index totals:

| Metric | Count |
| --- | ---: |
| Surface rows | 15,925 |
| Normalized field rows | 18,529 |
| Unresolved/review rows | 2,645 |
| Source rows | 175 |
| Surfaces with mapped fields | 12,355 |
| Surfaces with unresolved fields | 2,313 |
| Surfaces with route ids | 3,752 |

This artifact omits raw payload blobs, field support rows, full evidence pointer rows, and
projection examples. It keeps `artifactPath`, `surfaceId`, source refs, page numbers,
canonical payloads, compact field rows, unresolved rows, support ids, and evidence pointer
ids. It is about 58 MB uncompressed and about 2.25 MB gzipped, compared with about 337 MB
uncompressed and about 13.1 MB gzipped for the full surface application audit artifact.

## Materialized Vocab Views

The compact consumer index has been projected into downstream materialized views:

```text
data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views.json
data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views-summary.json
data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views.md
```

Materialized-view totals:

| Metric | Count |
| --- | ---: |
| Route evidence bundles | 151 |
| Route-linked surfaces | 3,752 |
| Detector feature rows | 18,529 |
| Route-linked detector feature rows | 4,452 |
| Source-context detector feature rows | 14,077 |
| Grouped unresolved review items | 1,960 |
| Source coverage rows | 175 |

Feature-use rows:

| Feature use | Rows |
| --- | ---: |
| entity_feature | 5,697 |
| metric_feature | 4,330 |
| document_context_feature | 3,423 |
| claim_feature | 2,661 |
| event_or_treatment_feature | 2,418 |
| other_feature | 0 |

Consistency audit:

| Check | Result |
| --- | ---: |
| Distinct source route ids vs route bundles | 151 / 151 |
| Source surface-route refs vs bundled surface refs | 4,955 / 4,955 |
| Consumer field rows vs detector feature rows | 18,529 / 18,529 |
| Route-linked field rows vs route-linked detector rows | 4,452 / 4,452 |
| Consumer unresolved rows vs grouped review `rowCount` sum | 2,645 / 2,645 |
| Consumer source rows vs source coverage rows | 175 / 175 |
| Detector feature rows with missing artifact path | 0 |

The materialized artifact is about 35 MB uncompressed and about 1.99 MB gzipped. It contains
four direct downstream views:

- `routeEvidenceBundles`: route-keyed document evidence bundles with source/page refs,
  canonical payload samples, surface-kind counts, key counts, evidence ids, and support ids.
- `detectorFeatureRows`: one row per mapped field, with route scope, feature-use family,
  source/page refs, canonical leaf, modifiers, support ids, and evidence pointer ids.
- `unresolvedReviewQueue`: grouped unresolved/preserve-raw review items with `rowCount`,
  `surfaceCount`, source/route refs, and sample surfaces.
- `sourceCoverageRows`: source-keyed surface, route, field-key, unresolved, and evidence counts.

This view layer does not fix deferred taxonomy QA. It carries the known QA flags forward:
171 field rows have coarseFamily `"null"`, 2,026 field rows have coarseFamily `"other"`, and
2,454 unresolved rows are expected `preserve_raw`.

## Vocabulary Audit Findings

Structural checks passed:

- every full-key raw value has exactly one alias decision;
- no duplicate raw aliases were found;
- no mapped aliases point to missing canonical ids;
- every alias has examples;
- source-audit sample failures were 0 across the maps.

Important semantic caveats:

- These maps normalize extraction vocabulary. They do not create source truth.
- Many raw category fields are model-assigned extraction labels rather than literal source
  words. The underlying raw text, value, and evidence handles are usually verified; the label
  field itself is often not directly source-authored.
- `preserve_raw` is expected and useful for highly specific or compound values, especially
  route-specific metric labels, route-specific metric subjects, and treatment compounds.
- `metricFamily` and `metricSubjectFamily` are intentionally still broad-leaf taxonomies:
  they need coarser family/dimension rollups for UI aggregation and detector feature grouping.
- The 472 deterministic exact remaps should be treated as an auditable reconciliation set.
  They are rule-derived from existing canonical labels, not new LLM calls, but they changed
  original `preserve_raw` or `unresolved` decisions into `mapped` decisions.

Example: `metricUnit = people` is source-backed for the B44 page because the source says
`6,000 people board in CB 15`. The source statement is authoritative, but downstream should
also derive a ridership/exposure family so the point can aggregate with riders/passengers
without losing the literal unit.

## Route, Timeline, And Proof Layers

Document event route resolution is complete as a candidate layer:

| Metric | Count |
| --- | ---: |
| Input events | 8,428 |
| Intervention candidates | 4,987 |
| Route-resolved events | 4,576 |
| Route-resolved intervention candidates | 2,941 |
| Promotable route-review candidates | 2,941 |
| Ambiguous intervention candidates | 956 |
| Unresolved intervention candidates | 1,090 |

Route review queue:

| Metric | Count |
| --- | ---: |
| Routes with queue entries | 248 |
| Queue items | 7,437 |
| Source events | 2,941 |
| Sources | 329 |
| High-priority items | 3,796 |
| Medium-priority items | 3,465 |
| Low-priority items | 176 |

Operational date assertions:

| Metric | Count |
| --- | ---: |
| Trusted operational dates | 1,157 |
| Route-linked trusted dates | 956 |
| Causal-anchor eligible dates | 240 |
| Distinct intervention ids | 109 |

Proof harness:

| Metric | Count |
| --- | ---: |
| Candidates | 240 |
| Context available | 240 |
| Validated results | 240 |
| Valid proven results | 88 |
| Proof status `proven` | 210 |
| Proof status `ambiguous` | 23 |
| Proof status `contradicted` | 4 |
| Proof status `not_found` | 2 |

The proof layer should be treated as a filter/review signal, not as a final promotion gate
until validation errors and warnings are reviewed.

## Data-Product Completeness

The current data-product completeness audit for release month `2026-03` and history start
`2023-04` reports:

| Product status | Count |
| --- | ---: |
| Products | 87 |
| Complete | 75 |
| Partial | 1 |
| Missing | 3 |
| Blocked | 8 |

Tier 2 product state:

- `tier2_ocr_raw_handoff_archives`: complete
- `tier2_ocr_page_markdown_corpus`: complete
- `tier2_ocr_preservation_overlay`: complete
- `tier2_document_derived_surfaces_v1`: complete
- `tier2_document_event_route_resolution_v1`: complete
- `tier2_route_review_queue_v1`: complete
- `tier2_docs_pipeline_status`: complete
- `tier2_structured_intervention_extraction_full_corpus`: partial

The partial product is missing:

```text
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json
data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/intervention-publishable-v1.json
```

The structured-data inventory found older curated-subset versions:

```text
data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json
data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json
```

Those are useful references, but the full-corpus product is still not built.

## Further Processing Needed

1. Audit the deterministic remap set.
   The frozen map-pack manifest now exists. Before using the cleaned maps as production
   lookup tables, review or mechanically sample the 472 exact remaps, especially
   `metricFamily`, `metricSubjectFamily`, `entityRole`, and `eventSubtype`.

2. Wire the materialized vocab views into detector/materializer jobs.
   The first downstream projection now exists. Detector and serving jobs should prefer
   `routeEvidenceBundles`, `detectorFeatureRows`, `unresolvedReviewQueue`, and
   `sourceCoverageRows` from the materialized views rather than loading the full
   surface-application audit artifact unless they need raw payloads or evidence quotes.

3. Add coarse rollup fields, especially for metrics.
   The leaf maps are useful, but UI/detectors need stable families such as metric dimension,
   subject family, counted entity family, rider/exposure/safety/service/operations buckets, and
   treatment families. Use existing canonical metadata when available; do not collapse raw
   units like people/riders/passengers without preserving the literal source field.

4. Build the full-corpus intervention research layer.
   The route review queue, operational date assertions, and proof harness provide ingredients,
   but the expected full-corpus artifacts are missing. Build or backfill
   `intervention-records-corpus-reviewed.json`, then derive `intervention-publishable-v1.json`.

5. Promote route/timeline candidates with explicit states.
   The 7,437 route-review queue items should not all become public timeline facts. They need
   reviewed/promoted/suppressed states, proof status, date precision, source-stated versus
   realized status, and route-resolution tier exposed.

6. Re-run product completeness after each promotion step.
   The audit should move `tier2_structured_intervention_extraction_full_corpus` from partial to
   complete only when the two full-corpus promotion artifacts exist and pass schema/content
   checks.

## Resume Commands

Check queue completion:

```sh
cd /mnt/models/dev/bus-reliability-tracker
tmux list-sessions
test -f data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/QUEUE_COMPLETE && echo complete
```

Re-run data-product completeness:

```sh
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- audit data-product-completeness --year 2026 --month 3 --history-start-month 2023-04 --json
```

Re-run the structured-data inventory:

```sh
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- audit tier2-structured-data --docs-root data/artifacts/docs --output data/artifacts/audits/tier2-structured-data-inventory.json --markdown data/artifacts/audits/tier2-structured-data-inventory.md
```

Run focused Tier 2 tests:

```sh
bun --filter @bp/pipeline-v2 test tools/pipeline-v2/test/commands/docs/tier2/vocab-synthesis.test.ts
```

Build the surface-level vocab application:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 vocab-surface-apply --canonical-merge-path data/artifacts/docs/agentic-runs-20260604/canonical-merge-qv8-qv9-qv10-v1.json --graduation-plan-path data/artifacts/docs/agentic-runs-20260604/raw-field-graduation-canonical-qv8-qv9-qv10-v1.json --projection-path data/artifacts/docs/agentic-runs-20260604/vocab-synthesis-v3-family-queue-20260605/vocab-map-pack-cleaned-v1-20260606/vocab-normalization-projection.json --output-path data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application.json --markdown-path data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application.md --summary-path data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application-summary.json --generated-at 2026-06-06T18:00:00.000Z
```

Build the compact vocab consumer index:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 vocab-consumer-index --surface-application-path data/artifacts/docs/agentic-runs-20260604/vocab-surface-application-v1-20260606/vocab-surface-application.json --output-path data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index.json --markdown-path data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index.md --summary-path data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index-summary.json --generated-at 2026-06-06T19:00:00.000Z
```

Build the materialized vocab views:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 vocab-materialized-views --consumer-index-path data/artifacts/docs/agentic-runs-20260604/vocab-consumer-index-v1-20260606/vocab-consumer-index.json --output-path data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views.json --markdown-path data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views.md --summary-path data/artifacts/docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views-summary.json --generated-at 2026-06-06T20:00:00.000Z
```

## Do Not Forget

- Keep raw source wording and evidence handles. The maps are additive.
- Do not let an LLM mint route ids, dates, geography ids, metric values, or evidence refs.
- Do not present category labels as if MTA/DOT authored them unless the field itself is
  evidence-supported.
- Treat mixed-provider vocabulary provenance honestly.
