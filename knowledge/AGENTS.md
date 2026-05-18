# AGENTS.md — Codex operating rules for the LLM wiki

This file governs the `knowledge/` directory. Root-level implementation rules live in `../AGENTS.md` and `../CLAUDE.md`.

You are Codex working inside an LLM-maintained wiki and project scaffold for **Bus Priority Impact Studio**.

## Mission

Build and maintain a source-grounded wiki that supports implementation of a bus reliability / bus-priority intervention analytics product for MTA public data.

Core product question:

> Which MTA bus routes and street segments are slow or unreliable, what public evidence explains the problem, what intervention is most justified, and did past interventions work?

## Knowledge layers

Relative to `knowledge/`:

1. `raw/` — source registry, immutable source captures, metadata JSON, source notes, and assets.
2. `wiki/` — mutable synthesis layer. Update these markdown pages as new sources, schemas, decisions, and analyses arrive.
3. `AGENTS.md` — wiki schema and workflow layer.
4. `index.md` — content index. Read it first before answering or editing.
5. `log.md` — append-only activity log. Every ingest, analysis, lint, or major code decision gets a new entry.

Actual downloaded datasets for pipeline work belong in repo-level `data/raw/`, not `knowledge/raw/`.

## Non-negotiable evidence rules

- Do not invent MTA facts, dataset fields, row counts, update cadences, or performance claims.
- Every wiki page must include a `Sources` section with source URLs and `verified_at` dates.
- When data schema is uncertain, write `Status: needs schema probe`, not guesses.
- When claims conflict across sources, preserve the contradiction in `Open issues` or `Contradictions`.
- Never imply this project is endorsed by MTA.
- Honor MTA data-feed terms: real-time feed data should be downloaded/hosted from our own server for app users; do not proxy end-user traffic directly to MTA feeds; do not claim MTA data is accurate/complete/timely; include accessibility considerations.

## Wiki page conventions

Use this frontmatter on all new wiki pages:

```yaml
---
title: Page Title
type: project|data|engineering|analysis|template
status: draft|active|needs_schema_probe|blocked|archived
last_updated: YYYY-MM-DD
owner: codex
source_count: 0
tags: []
---
```

Each page should have these sections when applicable:

- `Why this matters`
- `What we know`
- `Implementation notes`
- `Joins / dependencies`
- `Caveats`
- `Open questions`
- `Sources`

Use Obsidian-style links for wiki pages, for example `[[wiki/data/mta_bus_route_segment_speeds|MTA Bus Route Segment Speeds]]`.

## Ingest workflow

When ingesting a source:

1. Save or note the source in `raw/` when possible.
2. Update `raw/source_manifest.yaml` with source ID, URL, type, priority, and retrieval status.
3. Create or update the relevant `wiki/data/*.md` or `wiki/project/*.md` page.
4. Update `wiki/data/source_registry.md` if the source is a dataset/API/document corpus.
5. Update `index.md` with a one-line summary.
6. Append an entry to `log.md`.
7. Run a lint pass: check citations, missing schemas, stale claims, and orphan pages.

## Query workflow

When the user asks a question:

1. Read `index.md` first.
2. Read relevant wiki pages.
3. If exact facts depend on current data, run source probes or fetch metadata.
4. Answer with citations to wiki pages and raw source URLs.
5. If the answer produces durable analysis, create a new `wiki/analysis/*.md` page and update `index.md`/`log.md`.

## Build workflow

Before implementation work:

1. Read repo root `../CLAUDE.md` and `../AGENTS.md`.
2. Validate the source registry.
3. Probe schemas through Bun-run TypeScript commands in `../tools/pipeline`, not Python scripts.
4. Decide MVP scope in `wiki/project/mvp.md`.
5. Implement ingestion before dashboards.
6. Write data-quality tests before metric claims.
7. Use small route pilots before citywide processing.

## App architecture constraints

Current MVP stack:

- TypeScript-only Bun workspace monorepo.
- React + Vite frontend and Cloudflare Worker API in `apps/web`.
- Cloudflare D1 as the compact serving database.
- Cloudflare R2 for generated artifacts.
- Bun-run local TypeScript pipeline jobs in `tools/pipeline`.
- DuckDB/Turf may be used locally for analytical/geospatial work.
- No pnpm, Python, FastAPI, hosted Postgres/PostGIS, or VPS unless a documented requirement forces escalation.

See `wiki/engineering/package_structure.md` for the current package architecture.

## Data quality rules

For every ingested dataset, maintain:

- Source ID and URL.
- Last fetched timestamp.
- Source last-updated timestamp, if available.
- Row count.
- Schema hash or column list.
- Primary key candidate.
- Null-rate checks for join keys.
- Known caveats.

## LLM/RAG rules

The LLM assistant is not the product. The product is bus-priority analytics and route evidence
brief building. Follow [[wiki/project/ai_interaction_model|AI Interaction Model]] when adding any
AI-facing UI, pipeline artifact, or composer behavior.

Use LLMs for:

- Cited route-improvement briefs.
- Source search across MTA docs and wiki pages.
- Explaining methods/caveats to nontechnical readers.
- Generating analyst memos from computed metrics.
- Candidate source notes, document claim extraction, entity-link suggestions, and reviewer
  questions for deterministic validation.

Do not use LLMs to fabricate metrics, promote sources, assert source freshness, perform route/street
joins, make causal claims, or publish claims without validation. Computed metrics must come from
deterministic code and stored tables. Public UI output must be rendered as Studio artifacts, not as
a global chatbot.

## Preferred naming

- Project: `Bus Priority Impact Studio`.
- Root repo package: `bus-priority-impact-studio`.
- Public app package: `@bp/web`.
- Pipeline package: `@bp/pipeline`.
- Core route score: `bus_priority_need_score`.
- Intervention evaluation: `ace_impact_event_study`.
