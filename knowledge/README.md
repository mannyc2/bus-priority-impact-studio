# Knowledge Wiki — Bus Priority Impact Studio

This directory contains the LLM-maintained wiki for **Bus Priority Impact Studio**. It follows the persistent wiki pattern: raw source captures and metadata feed a maintained synthesis layer that Codex/Claude updates over time.

## Directory roles

- `raw/` — source registry, immutable source notes/captures, metadata JSON, and assets.
- `wiki/` — maintained synthesis pages for project, data, and engineering.
- `AGENTS.md` — wiki-specific operating contract for Codex.
- `index.md` — navigation index. Read this first before answering or editing.
- `log.md` — append-only chronological log.

Actual downloaded datasets for local analytics belong in repo-level `data/raw/`, not here.

## Getting oriented

Read `CLAUDE.md` and `AGENTS.md` at the repo root, then `knowledge/index.md`. Open plan rows
live in `plans/README.md`. Run `bun run check:knowledge` after editing anything under `wiki/`:
it verifies that every index link resolves, that no wiki page is missing an index entry, and
that frontmatter `status:` values stay inside the enum declared in `AGENTS.md`.

## Current architecture stance

The MVP is TypeScript-only: Cloudflare Workers/D1/R2 for the public app and local TypeScript pipeline jobs for heavy computation. See `wiki/engineering/package_structure.md`.

## What this wiki is not

This is not runtime state for the public app. Application code should not import from `knowledge/`.
