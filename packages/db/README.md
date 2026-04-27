# packages/db

Serving database layer.

## Responsibilities

- D1/SQLite schema and migrations.
- Read repositories used by the Worker API.
- Seed/import helpers that load precomputed outputs into D1.
- Table contracts for R2 artifact keys.
- Thin typed repository functions over D1 prepared statements.
- Route catalog and route/month coverage serving rows for network-level inventory.

## Rules

- D1 is a serving database, not the analytics warehouse.
- Store compact, precomputed read models.
- Large GeoJSON/JSON artifacts should live in R2 or `data/artifacts`, with D1 storing keys and metadata.
- Prefer explicit query helpers over a full ORM until the serving schema stabilizes.
