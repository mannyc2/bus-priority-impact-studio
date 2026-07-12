# Plan 067: packages/domain native — real brands, real unions, delete the shim, close the gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row for
> this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- packages/domain tests/harness/production-boundaries.test.ts`
> This plan assumes 065 and 066 are DONE (check `plans/README.md`): the
> leaf gate must already hold —
> `rg -l "schema-compat" apps packages tools --glob '!packages/domain/**'`
> returns nothing. If it returns anything, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 065, 066 (hard); 061 recommended (smaller findings
  surface)
- **Category**: migration (ADR-0020 completion) + weak invariants
- **Planned at**: commit `4c1afe7`, 2026-07-06

## Why this matters

This is the payoff step: with every leaf package native, the 663-LOC
zod-API emulator (`schema-compat.ts`) has zero external importers and can
be deleted — taking with it the WeakMap metadata machinery, the
`as unknown as` casts, and three semantic hazards that currently make
domain contracts WEAKER than they look: every `.brand<"X">()` collapses
to one runtime identity `"DomainBrand"` (shim :305 hardcodes it), object
strictness silently reverts across `.extend()` chains, and
`discriminatedUnion` ignores its discriminator. After this plan, domain
contracts are plain Effect v4 values — brands are real per-type brands,
unions discriminate, decode strictness is explicit at each boundary —
and a harness gate makes reintroducing the dialect unrepresentable, the
same way the existing zod gate does.

## Current state

### Module map (all shim-dialect today)

| Module | LOC | Notes |
|---|---|---|
| `src/primitives/index.ts` | 125 | branded RouteId/DirectionId/IsoMonth + `RouteIdCodec` (the repo's one codec) |
| `src/routes/index.ts` | 375 | scorecard/release/route-list contracts |
| `src/maps/index.ts` | 149 | map manifest + segment features |
| `src/findings/index.ts` | 1,818 | detector/evidence/review schemas; post-061 its external consumers are analytics `core/` + `features/route-month` — Step 5 measures what is still referenced |
| `src/studio/**` | 3,413 | serving contracts (snapshot/routes/evidence/insights/…) |
| `src/documents/**` | 1,825 | candidates, intervention-records, operational-date (live pipeline contracts) |
| `src/json-schema/index.ts` | 84 | pre-computed JSON Schemas for studio-api's `/api/schema/*` + OpenAPI |
| `src/schema-registry.ts` | 32 | Map registry + metadata annotate (excerpt below) |
| `src/schema-compat.ts` | 663 | DELETE at the end |
| `src/decode.ts` | ~20 | created by plan 065; STAYS (it is native) |

`src/primitives/index.ts:4-24` (the pattern to convert everywhere):

```ts
export const RouteIdSchema = registerProjectSchema(
  z.string().min(1).max(12).regex(/^[A-Z][A-Z0-9+-]*$/).brand<"RouteId">(),
  { id: "bp.route_id", title: "Route ID", description: "...", stability: "draft" },
);
export type RouteId = z.output<typeof RouteIdSchema>;
export const RouteIdCodec = z.codec(z.string(), RouteIdSchema, {
  decode: (value) => RouteIdSchema.parse(value.trim().toUpperCase()),
  encode: (value) => value,
});
```

Native target shape (mapping table in plan 065 applies; the shim's own
implementation is still the Rosetta stone until you delete it):

```ts
export const RouteIdSchema = registerProjectSchema(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(12),
    Schema.isPattern(/^[A-Z][A-Z0-9+-]*$/)).pipe(Schema.brand("RouteId")),
  { id: "bp.route_id", ... },
);
export type RouteId = typeof RouteIdSchema.Type;
// RouteIdCodec: Schema.String.pipe(Schema.decodeTo(RouteIdSchema, {
//   decode: SchemaGetter.transform(v => decodeStrict(RouteIdSchema)(v.trim().toUpperCase())-shaped),
//   encode: SchemaGetter.transform(v => v) }))  ← follow shim :610-629's codec impl
```

`src/schema-registry.ts` (32 LOC, full file read 2026-07-06): keyed
`Map<ZodType, ProjectSchemaMeta>`; `registerProjectSchema` calls
`schema.meta({...})` and stores the metadata; `toProjectJsonSchema`
delegates to the shim's `toJsonSchema`. Native rewrite: key the Map by
`Schema.Top` (or the appropriate base type from the vendored source),
apply metadata via `.annotate({...})`, and inline the shim's
`toJsonSchema` body (shim :652-662) — it is ALREADY native:

```ts
const document = Schema.toJsonSchemaDocument(schema, {
  additionalProperties: ...,
  generateDescriptions: true,
});
return { $schema: "https://json-schema.org/draft/2020-12/schema",
  ...document.schema,
  ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}) };
```

(`additionalProperties` was driven by the shim's passthrough WeakMap; in
the native rewrite pass it explicitly — audit which registered schemas
are passthrough today; expected: none of the registered ones, so a
constant `false` with a comment is likely correct. Verify by diffing
generated JSON Schemas in Step 4.)

### The gate to extend

`tests/harness/production-boundaries.test.ts:470-484` already guards zod
by module specifier:

```ts
test("repo code does not import zod directly", async () => {
  ...
  const zodSpecifier = extractModuleSpecifiers(file.text).find(
    (specifier) => specifier === "zod" || specifier.startsWith("zod/"),
  );
  expect(zodSpecifier, `${file.path} imports ${zodSpecifier ?? "zod"}`).toBeUndefined();
```

Add the sibling test forbidding specifiers containing `schema-compat`
repo-wide (same mechanism, same file).

### Consumers that must keep working unchanged

- `packages/studio-api/src/schema-routes.ts` + `contracts/openapi.ts`
  serve `@bp/domain/json-schema` outputs (`/api/schema/*`,
  `/api/openapi.json`). Their served bytes are the parity check in
  Step 4.
- `domain/test/package-shape.test.ts` asserts every registered schema
  exposes `.safeParse` — that assertion is ABOUT THE SHIM and gets
  rewritten to assert native decodability (each registered schema decodes
  its own example/round-trips via `@bp/domain/decode`).
- `packages/domain/package.json` exports include `"./schema-compat"` —
  remove with the file.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Domain typecheck / tests | `bun --filter @bp/domain typecheck && bun --filter @bp/domain test` | exit 0 / all pass |
| Downstream typechecks | `bun --filter @bp/sources typecheck && bun --filter @bp/analytics typecheck && bun --filter @bp/studio-api typecheck && bun --filter @bp/pipeline-v2 typecheck && bun --filter @bp/db typecheck && bun --filter @bp/web typecheck` | all exit 0 |
| Full tests | `bun run test:unit && bun run test:web && bun run test:worker` | all pass |
| Architecture (incl. new gate) | `bun run check:web-architecture` | all pass |
| Web build (bundle guard) | `bun --filter @bp/web build` | exit 0; entry ≤ 145 KB gz (no effect in browser — types only) |
| Shim-gone gate | `rg -l "schema-compat" apps packages tools tests` | no matches |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- All `packages/domain/src/**` schema modules listed in the map
- `packages/domain/src/schema-compat.ts` — DELETE (last step)
- `packages/domain/package.json` — remove the `"./schema-compat"` export
- `packages/domain/test/**` — rewrite shim-shaped assertions
- `tests/harness/production-boundaries.test.ts` — add the specifier gate
- `docs/decisions/0020-effect-schema-only.md` — one-paragraph addendum
  ("compat facade removed <date>; decode-options convention lives in
  `@bp/domain/decode`; raw-permissive/normalized-strict rule")
- `knowledge/log.md`, `plans/README.md`

**Out of scope** (do NOT touch):
- Every other package's SOURCE (065/066 finished them; if a downstream
  typecheck breaks here, the fix is in domain's exported types, not in
  the consumer)
- `apps/web/src/**` (type-only consumption must survive untouched;
  `rg 'from "effect' apps/web/src` must stay empty — type imports of
  domain modules are fine, runtime effect imports are not)
- The `schema-registry` MECHANISM (keep the Map + metadata; do not
  redesign it)

## Git workflow

- Branch: `codex/067-domain-native-delete-shim`
- Commit per module family; the shim deletion is its own final commit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Registry + primitives (foundation)

Rewrite `schema-registry.ts` natively (keep API names). Migrate
`primitives/index.ts` — real per-type brands, `RouteIdCodec` as a native
transformation (preserve trim+uppercase decode behavior and its
round-trip test).

**Verify**: domain typecheck; primitives tests pass; a NEW test asserts
two different branded schemas do not runtime-collide the way
`"DomainBrand"` did (decode a DirectionId, expect it NOT assignable-at-
runtime where a RouteId brand check applies — express this as whatever
brand-introspection the native API allows; if brands are compile-time
only in v4, assert the type-level distinction via a `@ts-expect-error`
case instead and note it).

### Step 2: routes, maps, studio, documents

Mechanical sweep per the mapping table, one commit per module family.
Real `Schema.Union` for the discriminated unions in `documents/` and
`findings/` (members keep their literal tag fields). Where a schema used
`.extend()`, re-express as struct-spread of `.fields` or nested
composition — NO mode-inheritance subtleties survive because strictness
now lives at decode sites.

**Verify per family**: domain typecheck + domain tests for that family;
after studio: `bun --filter @bp/studio-api typecheck` (largest consumer
of studio types).

### Step 3: findings — migrate what is referenced, measure the rest

Post-061, list which `domain/findings` exports are still imported
(`rg -o 'from "@bp/domain/findings"' -l` consumers → enumerate imported
symbols). Migrate referenced exports; DELETE exports with zero importers
(record the LOC removed). Do not delete the module wholesale — analytics
`core/` and `features/route-month` are live consumers.

**Verify**: domain + analytics typechecks; analytics tests.

### Step 4: json-schema parity

Migrate `json-schema/index.ts` onto the native registry/toJsonSchema.
Parity check: before starting this plan, capture every served schema
(`bun -e` script dumping each exported `*JsonSchema` object to
`/tmp/claude-1000/**/before/`); after migration, dump again and diff.
Expect byte-identical or better (a description that was lost by the shim
appearing is acceptable and must be listed; a lost field is a STOP).

**Verify**: diff empty or additions-only (listed); studio-api tests pass
(`/api/schema/*` + openapi fixtures).

### Step 5: Delete the shim, close the gate

`git rm packages/domain/src/schema-compat.ts`; drop the package export;
rewrite `package-shape.test.ts` assertions natively; add the
`schema-compat` specifier test next to the zod test in
`production-boundaries.test.ts`; write the ADR-0020 addendum + log entry.

**Verify**: the ENTIRE command table, including the shim-gone gate, the
web build with bundle budget, and `check:web-architecture` (which now
includes your new gate — prove it fires by temporarily adding a
`schema-compat` import to a scratch file, observing the failure, and
removing it).

## Test plan

- Rewritten: `package-shape.test.ts` (native decodability per registered
  schema), `schemas.test.ts` error-shape assertions (real paths).
- New: brand-distinction test (Step 1), union-discrimination test on one
  `documents/` union (wrong-tag payload → member-accurate error),
  json-schema parity snapshot (Step 4 artifacts checked into the test as
  fixtures ONLY if small; otherwise the diff procedure documented in the
  PR).
- New: the `schema-compat` specifier gate in production-boundaries.
- Unchanged-and-green: every downstream package suite — the point of the
  leaf-first ordering is that this step breaks no consumer.

## Done criteria

- [ ] `packages/domain/src/schema-compat.ts` does not exist; export map
      entry removed
- [ ] `rg -l "schema-compat" apps packages tools tests` → no matches
- [ ] Production-boundaries has the specifier gate; proven to fire
- [ ] Brands are per-type (`rg '"DomainBrand"'` → no matches)
- [ ] json-schema parity diff clean (or additions-only, listed in PR)
- [ ] All downstream typechecks + full test suites green; web build
      within budget; `rg 'from "effect' apps/web/src` still empty
- [ ] ADR-0020 addendum + log entry written; README row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step-0 leaf gate is non-empty (a straggler imports schema-compat).
- A downstream package needs a SOURCE change beyond what its 065/066 plan
  made (means domain's exported types changed shape, not just mechanism).
- json-schema parity shows a REMOVED field/constraint.
- `Schema.toJsonSchemaDocument` or brand/union APIs behave differently on
  `effect@4.0.0-beta.92` than the shim's usage implies (cite the vendored
  file).
- The web bundle grows (would mean a runtime import leaked into type-only
  paths).

## Maintenance notes

- Effect v4 is a beta line: when the pin advances, the coupled surfaces
  are `@bp/domain/decode`, `schema-registry.ts`, `json-schema`, and
  pipeline's `cli/schema-introspect.ts` (066) — their unit tests are the
  canary; run domain + pipeline suites first after any bump.
- `domain/findings` post-Step-3 residue: if analytics `core/` is ever
  restructured, re-measure findings' consumers — more of it becomes
  deletable.
- Follow-up worth commissioning separately: weak-invariant sweep of
  domain contracts (nullable fields every consumer immediately defaults;
  plain-string IDs that deserve the now-real brands). It was deliberately
  excluded here to keep this plan mechanical — changing field
  nullability is a CONTRACT change with serving implications.
- Reviewer should scrutinize: the json-schema parity evidence and the
  RouteIdCodec round-trip behavior (trim/uppercase must survive).
