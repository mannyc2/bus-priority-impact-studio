# 0002 - Postgres, Drizzle, and D1 serving projections

Date: 2026-04-27

## Decision

Use Postgres, accessed from Cloudflare Workers through Hyperdrive, as the planned canonical operational and analytics database once the project outgrows local artifacts and compact D1 serving tables.

Adopt Drizzle as the planned typed database layer for schema definitions, migrations, SQL construction, repository implementation, and generated validation helpers.

Keep Cloudflare D1 available as a compact public serving projection when it materially improves edge read latency or deployment simplicity. Do not treat one D1 database as the long-term canonical analytics store.

## Why

Cloudflare documents D1 as a horizontally scaled product built around many smaller databases. A paid D1 database is capped at 10 GB, and that per-database limit cannot be increased. D1 also processes each individual database through a single-threaded execution model, so throughput depends directly on query duration.

That profile fits compact read-heavy serving tables, route scorecards, public summaries, and edge projections. It is less suitable for normalized source history, detailed route/month facts, intervention event studies, ad hoc analytics, or larger single-database workloads.

Cloudflare's storage guidance points to Hyperdrive when an application needs a large single Postgres/MySQL database, existing database tools, or larger operational datasets. Hyperdrive also supports existing Postgres drivers and ORM/query-builder libraries from Workers.

Drizzle gives the project the database benefits we want without treating the domain as an object graph: schema as code, typed SQL, safer inserts and updates, migrations, and generated validation helpers where useful.

## Consequences

- Product-queryable data should be modeled relationally as scalar columns or child tables.
- JSON/JSONB should be reserved for source payloads, provenance, debug metadata, audit details, and selected-row attachments that are not used for filtering, sorting, joining, ranking, or pagination.
- Workers should run bounded incremental updates over indexed route/month/source slices, not large in-memory analytics.
- R2 remains the right place for raw source snapshots, large generated artifacts, and downloadable datasets.
- `@bp/db` owns schema, migrations, repositories, and SQL construction. App and pipeline code should not import Drizzle table internals directly.
- D1 may remain as an optional generated read model, but Postgres should be the target for canonical normalized analytics and operational state.

## References

- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare storage options: https://developers.cloudflare.com/workers-ai/platform/storage-options/
- Cloudflare Hyperdrive: https://developers.cloudflare.com/hyperdrive/
