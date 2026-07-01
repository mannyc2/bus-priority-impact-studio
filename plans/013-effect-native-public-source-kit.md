# Plan 013: Design nyc-transit-kit as an Effect-native official-API monorepo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 58dfaeb..HEAD -- \
>   packages/sources \
>   packages/domain \
>   tools/pipeline-v2/src/cli.ts \
>   tools/pipeline-v2/src/commands/sources \
>   tools/pipeline-v2/src/lib/soda3.ts \
>   knowledge/wiki/engineering/generated_cli_distribution_plan.md \
>   knowledge/wiki/engineering/sources_adapter_cutover_plan.md
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, update this plan first or treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-15

## Why this matters

The useful public project is not a 1:1 extraction from Bus Priority Impact
Studio. It should be designed as its own product: `nyc-transit-kit`, a reusable
Effect-native monorepo for official NYC/MTA transit data APIs, with source
clients, schemas, fixtures, and a curated CLI organized around the official API
families.

This plan intentionally changes the earlier framing: the current bus transit
repo is background research and test material, not the shape to copy. If
`nyc-transit-kit` is implemented well, this repo can later consume it and delete
duplicated client/CLI code, but that downstream migration is not the design
constraint.

## Current state

- `packages/sources/package.json:1-138` is already SDK-shaped but still private:
  it has `"private": true`, exports source files through Bun conditions, and
  depends on workspace `@bp/domain`.

  ```json
  {
    "name": "@bp/sources",
    "private": true,
    "description": "Internal source adapter SDK for Bus Priority Impact Studio ingestion.",
    "exports": {
      "./clients/socrata": {
        "types": "./src/clients/socrata/index.ts",
        "bun": "./src/clients/socrata/index.ts"
      }
    },
    "dependencies": {
      "@bp/domain": "workspace:*",
      "gtfs-realtime-bindings": "1.1.1",
      "zod": "catalog:"
    }
  }
  ```

- `knowledge/wiki/engineering/sources_adapter_cutover_plan.md` is useful prior
  art: it proves the repo already prefers focused source clients, no root export,
  explicit tokens, no env/secrets lookup inside clients, and no SODA2
  compatibility. Treat it as evidence, not as a package map.
- `knowledge/wiki/engineering/generated_cli_distribution_plan.md:15-50` records
  the desired CLI doctrine: runtime TypeScript schema value -> generated IR ->
  OpenAPI/docs/SDK metadata/CLI command tree -> compiled Bun binary -> release
  manifest. It explicitly says OpenAPI is an output, not the input.
- `tools/pipeline-v2/src/cli.ts:12-35` dynamically discovers every internal
  pipeline command with `Bun.Glob("commands/**/*.ts")`. That is right for the
  private pipeline but wrong for public support: the public CLI should expose a
  small curated command tree organized by official API family, not 170 internal
  pipeline commands.
- Existing Effect plans 006-010 were written for in-monorepo migration. Their
  core insight still applies, but the separate-repo path should supersede
  "extract current internals as-is": `nyc-transit-kit` can use Effect natively
  because it has no browser initial-JS budget and no zod legacy surface.
- SODA3 policy: for every Socrata-backed official open-data source, support only
  SODA3 (`/api/v3/views/<dataset_id>/query.*` and `/export.*` style access).
  Do not add SODA2 helpers, aliases, fallback URLs, or migration shims. Official
  non-Socrata APIs, such as GTFS static/realtime endpoints, get their own
  package modules and must not be forced through Socrata abstractions.
- Official Effect docs current at planning time:
  - Effect describes itself as a TypeScript library for complex sync/async
    programs with concurrency, resource safety, typed errors, and observability.
  - `effect/Schema` defines immutable schema values that can decode, encode,
    assert, generate JSON Schema, and support tests.
  - `@effect/cli` is the CLI package; it requires platform packages for
    filesystem/terminal integration.
  - `@effect/platform` has platform-specific packages such as
    `@effect/platform-bun`, `@effect/platform-node`, and browser support; some
    HTTP modules are marked unstable, so pin exact versions and test upgrades.

