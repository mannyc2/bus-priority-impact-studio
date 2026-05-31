# Studio design-pass status

Per-page status of the Studio web app vs. the tarbell design bundle at
`/tmp/tarbell-design/bus-priority-impact-studio/project/`.

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
| `brief-lifecycle.jsx` | `brief-workflows.tsx` | done | 2026-05-24: BriefComposerPage split into explicit `NewBriefComposerPage` / `EditBriefComposerPage` variants (no boolean mode), state lifted into [[brief-DraftBriefContext]] so `ComposerOutline` / `ClaimEditorColumn` / `ComposerEvidenceInspector` all `use(DraftBriefContext)` instead of prop-drilling. BriefReviewPage lifted into [[brief-ReviewBriefContext]] so `ReviewTitleBar` (with ReviewerStack + resolve-changes button) consumes the same `comments` state as `ReviewOutlineRail` / `ReviewCommentRail` from outside the 3-col frame — textbook lift-state sibling case. BriefHistoryPage gained "A (compare) / B (this)" accent badges + author per version row. BriefEvidencePage now renders API evidence packets and explicit source-artifact absence instead of a citation-detail mockup. New compound surface: `components/brief/HeaderBar.tsx` (consolidated header for future use), `components/brief/DraftBriefContext.tsx`, `components/brief/ReviewBriefContext.tsx`. |
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
