# Implementation Plans

**Current generation: 3 (plans 019-029, below).** Generations 1-2 (001-018)
are complete or superseded; their sections are kept further down as history
and rationale. Each executor: read your plan fully before starting, honor
its STOP conditions, and update your row when done.

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
| 023 | Serve the grains we already build (hourly, DOW, reliability) | P2 | M | 019 | BLOCKED (STOP: largest per-route hourly artifact measured 223,434 bytes, above ~50 KB threshold) |
| 024 | Delete the Tier 2 document pipeline and stale doctrine | P2 | L | 019, 020 | BLOCKED (STOP: route sections still serve `studio/v2/tier2/vocab-materialized-views.json`) |
| 025 | Finish the supporting pages (home, interventions, methods) | P2 | M | 019, 022 | DONE (verified 2026-07-03; screenshots captured) |
| 026 | Worker on Effect HttpApi: spike ADR, then migrate | P2 | L | 019 (024 rec.) | TODO |
| 027 | Effect the pipeline seams: retries, concurrency, ingest | P3 | M | 019, 024 | TODO |
| 028 | MTA-wiki work orders (cross-repo; executed in mta-wiki) | P2 | M | — | ADOPTED (mta-wiki plan of record: `mta-wiki/docs/v1-release-plan.md`; execution pending there, starting with its Phase 0 baseline commit) |
| 029 | nyc-transit-kit: align the Effect pin, then adopt | P3 | M | 019, 027 rec. | TODO |

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

- **Effect Schema replacing zod in `packages/domain`/`packages/sources` for
  LOC reduction** — the "domain is ~70% LOC" premise is false: zod schema
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
