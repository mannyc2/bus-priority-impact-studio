---
title: Policy and Documents Corpus
type: data
status: draft
last_updated: 2026-04-26
owner: codex
source_count: 4
tags: [mta, documents, rag, wiki]
---

# Policy and Documents Corpus

## Why this matters

The LLM/wiki layer should support cited explanations and memos. It needs a document corpus that includes data documentation, MTA Open Data plans, MTA Data & Analytics blog posts, ACE pages/press releases, board materials, and relevant policy documents.

## Initial corpus

Priority sources:

- MTA Open Data Program page.
- MTA Developer Resources and data-feed terms.
- MTA Data & Analytics blog posts on bus segment speeds and route shapes.
- MTA ACE program page and expansion press releases.
- Socrata data dictionaries for each dataset.
- MTA Open Data Plan updates.
- MTA Board and Committee materials where bus performance, ACE, customer experience, and open data are discussed.

## Implementation notes

- Start with a markdown corpus, not a large arbitrary PDF scrape.
- Store source summaries in `raw/notes/` and durable synthesis in `wiki/data/` / `wiki/analysis/`.
- For large PDFs, store metadata and targeted excerpts; avoid dumping entire documents into prompts.
- Every answer should show source links and page/document dates where possible.

## Wiki/RAG product role

The LLM should:

- explain route scorecards,
- generate memos from computed metrics,
- search relevant public MTA documentation,
- flag caveats,
- compare official claims with project-computed evidence.

The LLM should not:

- invent route performance numbers,
- summarize data it has not ingested,
- imply official endorsement,
- make safety-critical rider guidance without authoritative current alerts.

## Sources

- https://www.mta.info/open-data — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26
