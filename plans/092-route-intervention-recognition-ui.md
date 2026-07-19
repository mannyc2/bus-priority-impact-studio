# Plan 092: Replace route intervention heuristics with the complete typed inventory and connect route History to `/interventions`

> **Executor instructions**: Follow this plan step by step. Run each
> verification command and confirm its expected result before continuing. If
> a STOP condition occurs, stop and report; do not invent a client-only data
> contract. When done, update this plan's row in `plans/README.md`.
>
> **Dependency check (run first)**: Plan 091 must say `DONE`, and its strict
> per-route bundle, route index, and citywide facet index artifacts must exist.
> Plans 080, 081, 085, and 086
> must also be DONE because they edit `api-client.ts`, route-detail/map
> surfaces, or serving vocabulary touched here. The external exact-route task
> is inherited through Plan 091.
>
> **Drift check**:
> `git diff --stat ac940967..HEAD -- apps/web/src/components/TreatmentBadge.tsx apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/TreatmentsHistorySection.tsx apps/web/src/routes/routes/$routeId.tsx apps/web/src/routes/interventions.tsx apps/web/src/studio/api-contract.ts apps/web/src/studio/api-client.ts apps/web/src/studio/pages/route-detail.tsx apps/web/src/studio/pages/interventions.tsx apps/web/src/studio/treatment-model.ts apps/web/test/shared/api-client.test.ts apps/web/test/shared/interventions-page.test.ts apps/web/test/shared/overview-section.test.ts apps/web/test/shared/treatments-history.test.ts`
>
> Plan 091 and the prerequisite map/serving work are expected to cause drift.
> Compare the live inventory schema/key, route props, and excerpts below. If
> an equivalent exact-identity field or component moved, update references
> only after reporting it. If the semantic contract changed, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (visible route summaries, history reconciliation, URL state,
  and accessibility; bounded by a typed nullable artifact, pure view models,
  exact-route fixtures, and no causal or segment-scope claims)
- **Depends on**: `plans/091-route-intervention-inventory.md` (HARD);
  plans 080, 081, 085, and 086 must be DONE for file sequencing. Plan 090 is
  independent and may land before this plan; Plan 082 must run after this plan
  because both edit Overview, the route loader, and `api-client.ts`.
- **Category**: direction
- **Planned at**: commit `ac940967`, 2026-07-18

## Why this matters

The app already lists hundreds of reviewed intervention records, but route
Overview and History still derive their special treatment badges from four
coarse route fields plus substring checks over diagnosis/proposal prose. A
structured busway event can therefore render as an ordinary bus lane, a prose
mention can become an "active" treatment, and many stop, boarding, service,
pedestrian, and capital treatments appear only as generic text. The compact
badge components also hide overflow behind an inert `+N` title.

Plan 091 supplies the missing route-level truth boundary. This plan makes the
app consume it everywhere a route treatment is acknowledged, while keeping
projects, treatment state, occurrences, source gaps, observations, and study
results visually and semantically separate. It also makes the citywide
ledger discoverable by treatment and exact route, with durable links between
the ledger and route History.

## Current state

### Route badges are partly structured and partly prose-derived

`apps/web/src/studio/treatment-model.ts:124-215` builds one concatenated
`routeText` and uses `.includes(...)` to infer busways, offset lanes, limited
service, boarding/fare changes, stop consolidation, retiming, curb work,
capital work, and proposals. Only lane coverage, ACE, TSP, and SBS come from
route fields. Inferred rows receive hard-coded lifecycle states. This is not
a valid public evidence boundary.

`OverviewSection.tsx:50-60` and
`TreatmentsHistorySection.tsx:85-110` both call `routeTreatments`; the latter
then shows cited Wiki treatments/projects later as a separate generic list
(`TreatmentsHistorySection.tsx:457-489`). A source-backed `busway` with a
generic title can therefore miss the Busway badge even though the structured
event already knows its kind.

### Compact treatment UI hides real breadth

- `apps/web/src/components/TreatmentBadge.tsx:87-90` renders only the first
  three families in `TreatmentBadgeStrip`; the rest become `+N more`.
