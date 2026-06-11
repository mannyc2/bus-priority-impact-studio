# 0011 - Deep / novel findings research mode

Date: 2026-05-30

## Status

**Proposed.** Specifies a "deep mode" for the codemode findings agent that targets
**novel, research-grade findings** rather than grounded restatements of
pre-computed signals, orchestrated as a Ralph-style iteration loop. Nothing here is
built — this ADR is the target to agree on before code. It does not supersede the
existing grounded-proposal mode (ADR 0010), which stays for coverage.

## Post-refactor note (2026-05-31)

Re-audited against the 2026-05-30 analytics refactor
(`knowledge/wiki/engineering/analytics_architecture.md`). This ADR's mechanics are
updated by ADR 0013 — the agent now works through `ts_exec` with read-only access
to raw corpus files and selected `@bp/analytics` / `@bp/domain` package entry
points. Two clarifications: (1) the refactor enumerates the
pre-computed feature grains, which **sharpens G2** ("non-restatement") — "directly
readable from a single artifact field" now includes the registry's declared feature
grains, giving G2 a concrete field list to reject lookups against. (2) This loop is
the substrate that **ADR 0012 forks** into detector mode (`findings:ralph` →
`detectors:ralph`); the `.ralph/` mount, loop-until-dry, and re-exec gate described
here are reused there verbatim.

## Context

The codemode findings agent (ADR 0010) proposes candidate findings; every proposal
passes deterministic validation + human review. Two live
`findings:agent-propose --enable-codemode` runs on B44 (2026-03, DeepSeek) exposed
a structural problem:

- **`deepseek-chat`** restated three pre-computed `signal-features` fields
  (`contextTouchedEventCount=3866`, `contextHighConfidenceTouchCount=9`,
  `routeWeightedAverageSpeedMph=7.45`) as a "finding," cited `signal_feature` refs,
  and passed validation. Valid, but zero new information.
- **`deepseek-v4-flash`** investigated deeper (used the `route_slices` raw accessor
  for segment speeds, compared across routes, checked weather), found B44 already
  had two promoted findings, and correctly **declined** (`confidence: insufficient`).

Neither cited a `code_execution` ref, so the re-execution determinism gate never
fired. The agent never needed the raw accessors (`raw`/`route_slices`/`catalog`)
because the incentives never sent it there.

**Diagnosis — the incentive gradient runs downhill to restatement.** Three forces
in the system prompt (`_runner.ts` `SYSTEM_PROMPT_CODEMODE` + `COMMON_RULES`) and
validation:

1. "Only reference evidence in the corpus block" + metricClaim field-exactness →
   the cheapest valid claim is a `signal_feature` lookup. A *new* fact requires a
   `code_execution` ref — the one evidence kind that is higher-risk (must be
   deterministic; stdout-hash must match at re-execution).
2. The mandated 6–8 tool-call budget caps depth below what
   hypothesis → raw → quantify → corroborate needs.
3. The per-route `RouteContextDigest` in the user message spoon-feeds pre-computed
   signals; the cross-route, temporal, and cross-source patterns where novelty
   lives are not reachable from a single-route digest.

This is the risk `knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md`
names as cases 2–3 (the algorithm did not look for the pattern; the evidence was
not joined). Novelty lives precisely in the raw corpus the pipeline did **not**
pre-aggregate — exactly what the TypeScript sandbox can inspect from the raw
corpus mounts and analytics helpers.

For orchestration we reviewed the **Ralph** pattern (`rahulmutt/pi-ralph`, an
extension of the same pi agent-framework family our harness's `pi-agent-core` /
`pi-ai` come from): loop one prompt across *fresh* sessions and carry state in a
persistent summary file, instead of one long context-accumulating run. That maps
onto the novelty problem — a running summary becomes cross-iteration novelty
memory, fresh sessions sidestep drift/compaction, and "loop-until-dry" is a natural
stop for an unknown number of findings.

## Decision (proposed)

