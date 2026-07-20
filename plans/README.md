# Implementation Plans

**Current generations: 7 (plans 061-067, the determinism/LOC-reduction
track), 8 (plans 068-076, the 2026-07-09 audit fix-pack + the
business-problem arc), 9 (plans 077-081, the truthful interactive-map
overhaul), 10 (plans 082-083, the route-detail annotation layer +
study-coverage spike), 11 (plans 084-088, the de-month cutover: monthly
baselines/releases retired for coverage windows, a freshness ledger, and a
harness gate), and 12 (plans 090-093 plus amended 082: exact, lossless route
intervention inventory; typed relevance; complete UI recognition; and the
first non-ACE observation expansion — all below).** Generation 6 (048-060, the MTA-visual-language UI/UX
overhaul) is DONE — all thirteen landed through commit `cd878f7`. Gen-7 owns
`packages/*` and `tools/pipeline-v2`; gen-8's fix-pack is cross-cutting and its
business arc adds new pipeline/domain/web surfaces; gen-9 repairs map runtime,
identity, and evidence contracts before redesigning the two existing map
experiences. Interleaving constraints are in each generation's dependency
notes. Generations 4 (030-035) and 5 (036-047) are DONE; generation 3
(019-029) is complete except 026 (BLOCKED); generations 1-2 (001-018) are
complete or superseded; older sections are kept further down as history and
rationale. Each executor: read your plan fully before starting, honor its STOP
conditions, and update your row when done.

---

# Generation 12 — exact intervention inventory + typed relevance across route surfaces (2026-07-18)

Planned at commit `ac940967` on the dirty
`codex/080-map-visual-redesign` worktree by an `improve` read-only audit. The
advisor preserved the in-flight Plan 080/081 and map changes, audited the
existing analytics/domain/pipeline and route UI seams in parallel, then
re-verified the load-bearing findings against source. Only `plans/**` changed.
The earlier branch-only Plan 090 and its typed Plan 082 amendment came from
commit `4cd54701` and are reconciled here rather than duplicated.

The central correction is that Tracker already has a broad
`route_treatment_summary`; the missing work is to make it exact, lossless,
strict, compact, and served. Today its reviewed-record adapter emits only the
first treatment, its summary merge can collapse distinct occurrences, and
its route matcher aliases exact services. The web then compensates with prose
substring matching and special handling for lane/ACE/TSP/SBS. Generation 12
repairs that seam while keeping five concepts separate: project, treatment
state, operational occurrence, descriptive observation, and causal study.

**Satisfied external prerequisite**: the Tracker half of MTA Wiki Plan 035 in
task `019f7640-fd5c-7be2-8a40-a7c264284c0f` landed through Tracker PRs #65 and
#66; `origin/main` contains merge commit `12acf278`. It owns manifest-v5 exact
route identity, official labels, and B44/B44+ separation. These plans consume
that merged contract and its green exact-identity fixtures; they do not
duplicate route naming or await another identity approval.

Numbering note: 089 remains claimed by the tracked
`plans/mockups/089-interventions-redesign/` design-review comp, which is not an
executable or approved full redesign plan. Plan 092 adds typed discovery and
cross-links within the current page; it does not silently approve D22-D27.
Plan 091 runs before the earlier-numbered Plan 090 because 090 was already
claimed on its branch.

## Execution order & status (gen 12)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 091 | Exact, lossless per-route intervention inventory from the existing materializer | P1 | L | exact-route PRs #65/#66 (DONE); 084, 088, 085, 086 | DONE |
| 090 | Typed intervention-relevance specs + ACE route observation bundles | P1 | L | 091; exact-route PRs #65/#66 (DONE); 084, 088, 085, 086 | TODO |
| 092 | Complete route intervention recognition + route History ↔ ledger links | P1 | L | 091; 080, 081, 085, 086 | TODO |
| 093 | Value-blind non-ACE relevance coverage + first bus-lane/busway specs | P2 | L | 091, 090, 092, 082 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 12)

- Full recommended spine:
  `exact-route (DONE) → 084 → 088 → 079 → 080 → 081 → 085 → 086 → 091 → 090 → 092 → 082 → 093`.
  Plan 087 may run after 086 but is not a blocker for this generation.
- The landed exact-route work and Plans 080/081/085/092/082 touch overlapping
  route contracts, `api-client.ts`, or route UI files. The exact-route merge is
  now the baseline; do not execute the remaining plans in parallel worktrees
  and try to merge by file. Finish/rebase in the recorded order and rerun drift
  checks.
- Plan 091 promotes the existing route-treatment materializer and exports one
  checked bundle per exact route. It reuses Plan 073's reviewed corpus and the
  existing cited route-evidence bundles; it does not create a second evidence
  database or duplicate full project/citation records.
- Plan 090 stays deliberately ACE-only and value-blind. It now consumes Plan
  091's canonical treatment/occurrence IDs and exact route identity. Plan 093,
  not an opportunistic edit to 090, owns non-ACE expansion.
- Plan 092 may technically run in parallel with 090 after 091, but sequential
  execution is recommended for a single clean contract review. It must finish
  before amended Plan 082 because both edit Overview, the route loader, and
  `api-client.ts`.
- Plan 082's original display-text marker admission is superseded. Its binding
  amendment consumes Plan 090 typed observations, resolves their IDs against
  the same-release Plan 091 inventory, and uses Plan 092's named presentation
  helper/annotation stem.
  The required future 082 comp approval remains its own visual gate; it is
  unrelated to the already-completed exact-route implementation task.
- Plan 093 separates a descriptive observation-anchor gate from the causal
  study gate and proves study outputs unchanged. Inventory display coverage
  may be broad while observation and study coverage remain narrower.
- Plan 075's UI code has landed, but activation/publication remains blocked by
  its recorded Plan 074/anchor gates. Nothing here treats it as active or
  promotes quarantined/unapproved candidate data.

## Verified audit evidence (gen 12)

- `packages/analytics/src/interventions/route-treatment-summary.ts:771-813`
  gathers primary/custom treatments and emits only `firstTreatment`.
  `:384-509` keys the derived summary by route/month/type/scope and keeps one
  status-ranked winner, so it cannot be the retained occurrence store.
- The same materializer's `canonicalRouteId` (`:369-381`) strips/adds `+` and
  collapses Q20/SIM variants. Current corpus and web joins also strip `-SBS`
  or `+`; the exact-route task owns the prerequisite correction.
- The checked 310-record corpus includes multi-treatment records; the global
  corpus is already served by completed Plan 073, so re-extraction is not the
  missing layer.
- `apps/web/src/studio/treatment-model.ts:124-215` infers most route
  treatments from concatenated prose. Overview and History call it, while
  cited structured treatments/projects render separately as generic text.
- `TreatmentBadgeStrip` shows three family slots and an inert `+N`; Overview's
  cap is also title-only. History can already render an unbounded inventory.
- Route History downloads the entire citywide corpus and filters client-side;
  `/interventions` has only local status/borough state, chooses one treatment
  per corpus row, and links records to default route Overview.
- Plan 090's branch correctly makes relevance pre-value and Plan 082 typed,
  but v1 supports only `automated_bus_lane_enforcement`. That boundary is
  intentional; Plan 093 adds explicit non-ACE specs rather than a generic
  route-speed fallback.

## Findings considered and rejected (gen 12 — do not re-audit)

- **Duplicate exact-route/name plan** — rejected. The landed MTA Wiki Plan 035
  work owns exact route identity and official labels; downstream plans consume
  its tests.
- **Another intervention database or page** — rejected. Reuse the existing
  materializer, reviewed corpus, route-evidence bundles, generic R2 artifact
  serving, route History, and `/interventions`.
- **Use source prose/claims to infer treatments, relevant metrics, or chart
  markers** — rejected. Typed source relationships establish what/when/where;
  reviewed relevance specs select Tracker data before values are inspected.
- **One generic speed/ridership profile for every intervention** — rejected as
  semantically weak and cherry-picking-prone. Unsupported kinds remain
  explicit with an unlock requirement.
- **Treat rc23 candidates or `awaiting_approval` study rows as public facts
  because they are structured** — rejected. Candidate review is not
  publication, and the exact-route defect quarantines the old identity
  projection. A fresh manifest-v5 producer-approved operational occurrence
  may enter Plan 091's display inventory without a Tracker study receipt, but
  the candidate-set artifact itself is never a serving input.
- **Fan route-level treatments onto segment rows** — rejected. Plan 081
  measured no within-route ACE/TSP variation; only independently evidenced
  segment scope may render there.
- **A bespoke badge on every `/interventions` row** — rejected. Typed family
  filters/search make all kinds discoverable; the ledger stays text-led and
  the full route inventory lives in History.
- **Silently execute the full 089 comp** — rejected. Its design decisions are
  unresolved; Plan 092 preserves the current visual surface while adding
  typed data, URL state, accessibility, and cross-links.

---

# Generation 11 — de-month the product: coverage windows + freshness ledger (2026-07-12)

Planned at commit `27755f4` (tree moved to `99fa763` mid-session — study-anchor
data only) by a read-only advisor session: five parallel scoped audits
(serving contract, pipeline release identity, web app, domain/analytics
schemas, docs/wiki doctrine), every table finding re-verified against source
by the lead session. Operator direction (2026-07-12, binding): the concept of
"monthly baselines" and month-keyed releases is removed from existence — data
is multi-year wherever sources allow, the only month-shaped obligation is
staying updated and seeing how far behind upstream we are, and reintroducing
month-targeting must be machine-impossible, not merely discouraged. This goes
beyond ADR-0017, which retired the "monthly release" slogan but deliberately
KEPT "baseline month" as a first-class anchor; plan 084 writes the
superseding ADR-0022, and plan 088 enforces it in the harness.

Numbering note: a concurrent same-day session claimed 082/083 for generation
10, so this generation is 084-088 and plan 088 (the gate) runs SECOND despite
its number.

## Execution order & status (gen 11)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 084 | Retire the monthly-baseline doctrine: ADR-0022 + steering-doc truth sweep | P1 | S-M | — (run first) | DONE |
| 088 | Month-doctrine harness gate (ratchet allowlist; runs SECOND) | P1 | S-M | 084 | DONE |
| 085 | De-month the public serving contract (releaseId + publishedAt + coverage) | P1 | L | 084, 088; 079 as amended, 080, 081 (all hard) | DONE |
| 086 | De-month pipeline release identity + publish gates; empty the ratchet | P1 | M-L | 084, 088; 079 as amended + 085 (hard) | DONE |
| 087 | Freshness ledger: `audit freshness` per-source lag report | P2 | M | 084, 088; 086 (hard) | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 11)

- 084 first and immediately — it writes ADR-0022 (the vocabulary table every
  other plan implements) and is docs-only, safe on the dirty tree. 088 next:
  it freezes every current month-identity violation in a shrink-only
  allowlist wired into `check:architecture`, so from that point
  month-targeting cannot be reintroduced and every later plan is FORCED (by
  the stale-entry guard) to delete its own entries as it lands.
- The advisor session applied binding **de-month amendment blocks inside
  plans 079, 080, and 081** (2026-07-12): 079's map contracts carry
  `publishedAt` + `coverage {start, end}` instead of month identity, its
  client mismatch state is `coverage_mismatch`, `--month` flags stay as
  window selectors, month-keyed artifact roots stay as partitions; 080/081
  inherit the vocabulary and add no new `baseline*` names. Gen-9 executors
  must honor those blocks; plans 085/086 grep-gate on the amended field
  names.
- Combined order: `084 → 088 → 079 → 080 → 081 → 085 → 086 → 087`.
- Gen-10 coordination: gen-10's 082 (chart markers + a REAL MONTH AXIS on the
  Overview trend) is grain, fully compatible with ADR-0022 — a month as a
  chart coordinate is exactly what survives. Serialize gen-10 082 with
  gen-11 085 (both touch Overview trend surfaces/tests); gen-10 083 (spine
  spike) has no file overlap with this generation. Gen-8's 074/075/076 are
  unaffected (verified: their month usage is grain — monthly series and
  event windows — not baseline identity).
- 085 and amended 079 both edit `public-api.ts` / `api-client.ts` — hard
  sequencing, never parallel worktrees. 086 edits `export/d1.ts` after 085
  touched its builder-call lines — drift checks compare excerpts.
- Production note: wrangler pins `BASELINE_MONTH=2026-03` (~4 months old at
  planning time). The pins die in 085; 087 is what makes such lag visible
  from then on.

## Verified audit evidence (gen 11)

