# Plan 015: Establish the Effect platform runtime for pipeline commands

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 58dfaeb..HEAD -- \
>   package.json \
>   bun.lock \
>   docs/decisions \
>   knowledge/index.md \
>   knowledge/log.md \
>   tools/pipeline-v2/package.json \
>   tools/pipeline-v2/src/cli.ts \
>   tools/pipeline-v2/src/lib \
>   tools/pipeline-v2/src/commands/route/build-plan.ts \
>   tools/pipeline-v2/src/commands/docs/tier2/_cli-bridge.ts \
>   tools/pipeline-v2/src/commands/docs/tier2/_shared.ts \
>   tools/pipeline-v2/test \
>   tests/harness
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch that changes the architecture, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none; supersedes `plans/006-adr-effect-boundaries-and-footprint-spike.md` and `plans/010-pipeline-effect-resilience.md`
- **Category**: migration
- **Planned at**: commit `58dfaeb`, 2026-06-30

### Progress note - 2026-07-01

This plan is in progress. The original "Current state" section below is a
historical drift snapshot, not live truth: Effect dependencies and ADR-0019 now
exist, local DB command boundaries have moved behind Effect services/layers, and
`PipelineFileSystemService` now owns shared text/JSON filesystem work for D1
verification, publish artifact-key reads, Studio SEO writes, `lib/json.ts`,
source snapshots, route-list reads, and MTA-wiki canonical JSONL reads.
Continue from the live code and keep new Effect work focused on
aggregation/product-serving pipeline seams, not applied-research code that plan
018 is deleting.

### Completion note - 2026-07-01

Completed against the simplified post-plan-018 pipeline. The live ADR is
`docs/decisions/0019-effect-runtime-for-pipeline.md`; the implementation uses
`PipelineFileSystemService`, scoped local DB layers, D1 replay services,
route/build/local-DB command services, and typed schema-tagged errors. The old
`ArtifactStore` name from this plan was superseded by the broader filesystem
service. The route, build, ingest, geocode, Studio utility, D1 export/verify,
coverage audit, and remaining compact local-DB command families no longer use
`withLocalDb` / `localDbFromCtx`; file JSON reads are raw `unknown` at the
service boundary and are narrowed by callers.

Verification note: `bun --filter @bp/pipeline-v2 typecheck`,
`bun --filter @bp/pipeline-v2 test`, `bun run check:web-architecture`, and the
browser Effect import guard pass. Repo-wide `bun run check:style` is currently
blocked by unrelated hard-cutover diagnostics outside this Effect slice; the
Plan 015 touched files pass scoped Biome.

## Why this matters

The revised goal is not "swap the CLI parser." The goal is an Effect runtime,
typed errors, services, and layers throughout pipeline commands, while reducing
source complexity. The current `@liche/core` shell is only 38 LOC and already
provides command discovery, `--json`, and schema reflection; replacing it first
would churn roughly 300 command files without fixing the real complexity. The
highest-return move is to put Effect behind the side-effect seams: local DB
handles, artifact IO, provider calls, retries, logging, and command workflows.

This plan establishes the platform boundary and migrates one vertical command
slice. It intentionally keeps browser code free of Effect and keeps
`packages/domain` on Zod; the frontend simplification should happen through
product-shaped APIs and route loaders, not by importing Effect into the client
bundle.

## Current state

- `package.json:15-58` has a workspace catalog but no Effect dependencies.
  `package.json:61` now has a local `prepare` script that fetches the vendored
  Effect reference repo; `package.json:110` pins Bun as the package manager.

  ```json
  "catalog": {
    "@biomejs/biome": "^2.4.0",
    "...": "...",
    "zod": "^4.3.6"
  },
  "scripts": {
    "prepare": "./scripts/prepare-effect.sh",
    "pipeline": "bun --filter @bp/pipeline-v2 cli --"
  },
  "packageManager": "bun@1.3.13"
  ```

- `tools/pipeline-v2/package.json:17-27` depends on `@liche/core`, Zod, the
  local workspace packages, and the pi LLM harness. It does not depend on
  `effect` or `@effect/platform-bun`.

  ```json
  "dependencies": {
    "@bp/analytics": "workspace:*",
    "@bp/applied-research": "workspace:*",
    "@bp/db": "workspace:*",
    "@bp/domain": "workspace:*",
    "@bp/sources": "workspace:*",
    "@earendil-works/pi-agent-core": "^0.78.0",
    "@earendil-works/pi-ai": "^0.78.0",
    "@liche/core": "^0.7.0",
    "pdf-lib": "catalog:",
    "zod": "catalog:"
  }
  ```

