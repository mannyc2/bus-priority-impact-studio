# docs/decisions

Architecture decision records.

Create a new ADR before introducing Python, hosted Postgres/PostGIS, a VPS, or a major framework change.

## ADRs

- `0001-bun-zod-testing-toolchain.md` - Bun-first toolchain, Zod v4 contracts, and test harnesses.
- `0002-postgres-drizzle-and-d1-serving-projections.md` - Postgres/Hyperdrive as the planned canonical analytics store, Drizzle as the typed DB layer, and D1 as an optional serving projection.
- `0003-maplibre-public-map-stack.md` - MapLibre GL JS for the public app map, with generated GeoJSON first and PMTiles/R2 as the larger artifact path.
- `0004-drizzle-schema-split-and-d1-serving-guardrails.md` - Separate Drizzle schemas for D1 serving projection and future Postgres canonical analytics, with D1 size guardrails and JSON cleanup plan.
- `0007-spatialite-for-local-geo-joins.md` - Spatialite as a loadable SQLite extension in the local pipeline for route ⇄ LION corridor joins. Worker / D1 never see spatialite; output is a flat lookup table.
