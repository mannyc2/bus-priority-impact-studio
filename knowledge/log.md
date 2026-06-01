# Log

Append-only chronological log. Use the prefix format `## [YYYY-MM-DD] type | title`.

## [2026-06-01] engineering | Analysis dependency closure audit added

Added `audit detector-closure` as the first dependency-closure control plane for analysis units.
The artifact joins data-product completeness, detector readiness, corpus-grain audit status,
review-packet coverage, and detector-evaluation scorecards into one per-unit closure report. The
schema is generalized beyond detectors to include planned causal, forecasting, and response-drift
units, and intervention/event-study closure now explicitly depends on the Tier 2 structured
intervention extraction layer rather than OCR text coverage alone. Registered planned
applied-research product families remain blocked/planned until their builders and validation gates
exist. The shared applied-research score now includes mechanism corroboration, search preservation,
placebo strength, temporal transportability, and regime sensitivity dimensions.

## [2026-06-01] planning | Event-family response drift scoped

Extended the curb-pulse natural-experiment plan and applied-research architecture with a
portfolio-level study family for historical event/intervention response drift. This is the transit
analogue of an announcement-effect regime shift: the same class of street event, permit, weather
threshold, enforcement action, or agency intervention can change effect sign, magnitude, or marginal
value when the binding constraint changes. The docs now define `event-family-effect-panel` and
`event-family-response-drift-study` / `event-response-drift-study` artifacts, acceptance gates,
context-regime labels, representative-case requirements, and review-gated product language.

## [2026-06-01] planning | Natural-experiment probe requirements added

Extended `knowledge/wiki/engineering/curb_pulse_natural_experiment_plan.md` after synthetic design
probes covering film-production curb occupancy, industrial weather reversals, court-calendar
rideshare pulses, cruise-terminal staging, and commercial loading-dock timing. The plan now includes
hard case-study acceptance gates, source-readiness statuses, a generic external-event-window
interface, an estimand grammar requiring quantified effects and nulls, a narrative template, a
single-primary-visual contract, candidate-library/multiple-testing controls, and fixture guidance
for near misses and false positives. These probes remain synthetic requirements discovery, not
evidence about real routes.

## [2026-06-01] planning | Curb-pulse natural experiment direction

Added `knowledge/wiki/engineering/curb_pulse_natural_experiment_plan.md` as the planning base for
a richer applied-research product direction: segment/daypart travel-time pulses, event-window
overlap, official-intervention exclusion, heterogeneous event effects, 311/boarding/placebo
mechanism checks, and local case-study artifacts. The plan positions this as a deterministic
natural-experiment workbench under `packages/applied-research`, not a route-month detector, not a
transformer training task, and not a public finding source until manual and methodology review gates
exist.

## [2026-06-01] engineering | Lattice review bundle moved out of detector registry

Moved the lattice experiment out of the detector family and into a local analyst workbench. The
analytics registry no longer exposes `lattice_opportunity`, the domain detector/reason-code lists no
longer document lattice finding codes, and the pipeline-v2 command is now
`findings lattice-review-bundles`, writing `lattice-review-bundles.{json,md,html}` review artifacts
instead of finding candidates. The pure powerset-lattice helper remains available for local
experimentation and corpus audit, but the output is not a public detector, causal method, forecast,
or Studio finding source.

## [2026-06-01] pipeline | Lattice opportunity preview artifacts

Added a local-only `findings lattice-opportunities` pipeline-v2 command that reads March finding
review packets and route signal features, runs the experimental `lattice_opportunity` detector,
and writes JSON, Markdown, and static HTML previews under `data/artifacts/findings/{month}/`.
The preview is deliberately not wired into promotion, serving releases, D1, R2, or Studio; it is a
review surface for deciding whether the lattice archetypes are useful enough to tighten.

## [2026-06-01] engineering | Lattice opportunity detector added

Implemented `lattice_opportunity` as the first cross-signal MTA opportunity detector inspired by
Lattice Deduction Transformers. The analytics package now includes a pure powerset-lattice
deduction helper, an experimental route-level detector that narrows speed, reliability,
intervention, curb/enforcement, context, schedule, treatment, and positive-deviance signals into
bespoke opportunity archetypes, and fixture tests for enforcement-gap, context-timed street
management, reliability-dispatch, positive-deviance transfer, clean no-hit, and abstention cases.
The registry now has 19 detectors and the new detector remains associational and review-gated.

## [2026-06-01] engineering | Studio Think / Workers AI generation runner

Implemented the first real Cloudflare Think / Workers AI execution slice for Studio brief
authoring. `apps/web` now carries the Think/Agents/AI SDK/Workers AI provider dependencies, deploy
Wrangler configs bind Workers AI as `AI` and `BriefAuthorAgent` as a Durable Object, and
`POST .../draft/generate` records a queued D1 generation job plus agent run before signaling the
draft-scoped `BriefAuthorAgent` with `ctx.waitUntil`. The agent calls Workers AI through
`workers-ai-provider`, exposes the existing schema-validated `proposeBriefEdit` tool, stores valid
model output as a proposal, and leaves accepted draft content unchanged until human approval. The
Worker harness uses fake `AI` and author-agent bindings so CI stays local; missing production
bindings still return `not_configured`.

## [2026-06-01] engineering | Studio agent proposal-state backend slice

Implemented the proposal approval backend slice for proposal-first Studio authoring agents. Domain
contracts now cover agent run status, proposal status, structured edit operations, repair feedback,
provenance, accepted operation ids, draft version milestones, apply/reject responses, and restore
responses. D1 migrations/query helpers add `studio_brief_agent_run`,
`studio_brief_agent_proposal`, `studio_brief_draft_version`, and D1-backed version snapshots. The
Worker exposes `POST/GET .../draft/agent-runs*`,
`POST .../draft/agent-runs/{runId}/propose-edit`, `GET .../draft/proposals/{proposalId}`,
`POST .../draft/proposals/{proposalId}/apply`, `POST .../draft/proposals/{proposalId}/reject`,
`GET .../draft/versions`, and `POST .../draft/versions/{versionId}/restore`, all operator-scoped
and D1-backed. `propose-edit` validates structured output and leaves accepted content unchanged;
`apply` mutates accepted draft content only after approval, records accepted operation ids, stores a
snapshot, creates a draft-version milestone, and supports selected-operation acceptance. OpenAPI and
client helpers now list the new endpoints; Cloudflare Think/Workers AI execution remains unwired.

## [2026-06-01] planning | Studio agent edit approvals and versions

Added `docs/architecture/studio-agent-edit-approval-versioning.md` to define how AI agent edits
modify brief content. The model is proposal-first: explicit user triggers start scoped agent runs,
the agent writes structured change sets against a known draft version/hash, authors approve all or
selected operations, and approved changes create durable draft-version milestones. This preserves
the canonical undo/redo UX for live editing while adding restoreable versions at approval,
suggestion-acceptance, publish-candidate, and promotion-receipt boundaries. Cloudflare Think remains
the real-time agent runtime; its queue is enough for short async work, while Workflows are deferred
for future long-running post-approval or multi-system recovery flows. Clarified that normal
authoring approval is approval of the agent's proposed end result, not per-tool-call approval. The
first implementation should add an internal run/proposal state machine and a `proposeBriefEdit`
tool that validates structured operations, returns machine-readable repair feedback, and stores
only valid proposals for human approval.

Clarified the Cloudflare Agent state boundary in `docs/architecture/studio-agent-stack.md`: Agent
`setState`/SQLite is useful for live synchronized run UI, current step/progress summaries, and small
reconstructable caches, but D1/R2 remain authoritative for accepted draft content, proposals,
versions, review state, idempotency, publish candidates, and promotion receipts. The default v1
BriefAuthorAgent scope is `workspaceId + briefId`, with client-originated state updates treated as
untrusted UI signals rather than approval/apply commands.

## [2026-06-01] planning | Studio brief authoring UX canon

Added `docs/architecture/studio-brief-authoring-ux.md` as the product UX canon for Studio brief
authoring. The note consolidates the canonical design handoff, AI interaction doctrine, content
graph ADR, review-collaboration model, and current live-tree frontend/backend state. It defines the
authoring thesis: the composer, review surface, triage flow, and public reader are one
document-shaped workflow; evidence appears as real inline/embedded figures; AI works through typed
artifacts marked with `◆`; review pins to prose; undo/redo replaces autosave-history chrome; and
public promotion remains deliberate and offline.

## [2026-06-01] planning | Studio agent stack scoped

Added `docs/architecture/studio-agent-stack.md` to plan the production Studio authoring-agent
stack. The note records the live-tree gap that `draft/generate` still returns `not_configured`,
chooses Cloudflare Think as the production agent runtime, keeps D1/R2 as the source of truth for
draft/public brief state, scopes tools to the same operator permissions as the REST draft API, uses
Think/Sessions for chat memory rather than product state, and defers Cloudflare Codemode until
mid-layer evidence workflows need code-shaped multi-tool orchestration.

## [2026-06-01] planning | Context-event externality reversal archetype

Extended [[wiki/engineering/detector_corpus_grain_audit_plan|Detector Corpus Grain Audit Plan]] with
a generic context-event externality reversal finding archetype. The archetype describes detector
support for short episodic segment/stop performance pulses, misattribution guards against nearby
agency interventions, context-event overlap, network-vs-local sign reversal, mechanism evidence,
placebo/demand checks, and prospective falsification. It explicitly treats this as a multi-detector
packet, not a route-specific factual claim or a single monolithic detector.

## [2026-06-01] engineering | Detector corpus grain phase 0 implemented

Implemented `audit detector-corpus-grain` in pipeline-v2 and updated
[[wiki/engineering/detector_corpus_grain_audit_plan|Detector Corpus Grain Audit Plan]] from a plan
to a Phase 0 audit artifact. The command joins the analytics detector registry, data-product
manifest/completeness status, and local findings candidate/coverage counts, writing
`data/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.{json,md}` for the
March 2026 snapshot. The first run audits all 18 registered detectors, flags 5 detectors using the
high-risk `route_month` screening grain, and shows only 8 detectors currently have release-month
coverage rows, keeping product materialization distinct from detector execution.

## [2026-06-01] planning | Detector corpus grain audit plan

Added [[wiki/engineering/detector_corpus_grain_audit_plan|Detector Corpus Grain Audit Plan]] to
separate healthy detector optimization from lossy feature collapse. The plan makes the local
analytical corpus plus detector-native feature grains the target detector substrate, reclassifies
`RouteMonthSignalFeature` as screening/route-level context rather than the canonical detector
corpus, records current March/May grain-loss evidence from `data/local/pipeline.sqlite` and
findings artifacts, and phases the next work through registry-driven corpus-grain audits,
materialization coverage, v2 findings execution, false-negative shadow audits, and release gates.

## [2026-06-01] architecture | Studio review collaboration and promotion model scoped

Added `docs/architecture/studio-review-collaboration-and-promotion.md` to settle the next backend
slice after ADR 0014/0015. Review collaboration is draft-private D1 state: anchored threads,
replies, suggested edits, resolution, optional reviewer assignment, and review gates live under the
`.../draft/comments*` namespace rather than public `comments[]`. Public promotion remains an
offline pipeline mutation: the Worker validates and exports a self-contained publish candidate,
while `studio promote-publish-candidate` merges it into immutable `studio/v1` projections and
archives private review audit data without exposing it in the public brief response.

## [2026-06-01] architecture | Studio typed brief blocks backend landed

Extended the Studio brief-draft backend with the first ADR 0015 content-graph slice. Domain schemas
now define typed `BriefBlock` variants plus `BriefRef`; D1 has `studio_brief_draft_block`; `@bp/db/d1`
exports insert/update/delete helpers; and the Worker exposes idempotency-keyed
`POST/PATCH/DELETE /api/v1/studio/briefs/{briefId}/draft/blocks*` plus
`POST /api/v1/studio/briefs/{briefId}/draft/refs/resolve` for schema normalization. Operator draft
overlays and publish-candidate export include typed blocks when present. Still open: body markdown
storage, richer corpus-backed ref resolution / Send-to-brief attach, public projection backfill, and
renderer integration.

## [2026-05-31] architecture | Studio brief-draft Worker endpoints implemented

Accepted `docs/decisions/0014-brief-draft-live-write-serving.md` and implemented the backend
foundation for Studio brief-draft authoring without building the authoring UI/UX. The Worker now
routes `/api/v1/studio/briefs/{briefId}/draft*` to D1 draft helpers exported from `@bp/db/d1`,
enforces ADR 0008 operator sessions/scopes, requires `Idempotency-Key` on draft mutations, records
generation jobs without inline LLM inference, and overlays D1 `draftStatus`/`draftPublishedAt` onto
brief reads only for authorized operators in the draft workspace. OpenAPI, in-app docs endpoint
metadata, db/Worker tests, and the agent-author/wiki architecture pages were updated. Cloudflare
Think / Workers AI execution remains a future out-of-band runner; the current generation route
honestly returns `failed` / `not_configured` rather than pretending a runner exists.

## [2026-05-31] planning | Studio brief-draft authoring Worker plan

Added [[wiki/engineering/studio_brief_draft_authoring_worker_plan|Studio Brief-Draft Authoring
Worker Plan]] after live-tree verification of the draft client contract, domain schemas, D1 query
helpers, migrations, Worker auth helpers, OpenAPI surface, and Worker test pattern. The plan keeps
public Studio reads anonymous while treating `/api/v1/studio/briefs/{briefId}/draft*` as an
authenticated AI-backed authoring surface, gates mutations by `write:briefs`, `review:briefs`, and
`publish:briefs`, uses `Idempotency-Key` for draft writes, overlays D1 draft status onto the public
brief response only for authorized operators in the draft workspace, and records generation jobs
without inline LLM inference. Cloudflare Think remains the intended future out-of-band runner, but
the current tree has no Think, Workers AI, Durable Object, Queue, or worker-loader binding wired.

## [2026-05-31] web | Methods page folded into Docs

Retired the standalone `/methods` page and its tabbed, data-driven UI. The genuinely unique
content — the metric definitions and publication caveats — moved to a new prose docs page at
`/docs/methodology` (Resources section, between Data & Credits and Changelog). The dataset and
source content was already covered by `/docs/data-credits`, which now also carries a short
derived-artifacts note and a reciprocal cross-link. `/methods` now `beforeLoad`-redirects to
`/docs/methodology`; the two inbound "methodology" links (routes home, route detail) point at the
new URL directly. Dropped the `fetchStudioMethods` web loader and deleted
`apps/web/src/studio/pages/methods.tsx`. The server endpoint `GET /api/v1/studio/methods` and its
projection/test are left live but are now UI-unused (separate retirement if desired). Updated the
prescriptive `/methods` references in [[wiki/engineering/ui_copy_doctrine|UI copy doctrine]] to
`/docs/methodology`; other historical wiki plan/audit pages still mention `/methods` and can be
swept later — this entry is the record of the cutover.

## [2026-05-31] pipeline | Root checks retargeted to pipeline-v2

Started Workstream 5 drift cleanup by retargeting root check scripts away from deleted
`tools/pipeline/src/checks/*` paths. The production-boundary harness now asserts the canonical
`@bp/pipeline-v2` CLI wrapper and rejects stale root package script references to v1. The lightweight
knowledge and web release checks now live under `tools/pipeline-v2/src/checks/`, while
`check:web-architecture` runs the cross-cutting production-boundary harness directly.

## [2026-05-31] planning | Ambitious analytics workstream prompts

Added [[wiki/engineering/ambitious_analytics_workstreams|Ambitious Analytics Workstreams]] as the
coordination page for six high-value work areas that can proceed while the historical backfill
runs: registry-driven detector operation, Serving Snapshot 2.0, a data-product completeness
registry, detector quality/loss scoring, pipeline-v2/docs drift cleanup, and research-to-detector
hardening. The page includes a 0-1,000 weighted opportunity scoring model, parallelization guidance,
disjoint write-set cautions, copy-ready prompts for separate Codex sessions, and definitions of done.

## [2026-05-31] architecture | Codemode sandbox moved to Bun/TypeScript

Accepted `docs/decisions/0013-bun-typescript-codemode-sandbox.md`, superseding the
Python-only codemode ADR for new work. The active harness tools are now `ts_exec`
and `bash_exec`; `code_execution` refs accept TypeScript or deterministic bash;
the sandbox image carries Bun, `rg`, and `jq` instead of Python/pandas/duckdb; and
the runtime bind-mounts `packages/analytics` plus `packages/domain` read-only so
agent-authored computations use the same deterministic kernel as detector code.

Pioneer/GPT-5.5 is now the default findings codemode provider/model path, configured
by `PIONEER_API_KEY` with `https://api.pioneer.ai/v1` as the default OpenAI-compatible
base URL. The LLM remains an author/prototyper,
not a detector of record: validation re-runs cited TypeScript in a clean sandbox,
and analytics package code remains free of prompt, model, sandbox, filesystem, and
agent-loop dependencies.

## [2026-05-31] analysis | Ideal detector doctrine audit

Audited and revised [[wiki/analysis/ideal_detector_system|Ideal Detector System]] against the
2026-05-30 analytics refactor and ADR 0012. The page now treats `ANALYTICS_DETECTOR_REGISTRY` as
the governing detector object, updates current reality from the stale 8-detector March pass to the
18 registered-detector kernel, and adds explicit critique of the old doctrine: it underweighted
registry lifecycle, claim-tier gates, feature-grain silence, detector retirement, and the
LLM-as-author-but-not-detector boundary.

The revised doctrine now distinguishes `FindingDetectorSpec.allowedClaimStrength` from registry
`claimTier`, updates detector-family status for reliability, schedule, speed/pace, trends,
positive deviance, intervention event panels, and context association, and replaces the old
"first detector maturity slices" backlog with next steps for registry-first runs, fleet-scale
feature materialization coverage, calibration persistence, promotion/demotion hardening,
agent-assisted detector candidates, and evaluation against findings mode.

## [2026-05-31] pipeline | Finish incomplete analytics data runner

Started `data/ops/backfills/finish-incomplete-data-20260531T030000Z/run.sh` in the
`finish-incomplete-data` tmux session. The runner is resumable enough for the current gaps: it
fills the missing May 2025 hourly-ridership month, reruns route intervention comparisons for
2023-04 through 2026-03 using the March 2026 route universe/treatment inventory, builds
GTFS-backed stop-direction-hour EWT artifacts for all eligible March and May observed-headway
routes, resumes the 2025/2024/2023 Socrata route-schedule source staging, and finishes by
refreshing route-schedule, historical backfill, materialization, and corpus-profile audits.

`route intervention-evaluation` now accepts `--route-universe-year` and
`--route-universe-month`, so historical analysis months can use a known complete route/treatment
inventory while evaluating against each month's historical speed and ridership trend rows. This
prevents zero-row historical intervention months caused only by release-snapshot route metadata
being present for March 2026.

## [2026-05-31] planning | Re-audited ADR 0012 after the analytics refactor

Rewrote `docs/decisions/0012-agent-authored-detectors.md` as a registry-first,
agent-assisted detector-authoring plan. The old 0012 draft assumed 8 hand-authored
detectors, scattered detector logic, detached detector specs, no claim-tier metadata,
and a proposed `submit_detector -> {score, flagged, evidence}` shape. The current
analytics kernel has 18 registered detectors, a uniform `AnalyticsDetector<TInput>`
contract, generated detector-spec projections, registry metadata, calibration helpers,
and reviewer/retirement primitives.

The revised plan makes `ANALYTICS_DETECTOR_REGISTRY` canonical and treats Ralph/LLM
work as detector candidate authoring, not detector-of-record execution. Agents may
prototype procedures, draft specs, or open normal TypeScript patches; accepted detector
versions still require pure analytics code, tests, deterministic admission packets,
backtests, review outcomes, and human review. This explicitly reconciles 0012 with
`ideal_detector_system.md`: the LLM may author a frozen procedure, but the harness
computes metric values and review gates decide publication.

The new gates are A0-A8: boundary, contract, determinism/scope, non-degeneracy,
novelty for new detectors, claim-tier/promotion, evidence packet, domination for
improved versions, and lifecycle. Existing helpers are reused (`summarizeScoreVector`,
`flaggedSet`, `jaccardOverlap`, `evaluateGoldSet`, `evaluateRangePrecisionRecall`,
`summarizeReviewerDecisions`, `summarizeDetectorReviewCycle`,
`summarizeFalsePositiveRootCauses`, `recommendDetectorRetirement`,
`summarizeInterventionGates`). Real gaps are called out: Spearman/rank correlation,
score-vector spread statistics, pipeline-owned detector candidate capsules, admission
packet persistence, and backtested domination policy.

`docs/decisions/0011-deep-novel-findings-mode.md` also has a short post-refactor note:
its mechanics are unchanged, but registry feature grains sharpen the non-restatement
gate, and 0011's Ralph loop is the substrate that detector mode forks. Nothing built
yet; both ADRs remain Proposed.

## [2026-05-31] pipeline | GTFS static all-stop schedule staging

Added `ingest gtfs-static`, which parses the six downloaded bus GTFS static ZIPs into local
all-stop schedule tables: routes, trips, stops, calendars, calendar exceptions, and stop_times.
The staged run `20260531T010822Z` loaded 6 bundles, 386 GTFS routes, 13,478 stops, 184,044 trips,
104 services, and 5,946,147 stop_time rows.

Added `audit route-schedule-progress` so schedule backfills are inspectable without hand-written
SQL. The audit now reports that the Socrata 2026 schedule layer has 20,351,999 rows across 375
routes and is entirely timepoint-grain, while the GTFS static layer is the all-stop schedule source
for detector-grade EWT baselines.

The stop-direction-hour EWT artifact builder now has a source selector: `gtfs_static`,
`socrata_route_schedule`, `route_schedule_timepoint`, or `auto`. It prefers GTFS static when
available, falls back through the staged Socrata schedule layer and legacy route-slice timepoints,
and labels the selected source in every artifact. A real M15 May 2026 artifact using GTFS static
produced 440,022 scheduled stop arrivals, 8,727 schedule baseline cells, and 4,279 observed feature
rows at
`data/artifacts/analytics-stop-direction-hour-ewt/2026-05/bus-observatory-2026-05/m15/stop-direction-hour-ewt-features.json`.

Also repaired the noisy pipeline command discovery warnings by restoring the expected findings
exports and adding the missing `agentBriefProposalsDir` path helper.

Verification: focused GTFS static ingest, route-schedule audit, route-schedule ingest, and
stop-direction-hour EWT tests pass. Pipeline CLI help now loads without command-discovery skip
warnings. Full pipeline typecheck remains blocked by existing domain/studio export drift and the
pre-existing Ralph `ralphDir` tool-loop type mismatch.

## [2026-05-31] planning | Drizzle 1.0 RC modernization plan

Added [[wiki/engineering/drizzle_query_modernization_plan|Drizzle Query Modernization Plan]] after
auditing the current raw-SQL clusters and checking current Drizzle registry tags. The plan now
targets an intentional Drizzle 1.0 RC upgrade, removes `drizzle-zod` in favor of
`drizzle-orm/zod`, gates the migration-folder conversion on Wrangler D1 compatibility, mirrors
newer D1 write-side tables into `packages/db/src/d1/schema.ts`, and defines how the repo should use
core query builders, future RQB v2 relations, generated row validation, local repositories, and
raw-SQL exceptions.

## [2026-05-31] analytics | 36-month ABST baseline surface

Added the official MTA Bus Customer Journey-Focused Metrics source (`8mkn-d32t`) as the compact
route-month ABST baseline surface. ABST is schedule-relative and EWT-like, but it is an official
derived aggregate rather than a first-principles GTFS schedule feature. The new ingest command is
`tools/pipeline-v2/src/commands/ingest/bus-customer-journey-metrics.ts`; it stages
`local_bus_customer_journey_metric` and pulled 2023-04..2026-03 into the local corpus: 24,344 rows,
36 months, 356 routes.

The EWT score-vector builder now joins `local_route_observed_reliability_summary` to
`local_bus_customer_journey_metric` and prefers the customer-weighted
`additional_bus_stop_time` value as `mta_abst_customer_journey_metric`, with observed-regularity
excess wait retained only as fallback. It does not replace raw schedule-derived features for
stop-direction-hour EWT, schedule mismatch, headway regularity, or detector audit packets.
Regenerated March 2026 artifact:
11,937 usable route-month rows, 11,591 baseline rows, 346 release routes, 20 release flags, and
score-basis counts of 11,737 ABST rows plus 200 observed fallback rows.

Verification: focused analytics/pipeline tests pass for the pure artifact builder, SQLite-backed
artifact command, and customer-journey ingest command.

## [2026-05-31] analytics | Raw stop-hour EWT feature path

Added the first raw schedule-derived feature path for detector-grade EWT. The pure materializer
builds stop-direction-hour feature rows from raw `local_route_schedule_timepoint` arrivals plus
`local_observed_headway_sample`; the pipeline command is
`tools/pipeline-v2/src/commands/build/stop-direction-hour-ewt-features.ts`.