- `TreatmentBadgeRow` caps Overview and also renders an inert overflow span.
  Neither overflow is keyboard-operable; `title` is the only explanation.
- `TreatmentInventory` can render every family and is the right foundation
  for the full History inventory.
- Plan 081 removes route-level ACE/TSP from segment rows because those values
  have no within-route variation. This plan must not reintroduce them. The
  only route-level compact disclosure belongs on Overview; History is the
  unbounded authoritative view.

### History duplicates the citywide corpus and collapses identity

`TreatmentsHistorySection.tsx:227-260` downloads the full 310-record,
approximately 287 KB uncompressed citywide corpus inside the route tab, then
filters it in the browser. Its join strips `-SBS` and trailing `+`. Timeline
deduplication uses year + inferred treatment family (`:156-177`), and family
inference parses title text (`:210-224`). Distinct occurrences can collapse
while exact services can cross-attach.

The route loader already fetches route detail, route evidence, and optional
studies together (`apps/web/src/routes/routes/$routeId.tsx:29-47`). Match the
nullable artifact-fetch pattern used by `fetchStudioRouteStudies`; aborts
must propagate and an ordinary optional-artifact failure returns `null`.

### `/interventions` is broad but not treatment-discoverable

The current page assembles registry events, Wiki timeline/treatment/project/
gap rows, and the reviewed corpus. It therefore acknowledges broad evidence
in text. But state is local React state, filters are only status and borough
(`apps/web/src/studio/pages/interventions.tsx:38-70,85-123`), and corpus rows
choose only `primaryTreatments[0] ?? customTreatments[0]` as their kind
(`:610-655`). Route links open default Overview, not the matching History
record. `routeJoinKey` strips exact suffixes (`:584-585`).

The tracked `plans/mockups/089-interventions-redesign/interventions-comp.html`
is a design-review artifact with unresolved D22-D27 decisions. Do not treat
its full redesign as approved. This plan adds typed filtering, URL state, and
cross-links inside the current implemented visual language.

## Required presentation semantics

1. **Typed facts only**: treatment presence/state/family comes from
   `StudioRouteInterventionInventoryBundle`; title, diagnosis, detail, source
   prose, and numeric observations never create a treatment.
2. **Separate lanes**:
   - project = the initiative/container, rendered from existing cited route
     evidence and related by Plan 091 IDs;
   - treatment = what changed and its state/scope;
   - occurrence = when a treatment phase happened;
   - observation/study = separate cards/links, never a treatment badge.
3. **All acknowledged, not all promoted**: History lists every typed
   treatment. Overview shows a bounded current/planned summary with an
   accessible disclosure containing every hidden item. The citywide ledger
   remains text-led; do not add a special badge for every row.
4. **Honest absence**:
   - `null` artifact: "Treatment inventory unavailable" and no inferred
     replacement;
   - `partial`: render known rows plus an explicit partial-coverage note;
   - `checked_no_positive_evidence`: say no positive evidence was found in
     checked sources, never "no interventions";
   - source gaps remain their own rows.
5. **Exact route identity**: use the dependency's exact route ref and stable
   slug. B44 and B44+ remain distinct in joins, query state, links, labels,
   and anchors. Never strip or manufacture a suffix.
6. **No segment fanout**: route inventory facts do not render in segment
   rows, segment maps, or segment tables. Plan 081's lane-proximity rules stay
   intact.

## URL contract

Extend `/interventions` with strictly validated, shareable search fields:

```ts
type InterventionsSearch = {
  status?: "all" | "evaluated" | "future" | "source-gap";
  borough?: (typeof ROUTE_INDEX_BOROUGHS)[number] | "All boroughs";
  family?: StudioInterventionTreatmentFamily | "all";
  route?: string; // trimmed slug, 1..96 chars; semantic exact resolution after load
  q?: string;     // trimmed search text, 1..120 chars
};
```

Omit defaults from the URL. Invalid values normalize to defaults. Updating any
filter resets pagination and uses TanStack Router navigation, so back/forward
and copied links reproduce the same view. Search matches route display label,
exact route ID, title, corridor/street, raw treatment label, and source label;
it must not affect treatment classification.