- `tools/pipeline-v2/src/cli.ts:1-38` is a small Liche entrypoint. It scans
  `commands/**/*.ts`, installs help/version/output/reflection controls, and
  runs the CLI. This file is not the complexity source.

  ```ts
  export const cli = defineCli({
    name: "pipeline",
    version: "0.0.1",
    extensions: [
      help(),
      version(),
      outputControls({ format: true, fullOutput: true, json: true }),
      reflectionControls({ schema: true }),
    ],
    commands: await discoverCommands(),
  });
  ```

- There are 306 command files under `tools/pipeline-v2/src/commands`. A grep
  for `parseCliOptions|parseArgs|FromCli|optionsToArgs` currently matches 106
  files under command/check code. That is where old argv-style command bodies
  still leak into the v2 command layer.

- `tools/pipeline-v2/src/lib/local-db.ts:34-71` owns a key resource seam today.
  It opens/migrates SQLite directly, closes in Liche middleware, and recovers
  command context with a throw plus a cast.

  ```ts
  export async function openLocalPipelineDb(
    path: string | undefined,
    options: OpenLocalDbOptions = {},
  ): Promise<OpenLocalPipelineDb> {
    const resolved = path ?? defaultLocalPipelineDbPath();
    if (!options.readonly) {
      await migrateLocalPipelineDb(resolved);
    }
    const sqlite = new Database(resolved, options.readonly ? { readonly: true } : undefined);
    applyLocalPragmas(sqlite, { readonly: options.readonly ?? false });
    return { db: createLocalPipelineDb(sqlite), sqlite, path: resolved, spatialite };
  }

  export function localDbFromCtx(ctx: { var: Record<string, unknown> }): OpenLocalPipelineDb {
    const local = ctx.var["localDb"];
    if (!local) {
      throw new Error("withLocalDb middleware not attached to this command");
    }
    return local as OpenLocalPipelineDb;
  }
  ```

- `tools/pipeline-v2/src/lib/json.ts:3-40` wraps `Bun.file` and `Bun.write`
  with raw promises, thrown `Error`s, and a generic cast on decoded JSON.

  ```ts
  export async function readJsonIfExists<T>(path: string): Promise<T | null> {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return (await file.json()) as T;
  }

  throw new Error(`Failed to parse artifact at ${path}: ${detail}`);
  ```

- `tools/pipeline-v2/src/commands/route/build-plan.ts:19-49` is a good first
  vertical slice: it has a focused Liche command boundary, a local DB resource,
  and business logic already delegated to `@bp/applied-research/local-db`.

  ```ts
  middleware: [withLocalDb()],
  async run({ ctx, input }) {
    return runRouteBuildPlan({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      limit: input.options.limit,
    });
  },
  ```

- `tools/pipeline-v2/src/commands/docs/tier2/_cli-bridge.ts:1-4` documents the
  old bridge explicitly: typed Liche options are converted back into `string[]`
  argv for v1 `FromCli` functions. `_shared.ts:71-126` still contains the old
  `parseCliOptions` and callback-style `withLocalPipelineDb` helpers.

- `knowledge/wiki/engineering/website_hard_cutover_plan.md:57-68` says the
  product is route-first, map-as-evidence, AI-as-reasoning, and docs/API/CLI
  should be friendly and agent-readable. Lines 94-125 say frontend code should
  use TanStack Router loaders, direct imports, parallel fetches, abort signals,
  narrow loader deps, render-derived state, and dynamically contained MapLibre.

- `knowledge/wiki/analysis/product_question_inventory.md:119-143` defines the
  primary user as the route/corridor evidence author and the success path as:
  route/corridor/project question -> observed performance and rider impact ->
  treatment/timeline context -> explanation/counterfactual posture ->
  citations/caveats/source gaps -> exportable brief/scorecard/deck/review
  packet.

- `knowledge/wiki/engineering/generated_cli_distribution_plan.md:37-50` says
  public CLI/API/docs should eventually come from one runtime TypeScript schema
  and model REST operations, CLI names/flags, locality, Worker/RPC surfaces,
  examples, caveats, changelog entries, and `--json` output shape.