## Commands you will need

New repo verification (create these scripts in that repo):

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Tests | `bun test` | all pass |
| Lint/format | `bun run check:style` | exit 0 |
| Package audit | `bun run check:package` | exit 0; no workspace/file deps in publishable packages |
| CLI smoke | `bun run cli -- --help` and `bun run cli -- socrata query --help` | help renders, exit 0 |
| Binary smoke | `bun run build:cli && ./dist/<binary> --version --json` | JSON includes version, schema version, git SHA |

## Suggested executor toolkit

- Read Effect official docs before choosing exact APIs:
  - https://effect.website/docs/getting-started/introduction/
  - https://effect.website/docs/schema/introduction/
  - https://effect.website/docs/platform/introduction/
  - https://github.com/Effect-TS/effect/blob/main/packages/cli/README.md
- Use the current repo as behavioral source, not as architecture source. Copy
  fixtures and expected behavior; rewrite implementation in Effect.

## Scope

**In scope**:

- A new repo outside this monorepo. Working directory suggestion:
  `../nyc-transit-kit`.
- New repo packages:
  - `packages/contracts` — shared Effect Schema primitives and CLI envelopes.
  - `packages/soda3` — generic Socrata SODA3 query/export/catalog client and
    SoQL helpers.
  - `packages/mta` — MTA official API clients/contracts: GTFS static,
    GTFS-RT feeds, MTA Open Data dataset descriptors that use `packages/soda3`.
  - `packages/nyc-open-data` — NYC Open Data catalog/dataset descriptors and
    SODA3-backed helpers.
  - `packages/nyc-dot` — NYC DOT official dataset descriptors/adapters for
    transit/street data, using `packages/soda3` where DOT data is hosted on NYC
    Open Data.
  - `packages/cli` — curated public CLI built with `@effect/cli`, grouped by
    official API family.
  - `packages/compat` — optional Promise-returning adapters for non-Effect
    consumers, generated over the Effect implementation.
  - `packages/fixtures` — small public fixtures and contract-test fixtures.
- v0 API families:
  - SODA3 generic client and catalog/search/export/range-probe support.
  - MTA GTFS static and GTFS Realtime fetch/decode/probe support.
  - MTA Open Data dataset descriptors for bus/transit datasets, backed by
    SODA3 only.
  - NYC Open Data catalog and dataset descriptors, backed by SODA3 only.
  - NYC DOT transit/street dataset descriptors, backed by SODA3 only when those
    datasets live on NYC Open Data.
- Optional later consumer adapter for this bus repo, after `nyc-transit-kit`
  stands on its own.

**Out of scope**:

- Do not publish private Bus Priority Studio product logic.
- Do not extract `packages/db`, `packages/analytics`, `packages/applied-research`,
  D1/R2 serving projection code, detector studies, route briefs, or Tier 2
  document corpus logic.
- Do not expose the private `tools/pipeline-v2` command tree as the public CLI.
- Do not make the new repo depend on `@bp/domain`, `@bp/db`, `knowledge/`,
  `data/`, or any workspace path from this monorepo.
- Do not organize packages by this repo's current internal package names.
  Organize by official API/provider family.
- Do not support SODA2 for Socrata/open-data sources.
- Do not add Python, pnpm, FastAPI, hosted Postgres/PostGIS, or a VPS.
- Do not publish to npm/Homebrew until package names, license, README, archive
  audit, and canary install smoke tests are complete.

## Git workflow

For this repo:

- Branch: `codex/013-effect-public-source-kit-plan` if committing the plan.
- Commit message style: sentence-case imperative, matching current history
  (example: `Give the route map real shoreline context and stop ticks`).

For the new repo:

