---
title: Charting Library Evaluation (post-Recharts)
type: engineering
status: draft
last_updated: 2026-06-05
owner: claude
source_count: 6
tags: [frontend, charts, visualization, recharts, d3, uplot, bundle-budget, apps-web]
---

# Charting Library Evaluation (post-Recharts)

## TL;DR recommendation

> **Recommended primary visualization approach:** own a thin **D3-primitive layer** —
> `d3-scale` + `d3-shape` + `d3-array` + `d3-time-format` rendered as **React/SVG** — as the engine
> for bespoke "argument" figures.
>
> **Recommended fallback / secondary library:** **uPlot** (Canvas, ~20 KB) for dense multi-year
> time-series and any view past a few thousand points.
>
> **Why:** This project does not have one charting need; it has three. (1) Editorial, custom,
> mostly small-N "the figure *is* the argument" visuals — best served by D3 scales + React SVG,
> which is *already what the codebase does* in `CorridorProfile.chart.tsx`. (2) Dense, multi-year,
> many-point operational views — best served by Canvas via uPlot. (3) Spatial/corridor maps —
> already handled by `maplibre-gl`. No single batteries-included library wins all three without
> paying in bundle size, lock-in, or expressive ceiling. Owning the primitive layer keeps the
> 168 KB initial-JS budget intact, eliminates lock-in, and generalizes the custom-SVG pattern the
> team has already validated.

This memo answers the research request in `serving_snapshot_2_full_route_baseline` follow-up work.
It assumes the storage split in [[wiki/engineering/serving_storage_split_plan|serving storage split]]
and the map decision in [[wiki/engineering/map_strategy|map strategy]] (MapLibre GL stays).

## Where we are today (facts, not guesses)

- `apps/web` already depends on **Recharts `^3.2.0`** (resolves to **3.8.1**) and **`maplibre-gl`**.
- Recharts is used in five files: `ui/chart.tsx` (the shadcn chart shell),
  `HourBars.chart.tsx`, `HourOverlay.chart.tsx`, `CorridorProfile.chart.tsx`, and a dev example.
- **The most advanced chart is already hand-drawn.** `CorridorProfile.chart.tsx` (the stop-by-stop
  dumbbell ladder) uses Recharts 3's composable hooks — `usePlotArea`, `useXAxisScale`,
  `useYAxisScale` — purely for scales + an axis + a hover anchor, then renders every visible mark
  (lines, dumbbell circles, value labels, treatment dots, worst-row highlight) as raw `<g>`/`<svg>`
  primitives. That is the visx/D3 pattern wearing a Recharts coat.
- `apps/web` carries a tight **~168 KB initial-JS budget** (see
  [[project_web_perf_budget_codesplit]]). Recharts min+gzip lands around the ~100 KB range, so it is
  a meaningful slice of that budget for any route that loads it eagerly.

**Implication:** the team has not really outgrown "a charting library" — it has outgrown the
*preset-chart model*. The real question is not "which library has more chart types," it is "what is
the cleanest primitive layer for fully custom transit figures, and what handles the dense stuff."

## Three rendering tiers (the framing that resolves the choice)

| Tier | What it draws | Cardinality | Best engine |
|---|---|---|---|
| **A. Argument figures** | Dumbbell ladders, the "flip" diverging bars, event-study CI/forest plots, episode pulse strips, robustness ladders, small multiples | small (10s–low 1000s of marks), SSR-friendly, annotation-heavy | **D3 scales + React SVG** (own primitives) |
| **B. Dense operational** | Multi-year hour×month speed heatmaps, headway/bunching streams, 18.9 M-row drill-downs, distribution bands over time | large (5 k–millions of points) | **uPlot** (Canvas) |
| **C. Spatial** | Corridor maps, route shapes, segment geometry, curb-complaint density | geo | **maplibre-gl** (already in) — see [[wiki/engineering/map_strategy|map strategy]] |

Most of the beautiful, narrative figures the project wants (the B41 / curb-pulse case-study spread)
are **Tier A**. The "so much data, not sure what to do" anxiety is mostly **Tier B**.

## Comparison table

Scores are for *this project's* needs (TS-first, React 19, Workers/static deploy, 168 KB budget,
custom transit visuals + a few dense views). 5 = excellent fit, 1 = poor.