- `docs/decisions/` currently has ADRs 0001 through 0018. There is no ADR-0019
  yet.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Verify Effect reference repo | `test -d .repos/effect && printf 'effect repo present\n'` | prints `effect repo present` |
| Inspect beta versions | `bun pm view effect dist-tags.beta` and `bun pm view @effect/platform-bun dist-tags.beta` | both print versions |
| Install/update lockfile | `bun install` | exit 0; `bun.lock` updates intentionally |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Targeted tests | `bun test tools/pipeline-v2/test/effect-runtime.test.ts tools/pipeline-v2/test/effect-artifact-store.test.ts tools/pipeline-v2/test/effect-local-db.test.ts tools/pipeline-v2/test/commands/route/build-plan.test.ts --timeout 5000` | all pass |
| Architecture harness | `bun run check:web-architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Browser Effect guard | `grep -rn "from \"effect\"\\|from \"@effect/" apps/web/src --include='*.ts' --include='*.tsx'` | no matches outside `apps/web/src/worker` if worker work is later added |

Do not use repo-wide `bun run check:types` as the first verification gate; the
existing plan index notes that it can OOM at the default heap. Use scoped
typechecks for this plan.

## Suggested executor toolkit

- Invoke the `effect-ts` skill if available. Before editing, read:
  - `/home/cjpher/.codex/skills/effect-ts/references/guide-effect.md`
  - `/home/cjpher/.codex/skills/effect-ts/references/guide-error-handling.md`
  - `/home/cjpher/.codex/skills/effect-ts/references/guide-layers.md`
  - `/home/cjpher/.codex/skills/effect-ts/references/guide-testing.md`
  - `/home/cjpher/.codex/skills/effect-ts/references/guide-observability.md`
  - `/home/cjpher/.codex/skills/effect-ts/references/guide-retries.md`
- Follow these Effect rules from the local skill:
  - use `effect@beta`;
  - keep all `@effect/*` packages aligned;
  - prefer `Effect.fn` for reusable workflows;
  - define typed errors with `Schema.TaggedErrorClass` when the payload is
    schema-shaped;
  - define services with `Context.Service`;
  - provide layers at runtime boundaries with `ManagedRuntime.make`;
  - do not use `any`, unsafe `as` casts, or `namespace`.

## Scope

**In scope**:

- `package.json` - add Effect packages to the workspace catalog only if needed.
- `bun.lock` - updated by `bun install`.
- `docs/decisions/0019-effect-adoption-boundaries.md` - create.
- `knowledge/index.md` and `knowledge/log.md` - add a short ADR pointer if the
  local convention still expects decision log entries.
- `tools/pipeline-v2/package.json` - add `effect` and `@effect/platform-bun`
  from the catalog.
- `tools/pipeline-v2/src/effect/` - new Effect runtime/errors/services modules.
- `tools/pipeline-v2/src/lib/local-db.ts` and `tools/pipeline-v2/src/lib/json.ts`
  - keep public Promise-shaped exports, but have them delegate to Effect
  services where practical.
- `tools/pipeline-v2/src/commands/route/build-plan.ts` - migrate one command
  slice to the new runtime.
- `tools/pipeline-v2/test/` - new tests for Effect runtime/services and the
  migrated command boundary.
- `tests/harness/production-boundaries.test.ts` - only if adding an explicit
  browser Effect import guard fits the existing harness style.
- `plans/README.md` - status row.

**Out of scope**:

- Replacing `@liche/core` or rewriting `tools/pipeline-v2/src/cli.ts`. Keep the
  command discovery, output controls, and reflection controls until a generated
  product CLI can replace them.
- Importing Effect from browser code under `apps/web/src`. The frontend
  simplification should be product/API/route-loader work, not a browser runtime
  migration.
- Migrating `packages/domain` from Zod to Effect Schema. Field lists are
  load-bearing and existing plans rejected this as LOC-neutral churn.
- Replacing Drizzle or `bun:sqlite` with `@effect/sql`. The local DB service
  should wrap existing DB construction; do not change schema/migration tooling.
- Rewriting Tier 2 document extraction logic. This plan can inventory the old
  argv bridge, but only the `route/build-plan` vertical slice is migrated.
- Touching provider secrets or printing secret values. Use `bun run env:check:llm`
  if provider readiness matters; do not use `printenv`.

## Git workflow

- Branch: `advisor/015-effect-platform-runtime`
- Commit per logical unit; match the repo's sentence-case imperative style,
  for example `Give the route map real shoreline context and stop ticks`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the revised Effect boundary in ADR-0019

Create `docs/decisions/0019-effect-adoption-boundaries.md`. Use the structure
of existing ADRs in `docs/decisions/`. The decision must say:

- Adopt Effect core plus `@effect/platform-bun` in `tools/pipeline-v2` for the
  pipeline runtime, typed errors, services, layers, resource lifecycles, retry
  policies, and command workflows.
- Keep `@liche/core` as the CLI presentation layer for now. The current Liche
  entrypoint is small and already supplies `--json`/schema reflection. A future
  public CLI should be generated from the product contract, per
  `knowledge/wiki/engineering/generated_cli_distribution_plan.md`.
- Do not import Effect into browser code. Frontend simplification should
  answer the basic product questions through route-first pages, Studio API
  projections, TanStack Router loaders, and direct imports.
- Keep `packages/domain` on Zod and keep `packages/db` on Drizzle/bun:sqlite.
  Effect wraps side effects; it does not replace load-bearing schemas or DB
  migrations in this plan.
- Worker-side `@effect/platform` HttpApi remains a separate migration, gated by
  footprint and plan 008's centralized auth/cache/idempotency behavior.
- If plan 014 (`nyc-transit-kit`) has already landed, align the direct
  `effect` version in this repo with the version already resolved in `bun.lock`
  rather than installing a second incompatible beta.

Append a short entry to `knowledge/index.md` and `knowledge/log.md` if those
files still contain decision-log sections for new ADRs. Keep it to one or two
lines; do not rewrite the wiki.

**Verify**: `ls docs/decisions/0019-effect-adoption-boundaries.md` prints the
file path. `rg -n "Effect|0019" docs/decisions/0019-effect-adoption-boundaries.md`
shows the adopted and rejected boundaries.

### Step 2: Add aligned Effect dependencies to the pipeline package

Run:

```sh
bun pm view effect dist-tags.beta
bun pm view @effect/platform-bun dist-tags.beta
```

Use the printed beta versions. Add these catalog entries to the root
`package.json`:

```json
"effect": "<effect beta version>",
"@effect/platform-bun": "<matching beta version>"
```

Then add these dependencies to `tools/pipeline-v2/package.json`:

```json
"effect": "catalog:",
"@effect/platform-bun": "catalog:"
```

Run `bun install`.

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` exits 0 before any source
changes. `rg -n '"effect"|"@effect/platform-bun"' package.json tools/pipeline-v2/package.json`
shows only the intended manifest entries.

### Step 3: Create typed pipeline errors

Create `tools/pipeline-v2/src/effect/errors.ts`. Define schema-backed tagged
errors for the first service layer:

- `PipelineConfigError`
- `ArtifactReadError`
- `ArtifactWriteError`
- `ArtifactDecodeError`
- `LocalDbOpenError`
- `LocalDbContextError`
- `PipelineCommandError`

Use `Schema.TaggedErrorClass`, `Schema.String`, `Schema.optional`, and
`Schema.Defect`/`Schema.DefectWithStack` for wrapped foreign causes. Example
shape:

```ts
import { Schema } from "effect";

export class ArtifactReadError extends Schema.TaggedErrorClass<ArtifactReadError>()(
  "ArtifactReadError",
  {
    path: Schema.String,
    operation: Schema.Literal("exists", "json", "text", "arrayBuffer"),
    cause: Schema.Defect,
  },
) {}
```

Keep the error names stable and descriptive; command code will use
`Effect.catchTag` and error formatting by `_tag`.

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` exits 0.

### Step 4: Add the pipeline runtime and layer composition

Create `tools/pipeline-v2/src/effect/runtime.ts` and
`tools/pipeline-v2/src/effect/layers.ts`.

Target shape:

```ts
import { Effect, Layer, ManagedRuntime } from "effect";
import { ArtifactStoreLive } from "./services/artifact-store.ts";
import { LocalPipelineDbLive } from "./services/local-pipeline-db.ts";

export const PipelineLiveLayer = Layer.mergeAll(
  ArtifactStoreLive,
  LocalPipelineDbLive,
);

export const pipelineRuntime = ManagedRuntime.make(PipelineLiveLayer);

export const runPipelineEffect = pipelineRuntime.runPromise;
```

If the exact generic type of `Effect.Effect` in the installed beta differs, use
the installed package's type hints and the vendored `.repos/effect` source.
Do not force command workflows to have `never` requirements before the managed
runtime provides their services, and do not silence type errors with `any` or
`as`.

Add a single boundary helper for formatting typed errors into command failures,
for example:

```ts
export function commandFailureMessage(error: PipelineCommandError | ArtifactReadError): string
```

Use this helper only at Liche/Promise boundaries. Business functions should
return `Effect`, not throw formatted strings.

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` exits 0.

### Step 5: Implement ArtifactStore as an Effect service

Create `tools/pipeline-v2/src/effect/services/artifact-store.ts`.

Service shape:

```ts
import { Context, Effect } from "effect";
import type { ZodType } from "zod";

export class ArtifactStore extends Context.Service<ArtifactStore, {
  readonly writeJson: (path: string, data: unknown) => Effect.Effect<number, ArtifactWriteError>;
  readonly readJsonIfExists: <T>(path: string) => Effect.Effect<T | null, ArtifactReadError>;
  readonly readJsonArtifact: <T>(
    path: string,
    schema: ZodType<T>,
  ) => Effect.Effect<T, ArtifactReadError | ArtifactDecodeError>;
  readonly readOptionalJsonArtifact: <T>(
    path: string | null,
    schema: ZodType<T>,
  ) => Effect.Effect<T | null, ArtifactReadError | ArtifactDecodeError>;
}>()("Pipeline/ArtifactStore") {}
```

Implementation rules:

- Wrap `Bun.write`, `Bun.file(path).exists()`, and `file.json()` with
  `Effect.tryPromise`.
- Preserve the existing JSON formatting: `JSON.stringify(data, null, 2)` plus
  trailing newline.
- Preserve existing optional behavior: missing optional artifact returns
  `null`; required missing artifact fails with `ArtifactReadError`.
- Decode with the existing Zod schema, but convert parse failures into
  `ArtifactDecodeError` with the first five issue summaries.

Then update `tools/pipeline-v2/src/lib/json.ts` so the current Promise-shaped
exports remain available and delegate to `runPipelineEffect` plus the service.
This keeps existing command files working while new command workflows can use
the service directly.

**Verify**:

```sh
bun test tools/pipeline-v2/test/effect-artifact-store.test.ts --timeout 5000
bun --filter @bp/pipeline-v2 typecheck
```

Expected: tests pass and typecheck exits 0.

### Step 6: Implement LocalPipelineDb as an Effect service

Create `tools/pipeline-v2/src/effect/services/local-pipeline-db.ts`.

Service shape:

```ts
import { Context, Effect, Scope } from "effect";
import type { OpenLocalDbOptions, OpenLocalPipelineDb } from "../../lib/local-db.ts";

export class LocalPipelineDb extends Context.Service<LocalPipelineDb, {
  readonly open: (
    path: string | undefined,
    options?: OpenLocalDbOptions,
  ) => Effect.Effect<OpenLocalPipelineDb, LocalDbOpenError, Scope.Scope>;
}>()("Pipeline/LocalPipelineDb") {}
```

Implementation rules:

- Reuse the existing low-level DB open function if possible. It is okay to
  rename the current `openLocalPipelineDb` implementation to
  `openLocalPipelineDbUnsafe` or `openLocalPipelineDbPromise` as long as the
  exported `openLocalPipelineDb` Promise API still works for old call sites.
- Use `Effect.acquireRelease` so `sqlite.close()` is always called after the
  scoped command workflow completes.
- Wrap open/migrate/spatialite failures in `LocalDbOpenError`.
- Do not change the migration, PRAGMA, readonly, or Spatialite behavior.
- Add `localDbFromCtxEffect` if the old Liche middleware still needs a bridge,
  but do not use unsafe casts in new code.

Update `tools/pipeline-v2/src/lib/local-db.ts`:

- Keep `dbOptions` unchanged; command option schemas still use Liche/Zod.
- Keep `withLocalDb` for old commands, but route its resource ownership through
  `Effect.scoped(...)` and the runtime if doing so does not break Liche
  middleware semantics.
- Keep `localDbFromCtx` only as a backward-compatibility adapter for old
  commands; new migrated commands should not use it.

**Verify**:

```sh
bun test tools/pipeline-v2/test/effect-local-db.test.ts --timeout 5000
bun --filter @bp/pipeline-v2 typecheck
```

Expected: tests pass and typecheck exits 0.

### Step 7: Migrate `route build-plan` as the first vertical slice

In `tools/pipeline-v2/src/commands/route/build-plan.ts`, keep the Liche
command metadata and output schema, but move the workflow into Effect.

Target shape:

```ts
const runRouteBuildPlanCommand = Effect.fn("route.build-plan")(function*(options: {
  readonly db?: string;
  readonly year: number;
  readonly month: number;
  readonly limit: number;
}) {
  const localDb = yield* LocalPipelineDb.open(options.db);
  return yield* Effect.tryPromise({
    try: () =>
      runRouteBuildPlan({
        local: localDb,
        year: options.year,
        month: options.month,
        limit: options.limit,
      }),
    catch: (cause) =>
      PipelineCommandError.make({
        command: "route build-plan",
        cause,
      }),
  });
});
```

Then the Liche `run` can be a thin boundary:

```ts
async run({ input }) {
  return runPipelineEffect(Effect.scoped(runRouteBuildPlanCommand(input.options)));
}
```

Remove `middleware: [withLocalDb()]` from this command after the scoped
workflow owns the DB lifecycle. Keep all exported applied-research symbols at
the top of the file; the existing boundary test expects the command to delegate
ranking and DB writes to `@bp/applied-research/local-db`.

**Verify**:

```sh
bun test tools/pipeline-v2/test/commands/route/build-plan.test.ts --timeout 5000
bun --filter @bp/pipeline-v2 typecheck
```

Expected: tests pass, typecheck exits 0, and the command file no longer imports
`withLocalDb` or `localDbFromCtx`.

### Step 8: Add boundary and regression tests

Add or update tests under `tools/pipeline-v2/test/`:

- `effect-runtime.test.ts`
  - `commandFailureMessage` formats each typed `_tag` without leaking raw stack
    dumps into normal user-facing output.
  - `PipelineLiveLayer` can run a trivial `Effect.succeed` through
    `pipelineRuntime`.
- `effect-artifact-store.test.ts`
  - writes pretty JSON with trailing newline;
  - returns `null` for missing optional artifacts;
  - fails required missing artifacts with `ArtifactReadError`;
  - fails schema mismatch with `ArtifactDecodeError` that includes only the
    bounded issue summary.
- `effect-local-db.test.ts`
  - opens a temporary local DB path and closes it through scope finalization;
  - preserves readonly option behavior where an existing fixture DB is used;
  - reports open failures as `LocalDbOpenError`.
- `commands/route/build-plan.test.ts`
  - keep existing assertions that ranking and DB writes live in
    `@bp/applied-research/local-db`;
  - add assertions that the command imports the pipeline runtime/effect service
    and does not import `withLocalDb` or `localDbFromCtx`.

If adding an architecture guard fits the existing harness style, add one test
to `tests/harness/production-boundaries.test.ts` asserting that Effect imports
do not appear in browser modules under `apps/web/src` outside worker-only code.

**Verify**:

```sh
bun test tools/pipeline-v2/test/effect-runtime.test.ts tools/pipeline-v2/test/effect-artifact-store.test.ts tools/pipeline-v2/test/effect-local-db.test.ts tools/pipeline-v2/test/commands/route/build-plan.test.ts --timeout 5000
bun run check:web-architecture
```

Expected: all targeted tests pass; architecture harness exits 0.

### Step 9: Inventory next migration targets without changing them

Add a short "Next pipeline Effect targets" section to ADR-0019 or to a new
`knowledge/wiki/engineering/effect_platform_pipeline_runtime.md` page if the
wiki already has a matching style. Keep it factual and bounded:

- old argv bridges: `_cli-bridge.ts` and `_shared.ts` `parseCliOptions`;
- local DB command users: `rg -n "localDbFromCtx|withLocalDb" tools/pipeline-v2/src/commands`;
- artifact IO users: `rg -n "Bun\\.file|Bun\\.write|readJsonArtifact|writeJson" tools/pipeline-v2/src/commands`;
- provider/retry users: `lib/llm.ts`, `lib/http-file-download.ts`, Socrata/SODA clients;
- candidate frontend simplification: reduce public pages to the product
  questions in `product_question_inventory.md` through Studio API projections,
  without Effect imports in client code.

This inventory is a guide for follow-up plans, not a license to rewrite all
matches in this plan.

**Verify**: `rg -n "Next pipeline Effect targets|effect_platform_pipeline_runtime" docs knowledge`
shows the inventory.

### Step 10: Full verification

Run:

```sh
bun --filter @bp/pipeline-v2 typecheck
bun --filter @bp/pipeline-v2 test
bun run check:web-architecture
bun run check:style
```

Also run the browser guard:

```sh
grep -rn "from \"effect\"\\|from \"@effect/" apps/web/src --include='*.ts' --include='*.tsx'
```

Expected:

- pipeline typecheck exits 0;
- pipeline tests pass;
- architecture and style checks exit 0;
- the browser guard prints no matches outside worker-only files if worker files
  have been touched;
- `git status --short` shows only in-scope files.

## Test plan

- New Effect runtime/service tests in `tools/pipeline-v2/test/` as described in
  Step 8.
- Existing structural test
  `tools/pipeline-v2/test/commands/route/build-plan.test.ts` remains the model
  for command-boundary assertions.
- No live network tests. Use temp files and fixture/local DB paths only.
- No Worker harness needed unless you add the optional architecture guard in
  `tests/harness`.

## Done criteria

All must hold:

- [x] `docs/decisions/0019-effect-runtime-for-pipeline.md` exists and records
      the revised boundary decisions.
- [x] `effect` and `@effect/platform-bun` are cataloged and used by
      `tools/pipeline-v2`, with aligned beta versions.
- [x] `tools/pipeline-v2/src/effect/` contains typed errors, services/layers,
      and a `ManagedRuntime` boundary.
- [x] `tools/pipeline-v2/src/lib/json.ts` and `tools/pipeline-v2/src/lib/local-db.ts`
      keep their old exports while delegating to typed Effect services where
      practical.
- [x] `tools/pipeline-v2/src/commands/route/build-plan.ts` runs through the
      Effect runtime and no longer imports `withLocalDb` or `localDbFromCtx`.
- [x] New tests for runtime, file-system, local DB, and migrated command
      pass.
- [x] `bun --filter @bp/pipeline-v2 typecheck`, `bun --filter @bp/pipeline-v2 test`,
      `bun run check:web-architecture`, and the browser Effect import guard
      exit 0; Plan 015 touched files pass scoped Biome.
- [x] No Effect imports are present in browser code under `apps/web/src`.
- [x] `plans/README.md` row for plan 015 is updated.

## STOP conditions

Stop and report back if:

- `.repos/effect` is missing. Run no Effect work until the local Effect
  reference repo is restored.
- `bun pm view @effect/platform-bun dist-tags.beta` fails or resolves a version
  incompatible with the selected `effect` beta.
- `docs/decisions/0019-effect-adoption-boundaries.md` already exists and makes
  a conflicting decision.
- Converting `withLocalDb` to use `Effect.scoped` breaks existing Liche
  middleware semantics. Keep the old middleware Promise implementation and use
  the Effect DB service only in the migrated vertical slice; report the bridge
  limitation.
- The `route build-plan` migration requires changing
  `@bp/applied-research/local-db` business logic. That is out of scope.
- Type errors tempt an unsafe cast or `any`. Stop and simplify the service
  boundary instead.
- Any verification command fails twice after a reasonable fix attempt.
- The work appears to require touching frontend page code. Defer that to a
  dedicated frontend simplification plan centered on product questions.

## Maintenance notes

- This plan creates the pattern. Future command migrations should move one
  vertical slice at a time: command metadata stays Liche, workflow returns
  `Effect`, resource access comes from services, and the command `run` is the
  only Promise boundary.
- Treat old Promise exports in `tools/pipeline-v2/src/lib/` as compatibility
  adapters. New command workflows should use services directly.
- Once at least three DB/artifact commands are migrated, add a follow-up plan to
  delete unused Liche middleware and shrink `localDbFromCtx`.
- Frontend simplification should use the product-question inventory to collapse
  pages around "which routes need attention?", "why?", "what intervention or
  evidence explains it?", and "what can I cite/export?". Keep that work separate
  from Effect runtime adoption unless the Worker API layer is the target.
