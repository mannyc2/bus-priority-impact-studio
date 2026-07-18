# 081 comp round — Route page: Slow segments & Riders

**Status: APPROVED (round 4, 2026-07-18) — operator: "Implement," with the
expander clarified (collapsed is the default; "Show fewer" exists only after
expanding — the comp already behaved this way). The visual/interaction layer
is implemented on `codex/081-route-segment-explorer`; this comp is the
acceptance target for that work.** This is the
comp-gate round for plan 081 (`plans/081-route-segment-explorer.md`), amended
the same day to fold in the operator critique below. Open
`segment-explorer-comp.html` in a browser. Exhibit A is interactive (hover
previews, click pins, direction filter, DOT-lanes toggle, Esc clears). Every
number, name, speed, geometry line, and window in the comp is real served B41
data from the 2026-03 release — nothing is invented.

**Round 2 changes (operator feedback, same day).** Round-1 confusion first:
Exhibits A and C are the Slow-segments tab and the Riders tab of the same
page — they ship together, not as alternatives ("I like A + C" = approve
both). Each exhibit now renders its entire tab in page order, with a tab-strip
context row, so the design can be gauged against the real page. Design
changes: the readout is rebuilt on **fixed slots** (label / segment line /
lane line / three-stat row / severity strip / history slot / actions) so
overview, hover preview, and pin never shift the layout; the "route-level
facts" block is **deleted** (treatments stay on the Treatments & history tab
where they already live); raw URL text is gone — sharing is a **Copy link**
button in the actions row (URL state stays under the hood; spineless segments
get a disabled button); the table defaults to **8 rows + "Show all 16
segments"** (pinning deeper auto-expands); the **lane column is deleted**
(yes/partial/minimal taxonomy explained nothing — lane presence is the map
layer plus one plain readout line: "Along a DOT bus-lane street — most / part
/ a little of this stretch"); the "Highest-impact segment" KPI is fact + a
two-word **Map ›** link; the "When riders ride" legend row is deleted (the
on-chart flag and card subtitle carry it) and Speed-by-hour's legend trimmed
the same way. Register updated: D1/D3/D5/D7 revised, D10 (fixed-slot
readout) and D11 (Copy link, never raw URL) added.

**Round 3 changes (operator feedback, same day — D12).** The operator asked
what the lanes checkbox even means and called the dashes ugly. Answered: the
layer is NYC DOT's published inventory of physically painted bus lanes /
busways (3,019 street segments citywide; street, laneType, openDate per
feature), already served as a release artifact and drawn on /map since 080.
Redesign, checked against the MapLibre v5 style spec: `line-dasharray`
supports neither smooth zoom scaling nor data-driven styling (hence the
spindly fixed 1.5px dashes), so the treatment is now a **soft green band
beneath the route lines** (`line-width` + `line-blur`, both zoom-interpolated,
~0.3 opacity) that gains **crisp parallel edge lines via `line-gap-width` at
street zoom** — paint on the roadbed, not another route line. Green stays
(NYC's real terracotta paint would collide with the ember/sienna attention
scale). The toggle renders only when DOT lane geometry exists near the route
(34 of 350 routes have none; 121 more are under 10% coverage) and is
relabeled **"Painted bus lanes (DOT)"**. Adopting the same band on /map's
lane layer (currently `line-dasharray [3,4]` at fixed 1.5px) is flagged as an
080 amendment candidate so both maps share one lane grammar.

**Round 4 changes (operator feedback, same day — D12 revised, D13 added).**
Round 3's blurred glow band was rejected ("this version is worse"). Third
treatment, now in the comp: the DOT geometry draws as a **solid green
underlay** a few px wider than the route line, between the white casing and
the speed-colored line — laned stretches read as a green-rimmed line, and
where a lane street diverges from the route it reads as its own thin solid
line. One MapLibre layer: solid `line-color`, zoom-interpolated `line-width`
(≈ route width + 3px), round caps; no dasharray, no blur. On B41 it tells the
story at a glance: downtown's slowest segments run *inside* painted lanes
while the ember mid-corridor is bare. (Comp draws the rim only on
yes/partial-proximity stretches — 'minimal' wouldn't show continuous paint in
production's real geometry.) The auto-hide rule and "Painted bus lanes
(DOT)" label stay from round 3; the /map dashes remain an 080 amendment
candidate for the same solid treatment. Second change (D13): the readout
header now follows the standard card title/description anatomy — a normal
title with a one-line description that carries interaction state ("Pin a
segment for its 36-month speed history." → "Previewing — click to pin." →
"Pinned — Esc or Clear selection to release."); the mono eyebrow label is
gone, and the same pattern applies to the mobile readout card.

The round-1 brief is the operator critique of 2026-07-18: "Where the route
loses time" and "Top burden segments" duplicate each other — delete one, and
redesign whichever stays; do segment-specific treatments even exist in the
data, and if not, stop displaying treatments per segment (list and map); the
Slow-segments map is bad and under-uses MapLibre; the bus overlay is useless
and "Bus lanes N%" means nothing; add click-to-keep-focus; lay out
Speed-by-hour better; find different (rider) data for the Riders page.

## Diagnosis (measured, not vibes)

| Complaint | Cause |
|---|---|
| "Same data twice" | Riders' "Top burden segments" is rows 1–6 of "Where the route loses time": both sort the same `segments[]` by the same `riderHours` key (`rider-impact-summary.ts:61` vs `SlowSegments.tsx:47-54`). |
| "Segment-specific treatments?" | All 350 routes / 4,123 served segments checked: ACE varies within a route on **0** routes, TSP on **0** (route-level values fanned out per segment, per `field-provenance.ts`). Lane proximity varies within **309** of 350 — the only treatment that earns segment grain. |
| "Bus lanes 17%?" | `laneCoverage` = share of route shape near a DOT bus-lane centerline (citywide median 11.5%) — not lane-miles, not operating hours. The same stat was retired on /map in 080 round 3 ("Lanes 6%?"). |
| "Map is bad / overlay useless" | Hover-only, no click/pin; rebuilds the GeoJSON source on every hover (`setData`); fixed 560px; ACE/TSP drawn as invented midpoint pins; "bus lane" drawn as a 9px-offset copy of the route line. |
| "Speed-by-hour layout" | Four stat chips stacked over a 24-bar chart that already shows the slow hours; two of the chips are rider facts (peak ridership windows) parked on a speed card in the Segments tab. |

The motivating truth nugget (in the comp intro): B41's slowest stretch
(5.3 mph, downtown) loses **0** rider-hours because it beats its 4.5 mph
schedule, while the top-burden stretch (Avenue P → Avenue U, 21.9K
rider-hrs/weekday) runs 8.2 mph against an 11 mph schedule. Slow and
burdensome are different lenses — one table with both columns, not two
competing ranked cards.

## What the comp proposes

- **D1** One segment surface: Riders' "Top burden segments" card is deleted;
  its KPI tile keeps the headline fact and deep-links into the explorer,
  pinning the top-burden segment.
- **D2** Click/tap pins a segment (shareable `?tab=segments&segment=<spine>`
  URL), hover previews, Esc/Clear releases; no fabricated initial focus.
- **D3** One complete table (all 16 rows), slowest-first; vs-sched delta bar
  (display clamped at ±2.5 mph; the number carries outliers like Stuart St's
  24.5 mph schedule); rider-hrs column with stated denominator; lane-only
  treatment column. Per-row hour strips and ACE/TSP chips deleted — hour
  severity and 36-month history move into the pinned readout.
- **D4** Map reuses 080's approved attention scale (under-7 ember, 7–8
  sienna, ≥8 baseline ink) and one-strip live-count legend; bounded height;
  feature-state hover/selected; cooperative gestures.
- **D5** ACE/TSP midpoint pins, the offset lane stripe, and the 3-stat footer
  ("Bus lanes 17%", "ACE/TSP 16 segments", "Focus segment") are deleted.
  ACE/TSP become route-level text facts with source + scope in the readout;
  the only spatial treatment layer is published DOT lane geometry, opt-in.
- **D6** Speed-by-hour: window chips deleted; the slowest window is an
  on-chart flag on the hour it names; labeled schedule line stays.
- **D7** Riders gains "When riders ride" — real hourly boardings (Mar 2026:
  314.8K, peaking 25.1K at 5 PM) with the busiest window flagged (Tue 5 PM,
  4.8K). Supersedes the derived "Rider exposure by hour" strip so the tab
  keeps one hour chart.
- **D8** Copy: "Slowest segments"; "coverage through Mar 2026" captions
  (ADR-0022 de-month rules); denominators always stated.
- **D9** Phone: bounded ~280–300px map, tap-pin readout beneath, complete
  list in flow; nothing hover-only.

Out of this round (unchanged from plan 081 as written): the month/daypart
historical mode (step 4), exact-artifact verification boundaries (step 3),
and the overview-locator work (step 6).

## Data used

B41 (Brooklyn, worst rider-hour burden in the system at 100,878/weekday):
`data/artifacts/studio/v1/segments.json` + `routes.json`,
`data/artifacts/map/route-segments/b41/2026-03/all-day.geojson` (geometry,
downsampled to ≤10 points per segment for the comp),
`data/artifacts/studio/v2/routes/b41/hourly-profile.json` (24h speeds +
boardings, peak/slowest windows), `.../dossier.json` (36-month ridership),
`.../speed-history.json` (36-month traversal-weighted series for the
top-burden segment). Verified rendering headlessly; the DOT-lane dashes in
the comp follow the route shape for illustration — production renders the
published DOT feature collection via plan 079's verified manifest.