| Library | Expressive­ness | Perf (large data) | Bundle | React/TS fit | Interactivity | Maintenance | Transit fit | Notes |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **D3 modules + React SVG** (own primitives) | **5** | 3 (SVG-bound) | **5** (a few KB/chart, tree-shaken) | **5** (you write the components) | 4 (you wire it) | **5** (d3-scale/shape are stable, ubiquitous) | **5** | The recommendation for Tier A. Slight upfront cost to build a `Marks`/`Axis`/scale-context kit. |
| **uPlot** | 3 (time-series shaped) | **5** (Canvas, millions of pts) | **5** (~20 KB) | 3 (imperative; thin React wrapper needed) | 4 (fast cursor/zoom) | 4 (active, single-maintainer) | 4 | The recommendation for Tier B. Not for bespoke non-time-series marks. |
| **Observable Plot** | 4 (grammar-of-graphics) | 3 | 3 (~off-budget for public hot path; whole lib) | 2 (imperative `useRef`+`useEffect`; SSR only for small data) | 2 (limited built-ins) | 4 (Observable, active) | 4 | Best **prototyping / internal dashboards**, not the public render path. |
| **visx** | **5** | 3 | 4 (modular, but pulls d3) | 4 | 3 | **2** | 4 | Same primitives you get from d3 directly, but **maintenance risk**: React 19 only in a stalled `4.0.0-alpha`; orgs migrating off. Use as a *reference*, not a dependency. |
| **Recharts 3** | 3 (good as a primitive via v3 hooks) | 2 | 2 (~100 KB) | **5** | 4 | 4 | 3 | Already here. Fine **bridge**; its v3 hooks are the d3-scale+SVG pattern, so migration is incremental. |
| **Apache ECharts** | 4 | **5** (Canvas/WebGL) | 2 (~100 KB gzip tree-shaken, ~300 KB full) | 3 (wrapper) | **5** (batteries included) | **5** | 3 | The **fallback if** they want a heavy batteries-included dashboard fast. Bundle + imperative-config lock-in. |
| **Vega-Lite / Vega** | 4 (declarative grammar) | 3 | 1 (very heavy) | 2 | 3 | 4 | 3 | Great for analyst-authored specs; wrong altitude + bundle for a public custom UI. |
| **Nivo** | 3 (preset + some custom layers) | 2 | 1 (heavy, per-chart packages) | 4 | 4 | 3 | 2 | Preset-shaped; same ceiling as Recharts with a bigger bundle. No reason to switch *to* it. |
| **Plotly.js** | 3 | 3 | 1 (very heavy, ~1 MB+) | 2 | 5 | 4 | 2 | Scientific/exploratory. Bundle disqualifies it from the public path. |

### Verified facts behind the scores (mid-2026)

- **uPlot ≈ 20 KB, under ~50 KB gzipped; built for millions of points on Canvas.**
- **ECharts ≈ 300 KB full, tree-shakeable to ~100 KB gzipped** if you import only used charts.
- **Recharts** ships lightweight d3 submodules rather than full d3, but still lands ~100 KB-class
  min+gzip — material against a 168 KB budget.
- **visx** maintenance has slowed: React 19 support exists only in `4.0.0-alpha`, the alpha stalled
  with unreviewed PRs, and some teams have adopted the alpha *only* to unblock React 19 while
  planning to migrate away. Treat as elevated lock-in/abandonment risk.
- **Observable Plot** React story is an imperative escape hatch (`useRef` + `useEffect`, or
  `document` option for SSR); SSR is "only practical for simple plots of small data" per its own
  docs — fine for internal tools, not for dense public charts.

## The three "best" picks

- **Best for highly custom visuals → D3 modules + React SVG (own primitives).** Maximum expressive
  ceiling, smallest per-chart cost, zero lock-in, SSR-clean. You already proved it works in the
  dumbbell. visx is the same idea with a maintenance liability bolted on.
- **Best for performance / small bundle → uPlot.** ~20 KB, Canvas, comfortably handles the
  multi-year per-route hourly panels. Wrap once in a `<UPlotChart>` React component.
- **Best for fastest implementation → keep Recharts for plain dashboards during transition, and use
  Observable Plot for internal/exploratory work.** Both let you stand up a standard chart in
  minutes; neither should be the long-term home of the signature figures.

## Risks / tradeoffs per option

