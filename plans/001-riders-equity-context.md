# Plan 001: Surface rider equity context on the route detail Riders tab

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- packages/db/src/d1/queries/route-equity-contexts.ts packages/studio-api/src/studio/read-handlers.ts apps/web/src/components/route/RidersSection.tsx apps/web/src/studio/api-contract.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Completion note

Completed on 2026-07-01 against the hard-cutover route-detail stack.

Implementation drift from the original plan:

- The web contract is no longer hand-maintained in `apps/web`; it re-exports
  `@bp/domain` route schemas/types, so `equityContext` was added to
  `packages/domain/src/studio/routes/index.ts`.
- The route detail handler now enriches both rich R2-backed details and
  partial D1 fallback details from `route_equity_context`.
- The Riders tab renders a quiet ruled "Who rides here" ACS strip only when
  at least two fields are present; sparse context renders nothing.

Verification performed:

- `bun --filter @bp/domain typecheck`
- `bun --filter @bp/db typecheck`
- `bun --filter @bp/db test`
- `bun --filter @bp/studio-api typecheck`
- `bun --filter @bp/studio-api test`
- `bun --filter @bp/web typecheck`
- `bun run test:web`
- `bun --filter @bp/web build`
- `bun run test:worker`
- `bun run check:web-architecture`

## Why this matters

The D1 table `route_equity_context` is fully populated (ACS demographics per
route-month: no-vehicle-household share, median income, poverty rate, transit
commuter share, race/ethnicity shares) and has a typed Drizzle query module —
but **zero** API endpoints or pages read it. The route detail "Riders" tab
answers "who bears the slow service?" with ridership counts only. Adding the
equity block turns it into the strongest public-narrative surface in the app
("62% of households along this route have no vehicle") at near-zero serving
cost, because the data is already in the serving database. This is also the
exact framing MTA's equity-driven prioritization uses.

## Current state

- `packages/db/src/d1/schema.ts:492` — `routeEquityContext` table. Columns
  (verified): `routeId`, `month`, `acsYear`, `assignmentGeography`,
  `assignedCountyFips`, `assignedCountyName`, `assignmentMethod`, `tractCount`,
  `totalPopulation`, `occupiedHousingUnits`, `noVehicleHouseholds`,
  `noVehicleHouseholdShare`, `medianHouseholdIncome`, `povertyRate`,
  `publicTransitCommuterShare`, `hispanicShare`, `nonHispanicWhiteShare`,
  `nonHispanicBlackShare`, `nonHispanicAsianShare`. PK = (routeId, month).
- `packages/db/src/d1/queries/route-equity-contexts.ts` — typed row schema
  (`RouteEquityContextRowSchema`), a mapper to camelCase `RouteEquityContext`,
  and one export: `listRouteEquityContexts(db, month)` (line 93) which lists
  ALL routes for a month. There is no per-route variant yet. Note: the
  mapper (`toRouteEquityContext`, ~line 63) nests the four race/ethnicity
  shares into a `raceEthnicityShare: { hispanic, nonHispanicWhite,
  nonHispanicBlack, nonHispanicAsian }` object — this plan's contract subset
  (Step 3) deliberately omits that whole object; do not flatten it into the
  response.
- `packages/studio-api/src/studio/read-handlers.ts:1742` —
  `buildStudioRouteDetailResponseFromD1(env, slug)` builds the route detail
  payload. It already has `env.DB`, resolves `servingMonth` via
  `findLatestStudioServingMonth(createD1ServingDb(env.DB))`, and resolves the
  route via `findStudioRouteIndexSourceRow({ env, slug, baselineMonth: servingMonth })`
  which yields `row.routeId`. It already does a `Promise.all` of parallel
  loads (detector manifest, spines, capability manifest, dossier) around
  line 1768 — the equity lookup joins that `Promise.all`.
- `apps/web/src/components/route/RidersSection.tsx` — the Riders tab. Renders
  ridership metrics from the detail payload and an honest empty state
  (`Alert variant="info"`) when observed data is gated.
- `apps/web/src/studio/api-contract.ts` — the web app's mirror of the studio
  API response types (`StudioRouteDetailResponse` etc.). Check whether it is
  generated or hand-maintained (look for a header comment); if hand-maintained,
  it must be updated in lockstep with the server contract.
- Repo conventions:
  - All public payload shapes are Zod schemas in
    `packages/studio-api` (see how `StudioRouteSpeedHistoryResponseSchema` is
    defined and registered in `packages/studio-api/src/contracts/registry.ts`).
    Match that pattern.
  - UI style: warm-paper tokens. Stat blocks look like `MapStat` in
    `apps/web/src/components/route/RouteMapSection.tsx:169-177` —
    `rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]`,
    mono `tabular-nums` numbers, `text-[11.5px]` muted labels. Match it.
  - **Banned on public pages** (user design verdict 2026-06-12): "data as of
    {date}" chips; judged-word KPI labels (e.g. "Condition"); copy about the
    project's own data coverage. Numeric labels + plain English only.
  - ACS is county-proxy assignment (`assignment_geography: "county_proxy"`,
    `assignment_method: "route_id_prefix" | "unassigned"`). The UI must label
    the block honestly, e.g. "Borough-level ACS estimates (county proxy)" —
    this is a methodological caveat, not internal coverage talk, and it is OK.

