# Plan 065: packages/sources on native Effect Schema (first leaf off the zod-dialect shim)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row for
> this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- packages/sources packages/domain/src/schema-compat.ts packages/domain/package.json`
> Compare the "Current state" excerpts against the live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: none hard; land before plan 066 (pipeline imports these
  schemas) and before 067 (shim deletion needs zero importers)
- **Category**: migration (ADR-0020 completion)
- **Planned at**: commit `4c1afe7`, 2026-07-06

## Why this matters

ADR-0020 declared Effect Schema the only runtime schema layer and
explicitly labels the zod-shaped compatibility surface "migration
scaffolding over Effect Schema, not permission to reintroduce Zod". The
scaffolding — `packages/domain/src/schema-compat.ts`, a 663-LOC zod-API
emulator — is still what 43 files write schemas against, and it carries
real semantic hazards: `safeParse` flattens every error to a single
path-less message, object strictness lives in WeakMaps that silently
revert to strip across `.extend()`, brands collapse to one runtime
identity, and `discriminatedUnion` ignores its discriminator.
`packages/sources` is the biggest and most uniform importer (24 files,
almost entirely strict-object/coerce/enum usage), so it goes first: this
plan establishes the native idioms and the shared decode helpers that
plans 066-067 reuse, and proves the migration on fixture-tested code.

## Current state

### The shim and its dialect

`packages/domain/src/schema-compat.ts` builds every schema on real Effect
v4 primitives and then bolts a zod API onto them. **That file is your
Rosetta stone**: for every dialect feature, its implementation names the
exact native call to use. Verified mappings (line refs into the shim):

| Shim dialect | Native Effect v4 (per the shim's own implementation) |
|---|---|
| `z.object({...})` | `Schema.Struct({...})`; optional/default fields wrapped `Schema.optionalKey(...)` (shim :522-540) |
| `.strict()` / `.passthrough()` / strip | NOT schema state — decode options `{ onExcessProperty: "error" \| "preserve" \| "ignore" }` (shim :128-133). Becomes explicit at the decode call via the new helpers below |
| `z.string().min(n)/.max(n)/.regex(r)` | `Schema.String.check(Schema.isMinLength(n))` / `isMaxLength` / `isPattern` (shim :320-347) |
| `z.number().int()/.min()/.nonnegative()` | `Schema.Number.check(Schema.isInt())` / `isGreaterThanOrEqualTo` … (shim :351-372) |
| `z.enum([...])` | `Schema.Literals([...])` (shim :488-500) |
| `z.literal(v)` / `.nullable()` / `.optional()` | `Schema.Literal(v)` / `Schema.NullOr(s)` / `Schema.optionalKey(s)` in struct position |
| `.default(v)` | `s.pipe(Schema.withDecodingDefaultType(Effect.succeed(v)))` (shim :252-263) |
| `z.coerce.number()/string()/boolean()` | a decode transformation (shim implements via preprocess+transform :576-608); check the vendored source for `Schema.FiniteFromString`-style built-ins before hand-rolling |
| `.transform(f)` / `z.codec(...)` | `Schema.decodeTo(target, { decode: SchemaGetter.transform(...), encode: ... })` (shim :264-277, :610-629) |
| `z.union([...])` / `z.discriminatedUnion(k, ms)` | `Schema.Union(ms)`; verify from vendored source how v4 fast-paths literal-tag members — the semantic REQUIREMENT is that members carry their literal tag field and mismatches produce member-accurate errors |
| `.describe(d)` / `.meta(m)` | `.annotate({ description: d })` / `.annotate(m)` |
| `z.iso.datetime()` / `z.url()` | `Schema.String.check(Schema.isPattern(<copy the shim's exact regex, :339-347 and :472-476>))` |
| `.parse(x)` / `.safeParse(x)` | the new decode helpers below |
| type `z.output<S>` / `z.input<S>` | `typeof S.Type` / `typeof S.Encoded` |

Ground every uncertain API against the vendored Effect source at
`.repos/effect` and the effect-ts skill at
`/home/cjpher/.codex/skills/effect-ts/` — do NOT trust memory of pre-v4
APIs.

### Sources' usage shape (why this package is mechanical)

24 files import the shim (`rg -l '@bp/domain/schema-compat' packages/sources/src`):
18 adapters under `adapters/{mta,nyc-dot,nyc-open-data,census}/`, plus
`core/socrata.ts`, `core/schemas/version.ts`, `probes/socrata-probe.ts`,
`probes/contracts.ts`, `registry/manifest.ts`, `gtfs-realtime/index.ts`.
Representative adapter head (`adapters/mta/bus-speeds.ts:1-15`):

```ts
import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "@bp/domain/schema-compat";
...
export const NormalizedSegmentSpeedSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    isoMonth: IsoMonthStringSchema,
    ...
```

`core/schemas/version.ts:1-4` defines the shared
`IsoMonthStringSchema = z.string().regex(/^\d{4}-\d{2}$/)`.
`registry/manifest.ts` holds the one `z.discriminatedUnion("type", [...])`
whose members deliberately mix `.strict()` and `.passthrough()` modes —
when migrating, give ALL members the same decode policy and document the
choice (the mixed modes were an accident of the shim, not a decision).

**Cross-package embedding fact**: domain schemas like `RouteIdCodec` are
shim-built but ARE real Effect Schema instances (`ZodType<T> extends
Schema.Schema<T>`, shim :32), so embedding them inside native
`Schema.Struct` fields is expected to typecheck and decode. Step 2 proves
this on one adapter before the sweep.

### Strict vs permissive is now an explicit decision

Current counts: `.strict()` ×32, `.passthrough()` ×22 in sources. The
migration rule: **raw upstream row schemas keep permissive decoding**
(tolerating Socrata column additions is deliberate); **normalized output
schemas decode strict** (our own shapes admit no unknown fields). Where a
`.passthrough()` sat on a NORMALIZED shape, tighten it to strict and note
it in the PR description (behavior change, covered by fixture tests).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Sources typecheck | `bun --filter @bp/sources typecheck` | exit 0 |
| Sources tests | `bun --filter @bp/sources test` | all pass |
| Domain typecheck | `bun --filter @bp/domain typecheck` | exit 0 |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Repo unit tests | `bun run test:unit` | all pass |
| Shim-free gate | `rg -l "schema-compat" packages/sources/src` | no matches |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- CREATE `packages/domain/src/decode.ts` + export `"./decode"` from
  `packages/domain/package.json` — the ONLY new abstraction, ~20 LOC,
  native-only, no shim import:
  `decodeStrict(schema)(input)` (onExcessProperty:"error"),
  `decodeStrip(schema)(input)` ("ignore"),
  `decodePreserve(schema)(input)` ("preserve"), each returning the decoded
  value or throwing the native ParseError (path-preserving), plus
  `decodeEither*` variants for callers that branch. No chaining API, no
  metadata, no classes — this is a decode-options convention, not a shim.
- EDIT all 24 shim-importing files in `packages/sources/src`
- EDIT `packages/sources/test/**` where error-message/shape assertions
  reference shim issue formats
- EDIT external call sites in `tools/pipeline-v2/src` ONLY where they
  invoke `.parse(`/`.safeParse(` on a schema exported by
  `packages/sources` (method-call swap to the decode helpers; find them
  with `rg -n "Schema\.parse|\.safeParse\(" tools/pipeline-v2/src`
  cross-referenced against sources' exported schema names). No other
  pipeline edits.
- `knowledge/log.md`, `plans/README.md`

**Out of scope** (do NOT touch):
- `packages/domain/src/schema-compat.ts` itself (deleted in 067)
- Every other shim importer (analytics/pipeline/studio-api — plan 066)
- Adapter NORMALIZATION LOGIC (field mappings stay byte-identical; only
  the schema dialect changes)
- `@nyc-transit-kit` usage (ADR-0021 already settled it)

## Git workflow

- Branch: `codex/065-sources-native-schema`
- Commit per step / adapter batch; short imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The decode helpers

Create `packages/domain/src/decode.ts` + the package export. Unit-test it
in `packages/domain/test/decode.test.ts`: strict rejects unknown keys,
strip drops them, preserve keeps them, and a nested failure's message
CONTAINS the field path (this is the HAZARD-02 fix — the shim's flattened
`path: []` must not be replicated).

**Verify**: `bun --filter @bp/domain typecheck && bun --filter @bp/domain test` → pass.

### Step 2: Prove the pattern on one adapter

Migrate `core/schemas/version.ts` and `adapters/mta/ace.ts` (small,
fixture-tested via pipeline ace tests). This proves: native Struct
embedding of shim-built domain schemas (`RouteIdCodec`), the coerce
mapping, and the strict-normalized/permissive-raw rule.

**Verify**: sources + pipeline typechecks pass; `bun run test:unit`
passes (ace fixture tests among them).

### Step 3: Sweep the adapters

Migrate the remaining adapters in commits of 4-6 files, mechanical per
the mapping table. Then `core/socrata.ts`, `probes/contracts.ts`,
`probes/socrata-probe.ts`, `gtfs-realtime/index.ts`.

**Verify after each commit**: sources typecheck + tests.

### Step 4: The manifest union

Migrate `registry/manifest.ts`: members become native Structs with their
literal `type` field; unify decode policy across members (strict);
add/extend a test that a payload matching member B's tag but member A's
body errors with a member-accurate message.

**Verify**: sources tests pass, incl. the new union test.

### Step 5: External call-site swap + gates

Do the scoped pipeline method-call swaps. Run the full command table
including the shim-free gate.

**Verify**: all green; `rg -l "schema-compat" packages/sources/src` →
empty; log entry + README row written.

## Test plan

Existing sources fixture tests are the parity net (do not weaken an
assertion to make it pass — an assertion change must trace to the
declared strict-tightening or error-format change, noted per file). New
tests: `domain/test/decode.test.ts` (Step 1) and the manifest
union-mismatch test (Step 4). Error-message assertions that referenced
zod-style issue text get updated to assert on the native message
INCLUDING its path segment — strictly more informative than before.

## Done criteria

- [ ] `rg -l "schema-compat" packages/sources/src` → no matches
- [ ] `@bp/domain/decode` exists, tested, path-preserving
- [ ] All sources tests pass; pipeline typecheck passes; `test:unit` green
- [ ] Normalized-output schemas decode strict; raw-row schemas documented
      permissive (grep the diff: no `.passthrough`-equivalent left on a
      `Normalized*Schema`)
- [ ] No normalization-logic diffs (spot-check 3 adapters: only
      schema-declaration hunks)
- [ ] Style clean; log entry + README row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Embedding a shim-built domain schema (e.g. `RouteIdCodec`) in a native
  `Schema.Struct` fails to typecheck or decode in Step 2 — the
  cross-compat assumption underpins the whole leaf-first ordering; do not
  hand-cast around it.
- A required native API (Struct/Literals/check filters/decode options/
  Union tag behavior) does not exist or behaves differently in the
  installed `effect@4.0.0-beta.92` than the shim's usage implies — cite
  the vendored source file you checked.
- A fixture test fails in a way NOT explained by strict-tightening or
  error-format changes (means a normalization behavior drifted).
- You find yourself editing more than ~10 lines in any single
  pipeline-v2 file (the external swap should be surgical).

## Maintenance notes

- Plans 066/067 assume the decode helpers and the mapping table above are
  now the repo idiom; new sources code must not import schema-compat
  (production-boundaries gains the hard gate in 067).
- The strict-vs-permissive rule (raw permissive, normalized strict) is
  the durable decision — record it in the ADR-0020 addendum that plan 067
  writes.
- Reviewer should scrutinize: the manifest union member policies, any
  test-assertion edits, and that `decode.ts` stayed ~20 LOC (it must not
  grow a chaining API — that would be rebuilding the shim).
