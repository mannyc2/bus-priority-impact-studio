# Hard Cutover: De-month the Public Contract (execution plan)

**For:** the maintainer and implementing agents. Produced 2026-06-10; every current-state claim
verified against the working tree on that date.

**What this is:** the slice-level execution plan for the **hard cutover** decided in
`docs/research/frontend-goal-data-serving.md` §16-D1 ("hard cutover, in-place schema migration"),
implementing §7 of that plan (the contract reshape) under the doctrine of
`docs/decisions/0017-mixed-freshness-publication-model.md`. It also records, in §0, how all the
active planning documents relate — because that map did not exist anywhere.

---

## 0. How the planning documents fit together

```text
ADR-0017  Mixed-freshness publication model          ← doctrine ("the product is not a monthly release")
ADR-0018  Detector calibration/readiness loop        ← doctrine (calibration contract)
│
└── docs/research/master-plan-product-questions.md   ← THE UMBRELLA (Tracks A–G, milestones M0–M6)
    ├── Track A  Data substrate                      — planned inside the master plan itself
    ├── Track B  Detector trust floor
    │     = docs/research/backend-goal-finish-detectors.md
    │       (successor to backend-goal-seam-calibration.md: its Phase A landed 2026-06-10;
    │        its Phase B continues as finish-detectors Phase 3 waves)
    ├── Track C  Study engine                        — planned inside the master plan itself
    ├── Track D  Tier 2 / mta-wiki integration       — planned inside the master plan itself
    ├── Tracks E+F  Serving read models + authoring
    │     consumer side = docs/research/frontend-goal-data-serving.md
    │       (route-detail redesign, detector-shaped UI, maps, contract reshape)
    └── Track G  Synthesis artifacts                 — planned inside the master plan itself

THIS DOCUMENT = the execution plan for frontend-goal §7 (contract reshape),
the first dependency of everything else in the frontend goal.
```

Status of each document:

| Document | Status |
|---|---|
| `backend-goal-seam-calibration.md` | **Superseded** by `backend-goal-finish-detectors.md` (Phase A landed; Phase B absorbed into its Phase 3 waves). Banner added 2026-06-10. |
| `backend-goal-finish-detectors.md` | **Active** — Track B. Phase 3 Wave 1 now has initial calibration machinery for observed_reliability, headway_reliability_ewt, bunching_hotspots, and delay_concentration; rider_weighted resolved early as coverage-blocked, matching its own Open Decision 3 recommendation. |
| `master-plan-product-questions.md` | **Active** — the umbrella. Nothing in it is invalidated by this plan. |
| `frontend-goal-data-serving.md` | **Active** — Tracks E/F consumer side. This document executes its §7. |
| `analytics-architecture-research-request.md`, `public-engagement-questions-research-request.md` | Research inputs, referenced by the plans above; not work plans. |

Where the current working-tree slices fit: the uncommitted/recently-committed calibration slices on
`codex/reviewable-current-worktree-slices` are Track B Phase 3 Wave 1 work. The Wave 1 machinery
floor is now complete; `travel_time_variability` and `schedule_mismatch` remain Wave 2 work.

## 1. What "remove the monthly release" means — and what it does not

ADR-0017 retires *"the product is a monthly release"* as doctrine. It does **not** retire months.
Be precise about the boundary, because over-rotating would break the pipeline's review model:

Maintainer clarification, 2026-06-12: the desired public contract is multi-year by default. A
baseline month may anchor provenance, review, and promotion, but route/detail/search/compare
surfaces should not be shaped as "the latest month plus decorations" when multi-year source
coverage exists.

**Removed by this cutover (public contract + UI):**

- The implicit binding of route detail, findings, compare, and search to
  `env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH`
  (`packages/studio-api/src/studio/read-handlers.ts:665`, `:1435`).
- Month-snapshot response shapes as the *only* shape (8 of 11 public read models today).
- `generatedAt` (pipeline run time) as a user-facing data label
  (e.g. `apps/web/src/components/route/DataNotesSection.tsx:66`); replaced by `dataAsOf` +
  freshness per block.