- Branch prefix: `codex/`.
- First commits should be small: scaffold, contracts, one client, CLI skeleton,
  monorepo integration.
- Do not publish public packages until a human approves package names and
  release scope.

## Steps

### Step 1: Decide the public product boundary and official API map

Create a short design document in the new repo, `docs/product-boundary.md`,
with these decisions:

- Repo name: default to `nyc-transit-kit` unless the operator changes it.
- Public package scope and binary name.
- Supported runtime targets:
  - CLI: compiled Bun binary first.
  - Library: Node/Bun ESM first; browser support only for pure URL/schema
    helpers unless explicitly tested.
- Primary API style: Effect-native.
- Compatibility API: Promise wrappers are allowed only as generated facades
  over Effect services.
- Official API family map:
  - Socrata SODA3 generic.
  - MTA official APIs.
  - NYC Open Data official APIs.
  - NYC DOT official dataset surfaces.
- SODA3-only rule for all Socrata-backed datasets.
- Supported public command list for v0, grouped by API family.
- Explicitly unsupported Bus Priority internals.

Use these initial public commands:

```text
<binary> socrata query --domain <domain> --dataset <id> --select <soql> --json
<binary> socrata export --domain <domain> --dataset <id> --format csv --output <path>
<binary> socrata range-probe --domain <domain> --dataset <id> --format csv --range-end <n> --json
<binary> catalog search --domain <domain> --query <text> --json
<binary> mta gtfs-static fetch --url <url> --output <path> --json
<binary> mta gtfs-rt probe --feed <vehicle-positions|trip-updates|alerts> --json
<binary> nyc-open-data dataset info --dataset <id> --json
<binary> nyc-dot dataset info --name <known-dataset> --json
```

**Verify**: `docs/product-boundary.md` exists and states Effect-native primary
API, official API-family package map, and SODA3-only Socrata support. A human
has approved the package scope and binary name before any publish step.

### Step 2: Scaffold the new Effect-native repo

Create the new repo outside this monorepo. Use Bun for package management and
scripts. Add packages:

```text
packages/contracts/
packages/soda3/
packages/mta/
packages/nyc-open-data/
packages/nyc-dot/
packages/cli/
packages/compat/
packages/fixtures/
```

Add dependencies in the new repo only:

- `effect`
- `@effect/cli`
- `@effect/platform`
- `@effect/platform-bun`
- `@effect/platform-node` only if the uncompiled JS CLI is a supported runtime
- `typescript`
- `@biomejs/biome`

Pin exact Effect versions in the root package manager lockfile. The official
platform docs mark some HTTP modules unstable, so do not use version ranges for
the first release.

**Verify**:

```sh
bun install
bun run check:types
bun test
bun run check:style
```

All exit 0 in the new repo.

### Step 3: Define official API contracts with Effect Schema, not zod

In `packages/contracts`, define Effect Schema values for:

- branded API-family IDs and Socrata dataset IDs.
- SODA3 query/export request options.
- SODA3 response metadata/columns/row-count results.
- MTA GTFS static and GTFS-RT fetch/probe results.
- NYC Open Data and NYC DOT dataset descriptor records.
- CLI JSON result envelopes and error envelopes.

Rules:

- Source of truth is `effect/Schema`, not OpenAPI or erased TypeScript types.
- Generate JSON Schema from Effect Schema where package tooling needs a file
  artifact.
- Keep package names aligned with official API/provider families.
- Do not import `@bp/domain`; use plain public strings and public brands.

**Verify**:

```sh
bun test packages/contracts
bun run check:types
```

Tests cover decode/encode for valid records, invalid dataset IDs, SODA2 URL
rejection, MTA GTFS-RT probe envelopes, and generated JSON Schema snapshots.

### Step 4: Implement package clients as Effect services

Implement Effect-native services by official API package:

