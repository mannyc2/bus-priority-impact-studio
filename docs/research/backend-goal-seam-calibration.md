# Backend Goal: Analytics seam + full detector calibration

> **Superseded 2026-06-10** by `docs/research/backend-goal-finish-detectors.md`. Phase A (seam)
> landed; Phase B (calibration) continues as that plan's Phase 3 waves. Kept for history; do not
> implement from this document. Plan hierarchy: `docs/research/hard-cutover-dossier-contract.md` §0.

**For:** an implementing agent. Self-contained — read this plus the two sibling research requests
(`docs/research/analytics-architecture-research-request.md`,
`docs/research/public-engagement-questions-research-request.md`) and the ADR
(`docs/decisions/0018-detector-calibration-readiness-loop.md`).

**Why this exists:** the prior goal "complete all detectors" finished shallowly — it aligned the 21
registry detectors to the Studio frontend insight contract but did **not** deepen the backend. Two
real frontiers remain, verified against the code:

- Only ~4 of 21 detectors have been through the ADR-0018 calibration loop (`speed_pace_hotspot`,
  `treatment_scope_gap`/`_mismatch`, `customer_journey`). The other ~17 are registered but not
  calibrated, suppress-leakage-tested, or promotion-gated.
- The kernel→data seam the architecture request §6 calls out is unaddressed:
  `detectorFeatureContractSatisfaction()` in
  `packages/applied-research/src/detector-runs/run-artifact.ts:98` is still a hand-rolled `if/else`
  grain→prose map with a fall-through `"unsupported"` branch (line 260). The kernel exposes no
  `FeatureResolver` port and no end-to-end runner.

**Hard constraints (from CLAUDE.md + §7 of the architecture request):** TypeScript only; no Python /
Postgres / PostGIS / new runtime. `@bp/analytics` stays pure (no fs/db/network/LLM/CLI). Cross-package
types live in `@bp/domain`. Deterministic + fixture-testable without opening a DB. `apps/web` never
imports `@bp/analytics` or `@bp/applied-research`. **Small, verifiable diffs — adopt in slices, no
grand rewrite.** Bias to the smallest change that proves itself.

**Dependency order:** Phase A unblocks Phase B (calibrating starved detectors before fixing how they're
fed is fighting the symptom).

---

## Phase A — Make the analytics seam load-bearing

Goal: turn the kernel from "pure functions nobody can easily run" into "the library applied-research
runs through," and delete the hand-rolled grain-satisfaction map. Keep the line at: **kernel defines a
`FeatureResolver` *port* (interface); resolvers that touch SQLite live in `@bp/applied-research`.**

- **A1. Define the `FeatureResolver` port + runner contract in the pure kernel.**
  In `@bp/analytics`, add a port: given a detector's declared `featureGrains`, a resolver supplies the
  typed feature rows for a `(month, scope)` and reports per-grain satisfaction (`resolved` /
  `satisfied_by_feature_quality` / `unsupported` + reason) as **data**, not prose. Add a thin runner
  that takes a detector + resolver + run context and returns `DetectorOutput` plus a structured
  satisfaction report. No I/O in the kernel — the port is an interface only.
  *Verify:* `bun --filter @bp/analytics test`; new fixture test runs a detector through the runner with
  an in-memory fake resolver and asserts output + satisfaction report shape.

- **A2. Implement the port in `@bp/applied-research` over the existing local-db readers.**
  Back the resolver with the current `local-db` / `feature-resolvers` code. One resolver, all grains it
  already supports.
  *Verify:* for every detector currently exercised, **fixture outputs unchanged** vs. pre-refactor
  (golden-file diff). This is the self-proving invariant for the whole phase.

- **A3. Replace `detectorFeatureContractSatisfaction()` with the runner's structured report.**
  Delete the `if/else` prose map in `run-artifact.ts`; derive `featureContracts` from the resolver's
  per-grain satisfaction data. Same emitted artifact fields, now library-produced.
  *Verify:* `bun --filter @bp/applied-research test`; run-artifact fixture output unchanged.

- **A4. Route `pipeline-v2` through the research-layer runner; stop importing
  `@bp/analytics/registry` directly.**
  Where `pipeline-v2` reaches detectors directly, go through `@bp/applied-research`. Add a lightweight
  enforcement (lint rule, import-boundary test, or the existing production-boundaries harness) so the
  direct import can't come back.
  *Verify:* boundary test fails on a direct `@bp/analytics/registry` import from `pipeline-v2`, passes
  after; one fixture-backed `findings` command still runs.

**Phase A non-goals (resist):** no feature *store*, no `causal`/`forecasting`/study scaffolding revival
(if those subpaths still have zero importers after A, recommend deleting them — don't finish them), no
1000-point scoring rubric, no new grains.

---

## Phase B — Run the ADR-0018 calibration loop across the remaining ~17 detectors

This is what "complete all detectors" should have meant. The infra exists and is the template:
`speed-pace-reviewed-gold.ts`, `speed-pace-review-queue.ts`, `treatment-scope-reviewed-gold.ts`,
`customer-journey-reviewed-gold.ts`, `detector-readiness-projection.ts`,
`detector-readiness-serving-manifest.ts` (all under `packages/applied-research/src/evaluation/`).

For **each** uncalibrated detector, repeat the loop (per ADR-0018):
1. **No-write inventory** — run the detector for the release month with `writeDb=false`; record
   emitted / skipped-by-reason / capped counts. Watch for biased samplers like the top-100 cap bug
   (global caps that skew emission by borough/route-prefix — see the 2026-06-08 log entry).
2. **Stratified review queue** — enrich + stratify into a reviewer-ready queue.
3. **Reviewed-gold labels** — stable package-owned labels (primary / route_context / reviewer_only /
   needs_more / suppress).
4. **Eval** — suppress-leakage = 0 and reviewed-primary survival reported; label-backed deterministic
   gates only (no provenance-ref gates — see the treatment-scope calibration note).
5. **Readiness projection + promotion gates** — terminal/low-obs/baseline/geometry gates +
   physical-node-pair dedupe where applicable; only promoted projections may reach serving.

Order the ~17 by serving priority (speed/reliability/rider-impact families first, since those feed the
highest-demand surfaces per the engagement request §5–6). Each detector is an independent, shippable
slice.

*Per-detector verify:* readiness artifact + audit/eval NOTE under
`data/artifacts/detector-calibration-<name>/`; focused analytics test in `r3-detectors.test.ts` (or
sibling) for any new gate; `bun --filter @bp/applied-research test`.

**Phase B non-goals:** don't relax detector `.max()` caps or thresholds to make numbers look better;
don't invent gates without gold-label backing; don't auto-promote — readiness only gates, a human
review still graduates.

---

## Global verification (CLAUDE.md defaults)

- Type changes: `bun run check:types` **scoped per-package** (repo-wide OOMs at default node heap; a
  clean-looking repo-wide run may have aborted — verify per package or raise `--max-old-space-size`).
- Package changes: `bun --filter <package> test`.
- Pipeline changes: `bun --filter @bp/pipeline test` + one fixture-backed command.
- `git diff --check` clean.
- Update `knowledge/index.md` + `knowledge/log.md` when durable decisions change (append-only log,
  `## [YYYY-MM-DD] type | title`).

## Suggested commit/PR slicing

Each lettered sub-step (A1–A4, each detector in B) is its own reviewable diff with its own passing
verification. Land A before B. Do not bundle the seam refactor and the calibration runs in one PR.
