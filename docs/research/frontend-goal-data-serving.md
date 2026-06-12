# Frontend Goal: Serve the corpus, not the snapshot

**Version 2** — revised 2026-06-10 after maintainer review. v1 fixed the plumbing (contract,
adaptivity, perf) but did not redesign the product surface. v2 adds the layers that actually
produce "the perfect frontend": the route-detail redesign, detector-shaped UI, the maps program,
and a deliberate widening of what data reaches users. Maintainer decisions from the v1 review are
recorded in §16 and applied throughout (hard cutover; flagship curation; 6-month movement
baseline; ladder permanently deleted).

**For:** the maintainer and implementing agents. Companion to
`docs/research/master-plan-product-questions.md` (this doc is the consumer side of its Tracks E/F
plus the product-surface design those tracks assume).

**Mission:** close the gap between what the project knows and what the frontend shows — in
content (the corpus), in form (pages designed around questions and verdicts, not datasets), and
in feel (responsive, adaptive, beautiful). The product must read as synthesized evidence with a
point of view, not re-displayed Open Data.

**Maintainer decision, 2026-06-12:** stop designing around the idea of a monthly publishing
product. The public app should serve a multi-year route/corridor evidence dossier wherever source
coverage supports it. `baselineMonth` and release-keyed artifacts remain provenance, audit, and
promotion anchors; they are not the shape of the user-facing contract.

---

## 0. What this project is for (the thesis the frontend must express)

> Turn fragmented public transit data into **defensible, citable, multi-year route and corridor
> evidence** — for the evidence author who must produce a board-ready explanation, and for the
> public reader who deserves an honest report card.

The ideal utility: for any NYC bus route, the product answers — *what's wrong here, since when,
who does it affect, what was tried, did it work, what explains it, and what can't we know yet* —
each answer carrying evidence, claim posture, and gaps. The differentiation is the **synthesis**
(persistence, baselines, peer residuals, episodes, document corroboration, rider-weighting) and
the **honesty** (claim tiers, coverage states, negative space). The frontend is where that is
either visible or wasted.

## 1. Ground truth (verified 2026-06-10)

### Current contract problem: month-shaped, schema-deep

8 of 11 public read models are single-month snapshots; route detail, findings, compare, and
search are *implicitly* bound to `env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH`
(`packages/studio-api/src/studio/read-handlers.ts:1617`). Only route history, speed history, and
projection-ref metadata are series-shaped. Route detail shows `generatedAt` (pipeline run time)
and never the period the data describes.

This is the legacy shape to remove. The target contract is series-first: route identity, verdicts,
capability states, history windows, treatment dates, current signals, and evidence refs travel
together, with any single baseline month labeled as an anchor inside that dossier.

### Page: dataset-shaped tabs, fixed composition

Current tabs (`RouteDetailShell.tsx:9-14`): Overview / Slow segments / Riders / Interventions /
Timeline / Data notes. (Ladder was deleted — could not reach the design bar; that lesson governs
this plan.) Overview (`OverviewSection.tsx`) is a fixed stack — one diagnosis paragraph + slowest
segment sentence + **one** insight slot + corridor profile + speed trend + hour bars — identical
for every route regardless of what actually matters there. "Interventions" and "Timeline" overlap
(the former links into the latter). There is no reliability tab, no map, and tab names describe
datasets, not questions.

### Adaptivity: machinery exists, UI ignores it

19 per-surface flags populated for every route (`snapshots.ts:56-78`,
`read-handlers.ts:308-344`); **zero consumers** in `apps/web`. Every route renders the same
sections with null fallbacks. The one adaptive piece that works:
`buildRouteInsightsFromDetectorReadiness()` → per-route insights — currently placed as a single
sentence in Overview and annotations in Slow segments. It is the seed of §5, not a finished
feature.

### Maps: dependencies installed, never used; artifacts already produced

`maplibre-gl` and `pmtiles` are **already in `apps/web` dependencies** (referenced only from
`global.css`). The pipeline **already emits map artifacts**: citywide
`map/routes/current-local-limited-sbs.min.geojson`, `map/bus-lanes/local-streets.min.geojson`,
`map/stops/current-timepoints.min.geojson`, and per-route
`map/route-segments/<route>/<month>/<daypart>.geojson`. The maps program (§6) has a substrate
waiting; nothing renders it.

