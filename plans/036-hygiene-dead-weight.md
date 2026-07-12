# Plan 036: Remove dead dependencies, dead exports, and root clutter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- package.json apps/web/package.json tools/pipeline-v2/package.json apps/web/src/studio/api-contract.ts packages/analytics/src/evaluation/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (cheap, do first — everything here is verified-dead weight)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The repo carries dependencies that nothing imports, re-exports that nothing
consumes, and root-level directories that are empty or stale. Each one is
small, but together they mislead every future audit ("is pdf-lib used
somewhere?"), inflate `bun.lock`, and hide real signals. This plan deletes
only what a 2026-07-04 read-only audit verified as dead, with the
verification commands inlined so you can re-prove each deletion before
making it.

## Current state

All facts verified 2026-07-04 at commit `ce3baca`:

- **`pdf-lib`** — declared in the root catalog (`package.json:44`) and in
  `tools/pipeline-v2/package.json:29` (`"pdf-lib": "catalog:"`). Zero import
  sites repo-wide.
- **`@tidy-ts/dataframe`** — declared only in the root catalog
  (`package.json:30`). Zero imports, zero package.json consumers. (The
  boundary test `tests/harness/production-boundaries.test.ts:232` *forbids*
  it in analytics — that test line stays; it guards against reintroduction.)
- **`pmtiles`** — declared in `apps/web/package.json` dependencies and the
  root catalog (`package.json:45`). Zero mentions anywhere in `apps/web`
  outside package.json (verified with `rg -il "pmtiles" apps/web --glob
  '!node_modules'` → only `apps/web/package.json`).
- **`shadcn`** — declared in `apps/web/package.json` dependencies. It is the
  shadcn CLI (a code generator), not a runtime library; zero code imports.
- **Dead JSON-schema re-exports in the web app** —
  `apps/web/src/studio/api-contract.ts:1-11` re-exports nine
  `*JsonSchema` values from `@bp/domain/json-schema`. Nothing in `apps/web`
  imports them (verified: `rg -l "JsonSchema" apps/web/src` → only
  `api-contract.ts` itself). The live consumers of `@bp/domain/json-schema`
  are `packages/studio-api/src/schema-routes.ts` and
  `packages/studio-api/src/contracts/openapi.ts` — not the web app.
- **Dead Tier-2 modules in analytics** — the Tier 2 document pipeline was
  deleted 2026-07-03 (commit `7f5c3d9`). Two modules survived it in
  `packages/analytics/src/evaluation/`:
  - `tier2-structured-data.ts` — re-exported by
    `packages/analytics/src/evaluation/index.ts:93`, but no file outside
    `packages/analytics` imports any of its symbols (verified: the only
    `@bp/analytics/evaluation` importers are
    `tools/pipeline-v2/src/commands/check/route-speed-availability.ts`,
    `commands/map/artifacts.ts`, `commands/export/route-capability-manifest.ts`,
    `commands/export/route-dossier-summaries.ts`, none of which import tier2
    symbols).
  - `tier2-mta-wiki-bridge.ts` — re-exported at `evaluation/index.ts:79`;
    same verification needed (step 4 re-proves both).
- **Empty/stale root dirs**: `test/` (empty of files), `tmp/`,
  `test-results/`. Root test globs use `tests/` (plural):
  `package.json:90` → `"test:unit": "bun test packages tools tests"`.
- **Zero-byte SQLite stubs**: `data/local.sqlite`, `data/local-pipeline.sqlite`,
  `data/local-pipeline.db` (repo `data/` root),
  `data/local/bus-reliability.sqlite`, `data/local/bus_priority.sqlite`,
  `data/local/bus-observatory.db`, and
  `data/exports/d1/2026-03/serving.sqlite` — all 0 bytes (each verified with
  `du -b` on 2026-07-04). The live database is `data/local/pipeline.sqlite`
  (170 GB) — DO NOT TOUCH IT.

**Things that look dead but are LIVE — do not remove** (each was claimed
dead by a first-pass audit and disproven on verification):

- `geoclient-current-v2.yaml` (repo root) — referenced as the spec pointer by
  `packages/sources/src/clients/geoclient/client.ts:66`.
- `es-toolkit` — no direct `import` sites in `apps/web/src`, but it is wired
  through `apps/web/vite.config.ts` aliases onto
  `apps/web/vendor/es-toolkit-compat/*.mjs` (recharts dependency shimming).
- `analytics-primer.html` (repo root) — the operator's onboarding document.
- `data/local/pipeline-clean-smoke.sqlite` — clean-rebuild proof DB (10 MB,
  not zero-byte).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (after dep edits) | `bun install` | exit 0, lockfile updated |
| Typecheck web | `bun --filter @bp/web typecheck` | exit 0 |
| Typecheck analytics | `bun --filter @bp/analytics typecheck` | exit 0 |
| Typecheck pipeline | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Unit tests | `bun run test:unit` | all pass |
| Web build + bundle budget | `bun --filter @bp/web build` | exit 0, budget OK |
| Architecture harness | `bun run check:web-architecture` | all pass |

Do NOT run root `bun run check:types` — it OOMs at default heap. Use the
per-package typechecks above.

## Scope

**In scope** (the only files you may modify/delete):
- `package.json` (root — catalog entries only)
- `apps/web/package.json`
- `tools/pipeline-v2/package.json`
- `bun.lock` (via `bun install`, never by hand)
- `apps/web/src/studio/api-contract.ts` (lines 1-11 only)
- `packages/analytics/src/evaluation/tier2-structured-data.ts` (delete)
- `packages/analytics/src/evaluation/tier2-mta-wiki-bridge.ts` (delete, gated)
- `packages/analytics/src/evaluation/index.ts` (remove the two re-export blocks)
- `packages/analytics/test/` — any test file that imports only the two
  deleted modules (delete those test files)
- Root dirs `test/`, `tmp/`, `test-results/` (delete)
- The six zero-byte `.sqlite`/`.db` stub files listed above (delete)

**Out of scope** (do NOT touch):
- `data/local/pipeline.sqlite` and everything else under `data/` not
  explicitly listed. Deleting real data is a different plan (039) and is
  operator-run.
- `geoclient-current-v2.yaml`, `analytics-primer.html`, `es-toolkit`,
  `apps/web/vendor/`.
- `tests/harness/production-boundaries.test.ts` (its forbidden-import list
  stays as a guard).
- Anything related to `@liche/core`, `zod`, `pi-*` deps (plans 037/040/044).
- `knowledge/` except nothing — no wiki updates needed for this plan.

## Git workflow

- Branch: `plan/036-hygiene-dead-weight` (repo convention: short-lived
  branches merged via PR; see `git log --oneline` for message style, e.g.
  "Serve snapshot when v2 manifest fails")
- One commit per step is fine; do not push or open a PR unless the operator
  asked for it.

## Steps

### Step 1: Re-prove and remove the four dead dependencies

For each dep, re-run the proof, then remove:

```bash
rg -l "pdf-lib" apps packages tools tests scripts --glob '!node_modules' -g '*.ts' -g '*.tsx'   # expect: no output
rg -l "@tidy-ts" apps packages tools tests --glob '!node_modules' -g '*.ts' -g '*.tsx'          # expect: no output
rg -il "pmtiles" apps/web --glob '!node_modules' | grep -v package.json                          # expect: no output
rg -l "from \"shadcn\"|from 'shadcn'" apps/web --glob '!node_modules'                            # expect: no output
```

Then delete:
- `"pdf-lib": "^1.17.1"` from the root catalog and `"pdf-lib": "catalog:"`
  from `tools/pipeline-v2/package.json`.
- `"@tidy-ts/dataframe": "^1.5.9"` from the root catalog.
- `"pmtiles": "^4.4.1"` from the root catalog and `"pmtiles": "catalog:"`
  from `apps/web/package.json`.
- `"shadcn": "^4.7.0"` from the root catalog and `"shadcn": "catalog:"` from
  `apps/web/package.json`. (Developers run the shadcn CLI via `bunx shadcn`
  on demand; `components.json` stays.)

Run `bun install`.

**Verify**: `bun install` exits 0; `git diff bun.lock | head` shows the
four packages leaving; `bun --filter @bp/web typecheck` exits 0.

### Step 2: Remove the dead JSON-schema re-export block from the web app

In `apps/web/src/studio/api-contract.ts`, delete lines 1-11 (the
`export { studioInterventionsEvidenceResponseJsonSchema, ... } from
"@bp/domain/json-schema";` block). Re-prove first:

```bash
rg -n "studioRoutesResponseJsonSchema|studioMethodsResponseJsonSchema|studioRouteDetailResponseJsonSchema|studioRouteEvidenceBundleJsonSchema|studioRouteEvidenceIndexJsonSchema|studioRouteHistoryResponseJsonSchema|studioRouteHourlyProfileResponseJsonSchema|studioRouteSpeedHistoryResponseJsonSchema|studioInterventionsEvidenceResponseJsonSchema" apps/web/src --glob '!node_modules' | grep -v api-contract.ts
```
Expect: no output.

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`bun --filter @bp/web build` → exit 0 and bundle budget passes (initial-JS
should not grow; it may shrink slightly).

### Step 3: Delete root clutter dirs and zero-byte DB stubs

```bash
ls test/            # confirm empty (no files)
du -b data/local.sqlite data/local-pipeline.sqlite data/local-pipeline.db data/local/bus-reliability.sqlite data/local/bus_priority.sqlite data/local/bus-observatory.db data/exports/d1/2026-03/serving.sqlite
# confirm every one is exactly 0 bytes
rg -l "bus-observatory|bus_priority.sqlite|bus-reliability.sqlite|local-pipeline" apps packages tools tests scripts --glob '!node_modules' -g '*.ts' -g '*.sh' -g '*.json'
# expect: no output referencing these stub paths (matches on other strings are fine — read any hit before proceeding)
```

Then `rm -rf test/ tmp/ test-results/` and `rm` the seven zero-byte files.
Check `.gitignore` — if `test-results/` or `tmp/` are listed there, leave the
ignore entries alone (they are cheap insurance).

**Verify**: `bun run test:unit` → all pass (proves nothing globbed those
dirs); `bun run check:web-architecture` → all pass (it pins root scripts).

### Step 4: Delete the dead Tier-2 analytics modules

Re-prove both modules are dead at symbol level. For each exported symbol of
`packages/analytics/src/evaluation/tier2-structured-data.ts` and
`tier2-mta-wiki-bridge.ts` (open the files, list their exports), run:

```bash
rg -n "<SymbolName>" apps packages tools tests --glob '!node_modules' -g '*.ts' | grep -v "packages/analytics"
```

Expect: no output for every symbol. If ANY symbol has an external consumer,
STOP for that file (see STOP conditions) and delete only the other.

Then:
1. Delete the two module files.
2. Remove their re-export blocks from
   `packages/analytics/src/evaluation/index.ts` (the blocks ending at
   lines 79 and 93 in the current file).
3. Find and delete analytics tests that only exercised them:
   `rg -l "tier2-structured-data|tier2-mta-wiki-bridge|Tier2" packages/analytics/test`
   — delete matching test files whose imports are now gone (read each first;
   a test that also covers live code gets edited, not deleted).

**Verify**: `bun --filter @bp/analytics typecheck` → exit 0;
`bun --filter @bp/analytics test` → all pass;
`bun --filter @bp/pipeline-v2 typecheck` → exit 0 (proves no pipeline
consumer existed).

### Step 5: Full gate

**Verify**:
- `bun run test:unit` → all pass
- `bun --filter @bp/web build` → exit 0, bundle budget passes
- `bun run check:web-architecture` → all pass
- `git status` → only in-scope files changed

## Test plan

No new tests — this plan only deletes verified-dead code. The existing
suites are the regression net: `test:unit`, `@bp/web build` (bundle budget),
`check:web-architecture`. Every step's proof command doubles as the test
that the deletion was safe.

## Done criteria

- [ ] `rg -l "pdf-lib|@tidy-ts|pmtiles" apps packages tools --glob '!node_modules' -g '*.ts' -g '*.tsx'` → empty, and none of the four deps appear in any `package.json`
- [ ] `apps/web/src/studio/api-contract.ts` no longer references `@bp/domain/json-schema`
- [ ] `packages/analytics/src/evaluation/tier2-structured-data.ts` does not exist; `tier2-mta-wiki-bridge.ts` deleted or STOP-reported
- [ ] Root `test/`, `tmp/`, `test-results/` do not exist; the seven zero-byte DB stubs are gone; `data/local/pipeline.sqlite` untouched (`du -h` still ~170G)
- [ ] `bun run test:unit` exits 0; `bun --filter @bp/web build` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any "expect: no output" proof command returns hits — the dependency or
  symbol has grown a consumer since 2026-07-04. Skip that single deletion,
  finish the rest, and report which proof failed.
- `tier2-mta-wiki-bridge.ts` symbols turn out to be imported by the
  mta-wiki evidence import path (`tools/pipeline-v2/src/commands/studio/
  import-mta-wiki-route-evidence.ts` or `lib/mta-wiki-canonical.ts`) — that
  path is LIVE serving infrastructure; leave the file and report.
- Any file under `data/` you are about to delete is larger than 0 bytes.
- Bundle budget fails after step 2 (should be impossible — report).

## Maintenance notes

- Plan 037 deletes the agent-research tooling and the `pi-agent-core` dep;
  plan 040 deletes `@liche/core`; plan 044 deletes `zod`. Don't touch those
  here.
- The `tests/harness/production-boundaries.test.ts` forbidden-import entries
  for `@tidy-ts/dataframe` remain deliberately — they prevent silent
  reintroduction.
- Reviewer checklist: the diff should be almost entirely deletions plus two
  `package.json` edits per dep; any added line other than in
  `evaluation/index.ts` re-export pruning is suspect.
