# Bus Priority Impact Studio

Public-data analytics product for MTA bus reliability and bus-priority interventions.

**Live:** [bus-priority-impact-studio.c20carroll.workers.dev](https://bus-priority-impact-studio.c20carroll.workers.dev/) is the public app: a route-first civic data surface with route pages, maps, intervention context, timelines, and methods.

What to look at:

- [Live app](https://bus-priority-impact-studio.c20carroll.workers.dev/) - deployed Cloudflare Workers app backed by D1/R2 serving projections.
- [analytics-primer.html](analytics-primer.html) - open in a browser for a visual map of the analytics architecture.
- [Detector calibration ADR](docs/decisions/0018-detector-calibration-readiness-loop.md) and [readiness artifacts](data/artifacts/analytics-detector-readiness/) - reviewed-label loop for detector publication discipline.
- [Tier 2 status runbook](knowledge/wiki/engineering/tier2_processing_status_and_resume.md) - OCR, extraction, vocabulary, route resolution, and intervention corpus state.
- [Architecture decisions](docs/decisions/) - start with 0017, 0018, and 0019 for publication freshness, detector readiness, and the Effect pipeline runtime.

Contributor and agent note: read [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and [knowledge/index.md](knowledge/index.md) before changing code.

The repo is intentionally TypeScript-first and Bun-first for the MVP:

- `apps/web` serves the public demo on Cloudflare Workers Static Assets with a Worker API.
- `tools/pipeline-v2` runs local Effect-backed batch jobs that fetch public data, build analytics artifacts, and prepare D1/R2 serving data.
- `packages/*` contain reusable TypeScript modules with strict dependency boundaries.
- `.claude/` contains project-scoped Claude Code skills (React best practices, composition patterns).
- `knowledge/` contains the LLM-maintained wiki, source registry, research notes, and append-only project log.

Read before coding:

1. `CLAUDE.md` — behavioral rules for safe, simple coding.
2. `AGENTS.md` — project-specific implementation rules for Codex/Claude.
3. `.claude/README.md` — Claude Code skill setup.
4. `knowledge/index.md` — wiki navigation.
5. `knowledge/wiki/engineering/package_structure.md` — package architecture decision.

## MVP hosting direction

Use Cloudflare Workers + Static Assets for the public app, Cloudflare D1 as the small serving database, and Cloudflare R2 for generated artifacts. Keep heavy compute local until a concrete requirement forces managed Postgres/PostGIS or a VPS.

## Proposed workspace

```text
apps/web             React + Vite frontend and Cloudflare Worker API
packages/studio-api  Public Studio API contracts, route registry, and Worker handlers
packages/domain      Pure domain types, metric definitions, scoring rules
packages/sources     Public-data clients and source metadata adapters
packages/analytics   Deterministic transforms and local metric builders
packages/db          D1/SQLite schema, migrations, and read/write repositories
tools/pipeline-v2    Effect-backed local CLI for source probes, artifact builds, and D1/R2 publish prep
.claude              Project Claude Code skills
knowledge            LLM wiki, source registry, raw source notes, index, and log
data                 Local generated data; mostly gitignored
```

Do not add Python to the MVP unless the TypeScript/local-SQL approach fails on a documented requirement.

## Web app structure

```text
apps/web/src/
  routes/               TanStack route files
  studio/               public app pages, API client types, shell, and SEO helpers
  components/           route, map, chart, and shared UI components
  worker/               Cloudflare Worker API runtime
  lib/                  frontend-only helpers
  fixtures/             small UI fixtures and demos
```

Frontend work stays in `apps/web/src/` directories. Backend/data changes require explicit instruction.

## Toolchain

This repo is Bun-first for local development:

```bash
bun install
# Commit bun.lock after the first successful install.
bun run check:types
bun run check:style
bun run check:architecture
bun run test:unit
bun run test:web
bun run test:worker
bun run check
bun run hooks:install
```

Bun runs local scripts, workspace filters, package tests, and pipeline commands. Cloudflare Workers still deploy to Cloudflare's `workerd` runtime, and Wrangler remains the Cloudflare CLI.

## Environment

Set `MTA_BUS_TIME_API_KEY` for Bus Time GTFS-RT collection and source probes. GTFS-RT observed reliability is part of Data Pipeline v1 as a current observed layer; without the key, public static/open-data source probes and canonical monthly releases can still run, but realtime appendix and observed monthly promotion gates cannot pass. Do not commit local env files or secrets.

LLM-backed local pipeline commands use gitignored `.env` keys such as `PIONEER_API_KEY`,
`OPENROUTER_API_KEY`, and `DEEPSEEK_API_KEY`. Bun loads the repo-root `.env` for Bun-run commands,
so `printenv` can incorrectly look empty while `bun` sees the keys. Check setup with:

```bash
bun run env:check:llm
```

For tmux sessions or other shell-launched jobs that need the same repo-local keys, wrap the command:

```bash
scripts/with-repo-env.sh -- bun --filter @bp/pipeline-v2 cli -- <command>
```

## Current scaffold

The current scaffold includes:

- Zod v4 domain contracts with branded route IDs, codecs, registries, metadata, and JSON Schema export.
- Strict repo-wide TypeScript config in `tsconfig.base.json` and `tsconfig.typecheck.json`.
- Biome formatting/linting in `biome.jsonc`.
- Bun unit tests for domain/source/analytics/DB/frontend basics.
- Cloudflare Vitest Worker smoke tests for production-like request behavior.
- Claude Code project skills for React best practices and composition patterns.
- A pre-push hook that skips heavy code checks for docs/wiki-only pushes and runs type/style/architecture/unit/web/Worker checks for code changes.

Do not add Python, pnpm, hosted Postgres/PostGIS, or a VPS to the MVP unless a documented requirement forces escalation.