### Unserved corpus and perf debt

385 routes have multi-year carpet artifacts with no UI; observed-reliability sits in D1 with no
endpoint; no daypart/top-k/treatment/evidence-index read models; Tier 2 records (mta-wiki) reach
nothing public. Bundle: 476 KB gz vs 430 KB budget, budget script not wired into the build;
no immutable caching; no prefetch. (Loaders parallel and charts lazy — those are fine.)

## 2. Diagnosis

Four compounding problems:

1. **Month-shaped contract** — the UI cannot tell a multi-year story except in two bolted-on
   series endpoints; that shape must stop being the default contract for public surfaces.
2. **Dataset-shaped IA** — tabs mirror pipeline tables, not user questions; Overview is a dump,
   not a verdict; the page has no editorial point of view.
3. **Detectors have no visual consequence** — the project's core investment (calibrated,
   readiness-gated, route-specific detection) surfaces as one sentence and some row annotations.
4. **Unserved corpus** — the most differentiated artifacts (carpets, reliability, maps,
   documents) never reach a user.

Common cause: the frontend was built around the *pipeline's* old unit of work (a baseline-month
table slice) rather than the *product's* unit of meaning (a route's evidence, judged across time).
Fix the contract (§7), then let detectors edit the page (§4–5), then widen what's served (§6, §9).

## 3. Design principles

- **P1 — The route evidence dossier.** The route is the entity; time is an axis on every fact.
  Series-first contracts; "current" = last point + trend, never the only shape.
- **P2 — Vintage ≠ time range.** Every block carries `dataAsOf` + freshness; `generatedAt`
  disappears from user-facing labels.
- **P3 — Adaptive disclosure with honest states.** Composition driven by a per-route capability
  manifest; empty is never ambiguous (`checked_clean` / `insufficient_data` / `building` /
  `not_applicable`).
- **P4 — Tiered payloads.** Tiny header → one meaningful dossier fetch → heavy artifacts lazy
  and immutable.
- **P5 — Derived-first.** If a section's headline is reproducible by a Socrata query, it is not
  finished.
- **P6 — Detectors are the editors.** *(new)* The page is ranked, badged, and ordered by what
  readiness-gated detectors found for *this* route. Findings lead; raw metrics support. A route
  page should read differently because the route *is* different.
- **P7 — The map is a first-class surface.** *(new)* New Yorkers think in streets, not tables.
  Every spatial claim gets a spatial rendering; the citywide map is a primary discovery surface
  on the navbar, not an illustration.

## 4. The route-detail redesign

This is the heart of v2. The page becomes a **judged dossier**: a verdict up top, question-shaped
tabs behind it, every element manifest-gated and detector-ranked.

### 4.1 Header: identity + five judged KPIs

Replace raw-metric KPIs with judged, time-aware ones (each with `dataAsOf`, a 6-month movement
arrow, and a click-through to its tab):

1. **Condition** — current speed *with peer framing*: "6.1 mph — slower than 78% of local
   routes" (peer percentile is the headline; mph is the detail).
2. **Trend** — 6-month movement with 12-month context sparkline (the §16 decision baseline):
   "−8% over 6 months."
3. **Reliability** — wait/regularity grade (EWT-derived) once Track B Wave 1 lands; `building`
   state until then.
4. **Riders** — daily riders + rider-hours lost/day when the rider-pain read model exists;
   daily riders alone until then.