The feature builder computes scheduled buses/hour and scheduled headway baselines from schedule
timepoints, joins observed headways by route/direction/stop/day type/hour, and emits audit rows
with typed missing-data states such as `baseline_unavailable`, `insufficient_headways`, and
`low_coverage`. Historical artifacts default to `month_day_type_hour` aggregation; daily/live audit
runs can use `service_date_hour`.

Materialized a March 2026 M15 artifact from `bus-observatory-2026-03` at
`data/artifacts/analytics-stop-direction-hour-ewt/2026-03/bus-observatory-2026-03/m15/stop-direction-hour-ewt-features.json`.
That route slice produced 76,369 schedule timepoints, 10,738 observed headway samples, 1,753
schedule baselines, 3,657 feature rows, and explicit missing-data/audit rows. The low ready-cell
count is expected with the current timepoint-only schedule slice and confirms this does not replace
the broader raw schedule corpus.

Verification: focused feature-builder and SQLite-backed artifact tests pass.

## [2026-05-31] pipeline | Incomplete schedule corpus backfill started

Added `ingest route-schedules` as a resumable route-by-route Socrata schedule staging command for
the 2023-2026 MTA Bus Schedules sources. The command writes `local_route_schedule_stop` keyed by
source year and route, skips already staged routes by default, and keeps this high-volume IO inside
`tools/pipeline-v2` rather than `packages/analytics`.

Smoke-ingested 2026 M15: 167,005 rows fetched and 166,693 rows written. The smoke also confirmed
an important source limitation: the Socrata schedule source still appears to be timepoint-grain for
that route (25 distinct stops, all staged rows marked timepoint), so it is useful historical
schedule context but not a substitute for all-stop GTFS `stop_times`.

Started the background backfill runner at
`data/ops/backfills/incomplete-corpus-20260531T010822Z/run.sh`. It downloads the six current bus
GTFS static ZIPs, reruns the corrected intervention-comparison range for 2023-04..2026-03, and
then stages the 2026, 2025, 2024, and 2023 Socrata schedule sources with route-level resume/skip
semantics.

Verification: route-schedule ingest, raw stop-hour EWT feature, and SQLite-backed feature command
tests pass; the background runner passed shell syntax validation and is logging to
`data/ops/backfills/incomplete-corpus-20260531T010822Z/backfill.log`.

## [2026-05-30] analytics | EWT route-month score-vector artifact path

Started the first data-driven EWT calibration artifact path. The pure score-vector builder lives in
`packages/analytics/src/calibration/ewt-route-month-score-vectors.ts`; the pipeline IO wrapper is
`tools/pipeline-v2/src/commands/build/ewt-score-vectors.ts`; and the generated March 2026 artifact
is written to
`data/artifacts/analytics-ewt-score-vectors/2023-04_to_2026-03/2026-03/ewt-route-month-score-vectors.json`.

The run exposed an important corpus distinction: historical observed reliability summaries have
AWT and average observed headway for 36 months, but schedule-based EWT is only populated for the
release month because historical scheduled expected wait is not yet backfilled. The score-vector
therefore uses observed-regularity excess wait (`AWT - mean_observed_headway / 2`) for calibration
and preserves schedule-based EWT where present as evidence. March 2026 output: 13,716 raw rows,
11,937 usable route-month rows, 11,591 pre-release baseline rows, 35 baseline months, 346 release
routes, and 29 release routes above the fleet P90 cutoff.

Verification: the fixture tests for the pure analytics builder and SQLite-backed pipeline command
pass. Full package typecheck remains blocked by existing domain/studio export drift unrelated to
this artifact path.

## [2026-05-30] pipeline | codemode findings agent: Python sandbox + code_execution evidence refs

`findings:agent-propose` gains an opt-in codemode (`--enable-codemode true`) that hands the
model a `python_exec` + `bash_exec` tool pair backed by a read-only Docker sandbox. The agent
slices the corpus by writing code instead of relying on the prompt-sliced `RouteContextDigest`.
Code the agent cites is captured as a new `code_execution` `AgentFindingProposalEvidenceRef`
kind (language, code, stdoutHash, citedValuePath); validation re-executes the code in the same
sandbox and rejects the proposal if `sha256(stdout)` doesn't match the model-declared hash.
That hash check is the deterministic gate this feature exists for — it catches model drift,
non-reproducible scripts, and tampered hashes with the same machinery that catches them at
manual review time.

ADR 0010 (`docs/decisions/0010-python-in-sandbox.md`) gates Python to the sandbox image only.
`apps/web`, `packages/`, and the rest of `tools/` stay TypeScript-only — the boundary is the
Dockerfile and the `tools/agent-corpus-lib/` package (bp_corpus: routes/signals/findings
loaders, bind-mounted into the sandbox at `/work/agent-corpus-lib`). The sandbox image
(`tools/sandbox/Dockerfile`, built via `bun run sandbox:build`) is digest-pinned (python:3.12-slim),
hash-pins its pip deps (pandas + duckdb + pyarrow) via `requirements.txt` with `--require-hashes`,
ships ripgrep + jq, and runs as a non-root user under `--network=none --read-only --cap-drop=ALL`
with `--tmpfs` scratch and ulimit caps applied by `tools/pipeline-v2/src/lib/sandbox.ts`.

Tool loop is built on `@earendil-works/pi-agent-core@^0.78.0` (pi-ai bumped 0.75 → 0.78 in the
same commit; existing call sites unaffected). `_tool_loop.ts` registers `python_exec` and
`bash_exec` as `AgentTool`s with typebox parameter schemas, dispatches through `runAgentLoop`,
and enforces per-run caps (max tool calls, total stdout bytes, walltime) via `afterToolCall`
returning `terminate` hints plus an `AbortController` signal. The trace surfaces on
`RunProposalsResult.toolUseTrace`. `validateProposal` is now async — it pre-executes unique
code refs once per proposal and threads the cache through `ValidatorContext.codeExecutionCache`.

`knowledge/wiki/data/agent_corpus_map.md` is the navigation doc the CLI loads into the system
prompt when codemode is on; it documents the bp_corpus API, mount layout, JSON shapes for the
load-bearing artifacts, five worked example sequences, and the determinism rules that keep
re-execution reproducible.

**Not yet done:** persisting `toolUseTrace` to the validation artifact (would need a schema
migration on `AgentFindingProposalValidationArtifact`); a real-model dry run against the
2026-03 fixture to capture latency/cost numbers. The CLI is wired and dry-runs cleanly with
`bun --filter @bp/pipeline-v2 cli -- findings agent-propose --year 2026 --month 3 --model
"<model-id>" --enable-codemode true`.

Verification: 215 pipeline-v2 tests + 16 domain tests + 10 sandbox wrapper tests pass; image
builds to 464 MB.

## [2026-05-29] pipeline | tools/pipeline-v2 ports complete (89/89) and monoliths split

All 89 port-rated v1 commands now have v2 implementations under
`tools/pipeline-v2/src/commands/**`. Batches A-bottom, A-top, B, C, and D are closed. The
three v1 monoliths split during port: `tier2-docs.ts` (8088 LOC) into 16 sub-commands under
`src/commands/docs/tier2/`; `studio-release.ts` (4385 LOC) into per-phase release files plus a
`studio release` entrypoint; `audit/studio-coverage.ts` (1625 LOC) into `audit/studio-coverage.ts`
with sibling helpers. The `findings:*` namespace stays deferred in v1 per
`[[scope_corpus_before_findings]]`. v2 commands are invoked through
`bun --filter @bp/pipeline-v2 cli -- <namespace> <command> [...flags]`.

As Stage 1→2 cleanup: removed `build:artifacts` from `tools/pipeline/package.json` (the last
remaining script-stale entry from `tools/pipeline-v2/inventory-audit.md`; the other 10 Cluster
A/B entries were already absent in HEAD). Collapsed root `package.json` from 114 scripts to 31
top-level orchestration entries (dev/build/deploy, the CI check matrix, the test matrix, the
`@bp/db` migration entries, `publish:serving-release`, `seed:local-studio-r2`, and a single
`pipeline` alias that proxies to the v2 CLI). The ~83 per-command `bun --filter @bp/pipeline ...`
aliases were removed; the CI workflow (`.github/workflows/ci.yml`) only uses the keepers and
needed no edits. Swept the three Tier 2 wiki files
(`knowledge/wiki/data/tier2_pipeline_completion_audit.md`,
`knowledge/wiki/data/intervention_source_coverage.md`,
`knowledge/wiki/engineering/tier_2_document_corpus_pipeline.md`) so every reference to the
retired v1 commands (`docs:ocr`, `docs:ocr-review`, `docs:validate`, `docs:promote`,
`docs:audit-promoted-source-backing`, `docs:followup-curation-bundle`,
`docs:followup-curation-decisions`, `docs:followup-curation-queue`,
`docs:followup-resolution-audit`, `docs:verify-followup-curation`, `build:artifacts`) sits
under an explicit retirement notice naming the v2 successors and the
`tier2-full-corpus-2026-05-24-pass2` historical artifact set.

**Not done; user-gated:** v1 deletion remains gated on integration testing the
rebuild-trigger workflow (plan → finalize → check → export → verify → publish) end-to-end in
v2 against the March 2026 fixture, and on the Tier 2 docs corpus pipeline
(capture → discover → ocr-plan → ocr → extract → chunk → dedupe → duplicate-decisions →
status → load-staging) end-to-end in v2. Until those two integration smokes pass,
`tools/pipeline/` stays in place and shippable.

Verification: `jq '.scripts | length' package.json` returns 31; `jq '.scripts | length'
tools/pipeline/package.json` returns 93. `grep -rn 'docs:ocr\b\|docs:ocr-review\|docs:validate\|docs:promote\|docs:followup-curation' knowledge/wiki/`
returns only references inside the explicit retirement notices and the historical prose those
notices tag as describing past pipeline state. Root `bun run check:types` carries the
pre-existing v1-side errors from untracked Tier 2/Studio working-tree code; no new errors
are introduced by the script collapse.

## [2026-05-22] engineering | Parking location candidate matching added

Added a dedicated parking location candidate layer to address the low route-join rate without
pretending parking rows are clean address records. The local schema now preserves parking
`street_code1/2/3`, `intersecting_street`, and `match_location_key`; LION now preserves `b5sc`,
`boroughcode`, and house-number ranges. The new `build:parking-violation-matches` job hydrates
those fields from raw snapshots, groups camera/intersection strings and street-code/house-number
locations, writes candidate route matches with match kind/confidence/fanout/weight, and emits
`data/artifacts/context-events/parking-violation-match-audit.json`.

Real March corpus verification: LION and parking raw fields were hydrated locally, then the full
parking match pass scanned 229 camera groups and 174,174 street-code/house groups. It produced
596,527 candidate route rows across 96,760 grouped locations, representing 3,085,310 parking events
and 367 routes. Rebuilt route touches added 30,150,878 `parking_location_match` touches. A corrected
parking verification query shows 3,128,264 joinable parking events, 3,086,633 touched events,
30,180,112 total parking touches, 378 routes, 98.67% touched among joinable events, and 53.65%
touched among all parking events. Parking remains `release_context_only` until candidate fanout and
confidence thresholds are reviewed for detector use.

## [2026-05-21] planning | Data Pipeline Finish Plan v2

Added [[wiki/engineering/data_pipeline_finish_plan_v2|Data Pipeline Finish Plan v2]] as the current
plan of record after the May production cutover and source audit. The plan folds the source coverage
ledger into historical corpus completion, keeps heavy rebuild/finalize/export work manual on this
PC, treats Worker `shouldRebuild` as a rebuild-needed signal rather than an automatic job, and
defers Cloudflare Queues until there is a concrete retry/fanout workload. The immediate tracks are:
stabilize March/May local drift, generate the coverage ledger, backfill route trends through the
latest complete public speed month, repair/exclude equity context, rebuild context features and
findings, split Worker cron behavior, add compact capture/status indexing, and prove a
production-length R2 GTFS-RT handoff before raw retention expires.

Follow-up implementation on the same day added `audit:source-coverage` and generated the March 2026
ledger at `data/artifacts/source-coverage/2026-03/ledger.json`. The real ledger classifies 12
sources: 5 complete for history, 2 requiring backfill (`route_month_trends`,
`bus_wait_assessment`), 3 release-context-only, 1 current-signal-only, and 1 excluded until fixed
(`equity_context`). March/May local drift was also cleared: `map-artifacts --year 2026 --month 3`
wrote 354 map artifacts, strict `check:pipeline-v1 --year 2026 --month 3` passed with 0 issues,
and May `gtfs-rt:preflight --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T103607Z-24h`
passed with 1,143 observed-reliability source-status rows.

Route-trend ingestion now knows about the historical speed/ridership datasets in addition to the
2025+ datasets. A speed-only live backfill first expanded `local_route_month_trend` to 12,075
route-month speed rows covering 2023-04 through 2026-03. Then `backfill:route-ridership-trends`
was made historical-source-aware, chunked by month/route set, resilient to failed source batches,
and progress-reporting. Three live passes filled the remaining ridership coverage, leaving
12,075/12,075 route-month rows with both speed and ridership trends. The regenerated March source
coverage ledger now marks `route_month_trends` `complete_for_history`; strict
`check:pipeline-v1 --year 2026 --month 3` passes with `routeMonthTrendRows=12075`,
`routeMonthTrendSpeedRows=12075`, and `routeMonthTrendRidershipRows=12075`.

Bus Wait Assessment was backfilled across the same historical window, `2023-04` through `2026-03`,
using the existing month-scoped `ingest:bus-wait-assessment` command. The local table now has
46,167 rows across 36 months and 354 distinct routes. The regenerated March source coverage ledger
reports only one source needing action: `equity_context`, classified as `excluded_until_fixed`.
Attempting `ingest:equity-context --year 2024` now receives a Census API "Missing Key" HTML
response in this environment, and no `CENSUS_API_KEY` is configured; keep equity claims excluded
until the Census API key/config issue is fixed.

## [2026-05-20] engineering | Source-gap detector thresholds grounded

Completed the source-gap detector threshold pass: context joins now use a 40% minimum join-rate with a 50-row floor based on March 2026 corpus rates, bus-lane placeholder dates use the observed `2026-03-01T00:00:00.000Z` sentinel, and source lag is driven by `tools/pipeline/src/source-freshness-policy.ts` rather than detector-local policy.
Verification: root `check:types`, `@bp/analytics` tests, pipeline `findings-detect`, knowledge check, and the real March 2026 `findings:detect` run pass. The real corpus now emits 199 source-gap candidates: 115 bus-lane date gaps, 1 context-join failure, 37 insufficient GTFS-RT sample gaps, 31 missing speed gaps, 12 missing scheduled baselines, and 3 missing geometry gaps.

## [2026-05-20] engineering | Persistent speed hotspot detector added

Added the second Finding Coverage v1 detector, `persistent_speed_hotspot`, as a pure analytics pass over existing local route-hotspot outputs. The detector emits segment-scoped `persistent_low_speed` candidates with metric evidence, keeps route-level hit/clean/skipped coverage rows, and is wired into `findings:detect` after `source_gap` with idempotent local replacement per detector/month.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 100 persistent-speed-hotspot candidates across 70 hit routes, with 280 clean route no-hits and 31 skipped routes lacking speed input.

## [2026-05-20] engineering | Observed reliability detector added

Added the third Finding Coverage v1 detector, `observed_reliability`, as a pure analytics pass over observed GTFS-RT route summaries, scheduled headway baselines, and MTA Bus Wait Assessment corroboration. The detector emits route-scoped `high_long_gap_share` candidates only when observed samples are sufficient, scheduled baselines exist, and wait-assessment evidence is present; otherwise it writes skipped coverage rows instead of silent no-hits.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 100 observed-reliability candidates, 238 clean route no-hits, and 43 skipped route coverage rows (37 insufficient GTFS-RT sample routes and 6 routes missing Bus Wait Assessment corroboration).

## [2026-05-20] engineering | Intervention gap detector added

Added the fourth Finding Coverage v1 detector, `intervention_gap`, as a pure analytics pass that combines in-memory speed/reliability detector pain scores with local route intervention comparison statuses. The detector emits route-scoped candidates only when pain is high and intervention evidence is absent or limited to a bus-lane source-gap placeholder; routes with dated/evaluated treatment evidence are treated as clean for this detector rather than as untreated gaps.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 50 intervention-gap candidates, 97 clean route no-hits, and 234 skipped route coverage rows where no speed/reliability pain signal crossed into the detector input.

## [2026-05-20] engineering | Intervention underperformance detector added

Added the fifth Finding Coverage v1 detector, `intervention_underperformance`, as a pure analytics pass over evaluated route intervention comparisons plus current speed/reliability pain signals. The detector emits route-scoped `negative_peer_adjusted_delta` candidates only when an implemented treatment has peer-adjusted before/after evidence with non-positive adjusted speed delta and current pain remains high.
Verification: `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on touched detector/pipeline files, and the real March 2026 `findings:detect` run pass. The real corpus now emits 13 intervention-underperformance candidates, 32 clean route no-hits, and 336 skipped route coverage rows where evaluated treatment evidence or current pain signals were unavailable.

## [2026-05-20] engineering | Detector coverage audit artifact added

Extended `findings:detect` to write `data/artifacts/findings/<month>/detector-coverage-audit.json` alongside the local SQLite detector rows. The artifact records detector counts, evidence counts, coverage outcome counts, coverage reason counts, candidate reason counts, and top candidates per detector so reviewer/debug workflows can inspect detector coverage without hand-querying SQLite.
Verification: `bun --filter @bp/pipeline test test/findings-detect.test.ts`, `bun run check:types`, targeted Biome on the findings job and test, `bun run check:knowledge`, and the real March 2026 `findings:detect` run pass. The March artifact has five detectors and mirrors the real matrix counts: 199 source-gap, 100 speed-hotspot, 100 observed-reliability, 50 intervention-gap, and 13 intervention-underperformance candidates.

## [2026-05-19] data | Corpus range backfills completed

Branch-tip corpus expansion supersedes the earlier in-flight parking/geocode note below. The local
corpus now covers Bus Observatory recovered reliability from 2023-04 through 2026-05: the
range backfill completed 38/38 months, producing about 102.4M headway samples and 14,478
route/month reliability summary rows. The companion Socrata range backfill for
`nypd-collisions`, `ace-violations`, and `dot-street-permits` completed 111/111 source-month
tasks for 2023-04 through 2026-04.

Branch-tip local SQLite counts from the handoff: 277,606 NYPD collisions, 18,683 ACE summaries,
2,028,951 DOT permit rows, and 412,685 context events. The ACE ingest now skips malformed
upstream route IDs with `skippedMalformedRouteIdCount` instead of weakening the strict
`RouteIdSchema`; this was added after rows such as `Q44?+` broke four monthly ingests.

Parking geocoding finished with a known low hit rate, roughly 50.7%, compared with about 98%
for other geocoded sources. That is a data-quality follow-up, not a blocker for this corpus
substrate. Bus Observatory 2025-01 still has 12 missing archive days, so downstream reliability
for that month should be treated as a partial-month signal.

## [2026-05-19] data | Parking geocode still in flight

Parking geocoding is not complete yet. Background task `bq0nmjpyi` is still running under task #63:
`local_parking_violation` has 186,096 total rows, 71,428 attempted so far, and 13,963 rows with
`physical_id` at the latest status check, roughly 38% through the pass with about 115k rows
remaining.

Earlier task #63 steps are complete: `build:lion-geometry-index`,
`build:route-shape-geometry-index`, `build:route-lion-link`, NYPD collision geocoding, 311
geocoding, and an intermediate `build:context-events` run. The intermediate context table is about
412.7k rows and is not final for parking context.

Still pending before treating parking context as detector-ready:

1. Let `geocode:parking-violations` finish.
2. Rerun `build:context-events` so the completed parking `physical_id` coverage is upserted into
   `local_context_event`.
3. Spot-check final hit rates and joined event counts by `event_kind` before using parking rows in
   detector scoring.

## [2026-05-19] planning | Finding detector architecture audit

Updated [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]]
with the detector architecture audit and implementation plan. The detector should be a local Bun
pipeline subsystem with canonical rows in `local_finding_candidate`,
`local_finding_evidence_link`, and `local_finding_coverage_audit`; Studio finding cards should be
generated only from reviewed or promoted candidates, not treated as the detector contract.

Manual local audit of `data/local/pipeline.sqlite` found the detector storage scaffold already
exists but is empty: 0 finding candidates, 0 evidence links, 0 coverage rows, 412,685 context
events, 3,097 route hotspot rows, 762 observed-reliability rows across March and May, 360
intervention comparisons, 193 corridor summaries, and 283,557 route-to-LION links across 378
routes. The plan now starts with a source-gap detector, then persistent speed hotspots, observed
reliability, intervention gaps, and intervention underperformance. Context-correlated disruption is
deferred until route-to-LION joins and event-density normalization have sampled QA.

Also updated [[wiki/engineering/data_model|Data Model]] to document local finding detector tables,
the D1/R2 serving split for promoted summaries versus detailed evidence bundles, and the immediate
schema hardening needs: strict domain contracts, idempotent replace-by-run writes, detector indexes,
and coverage rows for clean no-hit and skipped states.

## [2026-05-19] planning | Tier 2 document corpus pipeline

Added [[wiki/engineering/tier_2_document_corpus_pipeline|Tier 2 Document Corpus Pipeline]] to
settle how intervention and policy documents should flow into the future findings detector. The
plan borrows the useful shape of `ussumant/llm-wiki-compiler` - raw capture, compilation,
search/lint, and wiki navigation - but keeps detector integration behind typed candidate JSON,
deterministic validation, local SQLite/R2 artifacts, and explicit promotion gates. Tier 2 documents
can enrich findings, seed recall backtests, and create source-gap review tasks, but cannot create
metric claims without deterministic speed/reliability/ridership/evaluation evidence.

Extended the plan with the likely `pi-coding-agent` runtime shape: project-local `.pi/SYSTEM.md`,
skills, prompts, and a `tier2-doc-tools.ts` extension. The extractor role should run with broad
coding tools disabled and only narrow chunk/search/lookup/candidate-write tools enabled. Normal Pi
coding sessions can still use filesystem tools, but reproducible extraction should use schema
writers, path protection, and deterministic validation tools instead of arbitrary `bash` or wiki
edits.

## [2026-05-19] build | Geometry join + geocoding + detector schema landed

Three coupled tracks completed:

1. **Route ⇄ LION corridor join** via spatialite as a loadable SQLite extension
   in the local pipeline. ADR `docs/decisions/0007-spatialite-for-local-geo-joins.md`
   records the decision; Worker / D1 never load spatialite. Added
   `local_lion_segment_geom`, `local_route_shape_geom`, and the flat
   `local_route_lion_link` lookup. Pipeline jobs: `check:spatialite`,
   `build:lion-geometry-index`, `build:route-shape-geometry-index`,
   `build:route-lion-link` (default 25m buffer, tunable via `--buffer-m`).

2. **Address → LION mapping** via `packages/sources/src/nyc-geoclient` with
   address / intersection / search calls, retries, and an opt-in fuzzy
   street-name resolver (`street-normalize.ts`). Lookups flow through the
   shared `local_address_geocode` cache so re-runs are free. Three per-source
   geocode jobs: `geocode:311`, `geocode:nypd-collisions`,
   `geocode:parking-violations`. `physical_id` and `geocode_confidence`
   columns added to those three source tables. Requires
   `NYC_GEOCLIENT_KEY` env var (lat/lng snap + fuzzy fallback work without it).

3. **Detector data model (schema only)**: `local_context_event`,
   `local_finding_candidate`, `local_finding_evidence_link`,
   `local_finding_coverage_audit` tables and matching repository in
   `packages/db/src/local/repositories/findings.ts`. Materializer job
   `build:context-events` projects geocoded 311 / collisions / parking
   violations / DOT permits into the unified event table. No detectors yet —
   detector logic is the next milestone per the corpus-before-findings scope.

Drizzle migration `0022_public_wolfsbane.sql` covers all eight new tables
plus the six ALTER TABLE column adds. Typecheck and all package tests pass.
Spatialite itself is not installed in CI; local dev needs
`libsqlite3-mod-spatialite` (Linux) or `libspatialite` (macOS).

End-to-end run (today):
- LION geometry index: 122,168 / 122,168 segments inserted.
- Route-shape geometry index: 1,637 / 1,640 shapes inserted (3 skipped due
  to empty / malformed coordinate fragments).
- Route ⇄ LION link: 378 routes × 283,557 corridor links at 25m buffer.
- NYPD collision geocode: 6,493 hits / 262 misses (96.1% hit rate, 6,755 rows).
- 311 service-request geocode: 130,213 hits / 16,019 misses (89.1% hit rate,
  146,232 rows; ~80k unique addresses cached).
- Parking-violation geocode: initial 10-row smoke had no hits, but the full
  pass is now running as task `bq0nmjpyi`. Latest in-flight status: 71,428 /
  186,096 attempted, 13,963 rows with `physical_id`, about 115k remaining.
- Context events materialized: an intermediate `build:context-events` run has
  about 412.7k rows. Rerun it after parking geocode finishes so parking
  context rows are fully upserted.

Bug found during run: the per-source `WHERE physical_id IS NULL` batch
selector re-fed miss rows every iteration, so the NYPD job spun forever on
the 262 unmatchable rows. Fixed to `WHERE physical_id IS NULL AND
geocode_confidence IS NULL` in all three geocode jobs.

## [2026-05-19] audit | Brief feature is templated infra without authoring backend

Added gap #9 to [[wiki/engineering/website_data_support_audit|Website Data Support Audit]] to
make explicit that the brief surface — list/detail/evidence/history pages, the
`/api/v1/studio/briefs*` endpoints, and the published R2 artifacts — is a read-only stub built on
top of real D1 route metrics. `brief.summary`, `brief.dek`, `brief.sections[].body`,
`brief.claims[].title`, and `brief.evidence[].detail` are produced by string-interpolating
route-summary metrics into prose templates in `tools/pipeline/src/jobs/build/brief-artifacts.ts`
and the `StudioBrief` builder in `studio-release.ts`. `versions[]` and `comments[]` are
placeholder shapes; `status: "Published"` and `version: "v1"` are build artifacts, not workflow
state.

The plan of record for the missing authoring backend is
[[wiki/engineering/agent_author_api|Agent-Author API]] (status: draft). None of its endpoints
(`POST /studio/briefs`, `PATCH .../claims/:n`, `POST .../validate`, `POST .../review`,
`POST .../publish`, `POST .../retract`) exist in the Worker yet; the corresponding
editorial-state D1 tables (`brief_draft`, `brief_job`, `brief_version`, `brief_claim`,
`brief_evidence_link`, `brief_comment`, `brief_review`, `brief_idempotency`) are not in
`packages/db/src/d1/schema.ts`. The mid-layer data endpoints (`/studio/routes/:slug/segments`,
`/studio/data/violations`) and searchable evidence catalog (`/studio/briefs/:id/evidence?search=…`
returning *findable* evidence across briefs, not the embedded per-brief array) are also
unimplemented.

This is a feature-completeness gap, not a polish task. Captured so future work doesn't mistake
"audit says briefs read fine" for "brief authoring works".

## [2026-05-19] release | S3-API publisher for R2 artifacts

Replaced the wrangler-based R2 upload loop in `scripts/publish-serving-release.sh` (per-call
process startup × 2,355 puts = ~60 minutes) with
`tools/pipeline/src/jobs/publish/publish-r2-artifacts.ts`, which uses Bun's native S3Client
against R2's S3-compatible endpoint. Idempotent via HEAD-then-PUT (skip when remote size+ETag
match the local md5), resumable (re-run picks up where it left off via the same skip gate),
parallel (default concurrency 16), with retry+backoff and an audit JSON at
`data/artifacts/audits/publish-r2-{month}.json`. Wrangler is still used for D1 schema/seed/
appendix execution and the existing completeness pre-flight. Verified end-to-end against
`bus-priority-artifacts`: 2,355/2,355 keys HEAD-match the local artifacts; full pass completes
in ~5 seconds. New env in repo-root `.env`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_ENDPOINT` (Bun auto-loads from repo root; invoking via `--cwd` would miss this).

