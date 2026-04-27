---
title: LLM Wiki + RAG Layer
type: engineering
status: active
last_updated: 2026-04-26
owner: codex
source_count: 1
tags: [llm, rag, wiki, citations]
---

# LLM Wiki + RAG Layer

## Goal

Implement an LLM layer that uses the persistent wiki as the first-class knowledge base and raw sources as the authority. It should generate cited memos and answer analyst questions without rediscovering every source from scratch.

## Architecture

Layers:

1. `raw/` — immutable source captures.
2. `wiki/` — maintained synthesis pages.
3. `docs.index` — embedding/search index over wiki pages and selected raw notes.
4. deterministic analytics tables — source of numerical truth.
5. LLM memo assistant — uses retrieved wiki/source pages plus deterministic metric payloads.

## Retrieval strategy

1. Read `index.md`.
2. Search `wiki/` with BM25 or local vector search.
3. Retrieve raw source notes if needed.
4. Retrieve deterministic metric payload from API/database.
5. Generate answer/brief with citations and caveats.

## Memo generation contract

The LLM may write:

- executive summary,
- explanation of metrics,
- caveats,
- source-backed context,
- suggested next investigations.

The LLM may not invent:

- speed values,
- ridership values,
- row counts,
- official MTA positions,
- intervention effects not computed or directly sourced.

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