5. **Treatment posture** — treated/partial/untreated + active-flag count ("Bus lane (2021) ·
   2 open flags").

Actions stay (Compare, Generate brief) — send-to-brief becomes ubiquitous (§5.4).

### 4.2 Overview → the Verdict

Overview's job: **answer "what's the story of this route?" in 20 seconds**, composed per route:

1. **What stands out** — up to three ranked insight cards (severity × confidence, readiness-
   gated, posture-worded), each with a one-line claim, a micro-figure (sparkline/segment strip),
   a "why" caveat affordance, a deep link into its tab, and send-to-brief. Zero insights → the
   honest alternative: "Checked through {month}: no flags raised across N detector families —
   here's what we checked." The negative space *is* the story for healthy routes.
2. **The story strip** — one multi-year figure chosen by what matters: worsening route → trend
   with the degradation window shaded; pulse/episode route → carpet excerpt; treated route →
   before/after framing (descriptive wording until methodology-gated). Not the same chart for
   everyone.
3. **Mini-map** — the route shape with segment pace coloring and flagged segments emphasized
   (from the existing per-route GeoJSON), linking to the Map tab.
4. **Verdict footer** — treatment posture chips, dataAsOf, "what we checked" link into Evidence.

The current corridor profile + hour bars move into "Where & when" — they are diagnosis tools,
not overview.

### 4.3 The tabs (question-shaped, manifest-gated)

| Tab | Question | Contents | Gating |
|---|---|---|---|
| **Overview** | What's the story? | §4.2 verdict | always (adapts) |
| **Map** | Where is this route, and where does it hurt? | full-bleed route map: segment pace choropleth with daypart toggle, bus-lane/treatment overlay, flagged segments, stop timepoints; hover = segment card | always (geometry exists for all) |
| **Where & when** | Where and when does it lose time? | segment top-k with persistence badges, corridor profile, hour×DOW matrix, multi-year carpet | `ready/partial` on segment data |
| **Reliability** | Can riders count on it? | EWT/bunching/long gaps with sample coverage, scheduled baseline, stop-hour pockets | Track B Wave 1 readiness |
| **Riders** | Who bears it? | daily riders, route-hour exposure, rider-hours lost, top exposure segments; equity context later (E9) | ridership presence |
| **Treatments & history** | What was tried, and what happened? | unified treatment inventory + dated timeline + document refs (mta-wiki), event-study cards when promoted; absorbs today's Interventions *and* Timeline tabs | always; depth varies |
| **Evidence** | What can I cite, and what did you check? | findings, evidence index entries, coverage matrix ("checked clean" per family), source freshness, data notes; absorbs Data notes | always |

Sparse routes might render only Overview / Map / Evidence with honest states — the tab strip
itself is manifest-driven (hidden tabs listed in Evidence with reasons). Tabs carry **flag
badges** ("Where & when ·2") from detector insights.

### 4.4 Design discipline

The ladder died because it couldn't reach the design bar — the redesign and the map go through
the same design-handoff cycle as Authoring v2 (explore → converge → canonical handoff) before
build. Editorial visual language (paper/ink, mono labels) extends to the map style (§6.4).

## 5. Detector-shaped UI

How the detector investment becomes visible product, beyond §4.2's cards:

- **5.1 Insight cards as a typed system.** Each calibrated detector family ships a card spec:
  posture-worded claim template (from `FindingDetectorSpec.allowedClaimStrength` + readiness
  bucket), micro-figure type, target tab anchor, caveat lines. New calibrations (Track B waves)
  light up new card types — frontend work per family approaches zero after the system exists.
- **5.2 Ranking and ordering.** Insights order the Overview cards, badge the tabs, float flagged
  segments/hours/stops to the top of their sections, and (lens §6.3) color the citywide map.
  Severity and confidence render as distinct visual channels, never collapsed.
- **5.3 Negative space as a feature.** Per-family "checked clean through {month}" chips in
  Evidence; the zero-insight Overview state; route index badges ("clean 12 mo"). Backed by
  Track B's coverage states — silence is only claimable where the detector provably looked.
- **5.4 Everything cites.** Every insight card, segment row, timeline event, and map selection
  exposes send-to-brief; the dossier is the corpus palette's primary feeder (F-track in the
  master plan).
- **5.5 Sections = detector families.** The `/routes` discovery sections (worsening, reliability
  watch, treatment gaps, evidence-ready) become explicitly detector-fed with trajectory
  justification rows ("flagged 4 of last 6 months"), replacing single-month ranks (§7.3).

## 6. The maps program

