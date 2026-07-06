# Plan 043: Prune packages/domain and migrate it — and its parse sites — to Effect Schema

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- packages/domain packages/studio-api/src packages/analytics/src`
> Gen-4 plans 030-032 and plans 041/042 land first by design — expect drift
> there. What must MATCH the excerpts below: the zod patterns inside
> `packages/domain/src` (primitives/schema-registry). Mismatch there = STOP.

## Status

- **Priority**: P1 (the schema-unification centerpiece)
- **Effort**: L
- **Risk**: MED-HIGH (touches every schema contract; mitigated by
  characterization tests written BEFORE migrating, name-stable exports, and
  the api-facade/worker suites)
- **Depends on**: plans/041 (db exports derived types; db no longer imports
  domain validation), plans/042 (web imports domain TYPES only), gen-4
  plans 030-032 DONE (serving contract stable, tests authoritative)
- **Category**: migration / tech-debt
- **Planned at**: commit `ce3baca`, 2026-07-04
- **Completed**: 2026-07-05

## Completion notes

Plan 043 is DONE. The dead document subtrees and dead `./schema-registry`
subpath were pruned, `packages/domain` now runs on an Effect Schema-backed
compatibility facade, and the live domain public type exports stayed stable.
`packages/domain/package.json` now depends on `effect` and no longer
declares `zod`; `rg -n 'from "zod"|from '\''zod'\''|"zod"|zod'
packages/domain/src packages/domain/test packages/domain/package.json`
returns no matches.

Downstream parse sites that treated domain schemas/codecs as native zod
were re-pointed to the schema facade or to `RouteIdCodec.parse(...)` in
`studio-api`, `analytics`, `packages/sources` MTA/GTFS-RT adapters, and
`tools/pipeline-v2/src/lib/json.ts`. `apps/web/src` remains free of
Effect imports (`rg -n 'from "effect"|from '\''effect'\''|@effect/'
apps/web/src` returns no matches).

Verification after the final formatting pass:

- `bun run check:types` passed.
- `bun run test:unit` passed (662 tests).
- `bun run test:web` passed (114 tests).
- `bun run test:worker` passed (19 tests; 6.09s in the final run).
- `bun run check:web-architecture` passed (19 tests).
- `bun run check:knowledge` passed.
- `git diff --check` passed.
- Package checks passed during the migration: `@bp/domain` test (65),
  `@bp/analytics` typecheck/test (242), `@bp/sources` typecheck/test (34),
  `@bp/studio-api` typecheck/test (52), `@bp/pipeline-v2` typecheck/test
  (200), and `@bp/web` typecheck.
- Full `bun run check:style` was not made green because Biome traverses the
  vendored `.agent-sources/effect` checkout and reports thousands of
  formatting diagnostics there. Targeted Biome over the Plan 043 touched
  files exits 0 after safe formatting/import fixes; it only reports
  info-level `useLiteralKeys` suggestions in
  `packages/analytics/src/interventions/intervention-records.ts`.

Remaining zod inventory for Plan 044 is leaf-owned local schemas, not
domain runtime contracts: `packages/sources` adapters/probes/core schemas;
`tools/pipeline-v2` CLI compatibility/options, local aggregate readers,
export command schemas, Socrata catalog and MTA-wiki canonical helpers;
`packages/analytics` feature-history/data-product schemas; and
`packages/studio-api` route-spec/read-handler local schemas.

## Why this matters

The repo runs two schema libraries. Domain contracts are zod; the pipeline
runtime, the nyc-transit-kit, and the repo's stated direction are Effect.
The gen-4 incident class (plans 030-035) grew exactly in that seam —
loose-load on one side, strict-compose on the other, with two libraries'
worth of semantics to reconcile. The operator's direction (2026-07-04) is
to remove zod entirely and standardize on Effect Schema (v4, installed:
`effect@4.0.0-beta.92`). `packages/domain` is where the schemas live
(12,966 LOC, 27 zod-importing files), so it is the pivot of the whole
migration: after this plan, every remaining zod usage in the repo
(sources/pipeline, plan 044) is a leaf.

A June 2026 audit rejected this same migration as "LOC-neutral churn" —
that record is superseded by operator direction, and the LOC math changed:
2,462 LOC of `documents/*` subtrees are now dead (their Tier 2 consumers
were deleted 2026-07-03), so pruning-then-migrating is smaller than the
June estimate, and the zod-feature audit (2026-07-04) found ZERO uses of
the hard-to-migrate APIs (`.transform(`, `.refine(`, `.default(`,
`.catch(`, `z.lazy`, `z.custom`) anywhere in the repo. What exists is
mechanical volume: `.strict()` ×434, `.coerce` ×158, `.passthrough()` ×98,
`z.enum` ×248, brands ×20, one `z.codec`, one registry, one
`z.toJSONSchema` call.

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**Dead subtrees (prune first — do not migrate corpses):** external
importer counts, verified repo-wide:

| domain subpath | LOC | external importers |
|---|---|---|
| documents/derived-surfaces | 346 | 0 |
| documents/discovery | 318 | 0 |
| documents/research-surfaces | 1,220 | 0 |
| documents/structured-extraction | 578 | 0 |

Their domain tests: `packages/domain/test/document-discovery.test.ts`,
`document-research-surfaces.test.ts`, `document-structured-extraction.test.ts`.
(KEEP `document-operational-date.test.ts` — operational-date is live.)

**Live domain surface** (external importer file counts): primitives 36,
findings 29, studio 27, maps 15, routes 10, json-schema 3 (all in
studio-api after plan 036), documents-root 5, documents/candidates 2,
documents/intervention-records 3, documents/operational-date 2,
schema-registry 0 external (domain-internal only).

**The registry pattern** — `packages/domain/src/schema-registry.ts` (~40
LOC): `projectSchemaRegistry = z.registry<ProjectSchemaMeta>()`;
`registerProjectSchema(schema, {id,title,description,stability})` attaches
`.meta(...)` and registers; `toProjectJsonSchema(schema)` calls
`z.toJSONSchema(schema, { metadata: z.globalRegistry, target:
"draft-2020-12", unrepresentable: "throw" })`. Consumers of the JSON-schema
output: `packages/studio-api/src/schema-routes.ts` and
`packages/studio-api/src/contracts/openapi.ts` (291 LOC).

**Primitives exemplar** — `packages/domain/src/primitives/index.ts`:

```ts
export const RouteIdSchema = registerProjectSchema(
  z.string().min(1).max(12).regex(/^[A-Z][A-Z0-9+-]*$/).brand<"RouteId">(),
  { id: "bp.route_id", ... });
export type RouteId = z.output<typeof RouteIdSchema>;
export const RouteIdCodec = z.codec(z.string(), RouteIdSchema, {
  decode: (value) => RouteIdSchema.parse(value.trim().toUpperCase()),
  encode: (value) => value,
});
```

**Effect v4 target idioms** (consult `.repos/effect/packages/effect/src/`
— `Schema.ts`, `JsonSchema.ts` — and the effect-ts skill; the repo already
uses v4 Schema in `tools/pipeline-v2/src/effect/errors.ts`:
`Schema.TaggedErrorClass`, `Schema.Defect()`):
- `import { Schema } from "effect"` — same import the pipeline uses.
- Brand: `Schema.String.pipe(Schema.brand("RouteId"))`; type:
  `typeof RouteIdSchema.Type`.
- Enum-of-strings: `Schema.Literals([...])`.
- Struct: `Schema.Struct({...})` — v4 structs are immutable-typed
  (`.readonly()` becomes free) and reject/strip semantics differ from zod;
  step 1's characterization tests pin the required behavior per contract.
- Codec/normalization: `Schema.transform` (or the v4 transformation API —
  verify exact name in the vendored source).
- JSON Schema: the core `JsonSchema` module (`JsonSchema.js` confirmed
  present in the installed dist) replaces `z.toJSONSchema`.
- Annotations replace `.meta(...)` + registry.

**Consumer parse sites to re-point in the same change** (they import domain
schema VALUES): `packages/studio-api/src/public-api.ts`,
`src/studio/projections.ts`, `src/studio/read-handlers.ts`,
`src/contracts/route-spec.ts` (the 4 zod-importing studio-api files);
`packages/analytics` (5 src files: feature-history/express-route-analysis.ts,
feature-history/panel-spec.ts, evaluation/route-speed-availability.ts,
data-products/registry.ts, data-products/completeness.ts + 1 test);
`tools/pipeline-v2` files that parse domain schemas (subset of its 11 zod
files — step 5 enumerates; the rest are plan 044's).

**What plan 042 guaranteed**: `apps/web` imports domain TYPES only — no
schema values reach the browser. Keep it that way; type names must not
change.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck domain | `bun --filter @bp/domain typecheck` | exit 0 |
| Domain tests | `bun --filter @bp/domain test` | all pass |
| Per-consumer typecheck | `bun --filter @bp/{analytics,studio-api,pipeline-v2,web} typecheck` | exit 0 each |
| Consumer tests | `bun --filter @bp/analytics test && bun --filter @bp/studio-api test && bun --filter @bp/pipeline-v2 test` | all pass |
| Worker tests (+ timing) | `time bun run test:worker` | all pass; wall time recorded |
| Web build | `bun --filter @bp/web build` | exit 0, budget passes |
| Full unit | `bun run test:unit` | all pass |

## Suggested executor toolkit

- The effect-ts skill (v4) if available — sections on Schema.Class/branded
  types and schema decisions.
- Vendored Effect source: `.repos/effect/packages/effect/src/Schema.ts`,
  `JsonSchema.ts`, `SchemaTransformation.ts`. Trust it over memory; this is
  a beta line and APIs move.

## Scope

**In scope**:
- `packages/domain/**` (src, test, package.json — adds
  `"effect": "catalog:"`, drops `"zod": "catalog:"`, prunes `exports` map
  entries for deleted subtrees)
- Parse-site edits in `packages/analytics/src+test`,
  `packages/studio-api/src+test`, and the domain-schema-consuming subset of
  `tools/pipeline-v2/src`
- `packages/studio-api/src/contracts/openapi.ts` + `schema-routes.ts`
  (JsonSchema source swap)
- `tests/harness/production-boundaries.test.ts` — ONLY if the domain
  forbidden-import list needs `effect` explicitly allowed (it does not:
  the list is cloudflare/@bp-*/react/fs/node: — verify, don't edit)

