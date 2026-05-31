# UI copy doctrine

Rules for what user-facing copy on Studio pages is allowed to say. These exist because backend-flavored prose keeps leaking into headers, subheads, and inline help — usually written by agents who are working on the pipeline or projection schema and don't realize they're writing for a different audience.

## The rule

**User-facing copy on a Studio page describes what the user is looking at, in the user's vocabulary. It does not describe the pipeline, the projection, the API contract, or its own existence.**

Methodology and caveat prose belong on `/methods` or in a tooltip. Per-route data caveats (when they have to live on the route page) belong on the Data Notes tab. They do not belong in section subheads on the home page, the route page, the compare page, or any other surface a non-operator reader is expected to read.

## Tests for whether a sentence is in the wrong place

A sentence in user-facing copy is suspect if it has any of these:

- **Pipeline vocabulary**: "projection," "release," "generated," "ingested," "audited," "regulatory," "snapshot," "schema," "endpoint," "denominator," "coverage," "rolled up," "deterministic," "evidence summary," "claim," "publishable."
- **Reflexive meta-talk**: "from this chart," "in this table," "this page is generated from…," "the served X projection," "the current projection."
- **Definitions of filter labels or chip labels in body copy**: if a chip says "Low lane overlap" and the body copy explains what "low lane overlap" means, the definition belongs in a tooltip on the chip or on `/methods`. The chip text is the definition.
- **Schema field name disguised as prose**: "use the quality object when deciding whether…," "the route-month trend rows," "the route-slice schedule-comparison exposure."
- **"This is not X" without an "X is" anchor**: a sentence that exists only to disclaim what a number isn't, without telling the reader what it actually is. If the disclaimer matters, the methodology sentence matters more — lead with that.
- **Snake_case sentinels rendered as text**: `geometry_unavailable`, `not_in_ingested_tsp_sources`, `monthly_route_hourly_ridership_exposure`. Either render a user-readable label or don't render the field.

## The tarbell pattern

The reference designs lead with **methodology, not meta-statement**. From `route-first.jsx:96–97`:

> *"Routes needing attention this month"*  
> *"Surfaced by week-over-week speed decline weighted by daily riders. Not a recommendation — a triage list."*

One sentence. It tells the reader *how the list was ranked* (the methodology), then states what it isn't. The implementation had bloated this to two paragraphs that talked about "the Studio route projection" and defined a filter-chip label inline.

## Voice rules

- **Methodology first, disclaimer second.** "Weighted average route speed by month" before "not a recommendation." If you can't write the methodology sentence in a clause or two, the surface probably shouldn't have a subhead at all.
- **Concrete over abstract.** "5.8 mph in March 2026" over "current projection value." The reader is looking at the number — name it directly.
- **No meta about the page itself.** Don't say "this chart shows," "in this table," "from this view." The chart is the chart.
- **No pipeline vocabulary except on `/methods` or in `/docs`.** Those pages are *about* the pipeline. Everywhere else, translate.
- **Disclaimers when data is missing**: don't ship a section. If the data isn't there, the section isn't there. A placeholder explaining what we don't have is itself a violation — that's pipeline status talk leaking to readers.

## Where caveats *do* belong

- **`/methods`** — the canonical home for methodology prose, glossary, dataset definitions, scope of evidence.
- **Tooltips on chips/badges/labels** — short, on-demand, optional. Won't be read by readers who don't need it.
- **Route page Data Notes tab** — per-route caveats that don't generalize to all routes. Even here, the prose should be in user-facing voice, not pipeline voice.
- **The brief composer** — operator surface. The full caveat language is fine here because the audience is the analyst building the brief.

## Examples found and fixed (2026-05-25)

| File | What it said | What it says now |
|---|---|---|
| `routes-home.tsx` | "A current-month triage list from the Studio route projection. Not a recommendation." + a second paragraph defining "low lane overlap" | "Ranked by observed speed gap against schedule, weighted by daily riders. Not a recommendation — a triage list." |
| `compare.tsx` | "Latest observed route-speed values from the Studio projection. Labels use the route-month trend rows; delay-exposure deltas come from route-slice schedule-comparison exposure, not from this chart." | "Weighted average route speed by month." |
| `compare.tsx` | "In the current Studio projection, {b.label} carries…" | "{b.label} carries…" |
| `findings-feed.tsx` | "How findings work" help panel: "A finding is a generated or reviewed signal from the served finding projection." | Removed entirely — the per-finding review badge and caveat are the right place. |
| `methods.tsx` | "Methods projection · generated {date}" | "Last refreshed {date}" |
| `route-detail.tsx` | ChartFrame source: "This route-slice projection is X mph under the scheduled comparison." | "X mph below scheduled." |
| `route-detail.tsx` | "The current visible route-slice projection accounts for {N} hours of delay exposure. The {seg} segment is the largest visible contributor in this route slice and should not be read as a full-route share until complete segment coverage lands." | "The visible segments account for {N} hours / day. {seg} is the largest single contributor." |
| `route-detail.tsx` | Slow-segments stub: "Route-level before/after metrics… are not yet wired into the release projection." | Section removed — no data, no section. |
| `route-ladder.tsx` | Selected segment sub: "{dir} · generated route-slice projection" | "{dir} · weekday median" |
| `route-ladder.tsx` | TSP: "no positive ingested source match" | "no DOT TSP source match" |

## Known violations still standing (separate pass needed)

- **`docs.tsx`** — the docs page itself; pipeline vocabulary is appropriate here since `/docs` is the API reference. No action.

## Resolved (2026-05-25 follow-up)

- **`route-detail.tsx` Data Notes tab** — was 8-box pipeline diagnostic strip + 5 caveats in pipeline voice. Rewritten to tarbell shape: 3-box data window header (Primary window / Trend window / Last refreshed) + Full methodology CTA, 4 user-voice caveats (2 universal, 2 route-derived), datasets table without fabricated cite counts. Deleted 8 dead vocab-translation helpers (`coverageReasonLabel`, `hourlyCoverageLabel`, `ridershipDenominatorLabel`, `serviceDayCoverageLabel`, `detectorSideCohortCoverageLabel`, `methodologyReviewStatusLabel`, `boardingsCoverageLabel`, `fullRouteCoverageLabel`).
- **`route-ladder.tsx` Route-shape slice debug strip** — removed the `source: ... / method: ... / vertices: N` key-value block below the map thumb. The map thumb label (`"MTA route-shape slice"` or `"geometry unavailable"`) is the whole user-facing surface. Operators who need diagnostic detail can read the API response.
- **`route-ladder.tsx` "scheduled comparison"** — dropped `comparison` (schema-leak); now just `vs N.N scheduled`.
- **`route-ladder.tsx` "DOT pieces"** — replaced the lane-overlap footnote `Lane: X% route-shape overlap; N DOT pieces.` with `Lane: X% route overlap.`

## For agents

If you're working on the pipeline or the projection schema and you're tempted to add prose explaining the data shape directly into a Studio page: **don't**. Write it into `/methods` (or `knowledge/wiki/engineering/synthetic_data_inventory.md` if the surface is still synthetic), or flag a UI request in `knowledge/wiki/engineering/ui_backlog_for_user.md`. The Studio page is not the documentation for the pipeline.
