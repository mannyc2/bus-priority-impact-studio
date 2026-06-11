# Research Request: Where to start refactoring `@bp/analytics` into an actually-good analytics layer

**Audience:** an external architecture researcher (human or model).
**Deliverable we want from you:** the *minimum viable* "where to start" — the smallest first move that makes our analytics layer genuinely useful in practice — plus a recommended target architecture for the one seam that is currently broken. Be opinionated and be willing to tell us the existing plan is wrong.

**What is attached:** the full source of `packages/analytics` (the `analytics/` folder in this bundle), minus `node_modules` and build output. No data artifacts are included. You do **not** have the other packages; the contracts you need from them are quoted inline below.

---

## 1. TL;DR

We have a pure, deterministic TypeScript "analytics kernel" (`@bp/analytics`). In isolation it is clean: typed, tested, no I/O. But in the running system the analytics are weak, and we've traced that to **how the kernel is (not) consumed**, not to the detector math inside it.

We are **not** asking you to redesign detector science or thresholds. We are asking: *what is the smallest architectural change that turns this kernel from "a tidy bag of pure functions nobody can easily run" into "the obvious, well-shaped library that the rest of the pipeline builds on"?*

There is an existing, ambitious internal plan for this (summarized in §6). It has partially stalled. Treat it as a hypothesis to critique, not a spec to implement.

---

## 2. What the project is

**Bus Priority Impact Studio** — a public-data research product about **New York City MTA bus reliability**. It ingests open transit data, computes per-route/per-month reliability, speed, and intervention "findings," routes them through human review, and serves reviewed, provenance-rich results to a public web app. It is also a software-engineering portfolio piece, so the architecture is meant to read as a *serious research product*, not a notebook.

The unit of analysis is a **route × direction × month** (sometimes finer: route × timepoint-segment × daypart, or stop × direction × hour). Everything is monthly-cadence batch compute; nothing heavy runs in the public request path.

## 3. What `@bp/analytics` is

The **pure analytical kernel**. Its only job: turn already-typed feature rows into reusable, deterministic analytical instruments — baselines, detectors, scores, evidence payloads, coverage rows, calibration math. It performs **zero I/O**: no filesystem, no database, no network, no LLM calls. Its only runtime dependency is `@bp/domain` (shared Zod schemas / branded types).

Internal layers (all exported as explicit subpaths):

| Layer | Role |
|---|---|
| `core/` | Detector building blocks: the `AnalyticsDetector` contract, coverage/evidence builders, `stableId`, number + severity helpers. |
| `baselines/` | Pure stats: distribution/quantile, peer medians, robust z (MAD, Theil–Sen), headway EWT/CoV/LOS, runtime deviation, intervention-window deltas, context correlation. |
| `features/` | Typed **feature contracts** + grain definitions + key builders. Declares *what inputs* a detector needs. |
| `detectors/` (impl in `findings/`) | 18 deterministic detectors. Each takes a typed input and returns `{candidates, evidence, coverage}`. |
| `registry/` | Binds detector IDs → implementations, with metadata (claim tier, baseline families, promotion gates, retirement) and specs. |
| `calibration/` + `evaluation/` | Pure scoring/eval primitives: gold-set eval, precision/recall, reviewer-feedback summaries, bootstrap CIs, detector scorecards. |

The detector contract (`src/core/detector.ts`), quoted so you don't need `@bp/domain`:

```ts
type AnalyticsDetector<TInput> = {
  detectorId: DetectorId;
  version: string;
  spec: FindingDetectorSpec;
  featureGrains: readonly string[];   // e.g. ["segment_daypart"]
  scope: { kind: "route" | "segment" | "corridor" | "system"; description: string };
  run(input: TInput): DetectorOutput;
};

type DetectorOutput = {
  candidates: FindingCandidate[];      // the finding
  evidence:   FindingEvidenceLink[];   // primary/context/counter-evidence/caveat refs
  coverage:   FindingCoverageAudit[];  // per-scope outcome: hit | clean_no_hit | skipped_* | source_lag
};
```

The 18 detector IDs: `source_gap`, `persistent_speed_hotspot`, `speed_pace_hotspot`, `multi_month_speed_peer`, `observed_reliability`, `headway_reliability_ewt`, `bunching_hotspots`, `rider_weighted_excess_wait`, `travel_time_variability`, `schedule_mismatch`, `degradation_trend`, `positive_deviance`, `intervention_gap`, `intervention_event_study`, `intervention_underperformance`, `permit_correlated_slowdown`, `service_request_context`, `delay_concentration`.