- The single freshness clock: a route page must be able to show a March-2026 baseline, a
  2023→2026 history series, and a fresher current signal simultaneously, each labeled.

**Explicitly kept (per ADR-0017 and Track B):**

- Monthly **source grains** (Socrata segment speeds, BWA, ridership) and monthly ingest cadence.
- **Release-keyed detector output**: detectors still emit baseline-month candidates as the
  actionable review unit; calibration artifacts stay keyed by release month.
- The deliberate **publication/promotion gate** (`publish:serving-release --execute`).
- `baselineMonth` as **pipeline/provenance metadata** — it survives in projection manifests and
  data notes provenance, never as the page's organizing principle.

## 2. Ground truth (verified 2026-06-10)

- `route_capability_manifest` does not exist anywhere (grep: zero hits in domain/web/studio-api).
- The orphaned substrate to evolve into it exists: `supportLevel` + `surfaceFlags` in
  `packages/domain/src/studio/snapshots.ts:117-118`, populated per route in read-handlers, with
  **zero consumers** in `apps/web`.
- Month-binding live at `read-handlers.ts:665` and `:1435`; `baselineMonth` threads through the
  route index and detail payloads.
- Series-shaped already: route history, speed history, projection-ref metadata. Everything else
  is single-month.
- Detector readiness manifest → route insights wiring exists and is the model to follow
  (readiness manifest read from R2, projected through `@bp/domain`, boundary-tested).
- Available manifest inputs **today**: detector-readiness serving manifest, speed-history
  coverage index (385 routes, `series_ready` flags), D1 `route_month_source_status`. Available
  **later**: Track B S2.4 materialization-coverage artifact, Track D Tier 2 coverage states —
  the manifest schema must accept inputs being added without reshaping.

## 3. Cutover slices

Rule for every slice (frontend §16-D1): **schema + handler + UI migrate together, in place; the
old shape is deleted in the same slice; fixtures regenerated.** No additive v2 endpoints, no
compatibility shims.

- **C0. Stabilize the ground.** Land/commit the in-flight Track B working-tree slices (they touch
  `studio-api`/`apps/web` files this cutover will rewrite — `route-detail.tsx`,
  `read-handlers.ts` are modified in the current tree). Wire `check-bundle-budget.ts` into the
  build so it fails over budget (frontend §11-P0) — the cutover churns exactly the chunks the
  budget watches.
  *Verify:* clean `git status` on the touched packages; budget gate red on a deliberate overage,
  green on current build.

- **C1. `route_capability_manifest` (frontend §7.1).** Evolve `supportLevel` + `surfaceFlags`
  into one consumed contract in `@bp/domain`: per surface — state
  (`ready / partial / building / insufficient_data / checked_clean / not_applicable / blocked`),
  reason, depth (months covered, grains), `dataAsOf`, freshness. Built by the pipeline as a
  projection (not computed in the Worker), from the inputs available today (§2); schema leaves
  room for S2.4 and Tier 2 coverage to plug in later. Delete the orphaned flags in the same
  slice — the manifest replaces them.
  *Verify:* domain schema + fixtures; manifest rows asserted for three contrast routes (flagged /
  clean / sparse); studio-api handler test; production-boundaries harness.

- **C2. Route dossier response (frontend §7.2).** Replace the month-bound route-detail payload
  in place: identity + capability manifest + per-section **series-shaped** summaries (history
  sparkline vectors, current value + 6-month movement + peer percentile, worst segment with
  persistence, treatment posture, latest events, insight refs, map artifact refs). One Tier-1
  fetch renders a meaningful page; heavy artifacts stay lazy. The handler resolves history
  windows internally; `env.BASELINE_MONTH` disappears from the detail path. ≤ ~60 KB gz asserted
  in a test. UI consumes the new shape in the same slice (existing tabs re-pointed; the §4
  redesign is *not* this slice).
  *Verify:* studio-api fixture tests; payload-size test; `bun --filter @bp/web build` + budget
  gate; the route page renders for the three contrast routes.

