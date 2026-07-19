# Plan 075: Integrate treatment studies into the route History tab and /interventions (no new page)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- apps/web/src packages/domain/src/studio/study.ts`
> Plan 074 creates `study.ts`, so it WILL be newer than this plan — that is
> expected; read it and treat ITS shapes as authoritative. For everything else,
> compare the "Current state" excerpts before proceeding.

## Status

- **Plan status**: IN PROGRESS (the UI integration landed in PR #59, but the
  recorded Plan 074 operator-anchor prerequisite was never closed; public
  activation remains blocked and no rc23 study output may be served)
- **Priority**: P2
- **Effort**: M
- **Risk**: MED (public claims surface — mitigated by claim-language rules and the 074 operator-review gate)
- **Depends on**: plans/074-segment-study-engine.md (must be DONE with
  operator anchor review passed; currently unmet),
  plans/073-intervention-corpus-serving.md (corpus artifact, for step 5), and
  exact-route task `019f7640-fd5c-7be2-8a40-a7c264284c0f` before activation
- **Category**: direction
- **Planned at**: commit `cd878f7`, 2026-07-09 (rescoped same day per operator direction)

### Binding rc19 candidate amendment — 2026-07-14

This serving work remains complete for already published study artifacts, but
the rc19 candidate set changes no public study output by itself. Its 489 rows
are unapproved; the 16 Codex recommendations are not a receipt. Do not render
them as studies, regenerate serving artifacts, or publish D1/R2 data until a
new exact-set-bound approval, a separately authorized Plan 074 run, and the
existing publication checks all succeed. See
`docs/research/mta-wiki-rc19-plan-rebaseline.md`.

### Binding rc22 publication amendment — 2026-07-17

rc22 produces no public study input. Its 489-row v3 candidate artifact is
contract-blocked, carries zero approved events, and authorizes no study or
publication. Do not regenerate route studies, indexes, rollups, D1, or R2 from
it. Even after the producer publishes a contract-compatible replacement,
Plan 075 may serve results only after a fresh candidate-set approval, a
separately authorized Plan 074 run, and the existing publication gates all
pass. See `docs/research/mta-wiki-rc22-migration-report.md`.

### Binding rc23 publication amendment — 2026-07-18

rc23 is strict-compatible and ready for a separate operator release-pointer
review, but it still produces no public study input. Its new 489-row candidate
set `candidate-set-v3:aba25fe4209247be31d43b66` is `awaiting_approval`, has no
receipt, and has zero approved events. Neither strict compatibility nor a
future `LATEST` promotion authorizes route-study regeneration, serving-index
changes, publication, D1/R2 writes, or deployment.

Plan 075 may consume rc23-derived results only after a complete receipt bound
to that exact set, a separately authorized Plan 074 run, operator anchor
review, and every existing publication gate. rc22 remains quarantined and all
already published artifacts remain immutable. See
`docs/research/mta-wiki-rc23-migration-report.md`.

### Binding exact-route publication quarantine — 2026-07-18

The later exact-route audit supersedes rc23's prospective publication basis.
Although rc23 passed the then-current manifest-v4 decoder, its route
projection collapses exact services and is quarantined without mutation by
the active MTA Wiki Plan 035 program. Plan 075 must never serve studies,
indexes, rollups, or links derived from
`candidate-set-v3:aba25fe4209247be31d43b66`, and no approval may be rebound to
it.

Activation now requires the external exact-route task
`019f7640-fd5c-7be2-8a40-a7c264284c0f`, a fresh non-quarantined manifest-v5
Wiki release, a new exact-route candidate set, its complete set-bound receipt,
a separately authorized post-amendment Plan 074 run, operator anchor review,
serving regeneration, and publication authorization. The UI code landed by
PR #59 remains implemented but inactive; this amendment does not remove it or
activate any public result.

### Status reconciliation — 2026-07-18

PR #59 merged the UI integration even though the Plan 074 anchor report still
records a STOP. The code's existence is not evidence that the prerequisite
passed. Treat the integration as an implemented but inactive milestone:
operator anchor review, exact-set approval, a separately authorized study run,
serving regeneration, and publication authorization remain open.

## Why this matters

