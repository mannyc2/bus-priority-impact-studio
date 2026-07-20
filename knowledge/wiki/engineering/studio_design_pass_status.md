# Studio design-pass status

Current and historical design-source status for the Studio web app.

## Current design source — 2026-07-06 (MTA visual language)

The operator's 2026-07-06 UI/UX critique is the current design authority for the
visual language. It supersedes the July-4 export's warm/editorial ("civic
newspaper") tokens: surfaces are now cool near-white (`--bp-color-canvas`
`#f4f5f7` → `paper` `#fafbfc` → `paper-deep` `#eceef1`), cards are true white,
ink is `#101418`, and the working accent is MTA Blue `#0039a6` (Pantone 286)
with a black signage nav bar (white Helvetica). The Helvetica body stack and the
borough route roundels are unchanged. Generation-6 plans 048-059 implement this;
plan 050 machine-enforces the 2026-06-12 and 2026-07-06 copy bans. Gen-6 is
complete as of 2026-07-06: plan 060 swept the orphaned component layer and the
`check:design-doctrine` ratchet is the standing guard (allowlist holds only the
live-file CorridorMap and RouteGeoMap interpunct exceptions). The July-4
export below remains a useful reference for layout/component structure, but its
color tokens are retired.

## Month-identity doctrine gate — 2026-07-19

`check:month-doctrine` is the architecture ratchet for ADR-0022. It rejects
month-keyed product identity: retired contract tokens, release-identity fields
and phrases on their audited surfaces, public `?month=` selectors, and pinned
month literals on serving or publication surfaces. It deliberately permits a
month as source grain, a time-series coordinate, an ingest partition, an
analysis window, or an operator-selected build window.

The allowlist records exact counts per file and rule. Its initial entries are
all shrink-only dispositions owned by Plans 079 and 085-087; a production edit
must remove or reassign its matching entry in the same commit. No permanent
exception exists at gate landing. Plan 086 may later preserve only the audited
immutable compatibility readers identified by its binding plan amendment.

## Route intervention source and navigation contract — 2026-07-20

Route Overview and History now recognize treatments only from the strict,
nullable `bp.studio.route_intervention_inventory_bundle.v1` artifact. Overview
is a bounded current/planned summary with an accessible overflow disclosure;
History is the unbounded record view and keeps treatments, dated occurrences,
related projects, studies, and source gaps separate. Missing, partial, and
checked-with-no-positive-evidence bundles remain visibly distinct, and route
prose never substitutes for a missing typed inventory.

The `/interventions` ledger consumes the compact citywide facet index for
family and exact-route discovery. Its filters live in validated URL search
state, and ledger links open the exact service's History tab at a stable record
anchor. B44 and B44+ therefore remain separate in filters, links, and targets.

This is an incremental data/navigation repair in the implemented visual
language. It does not approve or execute the unresolved D22-D27 choices in the
Plan 089 interventions comp. Plan 082 follows this work and may reuse the
exhaustive treatment presentation helper for dated observation markers, but it
must resolve those markers through typed treatment IDs rather than History
prose or analysis-family equivalence.

## Study-card / chart-card rules — 2026-07-10 (approved comp)

The operator approved plan 075's study-card design through three comp review
rounds; `plans/mockups/075-history-tab/study-cards-comp.html` (round 3) is the
binding acceptance target for that plan. Durable rules extracted for ALL
future chart/metric surfaces (including gen-9 plans 080/081):

- Chart cards follow the shadcn chart-card anatomy (header = title + short
  description + one right-aligned stat block; body = gradient-area chart;
  footer = finding sentence) restyled to the app tokens — assembled from the
  existing shadcn/Recharts primitives.
- One consolidated metric per chart card — no stat strips or metric grids
  beside a chart.
- Method/gate internals (pre-trend, placebo, sample checks, control pools)
  never render on a card face; they live in the "Method & provenance"
  SourceNote popover. A single plain-language caveat sentence may stay
  visible when it qualifies a public claim (e.g. congestion-pricing
  sensitivity).
