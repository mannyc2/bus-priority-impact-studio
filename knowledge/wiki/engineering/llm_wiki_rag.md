---
title: LLM Wiki + RAG Layer
type: engineering
status: active
last_updated: 2026-05-18
owner: codex
source_count: 1
tags: [llm, rag, wiki, citations]
---

# LLM Wiki + RAG Layer

## Goal

Implement an LLM layer that uses the persistent wiki as the first-class knowledge base and raw
sources as the authority. It should generate cited evidence artifacts and support analyst-facing
explanations without rediscovering every source from scratch.

This page covers backend/corpus LLM processing. Product-facing AI behavior must follow
[[wiki/project/ai_interaction_model|AI Interaction Model]]: no global chatbot, no free-form public
AI replies, and no output that bypasses evidence, caveats, and validation.

## Architecture

Layers:

1. `raw/` — immutable source captures.
2. `wiki/` — maintained synthesis pages.
3. `docs.index` — embedding/search index over wiki pages and selected raw notes.
4. deterministic analytics tables — source of numerical truth.
5. LLM evidence/artifact assistant — uses retrieved wiki/source pages plus deterministic metric payloads.

## Processing Roles

The LLM layer has three distinct roles:

1. **Reader** — prepare cited explanations from retrieved wiki/source pages and deterministic metric payloads.
2. **Author** — draft briefs, caveats, reviewer notes, and source-backed prose for the composer.
3. **Extractor** — process unstructured documents into candidate source notes, claim candidates, entity-link candidates, and review questions.

The extractor role is the useful post-v1 addition for corpus expansion. It can mine MTA board materials, NYC DOT project pages, press releases, dataset documentation, and long PDFs for structured candidates, but it does not promote a source or finding on its own.

These roles describe processing capabilities, not UI surfaces. Reader output should still be
rendered as a Studio artifact or cited explanation, not as a persistent chat thread.

## Retrieval strategy

1. Read `index.md`.
2. Search `wiki/` with BM25 or local vector search.
3. Retrieve raw source notes if needed.
4. Retrieve deterministic metric payload from API/database.
5. Generate answer/brief with citations and caveats.

## Corpus Expansion Workflow

1. Discover or receive a document/source URL.
2. Capture metadata and content hash in `knowledge/raw/`.
3. Chunk the document and run LLM extraction into candidate JSON:
   - source purpose and date range;
   - route/corridor/intervention mentions;
   - implementation dates and official claims;
   - caveats, terms, and methodology notes;
   - suspected join keys and required validators.
4. Run deterministic validation:
   - Socrata/API probe for structured sources;
   - route/street/entity linker for document mentions;
   - date parsing and geometry join checks where relevant.
5. Promote only validated facts into `wiki/`, pipeline inputs, or serving projections.

LLM extraction output should keep source URL, document date, cited span or chunk ID, prompt/model hash, confidence, and validation state. Failed or unvalidated extractions remain useful for reviewer queues, but not public claims.

## Memo generation contract

The LLM may write:

- executive summary,
- explanation of metrics,
- caveats,
- source-backed context,
- suggested next investigations.
- candidate source notes and extracted document claims for review.

The LLM may not invent:

- speed values,
- ridership values,
- row counts,
- official MTA positions,
- intervention effects not computed or directly sourced.
- source freshness or active-source status not backed by probe metadata.

## Guardrails

- Deterministic analytics tables remain the numerical source of truth.
- `sources:probe` or a source-specific validator promotes structured sources, not the LLM.
- Entity links suggested by the LLM must be confirmed by route IDs, street normalization, geometry joins, or human review.
- Composer publication requires server-side validation of every numeric claim and evidence link.
- R2 may hold extracted chunks and candidate JSON; D1 should expose only promoted summaries and validation status.

## Evaluation questions

Codex should create a small test set:

- “What data source gives segment-level bus speeds?”
- “Why do we need route shapes if the speed dataset has coordinates?”
- “What does ACE claim to improve?”
- “Why is a naive before/after ACE analysis weak?”
- “What are the MTA feed terms that affect deployment?”

Answers should include citations to wiki pages and source URLs.

## Sources

- User-provided LLM Wiki pattern document — verified_at: 2026-04-26
- [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]] — verified_at: 2026-05-18