- `apps/web/wrangler.jsonc:35-36` pins `BASELINE_MONTH` and
  `LAST_BUILT_SPEED_MONTH` to `"2026-03"`. `public-api.ts:80-88` resolves
  five v1 endpoints' product month from `?month= ?? env.BASELINE_MONTH`; the
  status response serves a field literally named `canonicalMonthlyRelease`
  (`public-api.ts:274`) plus `releaseLayer: "baseline_release"` and
  `completenessStatus: "partial_public_monthly_only"`.
- The studio path already floats on D1-latest (`resolveServingMonths`,
  `read-handlers.ts:345-362`) and already serves a `releaseId` — the
  replacement identity hook exists; only the contract vocabulary pins months
  (`baselineMonth` at `read-handlers.ts:390,404,902,1015` and across
  `packages/domain` response schemas).
- The capability manifest defines freshness RELATIVE TO THE RELEASE MONTH
  (`route-capability.ts:40,57-71`, `releaseMonth` at `:110`) — served data
  can never look staler than the release it shipped with. Plan 085 recomputes
  freshness against now at read time.
- Pipeline release identity is a month end-to-end: `studio release` defaults
  to `"2026-03"` (`release.ts:88-91`), D1 exports live under
  `data/exports/d1/<month>/` with `analysisPeriod: month`
  (`export/d1.ts:241,285-286`), the R2 publish gate requires
  `analysisPeriod === --month` (`r2-artifacts.ts:164-165`), the
  detector-readiness import throws on month inequality
  (`route-capability-manifest.ts:72-76`), and the data-product registry
  classifies by a `"release_month"` literal (`registry.ts:69,73-79`).
- Freshness machinery today is a single-source binary
  (`check route-speed-availability` → `shouldRebuild`, surfaced by
  `plan source-refresh`); nothing reports per-source
  upstream/ingested/published lag. That gap is plan 087.
- ~12 living docs teach the retired model as current practice (README:91
  "canonical monthly releases", runbook "promote a baseline month",
  endpoint-architecture `baselineMonth` contract and "Monthly baseline"
  cache row, operationalization status "baselineMonth=2026-03 … pass", the
  primer's DetectorRunId release-month glossary entry for the deleted
  detector program).

## Findings considered and rejected (gen 11 — do not re-audit)

- **D1/local tables keyed `(routeId, month)`** — GRAIN: time-series
  partitions, correct storage; no schema migration; only response metadata
  changes.
- **`lib/socrata-monthly-ingest.ts` name + monthly ingest cadence** — GRAIN:
  upstream publishes month-partitioned data; the name is accurate.
- **"Monthly ridership" chart title / "Monthly riders (K)" legend /
  "official monthly speed evidence" caveat / home + SEO "monthly speeds"
  copy** — rejected as findings: they name the source grain of
  monthly-grain datasets rendered over multi-year windows, not a baseline
  anchor. (Two subagent reports flagged them; the lead overrode — the
  hard-cutover doc's "do not over-rotate" boundary stands.)
- **RouteDetailHeader month label under the speed metric** — GRAIN (a
  dataAsOf label on a data point); survived the gen-6 design review; keep.
- **Study engine (074) / studies surface (075) month usage** — verified
  grain (event-anchored multi-year windows, monthly series); no amendment.
- **Month-partitioned artifact/export directory layouts** — kept as
  partitions; identity moves into manifest fields (`publishedAt`,
  `coverage`). A releaseId-keyed layout migration was rejected as churn
  without state-space change.
- **`cloudflare-costs.ts` "monthly" mentions** — billing-cycle arithmetic,
  unrelated.
- **Renaming `source-refresh` job ids** (`route_speed_monthly_watcher`) —
  artifact contract; 087 de-months its strings, ids stay.
- **Banning the word "month" outright in the 088 gate** — rejected: the gate
  bans IDENTITY tokens and pinned literals; month-grain vocabulary
  (`dataAsOf`, `startMonth`/`endMonth`, series coordinates, `--month` window
  selectors) is legitimate forever.
- **Docs-audit subagent misclassifications** — corrected by the lead: plans
  079-081 are TODO (not "completed; archive"), and `data/artifacts/**` docs
  are operator-owned point-in-time records, out of every plan's scope.

---

# Generation 10 — route-detail annotation layer + study-coverage spike (2026-07-12)

Planned at commit `99fa763` on a dirty tree (plan 074/079 execution in
flight) by a read-only advisor session, answering the operator's direction
question against the then-current receipt: with only 5 of 403 study
candidates approved (all ACE onsets; 3 gated estimates, 2 descriptive, 4 of
5 `no_detectable_change`), is the gated study engine the right investment
versus naive intervention-date before/after highlighting on route detail?
Two fan-out audits (route-detail page anatomy; corpus/candidate/spine coverage
math) with every load-bearing number re-verified by the lead session. The
2026-07-14 rc19 amendment below preserves that as history and replaces it as
the current coverage premise.

**Direction verdict (recorded so it is not re-litigated):** the engine's
rigor is not the overcomplication — its gates caught real confounds on the
exact routes where naive before/after would have shipped a confident wrong
number (M79+ +0.36 mph raw with congestion-pricing overlap; B82+ descriptive
worsening with failed pre-trend). What is missing is the cheap broad layer:
dated intervention MARKERS on the route chart (annotation, never computed
deltas). The historical raw-event audit found 201 of 323 candidate routes
with in-window implementation months, versus 5 routes with studies; that is
not typed publication coverage. Generation 12 first builds the exact
inventory and reviewed observation contracts. The spine remains a major
technical bottleneck: 267 of 385 routes are `needs_pattern_review`. The
historical 39-row ACE bucket was a primary rejection category, not proof of a
sole blocker; rc19 rebaselines it to 39 identities/37 routes (20 with no
additional phase/overlap defect named), 40 current calendar-eligible ACE
identities/38 routes failing the mechanical spine gate, and 75 new
spine-blocked identities/74 routes. Plan 083 measured advancement without
weakening any standard and closed as a negative spike: an unresolved artifact
residual, conservatively treated as class D/true-gap for the STOP, dominated
the representative taxonomy, so no production grouping change was
commissioned.

## Execution order & status (gen 10)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 082 | Dated intervention markers + real month axis on the Overview speed trend | P1 | M | 090, 092; operator comp approval (hard gate in-plan) | TODO (2026-07-18 typed amendment: no History/text-derived marker admission) |
| 083 | Spine pattern-grouping spike: measure honest candidate-coverage gains | P2 | M | 078 (DONE) | DONE (negative spike result; no implementation commissioned) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 10)

- **Two operator items precede execution**: (1) the plan 074 anchor review
  (`data/artifacts/studio/v2/studies/anchors-report.md`, fill
  `published_claim`) gates plan 075; (2) 074's original "≥10 studies" done
  criterion needs explicit resolution — recommended resolution, recorded
  2026-07-12: amend to "every approved event-route pair studied" (satisfied
  at 5/5); rejected candidates are never silently readmitted, and the path
  to more studies now requires a new data-completeness proposal; plan 083
  found no production-safe grouping unlock and commissioned no batch-2
  candidate rebuild or review.
- Plan 075's UI integration has landed but remains inactive behind its
  recorded study gates. Plan 082 does not depend on activation. Its original
  `mergedTreatmentTimelineRows`/History-text admission is superseded by the
  Generation 12 amendment: execute 091 → 090 → 092 before 082, then consume
  the typed observation bundle, resolve its IDs against the same-release
  inventory, and use the named treatment presentation helper.
- 082 carries the standing comp gate: no app code until an operator-approved
  comp exists at `plans/mockups/082-overview-trend-markers/comp.html`.
- 083 is a completed negative spike. Its decision doc rejects productionizing
  either prototype: exact aliases help a bounded minority, while recurring
  profiles lack documentation that distinguishes service patterns from
  repeated missingness or data loss. Nothing in 083 changes production
  artifacts, thresholds, candidate sets, receipts, studies, or publication.
- 076 (opportunity layer) stays deferred beyond its current gating: its
  effect-transfer input today is 3 gated estimates, all
  `no_detectable_change`, in a single treatment family — transferring null
  effects ranks nothing. Revisit only after batch-2 studies produce
  directional gated estimates.

## Findings considered and rejected (gen 10 — do not re-audit)

- **Computed before/after deltas, percentages, or verdict shading derived
  from a marker date on route charts** — rejected as a product surface: the
  repo's own studies prove raw deltas mislead (M79+/B82+ above). Markers
  carry dates and plain-language labels, never numbers; numbers come only
  from plan 074/075 study artifacts.
