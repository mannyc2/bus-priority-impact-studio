---
title: Raw Prepare Audit
type: engineering
status: complete
last_updated: 2026-06-02
owner: codex
tags: [drizzle, d1, sqlite, raw-sql, batch, transactions]
---

# Raw Prepare Audit

This audit covers the raw `.prepare()` calls remaining after the Drizzle 1.0 RC upgrade.

Implementation update, 2026-06-02: the D1 application query modules now have zero direct
`.prepare()` calls. `identity.ts`, `identity-surfaces.ts`, and `studio-brief-agents.ts` were moved
to Drizzle builders. `studio-brief-drafts.ts` now accepts `D1ServingDb`; simple draft CRUD,
conditional updates, grouped record reads, replacement writes, and review-comment writes use
Drizzle builders and D1 `db.batch()`. Its remaining SQL helper is explicitly named
`legacySqlStatement` and routes through Drizzle `sql` execution instead of direct
`D1Database.prepare()`. The production boundary harness blocks any new direct `.prepare()` calls
under `packages/db/src/d1/queries/` with no allowlist.

## Counts

Original D1 query module inventory:

- `packages/db/src/d1/queries/identity.ts`: 14 direct raw `.prepare()` calls across 12 exported functions.
- `packages/db/src/d1/queries/identity-surfaces.ts`: 13 direct raw `.prepare()` calls across 12 exported functions.
- `packages/db/src/d1/queries/studio-brief-drafts.ts`: 3 raw helper `.prepare()` calls, but 39 helper call sites using raw SQL.
- `packages/db/src/d1/queries/studio-brief-agents.ts`: 3 raw helper `.prepare()` calls, but 12 helper call sites using raw SQL.

Current pipeline-local SQLite modules:

- `tools/pipeline-v2/src`: 40 raw `.prepare()` calls.

The D1 query surface originally had 33 literal `.prepare()` occurrences, but roughly 78 D1 query
operations once helper call sites were counted. The current direct D1 `.prepare()` count is zero.

## Drizzle Support Finding

None of the D1 query shapes found in this audit require raw `D1Database.prepare()` because Drizzle
cannot express them.

Drizzle 1.0 RC D1 support in the installed package includes:

- `db.batch([...])` for D1 batch execution.
- `db.transaction(async (tx) => ...)` using `begin`, `commit`, and `rollback`.
- nested transaction savepoints.
- select, insert, update, delete, joins, `limit`, `orderBy`, `onConflictDoUpdate`, and raw SQL
  expression fragments through `sql`.
- dynamic query building through `.$dynamic()` for conditional filters and assignments.

Drizzle's D1 session also prepares statements through the same underlying D1 client. Raw
`database.prepare()` does not provide an obvious per-statement performance advantage over Drizzle
for these application query modules.

## D1 Query Classification

### Convert Directly

These are ordinary CRUD/read queries. Drizzle should handle them cleanly with the schema tables
already mirrored in `packages/db/src/d1/schema.ts`.

- `identity.ts`: `getOperatorRoleForIdentity`, `recordSessionUse`, `getIdentityById`,
  `getIdentityByEmailNormalized`, `createSession`, `revokeSession`,
  `revokeAllSessionsForIdentity`, `listSessionsForIdentity`, `updateIdentityDisplayName`.
- `identity-surfaces.ts`: `insertAlert`, `listAlertsForIdentity`, `deactivateAlert`,
  `insertSavedSearch`, `listSavedSearchesForIdentity`, `deleteSavedSearch`,
  `insertPublicComment`, `listPublicCommentsForBrief`, `revokeStudioActorRole`,
  `softDeletePublicComment`.
- `studio-brief-agents.ts`: all current operations are standard CRUD/list operations and can be
  represented with Drizzle builders.

### Convert With Small SQL Fragments

These use SQLite expressions or conditional shape, but Drizzle supports them via `sql`, `like`,
`and`/`or`, `isNull`, dynamic builders, or conditional object spreads.

- `identity.ts`: `getIdentityBySessionTokenHash` uses a join, `kind in (...)`, null checks, and an
  expiry comparison.
- `identity.ts`: `consumeMagicLinkRequest` uses read-then-conditional-update; the update is simple,
  and the concurrency guard is already the `where consumed_at is null` predicate.
- `identity-surfaces.ts`: `listIdentitiesWithRoles` uses a conditional search branch with
  `lower(...) like ?`, `coalesce(...)`, and a left join.
- `identity-surfaces.ts`: `upsertStudioActorRole` uses `on conflict (...) do update`.
- `studio-brief-drafts.ts`: metadata/status/update functions now use conditional `.set({...})`
  builder objects instead of manual SQL assignment lists.
- `studio-brief-drafts.ts`: reads using `coalesce(updated_at, created_at) as updated_at` can use
  selected `sql<string>` expressions.

### Convert And Improve With Batch Or Transaction

These are the places where Drizzle can be an improvement, not just a style change.

- `identity.ts`: `createMagicLinkRequest` does a lookup, optional identity insert, then session
  insert. The write portion should be a Drizzle transaction or batch after the lookup.
- `studio-brief-drafts.ts`: `getStudioBriefDraftRecord` now fetches the draft and four child
  collections with Drizzle `db.batch()`.
- `studio-brief-drafts.ts`: `insertStudioBriefHistoryEvent` calculates `max(event_seq) + 1` and then
  inserts. This should be a transaction to avoid concurrent duplicate sequence allocation.
- `studio-brief-drafts.ts`: `replaceStudioBriefDraftClaims`, `replaceStudioBriefDraftBlocks`, and
  `replaceStudioBriefDraftRefs` now delete existing rows and insert replacements with
  Drizzle `db.batch()`.
- `studio-brief-drafts.ts`: `insertStudioBriefReviewComment` now batches the comment insert and
  draft status update.

### Keep Raw Temporarily

The 40 raw prepares under `tools/pipeline-v2/src` are pipeline-local SQLite paths, mostly bulk
ingest, geocoding, geometry-index, and match-update loops. They may have legitimate performance
reasons to stay closer to `bun:sqlite` prepared statements for now, especially where the same
statement is prepared once and run many times inside a local transaction.

This audit does not find a reason to keep the D1 application query modules on raw
`D1Database.prepare()` for performance.

## Recommended Next Slice

1. Keep the direct D1 `.prepare()` allowlist at zero.
2. Keep the remaining `studio-brief-drafts.ts` `legacySqlStatement` calls limited to
   expression-heavy cases: `coalesce(max(event_seq), 0) + 1`, claim renumbering arithmetic, and
   `json_extract` cleanup.
3. Keep a separate non-blocking audit for `tools/pipeline-v2/src` raw local SQLite prepared
   statements.