## [2026-05-18] planning | Serving storage split and website support audit

Added [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]] to settle the resource-first storage rule: D1 is the control plane for compact relational state, indexes, manifests, mutable drafts, jobs, idempotency, and queryable summaries; R2 is the artifact plane for immutable release documents, large nested payloads, maps, evidence bundles, exports, and raw-ish captures; the Worker owns REST resource semantics.

Added [[wiki/engineering/website_data_support_audit|Website Data Support Audit]] after code inspection of the Studio API client, Worker, release builder, domain schemas, and observed-reliability repositories. The audit records that production frontend loaders already call real `/api/v1/studio/*` endpoints and no longer import sample data; the real gap is that Studio R2 projections cover a curated route/brief/finding slice while D1 contains full-route serving data, observed reliability, and the May 2026 current appendix. The old "unfixture route loaders" task is obsolete; the new queue is to expand Studio coverage, surface observed reliability/current signal data, and split brief evidence/history contracts.

Follow-up note: documented that the current R2 shape does not look over-stored; the sharper risk is under-publishing nested route/corridor brief body artifacts. The March brief manifest and D1 artifact refs point at keys under `briefs/routes/...` and `briefs/corridors/...`, while the current publish glob clearly includes `briefs/$month/*` and may only upload the manifest. The plan now calls for manifest-driven R2 publishing or an artifact-ref-to-upload validation gate.

## [2026-05-18] release | Production cutover with May 2026 observed appendix

Promoted the canonical March 2026 release plus the May 2026 self-collected GTFS-RT observed appendix to production Cloudflare D1/R2.

Pipeline state: ingested the completed 24-hour run `gtfs-rt-v1-20260517T103607Z-24h` (2,880/2,880 snapshots, 3,589,778 vehicle positions, 0 errors), built observed headways for 2026-05 (395,885 stop events, 366,609 headway samples), built `route-observed-reliability --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T103607Z-24h` (381 routes, 300 observed, 81 insufficient, 360,914 headway samples). `gtfs-rt:preflight` for 2026-05 passed with 0 issues. The strict `check:pipeline-v1 --year 2026 --month 3` audit still passes after the run (0 issues, 1,050 route artifacts, 381 observed reliability rows). Combined `audit:pipeline-v1 --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5` produced `audit-2026-03-2026-05.json` with `publicStrictStatus=pass`, `realtimePreflightStatus=pass`, `sameMonthPromotionReady=false` (correct — May has no public speed coverage), and methodology gate preserved at `descriptive_only`.

Mid-session incident: the first two `route-observed-reliability` invocations (default-month and a malformed `--month 2026-05` string) wrote zero-sample rows for `month=2026-03` and `month=2026-NaN`, clobbering the Bus Observatory recovered March data. Restored from `data/working/bus-observatory/2026-03/route-observed-reliability-summary.csv` via `import:bus-observatory-reliability-summary --year 2026 --month 3 --run-id bus-observatory-2026-03`; counts matched the pre-incident baseline (346 observed routes, 2,571,297 samples). The reliability builder ignores its `runId` parameter when deleting rows; future runs for one month against another month's local DB will clobber rows the same way unless `--year/--month` is passed.

Code change: added a single-tables D1 appendix export path so observed-reliability rows can be promoted without re-running the route-batch audit gate. New `buildD1AppendixSeedSql` in `packages/db/src/d1/seed/build-seed-sql.ts` emits scoped `DELETE` + `INSERT` for `route_observed_reliability_summary` (by month) and `route_month_source_status` (by month + `source_scope='reliability'` + `source_id IN ('observedHeadways','bunching','waitTimeReliability')`). New `readLocalD1AppendixInputs` and `writeRouteD1AppendixSeedOutput` in `tools/pipeline/src/jobs/export/` produce a `seed.appendix.sql` (no schema, no summary parity with canonical). `export:d1 --mode appendix --year YYYY --month M` invokes the appendix path and skips `prepareRouteD1Export` (the audit gate). `scripts/publish-serving-release.sh` gained `--appendix-month YYYY-MM` to layer a second `wrangler d1 execute` of `seed.appendix.sql` on top of the canonical publish, plus `--skip-schema` to re-run the script when D1 tables already exist.

Cutover: ran `export:d1 --year 2026 --month 3` (1,050 route artifacts, 6.1 MB seed) and `export:d1 --mode appendix --year 2026 --month 5` (626 KB seed, 381 observed reliability rows, 1,143 source-status rows). The first `publish:serving-release --execute` failed on `schema.sql` because the production D1 already had the tables from a prior publish (`CREATE TABLE` is non-idempotent). Applied `seed.sql` and `seed.appendix.sql` directly via `wrangler d1 execute --remote`: canonical seed wrote 58,089 rows (38,727 changes), appendix wrote 3,048 rows. Remote D1 now has `route_observed_reliability_summary` for `month=2026-03 / run_id=bus-observatory-2026-03 (381 rows)` and `month=2026-05 / run_id=gtfs-rt-v1-20260517T103607Z-24h (381 rows)`. R2 publish of `bus-priority-artifacts` is the slow tail of the operation (briefs, evaluations, map, pipeline-v1 audits including `audit-2026-03-2026-05.json`, source-availability, studio v1 projection).

Next: Worker deploy via `bun run --cwd apps/web deploy` once R2 uploads finish; production smoke against `/api/v1/studio/release` and a route detail to confirm the May observed appendix is reachable; frontend unfixture per surface; methodology review still gates causal claims.

## [2026-05-18] planning | AI interaction model doctrine

Added [[wiki/project/ai_interaction_model|AI Interaction Model]] as the canonical product doctrine
for LLM use in the Studio. The model keeps AI output inside Studio artifacts such as findings,
reasoning trails, route diagnosis strips, segment notes, claim seeds, caveats, reviewer notes, and
brief drafts; rules out global chat, "Ask AI" navigation, chatbot styling, LLM metric generation,
and policy recommendations; and defines the determinism gradient from pure metrics/joins through
strict LLM contracts and bounded composer generation.

Updated the project overview, wiki operating rules, API architecture, agent-author API, LLM/RAG
page, policy docs corpus, and wiki index to point back to this doctrine.

## [2026-05-18] planning | Realtime processing and production capture proof ladder

Updated the data infrastructure finish plan, Cloudflare operations runbook, ETL plan, pipeline v1 plan, and wiki index with an explicit realtime processing plan. The docs now distinguish the completed production smoke proof from the still-needed production-length proof: mirror a contiguous 4-hour-or-longer Worker/R2 GTFS-RT capture run, import manifests, parse protobufs, build observed headways, generate route reliability, and pass `gtfs-rt:preflight`.

Documented the production capture proof ladder: config proof, R2 write proof, 30-second cadence proof, object integrity proof, R2-to-pipeline parse proof, reliability proof, appendix proof, and same-month observed-release promotion proof. The runbook now calls out that R2 object transfers should use plain `bunx wrangler` in this environment and that full observed release promotion still requires same-month public speed coverage plus strict pipeline/audit gates.

## [2026-05-18] data | Pipeline v1 status refreshed and next steps reset

Rechecked the local March 2026 pipeline state. Regenerated the missing canonical `data/artifacts/map/2026-03/manifest.json`, then strict `bun run check:pipeline-v1 -- --year 2026 --month 3` passed with 0 issues: 381 built routes, 350 public routes, 346 observed reliability routes, 2,571,297 route-summary headway samples, 360 intervention comparisons, 193 corridors, 1,629 audited brief artifacts, 354 map artifacts, and D1 verification passing.

Confirmed `gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03` passes for recovered March observed reliability. Reran the observed-release audit with March public and March recovered realtime evidence; it passed with `Observed Release=complete` and `sameMonthPromotionReady=true`, while preserving Bus Observatory / Jacobs Urban Tech Hub `third_party_recovered` provenance and CC BY-NC 4.0 caveats.

Confirmed the official self-collected run `gtfs-rt-v1-20260517T103607Z-24h` completed with 2,880/2,880 successful vehicle-position snapshots and 0 failures. It still needs ingest, observed-headway build, May 2026 route reliability, and preflight before it becomes the official current observed appendix.

Updated the wiki index, Codex roadmap, ETL plan, data pipeline completion plan, and data infrastructure finish plan. The next work is Cloudflare D1/R2 release promotion, Studio projection seeding/unfixture, production GTFS-RT/source watcher operations, processing the completed official 24-hour run, bus-lane date gap reduction, and methodology review before causal claims.

## [2026-05-18] planning | Web app support plan for briefs, composer, and loaders

Added [[wiki/engineering/web_app_support_plan|Web App Support Plan]] to make the next frontend work explicit. The plan keeps TanStack Router's route loaders as the orchestration layer, uses Router SWR caching for read-heavy Studio projections, adds signal-aware fetches, route-specific `staleTime`, narrow `loaderDeps`, and deferred loading for non-critical brief evidence/history and map-heavy payloads.

The plan also splits published brief contracts from evidence/history payloads and phases the composer from projection-seeded local state to a feature-flagged single-user draft API. Draft metadata, claim text, evidence refs, and review comments may be bounded D1 rows; large body snapshots, diffs, and publish candidates belong in R2. Normal page requests must not mutate the public March release projection.

## [2026-05-18] planning | Post-v1 finding coverage and corpus expansion

Added [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]] to make missed-finding risk explicit after Pipeline v1. The plan splits the risk into detector gaps, data gaps, join gaps, threshold gaps, context gaps, and review gaps, then defines a detector matrix, coverage audit, source-gap findings, recall-oriented backtests, and reviewer states.

Updated the source registry with an unprobed expansion backlog for MTA wait assessment, DOT traffic speeds, traffic volume counts, construction/opening permits, NYPD collisions, 311 requests, parking violations, and LION/street-centerline joins. Corrected methodology validation to reflect the current March `third_party_recovered` observed reliability state and the separate May official self-collected appendix path.

## [2026-05-18] planning | LLM processing role for corpus expansion

Extended [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]], [[wiki/engineering/llm_wiki_rag|LLM Wiki + RAG Layer]], and [[wiki/data/policy_docs_corpus|Policy and Documents Corpus]] with the post-v1 LLM processing boundary. LLMs can help as readers, authors, and extractors: they can mine documents for candidate source notes, document claim candidates, entity-link candidates, review questions, and caveats, but deterministic probes, route/street/geospatial validators, metric jobs, and composer validation remain the authority for source promotion and public claims.

## [2026-05-18] design | shadcn Base UI design-system cutover started

Initialized shadcn for `apps/web` with the Base UI backend while preserving TanStack Router. Added Tailwind v4 and shadcn aliases for the web app, mapped shadcn semantic CSS variables to the Claude Design Bus Priority Impact Studio token system, and ported the first reusable primitives from the design tarball: studio mark, route badge, chip, citation, sparkline, hour strip, confidence bar, reviewer chips/stack, and AI attribution strip. The generated shadcn button has been refactored to the custom system's compact civic button variants instead of the default Nova look.

Extended the design-system primitive port with the remaining core `system.jsx` building blocks: before/after bars, map thumbnail, section header, studio footer, tabs, KPI, caveat, search field, direction/treatment glyphs, segment rows, timeline, skeleton/loading states, empty/error states, chart frame, heatmap, hour bars, strength bars, and claim rows/lists.

Converted the legacy app-level `Button`, `Pill`, `RouteBadge`, and skeleton components into compatibility wrappers around the shadcn/custom design-system primitives so existing screens can keep importing their current component names while inheriting the new visual system.

Added the missing `StudioBar` primitive from the design tarball and changed legacy app token exports/CSS variable aliases to resolve to the new warm-paper BPI token set. Updated user-facing page metadata from the old BusPulse name to Bus Priority Impact Studio.

Replaced direct `.bp-pill` filter links in the app shell and hotspot panel with the new `Chip` primitive, then removed now-unused legacy CSS blocks for `.bp-pill`, `.bp-route-badge`, `.bp-btn`, and `.bp-skeleton`.

Renamed the internal map component from `BusPulseMap` to `BusPriorityMap` so code symbols no longer carry the old product name.

Added a TanStack Router `/system` panel that renders the ported design-system primitives inside the app shell. The panel exercises foundations, route badges, chips/citations, search, KPIs, sparklines, before/after bars, confidence, treatment glyphs, segment rows, AI attribution, heatmap/hour charts, claim lists, tabs, caveats, skeletons, timelines, and empty states.

Ported the comment badge and inline comment marker shown in the later design-system HTML but not centralized in `system.jsx`, and added both to `/system`.

## [2026-04-26] seed | Initial LLM wiki scaffold

Created Codex-ready wiki seed for Bus Priority Impact Studio. Added project, data, engineering, analysis, template pages, source registry, source manifest, and starter scripts.

Next required action: validate source metadata and schemas with Socrata/API probes before implementation.

## [2026-04-26] research | Managed services options

Added [[wiki/project/managed_services_options|Managed services options]] decision memo covering Cloudflare, Neon, Supabase, Turso, Railway, Render, Fly.io, and a VPS baseline. Recommendation: keep heavy analytics local, serve the public MVP on Cloudflare Pages/Workers/D1/R2, and reserve Neon Postgres/PostGIS for dynamic geospatial upgrades.
## [2026-04-26] architecture | TypeScript package structure and wiki relocation

Added `wiki/engineering/package_structure.md`, moved the prior LLM wiki under repo-level `knowledge/`, added root `CLAUDE.md` and `AGENTS.md`, and updated engineering docs to use a TypeScript-only MVP with Cloudflare Workers/D1/R2 and local pipeline jobs instead of Python/FastAPI/Postgres.

## [2026-04-27] architecture | Bun-first repo basics, Zod contracts, and test harnesses

Converted the repo blueprint from pnpm-first to Bun-first, added strict TypeScript and Biome configs, scaffolded Zod v4 domain/source/DB contracts, added Bun unit tests, added a Cloudflare Worker runtime test harness, added optimized pre-push hooks, and documented the testing/TDD standards in [[wiki/engineering/testing_standards|Testing standards]].

## [2026-04-27] architecture | Explicit package barrel exports

Added a package barrel export rule: package root `src/index.ts` files must use explicit named re-exports, keep type-only exports as `export type`, and avoid wildcard or namespace re-exports so public APIs stay small and tree-shaking remains predictable.

## [2026-04-27] architecture | Test placement standard

Standardized test placement outside production `src/` trees. Package and pipeline unit tests live in sibling `test/` directories, Worker runtime tests live under `apps/web/test/`, and only cross-cutting architecture harnesses live in root `tests/`.

## [2026-04-27] data | Full source probe completed

Implemented the TypeScript/Bun source manifest probe and validated all 30 manifest sources. Probe result: 30 active, 0 blocked, 0 skipped. Generated Socrata metadata, columns, row counts, HTTP metadata for web/PDF/GTFS sources, and redacted Bus Time GTFS-RT probe outputs under `knowledge/raw/metadata/`. Updated the source registry and data wiki pages with confirmed field names, row counts, and update timestamps.

## [2026-04-27] data | M1 route slice ingestion

Added a fixture-backed Socrata row-query client and `bun run ingest:m1` pipeline command. The first live slice fetched M1 March 2026 data: 2,003 segment-speed rows, 6 active route-shape rows, 134 current stop rows, and 15 timepoint stops. Raw and normalized outputs are local/generated under ignored `data/raw/route-slices/` and `data/working/route-slices/`.

## [2026-04-27] analysis | M1 hotspot scoring

Added deterministic segment hotspot scoring in `packages/analytics` and a fixture-backed `bun run hotspots:m1` pipeline command. The first live artifact for M1 March 2026 scored 2,003 segment-speed observations across 13 timepoint segments, wrote ignored artifacts under `data/artifacts/route-slices/m1-2026-03/`, and identified two top-scoring segments at score 47: southbound `5 AV/E 72 ST` to `5 AV/W 41 ST`, and northbound `4 AV/E 10 ST` to `MADISON AV/E 28 ST`.

## [2026-04-27] analysis | Ridership-weighted M1 hotspots

Extended `ingest:m1` to fetch grouped MTA Bus Hourly Ridership for the route/month and write normalized route/day/hour ridership under ignored `data/working/route-slices/`. Extended hotspot scoring with rider-impact ranking using route-level hourly ridership exposure. The M1 March 2026 slice has 168 ridership windows and 207,870 route-month riders; the top rider-impact segment is northbound `MADISON AV/E 28 ST` to `MADISON AV/E 58 ST` with speed-only score 43 and rider-impact score 63.

## [2026-04-27] architecture | Web folder structure and Claude Code skills

Added project-scoped Claude Code React best-practices and composition-patterns skills under `.claude/skills/`. Introduced the `apps/web/src/` structure with components, pages, fixtures, lib, and worker directories. Added architecture checks for web boundaries and centralized type usage.

## [2026-04-27] analysis | M1 route scorecard artifact

Added a fixture-backed `bun run route-score:m1` pipeline command that reads the current M1 hotspot summary artifact and writes a validated route scorecard artifact. The first generated M1 March 2026 scorecard uses route-weighted speed 6.7409 mph and 10 hotspot rows to produce route score 16 at `data/artifacts/route-slices/m1-2026-03/route-scorecard.json`.

## [2026-04-27] analysis | M1 route brief input artifact

Added a fixture-backed `bun run route-brief:m1` pipeline command that combines the M1 route scorecard and hotspot summary into deterministic memo inputs with metrics, top segment rows, source citations, and caveats. The first generated payload is `data/artifacts/route-slices/m1-2026-03/route-brief-input.json` with five top segments and no generated prose.

## [2026-04-27] analysis | M1 artifact manifest

Added a fixture-backed `bun run artifacts:m1` pipeline command that writes `data/artifacts/route-slices/m1-2026-03/artifact-manifest.json` with artifact keys, byte sizes, content types, and SHA-256 hashes for `summary.json`, `hotspots.json`, `route-scorecard.json`, and `route-brief-input.json`.

## [2026-04-27] data | ACE route ingestion and M1 overlay

Added normalized ACE/ABLE route implementation parsing, fixture-backed `bun run ingest:ace-routes`, and fixture-backed `bun run interventions:m1`. The live ACE route ingest fetched 81 rows from `ki2b-sg5y` with 60 ACE rows and 21 ABLE rows. The M1 March 2026 overlay found 0 route-level ACE/ABLE matches, writes `data/artifacts/route-slices/m1-2026-03/intervention-overlay.json`, and is now included in route brief inputs and the artifact manifest.

## [2026-04-27] data | NYC DOT bus-lane ingestion and M1 overlay

Added normalized NYC DOT bus-lane parsing, fixture-backed `bun run ingest:bus-lanes`, and fixture-backed `bun run bus-lanes:m1`. The live bus-lane ingest fetched 4,068 rows from `ycrg-ses3`, including 1,304 Manhattan rows. The M1 March 2026 bus-lane proximity overlay found 228 candidate bus-lane rows across 19 matched streets, writes `data/artifacts/route-slices/m1-2026-03/bus-lane-overlay.json`, and is now included in route brief inputs and the artifact manifest.

## [2026-04-27] data | M1 schedule ingestion and planned-time comparison

Added normalized MTA Bus Schedules timepoint parsing, fixture-backed `bun run ingest:m1-schedules`, and fixture-backed `bun run schedules:m1`. The live M1 schedule ingest fetched 35,566 timepoint rows from `4fnn-qsea` across Saturday, Sunday, and Weekday service. The M1 March 2026 schedule comparison derived 14 scheduled timepoint pairs, matched all 10 hotspot pairs, writes `data/artifacts/route-slices/m1-2026-03/schedule-comparison.json`, and is now included in route brief inputs and the artifact manifest.

## [2026-04-27] data | ACE violation monthly summary

Added grouped ACE violation summary parsing and fixture-backed `bun run ingest:ace-violations`. The live March 2026 ingest grouped `kh8p-hcbm` by route, violation type, and violation status, producing 736 grouped rows across 58 routes and 32,954 violations. The M1 March 2026 intervention overlay now includes ACE violation counts and reports 0 M1 grouped violation rows for the month.

## [2026-04-27] analysis | M1 ridership profile artifact

Added fixture-backed `bun run ridership-profile:m1` to summarize route-level hourly ridership, transfers, peak ridership windows, and slow crowded windows by joining ridership windows to timepoint speed observations. The artifact is included in route brief inputs and the artifact manifest so memo inputs can distinguish high-ridership periods from segment-level hotspots.

## [2026-04-27] analysis | M1 speed profile artifact

Added fixture-backed `bun run speed-profile:m1` to aggregate segment-speed observations by direction, direction/daypart, and slowest day/hour windows. The artifact is included in route brief inputs and the artifact manifest so downstream memos can describe directional and time-of-day patterns without reading raw observations.

## [2026-04-27] data | Multi-route batch pipeline

Added `bun run build:routes` to refresh shared intervention sources once, then run the full route/month artifact chain for each requested route. The orchestration keeps existing M1-compatible commands but makes the pipeline usable for arbitrary route lists such as `M1,M2` without duplicating builder code.

## [2026-04-27] analysis | Route comparison artifact

Added `bun run compare:routes` to read a route batch summary plus each route's brief input and write a ranked route comparison artifact. The comparison includes route scores, speed, ridership, schedule-match rate, ACE violation totals, bus-lane overlay counts, peak ridership windows, and slowest day/hour windows.

## [2026-04-27] data | D1 seed export

Added compact D1 serving table contracts for route artifacts, brief summaries, comparison ranks, route catalog rows, and route/month coverage rows. Added `bun run export:d1` to read generated batch artifacts and write `schema.sql`, `seed.sql`, and an export summary under `data/exports/d1/<month>/`.

## [2026-04-27] data | Typed D1 repository layer

