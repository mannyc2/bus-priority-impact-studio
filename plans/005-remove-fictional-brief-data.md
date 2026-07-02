# Plan 005: Remove fabricated data from the brief evidence and history pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- apps/web/src/studio/pages/brief-workflows.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / direction
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Completion note

Completed on 2026-07-01 by the product hard cutover. The legacy brief
authoring, review, evidence, and history routes/components were deleted rather
than rebuilt, including `apps/web/src/studio/pages/brief-workflows.tsx`,
`apps/web/src/routes/briefs/$briefId/evidence.tsx`, and
`apps/web/src/routes/briefs/$briefId/history.tsx`.

Verification performed:

- `test -e apps/web/src/studio/pages/brief-workflows.tsx` returned missing.
- `rg -n 'brief-workflows|BriefEvidencePage|BriefHistoryPage|/briefs/.*/evidence|/briefs/.*/history|BriefComposerPage|BriefReviewPage' apps/web/src apps/web/test packages/studio-api/src packages/studio-api/test` returned no matches.
- `rg -n '6\.2|5\.8|v0\.4|v0\.3|last edit 2 hours ago|chip="IN REVIEW"|BriefEvidencePage|BriefHistoryPage|brief-workflows|brief evidence|brief history' apps/web/src apps/web/test packages/studio-api/src packages/studio-api/test` found no legacy brief-surface matches. Remaining numeric literals are in unrelated tests, demos, fixtures, or route visual components.

The done criteria that mention rendering Evidence/History pages are satisfied
by removal: those public pages no longer exist, so they cannot publish
fabricated brief evidence/history content.

## Why this matters

This product's entire pitch is evidence discipline — and two pages render
**fabricated numbers**. The brief Evidence page shows a hardcoded
"Speed by hour and day" heatmap (literal number arrays in JSX, labeled
"MTA segment speeds") and the brief History page hardcodes a version chip,
"last edit 2 hours ago", and fallback versions like "v0.4". For a portfolio
piece reviewed by data professionals, one spotted fake figure poisons trust
in every real one. The fix: every figure either binds to served data or the
section honestly disappears. Fictional data is strictly worse than absence.

## Current state

All in `apps/web/src/studio/pages/brief-workflows.tsx` (verified at 58dfaeb):

- `BriefEvidencePage` (lines 21–74): receives
  `data: StudioBriefEvidenceResponse | null` from the real endpoint
  (`GET /api/v1/studio/briefs/{id}/evidence`, served from R2
  `studio/v1/briefs/{id}/evidence.json` — see
  `packages/studio-api/src/studio/read-handlers.ts:2839-2854`). It uses
  `data.heading` for the header, then renders a **hardcoded** heatmap:

  ```tsx
  // lines 44–57
  <ChartFrame title="Speed by hour and day" source="MTA segment speeds">
    <Heatmap
      rows={["Mon", "Tue", "Wed", "Thu", "Fri"]}
      cols={["6", "7", "8", "9", "16", "17", "18", "19"]}
      values={[
        [6.2, 5.8, 5.1, 4.8, 4.4, 4.2, 4.5, 5.1],
        ...
  ```

  plus a static "Computation" panel (lines 59–70) whose prose is generic.
- `BriefHistoryPage` (lines 100+): uses real `data.versions` but with
  fictional fallbacks and hardcoded chrome:

  ```tsx
  // lines 104–115
  const versions = data.versions;
  const [activeB, setActiveB] = useState<string>(versions[0]?.v ?? "v0.4");
  const versionA = versions[1]?.v ?? "v0.3";
  ...
  <BriefHeadingBar heading={heading} chip="IN REVIEW" chipTone="warn"
    hint="last edit 2 hours ago">
  ```

  Read the rest of the function before editing: the diff display below
  (a `DiffClaim`-style block) is reported to be fully hardcoded example
  content — verify line by line which parts read `data` and which are
  literals.
- The real evidence payload shape: read `StudioBriefEvidenceResponse` in
  `apps/web/src/studio/api-contract.ts` (and its server source — grep
  `packages/studio-api/src` for `BriefEvidenceResponse`) to learn exactly
  what IS available (citations, quotes, provenance, figure refs). Design the
  page around what exists.
- Convention for honest absence: `apps/web/src/components/route/HonestEmptySection.tsx`
  and the muted one-line fallback pattern
  (`RouteMapSection.tsx:150-155`). Public pages never show placeholder data;
  they show less, honestly.