- **Readmitting rejected candidates or softening gates/spine thresholds to
  reach the original "≥10 studies" floor** — rejected; re-anchor the
  criterion instead (operator confirmation pending on 074's row).
- **A standalone /studies page or new tab** — already rejected by the
  binding 2026-07-09 operator direction; 075 integrates into existing
  surfaces.
- **Markers for year-only or undated events on a month-axis chart** —
  rejected: a year cannot be honestly placed at a month position; those
  events stay timeline-only.
- **Corpus records as chart markers in v1** — rejected for now: all 310
  served corpus records are pre-window (0 `evaluableInWindow`), so nothing
  would render; revisit only if a future corpus release carries in-window
  months.
- **Fixing the SpeedTrend index axis as its own plan** — folded into 082:
  the month axis is a prerequisite of marker placement, and a separate plan
  would double-touch the same chart file.

---

# Generation 9 — truthful interactive maps (2026-07-09)

Planned at commit `cd878f7` on a working tree already dirty in `plans/` only
(branch `codex/gen6-ui-overhaul`) by a read-only advisor session. Three
parallel audits covered product/user questions, runtime/accessibility, and
data/serving contracts; the lead session independently reproduced every
accepted finding against source and checked the shipped 2026-03/2026-05
artifacts. The operator explicitly selected the whole set by asking for a plan
to overhaul all current map visualizations, make them meaningfully interactive,
and start from what product users need to see.

The governing user questions are:

- **Rider or advocate**: Find my route. Where and when is it slow? Is that a
  one-off or persistent, and what can I share with others?
- **Planner or evidence author**: Which routes/segments show the most
  route-slice passenger-delay exposure? Where do source-backed treatments
  overlap—or fail to overlap—the problem?
- **Journalist or policy staff**: What period and route universe am I seeing?
  Can I reproduce the view, inspect exact values, and cite sources/caveats?
- **Every user**: What is missing, stale, proxy-level, or under review? A map
  must make uncertainty visible instead of filling it with a plausible color.

## Execution order & status (gen 9)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 077 | Restore validated MapLibre rendering and clean failure recovery | P0 | M | 068; coordinate with 072 | DONE |
| 078 | Canonical map/detail/history segment identity and readiness | P0 | L | 068, 077; before 074 | DONE |
| 079 | Truthful network-map data, layer readiness, freshness, and budgets | P1 | L | 062, 068, 078, 084, 088 | DONE (including the binding ADR-0022 v2 release-identity/catalog cutover) |
| 080 | Accessible, searchable, shareable network decision explorer | P1 | L | 077, 079 | DONE (implementation `926ce17c`; strict shareable state, exact served-borough and route-segment evidence, O(1) map focus, Data Notes, responsive Sheet, and browser gate complete) |
| 081 | Linked route-segment evidence explorer with exact overlays | P1 | L | 077-080 | DONE (implementation through `aee2b3df`; strict shareable segment/direction/period state, exact verified map/fact/lane artifacts, one stable-spine history model, coordinated MapLibre/list/readout interaction, honest fallbacks, and browser gate complete) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

Plan 077 browser gate: Chrome for Testing 149.0.7827.55; `/map`, B48, and
M15-SBS passed at desktop and 390px, including reduced motion and forced
vendor-failure retry.

Plan 080 browser gate: Chrome for Testing 149.0.7827.55; an isolated fixture
using the production MapLibre runtime passed at 1440x900, 1024x768, and
390x844. The matrix covered keyboard, mouse, touch-event hit paths,
Back/reload-safe URL state, exact M15+ segment evidence, the forced-unavailable
B1 path, responsive Sheet transfer, accessibility-tree roles, bus lanes, and
reduced motion.

Plan 081 browser gate: Chrome for Testing 149.0.7827.55; an isolated fixture
using the production MapLibre runtime passed at 1440x900, 1024x768, and
390x844. B41 covered exact north/south selection, stable-spine history,
Back/Forward, reload, gaps, and neutral no-data; M15 SBS covered exact source
identity and lazy DOT lanes; BX15 covered pattern-review history; B42 forced
the shareable no-geometry path. The matrix also passed keyboard, mouse,
trusted touch, cooperative page scroll, reduced motion, 200% zoom, and the
WebGL-disabled SVG fallback.

## Dependency notes (gen 9)

- **Run 068 first**, then 077 → 078 → 079. The map UI plans are not safe to
  execute first: current MapLibre styles fail official validation, and the
  route map can attach a metric/history row to the wrong geometry.
- 077 and gen-8 plan 072 both may touch `bun.lock`; sequence or reconcile the
  narrow dependency changes rather than overwriting either lockfile result.
- 078 must land before gen-8 plan 074. The study engine needs the same stable
  geographic spine; do not let two plans invent incompatible identifiers.
  Plan 073 may proceed independently after 068, but 074 then depends on both
  073 and 078 in the combined roadmap.
- 079 also requires 062's deletion of the retired pipeline-v1 finalizer/check;
  it adds a focused `map release` builder and must not resurrect that legacy
  QA doctrine. It consumes 078's exact/stable identities and establishes the manifest,
  missingness, freshness, caching, and payload-budget contract used by both
  UIs. Do not let 080/081 create private copies of that contract.
- Run 080 before 081. Plan 081 upgrades 080's pinned-route drill and explicit
  `Open route` CTA, in addition to overlapping shared map style/runtime and
  `api-client.ts`; it cannot complete independently from the 079 baseline.
- 075 may later add a reviewed intervention to a map only when its served event
  has audited source geometry, grain, precision, and date. Plan 081 removes the
  current inferred ACE/TSP points regardless of 075's timing.
- 076 remains an operator-gated design spike. No opportunity/composite lens
  enters `/map` or route detail through this generation.

Recommended combined order:

```text
068 ─→ 077 ─→ 078 ─┐
062 ───────────────┴─→ 079 ─→ 080 ─→ 081
068 ─→ 072  (serialize its bun.lock work with 077)
068 ─→ 073 ─────────┐
          078 ──────┴─→ 074 ─→ 075 ─→ 076
```

## Verified audit evidence (gen 9)

- Both MapLibre base styles and lens colors currently emit `oklch(...)`.
  MapLibre's installed style validator reports `color expected` for those
  values, and both wrappers currently turn any runtime error into the static
  fallback. Plan 077 makes style validation a test and fixes lifecycle,
  bounds, cooperative gestures, and reduced motion.
- The same segment has three incompatible identifiers across map, Studio
  detail, and speed history. The route map then falls back to direction/index
  association. For the B41 artifact, direct map-to-detail matches are 0/16;
  only 5/7 southbound positions happen to agree, and the last two are reversed.
  Plan 078 creates one exact source key, one ambiguity-rejecting crosswalk, and
  one durable geographic spine.
- The network artifact's `laneCoverage` divides matched lane feature count
  by route-segment count rather than measuring route-shape overlap. In the
  checked 2026-03 artifact, 273 of 346 routes report exactly 100%. Rider counts
  also use a fixed 30-day divisor while the canonical Studio route uses actual
  month days. Plan 079 removes duplicated/private facts and joins geometry to
  canonical route metrics.
- Missing route-hour observations are currently filled with all-day speed,
  turning “not observed” into a complete-looking 24-hour profile. Plans 079
  and 081 keep absence null and gate time controls by evidence readiness.
- `/map` implicitly selects the top-ranked route and dims every other route to
  20% on first paint. It has no route search or shareable state; its top-ten
  inspector is hidden below `md`, and map tap navigates immediately. Plan 080
  separates hover, focus, pin, and navigation and provides a complete
  structured mobile/keyboard alternative.
- Network hover deep-copies a 4.61MB GeoJSON collection (52,907 coordinates)
  and calls `setData`; the MapLibre vendor chunk is about 1.06MB raw/~276KB
  gzip and omitted from current budgets. Plans 079/080 add visible budgets and
  feature-state interaction.
- Route maps are mousemove-only. They synthesize ACE/TSP midpoint markers and
  route-offset lane lines from route/segment proxy flags, despite provenance
  saying those fields are not exact geography. Plan 081 links map + segment
  table + history by stable spine, adds click/touch/keyboard pinning, and maps
  only verified published source geometry.
- The shipped release already contains useful first-party context: borough
  shoreline/name data, 3,048 NYC DOT bus-lane features, and 4,877 timepoint
  stops. Plans 079-081 use those before proposing an external hosted basemap.
- The checked local Studio route artifact is a 12-route partial fixture while
  the network artifact contains 346 routes. Plan 079 requires an explicit
  production route-universe/coverage gate; unmatched routes render as neutral
  no-data, never as invented zeroes.
- A 2026-05 manifest can say `pass` while publishing zero route-segment
  artifacts and only four base artifacts; the public API currently upgrades
  base-only output to complete/high. Plan 079 makes per-layer verification the
  served truth and fixes one-year immutable caching on mutable keys.

## Operator direction (binding on gen 9)

- Keep MapLibre, the offline Bun pipeline, D1 indexes, and R2/static artifacts.
  A renderer or platform migration requires measured need and a new ADR.
- Upgrade `/map`, the existing route Segments tab, and the Overview locator in
  place. No new top-level page, route-detail tab, or nav item.
- Durable state belongs in validated query parameters. Hover/focus is
  transient; click/tap pins before navigation.
- A complete keyboard-operable structured list/readout is part of every map,
  not a hidden fallback. Mobile must retain selection and evidence controls.
- Use first-party borough, stop, route, and NYC DOT lane artifacts before any
  hosted basemap. Do not expand CSP, licensing, or attribution scope here.
- Show source, period, unit, grain, coverage, freshness, and no-data states.
  Proxy route/corridor facts stay textual until exact audited geography exists.
- Geographic borough filters use offline verified served-borough membership,
  not the route-ID-derived primary borough label.
- Shared URLs reproduce UI state; until content-addressed navigation exists,
  copied citations also include artifact key/hash and disclose mutable aliases.
- No autoplay, realtime vehicles, trip planning, fabricated demo values,
  browser/Worker spatial analysis, or opaque opportunity score.
- Chart/metric rules from the approved 075 comp (2026-07-10) bind any chart
  or numeric readout 080/081 add: shadcn chart-card anatomy in app tokens,
  one consolidated metric per chart card, method internals behind a "Method &
  provenance" SourceNote (never on the face), terse labels, "No clear change"
  for null states. 080 and 081 each get an operator-approved comp round
  (`plans/mockups/`) before implementation — see the gen-8 design-gate note.
- **De-month amendment (2026-07-12)**: binding amendment blocks were added
  inside 079/080/081 — month-keyed release identity is retired (ADR-0022,
  gen-11). Map contracts carry `publishedAt` + `coverage {start, end}`; the
  client mismatch state is `coverage_mismatch`; no new `baseline*` names
  anywhere; the plan-088 harness gate bans the retired tokens. Full mapping
  in 079's amendment block and the gen-11 section.

## Findings considered and rejected (gen 9 — do not re-audit)

- **Replace MapLibre with Leaflet, deck.gl, or another renderer** — rejected.
  ADR-0003 already settles MapLibre and the observed defects are invalid style
  values, lifecycle, interaction, and contracts—not a proven renderer limit.
- **Restore the hour scrubber/autoplay/carpet animation** — rejected. It was
  deliberately removed for a calmer evidence UI, and missing hours are not fit
  for an apparently continuous movie.
- **Add dedicated map/treatment/opportunity pages or tabs** — rejected by the
  binding no-new-navigation direction. Improve the existing surfaces.
- **Use a hosted street basemap immediately** — deferred. CSP, terms,
  attribution, network reliability, and privacy require a separate decision;
  the release already has useful first-party geographic context.
- **Migrate all map artifacts to PMTiles now** — deferred. The checked network
  artifact is ~396KB gzip; add budgets and measure interaction/device cost
  before changing delivery architecture.
- **Ship an opportunity lens now** — rejected for this generation. Plan 076 is
  an operator-gated spike, and no approved transparent score exists yet.
- **Perform route/lane or historical joins in the browser/Worker** — rejected.
  Heavy geospatial work remains in the Bun pipeline; public clients consume
  precomputed, verified joins.
- **Treat ACE/TSP midpoints or an offset route line as “close enough”** —
  rejected. A precise-looking false point/line is worse than an explicit
  route-level badge and source-gap state.
- **Defensively render malformed own-pipeline coordinate arrays** — rejected
  again. Validate owned artifacts at build/release boundaries; do not clutter
  request/render code for impossible published shapes.

---

# Generation 8 — audit fix-pack + the business-problem arc (2026-07-09)

Planned at commit `cd878f7` on a clean tree (branch `codex/gen6-ui-overhaul`)
by a read-only advisor session: four parallel category audits (correctness,
security+deps, perf+debt, tests/DX/docs) with every table finding re-verified
against source by the lead session, plus a direction review grounded in
`docs/research/master-plan-product-questions.md` (Tracks C/D/G). The operator
selected two sets: the hygiene fix-pack (068-072) and the business-problem
arc (073-076) — turning the intervention corpus + segment-speed data into
served, gated, uncertainty-honest treatment studies and a prototyped
decision layer.

## Execution order & status (gen 8)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 068 | Verification baseline: fix check:types OOM, prove pre-push gate, align docs | P1 | S-M | — (run first) | DONE (repo-wide typecheck and full pre-push gate pass; pre-existing web fixture blockers repaired with operator authorization) |
| 069 | Fix tautological route-universe check in observed reliability | P1 | S | 068 | REJECTED (premise false: the call site already skips any canonicalized ID outside `routeUniverse`, so the required pre-fix behavioral test passes) |
| 070 | Browser-hardening headers on Worker responses (CSP on HTML) | P2 | S-M | 068 | DONE |
| 071 | Steering-doc truth sweep (README schema claim, /methods SEO, master-plan status) | P2 | S-M | 068 (rec.) | DONE (Effect Schema README claim, retired `/methods` SEO removal, master-plan status block, and knowledge log verified) |
| 072 | Dependency hygiene: bun update within semver + audit residue log | P3 | S | 068 | DONE (audit reduced 15→13; all residual advisories documented; full tests/build and `/` + `/map` smoke pass) |
| 073 | Serve the reviewed intervention corpus + reconciliation report | P1 | M-L | 068 | DONE (310 valid; 29 study-date-ready; 11 exact matches; no study-ready corpus-only candidates) |
| 074 | Segment-grain study engine v1 (matched-control DiD, CIs, gates) | P1 | L | 073 + 078 + exact-route task before any future run | IN PROGRESS (historical five-study output is immutable; rc23 is route-identity-quarantined; require a fresh manifest-v5 release/candidate set/receipt plus control-contamination and bounded-scope repairs) |
| 075 | Integrate studies into the route History tab + /interventions (no new page) | P2 | M | 074 + operator anchor review; 073; exact-route task before activation | IN PROGRESS (UI integration landed in PR #59, but remains inactive; rc23 cannot activate it, and fresh exact-route study/publication gates remain open) |
| 076 | Opportunity layer design spike (rank next-treatment candidates) | P3 | M | 074 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 8)

- 068 first, always: it makes `check:types` and the pre-push gate actually
  runnable; every other plan uses them as verification gates.
- 069-072 are independent of each other and parallel-safe (isolated worktrees).
- The business arc is ordered 073 + gen-9 identity plan 078 → 074 → 075 → 076,
  with two human gates baked in: 074 STOPs after writing its anchors report
  (operator sanity-checks effects against published numbers before anything ships), and
  074's trusted-registry plus manifest-pinned Wiki candidate set enters studies only
  through a candidate-set-bound operator approval. Plan 073's corpus remains
  documentation/source-coverage input and never supplies causal onset dates.
- Operator direction (2026-07-09, binding on 075/076 and any successor): NO
  new top-level pages, tabs, or nav items. Studies integrate into the route
  History tab (upgraded comparison cards) and /interventions (real numbers on
  evaluated rows); deep-links use `?tab=history&study=<eventKey>` search
  params, never new routes. New data lands in a tab only if it looks good
  visually and makes sense for that tab — prefer upgrading existing elements
  in place over adding sections.
- Design gate (2026-07-10): the operator approved the 075 study-card comp
  (`plans/mockups/075-history-tab/study-cards-comp.html`, three review
  rounds, decisions D1–D17 resolved); plan 075 now carries the approved card
  anatomy as its binding acceptance target. The same
  comp-before-implementation gate applies to the remaining UI plans: 080/081
  get a full comp round (IA variants) before implementation, 076's decision
  memo includes a comp, 077/079 get a before/after screenshot review. The
  durable rules extracted from the review live in
  `knowledge/wiki/engineering/studio_design_pass_status.md`.
- Gen-7 coordination: 073/075 deliberately serve through the existing public
  artifact endpoint and do NOT touch `read-handlers.ts` (063 owns it). New
  domain schemas (073/074) are written in the current `schema-compat` dialect
  to match siblings; gen-7 066/067 migrates them with everything else. If 066
  lands first, write them native instead.
- 070's CSP `connect-src` must be revisited if 075 fetches from any new origin.

## Findings considered and rejected (2026-07-09 audit — do not re-audit)

- **Repo-root `.env` with live keys** — untracked, zero git history, covered
  by `.gitignore`; standard local-dev convention, not a finding.
- **Artifact-key path traversal via repeated URL-encoding** — misread of
  `isValidArtifactKey` (`public-api.ts:108-140`): non-stabilizing keys return
  `false`, dot components are rejected at every decode pass, and R2 keys have
  no traversal semantics; the bucket is the intended-public serving bucket.
- **Magic-link auth endpoints unthrottled** — the endpoints do not exist; the
  auditor projected ADR-0008's design into code.
- **"113 CLI commands have zero fixture tests"** — false; 60 fixture-backed
  command tests exist under `tools/pipeline-v2/test/commands/`.
- **Route-detail loader lacks 404 handling** — false; both fetches use
  `loadNullableStudioJson` (404 → null).
- **Segments-tab fetch waterfall / per-tab code-splitting / eager map GeoJSON
  / keystroke filtering on /routes** — the lazy-artifact split is a documented
  in-code decision (`$routeId.tsx:29`), the entry budget is green (~115/145KB),
  and the rest is micro-optimization on a 380-row list. Not worth doing.
- **Effect 4 beta pin, drizzle-kit RC, TS caret width** — decided toolchain
  posture (ADR-0019/0020, dev-only tools); revisit at Effect 4 stable, not
  before.
- **Unbounded `object.json()` on R2 artifacts** — artifacts are self-published
  in the same trust domain; defending against them contradicts the CLAUDE.md
  no-impossible-scenario rule.
- **`weightedAverage` NaN hardening + `quantile` negative-index guard**
  (route-grain evaluation lib) — inputs are internally controlled; folded as
  assertions into plan 074's new engine instead of patching the old path.
- **Coordinate `[1]` access in `RouteMapLibre.map.tsx:245`** — own-pipeline
  GeoJSON positions are always 2-element; impossible-input defense.
- **Analytics test-ratio (28.4K src / 7K test LOC)** — most of the untested
  mass is the dead subgraph plan 061 deletes.
- **Pre-063 characterization tests for read-handlers** (real, MED confidence)
  — offered to the operator 2026-07-09 and not selected; recorded here so 063's
  executor knows the degrade behavior is pinned by roughly one regression test
  (`api-facade.test.ts`, poisoned model months) and should tread accordingly.
- **Release/export command boilerplate extraction** (~8-10 files sharing
  manifest/write/validate shape) — real but deferred: 066's schema sweep
  touches the same files; extract after, not before.

---

# Generation 7 — deterministic machine: delete the dead, decode once, finish Effect Schema (2026-07-06)

Planned at commit `4c1afe7` on a dirty tree (gen-6 execution in flight;
048-054 landed during planning) by a read-only advisor session (6
parallel package surveys + direct verification of every load-bearing
claim) on the operator's direction: reduce LOC and complexity by making
the codebase more Effect-idiomatic — eliminate local defenses, broad
fallbacks, weak invariants, duplicated workflows, and machinery that
compensates for unclear design; prefer making invalid states
unrepresentable.

Verified headline facts the plans are built on:

- **The gen-5 zod eviction removed the dependency, not the dialect.**
  `packages/domain/src/schema-compat.ts` (663 LOC) is a hand-rolled zod
  emulator over Effect Schema with 43 importers and real semantic
  hazards: brands collapse to one runtime identity (`"DomainBrand"`),
  `safeParse` flattens every issue to a path-less message (live bite:
  `mta-wiki-canonical.ts:183` and `intervention-records.ts:1698-1703`
  render every validation error as `<root>`), `discriminatedUnion`
  ignores its discriminator, and object strictness lives in WeakMaps that
  silently revert across `.extend()`. ADR-0020 already calls it
  "migration scaffolding" — plans 065-067 finish the migration leaf-first
  and delete it.
- **~13.1K LOC of packages/analytics is dead**: `findings/` (8,531),
  `registry/` (1,623), most of `calibration/` (~2,400), `detectors/`
  (237), `corpus/` (260), `lattice-deduction.ts` (111) have zero
  pipeline/serving reachability; route-page insights serve from a static
  Phase-B readiness artifact whose builder was already deleted with
  Tier 2. Operator authorized deletion 2026-07-06 (plan 061).
- **The retired pipeline-v1 monthly-QA doctrine still ships**: `audit
  pipeline-v1` (886) + `check pipeline-v1` (1,351) + `pipeline finalize`
  (311, exists only to chain the QA gate) have zero invocation surfaces.
  Operator authorized deletion 2026-07-06 (plan 062).
- **The serving read path defends per-request against its own types**:
  `read-handlers.ts` (2,966 LOC post-052) safeParses its own composed
  snapshot on every request and re-parses a v1-only variant on failure;
  projection loads are all-or-nothing while v2/evidence degrade
  (asymmetric); `summary ?? readiness ?? 0` repeats at 15+ sites;
  dispatch restates paths `contracts/registry.ts` already declares
  (plan 063 — plain TS, the plan-026 no-Effect-in-Worker block stands).
- **One ingest workflow exists 22 times**: every `run*Ingest` hand-builds
  manifest→fetch→normalize→snapshot→upsert→report; the correct
  abstraction already exists (`lib/socrata-monthly-ingest.ts`, one
  adopter). Plan 064 finishes the adoption; fixture tests are the parity
  proof.
- Expected net effect when all land: roughly **−19K src LOC and −5-7K
  test LOC** (061 ≈ −13.1K src, 062 ≈ −2.5K, 063 ≈ −0.9K, 064 ≈ −0.8K,
  065-067 ≈ −0.9K net incl. the shim), the last schema dialect gone, real
  brands/unions/error-paths, one declared degrade policy in serving, and
  a harness gate (`schema-compat` specifier) that makes the dialect
  unrepresentable — mirroring the existing zod gate.

## Execution order & status (gen 7)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 061 | Delete the dead detector/calibration subgraph in analytics | P1 | M | — | DONE |
| 062 | Delete the retired pipeline-v1 QA-gate commands + residue | P1 | S-M | — | DONE |
| 063 | Serving read path: decode once, compose totally, registry dispatch | P1 | L | — (052 interaction recorded in-plan) | DONE |
| 064 | One ingest workflow: extend the existing factory, collapse 22 copies | P1 | M-L | 062 rec.; before 066 | DONE |
| 065 | packages/sources on native Effect Schema (+ `@bp/domain/decode`) | P2 | M-L | — ; before 066/067 | DONE |
| 066 | Pipeline/analytics/studio-api native (CLI AST introspection port) | P1 | L | 061, 063, 064, 065 (hard) | DONE |
| 067 | Domain native: real brands/unions, DELETE schema-compat, close gate | P1 | L | 065, 066 (hard) | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 7)

