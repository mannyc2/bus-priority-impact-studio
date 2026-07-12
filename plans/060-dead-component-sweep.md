# Plan 060: Dead-component sweep + final doctrine ratchet (run LAST)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. This plan is a VERIFY-THEN-DELETE sweep:
> every deletion re-verifies importers at execution time, so drift is
> handled by construction. Run only after plans 051-059 are DONE.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW (every deletion is grep-gated + typecheck-gated)
- **Depends on**: 051-059 all DONE
- **Category**: tech-debt
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Successive design passes left a large orphaned-component layer in
`apps/web/src/components/`. Verified zero-importer as of 2026-07-06 (and
plans 051-059 only remove more consumers, never add them):

- The dead timeline cluster: `route/TimelineSection.tsx` (175 LOC — sole
  importer of `InterventionTimeline.tsx` and `BeforeAfter.tsx`).
- Orphaned viz: `Heatmap.tsx`, `Timeline.tsx`, `CorridorOverlay.tsx` +
  `CorridorOverlay.chart.tsx`, `HourOverlay.tsx` + `HourOverlay.chart.tsx`,
  `TrendOverlay.tsx` + `TrendOverlay.chart.tsx`, `OverlayChart.tsx`
  (imported only by those `.chart` files), `Rail.tsx`,
  `ConfidenceBar.tsx`, `MapThumb.tsx`.
- Likely-dead after the gen-6 plans (verify at execution): `SectionHeader.tsx`
  (every caller migrates to `SectionCard` in 051-059), `KPI.tsx` +
  `Cite.tsx` (plan 053 rewrote the loading page that used `KPISkeleton`;
  `Cite` is imported only by `KPI`), `hourTag`/`formatMapHour` exports in
  `route/maplibre-style.ts` (plan 059 removed the last consumers),
  `route/route-geo-map.ts`/`RouteGeoMap.tsx` remain LIVE (Overview mini
  map) — listed here only so nobody "sweeps" them by mistake.

Dead code in a portfolio repo is reviewer-visible noise; and the plan-050
doctrine allowlist must end EMPTY — this plan asserts the ratchet closed.

## Current state

- Deletion candidates above; verification tool:
  `rg -ln "<Name>" apps/web/src --glob '!**/dev/**'` per component, where
  the only acceptable matches are the component's own file(s).
- `apps/web/src/dev/` demo files may import some candidates
  (`corridor-demo.tsx`, `foundations-demo.tsx`, `studio-bar-demo.tsx`…) —
  demos are dev-only; edit them to drop dead imports rather than keeping
  dead components alive.
- `tests/harness/design-doctrine.test.ts` — `ALLOWLIST` should be empty
  after 051-059.
- Wiki maintenance rule (CLAUDE.md): durable decisions land in
  `knowledge/` — gen-6 completion gets a log line.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |
| Knowledge | `bun run check:knowledge` | exit 0 |

## Scope

**In scope**: deleting the files listed above (each individually
grep-gated), editing `apps/web/src/dev/examples/*` to drop dead imports,
deleting orphaned test files for deleted components, emptying the
plan-050 allowlist, one `knowledge/log.md` entry (+ a line in
`knowledge/wiki/engineering/studio_design_pass_status.md` marking gen-6
complete), `plans/README.md` status rows.

**Out of scope**: ANY component with a live importer (the grep gate
decides, not this list); `maplibre-style.ts` functions still used by
route or network maps; `packages/*`.

## Git workflow

- Branch: `codex/060-dead-component-sweep`
- One commit per cluster is fine. Do NOT push or open a PR unless the
  operator instructed it.

## Steps

### Step 1: Sweep loop

For EACH candidate above, in this order (clusters before their
dependencies — e.g. `TimelineSection` before `InterventionTimeline`/
`BeforeAfter`; `*Overlay.tsx` before `OverlayChart.tsx`):

1. `rg -ln "<ComponentName>" apps/web/src` — if any match is NOT the
   component's own file or a `dev/` demo, SKIP the candidate and record it
   in the status row ("still live: <importer>").
2. Delete the file(s); fix `dev/` demos that imported it (remove the
   import + usage, keep the demo otherwise).
3. `bun --filter @bp/web typecheck` → exit 0 before the next candidate.

Also delete test files whose subject was deleted
(`rg -l "<ComponentName>" apps/web/test` per deletion).

**Verify** (after the loop):
`rg -ln "TimelineSection|InterventionTimeline|BeforeAfter|Heatmap|CorridorOverlay|HourOverlay|TrendOverlay|OverlayChart|ConfidenceBar|MapThumb" apps/web/src`
→ 0 files (or only recorded still-live skips).

### Step 2: Conditional candidates

Same loop for `SectionHeader.tsx`, `KPI.tsx`, `Cite.tsx`, `Rail.tsx`,
`Timeline.tsx`, and the `hourTag`/`formatMapHour` exports (function-level
delete inside `maplibre-style.ts`, only if
`rg -n "hourTag|formatMapHour" apps/web/src` shows no callers outside the
definition). If `SectionHeader` still has callers, list them in the status
row — they are gen-6 stragglers the operator should know about.

### Step 3: Close the doctrine ratchet

Set every `ALLOWLIST` array in `tests/harness/design-doctrine.test.ts` to
`[]`. Run `bun run check:design-doctrine`:
- Pass → the generation's slop is provably gone.
- Fail → a straggler file still carries a banned pattern. Fix the file if
  it is a trivial leftover (one string), otherwise STOP and report the
  file list.

### Step 4: Record + full gate

Add to `knowledge/log.md`:
`## [<date>] design | gen-6 UI cutover complete (plans 048-060)` with one
line naming the doctrine check as the standing guard. Add a matching
one-liner to the design-pass status wiki page.

**Verify**:
`bun --filter @bp/web typecheck && bun run test:web && bun --filter @bp/web build && bun run check:style && bun run check:architecture && bun run check:knowledge`
→ all pass; note the bundle-size delta in the status row (deletions should
shrink `totalJs`).

## Test plan

No new tests — the deliverable is deletions plus the emptied allowlist.
The gate is the full suite + the doctrine check passing with `ALLOWLIST`
empty.

## Done criteria

- [ ] Every candidate either deleted or recorded as still-live with its
      importer
- [ ] `ALLOWLIST` arrays empty; `bun run check:design-doctrine` exit 0
- [ ] Full gate (typecheck, test:web, build, style, architecture,
      knowledge) exit 0
- [ ] `knowledge/log.md` + design-pass status updated
- [ ] No files outside the sweep's verified deletions modified
      (`git status`)
- [ ] `plans/README.md` status rows updated (this plan + any stragglers
      noted)

## STOP conditions

- More than 3 candidates turn out to be still-live — the 051-059 execution
  diverged from plan; report the census instead of continuing.
- Deleting a candidate breaks a WORKER test (`test:worker`) — nothing in
  this sweep should touch worker-visible code; report immediately.
- The doctrine check fails on a file needing more than a one-string fix.

## Maintenance notes

- Future feature work should extend `SectionCard`/`SourceNote`/
  `RouteBadge`/`BoroughBadge` rather than resurrecting swept components;
  the git history keeps them recoverable.
- The empty allowlist is the durable state: any future PR that
  reintroduces an eyebrow kicker, interpunct chain, or banned phrase fails
  `check:architecture` — treat allowlist additions in review as a design
  regression requiring operator sign-off.
