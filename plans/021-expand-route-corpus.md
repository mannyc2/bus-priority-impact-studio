# Plan 021: Expand the served route corpus beyond the 12-route pilot

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```sh
> python3 -c "import json; print(len(json.load(open('data/artifacts/studio/v1/routes.json'))['routes']))"
> ```
>
> If this is already well above 12, expansion started — read the batch log
> and continue from the live state instead of restarting.

## Status

- **Priority**: P1
- **Effort**: L (mostly machine time and gate-checking, not code)
- **Risk**: MED
- **Depends on**: plan 019; plan 020 recommended first (each new route then
  arrives with its evidence)
- **Category**: product / data
- **Planned at**: 2026-07-01

## Why this matters

The product promise is "show buses" — but the public app serves **12 routes**
(`M15+, BX12+, B25, BX41, M101, B41, B46+, Q58, M14A+, M14D+, M57, M42`).
The underlying sources are citywide: the segment-speeds dataset covers all
routes, ridership is citywide, MTA-wiki holds route records for 312 routes
(300 currently unmatched purely because the served list is small). A
12-route "studio" reads as a demo; a few hundred route pages with honest
sparse states reads as a real civic data product — which is the portfolio
point.

Route selection is already batch-based (`route build-plan` ranks eligible
routes per batch, `route readiness` gates buildability); expansion is mostly
running batches and holding the serving path to its limits, not writing new
analytics.

## Current state

- `tools/pipeline-v2/src/commands/route/build-plan.ts` — "Rank eligible
  routes for the next build batch", `--max-routes` per batch.
- `route_readiness` D1 table carries eligibility/readiness scores and input
  gaps; `route_batch_status` / `route_batch_built_route` / `route_batch_issue`
  track batch runs.
- Serving: D1 tables are route-count-linear (route_month_trend,
  route_brief_summary, windows, reliability, equity); R2 artifacts are
  per-route (speed spines/histories, now wiki evidence). Cloudflare D1 has a
  10 GB database cap and per-query row realities — measure, don't assume.
- Plan 017 requires every route page to render complete-when-sparse; the
  honest-empty machinery exists (section registry + capability manifest).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rank next batch | `bun --filter @bp/pipeline-v2 cli -- route build-plan --max-routes 25 --json` | ranked route list |
| Readiness | `bun --filter @bp/pipeline-v2 cli -- route readiness --json` | eligibility report |
| Release build | `bun --filter @bp/pipeline-v2 cli -- studio release ... --json` | artifacts written |
| D1 verify | `bun --filter @bp/pipeline-v2 cli -- verify d1 ... --json` | pass |
| Completeness | `bun run check:publish-completeness` | exit 0 |

(Exact release/export invocations: follow
`knowledge/wiki/engineering/cloudflare_operations_runbook.md` — do not guess
flags; the runbook is the authority.)

## Scope

**In scope**:

- Running expansion batches through the existing pipeline
- Measuring and recording serving-size headroom (D1 rows/bytes, R2 object
  counts, worker response sizes, homepage index payload)
- Small fixes that expansion surfaces (index pagination, projection size
  guards) — smallest change that keeps pages fast
- Homepage/route-index UX keeping up with corpus size (grouping by borough,
  a client-side route filter box — the index table already exists)

**Out of scope**:

- New metrics or analytics.
- A search page (deleted in the cutover; a filter box on the index is not a
  search page).
- Redesign work (plan 022).

## Steps

### Step 1: Measure the current per-route cost

Record, for the current 12 routes: D1 rows and bytes per route-linear table,
R2 objects and bytes per route, route-detail response size, homepage index
payload size. Extrapolate to 50 / 150 / 300 routes. Record the table in the
commit message and in `knowledge/log.md`.

**Verify**: the extrapolation table exists and no tier breaches a hard limit
(D1 10 GB; worker response sizes reasonable — route detail should stay well
under 1 MB).

### Step 2: Expand to ~50 routes (tier 1)

Selection: all SBS/`+` routes plus the highest-ridership locals per
`build-plan` ranking — prefer routes with MTA-wiki evidence coverage (the
importer's unmatched list is the lookup). Run the batch, export D1, publish
R2, rerun the wiki-evidence importer (plan 020), deploy, smoke.

**Verify**: `verify d1` + `check:publish-completeness` pass; spot-check 5 new
route pages live, including at least one sparse one (honest-empty states, no
fabricated sections); homepage index renders the larger corpus acceptably.

### Step 3: Expand to the full eligible corpus (tier 2)

Everything `route readiness` marks eligible — expect a few hundred. Batch in
chunks the pipeline can handle overnight; after each chunk, re-verify. If
readiness marks large classes ineligible for fixable reasons (missing
ingest month, absent shapes), record counts and reasons — fixes are their own
follow-ups, not improvised here.

**Verify**: same gates as step 2 per chunk; final corpus count recorded.

### Step 4: Keep discovery usable

At a few hundred routes the homepage index needs: borough grouping (design
has borough colors), a client-side text filter, and stable ordering. Use the
existing index data; no new endpoint unless payload size measured in step 1
demands a slimmer index projection.

**Verify**: web shared tests for the filter; bundle budget passes.

## Test plan

- Pipeline gates per batch (d1 verify, completeness).
- Live smoke per tier (dense route, sparse route, homepage, map).
- Web tests for index filter/grouping.

## Done criteria

- [ ] Served corpus ≥ tier 1 (50) with tier 2 either done or blocked-with-
      reasons recorded per route class.
- [ ] Every served route page renders complete-when-sparse.
- [ ] Wiki-evidence importer rerun; matched count reported (expect ≫12).
- [ ] Size/limit measurements recorded; no cap breached.
- [ ] `plans/README.md` updated.

## STOP conditions

- Any D1/R2/worker limit is projected to be breached before tier 2 — report
  the measurement; the mitigation (slimmer projections, artifact moves) is a
  design decision.
- Route pages for sparse routes render fabricated or misleading sections —
  fix the capability manifest path first; expansion rides on honesty.
- Pipeline batch failures above a handful of routes — stop and report the
  failing class rather than hand-fixing route by route.

## Maintenance notes

- After expansion, the monthly release loop covers the larger corpus —
  runbook timings in `cloudflare_operations_runbook.md` should be re-recorded
  once.
- Plan 020's importer naturally covers new routes on rerun.