- 061 and 062 are independent deletions and the best first executions
  (isolated worktrees, parallel-safe). Both shrink 066's migration
  surface.
- 063 before 066 (hard): both edit `read-handlers.ts`; 063 restructures,
  066 swaps its schema dialect.
- 064 before 066 (hard): after consolidation the descriptor sweep touches
  2 factories + bespoke files instead of 22 commands. 062 before 064
  (recommended): finalize's imports disappear first.
- 065 → 066 → 067 is the leaf-first shim eviction: shim-built schemas ARE
  Effect Schema instances, so native leaves can consume shim-built domain
  schemas during the transition; domain flips last and the shim is
  deleted with zero importers. 067 adds the module-specifier gate.
- **Gen-6 coordination**: 052 already deleted the methods DISPATCH
  endpoint; the snapshot still loads `methods.json`, so 063's degrade
  table keeps a methods row (details in 063's drift note). No other
  gen-6 overlap: gen-7 does not touch `apps/web/src`.
- The operator's standing gate applies: land the in-flight tree before
  executing any gen-7 plan; every plan's drift check compares excerpts,
  not SHAs.

## Findings considered and rejected (gen-7 audit — do not re-audit)

- **Migrate the 99 command descriptors to raw `effect/unstable/cli`
  `Command.make` per file** — rejected: plan 040 deliberately kept the
  thin `defineCommand` descriptor + glob discovery + completeness test;
  replacing it is churn with no state-space reduction. 066 migrates the
  descriptors' SCHEMA dialect only and ports the flag-reflection to a
  native AST walk.
- **Unify packages/db local/d1 row mappers** (`routeReadiness` vs
  `localRouteReadiness` duplication) — real but HIGH-risk L for ~200 LOC;
  the two schemas serve different databases with different casings.
  Not planned.
- **Consolidate/structuralize the 8 check scripts** — 5 are legitimately
  runtime scanners (perf/SEO/smoke/provider/publish-completeness); the 3
  file-inventory ones are ~175 LOC total. Marginal; root scripts pin the
  paths (gen-5 rejection stands).
- **Delete `schema-routes.ts`/OpenAPI serving** (no product consumer) —
  kept: 47+291 LOC, it is portfolio-visible API surface, and after 067 it
  costs one native `toJsonSchemaDocument` call.
- **`.passthrough()`→strict on RAW upstream row schemas** — deliberate
  tolerance of Socrata column additions; only NORMALIZED outputs tighten
  (rule recorded in plan 065 and the ADR-0020 addendum).
- **Borough-heuristic semantic fix, web-vitals lazy-install,
  feature-contract memoization, `dev/`/`fixtures/` bundle exclusion** —
  cosmetic or unproven cost (bundle claim unverified against
  tree-shaking; entry has real headroom). Not planned.
- **Typed-error (`Schema.TaggedErrorClass`) sweep of the 32 non-Effect
  pipeline commands** — deferred per ADR-0019's own "as commands are
  touched" rule; 064/066 touch the highest-traffic ones naturally.
  Blanket migration is churn without a failing behavior.
- **`loadStudioProjection`'s `Response | T` union → tagged result** —
  real weak invariant, deliberately deferred: pervasive mechanical sweep
  best done in one dedicated PR after 063/066 settle the file (named in
  063's maintenance notes).
- **Deleting `domain/findings` wholesale after 061** — WRONG: analytics
  `core/{detector,evidence,coverage}.ts` and `features/route-month.ts`
  are live importers. 067 Step 3 deletes only zero-importer exports.
- **"dev/fixtures ship in the prod bundle" (subagent claim)** — recorded
  as UNVERIFIED, not a finding: no route imports them; Vite tree-shakes
  route-reachable graphs. Re-check only if the bundle budget ever trips.
- **`route-equity-contexts.ts` unchecked `rows[0]` + enum cast** —
  REAL (verified); folded into plan 063 Step 1 rather than planned
  separately.
- **Unmanaged `Effect.runPromise` in `effect/concurrency.ts`** — REAL;
  folded into plan 064 Step 4.

## Shared constraints (generation 7)

- **No Effect runtime in the Worker or browser.** Plan 026's measured
  block stands; 063 is plain TypeScript; "Effect-idiomatic" there means
  parse-don't-validate, total composition, one envelope. `rg 'from
  "effect' apps/web/src` must stay empty through 067 (type-only domain
  imports are fine).
- **Effect v4 beta APIs**: trust the installed `effect@4.0.0-beta.92` —
  vendored source at `.repos/effect`, guides at
  `/home/cjpher/.codex/skills/effect-ts/`. The shim
  (`schema-compat.ts`) is the Rosetta stone for dialect→native mappings
  until 067 deletes it.
- Root `bun run check:types` OOMs — always per-package
  `bun --filter <pkg> typecheck`.
- `data/` is operator-owned: no executor ever deletes or rewrites
  anything under `data/` (readiness artifacts become the frozen record of
  the deleted detector program).
- Verification default per plan, then the pre-merge gate: per-package
  typechecks, `test:unit`, `test:web` + `test:worker` where studio-api or
  domain is touched, `check:web-architecture`, `check:style`; worker
  wall-time regressions >1.5× baseline are STOP conditions (plan-026
  precedent).

---

# Generation 6 — MTA visual language + page overhaul (2026-07-06)

Planned at commit `ce3baca` on a DIRTY tree (the uncommitted gen-4/5
execution, 374 files) by a read-only advisor session (4 parallel surveys +
direct verification of every excerpt) from the operator's 2026-07-06 UI/UX
critique. **That critique is the new design authority.** It supersedes the
July-4 export's warm/editorial tokens and RESOLVES the gen-4 open tension:
the 2026-06-12 bans ("data as of" chips, judged-word labels) stand and are
now machine-enforced (plan 050), alongside new bans (interpunct metadata
chains, kicker eyebrows, self-referential filler sections).

Verified headline facts the plans are built on:

- Three REAL BUGS ride along: the route header renders "M86 SBS-SBS"
  clipped (an inline badge duplicate in `RoutePublicAtoms.tsx:72-78`
  appends `-SBS` to labels already containing SBS — the shared
  `RouteBadge` normalizes correctly and is unused there); "unda" badges
  are `timelineYearLabel()` slicing `"undated"` to 4 chars
  (`TreatmentsHistorySection.tsx:303-306`); duplicate citation chips come
  from served `citationKeys` arrays with duplicate keys rendered without
  dedupe (`WikiEvidence.tsx:32-34`).
- The route page literally has NO overview: `OverviewSection.tsx` (266
  LOC, containing the summary card + the page's only plain trend chart +
  mini map) has ZERO importers; the "Overview" anchor scrolls to the
  header. The "tabs" are anchor links on one long scroll.
- A large dead-component layer exists (`TimelineSection` cluster,
  `Heatmap`, three `*Overlay` charts + `OverlayChart`, `Rail`,
  `ConfidenceBar`, `MapThumb`, `RouteMetricStrip`, `RouteVitalsCard`,
  `StudioFooter`…) — swept in 049/060 with grep gates.
- Slop censuses: 26 interpunct instances, ~44 uppercase-tracking labels
  across 16 files, 5 files with "generated/as-of" strings, both treatment
  lists unbounded (~95 + ~79 items), the home index unbounded (~381 rows).
- Local `data/artifacts/studio/v1/routes.json` holds the 12-route pilot;
  PRODUCTION serves the 381-route release (plan 021). Wiki evidence covers
  only a handful of pilot routes — capability gating carries the sparse
  majority, so no plan depends on corpus size.
- No headless browser exists in the workspace; verification = typecheck +
  bun tests + build/budget + HTTP smoke; visual review is an operator
  dev-server pass (screenshots noted as absent, not faked).

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 048 | MTA visual language: cool palette, MTA-blue accent, black nav bar | P1 | M | — (land tree first) | DONE |
| 049 | Shared primitives: SectionCard, SourceNote, BoroughBadge, RouteBadge fix, dead-component deletes | P1 | M | 048 rec. | DONE |
| 050 | Design-doctrine harness check (slop lint + ratchet allowlist) | P1 | S-M | 049 | DONE |
| 051 | Homepage rewrite (neutral, search-first) + new /routes directory | P1 | L | 048-050 | DONE |
| 052 | Delete the methods page end-to-end (incl. worker endpoint) | P2 | M | 051 (hard) | DONE |
| 053 | Route detail: real tabs (?tab=) + compact self-evident header | P1 | L | 049 (hard), 048, 050 | DONE (plain-markup tab bar) |
| 054 | Overview tab: one summary, one trend, mini map, insights | P1 | M | 053 (hard) | DONE |
| 055 | Slow segments tab: ranked table, one hour chart, calm map; delete carpet + Profile | P1 | L | 053 (hard); 054 rec. | DONE |
| 056 | Riders & reliability tab: rider-real numbers; meta-metrics → SourceNote | P1 | M | 053 (hard) | DONE |
| 057 | Treatments & history tab: grouped bounded timeline; "unda" + citation-dupe fixes | P1 | L | 049+053 (hard); 054 rec. | DONE (RPubInterventionCard + CitationChips kept: live consumers interventions.tsx/DataNotesSection → plans 058/060) |
| 058 | Interventions page: bounded, filterable network chronicle | P2 | M | 049+057 (hard); 052 rec. | DONE (RPubInterventionCard + RoutePublicAtoms.tsx + StudioHero deleted; route file made lazy for bundle budget) |
| 059 | Network map: full-bleed + in-map overlays; kill time-autoplay | P2 | M-L | 048; 055 (scrubber delete) | DONE (TimeScrubber deleted; period toggle All/AM/PM; map click-through; mobile gets map + legend + toggles, no bottom sheet) |
| 060 | Dead-component sweep + close the doctrine ratchet (run LAST) | P3 | S-M | 051-059 | DONE (17 dead files + 1 orphan test deleted; still live: SectionHeader ← DataNotesSection, CorridorMap + RouteGeoMap ← Overview/map sections; allowlist NOT empty — keeps live-pattern entries CorridorMap, RouteGeoMap, RouteMapLibre.map interpuncts + RouteMapSection kicker per operator drift note; bundle after sweep: entry 115.0 KB gz, total 312.6 KB gz) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 6)