- Terse copy: minimal stat labels ("vs controls"); null display copy is
  "No clear change" (the artifact enum stays `no_detectable_change`; plan 075
  adds the prose form to the doctrine `BANNED_PHRASES`); no date/window lines
  where the chart itself carries the dates (end ticks + implementation
  reference line) — exact windows belong in provenance.
- Process (the comp gate): frontend plans do not start implementation until
  an operator-approved HTML comp exists in `plans/mockups/`, built from real
  data in the app tokens and passing the doctrine banned-pattern greps.
  Approvals become the plan's acceptance target; rejections ratchet into
  `tests/harness/design-doctrine.test.ts` or this document.

## Current design source - 2026-07-04

The latest design source is the July 4 source capture:

```text
knowledge/raw/design-handoffs/bus-priority-impact-studio-2026-07-04/
```

This export supersedes the May tarbell bundle as the reference for new frontend
audit and planning. If this source capture is missing in a future checkout, ask
the operator for the current design export instead of treating the historical
status rows below as current acceptance.

The export includes these relevant design sources:

| July 4 source | Purpose for future audit/plans |
| --- | --- |
| `design-system.html`, `system.jsx` | Current warm civic/editorial tokens, route badges, shell primitives, chips, buttons, data-viz primitives, states, and anti-patterns. |
| `verdict-compositions.jsx`, `verdict-shell.jsx`, `verdict-primitives.jsx`, `verdict-data.jsx`, `verdict-editorial.jsx`, `verdict-mobile.jsx` | Route-detail verdict layer, shell, KPI strip, question tabs, ranked insights, mini-map, zero-insight states, density variants, and mobile direction. |
| `route-public.jsx`, `route-detail-tabs.jsx` | Public-facing route detail and analyst/tab detail reference. Use both when auditing the current route detail page. |
| `home-public.jsx`, `route-first.jsx`, `search-results.jsx` | Public routes home, analyst route search/triage, and search-results direction. |
| `interventions-refactor.jsx`, `compare-public.jsx`, `compare-analytical.jsx`, `methods-public.jsx`, `docs-pages.jsx` | Secondary public/product surfaces that should be checked after shell and route detail. |
| `authoring-v2.jsx`, `authoring-v2-review.jsx`, `authoring-v2-corpus.jsx`, `Evidence Composer.html`, `composer-focus.html` | Authoring and review workflow references. Audit after the public route surfaces unless authoring becomes the immediate task. |
| `screenshots/*.png` | Visual evidence for before/after and composition checks. Use these to calibrate spacing, density, and header behavior. |

### Current frontend audit priorities

Generation-4 plans 033-035 completed the first three priority repairs: route
detail now uses a single route scroller with slim sticky section nav, the
public route page has a verdict lede plus ranked insight list above the section
stack, the section order matches the Slow segments -> Route map reading flow,
and the routes home/search surface supports free-text hero search, mobile route
directory labels, accessible borough chips, and the July editorial CTA voice.
Remaining design work should start with secondary public surfaces and any
operator-approved product revivals, not by re-auditing 033-035.

Screenshot note: Codex workspace verification on 2026-07-04 had no Playwright
or headless browser binary available, so the completed pass is backed by
typecheck/tests/build/style plus dev-server HTTP smoke rather than desktop/375px
screenshots.

1. **Shell/header/navigation**: inspect `apps/web/src/studio/shell.tsx`,
   `apps/web/src/components/route/RouteDetailShell.tsx`, `RouteHeader.tsx`,
   and `RoutePublicKpiStrip.tsx` against `system.jsx` and `verdict-shell.jsx`.
   The user specifically called out the header as ugly and overbearing,
   especially while scrolling.
2. **Route detail page**: inspect `apps/web/src/studio/pages/route-detail.tsx`
   and `apps/web/src/components/route/*` against `route-public.jsx`,
   `route-detail-tabs.jsx`, and the verdict files. The current page should be
   audited as a public evidence product first, not as a dense internal dashboard.
