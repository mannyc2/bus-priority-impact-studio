---
title: Tier 2 Document Corpus
type: data
status: active
last_updated: 2026-06-01
owner: codex
tags: [tier2, interventions, ocr, documents, studio]
---

# Tier 2 Document Corpus

The Tier 2 corpus is the NYC DOT / MTA bus-priority **document** layer — busway brochures, SBS/BRT
reports, TSP reports, Better Buses materials, community-board presentation decks, and
progress/monitoring reports. It sits between raw OCR/text captures and the canonical intervention
timeline the Studio publishes. Its job is to explain *official* interventions — what changed, where,
when, for which routes, and under what status — with clickable source spans, without letting
document prose become the source of metric truth.

- Extraction architecture, candidate contracts, validation gates, and the quality-tier doctrine live
  in [[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 document corpus pipeline]].
- The next structured-extraction harness, including old-artifact review, page/window schemas,
  validator gates, and applied-research outputs, lives in
  [[wiki/engineering/tier2_structured_extraction_harness_plan|Tier 2 structured extraction harness plan]].
- Source families, coverage, and acquisition gaps live in
  [[wiki/data/intervention_source_coverage|Intervention source coverage]].

## Governing rules

- Raw OCR is evidence input only. A document row becomes a *candidate* only after its OCR/text is
  actually read, and candidates stay draft-only until deterministic validation (route/corridor/date/
  type links plus source-span refs) and manual promotion.
- Extraction writes candidate bundles, never `intervention_event` rows directly. Every extracted
  route, corridor, family, date, and milestone needs a source span and page reference.
- A proposal is not a timeline event. Do not promote until a source states implemented / launched /
  approved / scheduled with specificity, and never promote a presentation date as an implementation
  date.
- Keep computed speed / ridership / score / effect values out of OCR-derived claims unless the
  document explicitly states them — and then only as prose evidence, not metric truth.
- Quality tiers keep the public timeline honest. Only `canonical_milestone` candidates show in the
  default Intervention Timeline; see the quality-tier table in the engineering pipeline page.

## Current state (reviewed Phase 3 v3)

The canonical reviewed path is `gap-roadmap-docs-2026-05-25` (Phase 3 v3), complete through reviewed
promotion and Studio projection:

| Stage | Result |
|---|---|
| Candidate sources | 51 (OCR-PDF plus normalized text/HTML) |
| Reviewed records | 310 (after removing 12 manual-review pipeline rejects) |
| Sanity report | 0 blocking issues |
| Publishable interventions | 70 — 35 `canonical_milestone`, 35 `planned_or_proposed`; 23 sources; 113 route IDs |
| Per-route Studio projection | 175 route entries across 113 route keys; 17 route-less corridor/project records intentionally not fanned into route pages |

Studio consumes the by-route projection
(`build:studio-release -- --publishable-interventions-by-route ...`); raw evidence rows are never
fanned into route pages. Public Tier 2 timeline rows carry clickable document source links, exact
source-span chunk refs, OCR page refs, and compact excerpts.

Current artifacts under `data/artifacts/docs/gap-roadmap-docs-2026-05-25/`:

- `intervention-records-corpus-v3-reviewed-2026-05-27.json` — reviewed record corpus
- `intervention-publishable-v1.json` — promoted publishable subset
- `intervention-publishable-v1-by-route.json` — per-route Studio projection

Use `bun --filter @bp/pipeline-v2 cli audit tier2-structured-data` to inventory historical and
current structured Tier 2 artifacts. The audit classifies candidate bundles, raw Phase 3 tool calls,
reviewed intervention records, staging events, manual candidates, publishable projections, LLM
traces, and report/provenance files. It also identifies the best current research substrate and the
best serving projection.

As of the 2026-06-01 inventory, the best research substrate is
`gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json`: 310 reviewed
records across 36 sources and 285 route IDs, with all 310 records parsing as the current
`bp.document_intervention_record.v1` contract. The best serving projection remains
`gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json`. The audit's next action is to
backfill the full-corpus reviewed intervention-record layer; the current reviewed records are from
the smaller curated subset, while `tier2-full-corpus-2026-05-24-pass2` currently has candidate and
staging artifacts rather than a reviewed full-corpus record corpus.

The reviewed intervention-record layer is not the final shape for applied research. It is a strong
curated substrate for intervention timeline work, but the next harness must preserve page/window
claims, tables, raw mentions, validated entity refs, service changes, context signals, review
questions, metric-authority caveats, and research-use tags before synthesizing events. That richer
contract is what lets Tier 2 feed detector packets, causal panels, forecasting context, event-family
response-drift studies, source-gap queues, and gold-set labels without treating document prose as
computed metric truth.

Active v2 commands: `docs:ocr-plan`, `docs:ocr-page-audit`, `docs:ocr-markdown-candidates`,
`docs tier2 structured-extract`, `docs:extract`, `docs:intervention-records`.

> **Preservation note.** The 2026-05-31 OCR preservation reconciliation found that the
> `tier2-full-corpus-2026-05-24-pass2` fixed-point backlog had dropped 31 OCR-backed seed sources
> that were already captured in `gap-roadmap-docs-2026-05-25`, plus 7 seed sources that are present
> under renamed/current source ids. The reproducible supplement lives under
> `data/ops/docs/tier2-ocr-preservation-20260531/`; its augmented backlog has 485 sources and its
> filtered capture manifest reuses the already-downloaded source files before any new OCR requests.

> **Historical note.** An earlier pass, `tier2-full-corpus-2026-05-24-pass2`, ran the v1 Tier 2
> pipeline end-to-end (939 staged evidence events, follow-up OCR over 188 page ranges, manual
> curation of 175 reviewed sources, 106 follow-up candidate drafts). Its v1 commands (`docs:ocr`,
> `docs:validate`, `docs:promote`, `docs:followup-*`, etc.) have been retired in the
> `tools/pipeline-v2` migration; the artifacts remain on disk as historical evidence. The reviewed
> Phase 3 v3 path above supersedes it as the source of Studio promotion.

## Remaining and open work

Optional follow-up:

- Improve route/corridor/date/source-span validators and reconsider the deferred candidates.
- Add full-page chunk browsing/search if reviewers need more than compact timeline excerpts.
- Acquire board/committee packets outside the fixed-point HTML/PDF discovery loop.

Open product questions:

- Hide Tier 2 bus-lane infrastructure rows when structured NYC DOT bus-lane geometry already has a
  dated event for the route?
- Generate route timeline rows directly from curated candidates, or from a separate canonical
  intervention registry table?
- How should one corridor-level treatment spanning many routes appear on route pages without looking
  like many separate interventions?
- Store planned/future candidates in the same artifact (`status = planned`) or a separate planning
  registry?

## Sources

- [[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 document corpus pipeline]] — extraction
  architecture, candidate contracts, validation gates, quality-tier taxonomy, and OCR review policy.
- [[wiki/data/intervention_source_coverage|Intervention source coverage]] — source families,
  coverage, and acquisition gaps.
- [[wiki/data/policy_docs_corpus|Policy/docs corpus]] — the broader board/press/blog document corpus.
