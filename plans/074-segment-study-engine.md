# Plan 074: Segment-grain study engine v1 — matched-control before/after with CIs, gates, and honest nulls

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- tools/pipeline-v2/src/lib packages/domain/src/studio tools/pipeline-v2/src/commands`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Plan status**: IN PROGRESS (the manifest-pinned rc26 receipt and
  deterministic seven-study run are complete; execution is stopped at the
  fresh rc26 anchor sanity check before Plan 075 activation or publication)
- **Priority**: P1 (core of the business-problem arc)
- **Effort**: L
- **Risk**: MED (new numeric machinery destined for public claims — mitigated by synthetic-fixture tests with known answers, gates, and an operator-review STOP before anything ships)
- **Depends on**: plans/073-intervention-corpus-serving.md for documentation
  serving only (its reviewed corpus is not a causal-date input),
  plans/068-verification-baseline.md, and
  plans/078-canonical-map-segment-identity.md (the only allowed cross-month
  segment spine/crosswalk), plus the manifest-v5 Tracker half of exact-route
  task `019f7640-fd5c-7be2-8a40-a7c264284c0f` before any future run
- **Category**: direction
- **Planned at**: commit `cd878f7`, 2026-07-09

### Binding rc19 candidate amendment — 2026-07-14

The five-study run and its receipt remain immutable historical outputs bound
to `candidate-set:49af8c8721457fa7532a7345`. The corrected rc19 build creates
the distinct `candidate-set-v2:24080902f508b55a0033df32` with 489 rows,
approval state `awaiting_approval`, and zero approved rows. It neither reopens
the 398 historical rejections nor authorizes another study run.

The non-authorizing rc19 review recommends 16 approvals and 473 rejections.
Before any new study can run, the operator must issue a complete receipt bound
to that exact candidate-set ID, candidate SHA-256
`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`,
and recorded input hashes (or provide candidate-level overrides with
rationale). Estimator, sample/control, pre-trend, placebo, sensitivity,
claim-tier, run, and publication gates remain independently binding. See
`docs/research/mta-wiki-rc19-plan-rebaseline.md`.

### Binding rc22 contract amendment — 2026-07-17

The manifest-v4/occurrence-v2 replay preserves all 489 candidate identities,
but the 100 Wiki-bound rows acquire new release, relationship-proof, phase,
physical-scope, and route-record provenance. They therefore form the distinct
`candidate-set-v3:9761a5648df08fbdf6c38bb4` (SHA-256
`25d1fa96f8796f053c538631fbce19aa3b77fb1435e5b357c50eec2f94bf6129`).
The rc19 review cannot be rebound implicitly.

The exact rc22 release is inspection-only because review-decisions-v1 emits
one v2-only `physical_scope` role. Its candidate artifact is
`blocked_contract_incompatible`, with null approval and zero approved events.
No receipt or study run is allowed until a corrected named Wiki release passes
the ordinary strict contract path and a fresh complete candidate-set receipt
is issued.

Before any later run, also close two independent engine boundaries found by
adversarial review: control eligibility must exclude real rejected/unreviewed
interventions as well as approved events, and bounded treatments must never
fall back automatically to all route spines without an explicit
physical-scope/claim-tier gate. Neither issue changes the immutable historical
five-study run. Full evidence and operator guidance are in
`docs/research/mta-wiki-rc22-migration-report.md`.

### Binding rc23 compatibility amendment — 2026-07-18

The corrected rc23 release passes Tracker's ordinary strict-compatible path,
including canonical phase/physical audit pins. It changes no candidate
identity, occurrence, route projection, outcome window, spine classification,
or confounder group. The 100 Wiki-bound rows nevertheless acquire corrected
release provenance and therefore form the new
`candidate-set-v3:aba25fe4209247be31d43b66` (artifact SHA-256
`60422e951226b97abe40ae3705469084c5134488e666084284771e1b60ab22b5`).
The set is `awaiting_approval`, has no receipt, and contains zero approved
events. Release compatibility or an operator `LATEST` promotion does not
authorize a Plan 074 run.

Before any later run, the control universe must exclude evidence-backed real
interventions even when their candidate is rejected or unreviewed. Approval
governs treated-study execution; it does not make an otherwise real
intervention safe as a control. Bounded treatments also require exact
occurrence→geometry→spine binding. Unresolved/ambiguous scope fails admission,
and an empty physical-scope array is never route-wide. All-route spines are
allowed only when the evidence explicitly establishes a route-wide treatment.
The historical five-study run remains immutable. See
`docs/research/mta-wiki-rc23-migration-report.md`.

### Binding exact-route quarantine amendment — 2026-07-18

The rc23 statements above are historical contract-compatibility findings,
not authority for a future run. The later exact-route audit proved that
rc23's projection collapses exact services (including B44/B44+) and the
active MTA Wiki Plan 035 program quarantines that release without mutation.
Therefore `candidate-set-v3:aba25fe4209247be31d43b66` is permanently
non-authorizing for any new Plan 074 execution, even if it later receives a
receipt; do not repair, rebind, or reuse it.

The external exact-route task `019f7640-fd5c-7be2-8a40-a7c264284c0f` has now
satisfied the consumer prerequisite: Tracker PRs #65/#66 merged manifest-v5
support and green B44/B44+ identity/evidence fixtures, and the pinned v1-rc24
replay passed. Before any new run, use that strict path to produce a wholly
new candidate set and hashes, close the control-contamination and bounded-
scope defects, and obtain a fresh complete receipt for that exact set. No
rc19/rc22/rc23 recommendation, decision, or approval is carried forward. The
immutable historical five-study output remains only a historical artifact and
is not regenerated by this amendment.

### Binding rc25 readiness amendment — 2026-07-20

MTA Wiki `v1-rc25` satisfies the manifest-v5 exact-route prerequisite. Two
independent strict imports and two database-backed candidate builds were
byte-identical. The authorizable, still-unapproved result is
`candidate-set-v3:575ee30a44f2e141e97f6a77`, candidate artifact SHA-256
`b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195`.
It contains 486 candidates, zero approved events, 382 retained source
rejections, zero conflicts, and 12 exact deduplications. No historical receipt
or recommendation transfers to this set; the operator must decide all 486
rows and validate a new v3 receipt before `study run` can execute.

The two independent engine defects are closed. Control screening now excludes
every real candidate route within the inclusive ±9-month interference window,
regardless of its operator decision. Treatment scope now fails closed:
all-route spines require affirmative `mta_ace_routes` route-wide provenance,
while a bounded treatment requires a candidate-set-, release-, source-snapshot-,
geometry-, and speed-spine-bound exact mapping. The automatic lane-to-all-route
fallback is retired.

The sole rc25 physical scope, Flatbush phase 1 from Livingston Street to State
Street, has an exact binding for B41 and B67. Five reviewed NYC DOT geometry
IDs resolve through the production overlap helper to exactly two current
source segments and two stable spine segments per route. B67 is
`series_ready_with_gaps`; B41 remains `needs_pattern_review`, so the binding
does not override its spine gate. The rc25 preflight finds 12 ACE candidates
that pass only the calendar-plus-spine structural checks; this makes the
original ten-study floor possible but does not guarantee it, because operator,
scope, sample/control, estimator, and claim-tier gates remain binding. Full
evidence is in `docs/research/mta-wiki-rc25-plan074-readiness.md`.

### Binding rc25 delegated-review and run amendment — 2026-07-21

The owner explicitly delegated all 486 candidate decisions to three disjoint
Codex review shards. Deterministic reconciliation proved exact unique coverage
and produced a v3 receipt with six approvals and 480 rejections. The production
strict merge accepted the receipt and reproduced its approved event set
byte-for-byte.

Every approved event-route pair produced one study: BX28, M79+, B82+, BX38,
M96, and BX9. The complete run has two gated estimates, four descriptive
comparisons, four `no_detectable_change` results, zero ineligible studies, and
zero scope fallbacks. A same-root repeat reproduced all 13 JSON outputs
byte-for-byte. The earlier ≥10 row-count floor is replaced by the already
recorded rule that every approved event-route pair must be studied; this run is
complete at 6/6 without readmitting rejected candidates.

Both Flatbush projections remain rejected. B41 fails the spine gate and has
unresolved phase/onset identity. B67 passes exact scope, spine, and calendar
checks, but September is installation commencement rather than a clean opening
and conflicts with the nearby 2025-10-02 B67 lane onset. The fresh anchor
handoff is `docs/research/reviews/rc25/anchors-report.md`. Plan 075 remains
inactive pending an operator `approve`, `revise`, or `defer` decision.

### Binding rc26 Flatbush resumption amendment — 2026-07-21

The owner explicitly directed Plan 074 to use the reviewed Flatbush event-route
operational onset. MTA Wiki `v1-rc26` preserves occurrence
`occurrence:8c987704152b459014217d44` while proving that September 2025
installation preceded the 2025-10-02 operational opening on the same bounded
Livingston-to-State corridor. Tracker pins manifest SHA-256
`c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0`
and occurrence artifact SHA-256
`6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef`.

The deterministic candidate transition is narrow: rc26 contains every rc25
candidate except the two registry-only B41/B67 rows now exact-deduplicated into
the stable Wiki projections, and adds no candidate IDs. The reconciler proved
unchanged admission semantics before replaying 482 surviving non-Flatbush
decisions, then freshly rejected B41 for its independent
`needs_pattern_review` spine gate and approved B67 for estimator admission at
the corrected 2025-10-02 day onset. The resulting candidate set is
`candidate-set-v3:80050ed598f3b2ab0d0a1e99`; its complete receipt contains
seven approvals and 477 rejections.

Every approved event-route pair produced one study. The rc26 run has two gated
estimates, five descriptive comparisons, four `no_detectable_change` results,
zero ineligible studies, and zero lane/scope fallbacks. B67 uses exactly two
bounded stable spine segments and reports +0.139 mph all-day, but remains
descriptive because its placebo and minimum-sample gates fail. A same-root
repeat reproduced all 15 JSON outputs byte-for-byte. The fresh anchor handoff
is `docs/research/reviews/rc26/anchors-report.md`; Plan 075 and publication
remain inactive pending an operator `approve`, `revise`, or `defer` decision.

## Why this matters

The product is named Bus Priority **Impact** Studio, but impact is currently
estimated only at route×month grain with a single peer-adjusted delta and no
uncertainty. The repo's own umbrella plan
(`docs/research/master-plan-product-questions.md`, Track C) states the gap
plainly: effect sizes, CIs, and placebo computations are "computed nowhere in
the repo." This plan builds that engine: for each evaluable intervention,
a segment-grain difference-in-differences against matched control segments,
with bootstrap confidence intervals, pre-trend and placebo gates, explicit
confounder handling (congestion pricing, Queens redesign), and honest
"no detectable change" outputs. Everything runs offline in the pipeline and
writes artifacts (CLAUDE.md rule: no heavy analytics in the request path).
Plan 075 serves the results; nothing here touches the web app.

## Current state

- **Outcome data**: sqlite table `local_route_segment_speed` in
  `data/local/pipeline.sqlite` — grain route × segment(timepoint pair) × month
  × day-of-week × hour; fields include `average_road_speed_mph`,
  `bus_trip_count`, `direction`, `borough`, stop metadata; coverage
  **2023-04..2026-03**, ~385 routes, ~17.5M rows, indexed on
  (route_id, month). Schema source of truth:
  `packages/db/src/local/schema.ts` (grep `local_route_segment_speed`).
- **Existing route-grain machinery** (leave intact; reuse its vocabulary):
  `tools/pipeline-v2/src/lib/local-db-aggregates/route-intervention-evaluation.ts`.
  Verified excerpts — window construction (lines 610-616):

```ts
  const implementationIndex = monthIndex(input.event.implementationMonth);
  const analysisIndex = monthIndex(input.analysisMonth);
  const preMonths = monthWindow(implementationIndex - input.windowMonths, implementationIndex - 1);
  const postMonths = monthWindow(
    implementationIndex + 1,
    Math.min(implementationIndex + input.windowMonths, analysisIndex),
  );
