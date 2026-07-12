# Plan 040: Migrate the pipeline CLI from @liche/core to effect/unstable/cli

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- tools/pipeline-v2/src/cli.ts tools/pipeline-v2/src/commands tools/pipeline-v2/src/lib/local-db.ts tools/pipeline-v2/src/effect/runtime.ts tools/pipeline-v2/package.json`
> On drift, compare "Current state" excerpts against live code; mismatch on
> the liche command shape = STOP. (Plans 037/039 legitimately touch some of
> these files first — command COUNT may differ slightly; the SHAPE must not.)

## Status

- **Priority**: P1
- **Effort**: L (98 command files, mechanical after the bootstrap)
- **Risk**: MED (arg-parsing and JSON-output behavior are load-bearing for
  shell scripts; mitigated by golden-output capture before migration)
- **Depends on**: plans/037 (deletes dead lib weight first);
  plans/039 recommended first (settles ingest handler bodies)
- **Category**: migration
- **Planned at**: commit `ce3baca`, 2026-07-04
- **Completed**: 2026-07-05 as an Effect CLI descriptor adapter. The
  migration removed `@liche/core`, preserved the existing command descriptor
  shell shape through `src/cli/compat.ts`, made command import failures loud,
  and added a registry test for the current 99 live descriptors. The
  per-command native Effect rewrite and deletion of `effect/runtime.ts` remain
  follow-up work because existing handler bodies still call `runPipelineEffect`.

## Why this matters

The pipeline CLI runs on `@liche/core@0.7.0`, which is unmaintained and no
longer available on the npm registry — the repo builds only because the
package is vendored in `bun.lock`/local caches. Any registry cache loss
bricks the pipeline. Liche is also the last structural zod dependency in the
command layer (it re-exports `z` and its `arg.*` helpers are zod wrappers),
so this migration is a prerequisite for evicting zod (plan 044).

ADR-0019 explicitly staged this move: *"Command parsing does not need to
move to `effect/unstable/cli` in the same change. The CLI framework can
migrate after the runtime/service pattern has replaced enough
context-variable middleware to make the parser migration smaller and
mechanical."* That prerequisite landed (plans 015/027): commands are thin
liche shells delegating to Effect services. The installed
`effect@4.0.0-beta.92` ships `effect/unstable/cli`. This is now the small,
mechanical step the ADR promised, and it deletes a whole framework plus the
per-command `ManagedRuntime` churn.

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**Entry point** — `tools/pipeline-v2/src/cli.ts` (36 lines): glob-discovers
`commands/**/*.ts`, imports each, collects `mod.default` as
`DeclarativeCommand`, silently skipping files that fail to import
(`console.error` + continue), then:

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
if (import.meta.main) await run(cli);
```

**Command shape** — 98 files export `defineCommand({...})` across 21 groups
(counts verified 2026-07-04; 14 more files under `commands/` are
underscore-prefixed helpers, not commands):

| group | commands | group | commands | group | commands |
|---|---|---|---|---|---|
| ingest | 27 | build | 14 | audit | 7 |
| route | 7 | studio | 7 | geocode | 6 |
| check | 5 | sources | 4 | import | 4 |
| backfill | 3 | export | 2 | gtfs-rt | 2 |
| map | 2 | cloudflare | 1 | collect | 1 |
| corridor | 1 | pipeline | 1 | plan | 1 |
| publish | 1 | pull | 1 | verify | 1 |

Exemplar (`commands/route/readiness.ts`, abridged — every command matches
this pattern):

```ts
import { arg, defineCommand, z } from "@liche/core";
import { makeRouteLocalDbCommandLayer, runRouteReadinessCommand } from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";

export default defineCommand({
  path: ["route", "readiness"],
  summary: "Compute build readiness scores per route for a given month.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  output: z.object({ isoMonth: z.string(), routeCount: z.number(), ... }),
  async run({ input }) {
    return runPipelineEffect(
      runRouteReadinessCommand({ year: input.options.year, month: input.options.month }),
      makeRouteLocalDbCommandLayer({ dbPath: input.options.db }),
    );
  },
});
```

- 87 files in `tools/pipeline-v2` import `@liche/core`.
- `lib/local-db.ts:26-28` defines the shared `dbOptions` zod object
  (`db: z.string().optional()`), importing `z` from `@liche/core`.
- `effect/runtime.ts` — `runPipelineEffect` builds a `ManagedRuntime` per
  command invocation and disposes it (14 lines). With a real Effect CLI
  entry this becomes unnecessary.
