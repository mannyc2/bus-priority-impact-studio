# Plan 029: nyc-transit-kit — align the Effect pin, then adopt (unblocks 014)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> Supersedes plan 014's BLOCKED status. 014's adoption mechanics (which
> clients to delete, what stays local) remain the playbook; read it first.
> Step 1 happens in `/mnt/models/dev/nyc-transit-kit`, which the operator
> owns — cross-repo work is in scope for this plan.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: plan 019; plan 027 step 1-2 recommended first (the retry
  seam the kit's clients get called through)
- **Category**: consolidation
- **Planned at**: 2026-07-01

## Why this matters

Plan 014's goal stands: delete this repo's duplicated generic source
clients (`packages/sources/src/clients/socrata/**` SODA3 query/export/
catalog, `packages/sources/src/gtfs-realtime/**` protobuf decoding, the
duplicated SODA3 request in `packages/studio-api/src/source-refresh.ts`)
in favor of the published `nyc-transit-kit` packages — keeping local only
the Bus-specific normalizers, manifest/registry, and probes.
`packages/sources` is 5.8 kLOC; the generic-client share is roughly half.

The only blocker was a version pin: `@nyc-transit-kit/*@0.1.1` pins
`effect@4.0.0-beta.83`; this repo's catalog is `4.0.0-beta.92`. The kit is
the operator's own local repo (`/mnt/models/dev/nyc-transit-kit`,
`private: true`), so the fix is a pin bump and release there — not a
workaround here. Plan 014's prohibition on dual-beta installs stays.

## Current state

- Kit: `/mnt/models/dev/nyc-transit-kit`, version 0.1.1, workspace catalog
  pins `effect: 4.0.0-beta.83`, `@effect/platform-bun: 4.0.0-beta.83`; has
  its own `check` suite (`check:types`, `check:effect`, `check:style`,
  tests, `check:package`).
- This repo: catalog `effect: 4.0.0-beta.92`; consumers listed in plan 014
  (13+ pipeline commands import `@bp/sources/clients/socrata` subpaths).
- Known parity gap from the 014 audit: the kit's catalog API does not cover
  the rich catalog search (posting frequency, granularity, agency) that
  `sources:catalog-search` uses — decide, don't drift.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Kit check (in kit repo) | `cd /mnt/models/dev/nyc-transit-kit && bun run check` | exit 0 |
| Install here | `bun install` | exit 0, single effect version |
| Dedupe proof | `rg '"effect"' bun.lock` / lockfile inspection | one resolved version |
| Sources tests | `bun --filter @bp/sources test` | pass |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test --timeout 5000` | pass |
| API tests | `bun --filter @bp/studio-api test` | pass |

## Steps

### Step 1: Bump and release the kit (in /mnt/models/dev/nyc-transit-kit)

Update the kit's catalog to `effect@4.0.0-beta.92` /
`@effect/platform-bun@4.0.0-beta.92`, run its full `bun run check`, fix
Effect-beta API fallout there (beta.83→92 moved some platform module
names — the kit's own vendored reference and this repo's `.repos/effect`
help). Version to 0.1.2 and publish/pack the way 0.1.1 was published
(inspect how this repo would consume it — registry or `bun link`/file dep —
and match; record the choice).

**Verify**: kit `bun run check` exits 0 at the new pin.

### Step 2: Adopt per plan 014

Follow 014's steps in this repo: add the kit deps, migrate the SODA3
query/export/catalog call sites and GTFS-RT decoding, delete the local
generic clients, keep normalizers/manifest/probes local. For the
catalog-search parity gap: keep the local rich catalog-search client (it is
Bus-specific analysis tooling) unless the kit grew the capability — note
which way it went.

**Verify**: sources/pipeline/API tests pass; one live fixture-backed ingest
command produces unchanged output; `rg -n 'clients/socrata' packages tools`
shows only intentionally-kept modules.

### Step 3: Record

LOC delta, kept-local list, and the kit version pin recorded in
`knowledge/log.md`; update plan 014's README row to SUPERSEDED-BY-029.

## Done criteria

- [ ] Kit at effect beta.92, checks green, released as 0.1.2.
- [ ] This repo consumes the kit; duplicated generic clients deleted.
- [ ] Single effect version in the lockfile.
- [ ] All gates pass; `plans/README.md` updated (029 + 014).

## STOP conditions

- The beta.83→92 fallout in the kit is more than mechanical (behavioral
  changes in platform HTTP) — report from the kit repo before adapting.
- Any consumer needs SODA2 or behavior the kit deliberately dropped —
  that is a kit design question, not a shim to write here.
- Two effect versions end up in the lockfile — stop; that is the exact
  state 014 prohibited.

## Maintenance notes

- Future kit upgrades ride the same seam: bump kit, run this repo's
  sources/pipeline suites, done.
- If plan 026 landed, the worker also has Effect pinned via the same
  catalog — keep the catalog the single version authority.