- `packages/soda3`:
  - SODA3 query and export endpoints.
  - app token passed explicitly through config/layer; never read from env inside
    the client.
  - retry/backoff/timeout through Effect schedules.
  - raw export `Response`/stream access for range probes and downloads.
- SODA3 catalog search/info helpers.
- `packages/mta`:
  - GTFS static fetch/metadata helpers.
  - GTFS Realtime feed fetch/decode/probe helpers with injected decoder for
    tests.
  - MTA Open Data dataset descriptors that call `packages/soda3`.
- `packages/nyc-open-data`:
  - dataset descriptor/catalog helpers that call `packages/soda3`.
- `packages/nyc-dot`:
  - DOT transit/street dataset descriptors and adapters that call
    `packages/soda3` when hosted on NYC Open Data.

Primary function signatures should return `Effect.Effect<Success, TypedError, Services>`.
Typed errors should distinguish:

- invalid input/schema decode failure.
- HTTP non-2xx.
- provider response contract mismatch.
- timeout.
- retry exhaustion.
- filesystem write failure for CLI output paths.

Add Promise compatibility functions in `packages/compat`, but keep them thin:

```ts
export function querySocrataRowsPromise(input: QueryInput): Promise<QueryOutput> {
  return Effect.runPromise(programBuiltFromSourceClient(input));
}
```

**Verify**:

```sh
bun test packages/soda3 packages/mta packages/nyc-open-data packages/nyc-dot packages/compat
bun run check:types
```

Tests use fixtures/injected fetch. No default test may hit live network.

### Step 5: Build the official-API-family Effect CLI

In `packages/cli`, use `@effect/cli` for the command tree and
`@effect/platform-bun` for filesystem/terminal integration. Group commands by
official API family and call the same Effect services as the library.

Requirements:

- Every command supports `--json`.
- Human output is nice-to-read, but JSON output is the stable contract for
  agents and this monorepo.
- Config/secrets:
  - `--app-token` and `SOCRATA_APP_TOKEN` are allowed at the CLI layer.
  - secret values must never be printed.
  - clients receive explicit redacted config.
- Downloads write through temp files and atomic rename.
- `--dry-run` is default for commands that would write files unless the command
  is clearly read-only.
- `--version --json` prints package version, schema version, git SHA, and build
  target.

**Verify**:

```sh
bun run cli -- --help
bun run cli -- socrata query --help
bun run cli -- socrata range-probe --domain data.ny.gov --dataset kufs-yh3x --format csv --range-end 63 --json --dry-run
bun run cli -- mta gtfs-rt probe --feed vehicle-positions --json --dry-run
bun test packages/cli
```

All exit 0; JSON outputs parse through `packages/contracts` schemas.

### Step 6: Add package and binary release guard rails

Add release scaffolding, but do not publish yet:

- Build JS package output to `dist/` with declaration files.
- Build CLI binary with `bun build --compile`.
- Add `CliReleaseManifest` in `packages/contracts`.
- Add package archive audits:
  - no `workspace:`.
  - no `file:`.
  - no `apps/web`, `packages/db`, `tools/pipeline`, `.github`, `node_modules`,
    or private absolute paths.
  - no `.env` or secret-looking files.
  - platform packages contain one binary only if platform packages are created.
- Add install smoke tests from a packed tarball.

**Verify**:

```sh
bun run build
bun run build:cli
bun run check:package
bun run smoke:packed-install
```

All exit 0, and the package audit prints the files included in the archive.

### Step 7: Document downstream consumer adapters

After `nyc-transit-kit` is green as its own project, write
`docs/downstream-adapters.md` in the new repo. This is a design note, not an
implementation requirement for v0.

Include:

- How Bus Priority Impact Studio can replace its current `@bp/sources`
  generic Socrata/MTA/NYC Open Data/DOT clients with `nyc-transit-kit`.
- Which Bus Priority modules should remain local because they are product
  adapters, detector logic, D1/R2 projections, route briefs, or document
  research.