- **Operator gate first**: the working tree carries all of gen-4/5
  uncommitted. Land/commit it before ANY gen-6 plan starts; every plan's
  drift check compares excerpts, not SHAs, because of this.
- 048 → 049 → 050 is the foundation chain (tokens → primitives → the check
  that enforces them). 050 freezes today's violations in a ratchet
  allowlist; every page plan REMOVES its files from that allowlist (the
  stale-entry guard forces it); 060 asserts the list ends empty.
- 051 BEFORE 052: the old home loader calls `fetchStudioMethods`; 052
  deletes it.
- 053 is the keystone (tab shell + header); 054-057 fill its tabs and can
  run in PARALLEL worktrees after it (they touch disjoint files, except:
  054 before 057 recommended — 054 establishes Overview as the trend
  chart's only home, 057 deletes the duplicate).
- 057 BEFORE 058: `/interventions` reuses the row pattern and is the last
  consumer of `RPubInterventionCard` (057 leaves it; 058 deletes it).
- 055 BEFORE 059's scrubber-deletion step (055 removes the route map's
  TimeScrubber usage; 059 removes the network map's and deletes the file).
- Non-interactive default applied: the operator's critique enumerated the
  full scope, so all listed plans were written (not just top-5); the
  operator can drop/reorder rows before execution.

## Findings considered and rejected (gen-6 audit — do not re-audit)

- **"The M86 badge clipping can't be verified"** (route-detail subagent) —
  WRONG: the header does not use `RouteBadge`; the inline duplicate at
  `RoutePublicAtoms.tsx:72-78` renders `"M86 SBS-SBS"` with no `nowrap` in
  a fixed `h-10` box. Fixed in 049.
- **"No data duplication across sections — all intentional"** (same
  subagent) — verdict overridden: each viz uses a distinct metric, but
  segment speeds surface in 4 sections and hourly data in 4; the operator
  experiences that as repetition. The tab plans assign each data family
  ONE home (matrix preserved in plans 054/055).
- **"12 served routes / 6 wiki bundles"** (data subagent) — stale LOCAL
  artifacts (the pilot fixtures); production serves the 381-route release.
  Plans stay corpus-size independent via capability gating.
- **"Keep one 'route feed generated' timestamp" / "move featured routes to
  /case-studies" / "add pagination only if perf demands"** (home subagent
  suggestions) — all rejected: the operator's directives are explicit
  (delete the timestamps, delete "In focus" entirely, bound the index as a
  UX decision).
- **Biome/GritQL plugin for the slop lint** — rejected: no Biome plugins
  in use; the repo's established custom-rule mechanism is the bun-test
  harness (`production-boundaries.test.ts`), which is testable and already
  wired into `check:architecture`. Plan 050 follows it.
- **Renaming section registry values or route URLs for the tab IA** —
  rejected: `ROUTE_DETAIL_SECTIONS` + capability gating stay; tabs COMPOSE
  sections (`ROUTE_DETAIL_TABS` layer). `?tab=` is additive URL surface.
- **Deleting the pipeline's methods.json build with the methods page** —
  deliberately out of scope of 052 (serving-only removal); the pipeline
  build is a separate operator call.
- **`RouteBoardingsTrend` "proxy" mode** — a dead branch that would
  synthesize rider counts from scaled speed data; killed in 056 as a
  fabrication hazard (honesty doctrine).
- **"60 th Street" spacing in citations** — source-data artifact from the
  wiki extraction, not a render bug; UI is made dupe-immune in 049/057 and
  the pipeline fix is a named wiki-repo follow-up.
- **Per-tab `React.lazy` code-splitting** — deferred; charts/maps are
  already lazy at the component boundary and entry currently sits at
  122.9/145 KB gz. Measure before adding a split layer.
- **Borough roundel palette changes** (Brooklyn's brown reads muddy on the
  new white surfaces) — operator taste call, recorded in 048's maintenance
  notes, not planned.
- **Trend chart with intervention event markers** (marrying Overview's
  chart with History's events) — attractive but needs a design pass;
  recorded in 057's maintenance notes.

## Shared constraints (generation 6)

- Bundle budget: entry 145 KB gz / total 390 KB (current: entry 122.9);
  failures are STOP-and-report, never a self-approved raise. The eager
  route-loader-imports-a-value trap still applies to new routes (051's
  step 6 encodes the check).
- Effect stays out of the browser; charts stay shadcn/Recharts v3 behind
  lazy `X.tsx` + `X.chart.tsx`; maps stay behind lazy `.map.tsx`.
- Honesty is the product: capability manifest decides render/empty/hide;
  no synthesized dates, metrics, or impact claims; sparse routes get
  complete honest pages. Meta-information moves to `SourceNote`, never to
  KPI tiles.
- Root `bun run check:types` OOMs — always `bun --filter <pkg> typecheck`.
- Verification default per plan, then the pre-merge gate:
  per-package typechecks, `test:web`, `test:worker` (where touched),
  `bun --filter @bp/web build`, `check:web-seo` (page-set changes),
  `check:architecture` (includes the new `check:design-doctrine`),
  `check:style`.

# Generation 5 — consolidation: one schema layer, one CLI, one copy of the data (2026-07-04)

Planned at commit `ce3baca` by a read-only advisor audit (6 parallel
surveys + direct verification of every load-bearing claim) on the
operator's direction: remove zod entirely in favor of Effect (v4,
`effect@4.0.0-beta.92` — the installed line), migrate the pipeline CLI off
the unmaintained-and-unpublished `@liche/core` onto `effect/unstable/cli`,
deprecate the duplicate raw-JSON cache layer after proving SQLite coverage,
delete the failed agent-corpus-research tooling, evaluate
`packages/domain`'s weight, fold genuinely generic pipeline capabilities
into nyc-transit-kit, and cut net LOC while raising robustness/readability.

Verified headline facts the plans are built on:

- The zod/Effect seam is mechanical, not semantic: repo-wide there are ZERO
  uses of `.transform( .refine( .default( .catch( z.lazy z.custom`; the
  volume is `.strict()` ×434, `.coerce` ×158, `.passthrough()` ×98,
  `z.enum` ×248, brands ×20, 1 codec, 1 registry.
- The v4 Effect line has NO drizzle bridge (`@effect/sql-drizzle` is
  v3-only; `drizzle-orm@1.0.0-rc.3` ships zod/valibot/typebox/arktype
  validators, no effect). The db answer is drizzle-inferred types +
  boundary-only guards, not an ORM swap.
- `data/` is 409 GB on a 91%-full disk; `data/raw` (182 GB of JSON) mostly
  duplicates the 170 GB canonical `data/local/pipeline.sqlite`
  (`socrata-monthly-ingest.ts` writes both on every run), and
  `data/artifacts/docs` (51 GB) is fully orphaned by the Tier 2 deletion.
- ADR-0019 pre-authorized the CLI migration as "a later simplification
  step" once the Effect runtime/service groundwork landed. Plan 040 landed
  the dependency-removal pass with 99 descriptor-backed commands now running
  through `effect/unstable/cli`.
- 2,462 LOC of `packages/domain/src/documents/*` have zero external
  importers (Tier 2 leftovers); domain's live core (primitives, findings,
  studio, maps, routes) has 10-36 importer files per subpath and stays.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 036 | Remove dead dependencies, dead exports, root clutter | P2 | S | — | DONE |