`validateSearch` performs syntax/bounds validation only; it cannot know the
loaded exact-route set. After loader data arrives, resolve `route` against the
exact slug set. A syntactically valid but unknown slug yields an explicit
unmatched filter state with zero matches and a clear-reset action; it never
normalizes to a family neighbor. Limit percent-decoded `record` and existing
`study` values to 1..160 trimmed non-control characters; stable IDs may
contain `:` and must be encoded by the router rather than rewritten.

Extend route-detail History search with optional `record` alongside the
existing `study` key. They are mutually exclusive in links/navigation. If an
external URL supplies both, `study` takes precedence and `record` is ignored;
selecting either target removes the other key. A ledger record link uses:

```text
/routes/<exact-slug>?tab=history&record=<stable-inventory-or-evidence-id>
```

The History model produces a DOM-safe stable anchor from the ID, focuses or
scrolls the matching row after render through one shared reduced-motion-aware
target helper used by both study and record links. It uses `behavior: "auto"`
when `prefers-reduced-motion: reduce`, otherwise the approved smooth behavior,
and applies a visible `:focus-visible` target treatment. Unknown IDs render
the History tab normally.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused web tests | `bun test apps/web/test/shared/api-client.test.ts apps/web/test/shared/route-intervention-model.test.ts apps/web/test/shared/treatment-badge.test.ts apps/web/test/shared/overview-section.test.ts apps/web/test/shared/treatments-history.test.ts apps/web/test/shared/interventions-page.test.ts --timeout 5000` | all pass |
| Web suite | `bun run test:web` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Architecture/doctrine | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Web build | `bun --filter @bp/web build` | exit 0; bundle budgets pass |
| Full gate | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use the `shadcn` skill if available when composing the existing Base UI
  Popover/Input/Select primitives. Do not add a component library.
- Use `vercel-react-best-practices` if available for the pure filter model and
  route-loader wiring; keep filtering memoized by data/search inputs, not by
  duplicated state.

## Scope

**In scope** (the only files to create/modify):

- `apps/web/src/studio/api-contract.ts`
- `apps/web/src/studio/api-client.ts`
- `apps/web/src/studio/treatment-model.ts` (remove route prose inference;
  retain only typed presentation/legacy segment-proxy adapters still required
  after Plan 081)
- `apps/web/src/components/route/route-intervention-model.ts` (new)
- `apps/web/src/components/TreatmentBadge.tsx`
- `apps/web/src/components/route/OverviewSection.tsx`
- `apps/web/src/components/route/TreatmentsHistorySection.tsx`
- `apps/web/src/studio/pages/route-detail.tsx`
- `apps/web/src/routes/routes/$routeId.tsx`
- `apps/web/src/routes/interventions.tsx`
- `apps/web/src/studio/pages/interventions.tsx`
- `apps/web/test/shared/api-client.test.ts`
- `apps/web/test/shared/route-intervention-model.test.ts` (new)
- `apps/web/test/shared/treatment-badge.test.ts` (new)
- `apps/web/test/shared/overview-section.test.ts`
- `apps/web/test/shared/treatments-history.test.ts`
- `apps/web/test/shared/interventions-page.test.ts`
- `knowledge/wiki/engineering/studio_design_pass_status.md`
- `knowledge/wiki/engineering/website_surface_data_plan.md`
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope**:

- Any domain/pipeline schema change; fix Plan 091 instead of adding a private
  web shape.
- Route identity, official route labels, `RouteBadge`, or slug derivation.
- Plan 082 trend markers/real-month axis, Plan 090 observation bundles, and
  Plans 074/075 study calculations/activation.
- Full execution of the unresolved Plan 089 visual comp, a new intervention
  page, forest plots, or redesign of page chrome.
- Segment treatment chips or route-level treatment facts in the segment
  explorer.
- New Worker endpoints, D1 tables, client-side corpus joins on route History,
  prose classification, or candidate/approval changes.

## Git workflow

- Branch: `codex/092-route-intervention-recognition-ui`, from a clean commit
  after Plan 091 and the named sequencing dependencies.