**Out of scope**:
- `apps/web/src` beyond type-name compatibility (must compile with ZERO
  edits; if a type name would have to change, adjust the domain side).
- `packages/db` (zod-free after 041; its `$infer` exports are inputs here).
- sources/pipeline-owned schemas (plan 044).
- Renaming public API fields, changing response shapes, "improving"
  contracts. Byte-identical serving behavior is the bar.

## Git workflow

- Branch: `plan/043-domain-effect-schema`; commit per step (prune /
  registry / per-subtree / consumers / eviction). No push unless asked.

## Steps

### Step 1: Characterization tests for parse semantics (BEFORE any migration)

The migration's only real hazard is semantic drift on three axes. Write
`packages/domain/test/schema-semantics.test.ts` pinning current behavior
for a representative schema of each kind (pick from primitives/routes):
1. **Unknown-key handling**: a `.strict()` contract rejects extra keys; a
   `.passthrough()` DTO keeps them; a default `z.object` strips them. Test
   all three against the CURRENT zod schemas, so the Effect versions must
   reproduce each (Effect Struct default ≠ zod default — the executor finds
   the v4 option/annotation that matches each case and the test proves it).
2. **Brand + normalization**: `RouteIdSchema` rejects lowercase;
   `RouteIdCodec` decode trims + uppercases then validates.