- **Own D3 primitives:** upfront cost to build `scaleContext` + `Axis` + `Marks` helpers and tooltip
  plumbing; you own accessibility (ARIA, keyboard focus order) instead of inheriting it. Mitigation:
  the dumbbell already contains 70% of this kit — extract it into `packages/charts`.
- **uPlot:** imperative API, single-maintainer project, time-series-shaped (awkward for non-temporal
  bespoke marks). Mitigation: confine it to Tier B time-series; never force argument figures into it.
- **Observable Plot:** weak React integration, SSR only for small data, heavier than the budget
  likes. Mitigation: internal/prototyping only.
- **visx:** React 19/maintenance risk; pulls d3 anyway. Mitigation: don't add it — read its source
  for reference implementations and copy the primitive you need.
- **Recharts (status quo):** bundle cost and a preset ceiling you've already hit. Mitigation: stop
  adding new chart *types* to it; let it age out as figures move to the primitive layer.
- **ECharts:** bundle + config-as-data lock-in; its strength (batteries-included dense dashboards) is
  exactly the part uPlot + maplibre already cover here.

## Suggested migration path away from Recharts

Incremental, because Recharts 3's hooks already *are* the target pattern — this is a refactor, not a
rewrite.

1. **Extract the primitive kit.** Pull the scale-context + axis + marks logic out of
   `CorridorProfile.chart.tsx` into a new internal `packages/charts` (or `apps/web/src/charts/`)
   with `d3-scale`/`d3-shape`/`d3-array`/`d3-time-format` as direct deps. Provide `<ChartFrame>`,
   `useLinearScale`/`useBandScale`, `<Axis>`, and the existing tooltip shell. Keep the
   `--bp-color-*` token contract.
2. **Re-implement the dumbbell on the kit**, dropping its Recharts import. This is the proof that the
   kit replaces Recharts for Tier A with no visual regression. Verify against the system gallery.
3. **Build new Tier A figures on the kit only** (pulse strip, the flip, event-study/forest, episode
   timeline). Do **not** add them to Recharts.
4. **Add the `<UPlotChart>` wrapper** for the first Tier B view (multi-year hour×month heatmap).
5. **Migrate the two remaining simple charts** (`HourBars`, `HourOverlay`) to the kit, then **drop
   the `recharts` dependency** and the `ui/chart.tsx` shell. Re-check the initial-JS budget — this
   step should *reduce* it.

Each step is independently shippable and budget-checked; nothing requires a big-bang rewrite.

## Example visualizations to prototype first

Tied to the curb-pulse / B41 case-study spread (see
[[wiki/engineering/serving_snapshot_2_visualization_and_multiyear|viz + multi-year plan]] for the
full catalog). Build in this order — it proves the kit, reuses the dumbbell, and showcases
multi-year data:

1. **Episode pulse strip** (Tier A, kit) — 36-month daily/weekly travel-time strip with episodes
   highlighted; "−95 s / +2.6 mph" annotation. Proves time scale + annotation layer.
2. **The flip** (Tier A, kit) — diverging effect chart: network **+48 s** vs this segment **−95 s**,
   each with a 95% CI whisker; signs differ, neither crosses zero. The signature figure.
3. **Robustness forest / ladder** (Tier A, **reuse the dumbbell primitive**) — estimate under each
   control set + adjacent-block placebo + boardings demand check, CI whiskers, zero line.
4. **Multi-year hour×month speed heatmap** (Tier B, uPlot/Canvas) — one route/segment, hour-of-day ×
   month over 2023→present. The "so much data" workhorse; proves the Canvas wrapper.
5. **Episode ↔ permit overlay timeline** (Tier A, kit) — 34 episodes as a lane chart against filed
   permit windows (88% inside), with the 311 double-parking series co-moving beneath.

## Sources

- https://github.com/airbnb/visx/discussions/1908 — visx future plans/maintenance — verified_at: 2026-06-05
- https://github.com/airbnb/visx — React 19 in 4.0.0-alpha — verified_at: 2026-06-05
- https://observablehq.com/plot/getting-started — Plot React + SSR guidance — verified_at: 2026-06-05
- https://blog.logrocket.com/best-react-chart-libraries-2026/ — 2026 React chart landscape — verified_at: 2026-06-05
- https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/ — uPlot perf/bundle — verified_at: 2026-06-05
- https://github.com/apache/echarts — ECharts tree-shaking/bundle — verified_at: 2026-06-05