Added thin typed D1 repository helpers in `packages/db` for route brief summaries, route artifact metadata, and route comparison ranks. This intentionally avoided a full ORM while the serving schema was still moving, but gave Worker code explicit query functions and Zod-validated row mapping.

## [2026-04-27] data | Systemwide route catalog and coverage

Added `bun run ingest:route-catalog` to fetch all active current MTA bus routes and stops into a normalized route catalog. The live current catalog has 381 active routes, 1,640 route-shape rows, 23,048 stop rows, and 4,877 timepoint stops. Added `bun run ingest:route-coverage` to fetch all-route monthly segment-speed and schedule coverage; the March 2026 coverage artifact has 375 routes, including 353 with segment-speed data and 375 with schedule timepoint data. The D1 export now emits 381 route catalog rows and 375 route/month coverage rows.

## [2026-04-27] data | Route readiness backend layer

Added `bun run route-readiness` to join the all-route catalog with monthly speed/schedule coverage and produce a build-planning read model under `data/artifacts/route-batches/<month>/route-readiness.json`. The March 2026 readiness artifact has 381 routes, including 350 build-eligible route/months, 28 missing speed inputs, and 3 missing geometry inputs. The D1 serving schema/export now includes a `route_readiness` table with 381 seed rows, and `packages/db` exposes typed repository helpers for listing all readiness rows or build-eligible routes.

## [2026-04-27] data | Route build-plan backend layer

Added `bun run route-build-plan` to rank build-eligible, not-yet-built routes for the next offline batch from route readiness plus the existing batch summary. The March 2026 build plan has 381 rows: 20 selected routes at the default limit, 2 already built routes, 328 eligible backlog routes, and 31 blocked routes. The D1 schema/export now includes a `route_build_plan` serving table with 381 seed rows, and `packages/db` exposes typed reads for the full plan and selected candidates. Ingestion tests now write to fixture-specific output directories so they do not delete live `data/working/network` artifacts during verification.

## [2026-04-27] data | Planned route graph execution

Added planned-route batch execution, now represented by `bun run build:routes -- --planned`, to consume build-plan state, build selected route slices, merge them into the existing batch summary instead of replacing previous built routes, refresh route comparison, refresh the build plan, and regenerate the D1 seed. The first live March 2026 planned build used `--limit 5` and added `M57`, `M42`, `M31`, `BX2`, and `M50` to the existing M1/M2 batch. The batch now has 7 built routes, 63 artifact metadata rows in the D1 export, and 7 route comparison rows. The refreshed planner now marks 7 routes as already built and selects the next 20 candidates starting with `M125`, `BX35`, `M8`, `BX32`, and `M106`.

## [2026-04-27] data | Route batch audit and serving status

Added `bun run route-batch-audit` to validate generated route batch artifacts against each route's artifact manifest. The audit checks required artifact presence, file existence, byte lengths, SHA-256 hashes, route IDs, and analysis months, then writes `route-batch-audit.json`. The March 2026 live audit passes with 7 built routes, 63 verified artifacts, 823,794 total artifact bytes, and 0 issues. The D1 schema/export now includes a `route_batch_status` row, and `packages/db` exposes `getRouteBatchStatus` for Worker/backend reads.

## [2026-04-27] data | D1 seed verification

Added `bun run verify:d1` to regenerate the D1 export, execute the generated `seed.sql` in an in-memory SQLite database, compare loaded table counts against `export-summary.json`, and exercise typed `packages/db` repository reads. The live March 2026 verification passes with 381 route catalog rows, 375 route coverage rows, 381 readiness rows, 381 build-plan rows, 7 route scorecards, 63 artifact rows, 7 brief summaries, 7 comparison ranks, and 1 batch status row. The verification artifact is written to `data/exports/d1/2026-03/verify-summary.json`.

## [2026-04-27] data | Scheduled reliability and intervention-history layers

Added `bun run route-reliability-baseline` to compute scheduled headway baselines for built route batches. The March 2026 batch has 7 route rows and 186,322 scheduled headway interval samples, with source-readiness flags for observed headways, bunching, wait-time reliability, and cancellation proxies that still require GTFS-RT history. Added `route_reliability_baseline` to the D1 serving export and typed repository checks.

Added `bun run route-intervention-history` to summarize ACE implementation dates, monthly ACE violation counts, matched bus-lane open-date coverage, and missing signal-priority/lane-upgrade/enforcement-activation source gaps. The current March 2026 batch has 5 ACE-matched routes, 4 active ACE routes, and bus-lane matches with open dates on all 7 built routes.

## [2026-04-27] data | ACS equity context ingest

Added `bun run ingest:equity-context` and Census ACS normalization in `packages/sources`. The live ACS 2024 ingest fetched 2,327 NYC tract rows with 8,483,844 total population, 3,334,088 occupied housing units, and 1,844,706 no-vehicle households. This creates the tract-level demographics and low-car household layer needed before route catchment joins; job access still needs LEHD/LODES or a travel-time model.

## [2026-04-27] data | Multi-month route trend backend layer

Added `bun run ingest:route-trends` to build route/month trend inputs from public MTA speed and ridership sources over a configurable month range. Added `route_month_trend` to the compact D1 serving schema/export and typed repository helpers for route trend reads. The live March 2026 trend run covers 7 built routes across January 2025 through March 2026, producing 105 speed trend rows. Historical ridership trend aggregation was too slow as a single Socrata grouped query, so the live artifact marks ridership trends as skipped for this run and leaves ridership backfill to a chunked route/month job.

## [2026-04-27] data | Chunked ridership trend backfill

Added `bun run backfill:route-ridership-trends` to fill route/month ridership trend gaps incrementally from MTA Bus Hourly Ridership. The job reads the existing route trend artifact, queries one route/month aggregate at a time with configurable limit and concurrency, merges ridership and transfers into `route_month_trend` rows, and writes a backfill summary artifact. Bounded live backfill chunks for January 2025 through March 2026 completed all 105 route-month rows for the current 7-route trend window; D1 export and verification load the enriched trend rows.

## [2026-04-27] data | Route equity context serving layer

Added `bun run route-equity-context` to build route-level ACS context rows from the all-route catalog and ACS 2024 tract context. The first live March 2026 artifact writes 381 route rows, assigns 358 routes to county-level ACS proxy context from route ID borough prefixes, and marks 23 route IDs unassigned. Added `route_equity_context` to the D1 serving schema/export plus typed repository reads; D1 verification now loads 381 route equity rows alongside reliability and trend tables.

## [2026-04-27] engineering | Pipeline architecture cleanup

Consolidated the pipeline command wrappers behind `tools/pipeline/src/cli.ts` and reorganized pipeline internals into `checks/`, `jobs/{build,export,ingest,sources}/`, and `lib/`. Shared path/date/route-key/JSON helpers now live under `tools/pipeline/src/lib/`, and package scripts dispatch through the CLI registry while preserving the existing command names.

Moved source probe adapter logic into `@bp/sources/probes`, leaving pipeline source jobs responsible for command orchestration and artifact writes only. Added `SocrataClient` plus source registry lookup helpers in `@bp/sources`, then updated source-backed ingest jobs to use the package APIs instead of repeating manifest filtering and Socrata fetch wiring.

Recorded ADR 0002: Postgres through Hyperdrive is the planned canonical operational/analytics database once the project outgrows compact serving projections, Drizzle is the planned typed database layer, and D1 remains appropriate as an optional generated public serving projection. Product-queryable data should move to relational columns or child tables; JSON should be limited to source payloads, provenance, debug metadata, audit details, and selected-row attachments.

## [2026-04-27] engineering | MapLibre public map stack

Recorded ADR 0003 and replaced the Leaflet route fixture map with MapLibre GL JS. The app now renders route lines, hit areas, stops, labels, and D-grade hotspot markers as GeoJSON-backed MapLibre layers, with PMTiles protocol registration in place for future R2/static vector tile artifacts. Map rendering stays in `apps/web`; heavy geospatial construction and tile/artifact generation remain pipeline responsibilities.

Absorbed the useful map-strategy reference material into the main repo: shared route-segment GeoJSON artifact schemas in `packages/domain`, a `knowledge/wiki/engineering/map_strategy.md` page, the `nyc_borough_boundaries` source entry, and NYC map bounds in the MapLibre component. The remaining reference scaffold/design files are intentionally not needed.

Ran `bun run sources:probe` after adding `nyc_borough_boundaries`. The 2026-04-27 probe checked 32 sources, found 29 active, 0 blocked, and skipped 3 Bus Time GTFS-RT feeds because no local API key was configured. `gthc-hcne` is active with 5 borough rows, 5 columns, and rows updated at 2026-03-09T20:59:41Z.

## [2026-04-27] architecture | Drizzle schema split and D1 guardrails

Reviewed the uploaded `architecture-cleanup-drizzle-plan` branch ZIP directly. Updated the data model, package structure, ETL plan, and managed-services memo with a source-backed Drizzle adoption plan: separate D1 serving and future Postgres canonical schemas, keep D1 small and replaceable, move product-queryable JSON into child tables, retain heavy historical backfill in local Bun pipeline jobs, and add ADR 0004 for D1/Postgres/Drizzle guardrails.

## [2026-04-28] engineering | Drizzle D1 schema and relational serving cleanup

Implemented the first Drizzle adoption pass in `packages/db`: added D1 and future-Postgres Drizzle configs, D1 schema tables, generated D1 migration SQL, and Drizzle-Zod validation schemas. The D1 serving export now writes child tables for product-queryable arrays/objects instead of JSON text columns, including route citations, brief windows, catalog types/directions, readiness missing inputs, source statuses, reliability gap windows, and batch audit details. Repository APIs remain stable for the app while reading from the new relational child rows.

Removed the duplicate hand-written D1 table SQL layer. D1 DDL now comes from generated Drizzle migration files under `packages/db/migrations/d1`, while the pipeline export writes seed DML only and copies schema SQL from the migration journal for local verification. Added Wrangler migration scripts for local and remote D1 application through `packages/db/wrangler.d1.jsonc`.

Started the `@bp/db` package split into explicit `@bp/db/d1`, `@bp/db/pg`, and `@bp/db/shared` subpath surfaces. Moved D1 and PG schemas into those surfaces, added a D1 Drizzle client factory, and migrated the route scorecard read path from raw SQL strings to Drizzle query builders over a Drizzle D1 database.

Migrated the first simple serving repositories to Drizzle query builders: route artifacts, comparison ranks, and route month trends. Added a `@bp/db/d1/bun-sqlite` helper so local export verification and package tests can exercise Drizzle-backed reads against Bun SQLite without making `tools/pipeline` depend directly on Drizzle internals.

Hard-cut the remaining D1 serving reads to Drizzle. All route serving query modules now live under `packages/db/src/d1/queries`, D1 seed SQL literal helpers live under `packages/db/src/d1/seed`, and the legacy `D1DatabaseLike` prepared-statement compatibility layer was removed. The pipeline D1 verifier now exercises the same Drizzle/Bun SQLite database adapter used by package tests.

Drafted the local pipeline DB cutover plan. The plan adds `@bp/db/local` as a SQLite/Drizzle canonical local build database, keeps D1 as a disposable serving projection, and orders the migration around deleting DB-shaped JSON handoffs, shrinking `export-d1.ts`, and making pipeline jobs fetch/transform/upsert instead of read/parse/rewrite JSON tables.

## [2026-05-16] planning | Data Pipeline v1 scope reset

Promoted GTFS-RT observed reliability/bunching, before/after intervention evaluation, corridor grouping, and full route/corridor brief artifacts into Data Pipeline v1 scope. Added [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] with a current-state audit, prompt-to-artifact checklist, definition of done, phased execution plan, data contracts, QA gates, and risk register. Updated the wiki index, Codex roadmap, and ETL plan to point future work at the full-network v1 finish line instead of the older M1-only prototype roadmap.

Started GTFS-RT collection for Data Pipeline v1. Added local SQLite tables for collection runs and raw feed snapshot metadata, plus `collect:gtfs-rt` for bounded MTA Bus Time GTFS-RT raw snapshot capture. Raw protobuf bodies stay under `data/raw/gtfs-rt/`; local DB rows store feed type, sample index, source id, fetch time, HTTP status, byte length, SHA-256, raw path, redacted URL, and error text. Added fixture-backed tests for successful collection, API-key redaction, and HTTP failure recording. GTFS-RT protobuf parsing, vehicle-position normalization, observed stop events, and headway/bunching metrics remain open v1 work.

Added GTFS-RT protobuf parsing and raw-snapshot ingestion. `@bp/sources` now uses `gtfs-realtime-bindings` to decode GTFS-RT FeedMessage bytes into normalized vehicle-position, trip-update, stop-time-update, and alert records with route-id normalization for MTA-prefixed route IDs. Added local parsed GTFS-RT tables plus `ingest:gtfs-rt-snapshots -- --run-id <run_id>` to parse collected raw snapshots, persist entity rows, store parsed snapshot counts, and record malformed protobufs as `parse_error`. Observed stop-event inference and headway/bunching metrics remain open.

Added run-scoped observed headway construction. `build:observed-headways -- --run-id <run_id>` reads parsed GTFS-RT vehicle positions, collapses duplicate observations from the same vehicle at the same route/direction/stop, stores observed stop events in `local_observed_vehicle_stop_event`, and stores successive-vehicle headway samples in `local_observed_headway_sample`. This creates the substrate for observed reliability; route/month summaries, bunching, long-gap, wait-time reliability, and confidence gates remain open.

Added route/month observed reliability summaries. `route-observed-reliability -- --run-id <run_id> --year YYYY --month M` reads observed headway samples, joins scheduled reliability baselines, and writes `local_route_observed_reliability_summary` rows for every built route in the month. The summary includes observed average/median/p90/max headway, bunching share, long-gap share, expected wait, scheduled wait comparison, sample count, stop/direction coverage, and explicit `insufficient_gtfs_rt_samples` status when a route lacks enough observed samples. It also updates reliability source statuses for observed headways, bunching, and wait reliability while preserving scheduled-headway statuses.

Exported observed reliability summaries into the D1 serving contract. Added `route_observed_reliability_summary`, seed/export projection, verification table-count checks, and typed repository readback through `listRouteObservedReliabilitySummaries`. The D1 migration only creates the new observed reliability table; the legacy `route_artifact` table remains declared in schema for migration compatibility but is still not used by export/readback.

Started intervention evaluation for Data Pipeline v1. Added `route-intervention-evaluation -- --year YYYY --month M`, local tables `local_intervention_event` and `local_route_intervention_comparison`, and D1 serving tables `intervention_event` and `route_intervention_comparison`. The first implementation produces descriptive ACE/ABLE before/after route comparisons from monthly route trends, records pre/post windows, sample counts, speed and ridership deltas, explicit evaluation levels, future/insufficient-data statuses, and non-causal caveats. D1 export/verification now covers these rows, and route post-build runs the intervention evaluation step.

Started corridor modeling for Data Pipeline v1. Added `corridor-model -- --year YYYY --month M`, local corridor tables, D1 corridor serving tables, typed `listCorridorSummaries` readback, export/verification row-count checks, and route post-build integration. The first corridor model assigns every public-visible route to a deterministic primary-street corridor or explicit unassigned placeholder, then summarizes route count, ridership, speed, hotspot count, observed reliability coverage, and intervention comparison coverage at the corridor/month level.

Started final brief body generation for Data Pipeline v1. Added `brief-artifacts -- --year YYYY --month M` to render public-visible route and corridor briefs as JSON, Markdown, and HTML under `data/artifacts/briefs/`. Local and D1 artifact metadata now record artifact keys, content types, byte lengths, and SHA-256 hashes for route and corridor brief bodies. Route post-build now runs corridor modeling, brief generation, artifact audit, then D1 export, and `verify:d1` exercises typed route/corridor artifact readback. Running the current March 2026 local DB produced 350 route briefs, 209 corridor briefs, 1,677 total body artifacts, and a passing route-batch audit; D1 verification still shows 0 observed reliability and 0 intervention comparison rows in that local export, so the production data run remains open.

Added the Data Pipeline v1 QA gate. `check:pipeline-v1 -- --year YYYY --month M` now verifies local route coverage, build eligibility, route-batch audit status, route/corridor brief artifact completeness, observed reliability summaries and source statuses, intervention events/comparisons and caveats, corridor membership, and D1 export readback. Fixture-backed tests cover both a complete tiny network and an incomplete network. The current March 2026 local DB fails this gate as expected on missing observed reliability and intervention comparison rows, preserving the remaining v1 work as explicit issue codes.

Ran the March 2026 v1 catch-up data chain against the local DB. Full-network speed trend ingestion produced 5,171 route/month speed trend rows, and chunked ridership backfill filled ridership coverage for all 5,171 rows. `route-observed-reliability` produced 381 reliability status rows, all marked `insufficient_gtfs_rt_samples` with 0 observed headway samples because no Bus Time API key or collected GTFS-RT run is available in this environment. `route-intervention-evaluation` produced 79 ACE/ABLE events and 79 route comparisons, including 22 evaluated speed before/after comparisons and 21 evaluated comparisons with ridership deltas. Regenerated corridor summaries and route/corridor brief bodies, then `route-batch-audit`, `verify:d1`, and `check:pipeline-v1` all passed for March 2026. The gate now reports observed-vs-insufficient reliability counts, total observed headway samples, and speed/ridership trend coverage so the missing GTFS-RT sample coverage remains visible even when the structural v1 gate is green.

Tightened `check:pipeline-v1` so strict v1 QA fails when observed reliability rows exist but no route has observed GTFS-RT sample coverage. The March 2026 local DB now fails strict mode on `observed_reliability_no_observed_routes` and `observed_reliability_sample_coverage_insufficient`; `--allow-insufficient-gtfs-rt` remains available for structural DB/export/artifact verification when no Bus Time key or GTFS-RT collection run is available.

Added `finalize:pipeline-v1` as the executable v1 finalization runbook for an existing full-network route build. The command refreshes route speed trends, backfills ridership trends in chunks, builds observed reliability from a GTFS-RT run id or explicit insufficient-sample structural mode, then runs intervention evaluation, corridor modeling, brief artifact generation, route-batch audit, D1 verification, and the v1 QA gate. Tests cover strict observed-GTFS-RT finalization, required run-id validation, and explicit structural fallback.

Expanded strict `check:pipeline-v1` GTFS-RT provenance checks. Observed reliability rows now have to trace back to completed GTFS-RT collection run rows, successful feed snapshots, parsed vehicle-position snapshots, and persisted observed headway sample rows. Added fixture coverage for a false-positive observed summary that lacks backing collection/headway rows.

Expanded intervention-side v1 QA. `check:pipeline-v1` now fails when route/month trend rows are missing, speed or ridership trend coverage is absent, ACE/ABLE comparisons exist without any evaluated before/after rows, or evaluated comparisons have no ridership deltas. Added fixture coverage for missing trend coverage.

Started the local pipeline DB cutover. Added `@bp/db/local` with a Bun SQLite Drizzle client, generated local migrations, Drizzle's Bun SQLite migration runner, and route-network repositories for catalog, month coverage, readiness, and build-plan rows. The route catalog and month coverage ingests now upsert local DB rows, while readiness and build-plan builds read from local DB and write their computed rows back to it. Existing JSON artifacts remain as compatibility/debug outputs for this first slice.

Hard-cut the first route-network handoffs to local DB. D1 export, D1 verification, route batch audit, and graph-based planned route execution now read route catalog, route coverage, readiness, and build-plan state from `@bp/db/local` instead of `route-catalog.json`, `route-month-coverage-*.json`, `route-readiness.json`, or `route-build-plan.json`. The readiness and build-plan builders now persist local DB rows only, leaving JSON files for source/debug artifacts rather than required pipeline state.

## [2026-04-29] engineering | Crash-safe network build and SQLite fixes

Added `bun run build:network` as a crash-safe, resumable replacement for `build:planned-routes`. The runner checkpoints batch progress to local DB (`local_route_batch_status`, `local_route_batch_built_route`, `local_route_batch_issue`) and a JSON summary after every route. Resume skips already-built routes on restart. Deleted all M1-specific pipeline commands and generalized into route-agnostic code. Added `build:network` to root `package.json`.

Fixed three SQLite issues that blocked full-network builds: (1) duplicate bus-lane segment IDs from Socrata source data — added deduplication in `replaceBusLanes`. (2) SQLite bind-parameter limit exceeded by large inserts — added centralized `batchInsert` helper in `@bp/db/local/client.ts` that chunks inserts in batches of 500 rows, applied to bus lanes, segment speeds, ridership, schedules, stops, and census tracts. (3) `SQLITE_BUSY` database locking from concurrent connections — added `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` to `openLocalPipelineDb`.

Fixed type errors in Codex-generated pipeline files where `parseBuildArgs` functions annotated return types as `Required<ArgsType>` but actually returned `createMonthContext(args)` which adds `isoMonth`. Removed explicit return type annotations to let TypeScript infer correctly. Added `"running"` to the D1 batch status schema enum.

## [2026-04-29] data | First full-network build — March 2026

Completed the first successful all-routes monthly build. `build:network -- --year 2026 --month 3` built 381/381 routes with zero issues. The local pipeline DB is 1.6 GB with 3,429 route artifacts. Key table counts: 381 route scorecards, 381 brief summaries, 350 comparison ranks, 381 reliability baselines, 381 build-plan rows.

D1 export and verification passed: 381 route catalog rows, 3,429 artifact rows, 381 scorecards, 350 comparison ranks, 381 batch built-route rows, batch status `pass`. Seed SQL is 3 MB / 12,632 lines. Route month trends and equity context are empty for this run (require separate backfill steps).

## [2026-04-29] analysis | Methodology validation

Added `knowledge/wiki/analysis/methodology_validation.md` with a code-level audit of all six per-route analysis components. Updated `hotspot_detection.md` and `route_score.md` to reflect the actual implemented formulas. Key findings: hotspot detection math is correct but uses route-level ridership as a segment proxy; route score is a functional two-factor heuristic (speed + hotspot count) vs the planned five-factor model; bus lane matching is Manhattan-only due to a hardcoded filter; schedule comparison and speed/ridership profiles are correct. Updated `knowledge/index.md` open issues to reflect current state.

## [2026-04-29] engineering | Remove JSON artifact file writes — hard cutover to local DB

Removed all JSON artifact file writes from the route build pipeline. The pipeline previously wrote 9 JSON files per route to `data/artifacts/route-slices/` (51 MB for 381 routes). Nothing in the production pipeline read them back — the local SQLite DB was already the source of truth for all downstream consumers including D1 export.

Deleted files:
- `tools/pipeline/src/lib/artifacts.ts` — `writeRouteSliceArtifact`, `fileDigest`, path helpers
- `tools/pipeline/src/jobs/build/route-artifact-manifest.ts` — read JSON files to compute hashes, stored in `local_route_artifact`
- `packages/db/src/d1/queries/route-artifacts.ts` — D1 artifact query layer

Removed tables:
- `local_route_artifact` from local schema and repositories
- `route_artifact` from D1 schema, seed generation, and serving queries

Simplified:
- `route-batch-audit.ts` rewritten from 227 to 78 lines — no longer reads files from disk, queries built routes from DB only
- `route-core-artifacts.ts`, `route-profiles.ts`, `route-secondary-artifacts.ts` — removed all `writeRouteSliceArtifact` calls and file path return values
- `route-slice-pipeline.ts` — removed artifact manifest step and `artifactCount` from result type
- D1 export pipeline — removed `routeArtifacts` from inputs, `artifactRowCount` from output, `route_artifact` from verification
- `routeCount` in D1 seed now derived from scorecard count instead of batch status

Moved `routeSliceKey` helper from deleted `artifacts.ts` to `tools/pipeline/src/lib/route-job.ts`.

Net result: ~4,190 lines removed across 71 files. All 42 pipeline tests and 19 db tests pass. Types clean.

## [2026-05-17] engineering | GTFS-RT v1 preflight diagnostic

Added `gtfs-rt:preflight` to diagnose the observed-reliability layer before strict v1 finalization. The command reports `MTA_BUS_TIME_API_KEY` presence, selected collection run status, successful vehicle-position snapshots, parsed vehicle-position rows, observed headway samples, route/month observed reliability rows, source-status coverage, route sample coverage, issue codes, and next-step recommendations. It exits nonzero when the observed layer is not strict-v1 ready but still prints JSON diagnostics. Added fixture-backed tests for an empty local DB blocker state and a complete collected/parsed/headway/reliability state. Updated the CLI command reference and v1 completion plan.

## [2026-05-17] engineering | Bus-lane intervention source-gap coverage