- Commit by logical unit: loader/model; route surfaces; ledger URL/filtering;
  tests/docs. Use imperative messages matching recent history.
- Do not push, deploy, publish data, or open a PR unless separately asked.

## Steps

### Step 1: Fetch and thread the nullable route inventory

1. Re-export the Plan 091 bundle/facet-index domain types in `api-contract.ts`
   and import only the key helper subpath in `api-client.ts`.
2. Add `fetchStudioRouteInterventionInventory(routeSlug, options)` using
   `publicArtifactPath` + `loadNullableStudioJson`. A 404 returns `null`; an
   abort rejects; malformed JSON remains an error.
3. Add the fetch to the route loader's `Promise.all` with the same fail-soft,
   abort-preserving behavior as studies. Thread the typed nullable prop through
   `RouteDetailPage` to Overview and History only.
4. Do not fetch the global corpus from `TreatmentsHistorySection`; remove its
   effect/hook and all browser route-join normalization.
5. Add a nullable citywide facet-index fetch to the `/interventions` loader.
   It is the typed treatment/route join for filtering; do not fetch every
   per-route inventory bundle on that page. If the index is unavailable, keep
   the ledger records visible, disable family filtering with an explicit
   availability note, and never fall back to prose classification.

**Verify**:
`bun test apps/web/test/shared/api-client.test.ts apps/web/test/shared/treatments-history.test.ts --timeout 5000`
→ inventory path/null/abort/malformed tests pass, and History issues no global
corpus request.

### Step 2: Build one pure route intervention view model

Create `route-intervention-model.ts` with pure, exhaustively typed functions
that:

- map every canonical kind/family to presentation metadata (full label,
  compact code only where the existing visual language has one, order,
  neutral/accent treatment, and an optional
  `operationalAnnotationStem`); `other_documented` uses its source-backed raw
  label and has no annotation stem;
- group treatment state without merging distinct treatment IDs;
- order current/implemented before historical, then planned/proposed, then
  source gaps, with stable date/ID tie-breaks;
- build timeline rows from typed occurrences and related existing evidence
  IDs, deduplicating by stable occurrence/record relationship rather than
  year/family;
- retain project rows as projects and source-gap rows as gaps;
- generate DOM-safe stable record anchors;
- return explicit unavailable/partial/checked-empty presentation states.

Export a named pure
`interventionPresentationForTreatment(treatment)` helper returning that
metadata. Annotation stems describe dated operational occurrences, not
families: v1 `automated_bus_lane_enforcement` returns
`"Enforcement starts"`; a kind without reviewed occurrence wording returns
`null`. Plan 082 must resolve its observation `treatmentId` through the
inventory and call this helper. It must not equate Plan 090's analysis-family
enum with this plan's presentation family.

Do not import Recharts, router modules, analytics, or pipeline code. Add a
fixture containing B44 and B44+, two occurrences in one family, a proposed
project, `other_documented`, and a source gap.

**Verify**:
`bun test apps/web/test/shared/route-intervention-model.test.ts --timeout 5000`
→ all exact identity, ordering, relationship, and absence-state tests pass.

### Step 3: Replace Overview and History heuristic treatment models

1. Delete `routeTreatments` and every `.includes(...)` treatment-presence
   branch from the route presentation path. Retain only a narrow, explicitly
   named adapter if Plan 081 still needs lane-proximity presentation for
   segment UI; it must not accept route prose.
2. Overview renders a bounded typed summary. Order by lifecycle then family,
   and use a keyboard-operable `Popover` for `+N more`; the trigger has an
   accessible name, `aria-expanded`, visible focus, and lists every hidden
   treatment with full label and state. Do not place this disclosure inside a
   clickable segment row.
3. History renders the complete unbounded treatment inventory, typed
   occurrence timeline, related cited project records, studies, and source
   gaps in their existing calm-card layout. Add a "Browse this route in all
   interventions" link carrying exact route + optional selected family.
4. Render the three honest coverage states exactly as specified above.

**Verify**:

```sh
bun test apps/web/test/shared/treatment-badge.test.ts apps/web/test/shared/overview-section.test.ts apps/web/test/shared/treatments-history.test.ts --timeout 5000
rg -n "routeText\.includes|routeTreatments\(" apps/web/src/studio apps/web/src/components/route
```

