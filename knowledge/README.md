# Knowledge Wiki — Bus Priority Impact Studio

This directory contains the LLM-maintained wiki for **Bus Priority Impact Studio**. It follows the persistent wiki pattern: raw source captures and metadata feed a maintained synthesis layer that Codex/Claude updates over time.

## Directory roles

- `raw/` — source registry, immutable source notes/captures, metadata JSON, and assets.
- `wiki/` — maintained synthesis pages for project, data, engineering, and analysis.
- `AGENTS.md` — wiki-specific operating contract for Codex.
- `index.md` — navigation index. Read this first before answering or editing.
- `log.md` — append-only chronological log.

Actual downloaded datasets for local analytics belong in repo-level `data/raw/`, not here.

## First Codex prompt

From repo root, paste:

```text
Read CLAUDE.md, AGENTS.md, knowledge/index.md, knowledge/wiki/project/overview.md, knowledge/wiki/project/managed_services_options.md, and knowledge/wiki/engineering/package_structure.md. Then perform Phase 0 from knowledge/wiki/project/codex_roadmap.md: validate the TypeScript-only package layout and implement the first fixture-backed source probe in tools/pipeline. Do not add Python, FastAPI, hosted Postgres/PostGIS, or a VPS.
```

## Current architecture stance

The MVP is TypeScript-only: Cloudflare Workers/D1/R2 for the public app and local TypeScript pipeline jobs for heavy computation. See `wiki/engineering/package_structure.md`.

## What this wiki is not

This is not runtime state for the public app. Application code should not import from `knowledge/`.