The feature grains detectors declare: `route_month`, `segment_daypart`, `stop_direction_hour`, `route_direction_daypart`, `route_metric_history`, `route_segment_month`, `intervention_panel`, `rider_weighted_excess_wait`, `positive_deviance`, `feed_health`, `source_coverage`.

**A key design fact:** the `coverage` array is mandatory and as important as the candidates. The product rule is "silence must be auditable" — for every scope a detector considered, it must emit a row saying it `hit`, was `clean_no_hit`, or was `skipped_*` for a named reason. So "no findings" is never silent.

## 4. How it is *used* (the data flow)

```
packages/sources        external open-data clients (Socrata / MTA feeds)
  → tools/pipeline-v2    CLI: ingest, build local SQLite tables, write artifacts, publish
  → packages/applied-research   resolve feature rows from SQLite, RUN detectors, build study artifacts
  → packages/analytics   (pure kernel — runs here, fed by applied-research)
  → packages/db          serving projections (Cloudflare D1 / R2)
  → apps/web             public site (reads projections only; never imports analytics)
```

Because the kernel is pure, **something else must materialize feature rows from the corpus and call the detectors.** That "something" is the seam this request is about.

## 5. The data the analytics work with

This is the substrate you are designing for. It is **uneven, sparse, and multi-source** — coverage gaps are a first-class concern, not an edge case.

**Cadence / scale:** monthly snapshots, ~300+ bus routes, multi-year history (≈2023–present). The "release month" (what the public site shows) is deliberately separated from the larger "historical learning window" used for baselines/calibration.

**Source domains** (each is a real open dataset behind `packages/sources`):

- **Route segment speeds** (primary signal) — average speed on timepoint-to-timepoint segments, by month, direction, and hour/daypart.
- **GTFS static schedules** + **GTFS-Realtime** — scheduled trips/timepoints and observed vehicle positions → observed headways, bunching, long gaps, excess wait time (EWT).
- **Ridership / stop boardings** (APC) — hourly ridership used to rider-weight impact.
- **Interventions** — ACE automated camera enforcement, NYC DOT bus lanes, and a Tier-2 policy-document corpus, assembled into treated/control "intervention comparison" panels with implementation dates.
- **Context events** — street/parking permits, 311 service requests, parking violations, DOT traffic speeds — joined to routes as associational context (never auto-causal).
- **Equity** — census/ACS overlays.

**The local tables analytics inputs are resolved from** (SQLite, built by the pipeline; named so you can see the grains):
`local_route_segment_speed`, `local_route_segment_speed_history`, `local_route_schedule_stop`, `local_route_schedule_timepoint`, `local_observed_headway_sample`, `local_route_observed_reliability_summary`, `local_route_hourly_ridership`, `local_route_month_trend`, `local_route_intervention_comparison`, `local_context_event_route_touch`, `local_route_catalog`, plus geometry (`local_lion_segment`, `local_route_shape_geom`).

**Properties that matter for the architecture:**
- Different detectors need different grains; not every route/month has every input.
- Coverage and freshness vary by source; "skipped for missing input" is a normal, frequent outcome that must be recorded.
- Everything must stay reproducible from versioned inputs (deterministic run IDs, snapshot hashes).

## 6. The actual problem (validated against the code)

We profiled the three layers (LOC excluding tests):

| Layer | LOC | Files |
|---|---:|---:|
| `tools/pipeline-v2/src` | **116,467** | 263 |
| `packages/analytics/src` | 13,332 | 81 |
| `packages/applied-research/src` | 5,782 | 30 |

Three structural findings, each verified:

1. **The orchestrator is a monolith.** `pipeline-v2` is ~9× the kernel and ~20× the research layer. The real data-preparation and feature-materialization logic lives there, in CLI commands.

2. **`applied-research` is hollow at the core.** It was designed to be the "run studies over the corpus" engine sitting between the kernel and the pipeline. But its conceptual core — the `core/` (study/ports), `causal/`, `forecasting/`, and `artifacts/` subpaths — has **zero importers anywhere**. Only a few utility subpaths (`score-vectors`, `feature-resolvers`, `evaluation`, `review-packets`, `detector-runs`, `local-db`) are consumed, and *only* by `pipeline-v2`.