## UI/UX specification (authoritative for Step 5's visuals)

The Riders tab answers "who bears the slow service?" — the equity block must
read as **evidence in the page's editorial voice**, not a demographics
widget. Design idiom comes from the canonical mockups' ruled stat strips
(`knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/network-map.jsx:282-289`
and `corridor-geo.jsx:420-435`): hairlines and dividers, **never a grid of
boxes**.

### Anatomy of the "Who rides here" block

Placed after the existing ridership metrics in `RidersSection.tsx`, full
content width:

1. **Section header**, matching the tab's existing `SectionHeader` usage:
   title "Who rides here" with sub "Census context for the neighborhoods
   this route serves." — plain English, no method jargon in the header.
2. **One ruled strip, four cells** — top and bottom hairlines
   (`border-top/bottom: 1px solid var(--bp-color-rule)`), `padding: 12px 0`,
   cells separated by 1px `rule` dividers (`flex` row; under `max-md`, wrap
   to a 2×2 grid keeping the dividers between columns only):
   - Each cell: mono eyebrow label (9.5–10.5px, 600, letter-spacing 0.04em,
     ink-55, uppercase): `NO-VEHICLE HOUSEHOLDS` · `MEDIAN HH INCOME` ·
     `POVERTY RATE` · `TRANSIT COMMUTERS`.
   - Value beneath in 21px/600 tabular mono-numeric
     (`font-mono tabular-nums`, letter-spacing −0.02em, ink): `62%`,
     `$58.4K`, `24%`, `71%`. Format: shares as `Math.round(x*100)%`;
     income via the existing `formatCompact` helper
     (`apps/web/src/components/route/route-derived.ts:112-115`) with a `$`
     prefix.
   - One 10px ink-55 subline per cell giving the citywide comparison IF a
     citywide baseline is trivially available in the payload; otherwise
     omit sublines entirely (all four or none — a half-annotated strip
     looks broken).
   - A null field drops its cell and the strip reflows (3 cells is fine);
     if fewer than 2 fields are non-null, skip the whole block.
3. **Provenance footnote** directly under the strip, one line, 11.5px
   ink-55: `ACS {acsYear} five-year estimates · {assignedCountyName}
   (county-level proxy)`. This is the honest-method caveat; it is NOT a
   "data as of" chip (no border, no background, no chip styling — plain
   muted text).

### What NOT to do

- No cards, no shadows, no background fills — hairlines only.
- No judged words ("high poverty", "transit-dependent") — numbers + neutral
  labels; the reader judges.
- No race/ethnicity shares in this plan (deferred — needs a composition
  design, see Maintenance notes).
- No icons. The mono eyebrow + tabular number IS the visual identity.
- No new colors: everything ink/ink-55 — equity context is context, and in
  this design system saturated color is reserved for performance data.

### Motion & states

- None. This block is static text; it renders with the tab. No skeleton —
  it appears with the rest of the tab's settled content (the tab's existing
  loading behavior is unchanged).
- Absent data → block absent (per above). Never an empty-state alert for
  context data.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| DB typecheck | `bun --filter @bp/db typecheck` | exit 0 |
| DB tests | `bun --filter @bp/db test` | all pass |
| API typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 |
| API tests | `bun --filter @bp/studio-api test` | all pass |
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web build (incl. 168KB bundle budget) | `bun --filter @bp/web build` | exit 0 |

Do NOT run root `bun run check:types` — it OOMs at default node heap. Use the
per-package typecheck commands above.

## Scope

**In scope** (the only files you should modify/create):
- `packages/db/src/d1/queries/route-equity-contexts.ts` (add per-route query)
- `packages/db/test/` (one new test file or extend the existing equity query test if present)
- `packages/studio-api/src/studio/read-handlers.ts`
- The studio-api contract file(s) that define the route detail response schema
  (find where `StudioRouteDetailResponse` is defined; likely under
  `packages/studio-api/src/` contracts)
- `packages/studio-api/test/` (extend route detail handler test)
- `apps/web/src/studio/api-contract.ts` (mirror the contract, if hand-maintained)
- `apps/web/src/components/route/RidersSection.tsx`

**Out of scope** (do NOT touch):
- The pipeline that populates `route_equity_context` — it is already populated.
- `route_month_trend`, hotspots, compare, or any other endpoint.
- The homepage and `/routes` index — equity stays on route detail only.
- D1 schema/migrations — no schema change is needed.

## Git workflow