3. **Coercion**: one `.coerce`-using schema (find via
   `rg -n "\.coerce" packages/domain/src`) — string-number inputs decode
   identically.
Write the tests against the SCHEMA MODULE'S EXPORTS (not zod directly), so
they survive the swap and become the migration's proof.

**Verify**: new tests pass against current zod implementations.

### Step 2: Prune the dead subtrees

Delete `packages/domain/src/documents/{derived-surfaces,discovery,research-surfaces,structured-extraction}/`,
their three test files, their re-export blocks in
`packages/domain/src/documents/index.ts`, and their `exports` entries in
`packages/domain/package.json`
(`./documents/derived-surfaces`, `./documents/discovery`,
`./documents/research-surfaces`, `./documents/structured-extraction`).
Update `packages/domain/test/package-shape.test.ts` if it asserts those
subpaths. Re-prove each with
`rg -l "@bp/domain/documents/<name>" apps packages tools tests --glob '!node_modules'`
→ empty before deleting.

**Verify**: `bun --filter @bp/domain typecheck && bun --filter @bp/domain
test` green; all consumer typechecks green (they never imported these).

### Step 3: Reimplement the registry on Effect, keeping its API

Housekeeping first: `packages/domain/src/schema-registry/` (a 5-line
re-export STUB directory, distinct from the sibling `schema-registry.ts`
file that holds the real implementation) has zero code importers — its
`@bp/domain/schema-registry` subpath is referenced only by
`packages/domain/README.md` (verified 2026-07-04). Delete the stub dir,
its `./schema-registry` entry in `packages/domain/package.json` exports,
and fix the README mention.