Expanded `route-intervention-evaluation` so public routes with matched NYC DOT bus-lane geometry now get explicit `nyc_dot_bus_lanes` source-gap comparison rows when the pipeline lacks route-level bus-lane implementation dates for before/after evaluation. The March 2026 local run now has 251 intervention events/comparisons: 79 ACE/ABLE rows and 172 bus-lane source-gap rows. `check:pipeline-v1` now fails if a public route with matched bus-lane geometry lacks a bus-lane intervention comparison row, and reports bus-lane matched/comparison/source-gap counts. After refreshing corridor summaries, brief artifacts, route-batch audit, and D1 export, structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` passes with 251 intervention comparison rows; strict mode still correctly fails only on missing observed GTFS-RT samples.

## [2026-05-17] engineering | Source freshness gate for v1 QA

Expanded `check:pipeline-v1` to require fresh local source probe metadata for the v1 source set before treating a pipeline run as publishable. The gate now checks 10 required source captures under `knowledge/raw/metadata` by default, reports fresh/missing/stale/inactive counts, supports `--max-source-probe-age-days`, and allows tests to point at fixture metadata with `--source-metadata-dir`. Fixture coverage now includes complete source metadata plus missing, stale, and inactive probe captures. This closes the source-freshness QA gap while leaving the hard v1 blocker unchanged: strict completion still requires real observed GTFS-RT headway samples from a Bus Time collection run.

## [2026-05-17] engineering | GTFS-RT coverage confidence gate

Tightened strict `check:pipeline-v1` so observed reliability must cover a meaningful share of public routes, not merely one route with samples. The gate now defaults to a 90% observed-route coverage requirement, supports `--min-observed-route-share` and `--min-observed-route-count`, reports observed-route share and required observed rows, and fails if any row marked `observed` is below its own per-route sample threshold. `finalize:pipeline-v1` now forwards those observed coverage options into the v1 QA gate. Fixture coverage now includes insufficient observed-route coverage and below-threshold observed rows. The March 2026 local DB still fails strict mode because it has 381 insufficient GTFS-RT rows and 0 observed headway samples.

## [2026-05-17] engineering | Corridor assignment quality gate

Expanded `check:pipeline-v1` corridor QA beyond existence checks. The gate now reports assigned, ambiguous, and unassigned corridor route-member counts plus ambiguity/unassigned shares, defaults to allowing at most 15% ambiguous assignments and 2% unassigned placeholders, and supports `--max-corridor-ambiguous-route-share` and `--max-corridor-unassigned-route-share`. Fixture coverage now fails deliberately ambiguous and unassigned corridor assignments. The current March 2026 structural run remains green with 322 assigned, 28 ambiguous, and 0 unassigned corridor route members.

## [2026-05-17] engineering | D1 export contract summaries

Expanded the D1 export contract so `export:d1` writes `export-summary.json` with schema/seed paths, byte lengths, SHA-256 hashes, and all generated row counts, while `verify:d1` writes `verify-summary.json` with expected-vs-loaded table counts and typed repository readback counts. Fixture-backed export and verification tests now assert the summary files. Running March 2026 `verify:d1` regenerated current summaries with 381 observed reliability rows, 251 intervention comparisons, 1,050 route artifact rows, 627 corridor artifact rows, and a 5.7 MB D1 seed file hash.

## [2026-05-17] engineering | Static brief artifact manifest

Expanded `route-batch-audit` so the static artifact audit now writes `data/artifacts/briefs/<month>/manifest.json` with every route/corridor brief artifact key, owner, content type, byte length, SHA-256 hash, totals, and audit issues. `check:pipeline-v1` now exposes the manifest path in its audit result. Fixture tests cover passing manifests and failing manifests with hash/byte-length issues. The current March 2026 structural run writes a 1,677-artifact manifest for 350 public route briefs and 209 corridor briefs.

## [2026-05-17] engineering | GTFS-RT collection quality gate

Tightened strict `check:pipeline-v1` so observed GTFS-RT reliability now requires collection-window evidence, not just reliability rows. The gate now checks the observed run's completed collection duration, sample cadence, requested `vehicle_positions` feed, and successful vehicle-position snapshot coverage for the configured collection window. `finalize:pipeline-v1` forwards the same GTFS-RT QA threshold options. Fixture coverage now catches a too-short collection window and too-sparse cadence while preserving structural `--allow-insufficient-gtfs-rt` mode for environments without a Bus Time API key.

## [2026-05-17] engineering | GTFS-RT preflight collection QA

Expanded `gtfs-rt:preflight` to diagnose the same realtime collection quality requirements enforced by strict `check:pipeline-v1`: minimum collection window, maximum sample cadence, requested `vehicle_positions`, and successful vehicle-position snapshot coverage. The preflight JSON now reports those thresholds, collection-window counts, and a `hasCollectionWindow` readiness flag so the run can fail early before finalization.

## [2026-05-17] engineering | Brief GTFS-RT collection windows

Expanded generated route briefs so observed reliability JSON/Markdown carries the GTFS-RT collection window behind the sample metrics: run ID, start/end timestamps, requested and elapsed duration, sample cadence, requested feed types, snapshot counts, and successful vehicle-position snapshot count. Fixture coverage now verifies the collection-window payload in route brief artifacts.

## [2026-05-17] engineering | GTFS-RT smoke collection and brief JSON contract audit

Saved the Bus Time API credential in ignored local env files for the main repo and active Codex worktrees, with restrictive file permissions; the key is not committed and preflight reports only presence. Added `--run-id` support to `collect:gtfs-rt` so smoke and production collections can use stable run IDs from the CLI. A one-snapshot vehicle-position smoke run collected and ingested successfully, parsing 1,290 vehicle positions; strict preflight still correctly fails that run because the collection window is only a smoke test, not a v1 reliability window.

Expanded `route-batch-audit` beyond file byte/hash checks so route and corridor `brief.json` bodies are validated as contracts: artifact kind, month, owner ID, route observed reliability presence, observed reliability sample/status consistency, collection-window presence when a collection run exists, and corridor observed-reliability route-count metrics. Fixture coverage now catches a route brief that silently omits `observedReliability`.

## [2026-05-17] engineering | GTFS-RT analysis-month alignment

Hardened observed reliability so live GTFS-RT data cannot accidentally satisfy an older analysis month. `route-observed-reliability` now filters observed headway samples to the requested month before computing route summaries. Strict `check:pipeline-v1` and `gtfs-rt:preflight` now reject observed reliability whose collection run, successful vehicle-position snapshot fetches, or observed headway sample timestamps fall outside the analysis month. Fixture coverage catches out-of-month GTFS-RT provenance runs.

Confirmed the month split in local source coverage: April and May 2026 coverage probes currently have schedule rows but 0 speed routes, while March 2026 remains the complete public-source build month. Started a production-length May 2026 vehicle-position collection under run ID `gtfs-rt-v1-20260517T022348Z`; that run can advance the May observed layer but cannot honestly complete the March v1 gate.

Decoupled `route-observed-reliability` from monthly brief summaries for early realtime runs. When route/corridor briefs for a month are not built yet, observed reliability now falls back to the route catalog so a fresh GTFS-RT collection can still produce route/month observed and insufficient-sample rows before the full monthly brief layer exists.

Completed the production-length May 2026 GTFS-RT vehicle-position run `gtfs-rt-v1-20260517T022348Z`: 480/480 snapshots succeeded with 0 failures. Ingest parsed 480 snapshots into 358,875 vehicle-position rows. `build:observed-headways` produced 90,136 observed stop events and 73,702 headway samples. `route-observed-reliability -- --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T022348Z` produced 381 route rows, with 229 observed routes, 152 insufficient-sample routes, and 72,782 route-summary headway samples. `gtfs-rt:preflight` now passes strict observed-layer readiness for May 2026.

Fixed the GTFS-RT collection-window QA edge case exposed by the full May run. A requested 4-hour collection at 30-second cadence records 480 samples but only 479 elapsed intervals between the first and last sample, so strict QA now counts the final sample interval toward the effective collection window, capped at the requested duration. Added fixture coverage for this exact case in `gtfs-rt-preflight`.

Re-ran March 2026 v1 checks after repairing generated local route-batch rows from the existing March network summary. `route-batch-audit -- --year 2026 --month 3` passes with 381 routes and 1,677 brief artifacts. `check:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt` passes structurally. Strict March still correctly fails only on missing March GTFS-RT observed reliability: no observed routes, insufficient observed-route coverage, and 0 March headway samples. The v1 product decision remains whether to ship March structural evidence with a May observed appendix or wait for public speed coverage in a later month.

Added `audit:pipeline-v1` as a prompt-to-artifact completion audit command. The command runs the public structural and strict v1 gates, runs GTFS-RT preflight for a realtime month/run, summarizes public and realtime source coverage, and writes `data/artifacts/pipeline-v1/audit-<public-month>-<realtime-month>.json` with pass/partial/blocked checklist rows. The current March 2026 public-source + May 2026 realtime audit writes `audit-2026-03-2026-05.json` and is correctly blocked overall because the strict single-month v1 gate still fails and May has 0 speed routes.

## [2026-05-17] engineering | Isolated clean-rebuild smoke path

Fixed a clean-rebuild reproducibility gap where `build:network -- --db ...` still refreshed shared ACE and bus-lane sources into the default local DB. Shared refresh now passes the selected DB path through `ingestAceRoutes`, `ingestAceViolationSummary`, and `ingestBusLanes`, with fixture coverage.

Added `--artifact-root` and `--export-root` support across network build, route/corridor brief generation, route-batch audit, D1 export/verification, strict v1 check, v1 finalization, and `audit:pipeline-v1`. This lets clean rebuild proofs use an isolated DB plus isolated generated outputs instead of overwriting canonical `data/artifacts` and `data/exports` files.

Verified the new path with a one-route clean-DB smoke: catalog and coverage ingested into `data/local/pipeline-clean-smoke.sqlite`; `build:network -- --limit 1 --artifact-root data/artifacts/pipeline-clean-smoke --export-root data/exports/pipeline-clean-smoke` built M57; isolated `route-batch-audit` passed with 6 artifacts; isolated `verify:d1` passed from `data/exports/pipeline-clean-smoke/d1/2026-03/`. This proves the isolated rebuild shape, but the full-network clean rebuild remains open.

## [2026-05-17] engineering | Full-network clean rebuild proof

Completed the full isolated March 2026 clean rebuild from an empty local DB. The run ingested route catalog and March route coverage into `data/local/pipeline-clean-full.sqlite`, then `build:network -- --year 2026 --month 3 --db data/local/pipeline-clean-full.sqlite --no-resume --artifact-root data/artifacts/pipeline-clean-full --export-root data/exports/pipeline-clean-full` built 381/381 routes with 0 failed routes. `finalize:pipeline-v1 -- --allow-insufficient-gtfs-rt` on the same isolated DB/root set passed the v1 structural checker, produced 5,171 speed/ridership trend rows, 381 insufficient GTFS-RT reliability rows, 413 intervention comparisons with 22 evaluated, 209 corridors, 1,677 audited route/corridor brief artifacts, and a verified D1 export.

Extended `audit:pipeline-v1` with `--clean-db`, `--clean-artifact-root`, and `--clean-export-root` so the generated audit can record clean-rebuild evidence instead of carrying a stale missing-proof item. The current March public-source + May realtime audit remains blocked overall, but now marks the reproducible full-network public-source pipeline as pass. The remaining blockers are the strict single-month mismatch: March has public speed coverage but no March observed GTFS-RT samples, while May has observed GTFS-RT reliability but 0 public speed routes.

## [2026-05-17] engineering | Observed reliability window evidence in route briefs

Expanded route brief artifacts beyond route/month observed reliability summaries. `brief-artifacts` now derives top observed long-gap windows and top observed bunching windows from persisted GTFS-RT headway samples, grouped by NYC local weekday/hour, direction, and stop. Route brief JSON and Markdown include sample counts, median/p90/max observed headways, bunching and long-gap shares, expected wait, and excess wait for those windows when samples exist. `route-batch-audit` now validates that route brief JSON carries the observed reliability window contract when observed reliability rows exist.

Regenerated canonical March and isolated `pipeline-clean-full` March brief artifacts so the local static outputs match the new contract. Both route-batch audits passed with 1,677 artifacts and 0 issues; both D1 verifications passed; both structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` runs passed. The March public-source + May realtime audit remains blocked only on the known strict single-month source-alignment problem.

## [2026-05-17] engineering | Peer-adjusted intervention comparisons

Expanded ACE/ABLE intervention evaluation beyond raw descriptive before/after rows. Evaluated intervention comparisons now select public peer routes with sufficient trend coverage, matched on pre-period speed and ridership, and persist peer comparison route IDs, peer speed/ridership deltas, and adjusted speed/ridership deltas in local SQLite and D1 serving tables. Route brief JSON/Markdown now carries the adjusted deltas, and strict `check:pipeline-v1` fails when evaluated intervention rows lack peer-adjusted speed deltas. Dated bus-lane before/after evaluation remains open because the current bus-lane source-gap rows still lack route-level implementation dates.

## [2026-05-17] engineering | Segment-backed corridor assignments

Expanded `corridor-model` so public route membership prefers hotspot-segment street evidence before falling back to stop-name majority. `local_corridor_route_member` and D1 `corridor_route_member` now store `matched_segment_count` and `segment_evidence_score`; corridor brief JSON exposes those fields; strict `check:pipeline-v1` fails if no corridor membership has segment evidence. Regenerated canonical and `pipeline-clean-full` March artifacts: 350 public route memberships, 193 corridors, 1,186 corridor hotspots, 579 corridor brief artifacts, and 1,629 audited route/corridor artifacts. Both D1 verifications and both structural v1 checks passed. At this point the remaining corridor gap was shape-based review, which was closed later the same day.

## [2026-05-17] engineering | Corridor intervention context

Added local and D1 `corridor_intervention_context` tables so route-level intervention comparison rows are matched back to corridor members rather than only counted in corridor summaries. `corridor-model` now writes ranked context rows with route, event, program, implementation month, evaluation level, raw/adjusted speed and ridership deltas, comparison route count, and caveat. D1 seed export, verification, repository readback, corridor brief JSON/Markdown, and strict `check:pipeline-v1` now cover the context rows. Regenerated March artifacts and exports: canonical March has 251 corridor intervention context rows; isolated `pipeline-clean-full` has 413. Both route-batch audits, D1 verifications, structural v1 checks, and the March public + May realtime audit ran successfully; the audit remains blocked only on the strict single-month public/realtime source alignment and dated bus-lane before/after evaluation/domain review.

## [2026-05-17] engineering | Corridor shape review

Added `corridor-shape-review`, a post-build/finalize artifact that checks every public corridor route membership against GTFS route-shape geometry. The review matches corridor hotspot segment evidence back to segment-speed endpoint coordinates, computes endpoint-to-shape distances, and writes `data/artifacts/route-batches/{month}/corridor-shape-review.json` with pass/warning/missing statuses. Strict `check:pipeline-v1` now fails if the shape-review artifact is missing, stale, incomplete, or has non-passing segment-backed route assignments. Regenerated canonical and `pipeline-clean-full` March artifacts: both have 350/350 shape-reviewed public route memberships passing, 0 warnings, max endpoint distance 74.38m, and p95 endpoint distance 18.63m. The March public + May realtime audit now marks corridor grouping and corridor briefs as pass; remaining blockers are strict single-month public/realtime source alignment plus dated bus-lane before/after evaluation/domain review.

## [2026-05-17] engineering | Dated bus-lane intervention comparisons

Expanded `route-intervention-evaluation` to parse NYC DOT bus-lane `open_dates` values, including multi-date rows and month/year fallbacks. Public routes with matched bus-lane geometry now receive route-level `nyc_dot_bus_lanes` dated comparisons from the latest parseable matched opening month, while matched segments without parseable dates still get explicit source-gap rows. Canonical March now has 360 intervention comparisons: 79 ACE/ABLE rows and 281 bus-lane rows, including 166 dated bus-lane rows, 58 evaluated peer-adjusted bus-lane rows, and 115 bus-lane source-gap rows. Clean-full March now has 584 intervention comparisons, 326 dated bus-lane rows, and 176 source-gap rows. Regenerated corridor context, brief artifacts, route-batch audits, D1 exports, D1 verifications, structural v1 checks, and the March public + May realtime audit; structural checks pass and the audit remains blocked only on strict single-month source alignment plus remaining bus-lane source gaps/external methodology review.

## [2026-05-17] engineering | Detailed evaluation artifact manifests

Added `evaluation-artifacts`, a static artifact build for detailed observed reliability, route intervention, and corridor intervention payloads under `data/artifacts/evaluations/{month}/`. The generated `manifest.json` records artifact keys, content types, byte lengths, SHA-256 hashes, and row counts. `route-post-build` and `finalize:pipeline-v1` now run the job before brief artifact generation, and `check:pipeline-v1` verifies the manifest and payload contracts against local DB row counts. Regenerated canonical March evaluation artifacts with 381 observed reliability rows, 360 route intervention comparisons, and 360 corridor intervention context rows; regenerated clean-full artifacts with 381, 584, and 584 rows respectively. Added fixture tests for valid manifests, tampered payload detection, expected row-count mismatches, post-build sequencing, and v1 audit evidence. The remaining static artifact contract gap is map payload manifests.

## [2026-05-17] engineering | Static map artifact manifests

Added `map-artifacts`, a static map payload build under `data/artifacts/map/`. It writes source snapshot metadata, current Local/Limited/SBS route GeoJSON, current timepoint-stop GeoJSON, bus-lane GeoJSON, one all-day route-segment GeoJSON per public route/month, and `data/artifacts/map/{month}/manifest.json` with artifact keys, content types, byte lengths, SHA-256 hashes, feature counts, and route IDs. Route-segment payloads validate through `MapRouteSegmentFeatureCollectionSchema`; `route-post-build`, `finalize:pipeline-v1`, `check:pipeline-v1`, and `audit:pipeline-v1` now include the map artifact contract. Regenerated canonical and clean-full March 2026 map artifacts with 354 artifact rows, 350 route-segment artifacts, 4,134 route-segment features, 39,807 total map features, and 0 map manifest issues in structural v1 QA. Added fixture tests for valid map manifests, tampered hash/feature-count detection, missing route-segment coverage, and v1 QA failure when the map manifest is missing.

## [2026-05-17] engineering | GTFS-RT collection handoff status

Added `gtfs-rt:run-status`, a small handoff command for long Bus Time collection runs. It reports collection status, elapsed time, expected and observed snapshot rows, raw protobuf file counts/bytes, parsed snapshot counts, readiness flags, and exact next commands for ingestion, observed-headway building, observed reliability, and preflight. This supports the current 24-hour May 2026 vehicle-position collection run without relying on ad hoc SQLite queries between agents.

## [2026-05-17] engineering | Active observed-reliability run replacement

Changed route/month observed reliability rebuilds so a new `route-observed-reliability` run replaces prior observed reliability summaries for that analysis month. This prevents stale Bus Time runs, such as earlier smoke or shorter collection windows, from coexisting with the selected production run and double-counting route coverage in briefs, D1 exports, evaluation payloads, or strict v1 QA.

## [2026-05-17] engineering | Observed-reliability stale-run QA gate

Tightened `check:pipeline-v1` so stale observed-reliability rows cannot silently pass. The QA gate now reports duplicate route/month observed reliability rows and multiple active GTFS-RT run IDs for a month, and observed-route coverage is computed from unique public route IDs rather than row count. Added a regression fixture that inserts a stale GTFS-RT reliability row after artifact generation and verifies the gate fails.

## [2026-05-17] docs | V1 pipeline framing cleanup

Refreshed README, pipeline README, roadmap, ETL/CLI, and source-data pages so they describe the actual full-network v1 pipeline instead of the older M1-only prototype. GTFS-RT Bus Time collection is now documented as v1 observed-reliability evidence, M1 commands are marked as compatibility/fixture helpers, route/corridor brief artifacts plus evaluation/map manifests are documented as the current static serving outputs, and the remaining blocker is the strict single-month public/realtime source alignment.

## [2026-05-17] docs | Production source refresh scope

Clarified that Bus Time GTFS-RT is live forward collection, not historical backfill: partial run counts such as `98/2880` mean snapshots fetched since the run started. Updated the v1 completion plan, roadmap, and managed-services memo to include production refresh scope: a deployed GTFS-RT collector that writes raw snapshots and metadata to durable storage, plus a monthly MTA Open Data watcher that distinguishes schedule-only months from months with published route segment speed rows before rerunning the full build/finalize/export verification path.

## [2026-05-17] engineering | Route speed release availability check

Added `check:route-speed-availability`, a fixture-backed pipeline command that queries grouped MTA Bus Route Segment Speeds coverage by route/month, reports the latest complete speed month, marks requested months as `complete`, `insufficient_speed_routes`, or `missing_speed`, and writes `data/artifacts/source-availability/route-speed-availability.json` by default. Live checks on 2026-05-17 reported March 2026 as the latest complete speed month with 353 routes, 472,361 rows, and 7,249,761 bus trips; April and May 2026 both returned `missing_speed`. This makes the monthly-public-source watcher substrate explicit instead of relying on ad hoc Socrata queries.

## [2026-05-17] engineering | Source availability in v1 audit

Extended `audit:pipeline-v1` to read the route-speed availability artifact when present and include it under `sourceAvailability.routeSpeed`. The single-month source availability checklist now cites the latest complete speed month and requested-month status from the watcher artifact alongside local DB coverage counts, so release audits preserve both built-state evidence and upstream-publication evidence.

## [2026-05-17] engineering | GTFS-RT run-status artifact

Extended `gtfs-rt:run-status` so long-running Bus Time collection handoffs write `data/artifacts/gtfs-rt/run-status/<run_id>.json` by default, with `--output` and `--artifact-root` overrides. The artifact includes collection progress, raw snapshot file counts, parse readiness, and exact next commands, making active 24-hour runs easier to resume after thread or agent handoff.

## [2026-05-17] docs | Active GTFS-RT handoff runbook

Added an active handoff runbook for `gtfs-rt-v1-20260517T103607Z-24h` to the Data Pipeline v1 plan. It records the canonical local DB path, artifact root, generated run-status artifact path, polling command, post-completion ingest/build/preflight commands, and the March public + May realtime audit command. The runbook explicitly notes that this remains appendix evidence until public route segment speed rows are published for the same realtime month.

## [2026-05-17] engineering | Source availability rebuild decision

Extended `check:route-speed-availability` with `--last-built-year` and `--last-built-month`. The generated source-availability artifact now includes `releaseDecision`, with `shouldRebuild` set when the latest complete speed month is newer than the last built month. This gives a future monthly watcher an explicit rebuild decision instead of forcing it to interpret latest/requested month fields itself.

## [2026-05-17] docs | Production source cadence acceptance

Confirmed April 2026 route-speed availability with `check:route-speed-availability`: latest complete public speed month remains March 2026; April has 0 route-speed rows; with March as the last built month the release decision is `no_new_complete_month` and `shouldRebuild=false`. Updated the v1 completion plan and pipeline README to make the source cadence explicit: GTFS-RT counts grow because collection is live forward capture, while monthly route-speed data is delayed aggregate data. Added production refresh acceptance criteria for a scheduled GTFS-RT collector plus a monthly public-source watcher.

## [2026-05-17] engineering | Source refresh plan artifact

Added `plan:source-refresh`, a small pipeline command that writes `data/artifacts/source-refresh/plan.json`. The artifact combines the route-speed rebuild decision with explicit GTFS-RT collector and monthly route-speed watcher jobs, statuses, cadence, evidence, and next actions. Live May 2026 output marks the GTFS-RT collector `required` and the monthly watcher `idle` because latest complete route-speed data is still March 2026 and March is already the last built month.

## [2026-05-17] engineering | Source refresh plan in v1 audit

Extended `audit:pipeline-v1` so `sourceAvailability` includes both `routeSpeed` and `refreshPlan`. The single-month source availability checklist now includes source-refresh job statuses such as `gtfs_rt_collector=required` and `route_speed_monthly_watcher=idle`. If public/realtime months align but the source-refresh plan artifact is missing, the checklist row is `partial` with an explicit missing item instead of silently passing.

## [2026-05-17] engineering | Recovered GTFS-RT import path

Added `import:bus-observatory-gtfs-rt`, a TypeScript/Bun pipeline command that imports canonical CSV rows exported from the third-party Bus Observatory Parquet archive into the existing local GTFS-RT collection, snapshot, parsed snapshot, and vehicle-position tables. The command labels the run as `third_party_recovered` through the Bus Observatory source id and returns row-level QA facts such as sample count, route count, vehicle count, min/max timestamp, max timestamp gap, and skipped rows. Added a fixture-backed pipeline test plus `publish:serving-release`, a dry-run-by-default one-shot D1/R2 promotion script, and documented the remaining data-infrastructure finish line: recovered March import/QA, one-shot D1/R2 publish, lightweight cron/watchers only, and website unfixture gates.

## [2026-05-17] engineering | Website API endpoint architecture

Drafted `knowledge/wiki/engineering/web_api_endpoint_architecture.md` for the newer mobile-first website. The plan keeps the Worker as a thin BFF over D1 serving projections and R2 artifacts, maps endpoints to the current map/feed/route/compare/search surfaces, requires domain response schemas with completeness metadata, and preserves the rule that public request handlers do not import source adapters, analytics, pipeline code, or wiki files. The main checkout was monitored until frontend/API edits were quiet for more than five minutes, then the docs-only plan was applied without touching the active frontend work.

