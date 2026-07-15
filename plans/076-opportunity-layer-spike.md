# Plan 076: Opportunity layer — design spike for "where should the next treatment go"

> **Executor instructions**: This is a DESIGN/SPIKE plan — it produces a
> prototype artifact and a decision document, NOT a public feature. Follow the
> steps, honor STOP conditions, and update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- tools/pipeline-v2/src/lib/study-engine packages/domain/src/studio/study.ts`
> This plan consumes plan 074's engine and artifacts; read their landed shapes
> first — they are authoritative over any assumption written here.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW (nothing serves publicly from this plan)
- **Depends on**: plans/074-segment-study-engine.md (DONE, operator anchors reviewed); plans/075-studies-surface.md recommended but not required
- **Category**: direction (design/spike)
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

Evaluation answers "what worked"; a decision layer answers "what next" — the
output a transit agency can act on, and the strongest artifact for the
project's stated goal (a portfolio piece that solves a business problem). The
shape: rank untreated slow, high-ridership segments by expected rider-minutes
saved, transferring effects from comparable studied treatments. Whether that
ranking is credible enough to publish is exactly what this spike determines —
it must be decided by looking at real output, not argued in the abstract.

## Current state

- Studies + index artifacts from plan 074 (`packages/domain/src/studio/study.ts`)
  carry per-treatment effects with CIs, tiers, and treated-segment scopes.
- Segment outcome data: `local_route_segment_speed` (grain and coverage
  documented in plan 074's Current state).
- Exposure data: `local_route_hourly_ridership` (route × month × day-of-week ×
  hour; ~363 routes; find the schema via
  `grep -n "local_route_hourly_ridership" packages/db/src/local/schema.ts`).
  Note: ridership is ROUTE-grain — per-segment rider exposure must be
  approximated (e.g. route ridership × segment share of route trip-time); the
  approximation choice is one of this spike's decisions.
- Treatment presence per segment (to exclude already-treated segments):
  lane-overlap index from `_release-geometry.ts` + treatment summaries
  (`route-treatment-summary.ts` machinery) + plan 073's corpus projection.
- The network map already has an in-map lens toggle
  (`apps/web/src/studio/pages/network-map.tsx:36-37` — lens state
  `"speed" | "riders" | "lanes"`), which is the natural eventual surface for an
  "opportunity" lens — NOT built in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Typecheck | `bun run check:types` | exit 0 |
| Run prototype | `bun run pipeline study opportunity-prototype --analysis-month 2026-03` | writes prototype artifact + NOTE |

## Scope

**In scope**:
- `tools/pipeline-v2/src/lib/study-engine/opportunity.ts` (new, pure scoring functions + unit tests)
- `tools/pipeline-v2/src/commands/study/opportunity-prototype.ts` (new command; writes to `data/artifacts/studio/v2/studies/opportunity-prototype/`)
- `docs/research/opportunity-layer-decision.md` (new: the decision document)

**Out of scope** (do NOT touch):
- `apps/web/**`, `packages/studio-api/**`, `packages/domain/**` — nothing
  serves; no public schema is minted until the operator decides.
- Any wording implying the ranking is a recommendation the MTA/DOT should
  follow — the artifact is an analytical prototype.

## Steps

### Step 1: Scoring function

Implement `opportunityScore(segment)` =
`riderExposure × timeLostPerRider × transferredEffect`, where:
- `timeLostPerRider`: segment travel time minus the borough 75th-percentile
  speed benchmark for comparable segment lengths (document the benchmark
  choice in code comments);
- `transferredEffect`: median relative effect from plan-074 studies of the
  same treatment family with tier `gated_estimate` (if <3 such studies for a
  family, that family is `insufficient_evidence` and scores no segments —
  honesty over coverage);
- `riderExposure`: route-grain ridership apportioned to segments (document the
  apportionment). Unit-test each component with synthetic inputs.

### Step 2: Prototype run + sanity report

The command scores all untreated segments network-wide for `--analysis-month`,
writes: top-200 ranked list (routeId, segment, score, components, the study
IDs the transfer came from) + a distribution report (score histogram, borough
mix, how many segments had `insufficient_evidence` families, top-20 with
plain-language "why this scored high" lines).

**Verify**: `bun --filter @bp/pipeline-v2 test` passes; the run completes; the
top-20 pass a face-validity read (segments on known-slow corridors; no
degenerate ties; no division-by-zero artifacts — assert `Number.isFinite` on
every score).

### Step 3: Decision document, then STOP

Write `docs/research/opportunity-layer-decision.md`: method summary, the
top-20 with commentary, known weaknesses (route-grain ridership apportionment,
effect transfer assumptions, benchmark sensitivity), and 2-3 surfacing options
with tradeoffs — constrained by the operator direction of 2026-07-09 (no new
top-level pages): a map lens on `/map` via the existing lens toggle, a ranked
section on `/interventions`, or a per-route module on route pages. End with an
explicit recommendation and open questions. STOP — the operator decides
whether/how this ships.

## Test plan

Unit tests for the three scoring components + one integration test on a
synthetic 3-route fixture where the correct ranking is known by construction.

## Done criteria

- [ ] Prototype artifact + distribution report written under `data/artifacts/studio/v2/studies/opportunity-prototype/`
- [ ] Every score finite; `insufficient_evidence` families excluded, counted, and reported
- [ ] `docs/research/opportunity-layer-decision.md` exists with top-20 commentary and a recommendation
- [ ] `bun --filter @bp/pipeline-v2 test` and `bun run check:types` exit 0
- [ ] Nothing under `apps/web/` or `packages/` modified (`git status`)
- [ ] `plans/README.md` status row updated (DONE = spike delivered, decision pending)

## STOP conditions

- Fewer than 3 `gated_estimate` studies exist in ANY treatment family — the
  transfer step has no legs; report and recommend revisiting after more
  studies land.
- The top-20 is dominated by data artifacts (terminal segments, one-month
  segments, express highway segments) — report the pattern; do not patch the
  score with special cases mid-spike.

## Maintenance notes

- If the operator green-lights a surface, the build plan should reuse plan
  075's artifact-endpoint + in-card integration patterns; the map lens rides
  the existing lens-toggle machinery. No new top-level page.
- Score components are deliberately separable so future refinements (stop-level
  ridership from master-plan Track A6, CBD geometry) slot in without reshaping
  the artifact.