Substrate already exists (deps installed; citywide + per-route GeoJSON artifacts produced).
Two surfaces, one stack.

- **6.1 Route-detail map (first ship).** MapLibre GL, lazy-chunked; sources: per-route
  `route-segments/<route>/<month>/<daypart>.geojson` (pace-colored segments, daypart toggle),
  `bus-lanes` overlay, `stops/current-timepoints` markers, flagged-segment emphasis from
  insights. Hover/tap → segment card (speed, persistence, rider-hours, treatment overlap) with
  send-to-brief. Also rendered small as the Overview mini-map (static-styled, interaction on
  click-through).
  *Verify:* map tab on three contrast routes; artifact fetch lazy + immutable; chunk budget
  (§11); design-handoff sign-off.
- **6.2 Citywide Map page (navbar).** The discovery surface: every route drawn, colored by a
  **lens switcher** — speed, 6-month trend, reliability grade, rider pain, treatment coverage,
  open flags, data coverage. Hover = route mini-card; click = route detail. Borough/area
  rollups (E9) become a choropleth lens later. Lenses are exactly the derived metrics — the map
  *is* the beyond-OpenData argument, rendered.
  *Verify:* lens switching under 100ms on cached data; citywide payload ≤ ~1.5 MB gz initial
  (simplified geometries; segment grain only on zoom); QA on mobile.
- **6.3 Story maps (later, gated).** Corridor case geographies (episode pulses, event-study
  extents) as map figures inside briefs and case artifacts (master plan G2/C6); context lenses
  (311 curb-friction density, permit windows) research-gated per claim-posture rules.
- **6.4 Stack and serving decisions.** MapLibre GL JS + PMTiles are the committed stack (deps
  already present; charts remain shadcn/Recharts — maps are not charts). Basemap: self-hosted
  vector basemap as PMTiles on R2 (Protomaps build), styled to the editorial palette — no
  third-party tile dependency, fits the Cloudflare model; `pmtiles` range requests serve it
  without a tile server. Overlays: keep GeoJSON sources for v1 (MapLibre tiles them client-side;
  citywide simplified file already exists); revisit PMTiles for overlays only if the citywide
  segment-grain lens exceeds the payload budget. All map artifacts content-hashed + immutable
  (§11).
  *Open question for user: §16-O1 (basemap hosting).*

## 7. Contract reshape (the route evidence dossier)

Unchanged in substance from v1, executed as **hard cutover, in-place schema migration** (§16
decision): each slice migrates schema + handler + UI together, old shape deleted in the same
slice, fixtures regenerated.

- **7.1 `route_capability_manifest`.** Evolve the orphaned `surfaceFlags` + `supportLevel` into
  one consumed contract: per surface — state (`ready/partial/building/insufficient_data/
  checked_clean/not_applicable/blocked`), reason, depth (months, grains), `dataAsOf`, freshness.
  Populated from materialization coverage, detector readiness manifests, speed-history coverage,
  Tier 2 coverage.
  *Verify:* domain schema + fixtures; manifest rows asserted for three contrast routes.
- **7.2 Route dossier response (detail v2).** Identity + manifest + per-section series-shaped
  summaries (36-month sparkline vectors, current + trend + peer percentile, worst-segment with
  persistence, treatment posture, latest events, insight refs, map artifact refs). One Tier-1
  fetch renders the verdict page meaningfully. ≤ ~60 KB gz budget asserted in test.
- **7.3 De-month the network surfaces.** Sections rows carry 6-month movement + 12-month context
  (the decided baseline); search/compare/findings declare `dataAsOf`; `baselineMonth` survives
  only in pipeline metadata. No `generatedAt` as a user-facing data label (grep-verified).
- **7.4 Freshness doctrine.** One shared component renders `dataAsOf` + freshness everywhere.

## 8. The adaptive page (consuming §4 + §7)

- **8.1 Section/tab registry driven by the manifest** — render policy per state; kills the
  uniform page. *Verify:* three-contrast-route render tests + QA screenshots.
- **8.2 Honest-empty vocabulary** — four distinct visual states; `checked_clean` designed as the
  credibility feature.