Plan 074 produces defensible per-treatment effect estimates with gates and
uncertainty. **Operator direction (2026-07-09, binding)**: do NOT build a
separate `/studies` page — the route detail page is the product's spine, and
the gen-6 overhaul deliberately consolidated surfaces (it deleted `/methods`).
Studies must be incorporated naturally into the pages that already exist:
the History tab's "Before & after evaluations" cards get upgraded in place
with the real segment-grain results, and `/interventions`' "Evaluated" rows
get the real numbers. New data appears in a tab only where it looks good
visually and makes sense for that tab; prefer upgrading existing elements over
adding sections; deep-link via search params, never via new routes.

## Current state

- **Input artifacts** (from 074): `studio/v2/studies/index.json` (one summary
  row per study), `studio/v2/studies/{eventKey}.json`, and per-route rollups
  `studio/v2/routes/{routeSlug}/studies.json` (full payloads for that route's
  studies). Schemas in `packages/domain/src/studio/study.ts`. Each study
  carries: effect (mph and %), CI, monthly event-time series (treated vs
  control), gate table with reasons, tier (`gated_estimate | descriptive`),
  direction (incl. `no_detectable_change`), sensitivity estimates, provenance.
  READ `study.ts` FIRST — it is the contract.

- **The History tab today**:
  `apps/web/src/components/route/TreatmentsHistorySection.tsx`. Verified
  structure — four calm `SectionCard`s (lines 85-107): treatment inventory,
  Timeline, DocumentedTreatments, and:

```tsx
      <SectionCard
        title="Before & after evaluations"
        sub={
          comparisonCards.length > 0
            ? `${comparisonCards.length} promoted comparison windows.`
            : "Comparison windows promoted by the pipeline."
        }
      >
        <ComparisonCards cards={comparisonCards} />
      </SectionCard>
```

  Cards are built by `interventionComparisonCards(events)` (lines 429-448)
  from `event.comparisonCohort` (route-grain deltas), and rendered (lines
  462-498) as a bounded card: title, `{year} / {windowLabel}`, tone `Badge`,
  a 2-column `DeltaMetric` grid ("route" / "adjusted"), caveat text. Tone
  comes from `toneForDelta(cohort.adjustedSpeedDeltaMph)`. This card is the
  upgrade target — same card, richer content when a segment study exists.

- **Route file** (`apps/web/src/routes/routes/$routeId.tsx`, verified, full
  file read): loader runs `Promise.all([fetchStudioRoute, fetchStudioRouteEvidence])`;
  `validateSearch` admits only `tab` from `["segments","riders","history"]`;
  heavy artifacts deliberately stay lazy (in-code comment at line 29). The
  in-component lazy-fetch idiom for tab-specific data is established by
  `SlowSegments.tsx` (`useRouteSpeedHistory` etc.) — match it for anything
  heavy; the per-route studies rollup is small and MAY go in the loader.

- **Client fetch**: `apps/web/src/studio/api-client.ts` —
  `loadNullableStudioJson` (404 → null; verified lines 96-118). Studies fetch
  via the existing public artifact endpoint (same as plan 073; grep
  `fetchNetworkMapGeo` for URL construction). **No `read-handlers.ts` changes**
  (gen-7 plan 063 owns that file).

- **/interventions today** (`apps/web/src/studio/pages/interventions.tsx`,
  verified lines 46-72): chip filters incl. `evaluated`, rows built by
  `interventionRows(routes, evidence)`, `INTERVENTIONS_PAGE_SIZE = 30`;
  evaluated rows already render a ±mph delta + cohort count from
  `comparisonCohort` and a `causalInterpretation` label (line ~248).

- **Chart convention** (binding): native shadcn/Recharts v3 only, code-split
  behind the `X.tsx` + `X.chart.tsx` lazy pair — find an existing pair under
  `apps/web/src/components/route/` and match it exactly. Recharts v3 custom
  marks are direct children using `useXAxisScale`/`useYAxisScale`/`usePlotArea`
  hooks (Customized is deprecated). No new chart libraries.

- **Design authority** (binding; gen-6 critique + 2026-06-12 review +
  operator direction 2026-07-09): MTA palette tokens (`var(--bp-color-*)`);
  calm bounded cards; **no "data as of" chips**; **no verdict-word chips**;
  **no new top-level pages or nav items**; **no new tabs**; **no new section
  unless it replaces an existing one**. Tone via the existing tone system.
  Enforced by `bun run check:design-doctrine` (in `check:architecture`) with a
  ratchet allowlist — new code must pass WITHOUT allowlist additions.

