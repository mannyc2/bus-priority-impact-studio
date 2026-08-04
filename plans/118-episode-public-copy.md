# Plan 118: Speak product, not schema — public copy layer for intervention episodes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's status
> row in `plans/README.md` (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`; Plan 117 must be
> merged first (this plan edits the same components and expects its types).
> Branch off current `origin/main` AFTER 117 lands.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/components/interventions/PublicChangeEntry.tsx apps/web/src/components/route/PublicRouteHistory.tsx tests/harness/design-doctrine.test.ts apps/web/test/shared/public-episode-projection.test.ts`
> Plan 117's edits to sibling files are EXPECTED drift. For the four files
> above, compare excerpts to live code; unexplained mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (two test files pin the current strings; honesty rules bound
  what may be suppressed)
- **Depends on**: plans/117-merge-crossroute-episodes.md
- **Category**: bug (copy/doctrine)
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

The public /interventions and route-history surfaces render pipeline and
producer vocabulary verbatim: a provenance eyebrow ("Resolved MTA source
pack" / "Tracker camera-enforcement enrichment") above every entry, component
lines like "Added: Automated bus lane enforcement Automated Camera
Enforcement (ACE) route activationRoute-wide — Exact BX20 route incidence"
(two vocabularies concatenated, then a schema label glued on with only a CSS
margin — copied text and screen readers get no space), a per-placement
disclaimer built by de-underscoring a raw enum ("last confirmed active as of
2026-07-27; this is not a confirmed-current claim." repeated up to 104
times), and a route badge followed by its own lowercase join key
("[BX20] bx20"). The eyebrow also evades the gen-6 design-doctrine lint
("No kicker eyebrows") because the regex only matches `tracking-[0.1{2,4,6}em]`
and this one uses `tracking-[0.04em]` — the first eyebrow to reappear since
gen-6. Archaeology: none of these forms appear in any plan or approved comp;
the operator-approved grammar ("Camera enforcement began April 2026") exists
in the repo but currently lives in dead code.

## Current state

All in `apps/web/src/components/interventions/PublicChangeEntry.tsx` unless
noted; line numbers per `origin/main@e0c00aaf` (Plan 117 may shift them
slightly — anchor by content):

- **Eyebrow** (:72-76):
  ```tsx
  <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.04em] text-[var(--bp-color-ink-40)]">
    {episode.authority === "producer"
      ? "Resolved MTA source pack"
      : "Tracker camera-enforcement enrichment"}
  </div>
  ```
  The entry already carries `<SourceNote entries={sourceEntries(episode)} />`
  (:95-98) — the sanctioned provenance surface.
- **Component sentence** (:216-234, producer branch): four adjacent spans —
  `` `${component.actionLabel}: ${component.treatmentFamilyLabel}` `` then
  `` ` ${component.details}` `` then `{component.extent.label}` (separated
  only by `ml-1.5`) then `` ` — ${component.extent.description}` ``.
  All four values are verbatim producer strings (mapping at
  `tools/pipeline-v2/src/lib/public-intervention-episodes.ts:410-429`).
  Pinned distribution (`tools/pipeline-v2/src/lib/resolved-transit-release-pin.ts:139-154`):
  343 components; `componentActions.unknown: 5` (label "Action not
  established"); `componentExtents.unknown: 138` (label "Exact extent not
  established"), `route_wide: 34`.
- **Disclaimer** (:237-255, `PlacementHistory`):
  ```tsx
  {placement.confirmedCurrent === null
    ? `${placement.stateAsOf.replaceAll("_", " ")} as of ${placement.asOfDate}; this is not a confirmed-current claim.`
    : `Confirmed active as of ${placement.confirmedCurrent.asOfDate}.`}
  ```
  The pinned release has `currentFootprintRows: 0`, so ALL 104 placements
  take the first branch (95 `last_confirmed_active`, 9 `unknown` — the
  latter renders "unknown as of 2026-07-27; …"). `asOfDate` renders raw ISO
  while the rest of the surface formats dates as "July 27, 2026".
- **Badge echo** (:147-162, `RouteRelation`): `<RouteBadge …/>` followed by
  `<span className="font-mono …">{route.routeKey}</span>` — routeKey is the
  lowercase internal join key; `RouteBadge` (`apps/web/src/components/RouteBadge.tsx:47`)
  already renders the display label. Delete the span, nothing else needs it
  (the `<Link>` uses `route.slug`).
- **Tracker summary boilerplate**: every tracker episode's `summary` is the
  builder literal "Tracker-owned MTA camera-enforcement registry event."
  (`public-intervention-episodes.ts:265`), rendered at :80-84. Suppress
  client-side (the artifact is immutable; builder change would need a
  republish and is out of scope).
- **Latent h1 duplication**: `apps/web/src/components/route/PublicRouteHistory.tsx:74-79`
  renders `<RouteBadge …/>` then `<h1>{`${input.routeLabel} history`}</h1>`
  (label twice). Currently latent (`showHeader={false}` at
  `route-detail.tsx:205`) — fix while here.
- **Doctrine lint**: `tests/harness/design-doctrine.test.ts:14-15`:
  ```ts
  const KICKER_CLASS =
    /uppercase[^"'`]*tracking-\[0\.1[246]em\]|tracking-\[0\.1[246]em\][^"'`]*uppercase/;
  ```
  Rule text (:5): "No kicker eyebrows (small uppercase label over a
  heading)". The allowlist is a shrink-only ratchet; its `kicker` list is
  empty. Measured on `e0c00aaf`: extending the tracking alternation to
  `0.0[45]em` catches ONLY the PublicChangeEntry eyebrow — the other
  uppercase sites in the repo use 0.06-0.08em and are column/stat labels,
  not eyebrows. Do NOT widen beyond `0.0[45]em`.
- **Tests pinning current strings**:
  `apps/web/test/shared/public-episode-projection.test.ts:346-354` asserts
  rendered HTML contains "Action not established: Service pattern";
  `packages/domain/test/public-intervention-episodes.test.ts` fixtures carry
  producer labels (fixtures fine — they're schema-side; only the WEB
  assertions change).
- **Honesty constraints (binding, from Plan 106 and the gen-19 rules — the
  plan file lives on main at `plans/106-consume-resolved-transit-public-pack.md`)**:
  - "Do not translate `action: unknown` into an affirmative verb. Neutral
    copy such as 'Recorded change' or the reviewed treatment-family label is
    acceptable; 'added', 'opened', 'began', 'new service', and 'kept running'
    require explicit support from the reviewed producer action/extent."
  - The site may make NO confirmed-current claim: the not-confirmed-current
    disclaimer must survive somewhere on the surface. Hoist it; never delete.
  - Render nothing rather than inventing a value the producer didn't state —
    but an explicit "we don't know" that the producer DID state (unknown
    action/extent) must remain visible in some honest form.
- **Approved grammar reference** (subject-first sentences): the
  `changeHeadline` map at `apps/web/src/studio/network-change-record.ts:106-146`
  ("Bus lane opened", "Camera enforcement began", …) is the operator-approved
  comp wording. Plan 120 may later delete that file's dead half — copy the
  wording you need into the new copy module now.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Scoped tests | `bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 10000` | exit 0 |
| Doctrine harness | `bun run check:design-doctrine` | exit 0 |
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/studio/episode-copy.ts` (create)
- `apps/web/src/components/interventions/PublicChangeEntry.tsx`
- `apps/web/src/components/route/PublicRouteHistory.tsx` (h1 only)
- `tests/harness/design-doctrine.test.ts` (regex + banned phrases only)
- `apps/web/test/shared/public-episode-projection.test.ts`
- New test file `apps/web/test/shared/episode-copy.test.ts`

**Out of scope**:

- `tools/pipeline-v2/**`, `packages/domain/**` — artifact strings stay;
  translation is client-side.
- `PublicInterventions.tsx` group mechanics (117) and `<details>` mechanics
  (119).
- The legacy `route-history-ledger.ts` `humanize()` path — dead-facing;
  Plan 120's territory.

## Git workflow

- Branch off `origin/main` (after 117 merges): `codex/118-episode-public-copy`
- Commit per step, short imperative subjects.
- No push/PR unless the operator instructed it.

## Steps

### Step 1: Create the copy module with tests

`apps/web/src/studio/episode-copy.ts`, pure functions:

- `authorityNote(authority)` → null (we render NO eyebrow; SourceNote is the
  provenance surface). Keep the function anyway as the single place a future
  authority distinction would live, returning null for both today.
- `placementStateLabel(stateAsOf)` → explicit map:
  `last_confirmed_active` → "Last confirmed active",
  `confirmed_inactive` → "Confirmed inactive", `planned` → "Planned",
  `suspended` → "Suspended", `conflicted` → "Conflicting records",
  `unknown` → "Status not established", fallback = de-underscored input
  (never throws on a new enum member).
- `formatEpisodeDay(isoDay)` → reuse the existing day formatter used for
  `date.display` (find it: `rg -n "dayDisplay|formatMonthLabel" apps/web/src/studio` —
  match whatever `public-intervention-episodes`' `dayDisplay` produces,
  e.g. "July 27, 2026"); do not hand-roll a new format.
- `componentSentence(component)` → ONE string for the producer branch:
  - action known: `${actionLabel}: ${treatmentFamilyLabel}` stays as the
    bold lead (the action label is producer-reviewed; keep its verb).
  - `details` included ONLY when it is not a restatement:
    drop it when `details.toLowerCase()` contains the family label lowered,
    or vice versa; when kept, join with " — ".
  - Returns `{ lead: string; detail: string | null; extent: string | null }`
    where `extent` is the extent LINE (see step 2), so the component decides
    layout, the module decides words.
- `extentLine(extent, routeCount)` →
  `route_wide` → "Route-wide"; `unknown` → "Extent not established";
  others → `extent.label` verbatim. Append `extent.description` ONLY when it
  adds information: suppress when it matches
  `/^Exact\s+\S+\s+route incidence$/i` (it names a route already shown as a
  badge). Join label and kept description with " — ".
- `trackerSummaryVisible(summary)` → false for the exact builder boilerplate
  string "Tracker-owned MTA camera-enforcement registry event.", true
  otherwise.

Unit-test every mapping in `apps/web/test/shared/episode-copy.test.ts`
(model file structure on `public-episode-projection.test.ts`).

**Verify**: `bun test apps/web/test/shared/episode-copy.test.ts --timeout 10000` → pass.

### Step 2: Rewire PublicChangeEntry through the module

- Delete the eyebrow block (:72-76).
- `ComponentText` producer branch: render `lead` bold; `detail` muted with a
  real ` — ` separator; `extent` on its OWN muted second line (no more
  margin-glued run-on). Ensure every adjacent text node pair is separated by
  an explicit character (space, em-dash) — acceptance: the rendered
  `textContent` of a component contains no letter-letter seam between fields.
- Tracker branch unchanged except it flows through `componentSentence` too
  (label + detail join).
- Suppress the tracker boilerplate summary via `trackerSummaryVisible`.
- `PlacementHistory`: one leading footnote line inside the disclosure —
  "These are historical placement records; none is a confirmed-current
  claim." — then one `<li>` per DISTINCT `(stateAsOf, asOfDate)` pair:
  `${placementStateLabel(stateAsOf)} as of ${formatEpisodeDay(asOfDate)}`
  with `(×N)` count when N>1. The `confirmedCurrent` branch keeps its
  current sentence but formats the date.
- `RouteRelation`: delete the `routeKey` span (:157-159).
- `PublicRouteHistory.tsx`: h1 becomes `History` (badge already names the
  route).

**Verify**: `bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 10000`
→ update the pinned assertions: the "Action not established: Service
pattern" assertion becomes the new honest form (action-unknown lead per the
honesty constraint — e.g. the family label lead without an invented verb);
add assertions: rendered text contains NO "Resolved MTA source pack", NO
"Tracker camera-enforcement enrichment", NO `route incidence`, NO
"activationRoute-wide" seam (regex `/activationRoute/`), NO raw
`last confirmed active as of 2026-` lowercase form.

### Step 3: Ratchet the doctrine lint

In `tests/harness/design-doctrine.test.ts`:

1. Extend `KICKER_CLASS` alternation from `0\.1[246]em` to
   `(?:0\.1[246]|0\.0[45])em` (both orderings).
2. Add to `BANNED_PHRASES`: `/resolved mta source pack/i`,
   `/camera-enforcement enrichment/i`, `/route incidence/i`.
3. Run the harness. Expected: PASSES with zero new allowlist entries
   (measured on `e0c00aaf`: the only `0.0[45]em` uppercase site is the
   eyebrow you deleted in step 2; other uppercase sites are 0.06-0.08em).
   If it fails on a file you did not touch, STOP (drift added a new eyebrow —
   report it, don't allowlist it).

**Verify**: `bun run check:design-doctrine` → exit 0.

### Step 4: Full gates

`bun test apps/web/test --timeout 15000` → 0; `bun run check:types` → 0;
`bun --filter @bp/web build` → 0; `git status --porcelain` → in-scope only.

## Test plan

- `episode-copy.test.ts`: every enum member of `stateAsOf` maps; unknown
  enum falls back; extent suppression regex hits "Exact BX20 route
  incidence" and misses a genuinely informative description; restatement
  drop is case-insensitive both directions; tracker boilerplate suppressed,
  non-boilerplate summary kept.
- `public-episode-projection.test.ts`: updated renders per step 2's Verify;
  disclaimer dedupe — an episode with 3 placements sharing
  `(last_confirmed_active, 2026-07-27)` renders the footnote once and one
  dated line with "(×3)".
- Doctrine harness green with no allowlist growth.

## Done criteria

- [ ] All five commands exit 0
- [ ] `rg -n "Resolved MTA source pack|camera-enforcement enrichment" apps/web/src` → no matches
- [ ] `rg -n "routeKey}" apps/web/src/components/interventions/PublicChangeEntry.tsx` → no matches (span deleted)
- [ ] `rg -n 'replaceAll\("_", " "\)' apps/web/src/components/interventions` → no matches
- [ ] Doctrine lint contains the widened kicker regex + 3 new banned phrases
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- Excerpt drift beyond Plan 117's expected edits.
- The honesty constraint and a copy rule collide (e.g. suppressing an
  extent.description would hide producer-stated uncertainty with no
  remaining honest signal) — report the specific string rather than choosing.
- Widened kicker regex flags any file other than `PublicChangeEntry.tsx`.
- You find yourself wanting to edit the builder or domain schema — out of
  scope; note it and continue client-side.

## Maintenance notes

- Plan 120 deletes the dead half of `network-change-record.ts` — the
  approved `changeHeadline` wording it holds is now (also) encoded here;
  nothing in 120 may remove `episode-copy.ts`.
- When the producer pack ships a copy-reviewed release (post-mta-wiki
  cleanup), revisit `componentSentence` — the restatement heuristic may
  become unnecessary.
- Reviewer: check the rendered entry with a screen reader once — the
  explicit-separator acceptance is about accessible names, not just visuals.