- **8.3 Route archetypes** — `flagship / standard / sparse` derived from manifest depth.
  Flagship: the ~10 hand-curated evidence-rich routes (§16 decision) get the long-form dossier
  first and double as the master plan's flagship-brief substrate; archetype logic then
  generalizes.
- **8.4 Insight system build-out** — the §5.1 card system replacing today's single-sentence
  placement.

## 9. Widening what we serve (data diversity)

The dossier and map must draw from the whole corpus, not the speed tables. Cut-over order
(read-model construction = master plan Track E; D = mta-wiki):

1. Multi-year carpets (385 artifacts; E10) — "Where & when" + story strip.
2. Reliability series (E3 after B-Wave 1) — tab + KPI + map lens.
3. Segment top-k + daypart matrix (E2/E4) — "Where & when" + map coloring.
4. Treatments + timeline + documents (E5/E6/E7 + D-track) — "Treatments & history" with
   block-cited refs.
5. Evidence index + findings (E1) — "Evidence" tab + send-to-brief targets.
6. Rider pain / rider-hours lost (A6 + read model) — Riders tab + header KPI + map lens.
7. Peer cohorts + compare v2 (E8) — header framing + compare page as explanation.
8. Area rollups (E9) — map choropleth lens + electeds' geography pages.
9. Episodes/cases (C-track) — story strip, story maps, case panels.
10. Context layers (A3/A4; research-gated) — map lenses with associational posture only.

The §12 corpus table is the contract this list fills; anything served must pass P5
(derived-first) and Track B readiness gates.

## 10. Beyond-OpenData headlines