A **deep mode** variant of the codemode loop — same TypeScript sandbox, submit
tool, and re-exec gate — that changes the incentive gradient with deterministic
gates (no LLM critic; consistent with `project_defer_agent_critic`, "deterministic
floor first").

### Operational definitions

- **Novel** — the headline quantitative content is **not** directly readable from a
  single existing artifact field (signal-features, promoted-findings,
  context-appendix, review-packets). It is either (a) computed over raw data, or
  (b) a synthesis of ≥2 independent sources that no single field expresses.
  Restating `contextTouchedEventCount` / `hotspotCount` /
  `routeWeightedAverageSpeedMph`, or pointing at a promoted finding, is **not** novel.
- **Deep** — supported by a research process: hypothesis → raw evidence →
  quantification → corroboration → mechanism, with ≥1 reproducible `code_execution`
  ref and ≥1 cross-source corroboration or explicit counter-check.

### Deterministic gates (added to validation)

- **G1 — Computed evidence.** A `qualified_claim` in {reliability, speed,
  intervention, context} must carry ≥1 `code_execution` ref whose `citedValuePath`
  supplies a number used in `claimText`. (`data_quality` is exempt — it cites
  artifact gaps.) Forces depth, makes novelty verifiable, and exercises the re-exec
  gate that both pilot runs skipped.
- **G2 — Non-restatement.** Reject if every metricClaim value equals a single
  `signal_feature` field for the same route/window (i.e. reconstructable by lookup).
  Require a code_execution-derived metric OR ≥2 distinct evidence-ref kinds across
  ≥2 sources.
- **G3 — Corroboration.** A `qualified_claim` cites ≥1 corroborating ref of a
  different kind, or a non-empty `counterEvidenceRefs` documenting a null/contrary
  check.
- **G4 — Anti-decline (deep mode only).** "Already covered by a promoted finding"
  triggers a *deeper* search, not a decline; the `blocked`/`insufficient` easy-out
  is replaced by "report the hypotheses ruled out and the raw analysis run."

G1–G3 are pure structural checks on the proposal (deterministic). Cited code still
re-executes and stdout-hashes via the existing machinery (`_code_execution.ts`).

### Scope, budget, workflow

- **Scope** — the agent picks scope (route / segment / corridor / system) by where
  the pattern lives; a run can target a corridor or the system, not just one route.
  The digest becomes *orientation* (what's available + pointers), not the full
  pre-computed signal block.
- **Budget** — raise investigation calls to ~25–40 **per iteration** and
  `maxWallTime` accordingly (a `--deep` flag), and pin GPT-5.5 through Pioneer for
  the current refactor runs.
- **Workflow (prompt)** — hypothesis → pull raw corpus files or analytics helpers
  in `ts_exec` → quantify (`code_execution`) → seek a 2nd corroborating source →
  dedup-check vs promoted findings → state mechanism **observationally**
  (COMMON_RULES' causal and policy bans stay) → submit.

### Orchestration — Ralph-style iteration loop

Rather than one long deep run, **loop K fresh iterations** and let a persistent
summary carry novelty memory between them. Each iteration is a *fresh*
`harness.prompt()` session (no context accumulation, no compaction, full budget),
told to (1) read `.ralph/RALPH.md` + the validated findings ledger, (2) pursue one
hypothesis not already covered, (3) update `.ralph/RALPH.md`, (4) submit.

- **The agent owns `.ralph/`.** A single writable host bind-mount
  (`data/working/ralph/<runId>/` → `/work/.ralph:rw`, size-capped) holds the running
  summary and derived scratch. Because each tool call is its own `--rm` container,
  this bind-mount is what makes files persist both *within* an iteration (write in
  call 1, read in call 5) and *across* iterations — delivering the persistent
  workspace **without** a long-lived kernel. Corpus mounts stay `:ro`.
- **The validated submit artifacts are the authoritative novelty ledger.** They
  already pass G1–G4. `.ralph/RALPH.md` is the agent's *fast working memory* on top,
  not the source of truth — so a hallucinated "already checked X" in the summary
  can't silently corrupt the loop. Each iteration reads both: trust the ledger,
  treat the notes as hints.
- **Stop on loop-until-dry.** End after K consecutive iterations that add no new
  validated finding (configurable; plus a hard iteration cap). Right stop for
  unknown-size discovery — "how many novel findings exist?" isn't known up front.
- **The orchestrator stays non-LLM.** Branch session → send prompt → check the
  ledger delta → repeat. No per-iteration distill/merge model call — that is the
  cost saving, on top of derived-scratch reuse across iterations.
- **Determinism.** Validation re-execution containers do **not** mount `.ralph/`;
  cited `code_execution` reads only the `:ro` corpus, so re-exec stays reproducible.
  The determinism lint rejects `.ralph` reads in cited code.

### Evaluation (acceptance criteria)

A deep-mode run works when accepted findings show: ≥1 `code_execution` ref (gate
fires); a headline number absent from signal-features (novelty); ≥2 corroborating
sources or an explicit counter-check; and spot-review judges the finding
non-obvious. A/B against the current grounded mode on a route sample.

## Alternatives considered

- **Tune-and-test now, no spec.** Rejected for this step — agree the target first
  before spending model budget.
- **Separate deep-research harness** (fan-out hypotheses → verify → synthesize, like
  the `deep-research` skill). Better fit for cross-route synthesis; bigger build.
  **Deferred to Phase 3** — prove the gated loop can do it first.
- **LLM novelty critic.** Rejected for now — build the deterministic floor (G1–G3)
  before any model-judged novelty (`project_defer_agent_critic`).
- **Replace grounded mode.** Rejected — grounded restatement still serves *coverage*
  (surfacing what the signals already say). Deep mode is a **separate mode**.
- **Orchestrator-owned summary (LLM distill pass per iteration).** Rejected — a
  separate summarize/merge model call each iteration is pure added cost. The agent
  maintains its own working summary inline (non-LLM orchestrator), while the
  *authoritative* novelty memory stays the gated submit artifacts — so we get the
  cost saving without the integrity cost of fully agent-owned memory.
- **Persistent sandbox kernel (long-lived container) for cross-call state.**
  Superseded for the memory use case by the `.ralph/` host bind-mount, which gives
  cross-call and cross-iteration persistence without a long-lived process.

## Consequences

### Positive

- Forces raw corpus and analytics-kernel inspection into use; exercises the re-exec determinism gate
  end-to-end; makes "novel" a checkable property, not a vibe.
- Honest non-findings become research-backed ("here's what I ruled out") rather than
  bare declines.
- **Non-LLM orchestrator + persisted scratch cut cost** on multi-iteration runs (no
  per-iteration distill pass; derived slices reused across iterations).
- The `.ralph/` host mount delivers a persistent workspace **without** the deferred
  persistent-kernel (#7).

### Negative / risks

- **Cost/latency** — ~25–40 calls × (container + LLM) per iteration × K iterations.
  Bounded by loop-until-dry + a hard cap; deep mode is opt-in and model-pinned.
- **Over-rejection** — G2 may reject true-but-simple findings; mitigated by keeping
  grounded mode for those.
- **Self-poisoning memory** — the agent-owned `.ralph/RALPH.md` can claim "already
  checked X" when it didn't, and the error compounds across iterations; mitigated by
  making the validated submit artifacts the authoritative ledger (notes are hints).
- **Writable host mount** — a runaway loop could fill disk or write junk; mitigated
  by a per-run dir + size cap, non-root, `--network=none`, `--cap-drop=ALL`, and
  corpus mounts staying `:ro`.
- **Determinism** — code over raw must sort-before-slice (the corpus-navigation
  SKILL covers this); cited code may not read `.ralph/`. The re-exec gate enforces.
- **Mechanism hallucination** — "observational only" must hold; causal/policy
  language is already banned in COMMON_RULES — keep and lean on it.

### Phasing

1. Single deep iteration: deep prompt + raised budget + **G1** → measure novelty +
   gate firing.
2. **G2 / G3** + agent-chosen scope.
3. Ralph outer loop: `.ralph/` host mount, agent-owned summary, validated-ledger
   novelty memory, loop-until-dry. (Folds in the persistent-workspace work;
   supersedes the #7 kernel for memory.)
4. Research-harness fan-out (parallel hypotheses per iteration) only if cross-route
   synthesis demands it.

## Open questions

- Per-iteration scope granularity — one hypothesis, or one route, per iteration?
- What must `.ralph/RALPH.md` record for cross-iteration dedup to actually work —
  explored scopes, ruled-out hypotheses, the ledger delta?
- How is the authoritative ledger fed back into the next iteration's prompt — the
  full finding list, or a compact "already-covered" index?
- Loop-until-dry K and the hard iteration cap.
- Where does corridor/system scope get its candidate set — a corridor registry, or
  agent-chosen from `network` / `lion-centerline`?
- Does G1's "number in claimText ↔ `code_execution` `citedValuePath`" mapping need a
  new validation primitive, or does the existing metricClaim resolver cover it?
- Minimum bar for G3 — one cross-source ref, or a quantified second source?