- Branch: `advisor/001-riders-equity-context` off `main`.
- Commit style: short imperative sentence (match `git log`, e.g. "Lead
  condition KPI with peer framing").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a per-route equity query

In `packages/db/src/d1/queries/route-equity-contexts.ts`, add
`findRouteEquityContext(db: D1ServingDb, routeId: string, month: string): Promise<RouteEquityContext | null>`
reusing the existing row schema + mapper (same select shape as
`listRouteEquityContexts`, plus `.where(and(eq(routeEquityContext.routeId, routeId), eq(routeEquityContext.month, month)))`,
`.limit(1)`). Return `null` when no row matches. Note the existing mapper also
joins source statuses via `listRouteMonthSourceStatuses` — follow whatever the
existing mapper requires.

**Verify**: `bun --filter @bp/db typecheck` → exit 0.

### Step 2: Test the query

Add a test following the structure of an existing test under
`packages/db/test/` that exercises D1 queries (find one touching
`route_month_trend` or source statuses and copy its setup). Cases: (a) returns
the mapped row for a seeded routeId+month; (b) returns `null` for a missing
route.

**Verify**: `bun --filter @bp/db test` → all pass, including 2 new tests.

### Step 3: Extend the route detail contract

Find the Zod schema for the route detail response in `packages/studio-api`
(grep for `StudioRouteDetailResponse`). Add an optional block:

```ts
equityContext: z.object({
  acsYear: z.number().int(),
  assignedCountyName: z.string().nullable(),
  totalPopulation: z.number().int().nullable(),
  noVehicleHouseholdShare: z.number().nullable(),
  medianHouseholdIncome: z.number().nullable(),
  povertyRate: z.number().nullable(),
  publicTransitCommuterShare: z.number().nullable(),
}).nullable()
```

(Subset on purpose: race/ethnicity shares are deferred — see Maintenance
notes.) Register the change wherever the contract feeds OpenAPI
(`packages/studio-api/src/contracts/registry.ts` / `openapi.ts`) following how
existing route-detail fields are handled. If `apps/web/src/studio/api-contract.ts`
is hand-maintained, mirror the field there.

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0.

### Step 4: Populate it in the D1 route detail handler

In `buildStudioRouteDetailResponseFromD1`
(`packages/studio-api/src/studio/read-handlers.ts:1742`), add
`findRouteEquityContext(createD1ServingDb(env.DB), row.routeId, servingMonth)`
to the existing parallel loads (both the rich-detail branch around line 1768
and the fallback branch that follows — inspect both `Promise.all` sites and
attach to each response). Map to the contract subset; pass `null` through when
the query returns `null`. Extend the existing route detail handler test in
`packages/studio-api/test/` with: (a) equity row present → block appears;
(b) absent → `equityContext: null`.

**Verify**: `bun --filter @bp/studio-api test` → all pass.

### Step 5: Render the equity block on the Riders tab

In `apps/web/src/components/route/RidersSection.tsx`, when
`data.equityContext` is non-null, render the "Who rides here" block exactly
per the **UI/UX specification** section above: SectionHeader, one ruled
four-cell strip (hairlines + dividers, mono eyebrows, 21px tabular values,
no cards/colors/icons), and the plain-text ACS provenance footnote.
Null-field and fewer-than-2-fields behavior per the spec. When
`equityContext` is null render nothing (no empty-state alert — this is
context, not a gated capability).

**Verify**: `bun --filter @bp/web typecheck` → exit 0, then
`bun --filter @bp/web build` → exit 0 (bundle budget must still pass).

## Test plan

- `packages/db/test/`: 2 new cases (Step 2).
- `packages/studio-api/test/`: 2 new cases on the detail handler (Step 4),
  modeled on the existing route-detail handler tests in that directory.
- Verification: `bun --filter @bp/db test && bun --filter @bp/studio-api test` → all pass.

## Done criteria

- [ ] `bun --filter @bp/db typecheck && bun --filter @bp/studio-api typecheck && bun --filter @bp/web typecheck` all exit 0
- [ ] `bun --filter @bp/db test && bun --filter @bp/studio-api test` all pass with the 4 new tests
- [ ] `bun --filter @bp/web build` exits 0
- [ ] `grep -rn "equityContext" packages/studio-api/src apps/web/src` shows the field in contract, handler, and RidersSection
- [ ] No "data as of" chip, no judged-word label, no coverage copy added (`grep -rn "data as of" apps/web/src` unchanged)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `route_equity_context` turns out to be empty in the local/dev D1 seed — the
  UI work still lands, but flag it so the operator can check the production
  publish instead of you inventing seed data.
- `apps/web/src/studio/api-contract.ts` turns out to be generated by a codegen
  command you cannot find — report which command regenerates it rather than
  hand-editing a generated file.
- The route detail response schema is snapshot-tested against OpenAPI and the
  snapshot update mechanism is unclear after one attempt.
- Adding the field breaks `audit studio-coverage` or another serving-contract
  gate you cannot resolve by registering the field properly.

## Maintenance notes

- Race/ethnicity shares are deliberately deferred: rendering them well needs a
  design pass (stacked bar, not four stat blocks). The data is already in the
  query module when that design exists.
- If `/compare` later wants equity deltas, reuse `findRouteEquityContext` —
  do not add a second query path.
- Reviewer should scrutinize: the county-proxy footnote wording (honest method
  caveat, not internal coverage talk), and that the equity block renders
  nothing (not an alert) when absent.
