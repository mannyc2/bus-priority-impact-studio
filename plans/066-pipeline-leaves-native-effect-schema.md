# Plan 066: Pipeline, analytics, and studio-api on native Effect Schema (last leaves off the shim)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row for
> this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- tools/pipeline-v2/src packages/analytics/src packages/studio-api/src apps/web/test/worker`
> This plan assumes 061 (analytics registry/calibration deleted), 063
> (read-handlers restructured), 064 (ingest consolidated), and 065
> (sources native + `@bp/domain/decode` exists) HAVE LANDED. Verify each
> in `plans/README.md` status; if any is not DONE, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 061, 063, 064, 065 (all hard)
- **Category**: migration (ADR-0020 completion)
- **Planned at**: commit `4c1afe7`, 2026-07-06

## Why this matters

After plan 065, the zod-dialect shim's remaining importers are
tools/pipeline-v2 (the CLI layer re-exports it to every command
descriptor), a handful of analytics contract modules, and two studio-api
files. Two of the shim's live semantic defects bite exactly here: the
pipeline's wiki-record parser and the analytics intervention-records
parser both format validation errors as `issue.path.join(".")` — and the
shim's flattened issues mean every error renders as `<root>`, hiding
which field failed. Migrating these leaves to native Effect Schema (with
the `@bp/domain/decode` helpers from 065) restores real error paths,
deletes the shim-introspection machinery in the CLI, and leaves the shim
with zero importers outside `packages/domain` — the precondition for plan
067 to delete it.

## Current state

Verified 2026-07-06 (pre-061/063/064/065; re-verify counts after they
land — the drift check covers this).

### Importer inventory to migrate

- **tools/pipeline-v2** (12 direct shim importers + the re-export chain):
  - `src/cli/compat.ts` (40 LOC) — re-exports the shim as `z` plus
    `arg.*` coercion helpers and `defineCommand`; ~96 command files
    consume `z` THROUGH this module, so their descriptor schemas
    (`input.options`, `output`) are shim-dialect.
  - `src/cli/options.ts` (154 LOC) — builds `effect/unstable/cli` flags by
    REFLECTING on shim schemas via `getObjectShape`/`getSchemaInfo`
    (`options.ts:1-2`):

    ```ts
    import type * as z from "@bp/domain/schema-compat";
    import { getObjectShape, getSchemaInfo, type ZodType } from "@bp/domain/schema-compat";
    ```

    `buildCliConfig` walks the shape and `buildFlag` switches on
    `info.baseType` (string/number/boolean/array), `info.optional`,
    `info.hasDefault`, `info.defaultValue`, `info.description`
    (`options.ts:32-80`). This is the ONLY structural consumer of the
    shim's WeakMap metadata — replacing it with a native AST walk is this
    plan's keystone.
  - `src/lib/json.ts` — `readJsonArtifact` takes a
    zod-shaped `JsonArtifactSchema<T>` (safeParse interface).
  - `src/lib/mta-wiki-canonical.ts:178-188` — safeParse + issue-path
    formatting (`issue.path.join(".") || "<root>"` — always `<root>`
    today; the live HAZARD-02 bite).
  - The remaining direct importers (d1-inputs, export helpers, local-db
    aggregates, coverage-eval — enumerate with
    `rg -l '@bp/domain/schema-compat' tools/pipeline-v2/src`).
- **packages/analytics** (post-061 survivors; enumerate the same way —
  expected: `data-products/registry.ts` (heaviest), `data-products/completeness.ts`,
  `feature-history/panel-spec` area, `route-speed-availability`):
  includes `interventions/intervention-records.ts:1698-1703`, the second
  live path-flattening bite.
- **packages/studio-api** (2): `contracts/route-spec.ts:1`
  (`import type * as z` — TYPE-ONLY) and `studio/read-handlers.ts`
  (local schemas + projection loads; post-063 shape).
- **`loadStudioProjection`** (`studio/projections.ts:71-109`) calls
  `schema.safeParse(payload)` on domain schemas. Domain schemas are still
  shim-built until 067 — but shim schemas ARE Effect Schema instances, so
  this plan flips the loader to `decodeEitherStrip`-style native decoding
  from `@bp/domain/decode` NOW; it then keeps working unchanged when 067
  swaps the schema definitions underneath.
- **apps/web/test/worker** — worker tests validate server responses with
  domain schemas' shim methods (per the 2026-07-05 log: "Worker tests
  still validate server responses with domain schemas"). Those TEST files
  flip to the decode helpers. (Test-only; the browser bundle stays
  schema-free — ADR-0020.)

### The CLI question you must answer first (Step 1)

`defineCommand` descriptors declare `output: z.object({...})`. Determine
whether output schemas are ever DECODED at runtime
(`rg -n "\.output" tools/pipeline-v2/src/cli`) or are typing/doc only. If
typing-only, migrate them as plain `Schema.Struct` with no decode wiring.
Do the same determination for `input.options` (these ARE decoded — 
`options.ts:62` calls `optionsSchema.parse(rawOptions)`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Pipeline typecheck / tests | `bun --filter @bp/pipeline-v2 typecheck && bun --filter @bp/pipeline-v2 test` | exit 0 / all pass |
| Analytics typecheck / tests | `bun --filter @bp/analytics typecheck && bun --filter @bp/analytics test` | exit 0 / all pass |
| studio-api typecheck / tests | `bun --filter @bp/studio-api typecheck && bun --filter @bp/studio-api test` | exit 0 / all pass |
| Worker + web tests | `bun run test:worker && bun run test:web` | all pass |
| Repo unit tests | `bun run test:unit` | all pass |
| CLI smoke | `bun run pipeline -- --help` and `bun run pipeline -- ingest ace-routes --help` | exit 0; flags render with descriptions/defaults as before |
| Leaf gate | `rg -l "schema-compat" tools/pipeline-v2/src packages/analytics/src packages/studio-api/src apps/web` | no matches |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- CREATE `tools/pipeline-v2/src/cli/schema-introspect.ts` — native AST
  walker producing exactly the fields `buildFlag` needs per struct
  property: property key, base type class (string/number/boolean/array),
  optionality, decoding default (value if declared), description
  annotation. Consult the vendored source (`.repos/effect`, the schema
  AST modules) and the effect-ts skill; unit-test it directly.
- EDIT `src/cli/{compat.ts,options.ts,registry.ts,json-output.ts}` as
  needed: `compat.ts` re-exports native `Schema` (+ keeps `defineCommand`
  and `arg.*` reimplemented natively); `options.ts` consumes
  `schema-introspect.ts`.
- EDIT all command descriptor schemas (mechanical `z.*` → `Schema.*`
  sweep through `commands/**`), the remaining direct pipeline importers,
  `lib/json.ts` (native decode signature), `lib/mta-wiki-canonical.ts`.
- EDIT the surviving analytics shim importers.
- EDIT `packages/studio-api/src/contracts/route-spec.ts` (type-only swap),
  `studio/read-handlers.ts` local schemas, `studio/projections.ts` loader
  decode.
- EDIT `apps/web/test/worker/**` decode call sites (tests only).
- Tests across those packages where issue-format assertions change.
- `knowledge/log.md`, `plans/README.md`.

**Out of scope** (do NOT touch):
- `packages/domain/**` except READING (`schema-compat.ts` deletion and
  domain-internal migration are plan 067)
- `packages/sources/**` (done in 065)
- `apps/web/src/**` (browser stays schema-free; gen-6 owns the UI)
- Command BEHAVIOR (descriptors' option names, defaults, help text, JSON
  output shapes must be byte-compatible — the CLI smoke + registry tests
  pin this)

## Git workflow

- Branch: `codex/066-leaves-native-schema`
- Commit per step and per command-family batch.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Determine output-schema runtime role

Per Current state. Record the answer in the PR description; it sizes the
descriptor sweep.

**Verify**: a one-paragraph note + the grep output.

### Step 2: `schema-introspect.ts` + options.ts port (keystone)

Build the AST walker with its own unit tests (given a
`Schema.Struct({ a: Schema.String, b: Schema.optionalKey(Schema.Number), c: <with default>, d: Schema.Array(...) })`,
it reports the exact tuples `buildFlag` needs). Port `options.ts` to it.
Keep `buildCliConfig`/`parseCliOptions` signatures stable so
`registry.ts` needs minimal edits; `parseCliOptions` swaps
`optionsSchema.parse` for `decodeStrip` from `@bp/domain/decode`.

**Verify**: `bun --filter @bp/pipeline-v2 test` (registry + options
tests), CLI smoke commands show identical help output for two sampled
commands (capture before/after with
`bun run pipeline -- ingest ace-routes --help > /tmp/claude-1000/.../after.txt`
and diff against a pre-change capture you take FIRST).

### Step 3: compat.ts flip + descriptor sweep

Rewrite `compat.ts`: `z` re-export becomes the native `Schema` module
(update the import name in commands to `Schema` — do not alias native
Schema as `z`; the dialect is ending, the name should too), `arg.*`
helpers re-expressed natively, `defineCommand` unchanged in shape. Sweep
`commands/**` per family (audit, backfill, build, …) using the plan-065
mapping table; one commit per family; run that family's tests per commit.

**Verify per family**: pipeline typecheck + that family's tests. After
the sweep: full pipeline suite + registry snapshot unchanged.

### Step 4: lib boundaries + the error-path fixes

`lib/json.ts` `readJsonArtifact` accepts `Schema.Schema<T>` + decodes
natively; `lib/mta-wiki-canonical.ts` moves to `decodeEither*` and its
error formatter now renders REAL paths (delete the `|| "<root>"` crutch —
assert a real path in its test); same treatment for the remaining direct
importers.

**Verify**: pipeline tests; the mta-wiki test asserts a message
containing a real field path.

### Step 5: analytics leaves

Migrate the surviving analytics importers;
`interventions/intervention-records.ts` error formatting gets real paths
(same crutch deletion + test assertion).

**Verify**: analytics typecheck + tests; `test:unit`.

### Step 6: studio-api + worker tests

`route-spec.ts` type-only swap; read-handlers local schemas native;
`loadStudioProjection` decodes via `@bp/domain/decode` (keep the exact
same error Responses and console.error payloads — projection-load
behavior is contract, only the decode mechanism changes);
`apps/web/test/worker` call-site swaps.

**Verify**: studio-api tests, `test:worker` (within 1.5× baseline),
`test:web`, `check:web-architecture`.

### Step 7: Leaf gate + record

Run the leaf gate (table). Log entry + README row.

**Verify**: `rg -l "schema-compat" tools/pipeline-v2/src packages/analytics/src packages/studio-api/src apps/web`
→ no matches; full command table green.

## Test plan

- New: `test/cli/schema-introspect.test.ts` (the walker's contract, incl.
  optional/default/array/description cases).
- Updated: any test asserting zod-style issue text → native messages WITH
  paths (each edit traces to the error-format change; strictly more
  specific assertions than before).
- New assertions: mta-wiki-canonical + intervention-records tests pin
  real error paths (regression net for HAZARD-02).
- Unchanged: registry snapshot, ingest fixtures, api-facade suite — these
  passing without edits is the parity proof.

## Done criteria

- [ ] Leaf gate empty (only `packages/domain` still references
      schema-compat, internally)
- [ ] `getObjectShape`/`getSchemaInfo` have zero importers
      (`rg -n "getObjectShape|getSchemaInfo" --glob '!packages/domain/src/schema-compat.ts'` → none)
- [ ] CLI help output diff for 2 sampled commands: empty
- [ ] Error paths render in wiki-canonical + intervention-records tests
- [ ] Full command table green; worker time within 1.5× baseline
- [ ] Log entry + README row updated; `git status` clean outside scope

## STOP conditions

Stop and report back (do not improvise) if:

- The AST walk cannot recover a datum `buildFlag` needs (e.g. decoding
  defaults are not introspectable on `effect@4.0.0-beta.92`) — cite the
  vendored source; the fallback (explicit per-command flag metadata) is
  an operator decision, not an improvisation.
- Any dependency plan (061/063/064/065) is not DONE at start.
- CLI help/JSON output diffs are non-empty after Step 3 for reasons you
  cannot trace to whitespace.
- The descriptor sweep surfaces a shim feature with no mapping-table
  entry (report the file and feature).

## Maintenance notes

- After this plan, plan 067 deletes the shim and adds the repo-wide
  module-specifier gate; until then nothing new may import schema-compat
  (reviewers watch for it).
- `schema-introspect.ts` is the one module coupled to Effect's AST
  internals on a beta line — pin its unit tests tightly so an Effect
  version bump fails loudly there, not in flag parsing.
- The `arg.*` helpers and `defineCommand` remain a thin local layer over
  `effect/unstable/cli` by design (plan-040 decision); replacing them
  per-command with raw `Command.make` was considered and rejected as
  churn (see gen-7 README rejected list).
