# 080 comp round — /map redesign

**Status: APPROVED (round 3, 2026-07-17) — light "Atlas" surface.** The
operator approved with "looks good, lets implement — light mode". The visual
layer is implemented on `codex/080-map-visual-redesign` (attention scale,
Find-a-route panel, one-strip legend, badges/labels, DOT-lanes layer, popup
redesign, remembered note dismissal); this comp is the acceptance target for
that work. The dark "Signal" surface was not selected. Remaining plan-080
scope (URL state, Data notes, mobile sheet, hover-perf rework) still follows
the plan after 079.

This was the comp-gate round for plan 080
(`plans/080-network-decision-map.md`). The round-1 brief is the operator
critique of 2026-07-17: lines indistinguishable, nowhere to focus, everything
green outside Manhattan, period toggle imperceptible, "Lanes 6%" meaningless.

**Round 2 changes (operator feedback, same day):** the persistent sidebar is
gone — a search-first "Find a route" pill opens an opt-in overlay panel
(search + borough chips + full ranked list + DOT-lanes switch in its footer)
that closes when you pick a route, mirroring the mobile browse pattern (D4
revised, now an 080 amendment candidate). The top-right insight note gained a
✕ whose dismissal is remembered (ⓘ restores it) — D18. The two floating
checkboxes are deleted: badges are always on, the lanes layer entry moved into
the panel (D19).

**Round 3 changes (operator feedback, same day):** the 5-hue palette is
replaced by an **attention scale** (operator's "baseline" idea): routes at or
above typical (≥8 mph) draw in one baseline ink; color marks only the slow
side — 7–8 mph sienna, under 7 ember (D1 revised). Same grammar on the delay
lens: baseline under 8k rider-hours, colored 8–15k / 15–40k / 40k+ (D14), and
the compare mode's "steady" band is the same baseline neutral. The PM story
got stronger: the under-7 band grows 65 → 110 routes at PM peak. The legend is
now a single self-labeled strip — range + live route count inside each band,
widths from the real share, no swatch grid/tick rows (D17 revised) — and it
goes dark with the dark surface so swatches always match the map.

Open `network-map-comp.html` in a browser. Exhibits B and C are interactive
(hover, click to pin, lens/period/compare switches, layer toggles, rail search).

## Diagnosis (measured, not vibes)

| Complaint | Cause |
|---|---|
| "Everything is green" | Current ramp saturates at 7.8 mph; 223/350 routes are ≥7.8 and 149 are past the 9.5 ramp end. Staten Island median 13.1, Queens 9.7, city 8.7 — the scale only describes Manhattan (median 6.5). |
| "Toggle does nothing" | Median \|PM − all-day\| = 0.6 mph, p90 = 1.1 — invisible on a near-flat continuous ramp with no transition or caption. |
| "Lanes 6%?" | `laneCoverage` = share of route shape overlapping DOT bus-lane streets (median 12%). Unlabeled, denominatorless, and the lane *lens* paints green over green. |
| "Where to focus?" | 350 identical 2.2px lines, no labels, no landmarks, no ranking, nothing pinned. |

## What the comp proposes

- **D1** Attention scale: color only marks slower-than-typical (under 7 ember,
  7–8 sienna); everything ≥8 mph rides one baseline ink. Green removed.
- **D3/D4** Route badges on the worst ten (always on) + 080's ranked list behind
  a search-first "Find a route" panel — opt-in, closes on pick, hover/pin sync.
- **D6/D17** Period switches get consequences: single 240ms crossfade, a caption
  stating the shift (the under-7 band grows 65 → 110 at PM peak; 67 routes
  change band), and one-strip legend counts that move with the period.
- **D8** Lane-coverage lens retired; real DOT centerlines (3,048 segments) drawn
  as thin dashes over the network. Popup copy: "Bus lanes along N% of this route."
- **D9** Popup: percentile sentence, 24h strip with slowest-stretch marker,
  spelled-out stats with windows, Sources popover.
- **D11** Two surfaces, one system: "Signal" (dark map surface, recommended
  default) and "Atlas" (light). Page chrome stays light app tokens either way.
- **D14** Rider-delay lens, same grammar: baseline under 8k rider-hours, colored
  8–15k / 15–40k / 40k+ (March window). Leads with the B6: ≈140k rider-hours
  lost, the most citywide, at 7.9 mph the old ramp called green.
- Full decision table D1–D17 with 080-status is in the comp.

## Needs an 080 amendment if approved

- **D4** Persistent desktop inspector/list → opt-in "Find a route" overlay panel
  (080 Step 5 specifies a ~320–360px persistent right inspector).
- **D7** "Vs all day" compare mode (diverging Δ scale, bins ±0.75 / −1.5). The
  comp shows it surfacing the QM express-route PM collapse (−2.0 to −2.5 mph).
- **D15** Optional width-by-daily-riders on the delay lens.
- **D17** Legend-as-histogram (stricter than 080's legend spec).

## Standing rulings respected

No autoplay/hour-scrubber (2026-07-04 rejection, commit `9789242`); no external
tiles or CSP changes; no treatment-gap composite (076 gate); no new pages/tabs;
"Data through March 2026" phrasing; no banned doctrine phrases.

## Open operator questions

1. Default surface: Signal (dark) or Atlas (light)?
2. Approve D7 compare mode as an 080 amendment?
3. Ship D15 width-by-riders with the delay lens, or hold?
4. (Later, separate call) Should rider-delay become the landing lens?

## Provenance

Every map renders the real 2026-03 release artifacts:
`data/artifacts/map/2026-03/network-simplified.geojson` (350 routes, hourly
speeds), `data/artifacts/studio/v1/map-route-facts.json` (speeds, riders, lane
coverage, delay exposure), `map/context/nyc-boroughs.min.geojson`,
`map/bus-lanes/local-streets.min.geojson`. Geometry thinned (~0.0009°) and
facts joined into one inline bundle for the comp only; class breaks are the
release quintiles. AM/PM values replicate `periodSpeed` from
`NetworkMapLibre.tsx` including its coverage gates (6 routes fail at AM, 3 at PM).
