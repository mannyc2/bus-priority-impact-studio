# 0004 - Drizzle schema split and D1 serving-projection guardrails

Date: 2026-04-27

## Status

Accepted as a documentation/architecture plan. No Drizzle migration is implemented by this ADR.

## Context

This branch is Bun-first TypeScript. The public app runs on Cloudflare Workers Static Assets plus a Worker API. `packages/db` currently owns hand-written D1 SQL table strings, D1-like prepared-statement interfaces, serializers, and repositories.

ADR 0002 already decides that Postgres through Cloudflare Hyperdrive is the planned canonical operational/analytics database once needed, while D1 remains a compact public serving projection. This ADR sharpens that decision for Drizzle, Zod v4, D1 limits, JSON cleanup, and package responsibilities.

The main concern is D1's size and workload profile. Cloudflare documents D1 as designed for horizontal scale-out across many smaller databases and documents a paid per-database limit of 10 GB that cannot be increased. That does not fit a single canonical MTA analytics warehouse. It can fit a compact, replaceable edge serving projection.

## Decision

Adopt Drizzle in `packages/db`, but maintain separate Drizzle schema trees:

```text
packages/db/src/schema/d1/      # compact Cloudflare D1 serving projection
packages/db/src/schema/pg/      # future canonical Postgres analytics/ops schema
packages/db/src/schema/shared/  # constants/enums only; no shared table objects
```

Do not use one Drizzle table schema across D1 and Postgres. Share domain contracts through `packages/domain` and share value constants where useful, but keep database schemas dialect- and purpose-specific.

D1 remains the MVP serving database only for small read models and artifact metadata. Postgres/Hyperdrive is introduced when product requirements need retained normalized history, dynamic analytical joins, larger queryable datasets, or canonical operational state.

R2/static assets remain the storage location for large generated artifacts and source snapshots.

## Consequences

### Positive

- D1 stays small, cheap, and replaceable.
- Postgres can use a richer canonical schema when actually needed.
- Drizzle gives typed SQL/schema/migration scaffolding without turning domain code into database code.
- Zod v4 remains the public/domain contract layer while Drizzle-generated schemas validate database rows.
- The repo avoids Python, FastAPI, VPS, and PostGIS until a concrete documented requirement appears.

### Negative / tradeoffs

- Two schemas mean some duplication between D1 and Postgres table names/columns.
- A future Postgres rollout needs explicit projection/export code to produce D1 rows.
- Child tables replacing JSON columns will increase migration and export complexity.
- The app must keep clear repository boundaries so UI/Worker code does not import table internals.

## D1 guardrail

D1 is acceptable for:

- route scorecards,
- route/month summaries,
- route catalog and direction/type child rows,
- artifact metadata,
- brief summary rows,
- citation/caveat rows,
- readiness/source-status rows,
- compact hotspot summaries without geometry payloads.

D1 is not acceptable for:

- raw source history,
- full historical segment-speed observation tables,
- detailed ACE violation history,
- PMTiles/GeoJSON payloads,
- route brief bodies,
- multi-year debug snapshots,
- canonical analytics joins.

If the D1 projection grows toward hundreds of MB because of product-queryable history, move canonical data to Postgres/Hyperdrive. If it grows because of large artifacts or blobs, move those payloads to R2/static assets.

## JSON cleanup

Product-queryable JSON should become relational columns or child tables. Current candidates:

- `route_scorecard.citations_json` -> `route_scorecard_citation`
- `route_brief_summary.peak_ridership_json` -> `route_brief_peak_window`
- `route_brief_summary.slowest_window_json` -> `route_brief_slowest_window`
- `route_catalog.route_types_json` -> `route_catalog_type`
- `route_catalog.directions_json` -> `route_direction`
- `route_readiness.missing_inputs_json` -> `route_readiness_missing_input`
- `route_build_plan.missing_inputs_json` -> reuse readiness missing inputs or add `route_build_plan_missing_input`
- `route_reliability_baseline.top_long_gap_windows_json` -> `route_reliability_gap_window`
- `route_reliability_baseline.source_status_json` and `route_equity_context.source_status_json` -> `route_month_source_status`
- `route_batch_status.built_route_ids_json` -> `route_batch_built_route`
- `route_batch_status.issues_json` -> `route_batch_issue`

JSON/JSONB remains appropriate for raw source captures, provenance, schema-probe payloads, debug snapshots, audit metadata, selected-row attachments, and opaque source payloads where product-queryable fields are also extracted.

## Drizzle/Zod pattern

- Use Zod v4 schemas in `packages/domain` for domain/public API contracts.
- Use Drizzle-generated select/insert/update schemas in `packages/db/src/validation`.
- Do not replace domain schemas with Drizzle schemas.
- Follow the stable package path first: stable `drizzle-orm`, `drizzle-kit`, and stable Drizzle/Zod helper package if needed.
- Do not adopt a Drizzle 1.0 beta solely to use first-class `drizzle-orm/zod`; document that separately if chosen.

## Migration workflow

For D1:

1. Add Drizzle dependencies and D1 schema files without changing behavior.
2. Mirror existing D1 tables in Drizzle.
3. Generate SQL migrations and compare them to existing hand-written SQL.
4. Apply migrations locally with Wrangler.
5. Run D1 export verification and Worker tests.
6. Apply remotely only after local checks pass.

For Postgres:

1. Add Postgres schema/config only after a documented requirement forces canonical managed storage.
2. Generate Postgres migrations separately from D1 migrations.
3. Use Hyperdrive in Workers for bounded operational queries.
4. Keep historical setup/backfill local through Bun pipeline jobs.

## Verification for next implementation PR

- Existing tests still pass.
- D1 schema mirror generates SQL equivalent to existing table definitions.
- No public app behavior changes in the first Drizzle PR.
- No Worker request path imports source/analytics/pipeline code.
- D1 export verifier confirms child-table counts and artifact metadata.

## Sources

- Zod package on npm — https://www.npmjs.com/package/zod — verified_at: 2026-04-27.
- Zod 4 release notes — https://zod.dev/v4 — verified_at: 2026-04-27.
- Drizzle Cloudflare D1 docs — https://orm.drizzle.team/docs/connect-cloudflare-d1 — verified_at: 2026-04-27.
- Drizzle zod docs — https://orm.drizzle.team/docs/zod — verified_at: 2026-04-27.
- Drizzle config docs — https://orm.drizzle.team/docs/drizzle-config-file — verified_at: 2026-04-27.
- Drizzle D1 HTTP API guide — https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit — verified_at: 2026-04-27.
- Cloudflare D1 overview — https://developers.cloudflare.com/d1/ — verified_at: 2026-04-27.
- Cloudflare D1 limits — https://developers.cloudflare.com/d1/platform/limits/ — verified_at: 2026-04-27.
- Cloudflare D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/ — verified_at: 2026-04-27.
- Cloudflare D1 migrations — https://developers.cloudflare.com/d1/reference/migrations/ — verified_at: 2026-04-27.
- Cloudflare D1 local development — https://developers.cloudflare.com/d1/best-practices/local-development/ — verified_at: 2026-04-27.
- Cloudflare Hyperdrive Drizzle example — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ — verified_at: 2026-04-27.
- Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/ — verified_at: 2026-04-27.