Then rewrite `schema-registry.ts` with the SAME exported names/signatures:
`registerProjectSchema(schema, meta)` attaches Effect annotations
(identifier/title/description + the custom meta) and records into a plain
`Map`; `toProjectJsonSchema(schema)` uses the effect `JsonSchema` module
with draft-2020-12 output (the module's exact make/target API: read
`.repos/effect/packages/effect/src/JsonSchema.ts`). Note the consumption
shape: `openapi.ts` does NOT call zod itself — it assembles the OpenAPI
document from PRE-GENERATED `*JsonSchema` values imported from
`@bp/domain/json-schema` (openapi.ts lines 1-15). So the swap point is the
domain-side generation only; openapi.ts's assembly code should need no
structural change. Then regenerate what
`packages/studio-api/src/contracts/openapi.ts` and `schema-routes.ts`
serve, and snapshot-compare: capture the openapi JSON BEFORE the migration
(`bun`-run whatever currently builds it — read openapi.ts's usage first;
if it is only served via a worker route, capture via the worker test) and
diff after. Structural differences (key ordering, `$defs` layout) are
acceptable IF the studio-api tests that touch these routes still pass;
semantic differences (types, required fields, enum values) are a STOP.

**Verify**: openapi/schema-routes diff reviewed and recorded in PR notes;
`bun --filter @bp/studio-api test` green.

### Step 4: Migrate domain subtree-by-subtree (leaf-first)

Order: `primitives` → `routes` → `maps` → `documents` (live parts) →
`findings` → `studio` (largest, 3,402 LOC) → delete `json-schema/`'s zod
usage last (it re-exports generated JSON schemas — regenerate via the new
`toProjectJsonSchema`).

Fixed recipe per file (keep every exported NAME identical):
- `z.object({...}).strict().readonly()` → `Schema.Struct({...})` + the
  strict-decode option proven in step 1; `.readonly()` disappears (v4
  types are readonly).
- `z.enum([...])` → `Schema.Literals([...])`.
- `z.string().min(1)` etc → `Schema.String.pipe(...)` checks (exact check
  API from the vendored source).
- `.brand<"X">()` → `Schema.brand("X")`; `export type X =
  z.output<typeof XSchema>` → `export type X = typeof XSchema.Type`.
- `z.union`/`z.discriminatedUnion` → `Schema.Union([...])` (v4 takes an
  array; discrimination is structural).
- `z.codec` (RouteIdCodec only) → `Schema.transform` equivalent with the
  same trim/uppercase decode.
- `registerProjectSchema(...)` wrapper calls stay textually identical.
After each subtree: run the step-1 semantics tests + the subtree's own
tests + `bun --filter @bp/domain typecheck`.

