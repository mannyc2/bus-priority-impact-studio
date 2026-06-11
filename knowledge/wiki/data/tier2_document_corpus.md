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

Use `bun --filter @bp/pipeline-v2 cli audit tier2-source-coverage` for the complementary *source*
view: a source-grain "available vs have" inventory that joins the augmented backlog (available
universe) against capture, verified extraction, reviewed records, and publishable promotion, then
writes `data/artifacts/audits/tier2-source-coverage.{json,md}`. As of the 2026-06-06 run the funnel
is 485 available → 445 captured → 368 OCR-derived surfaces → 175 verified/materialized → 29 reviewed
→ 19 promoted in-universe (40 sources not successfully captured: 31 not attempted + 9 failed). OCR
coverage is the key correction: the `document-derived-surfaces-v1` layer has OCR-derived surfaces for
368 of 386 captured PDFs (95%), and the 175 verified/materialized sources are a strict subset of
those 368. So the real OCR gap is only 18 captured PDFs with no derived surface; the larger
"captured but not in the verified layer" set (193 OCR-derived-not-verified) is a promotion gap, not an
OCR gap.
The audit exposes two structural facts. First, **media is a first-class but empty lane**: content
types are only pdf (416)/html (66)/json (3); YouTube/audio/video are recognized content types but
zero are ingested and transcription is deferred, so the lane is reported explicitly rather than left
invisible — add a backlog source with `expectedContentType=youtube|audio|video` to register one.
Second, **cross-run sourceId drift**: the extracted layer (`agentic-runs-20260604`) and the
reviewed/promoted layer (`gap-roadmap-docs-2026-05-25`) come from different runs with disjoint
sourceId namespaces, so extracted ∩ reviewed = 0 and 7 reviewed + 4 promoted source IDs are absent
from the available/capture universe. The audit's `reconciliation` block reports this rather than
silently undercounting; it reinforces that a unified full-corpus reviewed layer keyed to the captured
sources is still the missing piece.

### Expanding the available universe: recurring MTA meetings

The 485-source backlog was a discovery fixed point over reviewed seeds and crawled HTML; it did not
include MTA's recurring board/committee meeting record, which publishes one page per month at
`https://www.mta.info/transparency/board-and-committee-meetings/<month>-<year>` aggregating every
committee's book (`/document/<id>` PDFs) plus the meeting's YouTube recording.
`bun --filter @bp/pipeline-v2 cli docs tier2 discover-meetings --from <YYYY-MM> --to <YYYY-MM>`
indexes those assets into the backlog — **indexing only, no downloads** — so it grows the *available*
universe without spending disk; capture/OCR is a separate, disk-budgeted step. MTA 403s plain
fetches, so the command sends a full browser header set (`MTA_BROWSER_HEADERS`); both meeting pages
and document PDFs return 200 under it. PDFs register as `expectedContentType=pdf`; the meeting video
registers in the media lane as `expectedContentType=youtube` with `transcription_deferred`.

The first run (2021-01 → 2026-06) added 2,270 sources (2,129 PDFs + 141 meeting videos) across 61
meeting months, growing the available universe from 485 → 2,755 and populating the media lane
(0 → 141). Against that fuller universe the funnel is 2,755 available → 445 captured (~16%) → 368
OCR-derived → 175 verified → 19 promoted, with 0 of 141 meeting videos captured. Artifacts live under
`data/artifacts/docs/mta-meeting-discovery/` (`mta-meeting-sources.json` plus an optional merged
backlog). The meeting-expanded backlog is the more complete *available* set; promoting it to the
canonical capture/coverage input is a deliberate next step gated on a capture disk/OCR budget.

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

Active v2 commands: `docs:ocr-plan`, `docs tier2 tesseract-ocr`,
`docs tier2 ocr-similarity`, `docs:ocr-page-audit`, `docs:ocr-markdown-candidates`,
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
- Expand the route-timeline date model beyond the B46 pilot. The current route-timeline pack now
  emits deterministic date assertions for exact dates, months, seasons, bare years, year ranges,
  and explicit unknowns such as `TBD`; `docs tier2 route-timeline-curation-repair` backfills
  omitted `dateAssertionRefs` from validator suggestions before `docs tier2 route-timeline-bundle`
  hydrates display dates and analysis windows. `docs tier2 route-timeline-bundle-index` then
  summarizes route readiness and default-event headlines across bundles for serving/UI planning. If
  deterministic coverage stalls on broader route runs, use a narrow reviewed
  `rawDateText -> normalizedDateAssertion` codec; do not ask a general curation model to rewrite
  dates as public facts.
- Project route-timeline bundles into serving-addressable rows. `docs tier2
  route-timeline-serving-projection` reads the bundle index and emits a pilot
  `route_timeline_index` D1 read model, matching `route_artifact` refs named
  `route_timeline_bundle`, and an R2 copy plan. The 2026-06-06 pilot over B46, B82, BX41, and M15
  produced 4 timeline-index rows, 4 artifact refs, 3 `timeline_ready` routes, 1 `timeline_sparse`
  route, and 0 validation warnings/errors. That shape is now folded into the canonical D1
  migration/export and Worker route API: `export d1 --route-timeline-projection-path ...` writes the
  4 `route_timeline_index` rows plus 4 `route_timeline_bundle` artifact refs, and
  `/api/v1/studio/routes/:routeId/timeline` serves the R2 bundle after D1 lookup. The canonical
  March 2026 D1 verify now passes with 0 issues; export input assembly deterministically hydrates
  the 172 month-scoped source-gap intervention event refs needed by the March comparison rows and
  still fails on missing non-source-gap event refs.

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