- **Claim language rules** (ADR-0018 discipline, binding): never causal verbs
  ("caused", "improved because"); use "changed by X (95% CI …) relative to
  matched control segments"; `no_detectable_change` renders as a first-class
  state with equal visual dignity; `descriptive`-tier results render WITHOUT
  the CI treatment and with an explicit "not a controlled comparison" note.

- **Approved design comp (2026-07-10, binding acceptance target)**:
  `plans/mockups/075-history-tab/study-cards-comp.html` — approved by the
  operator through three review rounds (decisions D1–D17 resolved; round 3 is
  final). The built cards must visually match it. The "Approved card anatomy"
  section below encodes the resolutions; where any older prose in this plan
  conflicts with the comp, THE COMP WINS.

## Approved card anatomy (operator-approved comp, rounds 1–3)

Studied cards follow the shadcn chart-card anatomy (header, chart body,
footer) restyled to app tokens — assemble from the existing shadcn/Recharts
primitives; do not hand-roll chart rendering.

- **Header**: existing event-title treatment + description line
  `Monthly speed, mph.` + a right-aligned single stat block: mono label
  `vs controls`, value = the effect in mph with tone color from `direction`,
  CI beneath ("95% CI +0.06 to +0.39"). NO mono window line on studied cards
  (exact windows move to provenance); NO DeltaMetric grid — one metric per
  card, total.
- **Badge**: counts only ("24 segments studied", "1 lane segment"); tone from
  `direction`; NEVER verdict words.