| 037 | Delete the agent-research tooling (keep live AI-notes path) | P1 | M | — | DONE |
| 038 | Build the raw→SQLite coverage gate (deletion prerequisite) | P1 | M | — | DONE |
| 039 | Deprecate the raw-JSON layer (stop dup writes + operator runbook) | P1 | M | 038 | DONE |
| 040 | Migrate pipeline CLI: @liche/core → effect/unstable/cli | P1 | L | 037; 039 rec. | DONE |
| 041 | De-zod packages/db: drizzle-inferred types + schema reconciliation | P2 | L | 030-032 done | DONE |
| 042 | Drop client-side response parsing (zod out of the browser) | P2 | M | 030-035 done | DONE |
| 043 | Prune + migrate packages/domain to Effect Schema | P1 | L | 041, 042 | DONE |
| 044 | Migrate sources/pipeline schemas; evict zod; ADR-0020 | P2 | M-L | 040, 043 | DONE |
| 045 | nyc-transit-kit generic upgrades (cross-repo) + adoption | P3 | M | — (039 rec.) | IN PROGRESS (Order 1 done; Orders 2-4 gated) |
| 046 | Reconcile D1 Drizzle migration lineage after Plan 041 | P1 | M-L | 041 blocked | DONE |
| 047 | Finish Effect migration: consume nyc-transit-kit natively (ADR-0021) | P2 | M-L | 045 Order 1 | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 5)

- **Gen-4 first where files overlap**: 041 waits for 030-032 (serving
  contract + its tests are the regression net); 042/043 wait for all of
  030-035 (they own `read-handlers.ts` and the web route pages). 036-040
  and 045 do not overlap gen-4 and can start immediately.
- 038 → 039 is a hard gate: no raw deletion without the coverage manifest.
  The disk is 91% full — these two are the urgency track. All `data/`
  deletion is OPERATOR-RUN via the generated runbook; executors never `rm`
  data.
- 037 before 040 (fewer files to migrate); 039 before 040 recommended
  (settles ingest handler bodies before their CLI shells are rewritten).
- 040 before 044 (liche re-exports zod into 87 files; its `arg.*` helpers
  are zod wrappers).
