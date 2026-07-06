# Plan 044: Migrate sources + pipeline schemas to Effect Schema and evict zod from the repo (ADR-0020)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- packages/sources tools/pipeline-v2/src/lib docs/decisions knowledge/wiki/engineering/package_structure.md`
> Plans 037-043 land first by design; the sources adapters' zod patterns
> should still match the excerpts below. Mismatch there = STOP.

## Status

- **Priority**: P2 (the closer — everything before it did the hard parts)
- **Effort**: M-L
- **Risk**: MED (source DTO parsing feeds ingest; fixture tests are the net)
- **Depends on**: plans/040 (liche gone — its `arg.*`/`z` re-exports were
  structural zod), plans/043 (domain schemas are Effect; its PR notes carry
  the exact leftover-zod inventory for this plan)
- **Category**: migration / docs
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

After plans 040-043, zod survives only at the leaves: `packages/sources`
DTO adapters (24 files — external rows parsed before analytics), a handful
of pipeline lib parsers, and the root catalog entry. Finishing the
migration ends the two-schema-library era that bred the gen-4 seam bugs,
aligns the source layer with nyc-transit-kit (whose contracts are already
Effect Schema), and lets the repo state its schema doctrine in one ADR
instead of a contradiction. The final grep gate (`zod` appears nowhere) is
the whole-track's done-signal.

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**packages/sources** (4,951 LOC; 24 zod-importing files):
- `src/adapters/{mta,nyc-dot,nyc-open-data,...}/*.ts` — ~18 adapters that
  normalize Socrata/CSV rows into typed DTOs. Coercion-heavy:
  `adapters/mta/bus-speeds.ts` alone has 28 `.coerce` sites;
  `adapters/nyc-dot/traffic-volume.ts` has 8. `.passthrough()` clusters
  here too (raw rows keep unknown fields).