Contracts designed now, shipped as upstream tracks deliver: rider-hours-lost as headline
currency; persistence/peer framing everywhere ("slower than 80% of comparable routes for 9
straight months"); episode/case panels with falsifiable-prediction styling; the negative-space
section; compare-as-explanation. (Unchanged from v1 §7 — now consumed by §4's specific slots.)

## 11. Performance program

As v1, plus map budgets:

- **P0** — wire `check-bundle-budget.ts` into the build (fail over budget); recover the 46 KB
  overage (CartesianChart/BriefProse chunk audit; route-detail chunk splits along the §8.1
  registry). **New budget line:** map chunk (maplibre + map code) ≤ 250 KB gz, loaded only on
  map surfaces, never in entry; citywide map data initial ≤ ~1.5 MB gz.
- **P1** — content-hashed, `immutable` artifact serving (R2 projections, map artifacts,
  basemap PMTiles); short-TTL+SWR only for mutable indexes.
- **P2** — hover/intent prefetch for route links; dossier payload small enough that navigation
  feels instant.
- **P3** — Tier-2 hygiene: decimated previews, off-critical-path parsing, verify `release.json`
  (11 MB) never browser-served.
- **P4** — skeletons matching final layout; cached-first repeat visits with freshness refresh.

## 12. The target serving corpus (what the frontend consumes)

Per **route**: capability manifest (Tier 0–1) · dossier summary with series vectors + insight
refs (Tier 1) · speed-history cells/carpet (Tier 2) · reliability series (1–2) · segment top-k
with persistence (1) · daypart matrix (2) · treatments with date precision (1) · block-cited
timeline (1–2) · evidence index (1) · readiness-gated insights (1) · findings/briefs (1) ·
**map bundle: segment GeoJSON per daypart, stops, lane overlays (2)** · case payloads (2).
Per **network**: sections with trajectories · search aggregates · peer/compare context · area
rollups · coverage matrix · **citywide map layers + lens data (per-lens route-keyed values)** ·
basemap PMTiles. Everything readiness-gated, claim-postured, `dataAsOf`-labeled.

## 13. Sequencing

```text
P0 budget gate ───────────────────────────────────────────► continuous
7.1 manifest ─► 7.2 dossier ─► 8.1 registry ─► 4.1–4.3 redesigned page (flagship 10 first)
     │                              │                ▲ design-handoff cycle runs ahead (4.4)
     │                              └─► 5.1–5.4 insight system
6.1 route map (substrate exists — can start with design handoff immediately)
6.2 citywide Map page (after 7.3 lens data + 6.4 basemap)
9.x corpus cut-overs as Track B/E/D land    10.x as A/B/C/D deliver
P1/P2 after 7.2 defines payloads
```

Map work and the contract reshape are independent until 6.2's lenses (need 7.3) — start 6.1 and
7.1 in parallel. Alignment with the master plan: §7–8 + 6.1 + 9.1 target **M3**; 6.2 lands with
M3–M4; §10 rides M4–M6.

## 14. Definition of done

1. Contract: no implicit month-binding; `dataAsOf` everywhere; hard cutover complete (old shapes
   deleted); dossier ≤ 60 KB gz.
2. Page: the redesigned tab set live; Overview is a per-route verdict (three-contrast-route QA:
   a flagged route, a clean route, and a sparse route read as *different pages*); every empty is
   one of four honest states.
3. Detectors visible: insight cards ranked on Overview, tabs badged, negative space rendered;
   each newly calibrated family lights up via the card system without bespoke page work.
4. Maps: route map on every route page; citywide Map on the navbar with ≥4 derived lenses; both
   pass the design bar (handoff sign-off), budgets, and mobile QA.
5. Corpus: items 1–5 of §9 served and visible; at least three dossier sections lead with derived
   headlines (P5 test).
6. Perf: budget gate enforced and green (incl. map budget line); immutable artifact caching;
   intent prefetch live.

## 15. Non-goals

- No live/real-time data, trip planning, or dashboard-builder genericity.
- Charts stay shadcn/Recharts; **maps are MapLibre + PMTiles** (already dependencies) — no other
  visualization stacks.
- No serving of uncalibrated detector output; no causal wording without methodology gates.
- No SSR/streaming re-architecture; SPA + Worker stays.
- No per-user personalization; adaptivity is evidence-driven.
- No 3D/animated map spectacle that fails the design bar or the budget — the ladder lesson.

## 16. Decisions record + open decisions

**Decided (maintainer, 2026-06-10 v1 review):**

- **D1 — Hard cutover, in-place schema migration.** No additive v2 endpoints; each slice
  migrates schema + handler + UI together. (Applied in §7.)
- **D2 — Flagship curation: yes.** ~10 evidence-rich routes get the long-form dossier first;
  they double as flagship-brief substrate. (Applied in §8.3.)
- **D3 — 6-month movement with 12-month context** as the rankings/trend baseline. (Applied in
  §4.1, §7.3.)
- **D4 — Ladder is deleted, permanently** (failed the design bar). Stop-level views return only
  through the map (§6.1 segment/stop interactions), and only past the design bar. (Applied in
  §4.3, §15.)

**Open (user-owned):**

- **O1 — Basemap hosting.** Self-hosted Protomaps PMTiles on R2 (recommended: no third-party
  dependency, editorial styling control, fits Cloudflare; one-time basemap build + storage) vs a
  hosted free tile service (zero build, but external dependency + less style control).
- **O2 — Design-handoff scope.** Run the §4 route-detail redesign and the §6 maps as one
  combined design cycle (coherent system, slower to first ship) or two (map can ship sooner)?
  Recommendation: two cycles, map first — substrate is ready and it is the most visible win.
- **O3 — Header KPI set sign-off.** Confirm the §4.1 five (Condition/Trend/Reliability/Riders/
  Treatment) as the canonical KPIs, since they bind read-model work.
  **Decided 2026-06-10 (maintainer): approved as specified.** The dossier schema (hard-cutover
  plan C2) is unblocked.

## 17. Assumptions (documented, not asked)

- "Responsiveness" = perceived speed + adaptive loading; mobile layout polish rides the design-
  handoff cycles rather than a separate plan.
- The existing per-route `route-segments/<route>/<month>/<daypart>.geojson` artifacts are
  representative of fleet-wide map coverage (spot-checked m14a+, q14, b61, b103); if coverage is
  partial, a Track A slice extends the map artifact build before 6.1 ships network-wide.
- Insight card claim templates reuse detector spec wording (`allowedClaimStrength` + readiness
  buckets) — no new claim-language authority is created in the frontend.