3. **Routes home/search**: inspect `apps/web/src/studio/pages/home.tsx` and
   route-index helpers against `home-public.jsx`, `route-first.jsx`, and
   `search-results.jsx`.
4. **Secondary public surfaces**: inspect interventions, compare, methods, docs,
   and map after the first three priorities.
5. **Authoring/review**: use the `authoring-v2*` and composer files when
   returning to draft/review UX; do not let authoring polish block public route
   page repair.

### Current design doctrine for follow-up plans

- Prefer incremental repairs over a total redesign. The target is a credible
  civic evidence product: dense enough for analysts, quiet enough for public
  readers, and never a marketing page.
- Treat warm paper/card surfaces, restrained ink, sparse civic accent blue,
  route badges, mono labels, and small sharp-radius components as the current
  visual language.
- Use real serving data and honest empty states. Do not add fake insight
  micro-figures, fabricated analysts, fabricated contact/stats, or explanatory
  pipeline jargon to make a screen feel fuller.
- Separate public route reading from analyst/editor workbench density. The
  public route detail should read as a ranked, narrated evidence page; detailed
  tables and workbench controls belong behind section depth or authoring flows.
- Validate desktop and mobile screenshots before marking a design pass done.

## Legacy May tarbell status

The rows below record the older May tarbell design pass. A status of `done`
means the app was aligned to that older bundle at the time. It does **not** mean
the page is current against the July 4 export or against the user's latest UI/UX
feedback.

A "design pass" means: the corresponding tarbell `.jsx` was read top-to-bottom
and the live page (under `apps/web/src/studio/pages/`) was rebuilt or audited
against it. Synthetic surfaces exposed by the rebuild are logged in
[[wiki/engineering/synthetic_data_inventory|Synthetic data inventory]].

Status legend:

- **done** — tarbell file fully implemented; remaining gaps live only in the synthetic-data inventory
- **partial** — some elements adjusted (named in Notes), full page not yet measured
- **todo** — not yet compared against tarbell
- **n/a** — tarbell file is a reference/system artifact, not a shipped page

## Pages