## [2026-05-17] engineering | Worker GTFS-RT scheduled capture

Added a lightweight Cloudflare Worker scheduled handler for production GTFS-RT vehicle-position capture and monthly route-speed publication checks. GTFS-RT capture is inert unless the deployed environment has both `GTFS_RT_RAW` and `MTA_BUS_TIME_API_KEY`; the monthly watcher is inert unless `ARTIFACTS` is configured and compares latest complete speed coverage against optional `LAST_BUILT_SPEED_MONTH`. When configured, the Worker writes raw protobuf snapshots, redacted JSON manifests, and a compact route-speed availability artifact to R2. The public request handler still does not import pipeline code, and heavy parsing/finalization remains in the Bun pipeline. The cron entrypoint runs once per minute, so strict 30-second production sampling still needs follow-up queue/scheduler design.

## [2026-05-17] engineering | Full repo check baseline

Ran `bun run check` after source-refresh and QA hardening. Typecheck, Biome style, web architecture, Claude config, package/pipeline/domain/source/db unit tests, web fixture tests, and Cloudflare Worker tests all passed. This confirms the repo code/contract baseline is green while strict Data Pipeline v1 remains blocked by same-month public speed and realtime source alignment.

## [2026-05-17] engineering | GTFS-RT scheduled cadence hardening

Added a batched scheduled GTFS-RT capture helper for the Worker. The existing single-snapshot capture remains available, while production scheduled refresh can now take multiple spaced vehicle-position snapshots within one cron invocation. With `GTFS_RT_SAMPLES_PER_CRON=2` and `GTFS_RT_SAMPLE_SECONDS=30`, the one-minute Cloudflare cron can write two R2 protobuf snapshots per invocation and match the 30-second cadence expected by strict v1 GTFS-RT QA. Updated the Worker harness and v1 completion plan with the cadence configuration.

## [2026-05-17] engineering | Intervention methodology audit gate

Extended `audit:pipeline-v1` with an explicit `interventions.methodologyGate` section. The gate currently records `descriptive_only`, `externalReviewStatus=open`, `causalClaimsAllowed=false`, and the supported evidence levels, so a release audit cannot accidentally treat peer-adjusted before/after comparisons as causal estimates. Updated the v1 plan and methodology validation page to point at this audit field.

## [2026-05-17] engineering | V1 audit objective contract

Extended `audit:pipeline-v1` so the generated JSON includes the full v1 objective and explicit success criteria before the evidence checklist. This makes `data/artifacts/pipeline-v1/audit-*.json` a self-contained prompt-to-artifact contract rather than only a status summary.

## [2026-05-17] docs | Source refresh docs drift cleanup

Updated the web README, v1 completion plan, and roadmap so they reflect the current source-refresh implementation: the Worker scheduled hook can capture GTFS-RT snapshots to R2, can be configured for strict 30-second sampling from a one-minute cron, and includes a monthly route-speed watcher. Remaining production-refresh work is now framed as deployment/configuration, monitoring, R2-to-pipeline handoff, and rebuild triggering when a new complete public speed month appears.

## [2026-05-17] engineering | Worker R2 GTFS-RT import handoff

Added `import:gtfs-rt-r2-manifests`, a Bun pipeline command that reads Worker-written GTFS-RT manifest JSON from a local R2 mirror/export, registers a completed local collection run, and inserts feed snapshot metadata pointing at the mirrored protobuf object files. This gives the production Worker capture path a concrete handoff into the existing `ingest:gtfs-rt-snapshots`, observed-headway, and observed-reliability pipeline without adding heavy parsing to the Worker.

## [2026-05-17] product | V1 release boundary reframed

Reframed Data Pipeline v1 as the latest defensible public-source monthly release plus a labeled realtime observed appendix when available. Same-month public route-speed and collected GTFS-RT alignment is now an observed monthly promotion condition, not a v1 blocker. Updated `audit:pipeline-v1` to emit a `releaseModel` with canonical monthly release, realtime appendix, and promotion readiness, and updated roadmap/docs so March 2026 public evidence plus May 2026 observed GTFS-RT can be assessed without overclaiming source alignment.

## [2026-05-17] product | Completeness-aware v1 layers

Extended the v1 release model from a pass/fail boundary into completeness-aware layers: `Baseline Release`, `Current Signal`, `Pending Publication`, and `Observed Release`. `audit:pipeline-v1` now emits `releaseModel.layers` plus `releaseModel.metricCompleteness` with statuses such as `complete`, `partial_realtime_only`, `partial_public_monthly_only`, `missing_speed`, `missing_realtime`, `insufficient_samples`, and `source_lag_expected`. This lets the pipeline distinguish confident baseline claims, directional current signals, unavailable claims, and expected source lag.

## [2026-05-17] engineering | Bus Observatory GTFS-RT recovery probe

Added `check:bus-observatory-gtfs-rt`, a TypeScript/Bun probe for the third-party Bus Observatory NYC bus GTFS-RT Parquet archive in the public `busobservatory-lake` S3 bucket. The March 2026 live probe found all 31 March-labeled files plus the 2026-04-01 bridge file, 32 files total and 3,591,483,083 bytes, and wrote `data/artifacts/source-availability/bus-observatory-gtfs-rt-2026-03.json` with `candidateLabel = third_party_full_month_candidate_pending_row_level_qa`. `audit:pipeline-v1` now reads that artifact as `releaseModel.thirdPartyRecoveredGtfsRtCandidate`, but keeps `canPromoteObservedRelease=false` until Parquet row-level QA and an import/conversion path pass.

## [2026-05-17] engineering | Bus Observatory recovered reliability loaded