- **C3. De-month the network surfaces (frontend §7.3).** Sections/`/routes` rows carry 6-month
  movement + 12-month context (§16-D3 baseline); search, compare, and findings responses declare
  `dataAsOf`; the `env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH` fallback chain moves behind
  a single internal resolver in the pipeline-built projections, and the env vars stop shaping
  public responses. `baselineMonth` survives only inside projection/provenance metadata.
  *Verify:* studio-api tests; grep shows no `BASELINE_MONTH` reads in public response
  construction; sections rows show movement fields in fixtures.

- **C4. Freshness doctrine (frontend §7.4).** One shared component renders `dataAsOf` +
  freshness state everywhere a data block appears; remove `generatedAt` from all user-facing
  labels (it remains in artifact metadata).
  *Verify:* `grep -rn "generatedAt" apps/web/src` shows no render-path hits; component fixture;
  visual QA pass on route detail + data notes.

- **C5 (boundary marker, not this plan).** The §8.1 manifest-driven section/tab registry and the
  §4 route-detail redesign consume C1–C4. They follow the design-handoff cycle (frontend §4.4)
  and are tracked in the frontend goal, not here. This plan is **done** when the contract is
  de-monthed; the page redesign starts from that floor.

## 4. What this cutover does not touch

- Detector calibration (Track B) — release-month keying of detector runs, gold sets, readiness
  artifacts is correct per ADR-0017 and continues unchanged in parallel.
- The D1/R2 export pipeline's month-keyed build units and the publish gate.
- The maps program (frontend §6) — independent until §6.2 needs C3's lens data; §6.1 can start
  any time.
- Authoring/Track F, Tier 2/Track D, study engine/Track C.

## 5. Cross-track dependencies and recommended global sequencing

- **C1 is the first consumer-side slice of the whole frontend goal** — everything in §4/§5/§8 of
  the frontend plan waits on it. It does not wait on Track B waves: surfaces whose detectors are
  uncalibrated render `building`/`insufficient_data`, which is the honest state by design.
- **Track B continues in parallel** (different packages; only the readiness-manifest *consumer*
  side overlaps, and C1 reads the manifest as-is). Each newly calibrated family upgrades manifest
  states with zero contract change.
- **Track B S2.4** (materialization-coverage artifact) is the biggest later input to manifest
  honesty for stop-hour surfaces — when it lands, add it as a manifest input in a small slice.
- Recommended order of all in-flight work: C0 → (C1–C4 sequential) ∥ Track B reviewed-label
  collection for Wave 1 ∥ frontend §6.1 map design handoff. After C4: §8.1 registry, then the
  §4 redesign on the flagship-10 routes.

## 6. Risks

- **Hard cutover means breakage is loud.** In-place migration with fixtures regenerated per
  slice — a missed consumer fails at build/test, which is the intent. The mitigation is slice
  smallness, not shims.
- **Worktree collision (real, present).** `read-handlers.ts`, `route-detail.tsx`, and domain
  snapshot types are modified in the current uncommitted tree. C0 is mandatory, not hygiene.
- **Payload creep.** Series vectors per section can blow the 60 KB dossier budget — decimate
  sparkline vectors (monthly points, not cells) and keep cell-grain data in lazy Tier-2 artifacts.
- **Manifest state inflation.** Seven states is already a vocabulary; resist per-surface bespoke
  states. New needs become *reasons*, not new states.

## 7. Open decisions folded in from the frontend goal

- **O3 (KPI set) blocks C2's schema freeze.** The dossier summary fields exist to feed the §4.1
  header KPIs (Condition / Trend / Reliability / Riders / Treatment posture). Confirm the five
  before C2 lands; recommendation: accept as specified.
  **Decided 2026-06-10 (maintainer): approved — C2 is unblocked.**
- **O1 (basemap hosting)** and **O2 (design-handoff scope)** do not block this plan.

## 8. Verification defaults

Global defaults from `backend-goal-finish-detectors.md` apply (scoped `check:types` per package —
repo-wide OOMs; `bun --filter <package> test`; production-boundaries harness on import changes;
`git diff --check`; knowledge log/index upkeep). Additions: every C-slice runs
`bun --filter @bp/web build` with the budget gate, and C2+ assert payload-size budgets in tests.
