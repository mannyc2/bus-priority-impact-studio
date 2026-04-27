# Bus Priority Impact Studio

Public-data analytics product for MTA bus reliability and bus-priority interventions.

The repo is intentionally TypeScript-first for the MVP:

- `apps/web` serves the public demo on Cloudflare Workers Static Assets with a Worker API.
- `tools/pipeline` runs local batch jobs that fetch public data, build analytics artifacts, and prepare D1/R2 serving data.
- `packages/*` contain reusable TypeScript modules with strict dependency boundaries.
- `knowledge/` contains the LLM-maintained wiki, source registry, research notes, and append-only project log.

Read before coding:

1. `CLAUDE.md` — behavioral rules for safe, simple coding.
2. `AGENTS.md` — project-specific implementation rules for Codex/Claude.
3. `knowledge/index.md` — wiki navigation.
4. `knowledge/wiki/engineering/package_structure.md` — package architecture decision.

## MVP hosting direction

Use Cloudflare Workers + Static Assets for the public app, Cloudflare D1 as the small serving database, and Cloudflare R2 for generated artifacts. Keep heavy compute local until a concrete requirement forces managed Postgres/PostGIS or a VPS.

## Proposed workspace

```text
apps/web             React + Vite frontend and Cloudflare Worker API
packages/domain      Pure domain types, metric definitions, scoring rules
packages/sources     Public-data clients and source metadata adapters
packages/analytics   Deterministic transforms and local metric builders
packages/db          D1/SQLite schema, migrations, and read/write repositories
tools/pipeline       Local CLI for source probes, artifact builds, and D1 seed generation
knowledge            LLM wiki, source registry, raw source notes, index, and log
data                 Local generated data; mostly gitignored
```

Do not add Python to the MVP unless the TypeScript/local-SQL approach fails on a documented requirement.

## Toolchain

This repo is Bun-first for local development:

```bash
bun install
# Commit bun.lock after the first successful install.
bun run check:types
bun run check:style
bun run test:unit
bun run test:worker
bun run check
bun run hooks:install
```

Bun runs local scripts, workspace filters, package tests, and pipeline commands. Cloudflare Workers still deploy to Cloudflare's `workerd` runtime, and Wrangler remains the Cloudflare CLI.

## Current scaffold

The current scaffold includes:

- Zod v4 domain contracts with branded route IDs, codecs, registries, metadata, and JSON Schema export.
- Strict repo-wide TypeScript config in `tsconfig.base.json` and `tsconfig.typecheck.json`.
- Biome formatting/linting in `biome.jsonc`.
- Bun unit tests for domain/source/analytics/DB basics.
- Cloudflare Vitest Worker smoke tests for production-like request behavior.
- A pre-push hook that skips heavy code checks for docs/wiki-only pushes and runs type/style/unit/Worker checks for code changes.

Do not add Python, pnpm, hosted Postgres/PostGIS, or a VPS to the MVP unless a documented requirement forces escalation.
