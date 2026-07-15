# Plan 072: Dependency hygiene pass (`bun update` within semver + re-audit)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- package.json bun.lock`
> If the lockfile changed since this plan was written, re-run `bun audit` and
> reconcile against the advisory list below before proceeding.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (dev/build tooling only; full test suite is the gate)
- **Depends on**: plans/068-verification-baseline.md
- **Category**: migration
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

`bun audit` reports 15 advisories (6 high) — all in dev/build/pipeline tooling
paths, none reachable in the deployed Worker runtime. Cheap to clear the
patchable ones now; the residue gets recorded as accepted risk instead of
resurfacing in every future audit.

## Current state

`bun audit` output at commit `cd878f7` (2026-07-09), summarized:

| Package | Range flagged | Via | Highest severity | Reachability |
|---|---|---|---|---|
| undici | >=7.23.0 <7.28.0 | `@bp/web` → @cloudflare/vite-plugin, wrangler | high (TLS validation bypass via SOCKS5, WebSocket DoS, cross-origin request routing) | dev server / deploy tooling only |
| ws | >=8.0.0 <8.20.1 | `@bp/web` → vite-plugin/wrangler; `@bp/pipeline-v2` → @effect/platform-bun | high (memory-exhaustion DoS) | dev/pipeline tooling |
| linkify-it | <=5.0.0 | `@bp/sources` → @nyc-transit-kit/mta | high (quadratic scan loop) | offline pipeline only |
| @babel/core | <=7.29.0 | `@bp/web` → @vitejs/plugin-react | low | build only |
| esbuild | >=0.27.3 <0.28.1 | `@bp/db` → drizzle-kit; `@bp/web` → vite, wrangler | low (Windows-only dev-server file read) | build only |

Total: 15 vulnerabilities (6 high, 5 moderate, 4 low). Repo facts: bun
workspaces with a version catalog in the root `package.json` (`catalog:`
entries); lockfile `bun.lock`; `@nyc-transit-kit/*` is pinned at `0.2.0` and
governed by plan 047 / ADR-0021 — kit version bumps are explicitly OUT of this
plan's scope (the linkify-it advisory therefore likely remains).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Update within semver | `bun update` | lockfile updated, exit 0 |
| Re-audit | `bun audit` | fewer advisories; see done criteria |
| Full tests | `bun run test` | all three suites pass |
| Web build | `bun --filter @bp/web build` | exit 0, perf budget passes |
| Typecheck | `bun run check:types` | exit 0 |

## Scope

**In scope**:
- `bun.lock` (via `bun update` only — no hand-editing)
- `package.json` / workspace package.json files ONLY if `bun update` itself
  rewrites them (do not hand-bump any version range)

**Out of scope** (do NOT touch):
- `@nyc-transit-kit/*` versions (plan 047 / ADR-0021 governs; the linkify-it
  advisory rides on it and is accepted for now)
- `effect` / `@effect/platform-bun` version pins (`4.0.0-beta.92` is a decided
  posture per ADR-0019/0020 — do not bump toward a newer beta or stable here)
- `typescript`, `drizzle-kit` pins — decided/dev-only; not this plan
- `bun update --latest` (breaking-range updates) — never

## Git workflow

- Branch: `advisor/072-dependency-hygiene` off the current branch.
- One commit, e.g. "Deps: bun update within semver; record remaining audit residue".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Update within semver

Run `bun update`. Then `git diff --stat` — expect changes to `bun.lock` and
possibly caret-range manifests. If `effect` or `@nyc-transit-kit/*` resolved
versions changed, STOP (their pins are exact; a change means something is
mis-declared — report it).

**Verify**: `bun update` exits 0; the two pinned families above are unchanged
in the lockfile diff.

### Step 2: Re-audit and record

Run `bun audit`. Expected: undici/ws/babel/esbuild advisories clear IF the
intermediate dependents (wrangler, @cloudflare/vite-plugin, vite,
@effect/platform-bun) declare ranges that admit the patched versions. Any
advisory that remains, record verbatim in this plan file under a new
"## Residual advisories (accepted <date>)" section with one line each on why
it is accepted (unreachable-in-runtime path + which pin blocks the fix).

**Verify**: `bun audit` output captured; every remaining advisory has a
written acceptance line in this file.

### Step 3: Prove nothing broke

Run, in order: `bun run check:types`, `bun run test`,
`bun --filter @bp/web build`, and `bun run serve:web-smoke` (load `/` and
`/map` once).

**Verify**: all exit 0; smoke pages respond.

## Test plan

No new tests — the existing full suite plus the web build (which includes the
perf-budget check) is the regression gate for a lockfile-only change.

## Done criteria

- [ ] `bun audit` reports strictly fewer advisories than the 15 recorded above, OR every remaining one has an acceptance line in this file
- [ ] `bun run test` exits 0 (unit + web + worker)
- [ ] `bun --filter @bp/web build` exits 0
- [ ] No hand-edited version ranges (`git diff package.json` shows only tool-written changes, if any)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `bun update` changes the resolved version of `effect`,
  `@effect/platform-bun`, or any `@nyc-transit-kit/*` package.
- Any test suite or the web build fails after the update and a single retry —
  report the failing package and the lockfile delta; do not start pinning
  resolutions ad hoc.

## Residual advisories (accepted 2026-07-11)

- `markdown-it` GHSA-6v5v-wf23-fmfq (moderate): offline source parsing only; the exact `@nyc-transit-kit/mta@0.2.0` pin blocks the upstream change.
- `linkify-it` GHSA-22p9-wv53-3rq4 (high): offline source parsing only; the exact `@nyc-transit-kit/mta@0.2.0` pin blocks the upstream change.
- `undici` GHSA-vmh5-mc38-953g (high): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `undici` GHSA-p88m-4jfj-68fv (moderate): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `undici` GHSA-vxpw-j846-p89q (high): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `undici` GHSA-hm92-r4w5-c3mj (high): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `undici` GHSA-35p6-xmwp-9g52 (low): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `undici` GHSA-g8m3-5g58-fq7m (low): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `undici` GHSA-pr7r-676h-xcf6 (moderate): dev/deploy tooling through Cloudflare Vite/Wrangler only; admitted compatible ranges still resolve below the patched release.
- `@babel/core` GHSA-4x5r-pxfx-6jf8 (low): build-only through `@vitejs/plugin-react`; its compatible dependency range still resolves below the patched release.
- `ws` GHSA-58qx-3vcg-4xpx (moderate): dev/pipeline tooling only; Cloudflare tooling and the decided `@effect/platform-bun@4.0.0-beta.92` pin block a complete upgrade.
- `ws` GHSA-96hv-2xvq-fx4p (high): dev/pipeline tooling only; Cloudflare tooling and the decided `@effect/platform-bun@4.0.0-beta.92` pin block a complete upgrade.
- `esbuild` GHSA-g7r4-m6w7-qqqr (low): Windows-only development-server exposure through Drizzle/Vite/Wrangler; compatible upstream ranges still retain `0.27.3` copies.

## Maintenance notes

- Re-run `bun audit` whenever wrangler/vite majors are bumped; the undici/ws
  advisories live under them.
- The linkify-it advisory clears only via a kit release; fold it into the next
  plan-047-governed kit bump.
