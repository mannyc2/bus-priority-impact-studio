# Implementation Plans

**Current generation: 6 (plans 048-060, the MTA-visual-language UI/UX
overhaul — below).** Generations 4 (030-035) and 5 (036-047) are DONE but
sit UNCOMMITTED in the working tree at planning time — the operator must
land that tree before gen-6 execution starts. Generation 3 (019-029) is
complete except 026 (BLOCKED); generations 1-2 (001-018) are complete or
superseded; older sections are kept further down as history and rationale.
Each executor: read your plan fully before starting, honor its STOP
conditions, and update your row when done.

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
| 049 | Shared primitives: SectionCard, SourceNote, BoroughBadge, RouteBadge fix, dead-component deletes | P1 | M | 048 rec. | TODO |
| 050 | Design-doctrine harness check (slop lint + ratchet allowlist) | P1 | S-M | 049 | TODO |
| 051 | Homepage rewrite (neutral, search-first) + new /routes directory | P1 | L | 048-050 | TODO |
| 052 | Delete the methods page end-to-end (incl. worker endpoint) | P2 | M | 051 (hard) | TODO |
| 053 | Route detail: real tabs (?tab=) + compact self-evident header | P1 | L | 049 (hard), 048, 050 | TODO |
| 054 | Overview tab: one summary, one trend, mini map, insights | P1 | M | 053 (hard) | TODO |
| 055 | Slow segments tab: ranked table, one hour chart, calm map; delete carpet + Profile | P1 | L | 053 (hard); 054 rec. | TODO |
| 056 | Riders & reliability tab: rider-real numbers; meta-metrics → SourceNote | P1 | M | 053 (hard) | TODO |
| 057 | Treatments & history tab: grouped bounded timeline; "unda" + citation-dupe fixes | P1 | L | 049+053 (hard); 054 rec. | TODO |
| 058 | Interventions page: bounded, filterable network chronicle | P2 | M | 049+057 (hard); 052 rec. | TODO |
| 059 | Network map: full-bleed + in-map overlays; kill time-autoplay | P2 | M-L | 048; 055 (scrubber delete) | TODO |
| 060 | Dead-component sweep + close the doctrine ratchet (run LAST) | P3 | S-M | 051-059 | TODO |

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