3. **The kernel is not served as a good library.** `pipeline-v2` imports `@bp/analytics` and `@bp/analytics/registry` **directly**, in parallel with `applied-research` — it does not go *through* the research layer to reach detectors. And critically: the kernel declares *what features a detector needs* (`featureContractsForGrains`) but exposes **no resolver interface and no end-to-end runner**. So the "detector needs grain X" → "here is how grain X is materialized from the corpus" contract is **hand-rolled**: in `applied-research/src/detector-runs/run-artifact.ts`, a function `detectorFeatureContractSatisfaction` is a large `if/else` mapping each grain to a prose string (`"Resolved from local_route_segment_speed…"`) with a fall-through `"unsupported"` branch. The integration contract is maintained by hand, per detector, instead of by the library.

**Synthesis:** this is a *seam that was designed but never made load-bearing.* Because the logic and the kernel→data wiring both live in `pipeline-v2` (1), the research layer never got a real job (2), and because the research layer never became the canonical consumer, there was never pressure to shape the kernel as a clean library for it (3). The three reinforce each other. The result: detectors look starved/empty not because the math is wrong, but because feeding them real data is awkward, partial, and duplicated.

> There are two internal wiki docs — `analytics_architecture.md` and `applied_research_architecture.md` — that lay out an ambitious 7-phase target (a full feature store, causal-inference subsystem, forecasting subsystem, a 1000-point research scoring rubric). Much of the *kernel* refactor in the first doc landed; the *cross-package seam and the research engine* in the second largely did not. **We suspect the plan was too ambitious to ever become load-bearing.** Please critique this, don't assume it.

## 7. Constraints (hard, non-negotiable)

- **TypeScript only.** No Python, no pandas, no Postgres/PostGIS, no new runtime or VPS. (The kernel must stay dependency-light: it also has to be compatible with a Cloudflare Workers serving path downstream.)
- The kernel stays **pure**: no filesystem, DB, network, LLM, or CLI code in `@bp/analytics`.
- Shared contracts/types that cross package boundaries live in `@bp/domain`.
- Deterministic + **fixture-testable without opening a database**.
- `apps/web` must never import `@bp/analytics` or `@bp/applied-research`.
- Bias to **small, verifiable diffs**. We value an architecture that can be adopted in slices over a grand rewrite.

## 8. What we want from you

Please deliver, in roughly this order:

1. **A blunt critique** of the current layering and of the stalled plan in §6. If the right move is to *delete* the unused `causal`/`forecasting`/study scaffolding rather than finish it, say so.

2. **The minimum viable "where to start"** — the single smallest first slice that makes the kernel actually useful and starts unwinding the seam. We want one concrete first step with a rationale, not a roadmap. (Our instinct: define the missing **feature-resolution / detector-runner contract** so "run detector X for month M against source S" is a library call instead of pipeline glue — but tell us if that's wrong or premature.)

3. **A target architecture for that seam.** Concretely:
   - Where should the line sit between `@bp/analytics` (pure) and `@bp/applied-research` (corpus-bound)? Should the kernel define a `FeatureResolver` *port* (interface) while resolvers that touch SQLite live in the research layer?
   - What is the smallest "runner" abstraction that replaces the hand-rolled `if/else` grain-satisfaction map?
   - Should `pipeline-v2` be forbidden from importing `@bp/analytics/registry` directly, routing everything through the research layer? What enforces that?
   - Where do feature *contracts* belong — kernel, domain, or research layer — given they're the handshake between "need" and "supply"?

4. **A migration sequence** in slices, each with a stated verification (e.g. "detector fixture outputs unchanged"), ordered so the first slice is low-risk and self-proving.

5. **Explicit non-goals / things to resist**, so we don't gold-plate.

Keep the recommendation proportional to a single-maintainer portfolio project: the goal is "credibly well-architected and genuinely usable," not "models a research lab."

## 9. Orientation inside the attached `analytics/` source

- `package.json` — the export surface (subpaths) and the `@bp/domain`-only dependency.
- `src/core/detector.ts` — the detector contract (the seam's kernel-side anchor).
- `src/registry/detectors.ts`, `src/registry/specs.ts` — how detectors are registered and specced.
- `src/features/contracts.ts` + `src/features/*.ts` — feature grains and the *need* side of the contract.
- `src/findings/*.ts` — the 18 detector implementations (input shapes vary; this is itself a symptom).
- `README.md` — the package's own summary.

The hand-rolled satisfaction map we call out in §6 lives in a *different* package (`applied-research`) and is quoted there; it is not in this bundle, but it is the thing your seam design must replace.