- Related design canon: the brief surfaces follow "Authoring v2 (converged)"
  (`knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/authoring-v2.jsx`,
  `brief-public.jsx`). Banned: evidence shelf, scoring meters, drag-reorder,
  chat UI.

## UI/UX specification (authoritative for Steps 2–3's visuals)

Deleting the fake figure is half the job; the other half is making what
remains look **deliberate** — an evidence ledger in the product's editorial
voice, not a stripped page. The brief surfaces follow the "Authoring v2
(converged)" canon; the idiom for citations and provenance is already on
the brief reading page (`/briefs/$briefId` — open it and match its
components before styling anything new).

### Evidence page — target layout

Keep the existing header (RouteBadge + title + back-link). Replace the
two-column chart/panel grid with a single reading column (max-width
~760px, same measure as the brief article body):

1. **Ledger header**: title "Evidence" (15px/600) with a right-aligned mono
   count `({n} items)` (11px, ink-55). If the payload groups evidence by
   claim or section, render one group per heading (12.5px/600 with a
   hairline above, 20px padding-top) in payload order.
2. **Evidence rows** — one per item, separated by hairlines
   (`border-bottom: 1px solid var(--bp-color-rule)`), padding 14px 0,
   no cards:
   - Left gutter (fixed ~28px): a two-digit mono index `01` (10.5px, 700,
     ink-40) — the same row-index idiom as the canonical rank list
     (`…/03-canonical/bus-priority-impact-studio/project/network-map.jsx:325`).
   - Body: the citation/quote text at 13px/1.55 ink. If the item is a
     quote, set it in the reading page's quote treatment (check
     `/briefs/$briefId`'s section renderer for an existing blockquote
     style; match it exactly — likely a 2px ink-20 left rule + italic).
   - Provenance line beneath (11px mono ink-55):
     `{source label} · {document/page ref}` — whatever reference fields
     the payload actually has, joined with ` · `. If the item has a URL,
     the source label is a link in `--bp-color-accent`, no underline,
     underline on hover.
   - Optional metric chips ONLY for typed fields the payload carries
     (e.g. a metric name + value): the corridor-geo "In place" chip style
     (`corridor-geo.jsx:292-295`) — 10.5px/600, colored text on
     `color-mix(in oklch, <tone> 12%, var(--bp-color-card))`, 6px dot.
     Tone: neutral ink unless the payload types it.
3. **Honest empty**: if the payload has zero items — centered in the
   reading column, 12.5px ink-55: "Evidence for this brief has not been
   published yet." Nothing else. (No illustration, no icon.)

Banned on this page: any figure not bound to payload numbers; scoring
meters/strength bars; card grids; colored backgrounds behind rows.

### History page — target layout

1. **Heading bar**: keep `BriefHeadingBar` but chip/hint become
   payload-driven per Step 3 — when the payload has no status/timestamp,
   the bar renders title + route badge only (verify it looks balanced with
   both props absent; if it collapses awkwardly, right-align the back-link
   in the freed space).
2. **Version rail**: a vertical list (NOT tabs) of version rows, newest
   first, each: mono version id `v{…}` (11px/700) in an ink chip when
   active / ink-06 chip otherwise, the version label or change summary
   (12.5px ink), and a mono timestamp (10.5px ink-55) — only fields the
   payload has. Clicking selects the version; selection state =
   `inset 2px 0 0 var(--bp-color-ink)` left bar + ink-06 wash, exactly the
   rank-list active treatment (`network-map.jsx:321-323`).
3. **Comparison area**: with ≥ 2 versions AND diffable payload content,
   render what the payload supports. With < 2 versions: one muted line
   "No earlier versions to compare." in the area where the diff would be —
   the page stays composed (header + rail + line), it does not collapse.
4. No relative-time fiction: timestamps render as absolute dates
   (`2026-06-12`) — the repo has no live "x hours ago" infrastructure on
   this page, and fake freshness is this plan's whole enemy.

### Motion & states

- None added. These are reading surfaces; the only transitions are link
  hover underlines and the version-row selection wash (0.12s background,
  matching `network-map.jsx:323`).
- Loading states: unchanged from however the route loaders currently
  gate these pages (do not add skeletons in this plan).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web build | `bun --filter @bp/web build` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | open /briefs → a brief → Evidence / History |

## Scope

**In scope**:
- `apps/web/src/studio/pages/brief-workflows.tsx`
- A small new component file only if extraction keeps the page readable
  (e.g. `apps/web/src/components/brief/EvidenceList.tsx`)

**Out of scope** (do NOT touch):
- `BriefComposerPage` / `BriefReviewPage` (lines 76–98) — live D1-backed
  surfaces, working.
