---
title: CLI Commands
type: engineering
status: active
last_updated: 2026-04-27
owner: codex
source_count: 2
tags: [cli, tools, codex, typescript, bun]
---

# CLI Commands

## Why this matters

The CLI is the boundary between local heavy compute and the managed public app. Commands live in `tools/pipeline` as a TypeScript package named `@bp/pipeline`.

The public app should not run these commands at request time.

## Package command shape

Run commands through Bun:

```bash
bun --filter @bp/pipeline <script> -- <args>
```

The package may expose a `bp` binary later, but do not add a global CLI abstraction until the first commands work.

## Source commands

```bash
bun --filter @bp/pipeline sources:list
bun --filter @bp/pipeline sources:probe -- --all
bun --filter @bp/pipeline sources:probe -- --dataset kufs-yh3x
bun --filter @bp/pipeline sources:lint
```

Expected outputs:

- `knowledge/raw/metadata/*.json`
- updates to `knowledge/wiki/data/*.md`
- updates to `knowledge/wiki/data/source_registry.md`
- append-only entry in `knowledge/log.md`

## Ingest commands

```bash
bun --filter @bp/pipeline ingest:segment-speeds -- --route M1 --month 2026-01
bun --filter @bp/pipeline ingest:routes
bun --filter @bp/pipeline ingest:stops
bun --filter @bp/pipeline ingest:ridership -- --month 2026-01
bun --filter @bp/pipeline ingest:ace
bun --filter @bp/pipeline ingest:bus-lanes
```

Expected outputs:

- raw downloads under `data/raw/`
- normalized working data under `data/working/`
- small fixtures under `data/fixtures/` only when needed for tests

## Build commands

```bash
bun --filter @bp/pipeline build:segments -- --route M1
bun --filter @bp/pipeline build:hotspots -- --route M1 --month 2026-01
bun --filter @bp/pipeline build:route-score -- --route M1 --month 2026-01
bun --filter @bp/pipeline build:ace-impact -- --route M1
```

Expected outputs:

- generated route/segment GeoJSON
- route scorecard JSON
- route brief draft inputs
- source/caveat metadata

## Export commands

```bash
bun --filter @bp/pipeline export:d1 -- --route M1 --month 2026-01
bun --filter @bp/pipeline export:artifacts -- --route M1 --month 2026-01
bun --filter @bp/pipeline export:r2 -- --route M1 --month 2026-01
```

Expected outputs:

- D1 seed SQL or import-ready rows
- artifact keys and hashes
- optional R2 upload after local artifact contracts are stable

## Wiki/search commands

```bash
bun --filter @bp/pipeline wiki:search -- "ACE bus speed impacts"
bun --filter @bp/pipeline wiki:lint
```

These are optional P1/P2 commands. They should operate on `knowledge/` and should not be required for the public app MVP.

## Developer commands

```bash
bun run check:types
bun run test
bun --filter @bp/web build
bun --filter @bp/pipeline test
```

Do not use `pytest`, `ruff`, or Python scripts in the MVP.

## Caveats

- These commands are proposed targets, not implemented commands.
- Start with `sources:probe` and one fixture-backed test before adding ingest/build commands.
- Keep command implementations thin; put reusable logic in `packages/*`.

## Sources

- Bun workspace docs — https://bun.sh/docs/pm/workspaces — verified_at: 2026-04-27