- A deletion checklist for duplicated local code in this repo.
- A compatibility-support policy: downstream projects should import package
  APIs, not reach into `dist/` internals.

**Verify**: `docs/downstream-adapters.md` exists and clearly states that
downstream migration is optional and not part of `nyc-transit-kit` v0 done
criteria.

## Test plan

New repo:

- `packages/contracts/test/schema.test.ts`:
  - valid/invalid source IDs and dataset IDs.
  - SODA2 URL/endpoint fields rejected.
  - MTA GTFS static and GTFS-RT probe envelopes decode.
  - CLI JSON envelopes decode.
- `packages/soda3/test/soda3.test.ts`:
  - SODA3 query URL/body.
  - paging.
  - retry/backoff with test clock or controlled scheduler.
  - app-token header redaction.
  - export range headers.
- `packages/mta/test/*.test.ts`:
  - GTFS static fetch/probe behavior.
  - GTFS-RT decoder injection.
  - MTA Open Data descriptors use SODA3 only.
- `packages/nyc-open-data/test/*.test.ts`:
  - catalog/dataset descriptors use SODA3 only.
- `packages/nyc-dot/test/*.test.ts`:
  - DOT dataset descriptors use SODA3 only where hosted on NYC Open Data.
- `packages/cli/test/cli.test.ts`:
  - help command.
  - `--json` parse contract.
  - dry-run range probe.
  - MTA GTFS-RT dry-run probe.

## Done criteria

- [ ] New repo exists outside this monorepo and has an Effect-native
      implementation (`effect/Schema`, Effect services, `@effect/cli`).
- [ ] Package layout is organized by official API/provider family, not by the
      current Bus Priority monorepo internals.
- [ ] Socrata-backed APIs support SODA3 only; package tests fail on SODA2
      helpers, SODA2 endpoint fields, or `/resource/<dataset>.json` builders.
- [ ] New repo package archives contain no `workspace:`, `file:`, monorepo
      private paths, source maps with private absolute paths, or secrets.
- [ ] New CLI supports the v0 command list and `--json` for every command.
- [ ] New repo tests, typecheck, style, package audit, CLI smoke, and binary
      smoke all pass.
- [ ] `docs/downstream-adapters.md` explains how this bus repo can consume the
      new toolkit later without making that migration part of v0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A proposed public package name or binary name is unavailable or conflicts with
  another maintained project.
- The new repo needs `@bp/domain`, `@bp/db`, `@bp/analytics`,
  `@bp/applied-research`, `knowledge/`, or `data/` to implement a public
  client. That means the boundary is wrong.
- The package structure starts mirroring Bus Priority internals instead of
  official API/provider families.
- An Effect platform API required by the CLI is marked unstable and has no
  pinned-version test coverage.
- A SODA2 fallback, compatibility alias, `/resource/<dataset>.json` builder, or
  SODA2 manifest field is added.
- The public CLI starts growing private pipeline verbs such as detector runs,
  D1/R2 publish, route briefs, or Tier 2 document extraction.
- A live-network test becomes required for the default test suite.
- Internal migration would force changing public Bus Priority API response
  contracts or Worker serving behavior.
- Package archive audit finds workspace/file dependencies, private paths, or
  secret-like files.

## Maintenance notes

- This plan does not require plans 006-010 to land first. If `nyc-transit-kit`
  succeeds, plan 010 may shrink to replacing internal duplicated primitives
  with toolkit consumption rather than adding Effect to this monorepo directly.
- Plan 007 (OpenAPI-generated Studio client types) still has value for the
  Studio app, but it is unrelated to `nyc-transit-kit`.
- Plan 009 (Effect HttpApi Worker migration) is independent. Do not block the
  public toolkit repo on the Worker migration.
- Keep the public repo boring: official API clients, contracts, fixtures, CLI,
  release hygiene. The product-specific magic stays here.
