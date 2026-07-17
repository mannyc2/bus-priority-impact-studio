# Plan 068: Make the local verification baseline actually run (typecheck OOM, pre-push gate, docs alignment)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- tsconfig.typecheck.json package.json .githooks/pre-push README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none — execute this before any other 068+ plan
- **Category**: dx
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

The repo-wide typecheck (`bun run check:types`) runs one monolithic `tsc`
program spanning apps, packages, tools, and tests, and it exhausts the default
node heap on developer machines. The pre-push hook runs it on every code push,
so the hook either crashes or gets bypassed with `--no-verify` — the gate is
theater. README still tells developers to run the OOM-ing command. Every other
plan in this generation (and gen-7) uses `check:types` as a verification gate,
so this plan must land first: a gate nobody can run is not a gate.

## Current state

- `tsconfig.typecheck.json` — the single typecheck program (whole file):

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["bun", "@cloudflare/workers-types", "vite/client", "vitest"]
  },
  "include": ["apps/**/*.ts", "apps/**/*.tsx", "packages/**/*.ts", "tools/**/*.ts", "tests/**/*.ts", "*.ts"],
  "exclude": ["**/dist/**", "data/**", "knowledge/raw/downloads/**", "node_modules/**"]
}
```

- `package.json:64` — `"check:types": "tsc -p tsconfig.typecheck.json --noEmit --pretty false"` (no memory headroom).
- `package.json:78` — `"check:prepush": "bun run check:types && bun run check:style && bun run check:architecture && bun run test:unit && bun run test:web && bun run test:worker"`.
- `.githooks/pre-push:26-27`:

```sh
printf '%s\n' 'pre-push: code/config changes detected; running typecheck, Biome, architecture, unit, web, and Worker checks.'
bun run check:prepush
```

- README documents `bun run check:types` as the way to typecheck (find the
  exact line with `grep -n "check:types" README.md` — it is in the toolchain /
  verification section).
- CI (`.github/workflows/ci.yml:31-32`) runs the same `bun run check:types` on
  ubuntu-latest and passes — GitHub runners have more headroom than the local
  default heap.
- Repo convention (CLAUDE.md "Verification defaults"): scoped checks per
  package, e.g. `bun --filter <package> test`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (with headroom) | `NODE_OPTIONS="--max-old-space-size=8192" bun run check:types` | exit 0, no output |
| Style | `bun run check:style` | exit 0 |
| Unit tests | `bun run test:unit` | all pass |
| Hook dry-run | `sh .githooks/pre-push` (with `BP_PREPUSH_BASE=main`) | completes, exit 0 |

## Scope

**In scope** (the only files you should modify):
- `package.json` (the `check:types` script line only)
- `README.md` (the verification/toolchain guidance lines only)
- `CLAUDE.md` (one line in "Verification defaults", only if step 4 requires it)

**Out of scope** (do NOT touch):
- `tsconfig.typecheck.json` and `tsconfig.base.json` — do not split into
  project references in this plan; that is a larger change with its own risks.
- `.githooks/pre-push` — once `check:types` completes reliably, the hook is
  correct as written.
- `.github/workflows/ci.yml` — CI already passes; do not change it.
- Any TypeScript source file. If typecheck reveals type errors, that is a STOP.

## Git workflow

- Branch: `advisor/068-verification-baseline` off the current branch.
- One commit; message style matches repo log (short imperative summary, e.g.
  "Verification baseline: heap headroom for check:types; align docs").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reproduce and measure

Run `bun run check:types` as-is. Expected: it crashes with a heap /
out-of-memory error or hangs unreasonably (this is the bug). Then run:

```sh
NODE_OPTIONS="--max-old-space-size=8192" bun run check:types
```

**Verify**: the second command exits 0 with no type errors. Note the wall time.
If it reports actual type errors (not memory failure), STOP and report them —
they are pre-existing and out of scope.

### Step 2: Bake the headroom into the script

In `package.json`, change the `check:types` script to:

```json
"check:types": "NODE_OPTIONS=--max-old-space-size=8192 tsc -p tsconfig.typecheck.json --noEmit --pretty false"
```

(Cross-platform note: this repo's tooling is bash/linux-first — scripts already
use `sh` scripts and `bun`; the env-prefix form is consistent with that. Do not
add `cross-env`.)

**Verify**: `bun run check:types` (no manual NODE_OPTIONS) → exit 0.

### Step 3: Prove the pre-push gate end-to-end

Run the hook exactly as git would:

```sh
BP_PREPUSH_BASE=$(git rev-parse HEAD~1) sh .githooks/pre-push
```

**Verify**: completes with exit 0 (typecheck, Biome, architecture, unit, web,
worker all run). Record total wall time in your report. If total time exceeds
~10 minutes, note it in the maintenance section of your report but do not
change the hook.

### Step 4: Align the docs

- In `README.md`, find the verification guidance (`grep -n "check:types" README.md`).
  Ensure it says `bun run check:types` works and note the memory requirement
  (one sentence: "the repo-wide typecheck needs ~8GB heap; the script sets
  NODE_OPTIONS itself"). Remove any instruction that tells the reader to run
  per-package typechecks *because of OOM* (per-package remains fine as a
  faster scoped option).
- In `CLAUDE.md` "Verification defaults": if it references the OOM workaround,
  update to match reality. If it just says `bun run check:types`, leave it.

**Verify**: `grep -rn "OOM" README.md CLAUDE.md` shows no stale claim that the
command is broken.

## Test plan

No new test files. The verification IS the test: steps 1-3 prove the gate runs
green end-to-end on this machine.

## Done criteria

- [ ] `bun run check:types` exits 0 without manual env vars
- [ ] `BP_PREPUSH_BASE=$(git rev-parse HEAD~1) sh .githooks/pre-push` exits 0
- [ ] `bun run check:style` exits 0 (no accidental formatting damage)
- [ ] README no longer instructs a command that crashes
- [ ] Only `package.json`, `README.md` (and possibly `CLAUDE.md`) modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1's high-heap run reports genuine TypeScript errors → report them; do
  not fix source files under this plan.
- Step 1 still OOMs at 8192MB → report; the fallback (project-references
  split) needs its own plan.
- The machine has <10GB RAM making 8192 unusable → report with the machine's
  actual memory.

## Maintenance notes

- If the repo grows past this heap ceiling again, the durable fix is splitting
  `tsconfig.typecheck.json` into per-workspace project references — deferred
  deliberately (larger blast radius, no current need).
- Reviewer should scrutinize: no change to what is type-checked (same tsconfig,
  same include set) — only memory headroom and docs.
