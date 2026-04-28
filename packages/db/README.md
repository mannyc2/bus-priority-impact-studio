# packages/db

Serving database layer.

## Responsibilities

- D1/SQLite schema and migrations.
- Drizzle query modules used by the Worker API and local export verification.
- Seed/import helpers that load precomputed outputs into D1.
- Table contracts for R2 artifact keys.
- Route catalog and route/month coverage serving rows for network-level inventory.

## Rules

- D1 is a serving database, not the analytics warehouse.
- Store compact, precomputed read models.
- Large GeoJSON/JSON artifacts should live in R2 or `data/artifacts`, with D1 storing keys and metadata.
- Keep Drizzle schemas and migrations in this package; expose explicit repository helpers to callers.
- Keep D1 query modules under `src/d1/queries`; do not add root-level repository files.