- `src/gtfs-realtime/` (429 LOC) — normalizes kit-decoded GTFS-RT protobuf
  into zod schemas (`decoder.ts` already delegates decoding to
  `@nyc-transit-kit/mta`'s `decodeGtfsRealtimeBytes`).
- `src/registry/` — source-manifest parsing
  (`registry/loaders/bun-yaml.ts` loads `knowledge/raw/source_manifest.yaml`).
- `src/clients/{geoclient,census}/`, `src/probes/` — response validation.
- Hard constraints from `tests/harness/production-boundaries.test.ts:376-413`:
  no `process.env`, `Bun.` only in the two allowlisted adapter files, no
  `/resource/` SODA2 paths, no direct `gtfs-realtime-bindings` import, no
  root barrel. These tests must pass unmodified.
- Fixture-backed tests exist under `packages/sources/test/` — they are the
  behavioral oracle for every adapter migration.

**tools/pipeline-v2 leaf zod** (the 043 PR notes carry the authoritative
list; known members): `lib/mta-wiki-canonical.ts`, `lib/json.ts`,
`lib/local-db-aggregates/{context-events,segment-month-panel-rows,segment-daypart-history-rows,intervention-panel-rows}.ts`,
`lib/socrata-catalog-search.ts`,
`commands/export/{route-capability-manifest,route-dossier-summaries,d1-inputs}.ts`
(post-040 these files' zod is handler-internal, not CLI-arg).

**Catalog + packages**: root `package.json:57` `"zod": "^4.3.6"`;
`packages/sources/package.json` and `tools/pipeline-v2/package.json` still
declare `"zod": "catalog:"` at this point (earlier plans removed it from
web/db/domain/analytics/studio-api).

**Doctrine to rewrite**:
- `docs/decisions/0001-bun-zod-testing-toolchain.md` — "Use Zod v4 for
  runtime contracts at data boundaries."
- `knowledge/wiki/engineering/package_structure.md` — the "Type discipline"
  table ("Domain types and Zod schemas ... should be Zod schemas with
  exported `z.output` types"; "No `any`. Use `unknown` at boundaries, then
  parse with Zod"; "Use `.strict()` for Zod object contracts"; dependency
  rule "`@bp/db` may import ... and `zod`").
- `plans/README.md` gen-2 record "Zod v4 stays (ADR-0001), reaffirmed in
  ADR-0019" — superseded note added by the gen-5 README section (already
  done when this plan runs; verify).

**Effect Schema target idioms**: same recipe table as plan 043 step 4
(brands, Literals, Union-array, Struct strictness options, transforms for
coercion — `Schema.NumberFromString`-style codecs for `.coerce` sites;
verify exact names against `.repos/effect/packages/effect/src/Schema.ts`).
Plan 043's `schema-semantics.test.ts` already proved the
strict/passthrough/coerce equivalences — reuse its patterns.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck sources | `bun --filter @bp/sources typecheck` | exit 0 |
| Sources tests | `bun --filter @bp/sources test` | all pass |
| Pipeline typecheck+tests | `bun --filter @bp/pipeline-v2 typecheck && bun --filter @bp/pipeline-v2 test` | green |
| One fixture-backed ingest command | pick one from `tools/pipeline-v2/test/commands/ingest/` and run its test file | passes |
| Full unit | `bun run test:unit` | all pass |
| Architecture harness | `bun run check:web-architecture` | all pass |
| Knowledge check | `bun run check:knowledge` | exit 0 |

## Scope

**In scope**:
- `packages/sources/src+test` (schema migration only — no API-shape changes)
- The leftover-zod pipeline files (043's inventory + the known list above)
- `packages/sources/package.json`, `tools/pipeline-v2/package.json`, root
  `package.json` catalog (zod removal), `bun.lock` via `bun install`
- New `docs/decisions/0020-effect-schema-only.md`
- Amend status headers of `docs/decisions/0001-*.md` (zod clause
  superseded pointer) — do not rewrite its history
- `knowledge/wiki/engineering/package_structure.md` type-discipline
  section; `knowledge/log.md`, `knowledge/index.md`
- `tests/harness/production-boundaries.test.ts` — ADD one guard test (see
  step 5); modify nothing existing

**Out of scope**:
- Adapter behavior/output shapes (analytics consumes them; fixture tests
  pin them).
- nyc-transit-kit adoption changes (plan 045).
- domain/db/web/studio-api — already zod-free; if you find zod there,
  something upstream regressed: STOP.

## Git workflow

- Branch: `plan/044-zod-eviction`; commit per step; no push unless asked.

## Steps

### Step 1: Freeze the inventory

```bash
rg -l "from \"zod\"|from 'zod'" apps packages tools tests scripts --glob '!node_modules'
```

Expect: only `packages/sources/src|test/**` and the pipeline leaf files.
Anything else = STOP (upstream plan incomplete). Record the list; it is
this plan's checklist.

### Step 2: Migrate packages/sources adapter-by-adapter

Recipe per adapter file (same table as plan 043 step 4, plus the two
patterns concentrated here):
- `.coerce.number()` on raw string fields →
  `Schema.NumberFromString` (or the v4 string-to-number transformation —
  verify the exact export; write it once as a shared helper in
  `packages/sources/src/core/` if the name is long).
- `.passthrough()` raw-row structs → the v4 unknown-keys-preserving struct
  option proven by plan 043's semantics tests.
Run that adapter's fixture test after each file. Keep exported schema/type
NAMES identical (analytics imports them).

Order: start with the two smallest adapters to calibrate, then
`gtfs-realtime/` (aligns with the kit's Effect-Schema outputs — expect
simplification where kit types can flow through instead of re-shaping),
then the big Socrata adapters (`mta/bus-speeds.ts` last — 28 coerce sites,
largest fixture suite).

**Verify**: after each file — its test; after the subtree —
`bun --filter @bp/sources test` all green, boundary tests untouched.

### Step 3: Migrate the pipeline leaf files

Same recipe. `lib/json.ts` deserves a look before mechanical migration: if
its zod usage is a generic "parse this JSON with this schema" helper, its
signature becomes Effect-Schema-typed (`Schema.Schema<A>` instead of
`z.ZodType`) — update its call sites in the same commit.

**Verify**: `bun --filter @bp/pipeline-v2 test` green; one fixture-backed
ingest command's test green.

### Step 4: Evict zod everywhere

Remove `"zod": "catalog:"` from `packages/sources/package.json` and
`tools/pipeline-v2/package.json`; remove `"zod": "^4.3.6"` from the root
catalog; `bun install`.

**Verify**:
```bash
rg -l "from \"zod\"|from 'zod'|require\(.zod" apps packages tools tests scripts --glob '!node_modules'   # → empty
grep -rn '"zod"' --include=package.json . | grep -v node_modules                                          # → empty
grep -c '"zod@' bun.lock                                                                                  # → 0
```
All package typechecks + `bun run test:unit` + `test:web` + `test:worker`
green.

### Step 5: Add the reintroduction guard

In `tests/harness/production-boundaries.test.ts`, add one test (match the
file's existing style — see the `@bp/sources` root-barrel test at :415-429
for the read-all-files pattern): every file under `apps/`, `packages/`,
`tools/`, `tests/` has no module specifier equal to `"zod"` or starting
with `"zod/"`. Name it so the failure message says which file regressed.

**Verify**: `bun run check:web-architecture` → all pass (including the new
test).

### Step 6: Author ADR-0020 and update the doctrine

1. `docs/decisions/0020-effect-schema-only.md` — follow the existing ADR
   format (Date / Status: Accepted / Context / Decision / Consequences).
   Decision content, in this plan's words: Effect Schema (v4 line, the
   `effect` package already pinned in the catalog) is the ONLY runtime
   schema layer repo-wide. It supersedes the zod clause of ADR-0001 and
   extends ADR-0019. The browser is schema-free by design (plan 042): the
   client consumes types, never runtime validators — Effect stays out of
   the browser bundle. `packages/db` carries NO schema library at all:
   drizzle-inferred types on trusted reads, hand-rolled narrowing on
   JSON-text columns (plan 041). Record the June-2026 rejection of this
   migration and why it was superseded (operator direction 2026-07-04;
   dead-Tier-2 pruning changed the LOC math; the zod-feature audit found
   zero hard-to-migrate API uses).
2. `docs/decisions/0001-bun-zod-testing-toolchain.md` — add under Status:
   `Partially superseded by 0020 (2026-07-04): the Zod clause; Bun/Biome/testing decisions stand.`
3. `knowledge/wiki/engineering/package_structure.md` — rewrite the Type
   discipline rows: domain contracts are Effect Schema with
   `typeof X.Type` exports; DB rows derive from drizzle `$infer*`; source
   DTOs are Effect Schema; "unknown at boundaries, then decode with Effect
   Schema"; drop `zod` from the `@bp/db` dependency-rule line. Keep the
   table structure; change only schema-library content. Add
   `last_updated: 2026-07-XX` per the frontmatter convention.
4. `knowledge/log.md` — dated entry: zod fully removed (plans 040-044);
   ADR-0020 authored. `knowledge/index.md` — update only if it links a
   changed page section (read it; it carries caveat banners about stale
   commands).

**Verify**: `bun run check:knowledge` → exit 0.

## Test plan

- Fixture tests per adapter are the oracle — no new behavior tests needed
  beyond what plan 043's semantics suite established.
- The step-5 guard test is this plan's lasting artifact.
- If any adapter lacked a fixture test entirely (check while migrating),
  add ONE minimal decode test from a captured fixture row before migrating
  that adapter — never migrate an untested parser blind.

## Done criteria

- [x] Step-4's three grep gates all empty/zero
- [x] New boundary guard test in the harness passes (and fails if a zod import is added — verify once by temporarily adding one locally, then reverting)
- [x] ADR-0020 exists; ADR-0001 carries the superseded pointer; wiki type-discipline rewritten; `check:knowledge` green
- [x] `bun run test:unit` + `test:web` + `test:worker` + all per-package typechecks green
- [x] `plans/README.md` status row updated

## STOP conditions

- Step 1 finds zod in a package earlier plans supposedly cleaned.
- An adapter's fixture test fails after migration and the fix would change
  the DTO shape analytics consumes — report the field-level diff instead
  of adapting the fixture.
- A `.coerce`/`.passthrough` semantic can't be reproduced (plan 043's
  semantics tests define "reproduced").
- `bun install` fails to prune zod because some remaining dependency
  requires it as a peer — name the dependency and stop (liche was the known
  zod-carrier; plan 040 removed it).

## Maintenance notes

- The guard test makes the migration self-defending — reviewers of future
  PRs don't need to remember the doctrine.
- ADR-0020 is now the reference for "which schema library" questions;
  package_structure.md's type table is the how-to.
- Deferred: converting `.strict()`-heavy contract structs to
  `Schema.Class` records with methods, and adopting kit schema types
  directly inside sources adapters (touches plan 045's scope) — both are
  polish, not debt.