Expected: tests pass; `rg` returns no public route inference matches.

### Step 4: Make `/interventions` filters URL-backed and treatment-aware

1. Add strict `validateSearch` in `apps/web/src/routes/interventions.tsx` and
   pass validated state/navigation callbacks into the page. It trims and
   enforces `q` ≤120 and `route` ≤96 characters; semantic route membership is
   resolved against loader data in the page model. Defaults are omitted from
   the URL; invalid/oversized search values normalize safely.
2. Replace duplicated local filter state with the URL contract. Keep only
   pagination local and reset it whenever validated search changes.
3. Join each ledger row to Plan 091's facet index by stable source record,
   occurrence, treatment, or project relationship ID. Use all returned
   primary/custom/component facets, not element zero. A row matches a family
   when any typed facet belongs to it. `other_documented` remains searchable/
   filterable and displays its raw label in detail/source context. An
   unmatched row remains visible and is counted as an explicit facet gap; do
   not parse its title.
4. Add family, exact route, and text controls using existing Input/Select/
   FilterChips primitives. Preserve live counts after the other active
   filters. Do not add redundant kind badges to every ledger row.
5. Remove `routeJoinKey` suffix stripping. Join with the exact route ref/slug
   supplied by Plan 091/identity task; unresolved records remain visibly
   unmatched rather than attaching to a family neighbor.

**Verify**:
`bun test apps/web/test/shared/interventions-page.test.ts --timeout 5000`
→ filters compose, URLs round-trip, custom treatments remain reachable,
pagination resets, and B44/B44+ do not cross-match.

### Step 5: Add durable ledger ↔ route History links

1. Extend route History search validation with `record` (trimmed, ≤160 chars);
   preserve existing bounded `study` behavior, apply the recorded
   study-over-record precedence when both are supplied, and ignore record keys
   outside the History tab.
2. Change route and title links on ledger records to include
   `tab=history&record=<stable-id>`. Multiple-route records create one exact
   link per route.
3. Give matching History rows stable anchors and route both study/record
   focus-scroll effects through the shared helper. It respects reduced motion,
   sets programmatic focus with a visible target style, and returns focus
   predictably after any disclosure closes. Unknown/deleted anchors degrade
   to the top of History without an error.
4. From a History treatment/family, link back to `/interventions` with the
   exact route and family filters.

**Verify**:
`bun test apps/web/test/shared/interventions-page.test.ts apps/web/test/shared/treatments-history.test.ts --timeout 5000`
→ pure URL/model and SSR anchor structure tests pass for exact route params,
unknown anchors, study precedence, and link generation. Browser focus,
history, and motion behavior is verified in Step 6's explicit checklist.

### Step 6: Accessibility, build, and documentation

Add/verify:

- every compact code has a full accessible treatment + state name;
- overflow is keyboard operable and returns focus when closed;
- no nested interactive controls;
- search/select controls have labels and result counts announced sanely;
- controls wrap/use a single-column layout at 390 px without horizontal
  scrolling;
- missing/partial source states are text, not color-only.

The current web package has no jsdom/Testing Library/Playwright runner, so do
not claim Bun unit or SSR tests prove browser interaction. Unit tests cover
pure URL/filter/presentation models; SSR tests cover labels, anchors, hidden
text, and non-nested structural markup. After the automated gates, perform and
record this browser checklist at desktop and 390 px:

1. Tab to the overflow trigger, open/close it with keyboard, and confirm focus
   returns with a visible focus ring.
2. Activate record and study deep links; confirm the precedence rule, focused
   target, back/forward behavior, and copied URL restoration.
3. Repeat target navigation with reduced motion enabled and confirm no smooth
   scroll occurs.
4. Exercise status/borough/family/route/search controls at 390 px; confirm no
   horizontal overflow and that result-count announcements are not noisy.

Adding an automated browser runner is a separate infrastructure decision; it
is not hidden in this UI plan's dependency or lockfile scope.

