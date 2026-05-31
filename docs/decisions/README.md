# docs/decisions

Architecture decision records.

Create a new ADR before introducing Python, hosted Postgres/PostGIS, a VPS, or a major framework change.

## ADRs

- `0001-bun-zod-testing-toolchain.md` - Bun-first toolchain, Zod v4 contracts, and test harnesses.
- `0002-postgres-drizzle-and-d1-serving-projections.md` - Postgres/Hyperdrive as the planned canonical analytics store, Drizzle as the typed DB layer, and D1 as an optional serving projection.
- `0003-maplibre-public-map-stack.md` - MapLibre GL JS for the public app map, with generated GeoJSON first and PMTiles/R2 as the larger artifact path.
- `0004-drizzle-schema-split-and-d1-serving-guardrails.md` - Separate Drizzle schemas for D1 serving projection and future Postgres canonical analytics, with D1 size guardrails and JSON cleanup plan.
- `0007-spatialite-for-local-geo-joins.md` - Spatialite as a loadable SQLite extension in the local pipeline for route ⇄ LION corridor joins. Worker / D1 never see spatialite; output is a flat lookup table.
- `0008-public-identity-auth.md` - Public identity and authentication model for Studio surfaces.
- `0009-email-delivery-provider.md` - Email delivery provider decision for auth and Studio notifications.
- `0010-python-in-sandbox.md` - Superseded historical context for the first Python codemode sandbox.
- `0011-deep-novel-findings-mode.md` - Ralph-style deep findings loop for novel one-off research findings.
- `0012-agent-authored-detectors.md` - Registry-first, agent-assisted detector authoring plan after the analytics refactor.
- `0013-bun-typescript-codemode-sandbox.md` - Bun/TypeScript codemode sandbox with read-only analytics access and Pioneer/GPT-5.5 as the default deep-run path.