- The studio API and R2 evidence artifacts — render what's served; do not
  change what's served.
- `Heatmap.tsx`, `ChartFrame.tsx` components themselves.
- The brief reading page (`/briefs/$briefId`) — already real.

## Git workflow

- Branch: `advisor/005-remove-fictional-brief-data` off `main`.
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Map the real evidence payload

Read `StudioBriefEvidenceResponse` end to end (web contract + server schema +
one real fixture if present under test fixtures — grep
`packages/studio-api/test` for `evidence`). Write down (in your report) which
fields exist: citations? quotes? metric refs? figure specs? This determines
Step 2's shape.

**Verify**: you can name the payload's top-level fields from the schema, not
from guesses.

### Step 2: Rebuild BriefEvidencePage from served data only

Replace lines 43–71 with a layout driven entirely by the payload:

- Render the evidence items the payload actually carries (citations/quotes
  with source labels and links if present), styled like the existing
  right-rail evidence affordances on the brief reading page (open
  `apps/web/src/routes/briefs/$briefId.tsx` and follow its components for the
  idiom).
- DELETE the hardcoded `Heatmap` block entirely. Do not replace it with
  another figure unless the payload contains figure-able numbers; a missing
  figure is acceptable, a fake one is not.
- Keep the "Computation" panel ONLY if its text can be sourced from the
  payload (e.g. a methods note field); otherwise delete it.
- If the payload turns out to be effectively empty for all fixtures, render
  the honest empty pattern: muted line "Evidence for this brief has not been
  published yet." and keep the back-link header.

**Verify**: `grep -n "6.2, 5.8" apps/web/src/studio/pages/brief-workflows.tsx`
→ no matches; `bun --filter @bp/web typecheck` → exit 0.

### Step 3: De-fictionalize BriefHistoryPage

- Derive the chip and hint from `data` (if the history payload has status or
  timestamps, use them; otherwise REMOVE chip and hint props — check
  `BriefHeadingBar`'s prop types in the same file to make them optional if
  needed).
- Remove the `?? "v0.4"` / `?? "v0.3"` fictional fallbacks: when
  `versions.length < 2`, render a single honest line
  ("No earlier versions to compare.") instead of a diff UI.
- For the diff body: render only what the payload supports. If `versions`
  carry real diffable content, bind it; if (as audited) the diff block is
  hardcoded example content with no payload backing, replace the whole diff
  area with the version list (real `v`, label, timestamp fields the payload
  has) and the honest line above.

**Verify**:
`grep -n '"v0.4"\|"v0.3"\|last edit 2 hours ago\|chip="IN REVIEW"' apps/web/src/studio/pages/brief-workflows.tsx`
→ no matches; `bun --filter @bp/web typecheck` → exit 0.

### Step 4: Build + manual pass

`bun --filter @bp/web build` → exit 0. Dev server: open both pages for at
least two briefs (one published, one draft if available). No fabricated
numbers anywhere; empty states read as deliberate.

## Test plan

- If `apps/web` has existing page-level tests (grep for tests covering
  `brief-workflows` or sibling pages), add cases: evidence page with empty
  payload → honest empty line; history with 0/1 versions → no diff UI.
- If no page-test harness exists, state that in your report and rely on the
  greps in Steps 2–3 (they are the regression guard for re-introducing the
  literals).

## Done criteria

- [ ] Both greps in Steps 2–3 return no matches
- [ ] `bun --filter @bp/web typecheck` and `bun --filter @bp/web build` exit 0
- [ ] Evidence/History pages render only payload-derived content (or honest empties)
- [ ] No banned patterns introduced (no scoring meters/evidence shelf)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The evidence payload schema and the R2 fixtures disagree (schema promises
  fields the artifacts don't have) — that's a serving bug to report, not
  patch around.
- `BriefHeadingBar` is shared with pages out of scope and making chip/hint
  optional changes their rendering — report instead of touching those pages.
- You cannot find any brief with a non-empty evidence payload locally AND the
  schema suggests the artifacts were never generated — the right fix may be
  pipeline-side; report it.

## Maintenance notes

- When a real hour×day speed projection exists someday, the Evidence page can
  regain a heatmap — bound to served data, never literals (plan 004's
  maintenance notes cover the serving gap).
- Reviewer should scrutinize: that "render only what's served" didn't quietly
  drop real payload fields that should be displayed (compare rendered fields
  against the schema field list from Step 1).
- The generic "Computation" prose, if deleted, may deserve a future home in
  the methods docs — note it in the PR description if you delete it.