Update `studio_design_pass_status.md` and `website_surface_data_plan.md` with
the typed source, exact-link behavior, current Plan 089 boundary, and Plan 082
sequencing. Append an implementation receipt to `knowledge/log.md`.

**Verify**:

```sh
bun run test:web
bun --filter @bp/web build
bun run check:types
bun run check:architecture
bun run check:style
bun run check
```

Expected: all exit 0, with no bundle-budget or doctrine failure.
The browser checklist must also be recorded in the implementation receipt;
an automated gate cannot substitute for an unperformed interaction check.

## Test plan

- Data boundary: null/404, abort, malformed artifact, partial, checked empty,
  complete inventory, and missing citywide facet index with disabled typed
  filter/no prose fallback.
- Recognition: busway with generic prose renders Busway; prose containing
  "busway" with no typed treatment does not; all canonical kinds map once;
  other/custom preserves its label.
- Lifecycle: current, historical, planned/proposed, source-gap, and two
  independent occurrences in one family.
- Exact identity: B44/B44+, Q6/Q06, no `-SBS` manufacture, unmatched record.
- Accessibility automated: full badge names, overflow trigger/content
  structure, no nested button, hidden/announced text, pure reduced-motion
  helper policy. Accessibility browser checklist: focus return, keyboard
  popover, target focus/scroll, reduced motion, announcements, and 390 px
  overflow.
- Discovery/navigation: status + borough + family + route + search compose in
  bounded URL models; pagination resets; exact History-anchor links and
  study-over-record precedence are unit tested; actual back/forward and focus
  restoration are browser-checked.
- Regression: existing study cards/links and source citations still render;
  segment rows receive no route inventory treatment.

## Done criteria

- [ ] Route Overview and History derive treatment presence/state only from the Plan 091 bundle.
- [ ] `interventionPresentationForTreatment` exhaustively maps Plan 091 kinds
      and owns nullable operational annotation stems for Plan 082; no analysis-
      family/presentation-family equivalence is assumed.
- [ ] No route-page prose substring check or suffix-stripping join classifies/attaches an intervention.
- [ ] History lists every typed treatment and occurrence without downloading the global corpus.
- [ ] Compact overflow is accessible and reveals every hidden item; full History remains unbounded.
- [ ] `/interventions` consumes the compact facet index, has shareable exact route/family/search state, and makes every canonical family/custom bucket discoverable without loading every route bundle.
- [ ] Ledger ↔ History deep-links use stable IDs and preserve B44/B44+ separation.
- [ ] Search bounds, post-load exact-route resolution, study-over-record
      precedence, and reduced-motion-aware target behavior match the URL
      contract above.
- [ ] Missing, partial, and checked-empty inventory states are distinct and honest.
- [ ] Pure/SSR automated tests and the recorded browser checklist cover their
      distinct claims; no SSR test is reported as proof of focus, keyboard,
      reduced-motion scrolling, navigation history, or 390 px layout.
- [ ] `bun run check` exits 0 and no out-of-scope file is modified.

## STOP conditions

Stop and report if:

- Plan 091 or a sequencing dependency is not DONE;
- the live bundle lacks exact route identity, lifecycle, raw treatment label,
  occurrence ID, relationship refs, source states, or coverage state needed
  here;
- any UI mapping would need title/detail substring parsing or numeric values;
- exact service links cannot be produced without suffix normalization;
- a requested row needs route-level treatment facts in segment UI;
- the change requires a new Worker/D1 contract, full Plan 089 redesign, study
  activation, or edits outside Scope;
- accessibility/build tests or a verification command fail twice after a
  reasonable fix.

## Maintenance notes

- Adding a canonical kind must fail compilation or an exhaustive registry
  test until it receives a label/family/order. Unknown reviewed values use
  `other_documented` with their raw label; never drop them.
- The ledger is a record browser, not the authority for study admission.
  Treatment filtering must not mutate candidate or effect logic.
- Plan 082 runs after this plan and may reuse the presentation family label
  registry for typed markers, but must consume Plan 090 observations rather
  than the History timeline.
- If the full Plan 089 redesign is later approved, preserve this plan's URL,
  exact identity, typed facet, deep-link, and absence-state contracts while
  changing presentation.