- Liche's `DeclarativeCommand` is generic over standard-schema, with
  `path: readonly [string, ...string[]]`, optional `input: {args?, env?,
  options?}`, optional `output` schema, `run(ctx)`
  (`tools/pipeline-v2/node_modules/@liche/core/src/types.ts:478-510`).

**Load-bearing external contracts** (must survive byte-for-byte or
equivalent):
- Root script `"pipeline": "bun --filter @bp/pipeline-v2 cli --"` and
  package script `"cli": "bun run src/cli.ts"` — BOTH are pinned verbatim by
  `tests/harness/production-boundaries.test.ts:15-21,125-127`. Keep the
  script strings; the file content behind them changes.
- `scripts/run-available-not-fetched-backfill.sh` passes `--json` on six
  invocations and consumes the output. `scripts/publish-serving-release.sh`
  runs `cli -- publish r2-artifacts ...`; `scripts/pull-gtfs-rt-r2-run.sh`
  runs `cli -- pull gtfs-rt-r2-run "$@"`.
- `--schema` (reflectionControls) has ZERO consumers in `scripts/`,
  `.github/`, `.githooks/`, `data/ops/` (verified) — it may be dropped.

**Target framework** — `effect/unstable/cli` at the installed
`effect@4.0.0-beta.92` provides `Command.make(name, config, handler)`,
`Argument.*`/`Flag.*` (string/integer/boolean/choice, `.pipe(Flag.optional)`,
`Flag.withDefault`, `Flag.withDescription`, `Argument.withSchema`),
`Command.withDescription`, `Command.withSubcommands([...])`,
`Command.run(cmd, {name, version})`, run via
`cli(process.argv).pipe(Effect.provide(<platform layer>), BunRuntime.runMain)`.
`BunRuntime` is confirmed present in the installed
`@effect/platform-bun@4.0.0-beta.92` dist; the repo already imports
platform-bun subpath modules (`effect/file-system.ts:1-2` imports
`BunFileSystem`/`BunPath`). The vendored Effect source for API reference is
`.repos/effect/packages/effect/src/unstable/cli/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck pipeline | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| CLI smoke | `bun --filter @bp/pipeline-v2 cli -- --help` | usage lists all 21 groups |
| One real command | `bun --filter @bp/pipeline-v2 cli -- route readiness --help` | flags incl. --db, --year, --month |
| Architecture harness | `bun run check:web-architecture` | all pass |
| Unit tests | `bun run test:unit` | all pass |

## Suggested executor toolkit

- Read `.repos/effect/packages/effect/src/unstable/cli/` (Command.ts,
  Flag.ts, Argument.ts) before writing the bootstrap — trust installed
  source over any memory of Effect v3 `@effect/cli` (different API).
- The effect-ts skill (if available in your environment) documents v4 CLI
  idioms; its quick reference matches the API listed above.

## Scope

**In scope**:
- `tools/pipeline-v2/src/cli.ts` (rewrite)
- New: `tools/pipeline-v2/src/cli/` helpers (`json-output.ts`, `flags.ts`,
  one `commands/<group>/index.ts` registry per group — or a single
  `src/cli/registry.ts`; pick one, stay consistent)
- All 98 `defineCommand` files under `tools/pipeline-v2/src/commands/`
  (mechanical shell swap; handler bodies unchanged)
- `tools/pipeline-v2/src/lib/local-db.ts` (replace zod `dbOptions` with a
  shared Flag)
- `tools/pipeline-v2/src/effect/runtime.ts` (delete at the end if zero
  callers remain)
- `tools/pipeline-v2/package.json` (drop `@liche/core`), `bun.lock` via
  `bun install`
- Tests under `tools/pipeline-v2/test/` that import command default exports
  or liche

**Out of scope**:
- Handler/business logic, `effect/` services and layers (except deleting
  `runtime.ts` at the end), `lib/` modules beyond `local-db.ts`'s option
  object, `checks/*` (they are plain scripts, not CLI commands — leave).
- Root `package.json` script strings (pinned by the boundary test).
- zod usage inside handler bodies (plan 044).
- Renaming/moving `tools/pipeline-v2` (considered and rejected — see
  plans/README.md gen-5 notes).

## Git workflow

- Branch: `plan/040-effect-cli`; one commit for bootstrap + goldens, then
  one commit per group, final commit for the switch + dep removal. No push
  unless asked.

## Steps

### Step 0: Capture golden outputs and investigate `env:` inputs

1. Record CURRENT behavior as goldens (save under
   `tools/pipeline-v2/test/fixtures/cli-goldens/`):
   ```bash
   bun --filter @bp/pipeline-v2 cli -- --help > .../root-help.txt 2>&1
   bun --filter @bp/pipeline-v2 cli -- route readiness --help > .../route-readiness-help.txt 2>&1
   # The critical one — the JSON envelope shape scripts parse:
   bun --filter @bp/pipeline-v2 cli -- <cheapest fixture-safe command> --json > .../json-envelope.txt 2>&1
   ```
   Then open `scripts/run-available-not-fetched-backfill.sh` and record
   EXACTLY which fields of the `--json` output it consumes (jq paths / greps).
   Those fields are the compatibility contract; the rest of the envelope is
   free to change.
2. `rg -n "env:" tools/pipeline-v2/src/commands --glob '!node_modules' | grep -v "// "` —
   if any command declares liche `input.env`, list them; they map to
   `Flag`-equivalents or direct `process.env` reads in the handler
   (matching current behavior). More than ~5 such commands = STOP (the
   estimate was wrong).

**Verify**: goldens exist; the consumed-JSON-field list is written into the
PR description/notes.

### Step 1: Build the bootstrap

1. `src/cli/flags.ts`: shared option builders replacing `dbOptions`:
   `export const dbFlag = Flag.string("db").pipe(Flag.optional, Flag.withDescription("Local pipeline SQLite path"))`,
   plus `yearFlag`/`monthFlag` with the same defaults commands use today
   (`2026` / `3` where defaulted — copy per command, don't invent).
2. `src/cli/json-output.ts`: `emitResult(result, {json}: {json: boolean})` —
   when `--json`, print the SAME envelope captured in step 0 (match the
   consumed fields exactly); otherwise print the current human formatting
   (liche's default formatting is simple; match what the goldens show).
   Every migrated command gets a `json` boolean flag via a shared
   `withJsonFlag` helper so `--json` remains universal.
3. New `src/cli.ts` (keep the FILE PATH — the package script is pinned):
   static group composition, no glob:
   ```ts
   import { Command } from "effect/unstable/cli";
   import { BunRuntime } from "@effect/platform-bun"; // verify exact module/layer names against installed dist
   const root = Command.make("pipeline").pipe(
     Command.withDescription("Bus Priority pipeline CLI"),
     Command.withSubcommands([ingestGroup, buildGroup, /* ...21 groups */ ]),
   );
   const cli = Command.run(root, { name: "pipeline", version: "0.0.1" });
   cli(process.argv).pipe(Effect.provide(/* platform services layer */), BunRuntime.runMain);
   ```
   Each group index (`src/commands/<group>/index.ts`) exports
   `Command.make("<group>").pipe(Command.withSubcommands([...group's commands]))`.
   Until a group is migrated, its index is absent and cli.ts lists only
   migrated groups — see Step 2 ordering.
4. Wire ONE pilot command end-to-end (`route readiness`):
   ```ts
   export const readinessCommand = Command.make("readiness", {
     db: dbFlag,
     year: Flag.integer("year").pipe(Flag.withDefault(2026), Flag.withDescription("Calendar year")),
     month: Flag.integer("month").pipe(Flag.withDefault(3), Flag.withDescription("Calendar month, 1-12")),
     json: jsonFlag,
   }, ({ db, year, month, json }) =>
     runRouteReadinessCommand({ year, month }).pipe(
       Effect.provide(makeRouteLocalDbCommandLayer({ dbPath: db })),
       Effect.flatMap((result) => emitResult(result, { json })),
     )
   ).pipe(Command.withDescription("Compute build readiness scores per route for a given month."));
   ```
   Note: the existing `run*Command` helpers already return Effects — the
   liche `runPipelineEffect` Promise bridge disappears; commands whose
   handlers are plain-Promise call `Effect.promise(() => oldBody())`.

**Verify**: `bun run src/cli.ts route readiness --help` shows db/year/month/
json flags; running it against the fixture DB (see the existing
`test/commands/route/` tests for the fixture path) produces output matching
the golden envelope for the consumed fields.

### Step 2: Migrate group by group (mechanical sweep)

Order: `route` (pilot, done) → `check` → `sources` → `export` → `map` →
`audit` → `studio` → `geocode` → `import` → `backfill` → `gtfs-rt` →
`collect` → `pull` → `publish` → `corridor` → `pipeline` → `plan` →
`verify` → `cloudflare` → `build` → `ingest` (biggest last, most uniform).

Per command, the transform is fixed: `path: ["a","b"]` → command name `b`
inside group `a`; `summary` → `Command.withDescription`; each `arg.*` option
→ the matching `Flag.*` (`arg.positiveInt().default(N)` →
`Flag.integer(...).pipe(Flag.withDefault(N))` — preserve names, defaults,
descriptions EXACTLY); `output` schema → deleted (the emit helper prints the
handler's return value); `run({input})` body → handler function, unchanged
logic. Positional liche `input.args` (if a command has them) → `Argument.*`.

During the sweep the OLD glob-based behavior is gone (new cli.ts is static),
so migrate a full group per commit and keep `bun run src/cli.ts <group>
--help` green per group. The old liche files-being-migrated must not be
half-converted: a group's commit converts all its commands + its index.

**Verify per group**: `bun --filter @bp/pipeline-v2 typecheck`;
`bun run src/cli.ts <group> --help` lists all the group's commands; the
group's tests under `test/commands/<group>/` pass.

### Step 3: Replace `dbOptions` and delete dead framework plumbing

1. Delete `dbOptions` from `lib/local-db.ts` (and its `@liche/core` import);
   all consumers now use `src/cli/flags.ts`.
2. `rg -l "runPipelineEffect" tools/pipeline-v2/src` — if only
   `effect/runtime.ts` remains, delete `runtime.ts`; otherwise migrate the
   stragglers first.
3. `rg -l "@liche/core" tools/pipeline-v2` → must be empty. Remove
   `"@liche/core"` from `tools/pipeline-v2/package.json`; `bun install`.

**Verify**: `grep -c liche bun.lock` → 0; full
`bun --filter @bp/pipeline-v2 test` passes.

### Step 4: End-to-end contract checks

```bash
bun --filter @bp/pipeline-v2 cli -- --help                  # lists all 21 groups
bun --filter @bp/pipeline-v2 cli -- route readiness --help
bash -n scripts/run-available-not-fetched-backfill.sh
bun run check:web-architecture                              # pinned script strings intact
bun run test:unit
```

Then re-run the step-0 golden command with `--json` and diff the CONSUMED
fields against the golden (whole-envelope diffs may differ; consumed fields
may not).

**Verify**: all green; consumed-field diff empty.

## Test plan

- Keep every existing `test/commands/**` test green — they exercise handler
  logic via exported functions and remain valid.
- New: `test/cli/json-output.test.ts` — envelope matches the consumed-field
  contract (fixture from step 0).
- New: `test/cli/registry.test.ts` — walks `src/commands/*/index.ts` groups
  and asserts the composed root command exposes exactly the expected
  `group → [command names]` map (this replaces the silent-skip glob with a
  loud structural test; fixes the "broken import silently drops a command"
  failure mode of the old cli.ts).
- Golden help-text files are recorded but NOT asserted byte-for-byte (help
  format legitimately changes); the registry test carries the completeness
  guarantee.

## Done criteria

- [ ] `rg -l "@liche/core" tools/pipeline-v2 --glob '!node_modules'` → empty; dep removed; `grep -c liche bun.lock` → 0
- [ ] `bun --filter @bp/pipeline-v2 cli -- --help` exits 0 and lists 21 groups; registry test asserts 98 commands (or the current count post-037/039 — record it)
- [ ] `scripts/run-available-not-fetched-backfill.sh`'s consumed `--json` fields verified unchanged against the step-0 golden
- [ ] `tests/harness/production-boundaries.test.ts` passes unmodified
- [ ] `effect/runtime.ts` deleted (or a listed reason it remains)
- [ ] Full `bun --filter @bp/pipeline-v2 test` + `bun run test:unit` green
- [ ] `plans/README.md` status row updated

## STOP conditions

- `effect/unstable/cli` at beta.92 lacks something structurally needed
  (nested subcommands, optional flags, variadic arguments where a command
  needs them) — verify against `.repos/effect` FIRST; if truly missing,
  stop and report the exact gap.
- Step 0 finds `--json` consumers relying on liche-internal fields you
  cannot reproduce (e.g. schema reflection embedded in the envelope).
- More than ~5 commands use liche `input.env`.
- A command's flag PARSING semantics can't be matched (e.g. liche coerces
  "3" → 3 somewhere Effect's integer flag rejects) — report with the
  command name and both behaviors.
- You are editing a handler's business logic to make the shell fit — the
  shell must adapt, not the logic.

## Maintenance notes

- New commands: create the file, add it to the group index — the registry
  test fails if a file exports a command that is not registered (add that
  assertion if cheap).
- `--schema` reflection was dropped with zero consumers (verified
  2026-07-04); if schema reflection is ever wanted again, Effect Schema
  annotations + `effect`'s JsonSchema module are the replacement path.
- Plan 044 removes the remaining zod inside handler bodies; after it, the
  only schema library in the pipeline is Effect Schema.
- Reviewer: spot-check 3 commands per big group for flag-name/default
  parity with the old `defineCommand` inputs — parity bugs here are silent
  (a renamed flag just errors at invocation time).
