# Design brief: route-detail verdict page + route map

**Status:** ready to hand to the designer agent (2026-06-10). This is the §4.4 design-handoff
entry point for frontend plan §4.2 (verdict Overview), §6.1 (route-detail map), and §8.3
(route archetypes). Process: explore → converge → one canonical handoff document, the same
cycle that produced Authoring v2. Build does not start until the handoff is signed off.

---

## Prompt for the designer agent

You are designing the **verdict layer** of the route-detail page for Bus Priority Impact
Studio — an evidence product that turns NYC bus data into defensible, citable route dossiers
for two readers: the evidence author producing a board-ready explanation, and the public
reader who deserves an honest report card. The page must read as **synthesized evidence with
a point of view**, never re-displayed Open Data.

### What already exists (do not redesign)

The structural shell shipped and is fixed scope:

- **Judged KPI header** (5 columns): Condition with peer framing, 6-month Trend + sparkline,
  Reliability (honest-building), Riders, Treatment posture — each with its own `dataAsOf`
  freshness chip and tab click-through. (`RouteJudgedKpiStrip.tsx`)
- **Question-shaped tabs:** Overview / Where & when / Riders / Treatments & history /
  Evidence. Tab visibility and empty states are driven by a per-route capability manifest
  (7 states); the four honest-empty states exist (`HonestEmptySection.tsx`), with
  `checked_clean` styled affirmatively.
- **Freshness doctrine:** every data block shows `dataAsOf` + a current/recent/stale/unknown
  dot (`DataAsOf.tsx`). `generatedAt` never appears in UI.
- **Visual language:** editorial paper/ink (warm-white surface ladder, mono labels,
  `--bp-color-*` tokens), shadcn/Recharts charts only. Match it; do not introduce a new
  palette or chart library.

### What you are designing

**1. The Overview tab → the Verdict (§4.2).** Job: answer *"what's the story of this
route?"* in 20 seconds, composed per route — a worsening route, a treated-and-improving
route, and a healthy route must read differently. Four elements to design:

- **What stands out** — up to three ranked insight cards (severity × confidence as two
  distinct visual channels, never collapsed). Each card: a one-line posture-worded claim, a
  micro-figure (sparkline or segment strip), a caveat affordance ("why?"), a deep link into
  its tab, and a send-to-brief action. Design the **zero-insight alternative**: "Checked
  through {month}: no flags raised across N detector families" — the negative space *is* the
  story for healthy routes and must look like a credibility feature, not an apology.
- **The story strip** — one multi-year figure chosen by what matters for this route:
  worsening → trend with the degradation window shaded; episodic → carpet (month×hour heat
  grid) excerpt; treated → before/after framing (descriptive wording only). Not the same
  chart for everyone.
- **Mini-map** — the route shape with segment pace coloring and flagged segments emphasized;
  static-styled, click-through to the Map tab.
- **Verdict footer** — treatment posture chips, dataAsOf, "what we checked" link into
  Evidence.

The current corridor profile and hour bars move to "Where & when" — they are diagnosis
tools, not verdict. Resolve the **two-clocks problem**: the header reads from the dossier
(e.g. 8.6 mph as of 2026-05) while today's diagnosis paragraph reads from the release
(8.4 mph as of 2026-03). The verdict must either use one clock or make the difference
legible; it must never show two unexplained numbers for the same metric.

**2. The Map tab (§6.1) + mini-map.** Full-bleed MapLibre route map: segment pace
choropleth with a daypart toggle, bus-lane/treatment overlay, stop timepoints, flagged
segments emphasized from insights. Hover/tap → segment card (speed, persistence,
rider-hours, treatment overlap) with send-to-brief. Design the map *style* as an extension
of the editorial palette (paper/ink basemap, restrained color reserved for data). New
Yorkers think in streets: every spatial claim on the page should have a spatial rendering.

**3. Route archetypes (§8.3).** Three page densities derived from manifest depth —
`flagship` (the ~10 hand-curated evidence-rich routes; long-form dossier), `standard`,
`sparse` (might render only Overview/Map/Evidence with honest states). Show one example
composition of each; the Overview verdict must be designed sparse-first so a thin route
still looks intentional.

**4. Tab badges.** Detector-flag counts on tabs ("Where & when ·2") — severity-aware,
not alarmist.

### Data you may use (all shipped, per route)

- Dossier: 36-month speed + ridership sparklines, `current`, `movement6mPct`,
  `peerPercentile`, worst segment with persistence-months, treatment posture
  (ACE since, lane count, latest 5 events), per-block `dataAsOf`.
- Capability manifest: per-surface state (7 states), reason, depth, freshness.
- Insights: readiness-gated detector findings with severity, confidence, placement,
  claim posture.
- Map artifacts: per-route segment GeoJSON per month/daypart, citywide routes,
  bus lanes, stop timepoints (all already produced by the pipeline).
- Segments, quality/caveats, timeline events, peer route.

Do not design against data that does not exist yet (reliability grades, rider-hours-lost
per day at the dossier grain, equity context) — leave designed-but-gated slots at most.

### Hard constraints

- Performance: entry bundle ≤165 KB gz (currently 133); map chunk (maplibre + map code)
  ≤250 KB gz, loaded only on map surfaces, never in entry; route artifacts lazy + immutable.
- Honesty rules: every block carries `dataAsOf`; empty is never ambiguous; severity and
  confidence never collapse into one channel; claims are posture-worded (no causal language
  without methodology gating).
- The ladder precedent: the previous "route ladder" page was deleted because it could not
  reach the design bar. Anything that reads as a dataset dump rather than a judgment will
  meet the same fate.
- Mobile: the verdict and map must degrade to a single column gracefully.

### Deliverables

1. Exploration round: 2–3 divergent compositions for the verdict Overview (desktop +
   mobile sketch), 1–2 for the map style/interaction.
2. Converged round after feedback.
3. **Canonical handoff document**: final compositions for the three archetypes, the four
   honest-empty states in situ, component inventory mapped to existing primitives
   (KPI/MetricColumns/Spark/DataAsOf/HonestEmptySection), interaction specs (hover cards,
   daypart toggle, send-to-brief affordance), and the map style tokens. This document
   becomes the single source of truth the build is verified against.

### Open decision (do not block on it)

§16-O1 basemap hosting is undecided; design the map style assuming a self-hosted
Protomaps-style minimal vector basemap (paper/ink). If O1 resolves differently only the
basemap layer restyles.
