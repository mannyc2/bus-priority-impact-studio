# Plan 023: Serve the grains we already build — hourly, day-of-week, reliability detail

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```sh
> rg -n 'hourly' packages/studio-api/src/contracts/registry.ts
> ```
>
> A hit means someone started serving hourly data — reconcile first.

## Status

- **Priority**: P2 (P1 for step 1, which plan 022's segment cards want)
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: plan 019
- **Category**: product / serving
- **Planned at**: 2026-07-01

## Why this matters

The pipeline already builds richer grains than the site shows; the product
goal is "the data we have, presented well, with easier analytics." Three
gaps, all pipeline-built and unserved as of 2026-07-01:

1. **Hour-of-day**: `build route-hourly-profile` (hour-of-day speed,
   ridership, excess wait) and `stop-direction-hour-ewt-features` exist as
   artifacts; nothing serves them. The canonical design leans on hour
   framing twice: slow-segment cards carry hour-of-day severity strips
   (`route-public.jsx`) and the network map recolors by hour
   (`geo-data.jsx` `hourSpeed()`).
2. **Day-of-week windows**: `route_brief_peak_window` /
   `route_brief_slowest_window` D1 tables carry top peak/slowest windows
   with `dayOfWeek` — served nowhere on the page.
3. **Observed reliability detail**: `route_observed_reliability_summary`
   carries per-run GTFS-RT samples; the page shows only the headline ratio.

This plan serves them as small typed projections. It deliberately does NOT
ingest anything new (311/weather/collisions stay local-only until a causal
story survives review — `knowledge/index.md` open issue 9 still stands).

## Current state

- Artifacts: `route-hourly-profile` under `data/artifacts/` (per route:
  hour × {speed, ridership, ewt}); EWT features at stop-direction-hour grain.
- D1: window tables above; observed reliability summary with `run_id`
  multi-sample rows.
- Serving pattern to copy: `route-speed-history` — per-route R2 artifact +
  D1 coverage index + registry route spec + typed client call.
- Consumers waiting: plan 022 step 3 (hour strips); network map hour
  scrubber (already has `formatMapHour`/`hourTag` helpers in
  `maplibre-style.ts` — check what it currently scrubs before adding).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build hourly profile | `bun --filter @bp/pipeline-v2 cli -- build route-hourly-profile --json` | artifact written |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test --timeout 5000` | pass |
| API tests | `bun --filter @bp/studio-api test` | pass |
| Worker tests | `bun --filter @bp/web test:worker` | pass |
| Web build | `bun --filter @bp/web build` | budget passes |

## Scope

**In scope**:

- A compact per-route hourly-profile serving projection (R2 artifact keyed
  like speed histories; registry route; typed client)
- Surfacing DOW peak/slowest windows in the route detail response (they are
  already in D1 — projection field + render)
- Observed-reliability sample series in the route detail or reliability
  endpoint (small: months × ratio)
- Rendering: hour strips (plan 022's component), a "when it's slow" hour
  chart in Where & When, DOW window chips, reliability sample sparkline

**Out of scope**:

- New source ingestion (311, weather, collisions, parking).
- Stop-level public pages.
- Map hour-recoloring beyond wiring served data to the existing scrubber
  helpers (a full map redesign is not this plan).

## Steps

### Step 1: Hourly profile projection + endpoint

Trim the hourly-profile artifact to serving size (per route: 24 rows ×
3 metrics × direction split only if cheap). Publish per-route R2 objects,
index like speed-history coverage, add the registry route spec + read
handler + client function. Strict zod schema in `@bp/domain` following the
speed-history contract's shape.

**Verify**: fixture-backed pipeline test; API test (served + missing route);
worker test green.

### Step 2: Render hour data

Wire plan 022's hour-strip component (if 022 landed) and add the Where &
When hour chart via the lazy chart pattern. Real hours, real speeds, no
smoothing that invents data.

**Verify**: shared tests with hourly fixture; budget passes.

### Step 3: DOW windows + reliability samples

Add `peakWindows`/`slowestWindows` (already-shaped D1 rows) and the observed
reliability sample series to the route detail projection; render window
chips in Where & When and a sample sparkline in Reliability. Omit fields
when tables are empty — the capability manifest decides rendering, as
everywhere.

**Verify**: API + shared tests for present/absent cases.

## Test plan

Fixture-first per the house rule: every new projection gets a pipeline
fixture test, an API fixture test, and a web render/empty test. Full
pre-merge gate afterward.

## Done criteria

- [ ] Hourly profile served per route and rendered (strips + hour chart).
- [ ] DOW windows and reliability samples in route detail and rendered.
- [ ] No new ingestion; no fabricated values; empty states honest.
- [ ] All gates pass; `plans/README.md` updated.

## STOP conditions

- The hourly artifact per route exceeds sensible response size (> ~50 KB
  per route after trimming) — report; maybe the grain belongs in a chart
  artifact, not the detail response.
- GTFS-RT-derived fields would render for months with no samples — the
  absence gate must win; never interpolate.
- You are tempted to serve stop-direction-hour EWT wholesale — that is an
  analyst grain, not a public page grain; serve only what a rendered
  component consumes.

## Maintenance notes

- The map hour scrubber can consume the same hourly artifacts later; keep
  the artifact shape hour-keyed so `hourSpeed()`-style lookups stay trivial.
- If 311/weather ever get a reviewed causal story, they enter through this
  plan's pattern: local build → trimmed projection → typed route → honest
  render.