Added `import:bus-observatory-reliability-summary`, a repeatable Bun pipeline command for loading precomputed route-level observed-reliability summaries from the third-party Bus Observatory archive when raw Parquet row import is too large for the local SQLite path. The command fills every current catalog route, skips archive route IDs outside the catalog, and writes reliability source-status rows tied to the recovered run id. Loaded March 2026 from `data/working/bus-observatory/2026-03/route-observed-reliability-summary.csv`: 381 catalog routes, 346 observed, 35 insufficient, 2,571,297 derived samples, and 7 non-catalog archive routes skipped. Regenerated `brief-artifacts`, `route-batch-audit`, `evaluation-artifacts`, `map-artifacts`, `export:d1`, and `verify:d1`; D1 verification passes with `route_observed_reliability_summary = 381` and `route_batch_issue = 0`, and structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` passes for March 2026.

## [2026-05-17] engineering | Bus Observatory strict raw-backed recovery

Added `import:bus-observatory-headway-samples`, a chunked recovered-data importer that streams DuckDB-derived Bus Observatory headway samples into `local_observed_headway_sample` and registers compact 30-second snapshot evidence in the GTFS-RT collection/feed/parsed tables. This avoids loading all 81M raw vehicle positions into SQLite while still giving strict GTFS-RT provenance gates completed collection rows, successful vehicle-position snapshots, parsed snapshot rows, parsed vehicle-position evidence rows, and persisted observed headway samples. Generated March 2026 recovered CSVs under ignored `data/working/bus-observatory/2026-03/raw-provenance/`: 89,109 snapshot buckets and 2,612,086 headway samples. Rebuilt route observed reliability from the raw-backed samples, yielding 381 catalog route rows, 346 observed routes, 35 insufficient routes, and 2,571,297 catalog-route samples. Strict `gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03`, `verify:d1`, and strict `check:pipeline-v1 -- --year 2026 --month 3` all pass.

## [2026-05-17] engineering | Release status API and docs refresh

Added `ReleaseStatusResponseSchema`, `releaseStatusResponseJsonSchema`, and Worker endpoint `GET /api/v1/status` over D1 route-batch and observed-reliability serving tables. The endpoint reports the active baseline month, route/artifact/issue counts, observed and insufficient GTFS-RT route counts, sample count, inferred realtime provenance, and completeness caveats; `bus-observatory-*` runs are labeled `third_party_recovered`. Added Worker coverage for the recovered March provenance path and the static-asset SPA fallback. Verified with `bun --filter @bp/web test:worker`, `bun --filter @bp/web typecheck`, `bun --filter @bp/domain typecheck`, `bun run check:style`, and strict `bun run check:pipeline-v1 -- --year 2026 --month 3`. Refreshed data-infrastructure and API docs so they reflect the now-loaded raw-backed March recovery, the dry-run serving publish path, and the remaining remote deployment/frontend unfixture work.

## [2026-05-17] engineering | Route-card API unfixture step

Added `RouteCardSchema`, `RouteListResponseSchema`, `routeListResponseJsonSchema`, and Worker endpoint `GET /api/v1/routes`. The endpoint reads D1 route brief summaries and observed reliability summaries for the selected month, returns compact ranked cards, and labels each card with completeness/confidence metadata. Recovered `bus-observatory-*` reliability rows are surfaced as medium-confidence third-party recovered evidence. Added Worker coverage for observed and insufficient recovered route cards, plus the `GET /api/schema/route-list` schema endpoint.

## [2026-05-17] engineering | Route profile API unfixture step

Added `RouteArtifactRefSchema`, `RouteProfileResponseSchema`, `routeProfileResponseJsonSchema`, and Worker endpoint `GET /api/v1/routes/:routeId/profile`. The endpoint validates route IDs and months, reads one D1 route brief summary, observed reliability summaries, and route artifact metadata, then returns peak/slowest windows, recovered observed-reliability metrics, completeness caveats, and R2 artifact references. Added Worker coverage for the recovered March route profile path and the `GET /api/schema/route-profile` schema endpoint.

## [2026-05-17] engineering | Map manifest and R2 artifact API

Added `MapArtifactEntrySchema`, `MapManifestResponseSchema`, `mapManifestResponseJsonSchema`, Worker endpoint `GET /api/v1/map/manifest`, and R2 proxy endpoint `GET /api/v1/artifacts/*`. The manifest endpoint reads generated `map/<month>/manifest.json` from the `ARTIFACTS` R2 binding, validates metadata, and adds API fetch paths for each artifact. The artifact endpoint streams R2 objects with immutable cache headers and rejects invalid keys. Added Worker coverage for a generated route-segment GeoJSON manifest entry and artifact fetch.

## [2026-05-17] engineering | Hotspot and compare API unfixture step

Added `HotspotCardSchema`, `HotspotListResponseSchema`, `hotspotListResponseJsonSchema`, `RouteCompareResponseSchema`, `routeCompareResponseJsonSchema`, Worker endpoint `GET /api/v1/hotspots`, and Worker endpoint `GET /api/v1/compare`. Hotspots flatten D1 corridor hotspot summaries into ranked monthly cards with baseline-release quality labels. Compare reads D1 route comparison ranks plus observed reliability summaries for two routes, returns route cards, metric deltas, and recovered-realtime provenance caveats. Added Worker coverage for both endpoints and their schema routes.

## [2026-05-17] engineering | API-first frontend loaders

Added `apps/web/src/lib/api-client.ts` and switched the main panel data loaders to call `/api/v1` first for hotspots, route profiles, and compare data, with fixture fallback when the API is unavailable. Route profile params now accept generated route IDs beyond the small fixture list, and default compare routes use real serving IDs (`B46-SBS`, `M15-SBS`). Added loader tests that mock API responses and verify they map into the current panel component data shape. The map canvas still uses fixture geometry; its next unfixture step is reading `/api/v1/map/manifest` and R2 artifact URLs.

## [2026-05-17] engineering | API-backed map route lines

Extended `BusPulseMap` so it keeps fixture geometry for a nonblank first paint, then fetches `/api/v1/map/manifest`, finds the generated `map_route_shapes_geojson` artifact, and replaces the MapLibre route line source with R2-backed generated GeoJSON when available. The generated route-shape properties are normalized into the current map interaction shape (`name`, `grade`, `color`) so route hover/click still works while the rest of the map layers continue to use fixture stops/labels as fallback.

## [2026-05-17] engineering | GTFS-RT R2 mirror helper

Added `pull:gtfs-rt-r2-run`, a dry-run-by-default shell helper for the deployed Worker capture handoff. Given a reviewed manifest object-key list, it mirrors Worker-written GTFS-RT manifests and paired raw protobuf objects from R2 with `bunx --bun wrangler`, then prints the matching `import:gtfs-rt-r2-manifests` command for the local pipeline.

The mirror helper now defaults to `data/raw/r2-mirror/<run-id>/` so a handoff import only sees manifests for the intended production capture run unless an operator deliberately overrides `--output`.

R2 transfers now use plain `bunx wrangler` rather than `bunx --bun wrangler`; in this environment, the Bun-executed Wrangler path successfully created objects but returned zero-byte payloads for larger R2 uploads/downloads.

## [2026-05-17] operations | Cloudflare production runbook

Added `knowledge/wiki/engineering/cloudflare_operations_runbook.md` with the concrete production deployment path: required D1/R2 bindings, Worker vars and secrets, the one-shot March 2026 serving publish, deployed API verification, scheduled GTFS-RT capture proof, R2 manifest mirroring, downstream pipeline import, and monthly speed watcher rebuild steps. The committed Worker config still avoids fake Cloudflare IDs; production completion requires real resources and `publish:serving-release --execute`.

Added `apps/web/wrangler.production.example.jsonc` as a copyable production binding template for `DB`, `ARTIFACTS`, `GTFS_RT_RAW`, baseline-month vars, and strict GTFS-RT capture cadence. The active `wrangler.jsonc` still avoids placeholder resource IDs.

Created production Cloudflare resources in account `7aa7065a7e971d97435b3f22098d78b0`: D1 `bus-priority-serving` (`d9cd87e2-1f77-44eb-b712-e834b23497b0`), R2 `bus-priority-artifacts`, and R2 `bus-priority-gtfs-rt-raw`. Wired those bindings into `apps/web/wrangler.jsonc` and `packages/db/wrangler.d1.jsonc`, uploaded the `MTA_BUS_TIME_API_KEY` Worker secret, applied the March 2026 D1 schema/seed remotely, and uploaded the March 2026 artifact set to remote R2. R2 transfers must use plain `bunx wrangler`; `bunx --bun wrangler` produced zero-byte objects for larger transfers in this environment.

Added the R2 lifecycle rule `expire-gtfs-rt-after-21-days` on `bus-priority-gtfs-rt-raw` for prefix `gtfs-rt/`. This keeps strict 30-second raw GTFS-RT capture inside the expected Workers Paid/R2 free storage envelope while preserving a three-week mirror/import window.

Deployed the Worker directly from `apps/web/wrangler.jsonc` after the Cloudflare Vite redirected deploy config dropped `vars`, `d1_databases`, and `r2_buckets`. The deployed Worker exposes real bindings for `DB`, `ARTIFACTS`, `GTFS_RT_RAW`, `BASELINE_MONTH`, `LAST_BUILT_SPEED_MONTH`, `GTFS_RT_SAMPLES_PER_CRON`, and `GTFS_RT_SAMPLE_SECONDS`. Live checks passed for `/api/v1/status?month=2026-03`, `/api/v1/routes?month=2026-03&limit=3`, `/api/v1/map/manifest?month=2026-03`, and a route-segment artifact stream. The actual frontend is served from the root workers.dev URL; `/api/v1/artifacts/*` URLs are raw artifact endpoints.

Verified scheduled production GTFS-RT capture. The deployed cron wrote vehicle-position manifests and protobuf snapshots into remote R2 under `gtfs-rt/vehicle_positions/2026-05-17/`; a sampled protobuf object was about 230 KB. Mirrored two live production manifests and paired protobufs with `pull:gtfs-rt-r2-run --execute`, imported them with `import:gtfs-rt-r2-manifests`, and parsed them with `ingest:gtfs-rt-snapshots`: 2 snapshots, 3,612 vehicle positions, and 0 parse errors.

## [2026-05-18] engineering | Design system hard cutover pages

Started the website hard cutover to the new Bus Priority Impact Studio design system. The active TanStack Router pages for hotspots (`/`), route profile tabs (`/routes/$routeId`), comparison (`/compare`), weekly digest (`/digest`), system reference (`/system`), and not-found now render through the new `apps/web/src/design-system` primitives and the Base UI-backed shadcn button. Removed the old compatibility primitive wrappers, legacy preview page/components, legacy token module, and unused legacy CSS blocks so the app no longer falls back to the previous visual system.

## [2026-05-18] engineering | Full website hard cutover plan and shell

Replaced the interim design-system cutover with the canonical reference-site information architecture: route search/results, route detail, route ladder, compare, findings feed/detail, briefs gallery/reading/evidence/composer/review/history, methods, docs, system reference, and not-found. Added `knowledge/wiki/engineering/website_hard_cutover_plan.md` to capture the no-legacy-fallback cutover, API surface direction, generated CLI/docs direction, and React/TanStack Router motion posture. Removed the old map/panel/API-client fallback layer from the web app and replaced its stale tests with Studio sample-data contract coverage so unknown routes/briefs/findings fail closed instead of silently rendering M15 defaults.

Updated the TanStack Router integration to match render-optimization guidance: router structural sharing is enabled by default, route wrappers subscribe to individual params/search fields through `select`, and the hard-cutover plan now records those selector/structural-sharing rules for future API-backed pages.

Added `knowledge/wiki/engineering/generated_cli_distribution_plan.md` for the Cloudflare-style CLI/API generation and binary distribution pipeline. The plan makes OpenAPI an output of a runtime TypeScript schema, defines schema linting for verbs/flags/locality/output contracts, ties generated CLI source to `bun build --compile`, and makes `CliReleaseManifest` the single contract for npm optional platform packages, PyPI wheels, Homebrew formulae, future Windows wrappers, archive audits, provenance, and manifest-driven rollback.

## [2026-05-18] engineering | Observability and Studio API next plans

Added `knowledge/wiki/engineering/web_observability_performance_seo_plan.md` for the immediate website observability track: Lighthouse route matrix, SEO crawlability checks, Core Web Vitals/RUM posture, Worker `Server-Timing`, structured API logs, and a release gate that keeps raw RUM out of D1. Rewrote `knowledge/wiki/engineering/web_api_endpoint_architecture.md` around the route-first Studio API: existing `/api/v1` endpoints remain lower-level serving primitives, while `/api/v1/studio/*` becomes the product contract for routes, search, ladder, compare, findings, briefs, methods, docs, and future composition endpoints. Updated the wiki index and hard-cutover plan so these are the immediate next tasks.

Tightened the API migration plan to make the Studio API a true hard cutover: production pages call `/api/v1/studio/*` only, do not keep non-Studio endpoint or sample-data fallback branches, and must remove `studio/sample-data.ts` imports in the same patch that adds each route loader. Existing non-Studio `/api/v1/*` handlers can remain temporarily for compatibility or extracted helper logic, but they are not the frontend contract.

## [2026-05-18] engineering | Studio API loader hard cutover slice

Added the first route-first Studio API contract in `apps/web/src/studio/api-contract.ts`, plus client loaders that call `/api/v1/studio/*` directly. The Worker now serves Studio routes, search, route detail, ladder, compare, findings, briefs, methods, and docs endpoints with contract validation and `Server-Timing: studio` headers.

Production TanStack Router pages now load their page data through the Studio API instead of importing `studio/sample-data.ts`. Missing route/finding/brief records render the designed not-found state from API 404s; there is no sample-data or legacy endpoint fallback branch in the route wrappers. The web architecture check and production-boundary harness now fail production UI imports from `studio/sample-data.ts` and `fixtures/demo-snippets.ts`, while still allowing dev-only gallery examples to use demo snippets.

## [2026-05-18] engineering | Web SEO and performance gates

Added the first enforceable web observability gates: `check:web-release` builds the web app, runs `check:web-seo`, and runs `check:web-performance`. The SEO gate validates the canonical public route matrix, title/description/canonical metadata, hash-stamped assets, and dev-only `/system` noindex behavior. The performance gate enforces built client asset budgets and writes a compact ignored summary artifact to `data/artifacts/web-audits/latest/performance-budget.json`.

The Worker now injects crawlable title/meta/canonical tags into SPA fallback HTML for public deep links and returns `404` plus `X-Robots-Tag: noindex` for `/system` outside local dev. Added a debug-only browser performance reporter that logs route navigation timing, LCP, and CLS in dev or when `localStorage.bpDebugVitals = "1"`. Lighthouse CLI is available through `bunx`; real Lighthouse JSON collection is gated behind `BP_RUN_LIGHTHOUSE=1` plus a Chrome executable/URL so CI can opt into it without making local checks depend on a bundled browser.

Follow-up slice: added `serve:web-smoke`, a local production-build smoke server that serves
`apps/web/dist/client` plus generated `data/artifacts/studio/v1` projections through the same
`/api/v1/studio/*` URLs used by route loaders. `check:web-performance` now enforces Lighthouse
thresholds when `BP_RUN_LIGHTHOUSE=1`: desktop performance 0.95+, accessibility 0.95+, best
practices 0.95+, and SEO 1.00 across the 12-route public matrix. The first real run used Playwright
Chromium from the local browser cache and passed, with SEO 1.00 on every route. Added `robots.txt`,
`llms.txt`, and `sitemap.xml`, fixed the canonical
finding-detail route to `/findings/m15-full-treatment-still-declining`, and darkened shared muted,
warning, success, and Bronx route colors to satisfy Lighthouse contrast checks.

## [2026-05-19] analysis | Detector event-route touch bridge

Added the local-only detector bridge `local_context_event_route_touch` as the canonical cheap answer
to "which events touched which routes during this window?" The bridge is built after
`build:context-events` and `build:route-lion-link` by `build:context-event-route-touches`, stores
direct route-keyed events as `primary` evidence, and stores route-LION-expanded touches as `context`
evidence with `route_fanout` and `match_weight` so detectors do not mistake broad street proximity
for route-specific proof.

Updated the finding-coverage, data-model, and CLI docs to make the provenance rule explicit.

## [2026-05-18] engineering | Studio release artifact hard cutover

Removed the last Worker-runtime Studio seed import. `/api/v1/studio/*` now reads a versioned
`studio/v1/release.json` object from the `ARTIFACTS` R2 binding, validates it with
`StudioReleasePayloadSchema`, and fails closed when the artifact is missing or invalid. The local
Studio seed remains available only for tests and release-artifact generation, while the architecture
check and production-boundary harness now reject `studio/sample-data.ts` imports from production
runtime files, including Worker handlers.

Added `build:studio-release` to write the current `data/artifacts/studio/v1/release.json` artifact
and extended `publish-serving-release.sh` so Studio release artifacts are uploaded with the D1/R2
serving promotion path.

Promoted the Studio API schemas into `packages/domain/src/studio-schemas.ts` and changed
`apps/web/src/studio/api-contract.ts` into a compatibility re-export. `@bp/domain` now exposes
Studio response schemas, the Studio release-payload schema, and JSON Schema exports for docs/OpenAPI
generation.

Added `packages/domain/src/studio-openapi.ts` and Worker endpoint `GET /api/openapi.json`. The
OpenAPI 3.1 document is generated from the package-level Studio JSON Schema exports and covers the
route-first read contracts used by the website and future agent/CLI surfaces.

Updated `GET /api/v1/studio/docs` so its endpoint table is derived from the generated OpenAPI paths
instead of being copied from the Studio release artifact.

Follow-up slice: split the runtime Studio API off the monolithic `studio/v1/release.json` read. The
shared projection builders now live in `packages/domain/src/studio-projections.ts`;
`bun run build:studio-release` writes page-shaped R2 artifacts such as `studio/v1/routes.json`,
`studio/v1/routes/:slug/index.json`, `studio/v1/routes/:slug/ladder.json`, `studio/v1/findings.json`,
and `studio/v1/briefs/:briefId/index.json`; and the Worker serves `/api/v1/studio/*` by validating
those endpoint projections directly. Missing or invalid projections fail closed, with no fallback to
the local seed or legacy v1 handlers.

Clarified the RESTful boundary: `/api/v1/studio/*` resources are the public product API and
`studio/v1/*.json` keys are private R2 storage details. Removed the public `X-Studio-Projection`
header so responses expose `X-Studio-Release` provenance without leaking object paths.

Documented the backend decision as REST over private projections rather than public D1/R2 object
access. The intended serving pipeline is now explicit: build Studio resource projections from D1
serving tables and R2 artifact manifests, publish them under versioned private R2 keys, and have the
Worker validate and serve those projections through `/api/v1/studio/*`. Public object/projection-key
endpoints remain out of bounds for the hard cutover.

Moved Studio projection generation into `@bp/pipeline`. `bun run build:studio-release` now runs the
pipeline `build:studio-release` command, loads the D1 export schema/seed, reads generated
route-slice artifacts, preserves the canonical public M15/Bx12 route/finding/brief slugs, and writes
the same page-shaped `studio/v1/*.json` projection tree consumed by the Worker. Removed the old
web-app sample-data release script from the active build path.

## [2026-05-18] engineering | Agent-Author API commitment

Committed to agents-as-authors as the Year-1 API audience. External coding agents must be able
to compose, edit, validate, and publish route evidence briefs against the same write surface that
backs the web composer. The web composer becomes one client of the API, not its privileged
surface.

Implications, captured in `wiki/engineering/agent_author_api.md`:

- A mid-layer "computed data" tier (per-segment month time series, ACE violation counts,
  treatment-state-by-period, peer cohorts, evidence catalog) is required. Currently the API only
  exposes evidence-shaped data; agents authoring novel claims need finer-grained derived
  projections.
- A write-side brief API is required: create/edit/validate/review/publish/retract endpoints
  mirroring every action available in the composer UI. Server-authoritative strength scoring
  gates publish. Idempotency keys on every write. Async job semantics for the LLM-paced drafting
  step.
- Raw observational data (GTFS-RT samples, D1 row keys, R2 object paths) stays internal.
  Mid-layer endpoints serve derived projections only, with the same `quality` provenance block
  the existing read surface uses.
- User-submitted findings rejected as a typed object; the dogfeed loop runs through briefs.

Verification target: an external agent given only the docs follows the canonical 11-step
walkthrough (find -> read mid-layer data -> POST /briefs -> poll -> attach evidence -> validate
-> review -> publish) and ends with a round-trippable published brief. The internal team runs
the same walkthrough against the same endpoints — that is the dogfeed test.

## [2026-05-20] engineering | Findings review queue artifact

The `findings:detect` job now writes a capped review inbox at
`data/artifacts/findings/<month>/review-queue.json` alongside the detector coverage audit. The queue
keeps the highest-priority candidates across the full detector matrix, records per-detector counts,
preserves route/scope/reason metadata, and attaches evidence refs from detector evidence links so
manual review can start from concrete source artifacts rather than the raw SQLite rows.

The March 2026 local run produced a 50-candidate queue spanning source gaps, persistent speed
hotspots, observed reliability, intervention gaps, and intervention underperformance. The artifact
also records the uncapped detector totals, omitted-by-cap count, evidence-linked candidate count,
priority bands, and review signals. In the latest run, all 462 candidates had evidence refs, 50 were
surfaced for review, and 412 were omitted by the cap. Top-ranked items were severe Q65/Bx15 speed,
reliability, and intervention findings.

Follow-up slice: the review queue now also groups surfaced route-scoped candidates into
`routeGroups` so reviewers can spot multi-detector routes without manually reconciling candidate
rows. The March 2026 local queue surfaced 43 route groups, including 7 multi-detector routes. Q65
ranked first with intervention-gap plus persistent-speed-hotspot signals; Bx15 and Bx5 paired
observed-reliability with intervention-underperformance signals.

Second follow-up slice: the review queue now includes a `summary` block with total and surfaced
priority-band counts, surfaced category counts, route priority-band counts, multi-detector route
count, and critical route-group count. The March 2026 local queue has 462 total candidates
distributed as 50 critical, 151 high, 204 medium, and 57 low; the 50 surfaced review items are all
critical and cover 31 data-quality, 9 observed-reliability, 5 intervention-gap, 3 speed-hotspot, and
2 intervention-underperformance candidates.

Third follow-up slice: the summary now makes cap behavior explicit with omitted priority-band
counts and `capExhaustedPriorityBands`. For March 2026, the 50-item cap covers every critical
candidate and omits the remaining 151 high, 204 medium, and 57 low candidates, so reviewers can see
that the first queue page is complete for critical items but not for lower bands.

Fourth follow-up slice: the review queue now includes a `health` block with machine-readable status
and issue codes for empty queues, omitted critical candidates, missing evidence refs, ungroupable
queues, and lower-priority cap omissions. The March 2026 queue reports `ok` with one informational
`lower_priority_candidates_omitted` issue for the 412 non-critical candidates behind the cap and no
evidence-link warnings.

Fifth follow-up slice: `findings:detect` now accepts a configurable non-negative
`reviewQueueLimit` (`--review-queue-limit` from the CLI) so tests and reviewer workflows can
exercise cap behavior directly. The detector orchestrator fixture now reruns with a zero-item queue
and verifies that omitted critical candidates produce `attention_required` with
`empty_review_queue` and `critical_candidates_omitted` warnings. The default March 2026 run still
uses the 50-item queue and reports `ok`.

Sixth follow-up slice: candidate validation is now agent-native. The review queue includes an
`agentReview` section aimed at Codex/Claude-style reviewers with instructions, a structured
decision schema, route packets for the top route groups, and one validation packet per surfaced
candidate. Each candidate packet carries claim text, scope, priority signals, evidence refs, and
required checks that force agents to validate from evidence rather than detector score alone. The
March 2026 artifact emits 20 route packets and 50 candidate packets.

Dogfood follow-up: an agent review of the first five March candidates showed two avoidable tool
calls: parsing escaped JSON evidence refs with `jq fromjson`, and opening detector source files to
interpret thresholds/field meanings. Candidate packets now include parsed `evidenceObjects` beside
the raw provenance strings plus `detectorGuidance` with default thresholds, key evidence-field
definitions, validation framing, and common follow-ups. The agent instructions now explicitly say to
use `evidenceObjects` first and retain `evidenceRefs` as provenance.

Second dogfood follow-up: the review packet was reframed from "agent validates/promotes candidate"
to "agent audits why the detector emitted this candidate." The `agentReview` mode is now
`agent_detector_audit`, with detector actions (`keep`, `downgrade`, `suppress`, `split`, `enrich`)
instead of publication decisions. Candidate packets now flag derived score fields with
`derivedMetricWarnings` so agents do not treat values like `speedPainScore` or
`reliabilityPainScore` as standalone evidence.

Algorithm improvement from the dogfood review: `intervention_underperformance` now requires a
current speed-derived detector signal for non-positive peer-adjusted speed-delta claims; reliability
signals are context only. This removed the 13 March 2026 underperformance candidates that were
backed by reliability pain plus speed-delta evidence, leaving 30 clean evaluated routes and 351
skipped routes for missing evaluated intervention or speed-signal input.

Feedback-loop follow-up: agent detector-audit output now has a typed results artifact
(`finding_detector_audit_results`) and a pipeline summary command, `findings:audit-feedback`. The
summary artifact rolls up actions by detector, derived-metric issue counts, missing-evidence themes,
and per-detector recommendations so dogfood reviews can feed back into detector thresholds, packet
enrichment, and split/suppress decisions without pretending the agent is approving public findings.

Context-detector follow-up: after the permit geocoding pass, `build:context-event-route-touches`
was rerun and now writes `data/artifacts/context-events/route-touch-audit.json`. The refreshed local
DB has 549,556 route touches: construction permits touch 23,412 joinable events across 378 routes
and opening permits touch 6,885 events across 377 routes. Added the first typed feature-layer slice
via `findings:signal-features`, which writes route/month/all-day signal features with speed, permit
touches, uncertainty counts, provenance refs, and per-feature coverage facts.

Follow-up integration: `findings:detect` now writes the signal-feature artifact as part of the
normal detector run and persists `permit_correlated_slowdown` through the findings tables, coverage
audit, and review queue. Intervention-gap and intervention-underperformance inputs now use
feature-derived route speed/reliability signals rather than consuming prior emitted detector
candidates. The March 2026 run now has six detectors and 599 total candidates: 199 source gaps, 100
speed hotspots, 100 observed-reliability findings, 100 intervention gaps, 0 intervention
underperformance findings, and 100 permit-correlated slowdown findings.

Operations follow-up: GitHub Actions now owns CI/CD for the public Worker. The existing CI workflow
was expanded into a verify-then-deploy pipeline: pull requests and pushes run the knowledge check,
type check, architecture check, tests, and web release gates; pushes to `main` deploy `@bp/web` to
Cloudflare with Wrangler after a successful verify job. The deploy job skips with an Actions notice
until the `CLOUDFLARE_API_TOKEN` GitHub Actions secret is configured. D1/R2 serving-release
promotion remains a separate reviewed publish step.

Pipeline finish planning pass: `knowledge/wiki/engineering/data_pipeline_finish_plan_v2.md` is now
the plan of record. The local March/May drift was repaired: March map artifacts and strict
`check:pipeline-v1` pass locally, and the May official GTFS-RT run
`gtfs-rt-v1-20260517T103607Z-24h` has route observed reliability and preflight source-status rows.
The source coverage ledger command now writes
`data/artifacts/source-coverage/2026-03/ledger.json`; the current ledger classifies 12 active
sources with only `equity_context` still needing action.

Historical corpus follow-up: route monthly speed/ridership trends now ingest the 2023-2024 speed and
ridership Socrata datasets plus the 2025+ datasets, with ridership backfill chunked by route/month
source windows. Local `local_route_month_trend` now covers 12,075 route-month rows from `2023-04`
through `2026-03`, all with speed and ridership trend coverage. Bus Wait Assessment was backfilled
for the same 36-month window, yielding 46,167 rows across 354 routes. Equity context remains
`excluded_until_fixed` because the Census ACS profile API now requires a `CENSUS_API_KEY` in this
environment.

Context/findings refresh: March 2026 context events and touches were rebuilt from the completed
source tables. The local DB now has 2,644,997 context events and 5,835,695 route touches; the route
touch audit records per-source join rates and keeps parking's low touch/geocode coverage explicit.
After rerunning intervention evaluation and `findings:detect`, the detector pass emits six detector
families and 600 candidates: 199 source gaps, 100 persistent speed hotspots, 100 observed
reliability candidates, 100 intervention gaps, 1 intervention underperformance candidate, and 100
permit-correlated slowdown candidates. March strict pipeline QA still passes with 0 issues.

Worker operations follow-up: scheduled refresh is split in code. The every-minute cron captures
GTFS-RT and skips the route-speed watcher, while `17 10 * * *` runs the route-speed availability
watcher. The Worker writes compact refresh health to `source-refresh/latest.json` when the ARTIFACTS
binding is available, including GTFS-RT status/object keys, route-speed status, and the
`shouldRebuild` decision. Heavy rebuilds remain manual Bun jobs on this PC; no Queue is needed yet.

Manual rebuild/export verification: after refreshing March historical trends, context, and findings,
`export:d1 -- --year 2026 --month 3` regenerated the serving export with 12,075 route-month trend
rows, 381 route observed reliability rows, 360 intervention comparisons, 1,050 route artifacts, and
579 corridor artifacts. `verify:d1 -- --year 2026 --month 3` passed with 0 issues and matching
expected-vs-loaded table counts. The dry-run `publish:serving-release -- --month 2026-03 --d1
bus-priority-serving --r2 bus-priority-artifacts` passed local publish completeness, checked 2,034
candidate R2 keys, skipped 1,988 already-present keys, and marked 46 as dry-run uploads with 0
failures.

Completion audit follow-up: added
`knowledge/wiki/engineering/data_pipeline_finish_plan_v2_completion_audit.md` to map the active
finish-plan goal to real evidence. The audit shows the historical, context, Worker-code, and manual
PC rebuild/export pieces are locally verified. The remaining blocker is specifically the deployed
Worker/R2 GTFS-RT handoff proof: mirror a contiguous 4-hour-or-longer Worker-written R2 window,
import manifests, parse protobufs, build observed headways/reliability, and run preflight. The local
official 24-hour run is processed and preflighted, but it does not by itself prove the deployed R2
mirror/import path.

Deployed R2 handoff proof closed: listed `bus-priority-gtfs-rt-raw` through the R2 S3 API and built
a 480-manifest window from `2026-05-17T17:13:54Z` through `2026-05-17T21:14:26Z`. The sequential
Wrangler mirror helper was too slow for this many objects, so the same reviewed manifest list was
mirrored with Bun's S3 client into
`data/raw/r2-mirror/gtfs-rt-r2-prod-20260517T171354Z-4h`: 480 manifests, 480 protobufs, and 0 failed
downloads. `import:gtfs-rt-r2-manifests` registered 480 snapshots over 14,462 seconds;
`ingest:gtfs-rt-snapshots` parsed 480 snapshots with 894,254 vehicle positions and 0 parse errors;
`build:observed-headways` produced 151,356 headway samples; `route-observed-reliability` wrote 381
May route rows with 261 observed routes and 149,376 route-summary samples; and `gtfs-rt:preflight`
passed with 0 issues for run `gtfs-rt-r2-prod-20260517T171354Z-4h`.

2023-present reframing follow-up: the target corpus window is now `2023-04` through the latest
complete public speed month, currently `2026-03`. Census ACS equity ingestion is repaired with
`CENSUS_API_KEY`: `ingest:equity-context -- --year 2024` loaded 2,327 NYC tracts, and
`route-equity-context -- --year 2026 --month 3 --acs-year 2024` wrote 381 route rows with 358
county-proxy assignments. The source coverage ledger now treats 311 and parking as historical
window sources instead of release-only samples, and it requires the target month count rather than
only min/max dates. 311 and DOT traffic-volume raw backfills ran for all 36 target months with
72/72 successful tasks; 311 now has 2,560,438 filtered rows and DOT traffic volumes have 196,342
rows. Parking is partially backfilled: FY2023 April-December plus March 2026 are loaded
(1,574,356 filtered rows, 10 distinct months), but FY2024/FY2025 API queries are slow/failing and
need a separate bulk strategy before this reframed goal can be marked complete. The regenerated
ledger reports two action items: 311 has complete raw history but low geocode/join coverage, and
parking still needs backfill plus a geocode strategy.

2023-present scope decision close-out: parking was explicitly demoted back to `release_context_only`
in the source coverage ledger. The normal month-ingest path can load FY2023/FY2026 parking slices,
but FY2024/FY2025 Socrata queries are too slow/failing for the current pipeline, and historical
parking rows are not detector-ready without a separate bulk loader plus geocode strategy. 311 stays
`complete_for_history` for raw coverage but carries an explicit join-rate caveat: route-context
features use only geocoded/joined rows. After these scope decisions, the regenerated March 2026
source coverage ledger reports 12 sources and 0 sources needing action. Context events were rebuilt;
the current local DB count is 6,447,473 rows. Route touches were rebuilt with the route-touch audit preserving low join rates,
`findings:detect` reran with six detector families and 600 candidates, strict March
`check:pipeline-v1` passed with 0 issues, D1 export/verify passed with 381 route equity rows, and
the dry-run serving publish passed publish completeness plus R2 dry-run audit.

Post-completion checkpoint planning: actual March production publish is still a deliberate manual
decision, not part of the automatic refresh path. Local export, verify, and dry-run publish are
green; execute `publish:serving-release --execute` only after reviewing the refreshed seed hash,
route equity rows, and release artifact diffs. Parking remains a future project: build a bulk
fiscal-year loader and geocode strategy before using it as historical evidence. The next 311 quality
project is to improve geocode/join coverage for the already-loaded 2023-present raw rows, starting
with route-relevant rows near March findings rather than trying to geocode all 2.56M rows blindly.

R2 mirror helper follow-up: `bun run pull:gtfs-rt-r2-run` now routes to a Bun/TypeScript pipeline
command using the R2 S3-compatible API and concurrent downloads instead of the old sequential
Wrangler object loop. The command keeps the same manifest-list workflow and output layout, supports
`--concurrency`, skips already mirrored files, resolves raw protobuf keys from each manifest, and
prints the matching `import:gtfs-rt-r2-manifests` command.

Operationalization checkpoint: the March 2026 serving release remains intentionally deferred rather
than executed in this pass. The local dry-run is green, but production D1/R2 mutation should happen
only as a deliberate release action after a final artifact/seed review. The faster R2 mirror helper
was exercised in real `--execute` mode against the reviewed 480-manifest production-length Worker
capture `gtfs-rt-r2-prod-20260517T171354Z-4h`; all 960 local files were present/skipped and the
helper reported 0 failures. The post-mirror handoff chain was rerun: 480 manifests imported, 480
snapshots parsed, 894,254 vehicle positions, 151,356 observed headway samples, 381 May route
reliability rows, 261 observed routes, and `gtfs-rt:preflight` passed with 0 issues under the
4-hour/40-second/90% snapshot thresholds. A CLI parsing bug discovered by the real `--execute` run
was fixed by making `--execute` use the shared boolean option helper and adding a regression test.

311 quality work started with a targeted date-window capability on `geocode:311`: `--since` and
`--until` now constrain the unattempted queue and order newest rows first. The first operational
slice ran for February 2026 with `--max-rows 1000 --batch-size 250`, yielding 999 physical-id hits,
1 miss, and 588 cache hits. After rebuilding context events and route touches, current 311 context
joinability increased to 106,703 rows, touched current 311 events increased to 70,816, and current
311 route touches increased to 251,732 across 378 routes. Parking stays outside this cycle as the
separate bulk-loader/geocoding project.

Post-checkpoint release path: PR #2 is open as a draft, mergeable, and has a green `verify` CI
check; it remains unmerged because the March 2026 production publish is still deferred to an
explicit release review. A larger February 2026 311 geocode slice ran with
`--max-rows 10000 --batch-size 500`, producing 9,874 hits, 126 misses, and 5,896 cache hits. After
rebuilding context events and route touches, February 2026 has 10,873 geocoded 311 rows and 74,768
unattempted rows; current 311 joinable rows increased to 116,577, touched events to 77,443, and
route touches to 274,003 across 378 routes. Parking remains parked as a separate future bulk-loader
and geocoding project.

Production release follow-up: PR #2 was marked ready and merged to `main` as squash commit
`26a50d7`. Ran `publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2
bus-priority-artifacts --skip-schema --execute`; the publish completed successfully. R2 publish
reported 2,034 candidate keys, 46 uploads, 1,988 skips, and 0 failures. Production smoke checks:
`/api/v1/status` reports baseline month `2026-03`, canonical release status `pass`, 381 routes,
1,629 artifacts, 0 issues, and May 2026 current observed signal from
`gtfs-rt-v1-20260517T103607Z-24h`; `/api/v1/studio/routes?limit=1` returns the D1-backed Studio
route list with 350 public route cards; remote D1 `route_brief_summary` has 381 rows. Continued 311
quality work with a 20,000-row February 2026 slice: 19,654 hits, 346 misses, and 12,358 cache hits.
After rebuilding context events/touches, February 2026 has 30,527 geocoded rows and 54,768
unattempted rows; current 311 joinable rows increased to 136,231, touched events to 90,658, and
route touches to 320,492 across 378 routes.

311 February 2026 target window completed: ran the remaining-window slice with
`geocode:311 -- --since 2026-02-01 --until 2026-03-01 --max-rows 60000 --batch-size 1000`. The job
scanned 54,768 rows, produced 54,292 hits, 476 misses, and used 33,457 cache hits. After rebuilding
context events and route touches, February 2026 has 85,768 filtered rows, 84,819 geocoded rows, 949
geocode misses, and 0 unattempted rows. Current 311 joinable rows increased to 190,523; touched
events increased to 125,101; and route touches increased to 433,267 across 378 routes. This closes
the first targeted monthly 311 improvement window; continue with January 2026 or another
newest-first month next rather than treating the entire 2.52M-row current table as one batch.

311 geocode completion: drained the remaining current-era 311 backlog month-by-month from January
2026 back through April 2023. Every loaded 311 row is now attempted. Final DB counts:
current-era 311 has 2,521,134 filtered rows, 2,504,843 geocoded rows, 16,291 explicit geocode
misses, and 0 unattempted rows; historical 311 has 39,304 rows, 37,707 geocoded rows, 1,597 misses,
and 0 unattempted rows. Rebuilt context events and route touches after the full drain. Current 311
now has 1,601,395 touched events and 5,418,460 route touches across 378 routes; historical 311 has
23,798 touched events and 79,442 route touches across 378 routes. This finishes 311 geocode/join
coverage for the loaded corpus; remaining non-joins are real geocode misses or events away from
the bus route/LION touch network, not unprocessed rows.

Parking completion pass: removed the remote Socrata `ORDER BY summons_number` from
`ingest:parking-violations` because it was the FY2024/FY2025 performance blocker; normalized rows
still sort locally before upsert. Backfilled all missing parking months from 2024-02 through
2026-02 with 25/25 successful tasks, after the earlier FY2023 April-December, 2024-01 smoke, and
2026-03 release month loads. Added date-window and grouped-address support to
`geocode:parking-violations`, plus a low-confidence `--street-only` sweep for truncated parking
locations. Final parking DB state: 5,753,409 filtered rows, 157,304 geocoded rows, 5,596,105
explicit misses, and 0 unattempted rows. Rebuilt context events and route touches; parking now has
4,740 touched events and 29,234 route touches across 341 routes. Keep parking
`release_context_only`: the remaining low join rate comes from source location quality
(camera-style/directional/intersection snippets), not from an unfinished loader.

Parking candidate quality audit: added `audit:parking-candidate-quality` to summarize candidate
fanout, match weights, and detector-review eligibility from `local_parking_violation_match` without
mutating any rows. The real local audit wrote
`data/artifacts/context-events/parking-candidate-quality-audit.json` and kept the source decision at
`keep_release_context_only` with `automaticPromotionAllowed=false`. Current counts: 96,760 matched
grouped locations, 596,527 candidate route rows, 3,085,310 represented events, 367 matched routes,
max candidate fanout 76, P90 candidate count 14, event-weighted P90 candidate count 24. A strict
manual-review subset exists: 54,920 groups and 1,096,073 events meet the high-confidence,
candidate-count <= 3, location-weight >= 0.8 rule. The rest stays weighted release context or
low-confidence release context; parking should not become detector-grade evidence without an
explicit promotion review.

Studio projection coverage fix: changed `build:studio-release` so the full public-route profile is
the default and `--profile demo` is the explicit curated mode. Refreshed the March 2026 D1 export
and verification (`route_brief_summary=381`, `route_readiness=381`, 0 verification issues), rebuilt
Studio projections, and reran `audit:studio-coverage`. The audit now measures route coverage
against public-visible route brief summaries instead of every route catalog row: March has 350
public-visible Studio routes out of 381 catalog rows, 350 route detail artifacts, 8 curated brief
details, and 6 curated finding details. Studio route coverage passes with
`studioRouteCoverageShare=1`.

Studio route-detail parity follow-up: added route artifact references to the Studio release
contract and route detail projection. `build:studio-release` now reads D1 `route_artifact` rows,
filters them to the selected Studio route set, and exposes the matching refs on
`/api/v1/studio/routes/:slug` detail payloads. Refreshed the website data support audit to mark the
route-facing cutover items done: full-public route listing/search, observed reliability, current
observed signal, and route detail artifact refs. The remaining website data support work is now
brief/finding depth, publish completeness, and write-side authoring.

Studio brief/publish support follow-up: split brief evidence and history into dedicated Studio
projection files (`evidence.json` and `history.json`) so those endpoints no longer depend on the
full brief body projection. Publish completeness now collects required keys from brief,
evaluation, and map manifests plus D1 `route_artifact` / `corridor_artifact` rows, and
`publish:r2-artifacts` includes those D1-referenced keys in its upload candidate set. Local March
2026 publish completeness passes with 3 manifests, 1,629 D1 artifact refs, 1,986 unique keys, and
0 missing files.

Studio public brief/finding coverage follow-up: expanded `build:studio-release` so March 2026
Studio briefs now cover every public route with route artifact refs instead of the old curated
8-brief slice. The rebuilt release has 350 briefs, 350 evidence projections, and 350 history
projections; 4 are marked `Published` and 346 are marked `Generated` to keep editorial state honest.
Findings are now a thresholded candidate feed capped by `--finding-limit` (default 50), not a
full-route detector-coverage claim. `audit:studio-coverage` now verifies route and brief coverage
against public `route_brief_summary` rows and reports finding coverage separately; the March audit
passes with `studioRouteCoverageShare=1`, `studioBriefCoverageShare=1`, `findingRouteCount=50`, and
`studioFindingCoverageShare=0.1429`.

All-source evidence integration pass: extended the source coverage ledger into a source evidence
eligibility ledger with allowed evidence roles, detector eligibility, automatic-promotion flags, and
blockers. Extended route-month signal features so every route now carries all normalized context
source counts, match weights, high-confidence touch counts, fanout, and provenance, not just permit
counts. `findings:detect` now attaches that route-month context evidence to detector candidates as
context evidence links while preserving primary metric evidence. Added `audit:evidence-corpus` to
verify the chain from source eligibility to signal features, detector evidence, and review queue.
March 2026 proof passes: 12 source groups, 8 primary-eligible sources, 5 automatic-primary sources,
3 manual-review-primary sources, 4 context/current-signal-only sources, 381 route-month features, 6
context sources, 599 detector candidates, 1,188 evidence links, 2,304 coverage rows, and 0 unlinked
review-queue candidates. The default detector review queue cap is now 200 so public Studio can fill
its 50 finding slots from detector candidates without falling back to route-score generation.
Rebuilt Studio from that 200-candidate detector review queue; public Studio findings remain at 50,
now composed of 2 reviewed/manual findings plus 48 detector-derived review candidates.

Studio finding review-state follow-up: added optional review provenance to the Studio finding
contract and release builder so findings can distinguish `reviewed`, `review_candidate`, and
`generated_candidate` publication states. The March release builder now marks B25/BX41 manual
findings as approved manual reviews, detector-queue findings as review candidates with candidate
and detector IDs, and route-score fallback findings as generated candidates. The findings feed and
finding detail screens display that state directly, keeping the broader detector/evidence corpus
visible without implying detector candidates are approved claims.

Studio coverage audit promotion guardrail: extended `audit:studio-coverage` to count reviewed,
review-candidate, generated-candidate, missing-review, and detector-sourced findings. The audit now
warns if a finding is missing review provenance, if a review candidate is marked approved, if a
reviewed finding lacks approved review state, or if a detector-sourced finding lacks candidate and
detector refs. The real March 2026 audit passes with 50 findings: 2 reviewed, 48 review candidates,
0 generated fallback findings, 0 missing review records, and 48 detector-sourced findings with
candidate/detector refs.

Ideal detector doctrine: added `knowledge/wiki/analysis/ideal_detector_system.md` to define the
north star for detector maturity. The page distinguishes the impossible perfect detector from the
buildable ideal detector, reframes candidates as hypothesis packets, decomposes confidence and
severity, defines evidence roles and claim-strength levels, outlines detector families, and sets
the next implementation targets: detector specs, review packet schema, counter-evidence support,
source-specific context detectors, multi-month/peer detectors, and a gold-set backtest.

Detector maturity implementation slice: added strict detector spec and review-packet contracts,
generated `detector-specs.json` and per-month `review-packets.json` from `findings:detect`, and
introduced `counter_evidence` as an evidence role. `persistent_speed_hotspot` now emits segment-scope
counter-evidence, `service_request_context` adds the first 311-specific context detector with
fanout/match-weight counter-evidence, and `audit:findings-backtest` checks review packets against a
tiny gold set with optional custom expectations. Focused detector/domain/pipeline tests pass, full
TypeScript passes, and touched-file Biome passes; repo-wide Biome remains blocked by pre-existing
unrelated formatting/a11y/import diagnostics.

Detector counter-evidence and peer-history slice: added explicit `counter_evidence` rows to
`observed_reliability`, `intervention_gap`, `intervention_underperformance`, and
`permit_correlated_slowdown`, covering sample support, inventory gaps, peer-comparison limits, and
permit fanout/work-type caveats. Added `multi_month_speed_peer`, a conservative route-level detector
over local route-month speed trends that compares each route with the monthly route-corpus median
and emits broad-peer limitations before promotion. The March 2026 real detector pass now has 8
detector families, 675 candidates, 1,817 evidence links, 3,066 coverage rows, 675 review packets,
and 5 multi-month peer-speed candidates.

## [2026-05-23] engineering | Reviewer promotion queue and matched peer groups

Added strict reviewer promotion contracts in `@bp/domain` and taught `findings:detect` to write
`data/artifacts/findings/<month>/promotion-queue.json` from the review packets. The queue exposes
readiness, recommended next actions, blockers, allowed claim strength, evidence summaries, decision
options, and the expected reviewer response shape before any detector candidate can become a
promoted finding. The real March 2026 proof has 673 promotion candidates: 454 ready for review, 21
needing enrichment, and 198 blocked source-gap/data-quality candidates.

Strengthened `multi_month_speed_peer` from a route-corpus median comparison to matched monthly peer
groups. The detector now chooses route-family/type/geography peers when enough supported routes
exist and records fallback methods per observation. The real March 2026 detector pass now has 8
detector families, 673 candidates, 1,811 evidence links, 3,066 coverage rows, 673 review packets,
and 3 matched peer-speed candidates, all using the strongest `route_family_type_spatial` method.

## [2026-05-24] engineering | Reviewer decisions and promoted-finding artifacts

Added reviewer decision capture and immutable promoted-finding artifacts. `@bp/domain` now has
strict contracts for reviewer decision inputs, validated decision records, review-decision
artifacts, promoted findings, and promoted-finding artifacts. The new `findings:promote` command
reads a reviewer decision file, validates approvals against the promotion queue and review-packet
evidence refs, blocks candidates with promotion blockers, writes `review-decisions.json`, and emits
hash-stamped `promoted-findings.json` records.

Expanded `audit:findings-backtest` from a tiny recall check into the first calibration loop. Gold
expectations can now require "should surface" or "should not surface" outcomes and minimum detector
confidence, and the audit adds detector/confidence calibration buckets from captured reviewer
decisions when a review-decision artifact exists. This still needs a much larger gold set and real
reviewer-decision corpus before confidence labels can be considered calibrated.

## [2026-05-24] engineering | Promoted findings in Studio projections

Wired immutable promoted-finding artifacts into the public Studio release builder. `build:studio-release`
now reads `data/artifacts/findings/<month>/promoted-findings.json` before the detector
`review-queue.json`, publishes route-scoped promoted records as reviewed/approved Studio findings,
and excludes the same route from review-candidate fill so an approved finding replaces its
candidate rather than duplicating it.

The Studio finding review contract now carries promoted-finding, decision, packet, reviewer, and
immutable hash provenance. `audit:studio-coverage` counts promoted findings as detector-backed
outputs and warns if any promoted finding loses candidate/detector refs or its promoted/decision/
packet/hash audit trail. Added fixture coverage proving `findings.json` and finding detail
projections preserve that audit trail.

## [2026-05-24] engineering | 200 manually curated promoted findings

Completed the first 200-finding manual curation pass for the March 2026 release. The curation file
`data/artifacts/findings/2026-03/manual-curation-decisions-200.json` approves 200 candidates with
revised conservative claim text, 600 approved packet evidence refs, no source-gap candidates, no
promotion blockers, and complete packet/counter-evidence/coverage support. The promoted artifact
`data/artifacts/findings/2026-03/promoted-findings.json` now has 200 immutable promoted findings
across observed reliability, persistent speed hotspot, permit context, intervention gap, 311
context, matched peer-speed, and intervention-underperformance detectors.

The curation audit represents every source currently exposed as March route-scoped detector
evidence: route trends, DOT permits, NYPD collisions, ACE summaries, observed reliability, Bus Wait
Assessment, 311, and parking context. DOT traffic volumes, DOT realtime traffic speeds, weather,
and equity context are not in the March detector review packets as per-finding evidence, so they
were not fabricated into approvals; they remain source-coverage/corpus context until detectors add
per-finding features for them. `build:studio-release -- --month 2026-03 --finding-limit 202` now
builds 202 reviewed findings: 2 manual reviewed findings plus the 200 promoted detector findings,
and `audit:studio-coverage` passes with zero review candidates and zero missing detector audit refs.

## [2026-05-24] engineering | Supplemental detector evidence for remaining ledger sources

Added non-primary supplemental evidence links to `findings:detect` for the four ledger sources that
were still corpus-only in March review packets: NOAA weather, route equity context, DOT automated
traffic volumes, and DOT realtime traffic speeds. Weather now attaches as counter-evidence or a
caveat with `weather_context_only` normalization status; equity attaches as prioritization context;
traffic volume attaches as route-adjacent context with `lagMonths`; and realtime traffic speed
attaches as a `current_signal` caveat with month offset from the release. None of these links can
become primary detector evidence by accident.

The read-only March DB check shows 673 route-scoped detector candidates across 302 routes. The new
context would attach weather and equity to all 673 route-scoped candidates, current traffic-speed
context to 198 candidates, and route-joined traffic-volume context to 25 candidates. The latest
route-joined DOT traffic-volume source month is January 2024, while the latest DOT realtime speed
day is 2026-05-18, so both sources stay appendix/context evidence rather than March detector-grade
proof. Focused type checks, touched-file Biome, and the detector orchestrator test pass.

## [2026-05-24] engineering | Studio context appendix for remaining ledger sources

Added `findings:context-appendix`, a standalone March route-level appendix for weather, equity,
route-joined DOT traffic volume, and DOT realtime traffic speed. `build:studio-release` now reads
that appendix and adds public finding reasoning steps for the available route context while
preserving promoted-finding ids, reviewer decisions, packet refs, and immutable hashes.

The rebuilt March Studio release still has 202 reviewed findings and zero review candidates. All
202 findings now include equity and weather reasoning, 3 include traffic-volume context, and 37
include current-traffic appendices. `audit:studio-coverage --year 2026 --month 3` passes with 350
public routes, 350 briefs, 202 reviewed findings, 200 detector-backed promoted findings, zero
findings missing review records, and zero detector findings missing refs. This is public evidence
coverage, not a true weather-normalized or traffic-normalized detector layer yet.

## [2026-05-24] engineering | Route-day weather split for observed reliability

Added the first descriptive weather-normalized evidence layer for observed reliability. The
supplemental context builder now splits `local_observed_headway_sample` rows by weather-impacted
versus reference days using NOAA daily precipitation, snow, wind, and weather flags, then records
sample counts, long-gap shares, expected-wait deltas, support status, and interpretation per route.
The observed-reliability detector path can attach this route-day split as non-primary
counter-evidence or a caveat, and `findings:context-appendix` exposes it for public Studio finding
reasoning.

The real March appendix has 346 routes with weather reliability splits and 339 with sufficient
samples on both sides of the split. The NOAA month summary now counts precipitation-derived rain
days instead of relying only on sparse weather-type flags: March 2026 shows 9 rain days and 2
high-wind days. The rebuilt Studio release still has 202 reviewed findings; all 202 now include an
observed-reliability weather-split reasoning step. This remains descriptive, not causal: it does
not yet control for day-of-week, hour, direction, stop mix, planned service, or incident context.

## [2026-05-24] engineering | Matched-window controls for weather reliability

Strengthened the observed-reliability weather split with matched local window controls. The
appendix now computes the broad weather-day/reference-day comparison and a controlled comparison
using only buckets that have both weather-impacted and reference samples for the same route, local
day-of-week, hour, direction, and stop. Public Studio reasoning now reports the controlled
interpretation and matched-window support instead of relying only on the broad route-day split.

The real March appendix has 303 routes with sufficient matched-window support, 39 insufficient
matched splits, and 4 thin-weather-sample matched splits. Controlled interpretations across the
346 route split rows are: 215 reference-days-worse, 72 weather-conditions-worse, 13 reference-days
still poor, 3 similar, and 43 insufficient. The rebuilt Studio release still has 202 reviewed
findings and all 202 include the weather-split reasoning step. This is a better descriptive
normalization layer, but still not a causal model because it does not control for planned service,
incidents, passenger loads, or exact weather at sample time.

## [2026-05-24] engineering | Planned-service controls for weather reliability

Added planned-service support to the weather reliability split. The appendix now derives scheduled
headway context from `local_route_schedule_timepoint` by route, schedule day type, hour, and stop,
then attaches schedule coverage, scheduled expected wait, controlled observed expected wait, and an
observed-to-scheduled expected-wait ratio to the matched weather-control windows. Studio finding
reasoning now reports whether the planned-service control is available, partial, or missing.

The real March appendix shows why this must remain a caveated control layer: across 346 weather
reliability route rows, planned-service matching is available for 6, partial for 326, and missing
for 14. Among the 202 public findings, 3 have available planned-service controls, 196 partial, and
3 missing. The release still passes `audit:studio-coverage`. Next improvement should either improve
schedule matching from observed direction/stop to GTFS scheduled stop patterns or add
passenger-load/incident controls that do not depend on exact schedule-stop alignment.

## [2026-05-24] engineering | Stronger weather-reliability controls

Strengthened the observed-reliability weather split controls in two ways. Planned-service matching
now tries exact route/day-type/hour/stop schedule windows first, then falls back to route/day-type/
hour schedule context when observed stop IDs do not align with scheduled timepoint stop IDs. The
context also carries passenger-load controls from `local_route_hourly_ridership` at route/day/hour
grain and incident controls from `local_context_event_route_touch` at route/date/hour grain, so
those controls do not depend on exact schedule-stop alignment.

Real March 2026 appendix verification: 346 routes have weather reliability split rows; planned
service, passenger load, and incident controls are each available for 336 rows and missing for 10
rows. Planned-service match methods are 6 exact stop/hour, 326 mixed exact plus route-hour
fallback, 4 route-hour fallback only, and 10 none. The rebuilt Studio release keeps the approved
release posture: 202 findings, all reviewed, zero review candidates, 200 detector-backed promoted
findings, and `audit:studio-coverage --year 2026 --month 3` passes. All 202 public findings carry
the observed-reliability weather split; 199 have available passenger-load and incident controls in
the public reasoning text.

Follow-up verification hardening added those control counts directly to
`finding_context_appendix.summary.weatherReliabilityControls`, and the CLI now prints
`plannedServiceAvailable`, `passengerLoadAvailable`, and `incidentAvailable` counts. Rebuilding the
March appendix reports 336 available for all three controls, with the same schedule-match method
breakdown, and the refreshed Studio release still passes coverage audit.

## [2026-05-24] engineering | Normalized controls in confidence calibration

Started using the normalized observed-reliability controls in `audit:findings-backtest` instead of
leaving them as public reasoning only. Gold-set expectations can now require
`minimumNormalizedControlReadiness`, and the backtest artifact records matched normalized-control
readiness plus control-adjusted confidence for every matched packet. Confidence calibration now
adds `byDetectorConfidenceAndControls`, which buckets candidates by detector, raw confidence,
control-adjusted confidence, normalized control readiness, schedule match method, passenger-load
status, incident status, and controlled-window support.

The calibration is conservative: observed-reliability candidates with strong controls keep their
raw confidence; partial controls can cap high confidence at medium; weak or missing controls
downgrade one confidence step. Rebuilding March review packets and rerunning the backtest produced
100 observed-reliability candidates: 93 strong-control candidates and 7 weak/missing-control
candidates whose adjusted confidence drops from high to medium. The 200 promoted approvals are now
recovered for calibration through immutable promoted-finding signature matching, because direct
review-decision candidate IDs drift after detector reruns. Backtest passes with 2/2 default gold
expectations, 0 control misses, 200 approved calibration matches, and 6 warnings for approved
observed-reliability findings with missing normalized controls.

## [2026-05-24] planning | Agent-first contributor leaderboard

Added [[wiki/engineering/agent_first_contributor_leaderboard|Agent-First Contributor Leaderboard]]
as the plan of record for a contributor leaderboard where Codex/Claude-style agents can submit
typed transit issue artifacts. The plan keeps the product bus-first, distinguishes contributor
issues from internal route-batch audit issues, requires deterministic validation and duplicate
fingerprinting before review, and awards points only through append-only score events after
confirmed usefulness.

The intended dogfood path is agent-first: an external coding agent discovers
`/.well-known/bp-agent.json`, reads OpenAPI contracts, checks route/finding context, validates one
`ContributorIssue` packet, and submits with an idempotency key. Public leaderboard pages are D1
snapshot projections over verified score ledger events, not raw report counts.

## [2026-05-31] engineering | Route-level materialization coverage audit

Added `audit analytics-materialization-coverage` to separate source/staging coverage from actual
derived route artifact coverage. The audit checks the route catalog against concrete month/run
outputs including stop-direction-hour EWT feature artifacts, route-slice inputs, generated route
briefs, EWT route-month score vectors, route summary/scorecard tables, segment speeds, hourly
ridership, and observed reliability summaries.

The first May 2026 run makes the current gap explicit: GTFS static and observed headway support
make 346 routes eligible for detector-grade stop-direction-hour EWT, but only one route artifact
exists so far. The March 2026 run shows a different picture: route-slice inputs, route brief
summary rows, and scorecards cover all 381 catalog routes, while generated briefs, EWT score
vectors, speed, ridership, observed reliability, and stop-direction-hour EWT artifacts still have
route-level gaps. This audit is now the place to catch "we generated a few examples but not the
fleet" before treating a surface as complete.

## [2026-05-31] engineering | Data-product completeness registry

Started Workstream 3 from `knowledge/wiki/engineering/ambitious_analytics_workstreams.md` with a
typed derived-product registry in `tools/pipeline-v2/src/registry/data-products.ts` and a read-only
`audit data-product-completeness` command. The registry is separate from
`knowledge/raw/source_manifest.yaml`: raw source availability no longer implies that local tables,
feature artifacts, score vectors, serving projections, or release manifests are complete.

The first registered slice covers 12 high-value products. Against the March 2026 observed release
candidate, the audit reports 8 complete, 3 partial, and 1 missing product. The remaining blockers
are release schedule timepoint route coverage, EWT score-vector route coverage, generated route
brief coverage, and the top-level map release manifest.

## [2026-05-31] engineering | Bulk CSV schedule-source import path

Added `ingest route-schedules-bulk` as a parallel route-schedule import path for Socrata
`rows.csv` snapshots. It downloads or reuses a full CSV snapshot, has a `--download-only` mode for
source caching without SQLite writes, streams rows into per-route scratch files, sorts each route
with the same deterministic key as the existing JSON route/page ingest, and writes the same
`local_route_schedule_stop` and route ingest status tables.

The first scratch benchmark used 2025 SIM35 rows: the existing JSON route/page path wrote 66,150
rows in 23.85s, while CSV download plus bulk import took 6.08s total. A SQLite `EXCEPT`
comparison found equal row counts and zero row differences between the two scratch outputs. The
path is documented in [[wiki/engineering/analytics_backfill_runbook|Analytics Backfill Runbook]]
and should be validated on a full-year snapshot before replacing the active schedule backfill.

## [2026-06-01] engineering | Detector evaluation negatives and score vectors

Extended the detector evaluation harness with deterministic clean no-hit labels, a stable-hash
holdout split, missing-data scope accounting, generic local-finding score vectors, and all-detector
packet coverage. The new builders are `build detector-evaluation-labels` and
`build detector-score-vectors`; both feed the March 2026 `evaluate detectors` artifact.

The refreshed March packet has 18/18 detector scorecards, 200 confirmed positives, 2,133 derived
confirmed negatives, 451 holdout negatives, 473 near-miss scopes, 451 missing-data scopes, and
8/18 detector families with review packets. The portfolio is no longer positive-only. The remaining
evaluation gap is quality, not shape: derived negatives need reviewer-labeled rejection examples,
and detector-specific historical score vectors are still needed for the families that report
`score_vector_unavailable`.

## [2026-06-01] engineering | Brief markdown rendering & embeddable primitives (ADR 0015)

Scoped the brief markdown-rendering work: brief bodies become markdown and the design's 14 brief
primitives (5 inline, 9 embedded) render *through* that pipeline, replacing three ad-hoc plain-string
prose renderers (reading / composer / review). Decided (with the user) on a markdown + typed-block
hybrid: prose and inline primitives use `react-markdown` + `remark-directive`/`remark-gfm`; embedded
figures carry a `ref` to a Zod-validated `BriefBlock` so figure data stays typed and the markdown stays
thin and safe (allowlist, no raw HTML). The stack is lazy-loaded into the already-split brief chunks to
hold the 168 KB initial-JS budget. Recorded in ADR 0015 and `docs/architecture/brief-markdown-primitives.md`.
Phasing: shared `<BriefProse>` inline tier across all three surfaces, then `BriefBlock` + the embedded
tier, then the authoring write path and AI emission. Open item: confirm whether `/briefs/$briefId`
server-renders in the Worker (the pipeline must run there if so).

## [2026-06-01] engineering | Brief draft body markdown and ref resolver

Landed the backend half of ADR 0015's authoring content graph: draft `bodyMd` is now part of the
domain draft contract, persists in D1 as `studio_brief_draft.body_md`, seeds from the release brief
sections when a draft is first initialized, and overlays onto `GET /studio/briefs/{id}` for
authorized operators only.

The draft resolver now checks local block refs from D1, evidence/source and metric-source refs from
the brief projection, and artifact refs from the route detail projection. Draft validation reports
missing body block refs and directive/block-type mismatches. Public released projections still need
body/blocks backfill and promotion wiring before the public reader can rely on `bodyMd`.

## [2026-06-01] engineering | Draft-only brief creation and review verdicts

Added the next authoring backend slice: `POST /api/v1/studio/briefs` now mints D1 draft-only brief
ids from a route, source brief, or finding seed, returns the draft contract, and lets authorized
operators read that draft through the canonical `GET /studio/briefs/{id}` path without exposing it
to anonymous public reads.

Reviewer workflow now has a separate `POST .../draft/verdict` endpoint for `approve` and
`request_changes`. Verdicts are gated by `review:briefs`, may attach a review comment message, and
move the D1 draft status independently from publish-candidate marking.

## [2026-06-01] engineering | Review threads and publish-candidate audit

Landed the backend collaboration primitives from
`docs/architecture/studio-review-collaboration-and-promotion.md`: `studio_brief_review_comment`
now stores draft-private root threads, replies, anchors, suggestions, and resolution state, and the
Worker exposes `.../draft/comments*` endpoints for anchored comments, change requests, replies,
status changes, and body-markdown suggestion acceptance.

Review state now participates in validation, approval, and publish-candidate marking: open change
requests or suggested edits block approval/publish until resolved or dismissed. Candidate export now
rejects stale blocking validation, works for source-backed and draft-only briefs, includes a private
audit section with validation/content hashes/review summaries, and the promotion command archives
that audit without copying private review threads into public `comments[]`.

## [2026-06-01] engineering | Durable refs, attach, and promotion receipt

Finished the next Studio authoring backend slice: draft refs now persist in
`studio_brief_draft_ref`, round-trip through the draft contract, and are embedded into candidate
exports/public projections alongside `bodyMd` and typed blocks. The Worker exposes
`GET/PUT .../draft/refs` for durable ref lists while preserving `.../draft/refs/resolve` as the
normalizer.

Added `POST .../draft/attach` so Send-to-brief can attach a captured Studio object as a typed block,
persist its refs, and append the matching body-markdown directive. Added
`POST .../draft/promotion-receipt` so the offline promotion command can close the D1 lifecycle by
marking a publish candidate as `published` with candidate id, target public brief id, artifact key,
artifact hash, and promotion timestamp.

## [2026-06-01] engineering | General review-packet generation and packet coverage

Added the registry-backed `findings review-packets` path for March 2026. It rebuilds detector specs
from the analytics registry, packetizes every local finding candidate, preserves existing packet ids
for already-reviewed candidates, regenerates the promotion queue, and emits
`review-packet-coverage.json` so complete, partial, missing, and no-candidate detector states are
tracked explicitly.

The refreshed March packet has 773 candidates and 773 packets across 9 candidate-bearing detector
families, with 0 candidate-to-packet gaps. Seven detector families have complete packets. Two are
partial: `source_gap` is intentionally data-quality-only, and `persistent_speed_hotspot` exposes a
real grain/lineage mismatch because segment candidates are backed by route-level coverage rows.
The detector evaluation harness now consumes the review-packet coverage artifact, so packet-covered
counts no longer treat partial packets as complete.

## [2026-06-01] engineering | Packet coverage gate and persistent-speed coverage repair

Finished the follow-up slice for review-packet coverage. `persistent_speed_hotspot` now emits
segment-scope coverage rows for new runs, and the March local findings table was repaired with 100
exact segment hit rows for its existing candidates. Added `findings coverage-audit` so
`detector-coverage-audit.json` is rebuilt from SQLite instead of stale hand-maintained detector
lists; it now records 773 candidates, 3,680 evidence links, and 17,094 coverage rows, including
13,928 `speed_pace_hotspot` segment/daypart rows.

`findings review-packets` now also regenerates `review-queue.json` from the same packet/promotion
surface, keeping the Studio serving queue aligned with 773 packets and 0 unlinked candidates. Added
`audit review-packet-coverage` as a release gate: March now has 8 complete candidate-bearing
detectors, 1 warning-only partial (`source_gap`, data-quality packets without counter-evidence), and
0 missing packet candidates. Reran `evaluate detectors`; portfolio pre-gate and gated scores are now
854.4, and `speed_pace_hotspot` no longer has the missing-data-scope flag.

## [2026-06-01] engineering | Registry detector execution and route-month shadow audit

Extended `findings run-detector` beyond `speed_pace_hotspot` to run five more registered detector
families through typed feature resolvers: `headway_reliability_ewt`, `bunching_hotspots`,
`schedule_mismatch`, `travel_time_variability`, and `degradation_trend`. The March local findings
surface now has 982 candidates, 4,098 evidence links, and 1,322,549 coverage rows across 14
candidate-bearing detector families.

Refreshed review packets, packet coverage, generic score vectors, evaluation labels, evaluation
scorecards, and the corpus-grain audit. Packet coverage now passes with 982 packets for 982
candidates; `source_gap` has a packet-coverage waiver for absent counter-evidence because it is a
data-quality detector, while still being blocked from service-performance promotion. The generic
score-vector builder now handles million-row coverage arrays without spreading scores onto the
call stack.

Added `audit route-month-shadow`, which compares route-month clean no-hits against richer-grain
detector candidates on the same route. The first March run found 350 route-month clean-no-hit
routes, 112 routes with hidden richer-grain candidates, and 1,142 hidden candidate scopes. The
evaluation harness now reports 18 scorecards, 20,933 derived negatives, 4,185 holdout negatives,
782 near-miss scopes, 1,300,725 missing-data scopes, and a portfolio gated score of 845.2.