```

  evaluation-level vocabulary (lines 649-656): `"peer_adjusted_before_after" |
  "descriptive_before_after" | "not_evaluated_future" | "insufficient_trend_data"`
  — extend this vocabulary, don't invent a parallel one. Helper conventions
  (lines 240-258): `weightedAverage(entries) -> number | null` (null on zero
  weight), `delta(post, pre) -> number | null`, `round(value, 4)`.
- **Event inputs**: the live registry (`local_intervention_event`,
  `packages/db/src/local/schema.ts:1244`) plus a manifest-pinned MTA Wiki
  operational-anchor release. Registry admission is an explicit allowlist:
  implemented `mta_ace_routes` and `nyc_dot_bus_lanes` rows only. The retired
  `tier2_document_operational_date_assertions` source, source-gap rows, and
  plan 073's documentation corpus are never causal-date inputs. The Wiki
  importer validates manifest/file hashes, contract versions, producer
  summaries, date semantics, scope/evidence/truth/authority gates, and retains
  every rejected assertion with reason codes. Step 1 merges only locally
  revalidated eligible Wiki assertions, then binds operator decisions to the
  complete combined candidate-set id.
- **Treatment→segment geometry**: bus-lane overlap machinery exists —
  `segmentLaneOverlapIndex` is exported from
  `tools/pipeline-v2/src/commands/studio/_release-geometry.ts` and consumed by
  `route-treatment-summary.ts` (verified import). Use it to scope treated
  segments for lane/busway treatments; ACE and route-wide treatments use all
  route segments.
- **Causal-gate vocabulary**: `grep -rn "intervention-gates" packages/ tools/`
  — a gate-status module exists from the detector era (gate flags without
  computations). Reuse its status names where they fit
  (preTrend/placebo/eligibility); if plan 061 already deleted it, define gate
  statuses fresh in the new domain schema.
- **Command conventions**: `defineCommand` descriptors in
  `tools/pipeline-v2/src/commands/<group>/<name>.ts`, discovered by glob, with
  a completeness test. Fixture tests under `tools/pipeline-v2/test/commands/`.
  Effect-4 runtime boundary helpers (see any command's
  `runLocalDbCommandBoundary` usage, e.g. `route-treatment-summary.ts:23`).
- **Confounder facts** (bake into constants with source comments; verify dates
  against `knowledge/` or operator before publishing): NYC congestion pricing
  began **2025-01-05** — any post window containing ≥2025-01 for a route
  touching Manhattan is contaminated for naive before/after; Queens bus
  network redesign phased in mid/late **2025** — Q-route segment identities
  and patterns shift. v1 handles both via gates + sensitivity re-runs, not via
  modeling.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Typecheck | `bun run check:types` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Import pinned Wiki dates | `bun run pipeline studio import-mta-wiki-operational-anchors --mta-wiki-root <path> --wiki-release <id> --wiki-manifest-sha256 <sha>` | writes strict assertions + rejection audit |
| Build approval candidate set | `bun run pipeline study merge-events --wiki-import <artifact>` | writes candidates with `approvedEvents: []` and `awaiting_approval` |
| Apply complete approval | `bun run pipeline study merge-events --wiki-import <artifact> --approval data/study-event-approvals/receipts/<receipt>.json` | writes only explicitly approved events |
| Run engine (once built) | `bun run pipeline study run --analysis-month 2026-03` | writes study artifacts + index |

## Scope

**In scope**:
- `tools/pipeline-v2/src/lib/study-engine/` (new: panel loader, matching, DiD, bootstrap, gates — pure functions, no I/O in the math modules)
- `tools/pipeline-v2/src/commands/study/` (new group: `run.ts`, optionally `merge-events.ts`)
- `packages/domain/src/studio/study.ts` (new artifact schema + keys, in the current `schema-compat` dialect matching `route-dossier.ts`)
- `tools/pipeline-v2/test/` (synthetic-fixture tests + command fixture test)
- A new local table ONLY if needed for the merged study-event set (prefer a JSON input artifact over a migration; if a table is unavoidable, follow `packages/db` drizzle-migration conventions)

**Out of scope** (do NOT touch):
- `route-intervention-evaluation.ts` and its `local_route_intervention_comparison` outputs — the route-grain path keeps serving today's comparison cards until 075 switches sources.
- `apps/web/**` and `packages/studio-api/**` — no serving changes here.
- Ridership as an OUTCOME (exposure weighting only) — fare-system confounds are out of scope for v1.
- Any wording that asserts causation — artifacts carry effects + gates + tiers, never causal language (ADR-0018 discipline).

## Method spec (v1 — implement exactly; deviations are STOP conditions)

1. **Unit**: one study per (event, route). Event = implementation month +
   treatment family + optional lane-overlap segment set.
2. **Panel**: segment s is plan 078's `spineSegmentId`, never a month-specific
   source/detail key or array position. Only `series_ready` and explicitly
   gap-aware `series_ready_with_gaps` routes enter segment study estimation;
   `needs_pattern_review` is ineligible with a counted reason. Per s and month
   m in [impl−6 … impl+6] (clamped to
   2023-04..analysis month), outcome Y(s,m) = trip-weighted mean of
   `average_road_speed_mph` across day-of-week × hour cells; weight W(s,m) =
   total `bus_trip_count`. Also compute a peak-hours variant (hours 7-10 and
   16-19) — stored alongside, same machinery.
3. **Windows**: pre = impl−6..impl−1, post = impl+1..impl+6 (implementation
   month excluded). Require ≥4 non-null months per side per segment; segments
   failing this drop with a counted reason.
4. **Treated set**: lane/busway events → current segments in
   `segmentLaneOverlapIndex` for the route, then map them through plan 078's
   exact current→spine crosswalk; other treatments → all exactly mapped route
   spines. Record which. Unmatched segments drop with a reason; ambiguity is a
   hard STOP, never a fuzzy/positional join.
5. **Controls**: candidate segments from same-borough routes with NO event of
   any family within ±9 months of impl (screen via the merged event set). Per
   treated segment, match k=4 candidates nearest in pre-window mean speed
   within ±20%; a treated segment with <2 matches drops (counted). If total
   candidate pool <20 segments → `controlEligibility` gate fails (study still
   computes, tier capped at descriptive).
6. **Effect (DiD)**: per treated segment,
   d(s) = [postMean(s) − preMean(s)] − [postMean(ctrl(s)) − preMean(ctrl(s))]
   with all means trip-weighted (`weightedAverage` semantics: null-safe, null
   on zero weight). Study effect = weight-averaged d(s) over treated segments
   (weights = pre-window trip counts). Report in mph and as % of pre mean.
7. **CI**: block bootstrap over treated segments (resample segments with
   replacement, carrying each segment's matched controls), B=1000, percentile
   2.5/97.5. Seeded PRNG (implement mulberry32 or equivalent; seed = hash of
   eventId) so runs are reproducible byte-for-byte.
8. **Gates** (each: pass | fail | not_applicable, with a one-line reason):
   - `preTrend`: slope of monthly treated-minus-control mean diff over the pre
     window (least squares); fail if |slope|×6 > max(0.5×|effect|, 0.25 mph).
   - `placeboInTime`: re-run the full estimator with impl shifted −12 months
     (only when data allows); fail if |placebo effect| > CI half-width.
   - `minSample`: ≥5 treated segments and ≥4 months per side survived.
   - `congestionPricingOverlap`: fail(=flag) if post window includes ≥2025-01
     and the route's borough set includes Manhattan; when flagged, also run a
     sensitivity estimate excluding months ≥2025-01 and store both.
   - `redesignOverlap`: flag if routeId starts with "Q" and any window month is
     in 2025-06..2025-12; sensitivity = exclude those months.
9. **Tiering** (extends the existing vocabulary): all gates pass →
   `"segment_matched_did"`; any informational flag → same tier + flags; hard
   failures (minSample, controlEligibility) → `"descriptive_before_after"`.
   The artifact's `claimTier` is `"gated_estimate" | "descriptive"` — never a
   causal assertion. A CI covering 0 is a first-class result:
   `direction: "no_detectable_change"`.
10. **Outputs**: per study `studio/v2/studies/{eventKey}.json` — effect, CI,
    per-window means, monthly event-time series (treated vs control mean, for
    075's chart), gate table, treated/control segment counts + drop reasons,
    sensitivity estimates, provenance (event source: registry | mta_wiki,
    including operational-change/anchor ids and pinned release hashes; data
    window; engine version; seed). Plus
    `studio/v2/studies/index.json` (one row per study: route, treatment,
    month, effect, CI, tier, direction) AND per-route rollups
    `studio/v2/routes/{routeSlug}/studies.json` (full study payloads for that
    route, ≤20 per route — plan 075 loads these from the route detail page).
    Schema caps: index ≤ 500 rows.

## Steps

### Step 1: Merge the study-event set

Command `study merge-events`: input = every `local_intervention_event` row plus
the strict artifact from `studio import-mta-wiki-operational-anchors`.
`--wiki-import <path>` is required. Omitting Wiki input is a hard error unless
the operator records the exceptional `--without-wiki-anchors` opt-out; the
command rejects supplying both. Candidate construction then:

1. admits only implemented rows from the two trusted registry source ids;
2. independently recomputes Wiki causal eligibility and never upgrades a
   producer/importer-ineligible assertion;
3. exact-deduplicates route + treatment family + precision + date while
   retaining all provenance;
4. quarantines differing dates within one Wiki `operationalChangeId`;
5. marks non-identical cross-source dates in the same month for operator
   resolution; and
6. writes no `approvedEvents` until `--approval <path>` supplies exactly one
   reviewed decision for every candidate, bound to the current
   `candidateSetId`. At most one date in a same-month conflict may be approved.

The output is a deterministic JSON artifact, not a DB write. `study run` must
consume `approvedEvents`, never the ungated `candidates` list. The reviewed
plan 073 corpus remains fully served as documentation and is deliberately
decoupled from this path.

**Implementation progress (2026-07-12)**: the strict Wiki importer and trusted
registry + pinned Wiki candidate construction are implemented. The latest
clean immutable release `v2-operational-anchors-1` combines 401 trusted registry candidates with 2
supported Wiki candidates into 403 candidates bound to
`candidate-set:49af8c8721457fa7532a7345`. The completed receipt contains 403
unique decisions: 5 approved exact-route ACE onsets and 398 conservative
rejections. The strict merge writes only those five events with state
`approved`. The generator changes are committed at
`d28b64c8`, and an independent clean-worktree cut reproduced manifest SHA-256
`b69bd9458a92a817c329cfaa2741ef93dece4d2bbdb4695ea775b09622f5c56c`
byte-for-byte. The candidate-set-bound receipt and exhaustive review report are
stored under `data/study-event-approvals/`.

**Verify**: fixtures cover trusted/untrusted registry rows, missing Wiki input,
producer/importer ineligibility, exact cross-source deduplication, same-month
review, within-Wiki date conflicts, stale/partial approval rejection, and
byte-deterministic input ordering.

### Step 2: Panel loader

`lib/study-engine/panel.ts`: given (routeId, months, hoursFilter?), load
segment×month aggregates from `local_route_segment_speed` via the existing
local-db access patterns (`grep -rn "local_route_segment_speed" tools/pipeline-v2/src/lib/`
and reuse the query helpers you find; do NOT hand-roll new sqlite plumbing if a
listing helper exists). Pure aggregation math in a separate module with unit
tests (trip-weighted means; ≥4-month rule).

**Verify**: unit tests with a 3-segment synthetic fixture; a real-DB smoke run
for one route (e.g. M15+) returns >0 segments and plausible speeds (4-15 mph).

### Step 3: Matching, DiD, bootstrap, gates

`lib/study-engine/{matching,did,bootstrap,gates}.ts` implementing the method
spec §5-§9. All pure; every exported function unit-tested.

**Verify** (the load-bearing tests — synthetic panels with KNOWN answers):
- Injected effect: generate a null panel (common month effects + segment
  intercepts + seeded noise σ=0.4 mph), add δ=+1.0 mph to treated segments
  post-window → recovered effect within [0.6, 1.4]; CI excludes 0; repeat for
  3 seeds.
- Null: δ=0 → CI covers 0 and `direction === "no_detectable_change"`.
- Pre-trend trap: add a +0.15 mph/month trend to treated only → `preTrend`
  gate fails.
- Placebo: with 24 months of synthetic history, placeboInTime passes on clean
  data and fails when a fake earlier shock is injected.
`bun --filter @bp/pipeline-v2 test` → all pass.

### Step 4: `study run` command + artifacts

Command `study run --analysis-month <YYYY-MM> [--event <eventKey>]`: iterate
the step-1 event set, build panels, run the engine, validate outputs against
the new `packages/domain/src/studio/study.ts` schemas, write per-study
artifacts, per-route rollups, and the index under the artifact root. Console summary: N studies, tier
histogram, direction histogram.

**Verify**: fixture-backed command test (2 synthetic events end-to-end);
`bun run check:types` exits 0; then a REAL run
`bun run pipeline study run --analysis-month 2026-03` completes and writes
≥10 studies (the ACE registry alone guarantees candidates).

**Execution evidence (2026-07-12)**: the approved real run completed with five
studies and five route rollups: three gated estimates, two descriptive
comparisons, four `no_detectable_change` results, zero ineligible studies, and
zero lane fallbacks. A second run reproduced every study, index, and rollup
byte-for-byte. The engine cannot truthfully write ten studies from five
approved event-route pairs; satisfying the original floor requires an operator
resolution, not admission of rejected candidates.

### Step 5: Anchor report, then STOP for operator review

Write `data/artifacts/studio/v2/studies/anchors-report.md`: for 3-5 studies of
well-publicized interventions (pick from ACE routes and any 14th-St-adjacent
in-window event), tabulate our effect+CI next to a `published_claim: TBD`
column, with instructions for the operator to fill from MTA/DOT publications.
**Then STOP and report** — publishing (075) must not proceed until the
operator has sanity-checked anchors and the candidate-set-bound approval
contents.

**Fresh review stop (2026-07-21)**:
`docs/research/reviews/rc26/anchors-report.md` contains all seven approved
studies, full gate caveats, reproducibility evidence, and `published_claim:
TBD` placeholders. Plan 075 remains inactive.

## Test plan

Summarized in steps 2-4: unit tests for every pure module; four
synthetic-panel integration tests with known answers (effect recovery, null,
pre-trend trap, placebo); one end-to-end command fixture test. Model test
structure on `tools/pipeline-v2/test/commands/export/route-dossier-summaries.test.ts`.

## Done criteria

- [x] `bun --filter @bp/pipeline-v2 test` exits 0, including the 4 synthetic known-answer tests
- [x] `bun run pipeline study run --analysis-month 2026-03` writes one study
  for every approved event-route pair (7/7), plus per-route rollups and an
  index that validate against `study.ts` schemas
- [x] Identical re-run produces byte-identical artifacts (seeded bootstrap)
- [x] At least one real study reports `no_detectable_change` OR the report explains why none did (suspicious otherwise — say so)
- [x] The fresh rc26 `anchors-report.md` exists; execution is STOPPED for
  operator review, and the plan remains IN PROGRESS only until that decision
- [x] `bun run check:types` exits 0; only in-scope files modified
- [x] `plans/README.md` status row updated (status: IN PROGRESS, with the
  remaining gates named explicitly)

## STOP conditions

- Plan 078 has not landed, a study panel uses raw month-specific segment IDs,
  or current treatment geometry cannot map unambiguously to the stable spine.
  Do not create a second study-only identity scheme.

- A bounded treatment lacks an exact, evidence-backed
  occurrence→geometry→stable-spine binding, or that binding is ambiguous.
  Fail admission and report the unresolved scope; never fall back to all-route
  segments. All-route spines are admissible only when the treatment evidence
  explicitly establishes route-wide scope. If the lane-overlap index is
  absent, incomplete, or maps fewer than half of bounded lane events, report
  coverage before proceeding and do not weaken this rule.
- Real-run effects are implausible (|effect| > 3 mph on >25% of studies) —
  report with 2 worked examples; do not tune thresholds to make results look
  better.
- `local_route_segment_speed` lacks an expected column or the ≥4-month rule
  eliminates >80% of segments network-wide — report coverage stats.
- Any pressure (from results) to soften gate thresholds mid-implementation —
  thresholds change only by operator decision, recorded here.

## Maintenance notes

- Engine version lives in every artifact; any method change bumps it and
  re-runs everything (artifacts are cheap, credibility isn't).
- Congestion-pricing/redesign constants are v1 flags; a real CBD geometry flag
  and month-fixed-effect modeling are the known v2 upgrades (master plan Track
  C lists them).
- Gen-7 066/067 will migrate `study.ts` off schema-compat with its siblings.
- Plan 075 consumes the index + per-route rollups and integrates them into the
  route History tab and /interventions (no standalone studies page — operator
  direction 2026-07-09); keep artifact shapes stable.