| Tarbell source | App page | Status | Notes |
| --- | --- | --- | --- |
| `ladder.jsx` | `route-ladder.tsx` | done | 7-column horizontal rebuild 2026-05-24. Story rail gated to m15-sbs. Time-window pill + selected-segment sparkline deferred (logged in synthetic inventory). 2026-05-25 audit: confirmed left/right rails + spine + analyst-challenge match. Remaining gaps: deferred time-window pill + selected-segment sparkline + secondary action buttons (`Compare similar segments`, `Open hour-by-hour breakdown`) — kept single `Create route draft` since the others have no backing flow. 2026-05-25 prose-pass: stripped `scheduled comparison` → `scheduled` from selected-segment metric card. Removed the debug source/method/vertices key-value strip below the Route-shape slice map thumb (per UI copy doctrine — no snake_case sentinels in user copy). Cleaned `DOT pieces` from the Lane footnote. |
| `route-first.jsx` (RF_Home only) | `routes-home.tsx` | done | Search bar shell (1.5px ink border + 2px offset shadow), MPH uppercase, filter chip inversion (data-state=on), and 2-col route-row grid already matched after earlier passes. 2026-05-24: switched page to flush + tarbell-spec padding (52px top / 80px L/R, scales to 40px / 16px). Tarbell's always-open suggestion dropdown is design-mockup only — skipped by intent. |
| `route-first.jsx` (RF_RouteDetail) + `route-detail-tabs.jsx` | `route-detail.tsx` | done | Slow-segments table got collapsibles + pagination + spelled-out headers (earlier pass). 2026-05-24 pass aligned Overview / Riders / Interventions / Data notes tabs to tarbell: speed-trend event markers + end-label, route vitals grid (Borough/Length/Stops/Peak freq./Type/Corridor), 3-col Riders KPI strip ("Daily boardings" + segment-share KPI), boardings labels, m15-only Before/After panel replacing Coverage limits, Trend window header cell. AI route briefing block removed from Overview body (AIDiagnosisStrip above tabs is the single AI surface). Ladder tab remains a teaser link to the standalone /ladder page rather than inlining `LadderTabContent` — deliberate divergence. 2026-05-25 audit: re-cut `SlowSegmentsSection` to tarbell `RF_RouteDetail` shape — dropped the sticky right-side `SegmentAiNotePanel`, replaced with inline-expand single AI note row in accent-bg under the clicked segment (◆ glyph + one prose body). Direction `FilterChips` replaced with passive `All directions` chip. Pagination collapsed to a single `Show all →` link (no incremental "Show 5 more"). Highest-rider-hours segment now carries `flag="top"` accent-bg row tint + `Top` badge. Slow-segments tab now also renders the horizontal `InterventionTimeline`; before/after stub deleted (no real rollout-window data on the projection — render nothing rather than a placeholder). Lost AI surfaces (next checks / blocked claims / evidence badges / caveats) remain on the data model but not surfaced in the slow-segments tab. 2026-05-25 Data Notes rewrite: collapsed the 8-box `DataWindow` strip to tarbell's 3-box header (Primary window / Trend window / Last refreshed) + Full methodology CTA. Replaced 5 pipeline-jargon caveats with 4 user-voice caveats — 2 universal ("Speed is observed bus travel speed", "Weekday-only baseline") + 2 derived (overlapping-interventions when ≤2 yrs apart, Manhattan congestion-pricing for any Manhattan route). Datasets table cleaned to tarbell shape with cite count column dropped (no real cite-count infra). Removed 8 dead `coverageReasonLabel`/`hourlyCoverageLabel`/`ridershipDenominatorLabel`/etc. helpers. |
| `authoring.jsx` | `route-annotate.tsx` | done | 2026-05-24: added 2px accent outline on selected segment row + pointer-triangle on InlineClaimSeed popover per tarbell RF_Annotate. No provider lift since no siblings outside the page need the local `selectedId`/`draftClaims` state. |
| `brief-first.jsx` | `briefs.tsx` | done | 2026-05-24: gallery rewrote to tarbell BF_Gallery (title strip, filter chip counts derived from data, featured ink-bg card + evidence-at-a-glance kpi panel, 3-col rest-grid). Reading view rewrote to tarbell BF_Reading 3-col layout `[220/1fr/280]` with `BriefReadingContents` (numbered sections + meta dl) and `BriefReadingEvidenceRail` (pinned evidence + drill buttons). Dropped the outline/claims mode-toggle right rail and the in-article KPI strip — neither exists in tarbell. |
| `brief-lifecycle.jsx` | `brief-workflows.tsx` | done | 2026-05-24: BriefComposerPage split into explicit `NewBriefComposerPage` / `EditBriefComposerPage` variants (no boolean mode), state lifted into [[brief-DraftBriefContext]] so `ComposerOutline` / `ClaimEditorColumn` / `ComposerEvidenceInspector` all `use(DraftBriefContext)` instead of prop-drilling. BriefReviewPage lifted into [[brief-ReviewBriefContext]] so `ReviewTitleBar` (with ReviewerStack + resolve-changes button) consumes the same `comments` state as `ReviewOutlineRail` / `ReviewCommentRail` from outside the 3-col frame — textbook lift-state sibling case. BriefHistoryPage gained "A (compare) / B (this)" accent badges + author per version row. BriefEvidencePage now renders API evidence packets and explicit source-artifact absence instead of a citation-detail mockup. New compound surface: `components/brief/HeaderBar.tsx` (consolidated header for future use), `components/brief/DraftBriefContext.tsx`, `components/brief/ReviewBriefContext.tsx`. 2026-05-31 backend foundation: Worker draft endpoints, authz, idempotency, D1 draft overlay, and OpenAPI are wired; the actual authoring UI/UX should be revisited next against these live endpoints. |
| `hotspot-first.jsx` | `findings-feed.tsx` | todo | Likely shares structure with `findings.jsx` — read both before deciding split. |
| `findings.jsx` | `findings-feed.tsx` / `finding-detail.tsx` | todo | |
| `compare.jsx` | `compare.tsx` | done | 2026-05-25: header halves flushed into a single bordered strip (RouteSide is now flex-only, speed pill dropped — speed lives in the KPI strip), `DeltaCell` restructured to tarbell layout (eyebrow label above, `[A | delta | B]` row, unit/sub below) with arrow + tone glyph, ACE status cell gains `since {date}` sub line from `aceSince`, `CoverageBar` rebuilt at tarbell scale (18px bar, RouteBadge + corridor hint + large right percent). Speed chart left as monthly trend overlay — tarbell's 24-hour hourly speed shape has no backing data in `StudioCompareResponse`. Top-segments side-by-side skipped — same reason. |
| `search-results.jsx` | `search-results.tsx` | done | 2026-05-25: dropped StudioHero + Badge pills entirely. New `SearchHeader` with framed search input (1.5px ink ring + 2px offset shadow + × reset) + tally line ("N results for …" / "sorted by relevance"). Two-col layout (240px facet rail / 1fr results). Facet rail has Filter results title + Reset + four `FacetGroupBlock` checkbox blocks (Borough / Service type / Treatment / Performance) with counts derived from `data.routes` + Save-as-alert CTA. Type-specific row renderers: `RouteResult` (110/1fr/70/110/132 grid w/ TreatmentRow + match chips), `FindingResult` (badge + title + category·metric + confidence), `BriefResult` (status chip + badge + title + authors/evidence-ref/match chips + date). `ResultGroup` gains column headers + Show-all-N → link. Segments + Methodology groups skipped (not in `StudioSearchResponse`). |
| `data-page.jsx` | `methods.tsx` | done | 2026-05-25: added Glossary tab (7 terms in 2-col dl). Dataset cards expose row/period/source-ref/schema-key/method metadata only; tarbell's Methodology note / Schema / Download CSV action row and caveat Apply-to-brief buttons are intentionally omitted until those actions are backed by API endpoints. Tab strip shows generated projection date from the API. Hero kept as 3 MethodStat cells (Datasets/Source refs/Caveats) rather than tarbell's last-refreshed timestamp + green dataset-current dot — counts are derived from real data, the freshness panel is not. Metrics tab kept as `Table`; tarbell's card-row layout left as cosmetic divergence. |
| `docs-pages.jsx` | `docs.tsx` | done | 2026-05-24 earlier pass: full 9-page registry, prose primitives (H1/H2/H3/P/IC/Endpoint/Params/Callout/Step/CmdTable/CodeBlock-with-copy), prev/next nav, "Copy markdown" header button. Data & Credits page is richer than tarbell (drives off `data.sources` ledger). Only divergence: no `CodeTabs` multi-language tabs for Quickstart steps 2/3 + CLI install — single bash `CodeBlock`s used instead. |

## Reference / system artifacts (no shipping page)

| Tarbell source | Purpose | Status |
| --- | --- | --- |
| `design-system.html` | Color/type/component tokens reference | n/a |
| `states.jsx` | Loading/empty/error state catalog | n/a |
| `system.jsx` | Component system showcase | n/a |
| `design-canvas.jsx` | Multi-page canvas viewer | n/a |
| `tweaks-panel.jsx` | Design-time variant panel | n/a |
| `route-badge-exploration.html` | Badge variants exploration | n/a |
| `index.html`, `Docs.html`, `Evidence Composer.html`, `composer-focus.html` | Static HTML mirrors of the JSX pages | n/a |

## Workflow

1. Pick the next `todo` row.
2. Read the tarbell `.jsx` end-to-end before editing.
3. Implement the design as-is. **Do not** strip elements just because the
   backing data is synthetic — log them to
   [[wiki/engineering/synthetic_data_inventory|Synthetic data inventory]].
4. Flip the row to `done` and add a one-line note here; add a
   `## [YYYY-MM-DD] ui | <page> design pass` entry to `knowledge/log.md`.