Note on db-derived types: where a domain type exists ONLY to mirror a DB
row for internal plumbing, replace its body with the plan-041 `$infer`
export (`import type { XSelect } from "@bp/db/..."` is FORBIDDEN in domain
— domain imports nothing local; instead DELETE the domain copy and re-point
its consumers at `@bp/db`'s type). Public API contract schemas stay in
domain even when they resemble a table — serving contracts version
independently of storage. Expected candidates (from the 041 audit):
`StudioRouteSectionRow`-style types; evaluate each, move only true
storage-mirrors, list the moves in the PR notes.

**Verify per subtree** (gate): domain typecheck + domain tests + semantics
tests green.

### Step 5: Re-point every consumer parse site

Enumerate: `rg -n "\.parse\(|safeParse" packages/analytics/src packages/studio-api/src tools/pipeline-v2/src --glob '!node_modules' | rg -v "JSON.parse"` — for each hit on a DOMAIN schema:
- `X.parse(v)` → `Schema.decodeUnknownSync(X)(v)` (same throw-on-bad
  posture) — used where current behavior throws.
- `X.safeParse(v)` + success-check → `Schema.decodeUnknownEither(X)(v)`
  with the same branch structure (read-handlers' parse-or-skip degrade
  paths from plans 030/#57/#58 must keep their exact skip semantics — the
  api-facade tests are the oracle).
- Type-only uses: no change (names preserved).
Pipeline files whose zod is NOT a domain schema stay for plan 044 — list
them in the PR notes as the 044 inventory.

**Verify**: all consumer typechecks + test suites green;
`time bun run test:worker` wall time within ~1.5x of the pre-plan
recording (record both).

### Step 6: Evict zod from domain and gate

`packages/domain/package.json`: remove zod, keep `"effect": "catalog:"`
(added in step 3). `bun install`.

**Verify**:
- `rg -l "from \"zod\"|from 'zod'" packages/domain packages/analytics/src packages/studio-api/src` → empty (analytics/studio-api zod was all domain-schema usage; if a file legitimately keeps zod for a non-domain schema, it belongs to plan 044 — list it)
- `bun run test:unit` + `test:web` + `test:worker` + `bun --filter @bp/web build` → all green
- `rg 'from "effect"' apps/web/src` → empty (Effect stayed out of the browser)
- `bun run check:web-architecture` → all pass

## Test plan

- Step 1's `schema-semantics.test.ts` is the migration's centerpiece —
  written first, passing before AND after.
- Existing suites are the contract oracle: domain tests (schemas.test.ts,
  map-schemas.test.ts, studio-*), analytics tests, studio-api
  `api-facade.test.ts` (incl. gen-4 degrade behaviors), worker tests.
- Add one decode test per LIVE documents subpath (candidates,
  intervention-records, operational-date) if not already covered — cheap
  insurance on the less-tested corners.

## Done criteria

- [ ] `packages/domain` has zero zod imports and `effect` as its only runtime dep; all exported type/value NAMES unchanged (verify: `bun --filter @bp/web typecheck` passes with ZERO web edits)
- [ ] Dead documents subtrees deleted (−2,462 LOC + tests); package.json exports pruned
- [ ] `schema-semantics.test.ts` passes; strict/passthrough/brand/coerce semantics proven equal
- [ ] OpenAPI/schema-routes output diff reviewed; studio-api + worker tests green
- [ ] `test:worker` wall time recorded before/after, within ~1.5x
- [ ] `bun run test:unit` green; `rg 'from "effect"' apps/web/src` empty
- [ ] `plans/README.md` status row updated; PR notes carry the 044 leftover-zod inventory

## STOP conditions

- Step 1: you cannot make Effect Struct reproduce one of the three
  unknown-key behaviors — report the exact semantic gap before migrating
  anything.
- Step 3: JSON-schema generation in effect beta.92 cannot express something
  the OpenAPI doc needs (e.g. a pattern/format zod emitted) — report with
  the before/after diff.
- Step 5: an api-facade test fails and the fix would CHANGE serving
  behavior rather than reproduce it.
- Worker test wall time exceeds 2x baseline (plan-026 precedent — sync
  decode should not do this; if it does, something structural is wrong).
- Any step needs an `apps/web/src` edit beyond zero.

## Maintenance notes

- New contracts: define with Effect Schema + `registerProjectSchema` as
  before; ADR-0020 (authored in plan 044) records the doctrine.
- The June-2026 "zod stays (ADR-0001/0019)" record is superseded here —
  plan 044 updates the ADRs; until then this plan's PR description is the
  authority.
- Watch in review: exported names (the whole plan's compatibility story),
  and that no `Schema.decodeUnknownSync` landed on a hot loop that
  previously parsed once (parse counts should be unchanged, only the
  library swapped).
- Follow-up explicitly deferred: converting domain records to
  `Schema.Class` with methods (nice, not necessary; Struct-shaped
  migration is the low-risk path).
