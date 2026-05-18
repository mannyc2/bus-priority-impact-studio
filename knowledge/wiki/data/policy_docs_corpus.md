---
title: Policy and Documents Corpus
type: data
status: draft
last_updated: 2026-05-18
owner: codex
source_count: 4
tags: [mta, documents, rag, wiki]
---

# Policy and Documents Corpus

## Why this matters

The LLM/wiki layer should support cited explanations and memos. It needs a document corpus that includes data documentation, MTA Open Data plans, MTA Data & Analytics blog posts, ACE pages/press releases, board materials, and relevant policy documents.

This corpus supports [[wiki/project/ai_interaction_model|AI Interaction Model]] by feeding
validated source notes, document-claim candidates, entity-link candidates, caveats, and review
questions into Studio artifacts. It is not a source for a global chatbot.

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

## LLM-assisted intake

LLM processing helps this corpus most at intake time:

- turn long board packets, project pages, and press releases into candidate source notes;
- extract route/corridor/intervention mentions, implementation dates, official claims, caveats, and document dates;
- suggest links to known route IDs, ACE records, bus-lane segments, and source registry entries;
- produce reviewer questions when a document implies a finding but the deterministic tables do not yet support it;
- compare official prose claims with project-computed evidence after metrics are available.

Those outputs are candidates. A source summary should only be promoted into durable wiki or serving projections after deterministic validation or human review confirms the cited span, entity link, and date.

Recommended candidate shapes:

- `candidate_source_note`
- `document_claim_candidate`
- `entity_link_candidate`
- `review_question_candidate`
- `llm_extraction_audit`

## Wiki/RAG product role

The LLM should:

- explain route scorecards,
- generate memos from computed metrics,
- search relevant public MTA documentation,
- flag caveats,
- compare official claims with project-computed evidence,
- extract candidate facts from documents for validation.

The LLM should not:

- invent route performance numbers,
- summarize data it has not ingested,
- imply official endorsement,
- make safety-critical rider guidance without authoritative current alerts,
- promote candidate source facts without validation.

## Sources

- https://www.mta.info/open-data — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26
- [[wiki/engineering/llm_wiki_rag|LLM Wiki + RAG Layer]] — verified_at: 2026-05-18
- [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]] — verified_at: 2026-05-18