- 041 + 042 before 043 (db exports derived types; web goes types-only so
  domain's schema swap cannot touch the browser bundle). 043 before 044
  (044 finishes the leaves and flips the repo-wide grep gate).
- 045 is independent; its bus-repo half lightly overlaps 039's ingest
  edits — land 039 first or rebase.
- 047 landed after 045 Order 1 (the 0.2.0 pin bump) and owns the SODA3
  pagination/token call-site rework Effect-natively; 045's original
  compat-based swaps were superseded to avoid double-touching `lib/soda3.ts`.
  compat remains sanctioned only at Promise edges (studio-api, per 026's
  measured BLOCK and ADR-0021).
- Expected net effect when all land: roughly −6,000 to −9,000 LOC of
  TS/Python (deletions in 036/037/039/041/043 dominate; the schema
  migration itself is ~LOC-neutral), two dependencies fully removed
  (`@liche/core`, `zod`) plus `pi-agent-core`/`pdf-lib`/`pmtiles`/
  `@tidy-ts/dataframe`/`shadcn`, one schema library repo-wide, and
  ~230 GB of disk reclaimed by the operator runbook.

## Findings considered and rejected (gen-5 audit — do not re-audit)

- **Migrate `packages/db` to `@effect/sql` / "effect/sql-drizzle"** —
  rejected: no drizzle bridge exists on the v4 line (verified in vendored
  effect-smol and installed drizzle-orm 1.0.0-rc.3); a raw
  `effect/unstable/sql` rewrite loses drizzle-kit migration codegen and
  puts Effect runtime plumbing into the Worker hot path (plan-026
  precedent). Plan 041 takes the derived-types path instead. Revisit only
  if the Effect team ships a v4 drizzle integration AND worker handlers go
  Effect-native.
- **The gen-2 rejection "Effect Schema replacing zod is LOC-neutral churn;
  Zod v4 stays (ADR-0001/0019)" is SUPERSEDED** by operator direction
  2026-07-04 and by changed facts (2,462 LOC of schema dead weight; zero
  hard-to-migrate zod APIs in use; liche removal was not on the table in
  June). Recorded in ADR-0020 (plan 044).
- **Move/rename `tools/pipeline-v2` to `apps/`** ("it's really an internal
  app") — agreed on the vocabulary, rejected as a move: the boundary
  harness pins the script strings, ~90 files' import paths would churn, and
  nothing improves functionally. The gen-5 wiki updates may describe it as
  an internal app; the path stays.
- **Migrate `packages/sources` adapters into nyc-transit-kit** — rejected
  by the two-repo audit: adoption is already correct (kit does transport/
  decode; the 18 adapters are bus-specific normalization). Only three
  generic capabilities move (plan 045). Geoclient/census clients are
  non-transit and stay local.
- **Delete `_release-segments.ts` / `lib/llm.ts` / `pi-ai` with the agent
  tooling** — WRONG: `studio release` imports `_release-segments.ts`, and
  the AI notes it generates render publicly
  (`SlowSegments.tsx:145` renders `segment.aiNote`). Plan 037 keeps that
  path and deletes only `pi-agent-core`/codemode/sandbox. (A first-pass
  subagent report claimed it dead; direct verification disproved it.)
- **Delete `lib/route-briefs/`** — WRONG (another disproven subagent
  claim): imported by `effect/route-brief-model.ts`,
  `commands/studio/release.ts`, `commands/studio/_release-types.ts`,
  `commands/audit/pipeline-v1.ts`.
- **Delete `geoclient-current-v2.yaml`** — referenced as the spec pointer
  by `packages/sources/src/clients/geoclient/client.ts:66`. Stays.
- **Remove `es-toolkit`** — live via `apps/web/vite.config.ts` aliases onto
  `apps/web/vendor/es-toolkit-compat/*.mjs` (recharts shimming).
- **Consolidate `src/checks/*` into CLI subcommands** — deferred DX polish;
  root scripts pin the direct file paths and the boundary test asserts
  them. Not worth the churn during the CLI migration.
- **Effect Schema parsing in the BROWSER as the zod replacement** —
  rejected; plan 042 removes client-side runtime parsing entirely (types
  only), keeping "Effect stays out of the browser" true by construction
  and shrinking the entry bundle.
- **Preserve the CLI's silent glob command discovery** — rejected: the
  import-failure skip was a defect (a broken command file just vanished),
  not a feature. Plan 040 keeps descriptor discovery but makes import
  failures loud and backs the registry with an exact completeness test.
  `--schema` reflection dropped (zero consumers verified); `--json`
  preserved via golden-output contract (six script invocations in
  `scripts/run-available-not-fetched-backfill.sh`; the script logs command
  JSON but parses downstream artifacts).
- **"112 commands" (subagent census)** — corrected: 99 live command
  descriptors after Plans 038/039; the other files under `commands/` are
  helper modules.
- **Delete `check-pioneer-provider`** — independent of the agent harness
  (fetch-based provider smoke; no pi-* imports). Stays.
- **`data/raw/socrata-partitioned` (142 GB) immediate deletion** — not
  gated yet: layout is month-opaque until plan 038 classifies it; it is the
  single biggest follow-up prize after the first reclaim wave.
- **studioBrief D1 tables "actively used"** (subagent claim) — the query
  module `studio-brief-agents.ts` is exported only by the `@bp/db` barrel
  with zero consumers; the tables are dead-in-waiting and plan 041
  reconciles them against the already-present drop migration 0029.
- **"`data/raw/route-slices` (7.4 GB) is orphaned — delete now"** (late
  dataflow-audit claim) — WRONG:
  `commands/studio/release.ts:86` still defaults
  `defaultRouteSliceRawRoot = "data/raw/route-slices"`. Plan 038's gate
  must verdict it; not deletable on sight.
- **"Only two lines block raw deletion"** (same report) — undercounted:
  `route-treatment-summary.ts:34-35` reads the same `data/raw/network/`
  snapshots, and `release.ts:86` references the raw route-slice root. The
  full constraint list lives in plan 038.
- **"All of `domain/documents/` (4,531 LOC) is orphaned"** (late
  schema-audit claim) — over-broad: only the four subtrees totaling
  2,462 LOC have zero external importers; `candidates`,
  `intervention-records`, `operational-date`, and the documents root are
  live (analytics interventions + pipeline intervention evaluation).
  Plan 043 prunes exactly the dead four.
- **"Delete `schema-registry/` immediately (0 importers)"** (same
  report) — the registry MECHANISM (`src/schema-registry.ts` +
  `registerProjectSchema`) is live domain-internally and feeds
  `@bp/domain/json-schema` → studio-api OpenAPI; only the 5-line
  `src/schema-registry/` re-export stub DIR is dead (plan 043 deletes it).
- **Re-point `_release-geometry.ts` from raw network snapshots to
  SQLite** — real and desirable (frees the `network/` + possibly
  `route-slices/` families) but HIGH-risk: it rebuilds release-time
  geometry and must prove parity of published artifacts. Deliberately NOT
  folded into plan 039; it is a named follow-up in 039's maintenance
  notes for the operator to commission separately.
- **`--prune` for stranded socrata-partitioned chunks** (skip-if-exists
  downloads strand out-of-range chunks on narrower re-runs;
  `http-file-download.ts:147-156`) — real, small, deferred; named in plan
  039's maintenance notes rather than planned now.

---

# Generation 4 — post-incident hardening + July design repair (2026-07-04)

Planned at commit `ce3baca` by a read-only advisor audit (5 parallel surveys +
direct production verification) after PRs #54-58 stabilized the snapshot
endpoint and the operator called out frontend regressions. Two tracks:

1. **Backend truth & resilience.** The Snapshot 2.0 omission is a live,
   stable production failure hidden behind #58's fallback (030). The
   Worker-1101 crash class that started the incident still exists on ~20
   other `.parse` sites with no global catch (031). The serving layer
   fabricates route metrics that render publicly — including a ×1.18
   "scheduled speed" attributed to "MTA GTFS" and a synthetic spark that
   marks every homepage route "Improving" (032).
2. **Frontend repair, not redesign.** The route page pins ~250-290px of
   chrome (033), and its content doesn't scan — the verdict/ranked-insights
   structure from the July design is missing though all its data is served
   (034). Routes home/search repairs are 035.

**Design authority (gen-4)**: the July 4 export at
`knowledge/raw/design-handoffs/bus-priority-impact-studio-2026-07-04/`
supersedes `03-canonical` and the May tarbell rows for these plans, per
`knowledge/wiki/engineering/studio_design_pass_status.md`. **Unresolved
tension the operator should adjudicate**: the gen-3 "banned forever" list
(2026-06-12 verdict: "data as of" chips, judged-word KPI labels, verdict-*
mockups) conflicts with the July export, which is verdict-layer-based and
uses DataAsOf chips throughout. Gen-4 plans implement verdict STRUCTURE
(lede, ranked insights, compact header) and deliberately exclude the
contested chips/labels until the operator re-approves them.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 030 | Restore Snapshot 2.0 (loose-load/strict-compose fix + operator probes) | P1 | M | — | DONE |
| 031 | Worker error envelope (kill the 1101 class; tolerant evidence fan-out) | P1 | M | 030 (same file) | DONE |
| 032 | Honest route card (stop serving fabricated metrics) | P1 | L | 030, 031 | DONE |
| 033 | Route shell scroll chrome (header scrolls; slim sticky nav) | P1 | M | — (before 034) | DONE |
| 034 | Route detail scanability (verdict lede, ranked insights, rhythm) | P1 | L | 032, 033 | DONE |
| 035 | Routes home + search repair (voice, free-text search, mobile directory, a11y, dead code) | P2 | M | 032 | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes (gen 4)

- 030 before 031: both edit `packages/studio-api/src/studio/read-handlers.ts`;
  030's diagnosis-preserving tests must not be invalidated by the envelope.
- 032 after 030/031 (same backend file) and before 033/034 (the FE plans
  assume the honest-or-absent card contract).
- 033 before 034: 034 restyles the header content that 033 un-pins.
- Operator-only steps live in plan 030's "Operator handoff" (production log
  read, R2/D1 probes, artifact re-publish). Production D1 migrations and
  deploys remain operator-run.

## Findings considered and rejected (gen-4 audit — do not re-audit)

- **"502 body leaks Zod issues"** — FALSE: `snapshotContractFailureResponse`
  logs details to console only; the response body is the plain error envelope
  (verified in `http/errors.ts` usage and the #58 test).
- **"/interventions double-fetches the 813KB `?schema=2` index"** — FALSE:
  the route loader fetches the v1 routes list + the compact evidence payload,
  and already degrades gracefully when evidence fails
  (`apps/web/src/routes/interventions.tsx:15-33`).
- **"Evidence endpoint uncached"** — FALSE: production serves
  `cache-control: public, max-age=60, stale-while-revalidate=86400` + ETag
  (verified live 2026-07-04). Payload growth remains a watch item as the
  timeline corpus expands past 12 routes.
- **"Display months still break the snapshot post-#57"** — eliminated by
  local simulation with the real schemas: post-#57 D1 rows parse-or-skip and
  cannot fail the v2 compose; the remaining failure is isolated to the model
  projection months (plan 030).
- **Borough heuristic defaults unknown prefixes to Manhattan; termini split
  on " - "** (`read-handlers.ts:296-303,556-563`) — real, LOW impact;
  cosmetic misclassification only; not worth a plan now.
- **Client-side Zod parse of the 1.19MB evidence payload on the main thread**
  — real but minor (cached, infrequent, ~tens of ms); revisit only if the
  interventions page grows.
- **Network-map `scheduledMph` fabricated in the pipeline**
  (`tools/pipeline-v2/src/commands/map/artifacts.ts:890`, same ×1.18) — REAL;
  deliberately deferred to a pipeline+artifact-republish follow-up named in
  plan 032's maintenance notes, so it does not block the serving-layer fix.
- **"Nav should be Routes/Map/Findings/Briefs per system.jsx"** — by-design
  divergence: findings/briefs surfaces were hard-deleted in the gen-3 cutover
  (plan 017); the mockup's nav labels predate that product decision. Same for
  "Read this month's findings" CTA copy on home.
- **"SBS badge should be two pills per system.jsx:165-176"** — by-design:
  `RouteBadge.tsx:44-48` documents the merged MTA-style roundel deliberately
  ("no separate SBS pill, and never doubled").
- **"Route title 24px vs design 21px" (+ two more px-nudges)** — mis-attributed:
  the cited `RouteIdentity.tsx` is DEAD code (zero importers; deleted by plan
  035). The live header type scale is set by plan 034.
- **"Route detail is a tabbed workbench; flatten the tabs"** — premise wrong:
  the page is already a single scroll with an anchor nav (all sections render
  sequentially); the real problems are the pinned chrome (plan 033) and the
  missing verdict/ranked structure (plan 034).
- **"KPI strip must be four oversized stats"** — the two July references
  disagree (route-public.jsx shows 4, the newer verdict-shell.jsx shows 5);
  plans keep 5 per the verdict layer; noted in plan 034's maintenance notes.
- **"Add reviewer card (avatar, quote, audit-trail ID) to How-we-know"** —
  rejected: no real reviewers exist; fabricated analysts are explicitly
  banned by the design doctrine.
- **"About this corridor fact sheet"** — data-blocked: route length is
  fabricated today (nulled by plan 032), peak frequency isn't served; revisit
  when real fields exist.
- **Grid-first section leads / treatments timeline-first / hour-strip
  unification / chart annotation restraint** — real, deferred to a post-034
  polish round (listed in plan 034 maintenance notes).
- **Monolith decomposition** (`home.tsx` 800 LOC,
  `TreatmentsHistorySection.tsx` 558, `DataNotesSection.tsx` 525) — real tech
  debt, deferred; plan 035 notes the extraction seam for the home directory.
- **Format-utility consolidation, SlowSegments useMemo, React.memo on chart
  layers** — not worth doing now (micro-wins, no measured cost).
- **Direction options for the operator** (not planned, recorded): revive a
  `/search` results page per `search-results.jsx`; analyst triage home per
  `route-first.jsx`; treatment-type filters on `/interventions` per
  `interventions-refactor.jsx`. All were cut in gen-3; reviving any is an
  explicit product decision.
- **"Evidence payload uncompressed on the wire"** — FALSE: production serves
  `content-encoding: br` (verified live 2026-07-04); Cloudflare compresses at
  the edge. Client main-thread parse cost stays a watch item only.
- **"Snapshot 2.0 fallback path untested"** — FALSE: the #58 regression test
  exists at `api-facade.test.ts:2736` (poisoned model months → caveat +
  v1-only 200); plan 030 rewrites it for the new degrade behavior.
- **"Zod issues leak to clients in 502 details"** — FALSE: `errorResponse`
  bodies are exactly `{error:{code,message}}`; issues go to console only. The
  contract type's unused `details?`/`requestId?` fields are the only trace —
  plan 031 populates `requestId` properly.
- **"R2 artifact passthrough lacks path validation"** — stale: `decodeArtifactKey`
  + `isValidArtifactKey` already guard it (`public-api.ts:603-614`; plan 012's
  serving-path hardening, DONE).
- **ETag inconsistency across response helpers** — real but small: studio
  responses carry `ETag: "studio-<hash>"` (`projections.ts:57`) while
  public-api's 8 `jsonResponse` sites rely on max-age only. Deferred (S);
  standardize on the studio helper if the legacy public endpoints ever matter
  again.
- **`.parse` on D1 rows in `db/d1/queries/route-batch-status.ts:96,113`** —
  same 1101 class; covered at the API layer by plan 031's envelope; per-site
  safeParse conversion deliberately not planned.

---

# Generation 3 — the route evidence product (2026-07-01)

Planned 2026-07-01 after a full-repo, mta-wiki, and design-handoff audit
(six parallel surveys + direct verification), on the operator's direction:
the product is a portfolio piece for MTA data/software roles, not a startup.
**Build a complete, attractive, useful public website for NYC bus route
evidence** — routes, maps, timelines, interventions, honest gaps — and
delete complexity that does not serve it. Hard cutovers allowed.

Three moves define this generation:

1. **Land what exists.** The entire hard cutover (plans 015-018) is
   uncommitted working-tree state — green everywhere except `check:style`.
   Landing it is P0 (plan 019).
2. **mta-wiki becomes the only document-evidence backend.** The plan-016
   artifact is built but has zero consumers; serve it (020), then delete the
   68 kLOC in-repo Tier 2 system it replaces (024). Cross-repo asks live in
   the work orders (028).
3. **Converge the surviving pages on the canonical design and real data.**
   Editorial route page (022), corpus beyond the 12-route pilot (021),
   already-built grains served (023), supporting pages finished (025).

Effect work continues where it pays: the worker HttpApi migration is
re-scoped and unblocked with a measured spike (026 — operator consented
2026-07-01), pipeline seams get retries/bounded concurrency (027), and the
nyc-transit-kit pin gets fixed at its source so adoption can proceed (029).

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 019 | Land the hard cutover and clear the residue | P0 | M | — | DONE (merged/deployed 2026-07-02; live smoke passed) |
| 020 | Serve the MTA-wiki route evidence end-to-end | P1 | L | 019 | DONE (merged/deployed 2026-07-02; route evidence live smoke passed) |
| 021 | Expand the served route corpus beyond the 12-route pilot | P1 | L | 019 (020 rec.) | DONE (381-route release verified 2026-07-02; homepage index grouped/filterable) |
| 022 | Converge the route page on the canonical editorial design | P1 | L | 019, 020 | DONE (PR #40 verified 2026-07-03; screenshot gate approved) |
| 023 | Serve the grains we already build (hourly, DOW, reliability) | P2 | M | 019 | DONE (verified 2026-07-03; largest per-route hourly artifact 30,107 bytes) |
| 024 | Delete the Tier 2 document pipeline and stale doctrine | P2 | L | 019, 020 | DONE (verified 2026-07-03; Tier 2 docs pipeline deleted, D1 brief-draft migration prepared, mta-wiki evidence registry dependency in place) |
| 025 | Finish the supporting pages (home, interventions, methods) | P2 | M | 019, 022 | DONE (verified 2026-07-03; screenshots captured) |
| 026 | Worker on Effect HttpApi: spike ADR, then migrate | P2 | L | 019 (024 rec.) | BLOCKED (spike STOP: `test:worker` regressed from baseline real 3.07s / Vitest 2.36s to real 8.71s / Vitest 7.96s after one-endpoint Effect skeleton) |
| 027 | Effect the pipeline seams: retries, concurrency, ingest | P3 | M | 019, 024 | DONE (verified 2026-07-03; HTTP retries centralized, bounded ingest/map/studio fan-out, adoption 69/98) |
| 028 | MTA-wiki work orders (cross-repo; executed in mta-wiki) | P2 | M | — | DONE (v1-rc5 verified 2026-07-03; route anchors/taxonomy/date contract present; bus importer matched 10/12 served routes with 0 ambiguous omissions) |
| 029 | nyc-transit-kit: align the Effect pin, then adopt | P3 | M | 019, 027 rec. | DONE (0.1.3 adopted 2026-07-03; sources/pipeline/Studio/web gates green) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes

- 019 gates everything — nothing else starts until the tree is landed.
- 020 before 024: the Tier 2 deletion's gate is the timeline-serving parity
  diff that 020 records.
- 022 wants 020 (evidence on the page) and 023 step 1 (hour strips), but its
  cards render honestly without them — coordinate, don't serialize blindly.
- 021 (corpus) multiplies the value of everything else; after each batch,
  rerun 020's importer.
- 026 supersedes 009 and closes 007's goal (derived OpenAPI fixes the
  `$defs` blocker). 029 supersedes 014. Old rows below are marked.
- 028 runs in `/mnt/models/dev/mta-wiki` under that repo's rules; its order 1
  (versioned releases) hardens 020, so start it early.

## Shared constraints (generation 3 — these correct stale gen-1/2 notes)

- **Bundle budget (re-based)**: entry 118.5 KB gz against a 145 KB budget,
  total 343.4 / 390 KB as of 2026-07-01 — the old "168 KB with 59 bytes of
  headroom" note below is obsolete. There is headroom; heavy modules still
  go behind `React.lazy` (`X.tsx` + `X.chart.tsx` pattern), and budget
  failures are still STOP-and-report, never a self-approved raise.
- **Effect stays out of the browser** (`rg 'from "effect"|from "@effect/'
  apps/web/src` → empty, worker entry excepted). Worker-side Effect is now
  permitted via plan 026's measured spike; pipeline Effect per ADR-0019.
- **The effect-ts skill exists** at `/home/cjpher/.codex/skills/effect-ts/`
  (guides for layers, retries, schema, testing, observability); the vendored
  Effect source is `.repos/effect`. Trust installed source over memory for
  sub-1.0 APIs.
- **Root `bun run check:types` OOMs** at default heap — always use
  per-package `bun --filter <pkg> typecheck`.
- **Design authority**: `knowledge/raw/downloads/design-handoffs/03-canonical/`
  for the five public pages (`system.jsx`, `home-public.jsx`,
  `route-public.jsx`, `methods-public.jsx`, `geo-data.jsx`,
  `interventions-refactor.jsx`). Banned forever (2026-06-12 verdict):
  "data as of" chips, judged-word KPI labels, self-referential coverage
  copy, anything from `verdict-*.jsx`, evidence-shelf/scoring/chat UI. The
  brief/compare/search mockups are dead with their surfaces.
- **Honesty is the product**: capability manifest decides render/empty/hide;
  wiki-derived facts always carry citations; never synthesize dates,
  metrics, or impact claims. Sparse routes get complete honest pages.
- **Verification default**: every plan's per-step gates, then the full
  pre-merge gate (per-package typechecks, `test:unit`, shared web tests,
  worker tests, `check:web-architecture`, `bun --filter @bp/web build`,
  `check:style`).

## Facts executors will otherwise rediscover slowly

- The served route corpus is **12 routes** (`data/artifacts/studio/v1/
  routes.json`); mta-wiki has route records for 312 — the gap is corpus
  size, not matching (plan 021).
- Route-page "insights" are served from **detector readiness**
  (`read-handlers.ts` → `buildRouteInsightsFromDetectorReadiness`), so
  `packages/analytics` (36.9 kLOC) and `packages/domain/src/findings/` are
  live infrastructure — no deletion plan touches them.
- `packages/domain/src/studio/{briefs,findings}` were deleted by plan 019;
  `studio_brief_draft*` D1 tables drop in plan 024 with a real migration.
- The wiki evidence artifact is 2.7 MB / 12 bundles / 2,354 citations at
  `data/artifacts/studio/v2/wiki/route-evidence.json`.

---

# Generation 1-2 history (2026-06-13 planning runs)

Generated by the improve skill on 2026-06-13 (UI/UX direction audit, standard
effort, planned at commit `58dfaeb`). Execute in the order below unless
dependencies say otherwise. Each executor: read the plan fully before
starting, honor its STOP conditions, and update your row when done.

Run context: invoked non-interactively, so plans were written for the top
findings by leverage (the audit's direction proposal is summarized in the
session report; the thesis is "space, time, people, trust" — real maps, the
multi-year time dimension, equity context, and zero fabricated figures).

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 011 | Portfolio discoverability (README live URL, primer, Tier 2 pointers) | P1 | S | — | DONE |
| 005 | Remove fabricated data from brief evidence/history pages | P1 | M | — | DONE |
| 001 | Riders tab equity context (D1 table exists, unserved) | P1 | M | — | DONE |
| 002 | MapLibre route-detail Map tab (replace SVG) | P1 | L | — | DONE |
| 003 | Citywide /map network page with metric lenses | P1 | L | 002 | DONE |
| 004 | Where & when multi-year segment carpet | P2 | M | — | DONE |
| 012 | Serving-path hardening (artifact-key validation, error hygiene, negative auth tests) | P2 | M | — | DONE |

(011 first: minutes of work, largest payoff for the project's stated
portfolio purpose. All five UI/UX plans passed a fresh-context cold review
on 2026-06-13 — verdicts READY / READY-WITH-FIXES, and the fixes are
already applied; the reviewer's two claimed blockers were themselves false
positives, see corrections below.)

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency notes

- 003 requires 002: it reuses 002's `maplibre-style.ts`, lazy-load pattern,
  and severity ramp; building it first would duplicate the map foundation.
- 001, 004, 005 are independent of everything and of each other; they can run
  in parallel worktrees.
- 005 is cheap and trust-critical — good first execution to validate the
  pipeline.

## Shared constraints (read before executing any plan)

- Every plan carries a **"UI/UX specification" section that is authoritative
  for visuals** (added 2026-06-13): exact tokens from
  `apps/web/src/global.css:14-66`, the six-anchor oklch speed ramp from the
  canonical handoff (`…/03-canonical/…/project/geo-data.jsx:20-44`), layout
  geometry, interaction/focus models, motion timings, and empty states.
  Executors implement the spec, not their own taste; payload-absent fields
  are omitted per spec, never fabricated.
- 168KB initial-JS budget; `bun --filter @bp/web build` enforces it. All
  heavy modules (maplibre-gl, dense charts) load behind `React.lazy`.
  **Current headroom is ~59 bytes**
  (`data/artifacts/web-audits/latest/performance-budget.json`) — even a new
  eager route-tree entry can trip it. A budget failure on irreducible bytes
  is a STOP-and-report, never a self-approved budget raise. (The Effect
  plans below compete for the same headroom; coordinate.)
- Root `bun run check:types` OOMs at default heap — use per-package
  `bun --filter <pkg> typecheck`.
- Banned on public pages (user design verdict 2026-06-12): "data as of" chips,
  judged-word KPI labels, copy about the project's own data coverage,
  anything from the `verdict-*.jsx` mockups, evidence-shelf/scoring/chat UI.
- Canonical design source: `knowledge/raw/downloads/design-handoffs/03-canonical/`
  (NOT 01-/02-superseded).

## Findings considered and rejected (do not re-audit)

- **"Comp F verdict hero" as Overview redesign** — auditor 3 read chat30 as
  converging on a large judged-verdict headline; the user's recorded
  2026-06-12 verdict explicitly dislikes the verdict-layer designs. Only the
  structural ideas (ranked findings, composed figure, map-last) survive, with
  real numbers. No plan resurrects the display-verdict.
- **Search "slowest" sort / compare & search URL-default bugs** — already
  fixed in uncommitted changes on `frontend-regression-fixes`; committing
  that branch is operator work, not a plan.
- **KPI strip judged-word labels** — already fixed (labels are now
  Speed/Trend/Excess wait/Riders/Bus lane; verified at
  `apps/web/src/components/route/RouteJudgedKpiStrip.tsx:124-171`).
- **Hour×day-of-week matrix** — no served payload carries DOW grain; needs a
  new serving projection first. Deferred, noted in plan 004.
- **311 complaint heatmap layer** — real opportunity but needs pipeline
  spatial-join work and a design pass; revisit after 002/003 establish the
  map foundation.
- **Brief history real diff engine** — requires versioned-draft API design
  (Track F); plan 005 makes the page honest now instead.
- **Search facet count duplication (perf smell)** — real but low impact at
  current scale; not worth a plan.
- **Weather-reliability surface** — blocked on causal-method review
  (knowledge/index.md open issue 9); premature to serve publicly.

## Audit corrections (2026-06-13 second pass — do not re-report)

Verified personally against the repo; recorded so future audits don't
re-chase them:

- **"Credentials committed in `.env`" — FALSE.** `.env` is gitignored
  (`.gitignore:11-12`), absent from `git ls-files`, and has no history
  (`git log --all -- .env` is empty). Only placeholder-valued
  `.env.example` is tracked. The local working-directory `.env` legitimately
  holds dev keys — normal, no rotation needed from the repo's perspective.
- **"`TrendOverlay.chart.tsx` doesn't exist / lazy-chart pattern is
  invented" — FALSE.** Nine `*.chart.tsx` files exist under
  `apps/web/src/components/`; the convention is established.
- **"1 failing detector-study test" — UNCONFIRMED.** `bun test
  test/detector-study.test.ts` in `packages/applied-research` passes 5/5 in
  isolation; if it fails in full-suite runs it's order-dependent/flaky —
  worth a look someday, not a plan.
- **CSRF on brief-draft writes** — mitigated by `SameSite=Lax` session
  cookies (cross-site POSTs don't carry the cookie); idempotency-key
  enforcement is plan 008. No separate CSRF-token work planned.
- **R2 double-decode + error-message hygiene + missing negative auth
  tests** — real but low severity; consolidated into plan 012.
- **Stale v1 command references in `knowledge/` wiki pages** — real
  (acknowledged by caveat banners in `knowledge/index.md:14-24`); wiki
  maintenance, deliberately unplanned.

---

# Product hard-cutover simplification (plans 016-018)

Generated by a 2026-06-30 follow-up after the maintainer backpedaled from a
brief/finding/AI-composer Studio toward a smaller public product. Current
direction: keep the name Bus Priority Impact Studio; hard-delete brief,
finding, composer, review, and authoring surfaces; make every route page
complete even when sparse; use `/mnt/models/dev/mta-wiki` only as a backstage
source of structured route evidence; collapse `packages/applied-research` into
deterministic pipeline aggregation.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 016 | MTA-wiki route evidence import contract | P1 | M | none | DONE |
| 017 | Hard-cut web app to route evidence pages | P1 | L | 016 | DONE |
| 018 | Collapse applied research into aggregation pipeline | P1 | L | 016, 017 | DONE |

## Dependency notes

- 016 comes first because the simplified app still needs source-backed
  timelines, interventions, citations, source gaps, and caveats.
- 017 should delete product surfaces in one hard cutover, not hide them behind
  flags.
- 018 should run after 017 so it can delete only the research code that no
  longer supports the public route-evidence product.
- 015 is intentionally moved behind 018. Build Effect services/layers around
  the simplified pipeline, not around applied-research code slated for
  deletion.

---

# Effect-stack migration study (plans 006–010)

Generated by a second improve session on 2026-06-13 (same commit `58dfaeb`,
ran concurrently with the UI/UX audit above — hence the separate number
block). The user asked for a plan to "use the entire effect stack" to cut
complexity and LOC. The audit found the payoff real in two places (worker
HTTP plumbing, pipeline resilience), already achievable without Effect in one
(typed client from the existing OpenAPI doc), and blocked or worthless in
three (browser client, domain schema bodies, SQL layer) — see the rejected
findings below. Session ran non-interactively; top findings by leverage were
planned by default.

2026-06-30 update: the maintainer clarified that the goal is broader than a
CLI-framework migration: "Effect runtime, typed errors, layers, and services
throughout pipeline commands," while still reducing LOC and keeping frontend
product surfaces simpler. After plans 016-018 settle the simplified product and
pipeline shape, execute plan 015 as the canonical Effect foundation for that
goal. Plans 006 and 010 are retained as historical evidence but are superseded
by 015.

2026-07-01 update: plan 015 is complete against the simplified seams that
survived the hard cutover. `packages/applied-research` has been deleted, so
follow-up Effect work should target the pipeline-local aggregation/services and
pure analytics boundaries that remain.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 015 | Effect platform runtime for pipeline commands | P1 | L | 018 | DONE |
| 014 | Replace duplicated source clients with nyc-transit-kit | P1 | L | — | SUPERSEDED by plan 029 (fix the pin in the operator-owned kit repo, then adopt per 014's mechanics) |
| 013 | Effect-native nyc-transit-kit official-API monorepo | P1 | L | — | REJECTED (superseded by existing published nyc-transit-kit; execute 014) |
| 006 | ADR-0019 Effect boundaries + measured footprint spike | P1 | S | — | REJECTED (superseded by 015's revised ADR/runtime plan) |
| 008 | Registry-driven auth/cache/idempotency enforcement | P1 | M | — | DONE |
| 007 | OpenAPI-generated client types | P2 | M | — | SUPERSEDED by plan 026 step 4 (the derived HttpApi OpenAPI document dissolves the `$defs` blocker) |
| 010 | Pipeline resilience on Effect core | P2 | M | 006 (ADR) | REJECTED (superseded by 015's service/runtime foundation) |
| 009 | Effect HttpApi worker migration | P2 | L | 015 (ADR worker gate), 008; 007 recommended | SUPERSEDED by plan 026 (operator authorized worker-side Effect 2026-07-01; 026 re-scopes to the 18-endpoint post-cutover surface with a measured spike ADR; 009's adapter/parity mechanics remain the playbook) |

## Dependency notes

- 008 before 009: the Effect middleware in 009 ports 008's centralized
  enforcement behavior and tests; and 008's security fix (declared-but-
  unenforced scopes) should not wait for a large migration.
- 014 supersedes 013. The separate `nyc-transit-kit` repo and npm packages now
  exist at `0.1.1`, so the next useful work is downstream adoption in this repo:
  delete duplicated generic source clients while keeping Bus Priority
  normalizers, registry, analytics, and serving code local.
- 015 supersedes 006 and 010. It records the revised ADR boundary, installs the
  pipeline Effect runtime dependencies, creates typed errors/services/layers,
  and migrates command slices. After the 2026-06-30 product simplification
  pivot, keep 015 focused on the smaller aggregation pipeline and shared
  pipeline seams.
- 009 is still separate worker/API work. It is gated by the worker-side ADR
  decision produced by 015 plus plan 008's centralized enforcement behavior.
- 007 is independent and survives 009 — only the OpenAPI document's
  *producer* changes when HttpApi derivation lands.
- 007's big follow-up (dropping client-side zod parsing to reclaim ~31 KB gz
  of initial JS) is deliberately deferred until server-side response
  validation exists (008 partially, 009 structurally); see 007's maintenance
  notes. Note this interacts with the UI/UX plans above — they consume the
  same initial-JS budget headroom.

## Findings considered and rejected (do not re-audit)

- **[SUPERSEDED 2026-07-04 by gen-5 plans 041-044 — operator direction;
  see gen-5 rejected-findings for the changed facts]** ~~Effect Schema
  replacing zod in `packages/domain`/`packages/sources` for LOC
  reduction~~ — the "domain is ~70% LOC" premise is false: zod schema
  definitions are ~7% of `packages/domain`; field enumerations are
  load-bearing and the same size in any schema library. Migration =
  LOC-neutral churn across ~65 files. Zod v4 stays (ADR-0001), reaffirmed in
  ADR-0019.
- **`@effect/sql`** — `packages/db` (Drizzle + bun:sqlite) already provides
  typed schemas, chunked batch inserts, and transactions; no raw SQL strings
  in commands. A wrapper adds a layer, removes nothing.
- **Effect in the browser bundle** — initial-JS budget is 168 KB with
  **59 bytes** of current headroom
  (`data/artifacts/web-audits/latest/performance-budget.json`); any Effect
  runtime in the client fails the build. Hard boundary, recorded in ADR-0019.
- **Socrata app-token leak in pipeline error logs** (subagent finding) —
  false positive: the token is attached as an `X-App-Token` header
  (`tools/pipeline-v2/src/lib/socrata-token.ts`), never in URLs, so error
  logging does not expose it.
- **"58 scattered scope-check sites" in studio-api** (subagent finding) —
  overstated: scope checks funnel through `hasStudioScope` /
  `requireStudioOperator` in `studio/auth.ts` + `brief-drafts.ts`. The real,
  verified issue is that registry metadata is not enforced by the dispatcher
  — that is plan 008.
- **Rewriting the `@liche/core` command framework on Effect** — ~300 command
  files of churn for no orchestration gain; Effect enters the pipeline behind
  Promise-shaped `lib/` seams instead (plan 010).
- **Publishing `tools/pipeline-v2` or mirroring `@bp/sources` 1:1 as the public
  CLI/package** — rejected by plan 013. `nyc-transit-kit` should be designed on
  its own around official API/provider families; this repo is a future consumer,
  not the blueprint.