- **Chart body** (~200px, the lazy `X.tsx`+`X.chart.tsx` pair): treated vs
  matched-control monthly series as gradient areas with monotone
  interpolation; legend `treated segments` / `matched controls` (no route
  prefix — redundant on the route's own page); faint horizontal grid with 3
  quiet y reference values; first/last month ticks; dashed implementation
  reference line labeled in plain language ("enforcement starts Sep 2024");
  a warn-colored dashed marker when a confounder gate flags (congestion
  pricing / Queens redesign); standard ChartTooltip on hover.
- **Footer**: one finding sentence derived from `direction` + series shape
  (display-only template, e.g. "Speeds on treated segments rose while matched
  controls held flat"), led by a 13px tone-colored trend icon (up/down for
  directional results, flat line for null); for flagged studies, ONE muted
  caveat sentence with the sensitivity estimate ("Excluding the months after
  Manhattan tolling began: +0.01 mph (95% CI −0.17 to +0.19)"); then a
  `SourceNote` labeled "Method & provenance" carrying the full gate table
  with reasons, exact pre/post windows, treated/control counts, engine
  version, and event source. Gate/check internals NEVER render on the card
  face.
- **Null state** (`no_detectable_change`): display copy is exactly
  "No clear change" in the stat value slot, accent tone, CI beneath — equal
  visual dignity with directional results.
- **Descriptive tier**: no chart, no CI, no icon; stat label `before vs
  after` with the single consolidated change in muted ink; description line
  `Not a controlled comparison.`; body sentence states both window means with
  the implementation date inline ("before the lanes opened (Nov 2024)") and
  the uncontrolled caveat; provenance SourceNote.
- **Cards without a study**: byte-identical to today, including their
  existing window line (trimming it is a named follow-up — comp D17 — NOT
  this plan).
- If a route has >4 studied cards, render the chart on the most recent two
  and a quiet "show chart" toggle on the rest (existing disclosure idiom).

- **Perf budget**: entry ≤145KB gz (currently ~115KB), enforced by
  `bun --filter @bp/web build`. Everything here rides existing route chunks;
  the chart is lazy; entry must not grow.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run check:types` | exit 0 |
| Web build + budget | `bun --filter @bp/web build` | exit 0, budget passes |
| Doctrine/architecture | `bun run check:architecture` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Smoke | `bun run serve:web-smoke` | pages render |
| Local artifact seed | `bun run seed:local-studio-r2` | exit 0 |

## Scope

**In scope**:
- `apps/web/src/studio/api-client.ts` (fetch functions: per-route studies rollup, studies index)
- `apps/web/src/routes/routes/$routeId.tsx` (loader + `study` search param)
- `apps/web/src/components/route/TreatmentsHistorySection.tsx` (upgrade ComparisonCards + timeline corpus merge)
- `apps/web/src/components/study/` (new, small: lazy event-time chart pair, checks row)
- `apps/web/src/studio/pages/interventions.tsx` + its route file's loader (study-index numbers on evaluated rows, deep links)

**Out of scope** (do NOT touch):
- Any new route file other than edits to the two named above — **no `/studies` routes, no nav changes** (operator direction).
- `packages/studio-api/**` (incl. read-handlers), `tools/pipeline-v2/**`.
- The Overview tab's insights list — a studied-treatment insight line is a
  possible follow-up, decided by the operator after seeing the History tab.
- Homepage flagship-finding block — later, after operator reviews live studies.
- Client-side recomputation of any study number (display + formatting only).
- PDF/memo export — deferred (print CSS on the route page is the likely path).

## Git workflow

- Branch: `advisor/075-studies-integration` off the current branch.
- Commit per step; short imperative messages matching `git log --oneline` style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fetch functions + loader + deep-link param

- `api-client.ts`: add `fetchStudioRouteStudies(routeId)` (per-route rollup,
  `loadNullableStudioJson`) and `fetchStudioStudiesIndex()` (index, nullable).
- `$routeId.tsx`: add the rollup fetch to the loader's `Promise.all` (it is a
  small per-route artifact — loader is appropriate; the citywide corpus in
  step 5 is NOT loader material). Extend `validateSearch` to also admit an
  optional `study` string (validate shape: non-empty string, pass through
  only when `tab` resolves to `history`; else drop it — mirror the existing
  tab-validation style at lines 19-26).

**Verify**: `bun run check:types` → exit 0; a route page still renders with
the artifact absent (null rollup).

### Step 2: Upgrade the comparison cards in place

In `TreatmentsHistorySection.tsx`:
- Thread the rollup into `interventionComparisonCards` matching by the study's
  event provenance (eventKey ↔ intervention event identity — `study.ts`
  defines the key; match on it, never on title strings).
- A card WITH a matching study upgrades in place to the **Approved card
  anatomy** (section above; the comp is the acceptance target): header stat
  block with the single effect + CI (or "No clear change"), count-only badge,
  gradient-area event-time chart as the card body (lazy `X.tsx`+`X.chart.tsx`
  pair under `apps/web/src/components/study/`), footer finding sentence +
  optional caveat sentence + "Method & provenance" SourceNote. Tone derives
  from study `direction` (reuse `toneForDelta` semantics). No DeltaMetric
  grid, no checks row, no window line on studied cards.
- Ratchet the approved copy rule into the doctrine harness: add
  `/no detectable change/i` to `BANNED_PHRASES` in
  `tests/harness/design-doctrine.test.ts` — display copy must be "No clear
  change" (the artifact enum `no_detectable_change` is snake_case and does
  not match the prose regex; add a regression assertion mirroring the
  existing `generatedAt` example).
- Cards WITHOUT a study render exactly as today (byte-identical DOM).
- `?study=<eventKey>`: on mount, scroll the matching card into view and apply
  a temporary highlight using an existing ring/highlight token — no new visual
  vocabulary.
- Update the SectionCard `sub` line to count studies when present (e.g.
  "4 evaluations, 3 with matched-segment studies.") — keep the calm register.
- `descriptive`-tier studies: render per the anatomy's descriptive tier — the
  single consolidated before-vs-after change, "Not a controlled comparison.",
  no CI, no chart, no checks anywhere.

**Verify**: seed local artifacts (copy 074 outputs into
`data/artifacts/studio/v2/` then `bun run seed:local-studio-r2`); smoke a route
with a `gated_estimate` study, one with `no_detectable_change`, one
`descriptive`, and one with no studies at all → four correct variants, each
matching the approved comp;
`bun run check:architecture` → exit 0 with NO new allowlist entries (and the
new `no detectable change` phrase ban in place).

### Step 3: /interventions rows get the real numbers

In the interventions route's loader add `fetchStudioStudiesIndex()` (nullable).
In `interventions.tsx`: for evaluated rows whose event matches a study in the
index, source the row's delta from the study effect (same compact format,
tone from `direction`), render the CI compactly with a "to" separator (e.g.
"+0.22 (+0.06 to +0.39) mph" — signed bounds make an en-dash ambiguous), add
the row label "matched-segment study", and make the row's evaluation area
link ("View study →") to
`/routes/{routeId}?tab=history&study={eventKey}` — detail has ONE home, the
route page. Rows without studies render exactly as today. Filter counts and
pagination behavior unchanged.

**Verify**: smoke `/interventions`: studied rows show CI + link and navigate to
the highlighted card; with the index artifact absent the page renders exactly
as today; `bun run test:web` → pass.

### Step 4: Corpus records join the route timeline (plan 073 hand-off)

Plan 073 deferred route-page corpus display to this plan. In
`TreatmentsHistorySection.tsx`, lazy-fetch the corpus artifact
in-component (match the `SlowSegments.tsx` in-component fetch idiom — the
corpus is citywide and must NOT go in the route loader), filter to this
route's records, and merge into `mergedTreatmentTimelineRows` as timeline rows
(dateLabel from effectiveDate/datePrecision, kind from treatment family,
SourceNote entries from sourceLabel/sourceId). Dedupe against existing
serving/wiki rows by (year + treatment family): prefer the existing row and
append the corpus source to its SourceNote entries. The timeline stays
bounded — reuse its existing row cap/behavior; corpus rows must not blow it
past the current bounded presentation.

**Verify**: a pilot route with corpus coverage shows enriched timeline rows
with citations; timeline row count stays within the existing bound; with the
corpus artifact absent, the tab renders as today.

## Test plan

- Extend existing web tests only where siblings are already tested (check
  `apps/web/test/` first; match that depth). At minimum add pure-function
  tests for the card-matching (eventKey join) and timeline-dedupe helpers if
  they are exported pure functions — model on existing tests under
  `apps/web/test/shared`.
- Enforced gates: `check:types`, `check:architecture` (doctrine, no new
  allowlist entries), `test:web`, build budget, and the four-variant smoke.

## Done criteria

- [ ] History tab renders all four card variants correctly (gated / no-change / descriptive / no-study), each matching the approved comp `plans/mockups/075-history-tab/study-cards-comp.html`, and byte-identical to today when artifacts are absent
- [ ] `/no detectable change/i` added to `BANNED_PHRASES`; all display copy uses "No clear change"
- [ ] `/interventions` studied rows show effect + CI and deep-link to the highlighted card; unchanged otherwise
- [ ] `?tab=history&study=<key>` scrolls to and highlights the right card
- [ ] NO new route files, nav items, tabs, or section cards (`git status` + review)
- [ ] Claim-language grep clean: `grep -rniE "caused|thanks to|improved because" apps/web/src/components/study apps/web/src/components/route/TreatmentsHistorySection.tsx` → no hits
- [ ] Entry bundle budget unchanged within 2KB (`bun --filter @bp/web build`)
- [ ] `bun run check:types`, `check:architecture`, `test:web` all exit 0
- [ ] Only in-scope files modified; `plans/README.md` status row updated

## STOP conditions

- `study.ts` artifacts lack the event-time series or gate reasons — report;
  do not improvise a chart from other data.
- The study↔event key join fails for >30% of studies (identity mismatch
  between 073/074's event keys and served `StudioIntervention` events) —
  report the mismatch taxonomy; do not fall back to title-string matching.
- The design-doctrine check requires an allowlist entry — report the violating
  pattern instead of adding it.
- Step 4's dedupe leaves rampant near-duplicates (>20% of merged rows) —
  report examples; the heuristic needs operator input.
- Operator anchor review (074's gate) has not happened — do not start.

## Maintenance notes

- Approved-but-deferred (comp D17): trimming the legacy no-study card's mono
  window line — a later sweep, deliberately not this plan (the byte-identical
  rule stands).
- The comp gate is process now: any material visual change to these cards
  gets a new comp round (same file, new Artifact label) before implementation.
- The Overview tab insight line ("Bus lane on X St: +0.8 mph vs matched
  controls") and a homepage flagship finding are natural follow-ups — both are
  operator calls after seeing the History tab live.
- A printable per-study memo can be print CSS on the route page (the study
  card is the memo body); decide after real studies exist.
- When gen-7 063 restructures read-handlers, nothing here changes (artifact
  endpoint only) — that isolation is deliberate; keep it.
- If a future need for cross-route study browsing emerges, extend
  `/interventions` (it is already the citywide chronicle) — not a new page.
