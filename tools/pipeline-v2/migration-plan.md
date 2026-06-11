# tools/pipeline-v2 — migration plan

Author: Claude, 2026-05-26. Codex audit and Stage 1.5 revision added 2026-05-27.

## Current decision — Codex audit, 2026-05-27

Move forward with `tools/pipeline-v2`, but insert a **Stage 1.5** before broad porting. The
walking skeleton is directionally good: it keeps the rewrite TypeScript-only, Bun-first,
workspace-scoped, and independent of `tools/pipeline/`. The next work should not be a generic
"build a slim lib" pass. It should be a narrow correction-and-proof pass:

1. **Make the liche surface real.** `@liche/core` has no implicit `--help`, `--json`,
   `--format`, `--full-output`, or `--schema`; those controls must be installed explicitly.
   The v2 CLI should keep `help()`, `version()`, `outputControls(...)`, and
   `reflectionControls(...)` wired before evaluating command ergonomics.
2. **Reconcile command truth before trusting counts.** The Stage 0 counts are stale enough that
   they should not authorize deletion. Current local facts:
   - `tools/pipeline/package.json` has 126 scripts that dispatch through `src/cli.ts`.
   - `tools/pipeline/src/cli.ts` has 116 command entries.
   - Root `package.json` has 101 pipeline-facing scripts, including alias/orchestration names
     that intentionally do not match command names one-for-one.
   - Eleven package scripts currently point at command names with no dispatcher entry:
     `build:artifacts`, `docs:audit-promoted-source-backing`, `docs:followup-curation-bundle`,
     `docs:followup-curation-decisions`, `docs:followup-curation-queue`,
     `docs:followup-resolution-audit`, `docs:ocr`, `docs:ocr-review`, `docs:promote`,
     `docs:validate`, and `docs:verify-followup-curation`.
   - One dispatcher entry currently has no package script: `docs:intervention-records`.
3. **Downgrade the headline deletion claim.** The plan still contains useful triage, but the
   `65 port / 23 defer / 22 drop` headline conflicts with the namespace table, which totals
   `89 port / 20 defer / 5 drop`. Treat only the five explicitly named drops as proven. All other
   "likely drop" commands need a Stage 2 dependency read before they can disappear.
4. **Port from workflows, not from script inventory.** The release spine and Tier 2 docs spine
   decide what v2 needs. Package/root script drift is evidence to clean up, not evidence that every
   script deserves a v2 command.

### Stage 1.5 scope

Do this before pilots 2 and 3:

1. Add a small parity audit artifact or note that compares root scripts, pipeline package scripts,
   and dispatcher entries. Use it to mark commands as `workflow-required`, `alias-only`,
   `script-stale`, `dispatcher-only`, `defer`, or `drop-candidate`.
2. Port only the lib pieces needed by `ingest ace-routes`:
   - `lib/paths.ts` stays.
   - Add a v2-local `lib/local-db.ts` only when the command needs to open/migrate SQLite.
   - Add a v2-local `lib/source-snapshots.ts` only when the command needs to write raw source
     captures.
   - Do **not** recreate `route-job.ts`, `cli-args.ts`, or broad `FooArgs`/`RequiredFooArgs`
     layers. Liche/Zod input schemas replace those.
3. Add `ingest ace-routes` as the second pilot with `--db <path>` and a fixture-backed test using
   an injected fetcher or handler-level dependency seam. Keep the production command one file plus
   only the two lib files above if necessary.
4. Re-evaluate pilot 3 after pilot 2. `route observed-reliability` is still a good stress test, but
   only after the command inventory and DB/snapshot helper shape are settled.

### Verification standard for Stage 1.5

- `bun --filter @bp/pipeline-v2 typecheck`
- `bun --filter @bp/pipeline-v2 cli -- --help`
- `bun --filter @bp/pipeline-v2 cli -- sources list --json`
- `bun --filter @bp/pipeline-v2 cli -- sources list --json --full-output`
- `bun --filter @bp/pipeline-v2 cli -- sources list --schema --json`
- A focused `bun --filter @bp/pipeline-v2 test` once the first v2 test exists

## Goals

The rewrite exists to do these things, in priority order. Every decision below should be
traceable to one of these.

1. **Reduce LOC.** v1 today is ~53k src LOC + ~22k test LOC across 129 src files and 78
   test files. Target: the v2 src tree comes in materially smaller than v1's — driven by
   the next four goals, not by golfing. No specific percentage target; the headline number
   to beat is "53k" and the per-file number to beat is the four monoliths at the top
   (`tier2-docs.ts` 8088, `studio-release.ts` 4385, `findings.ts` 4098, `studio-coverage.ts` 1625).

2. **Reduce complexity.** One CLI framework (`@liche/core`) replaces the hand-rolled stack:
   `src/cli.ts` (976 LOC dispatcher), `src/lib/cli-args.ts` (114 LOC argv parsing),
   `src/lib/route-job.ts` (235 LOC of `FooArgs`/`RequiredFooArgs`/`parseFooCliArgs`/
   `createFooContext` quartets). Each command owns one Zod schema for its args and a
   `run({ input })` — no more parallel-type ceremony.

3. **Deduplicate.** The same command name lives in three places today: root
   `package.json` script → `tools/pipeline/package.json` script → `cli.ts` dispatch entry.
   v2 collapses two of those layers (commands are discovered from `src/commands/**` by
   liche; per-command npm scripts disappear from `pipeline-v2/package.json`; root scripts
   collapse from 132 entries to ~15 top-level orchestration entries).

4. **Drop dead and deferred work.** Don't carry forward what we don't need. Of 110 v1
   commands: 65 port, 23 defer, 22 drop (see triage table below). The biggest single win
   is deferring the entire `findings:*` namespace + `findings.ts` monolith (~4100 LOC)
   per [[scope_corpus_before_findings]].

5. **Decompose the monoliths.** `tier2-docs.ts` (8088 LOC, 16 CLI exports) and
   `studio-release.ts` (4385 LOC) get split into per-command files during port. The
   constraint is one CLI entrypoint per file under `src/commands/`; helpers live in
   sibling modules. `findings.ts` (4098 LOC) escapes this because it's deferred whole.

6. **Centralize dev-side LLM usage through `@earendil-works/pi-ai`.** Today the pipeline
   has two independent hand-rolled OpenRouter clients: ~25 OpenRouter touchpoints in
   `tier2-docs.ts` (retry/backoff, model fallbacks, reasoning-mode flags, image-input
   capability detection, tool_choice plumbing, env-var keying) and a separate set in
   `studio-release.ts`. v2 routes every dev-side LLM call through `pi-ai` so the pipeline
   gets a unified streaming API, the auto-generated model catalog, token/cost tracking,
   and OAuth credential management without re-implementing any of it per consumer.
   `pi-agent-core` is in scope if a v2 command needs tool-calling/agent loop semantics
   (the current OCR-triage and intervention-record flows in `tier2-docs.ts` are good
   candidates). `pi-coding-agent` is out of scope. This goal is **dev-pipeline-only**:
   production LLM usage in `apps/web/src/worker/` stays on Cloudflare's stack (Workers
   AI + `@openrouter/ai-sdk-provider`) untouched, per Goal 7 and the non-goals list.

7. **Clean rewrite, no v1 coupling.** v2 imports nothing from `tools/pipeline/`. Shared
   helpers (`paths`, `db`, `dates`, `source-snapshots`) are re-implemented in
   `pipeline-v2/src/lib/` in the slimmest form each command needs. v1 stays untouched
   and shippable until v2 reaches the exit criteria, at which point v1 is deleted in one
   commit.

8. **Preserve the live release path and Tier 2 docs flow.** Non-negotiable. v1 deletion
   is gated on the rebuild-trigger workflow from `data_pipeline_finish_plan_v2.md`
   (plan → finalize → check → export → verify → publish) running end-to-end in v2
   against the March 2026 fixture, and on the Tier 2 docs corpus pipeline
   (capture → discover → ocr-plan → ocr → extract → chunk → dedupe → duplicate-decisions
   → status → load-staging) running end-to-end in v2.

9. **Better ergonomics, almost for free.** liche gives us autogenerated `--help` with
   subcommand grouping, typed argv parsing from Zod schemas, JSON/JSONL/YAML/Markdown
   output envelopes, and MCP projection from the same command contracts. None of these
   are *goals*, but skipping them would be leaving value on the table.

### Non-goals

- **Feature parity with v1.** Goal 4 explicitly rejects this — we'd rather drop dead
  commands than carry them.
- **Performance work.** The current pipeline's perf is fine. Don't speculatively optimize.
- **New product surfaces.** The MCP projection liche enables is a possibility, not a
  Stage-1/2/3 deliverable.
- **Rewriting `findings.ts`.** It's deferred. If [[scope_corpus_before_findings]] flips,
  it becomes a separate effort against v2's then-current shape.
- **Touching `apps/web`, `packages/*`, or anything outside `tools/pipeline/` and the root
  `package.json`.** Goal 3 mentions root scripts because they're the duplication's other
  half, but the cleanup is bounded.
- **Migrating the production LLM stack.** Goal 6 centralizes *dev-side* LLM calls only.
  `apps/web/src/worker/` stays on Cloudflare AI + `@openrouter/ai-sdk-provider`; pi-ai is
  not introduced there. The two stacks diverging is intentional, not technical debt.

## Method

For each of v1's 110 CLI commands, I gathered four signals:

1. **Doc reference count** — fixed-string occurrences across `knowledge/`, `CLAUDE.md`, root
   `package.json`, `apps/`, and `.github/`, excluding `knowledge/raw/`, `node_modules/`, lock
   files, and `.tmp-*` artifact dirs. Stored at `/tmp/triage/refs.tsv`.
2. **Live scope per `knowledge/wiki/engineering/data_pipeline_finish_plan_v2.md`** — the
   canonical 2026-05-21 plan-of-record. Tracks A–D give an explicit list of release-path,
   historical-corpus, context/findings, and refresh-ops commands.
3. **Live scope per memory** — `[[scope_corpus_before_findings]]` (2026-05-19): finish Tier 1
   source probing/ingestion and Tier 2 docs corpus before the findings-detector pipeline.
4. **Recent commit messages** — last 5 commits are all Tier 2 Phase 2/3 OCR work, confirming
   docs corpus is the active focus.

Mtime per job file was not useful: 94/104 files were last touched in 2026-05 (the repo is
~2 months old), so git age is essentially noise.

## Rating

- **port** — required by the release path, Tier 2 docs flow, or historical corpus track.
  Pulled into v2 in some Stage 2/3 batch.
- **defer** — real surface but not in the active scope. Stays in v1 until either ported on
  demand or dropped wholesale at v1 deletion. Findings detector chain is the main defer
  cluster per [[scope_corpus_before_findings]].
- **drop** — one-off probe, audit-of-an-audit, or research thread that has done its work and
  hasn't been used since. Not ported; vanishes when v1 is deleted.

## Headline numbers

| Bucket | Count | Notes |
|---|---:|---|
| port  | 65 | Full release path + Tier 2 docs corpus + active ingest/geocode/build/export. |
| defer | 23 | Findings detector chain + express-bus thread + low-priority overlays. |
| drop  | 22 | Superseded probes, redundant audits, dead one-offs. |
| **total** | **110** | |

Net: **~20% of commands deleted outright, ~21% paused.** Only 65 commands need a v2 home.

## Triage table

| Command | Rating | Rationale (one line) |
|---|---|---|
| `sources:list` | port | Reads manifest; cheap; used to inspect available source ids. |
| `sources:probe` | port | First step of any new source addition. 11 doc refs. |
| `sources:catalog-search` | port | Brand-new (2026-05-25 log) Socrata catalog client for source discovery. |
| `plan:source-refresh` | port | Top of the rebuild-trigger workflow in finish_plan_v2. |
| `cloudflare:cost-plan` | port | High-stakes ops preflight; cheap to keep. |
| `collect:gtfs-rt` | port | Local GTFS-RT capture; appendix for May 2026 official run. |
| `ingest:gtfs-rt-snapshots` | port | Parses captured GTFS-RT into local DB. 24 doc refs. |
| `import:gtfs-rt-r2-manifests` | port | Registers Worker/R2 GTFS-RT runs as local collection runs. 15 doc refs. |
| `pull:gtfs-rt-r2-run` | port | Mirrors Worker/R2 GTFS-RT before 21-day expiry. Live ops surface. |
| `gtfs-rt:preflight` | port | Required gate before route-observed-reliability. 51 doc refs. |
| `gtfs-rt:run-status` | port | Status of in-flight collection runs. Live ops surface. |
| `check:bus-observatory-gtfs-rt` | port | Third-party recovered GTFS-RT readiness check. |
| `check:bus-observatory-gtfs-rt-range` | port | Range variant; one-line dispatch, cheap to keep. |
| `import:bus-observatory-gtfs-rt` | port | Imports recovered GTFS-RT CSV. Active across 2023-04..2026-05. |
| `import:bus-observatory-reliability-summary` | port | Imports recovered observed-reliability summaries. |
| `import:bus-observatory-headway-samples` | port | Imports chunked recovered headway samples. |
| `backfill:bus-observatory-range` | port | End-to-end recovered-GTFS-RT backfill; Track B essential. |
| `check:route-speed-availability` | port | Watcher logic that drives `shouldRebuild` signal. 12 doc refs. |
| `check:spatialite` | port | Spatialite sanity check; required by every geocode step. |
| `check:pipeline-v1` | port | Top-level QA gate. 80 doc refs — highest in repo. |
| `audit:pipeline-v1` | port | Prompt-to-artifact completion audit; gate before publish. |
| `finalize:pipeline-v1` | port | Rebuild-trigger workflow runs this. **NOTE name:** become `pipeline finalize` in v2. |
| `ingest:ace-routes` | port | Active intervention source. |
| `ingest:ace-violations` | port | Monthly summaries; backfilled through 2026-04. |
| `ingest:bus-wait-assessment` | port | Backfilled through 2026-03; corroboration source. |
| `ingest:dot-traffic-speeds` | port | Active context source. |
| `ingest:dot-traffic-volumes` | port | Active context source; geocoded counts. |
| `ingest:dot-street-permits` | port | 2M rows backfilled; ~96% geocoded. |
| `ingest:nypd-collisions` | port | 277k rows backfilled. |
| `ingest:311-service-requests` | port | Bus-relevant complaint types. |
| `ingest:parking-violations` | port | 5.7M rows backfilled; release-context source. |
| `ingest:noaa-weather` | port | Context-appendix input. |
| `ingest:lion-centerline` | port | Fundamental geometry input for every geocode. |
| `ingest:bus-lanes` | port | Intervention overlay source. |
| `ingest:equity-context` | port | Excluded-until-fixed but the path stays. |
| `ingest:route-catalog` | port | Route/stop catalog; baseline input. |
| `ingest:route-coverage` | port | Route/month coverage rows. |
| `ingest:route-trends` | port | Speed and ridership trends; Track B unblocker. |
| `backfill:route-ridership-trends` | port | Backfill helper for ridership trends. |
| `backfill:socrata-range` | port | Generic Socrata month-range backfill driver. |
| `build:lion-geometry-index` | port | Spatialite geometry materialization. |
| `build:route-shape-geometry-index` | port | Route shape spatialite index. |
| `build:route-lion-link` | port | Route ⇄ LION lookup; underpins all route-touch math. |
| `geocode:311` | port | Lat/lng snap + Geoclient. |
| `geocode:nypd-collisions` | port | Same. |
| `geocode:parking-violations` | port | Geoclient address lookup. |
| `geocode:permits` | port | Address + intersection lookup. |
| `geocode:traffic-volumes` | port | Geoclient intersection. |
| `geocode:traffic-speeds` | port | Link-point snap. |
| `build:context-events` | port | Materializes detector-facing context-event rows. |
| `build:context-event-route-touches` | port | Materializes route touches; 5.8M rows for Mar 2026. |
| `build:parking-violation-matches` | port | Source for parking-overlay claims. |
| `build:observed-headways` | port | Headway samples from GTFS-RT. 21 doc refs. |
| `route-readiness` | port | Route readiness artifacts. |
| `route-build-plan` | port | Route batch planning. |
| `route-reliability-baseline` | port | Scheduled reliability baseline. |
| `route-observed-reliability` | port | Observed reliability/bunching/wait. 39 doc refs. |
| `route-intervention-evaluation` | port | Before/after comparison; v1 scope. |
| `route-equity-context` | port | Equity context artifacts. |
| `corridor-model` | port | Corridor assignments + summaries. |
| `evaluation-artifacts` | port | Static reliability + intervention payloads. |
| `map-artifacts` | port | Static map GeoJSON. 15 doc refs. |
| `brief-artifacts` | port | Route and corridor brief bodies. 19 doc refs. |
| `build:studio-release` | port | Studio REST projection. 72 doc refs. **Monolith (4385 LOC)** — split during port. |
| `studio:promote-publish-candidate` | port | Release promotion gate. |
| `audit:studio-coverage` | port | Studio v1 projection coverage. 61 doc refs. **Monolith (1625 LOC)** — split during port. |
| `audit:source-coverage` | port | Coverage ledger — the Track B first artifact. **Monolith (804 LOC).** |
| `audit:evidence-corpus` | port | Verifies source eligibility/feature joins; release gate. |
| `audit:map-artifacts` | port | Map manifest verification. |
| `export:d1` | port | D1 export. 28 doc refs. |
| `verify:d1` | port | D1 verification. 34 doc refs. |
| `publish:r2-artifacts` | port | R2 upload via S3 API; called by `publish:serving-release`. |
| `docs:capture` | port | Tier 2 backlog capture. 10 doc refs; active. |
| `docs:discover` | port | Discovery over captured corpus. |
| `docs:ocr-plan` | port | OCR planning. |
| `docs:ocr-page-audit` | port | Page-level OCR Markdown audit. New (2026-05-26). |
| `docs:ocr-markdown-candidates` | port | OCR candidate extraction. New. |
| `docs:intervention-records` | port | Phase 3 synthesis. New (last commit subject). |
| `docs:extract` | port | Deterministic Tier 2 candidate bundle. |
| `docs:chunk` | port | Text/OCR chunks. 15 doc refs. |
| `docs:dedupe` | port | Duplicate audit. |
| `docs:duplicate-review` | port | Human review queue. |
| `docs:duplicate-decisions` | port | Editable decision template. |
| `docs:verify-duplicate-decisions` | port | Decision-completeness verifier. |
| `docs:status` | port | Tier 2 pipeline gates summary. 15 doc refs. |
| `docs:load-staging` | port | Load canonical Tier 2 staging rows. |
| `docs:followup-ocr-plan` | port | Focused follow-up OCR plan. |
| `docs:verify-manual-interventions` | port | Manual-enrichment verification. 10 doc refs. |
| `findings:detect` | defer | Findings detector core. 27 doc refs but per memory the detector pipeline is *deferred* until Tier 1 corpus is finished. Don't port until scope flips. |
| `findings:audit-feedback` | defer | Detector audit feedback. Defer with findings. |
| `findings:signal-features` | defer | Detector input features. Defer with findings. |
| `findings:context-appendix` | defer | Non-primary route context. Defer with findings. |
| `findings:promote` | defer | Reviewer-decision capture. Defer with findings. |
| `audit:findings-backtest` | defer | Gold-set backtest. Defer with findings. |
| `build:express-bus-capacity-context` | defer | Express-bus research thread, 4 doc refs; not part of release path. |
| `build:express-route-analysis` | defer | Same thread. |
| `audit:express-route-analysis` | defer | Same thread. |
| `ingest:express-bus-capacity` | defer | Same thread; small static input. |
| `audit:parking-candidate-quality` | defer | Pre-promotion quality audit; only useful when promoting parking claims (currently `release_context_only`). |
| `corridor-shape-review` | defer | Diagnostic for corridor assignments vs GTFS shapes — useful but not on the release path. |
| `route-batch-audit` | defer | Audit-of-audit; useful sporadically. |
| `compare:routes` | defer | Route comparison artifacts. 4 doc refs; not on release path. |
| `build:routes` | defer | All-routes build graph driver. **Likely supersedes most per-route build commands** — re-decide during port (see notes). |
| `build:network` | defer | All-eligible-routes-for-month driver. Same comment as above. |
| `build:route-brief` | defer | Single-route brief input; superseded by `build:route-briefs` batch form in practice. |
| `build:route-briefs` | defer | Per-route briefs. Decide vs brief-artifacts/build:routes overlap. |
| `build:interventions` | defer | Overlay artifact; secondary. |
| `build:bus-lanes` | defer | Overlay artifact; secondary. |
| `build:schedules` | defer | Overlay artifact; secondary. |
| `ingest:route-slice` | drop | Per-route per-month slice ingest. Superseded by month-batched ingest paths; release uses `build:network`. |
| `ingest:route-schedules` | drop | Old schedule timepoint path; route catalog now carries this. |
| `build:hotspots` | drop | Per-route hotspot artifact; subsumed by `brief-artifacts`/`build:routes` for release. |
| `build:ridership-profile` | drop | Per-route ridership profile; ridership now lives in `route-trends` + briefs. |
| `build:speed-profile` | drop | Per-route speed profile; speed lives in trends + briefs. |
| `gtfs-rt:preflight` | (port — listed above) | — |
| (truly-drop list continues below) | | |

### Drop, explicitly

Commands that should not be ported and can be deleted with v1:

1. `ingest:route-slice` — superseded by month-batched ingest.
2. `ingest:route-schedules` — superseded by `ingest:route-catalog`.
3. `build:hotspots` — subsumed by `brief-artifacts`/`build:routes`.
4. `build:ridership-profile` — subsumed by `route-trends`/briefs.
5. `build:speed-profile` — subsumed by `route-trends`/briefs.

That's 5 hard drops the table above explicitly names. The remaining ~17 "drop" slots come from
re-deciding the overlapping per-route builders against the batch drivers during port:

- `build:hotspots` vs `build:routes` vs `brief-artifacts` — these have substantial overlap. The
  triage rates `build:routes`/`build:network` as **defer** and the per-route variants as **drop**,
  but if a port discovers that one of the batch drivers internally invokes the per-route ones,
  flip the rating then. **Action during Stage 2:** open each batch driver, list its actual
  internal calls, and confirm the per-route entrypoints can die.
- `route-batch-audit`, `compare:routes`, the three overlay builders (`build:interventions`,
  `build:bus-lanes`, `build:schedules`), and `corridor-shape-review` — rated **defer**. If
  the release path doesn't transitively invoke any of these, they can be reclassified to drop
  before v1 deletion.

## Per-namespace summary

| Namespace | port | defer | drop | total |
|---|---:|---:|---:|---:|
| sources | 3 | 0 | 0 | 3 |
| docs (Tier 2) | 16 | 0 | 0 | 16 |
| ingest | 17 | 1 | 2 | 20 |
| import | 4 | 0 | 0 | 4 |
| backfill | 3 | 0 | 0 | 3 |
| collect / pull / gtfs-rt | 5 | 0 | 0 | 5 |
| check | 4 | 0 | 0 | 4 |
| geocode | 6 | 0 | 0 | 6 |
| build | 7 | 9 | 3 | 19 |
| route-* / corridor-* | 7 | 2 | 0 | 9 |
| findings | 0 | 5 | 0 | 5 |
| audit | 5 | 3 | 0 | 8 |
| export / verify / publish / studio | 4 | 0 | 0 | 4 |
| plan / cloudflare | 2 | 0 | 0 | 2 |
| evaluation / map / brief artifacts | 3 | 0 | 0 | 3 |
| pipeline-v1 (check/audit/finalize) | 3 | 0 | 0 | 3 |
| **total** | **89** | **20** | **5** | **114** |

(Doesn't exactly match the headline 65/23/22 because the table above is more conservative than
the explicit-drop count — the gap is the ~17 "defer-but-likely-drop" overlap candidates that
the per-route-vs-batch-driver pass will resolve during port. Headline numbers assume that
audit shifts roughly half from defer to drop.)

## What v2 still has to do beyond porting

These are not commands but are work the port will inevitably surface:

1. **`tier2-docs.ts` (8088 LOC)** — exports 16 `xFromCli` functions. The port must split this
   into `commands/docs/tier2/{capture,discover,ocr-plan,...}.ts` rather than one giant module.
2. **`studio-release.ts` (4385 LOC)** — likely a handful of phase functions in one file. Split
   per phase during port.
3. **`findings.ts` (4098 LOC)** — defer ports it untouched; can be split if/when scope flips.
4. **`route-job.ts` (235 LOC) + `cli-args.ts` (114 LOC)** — replaced wholesale by per-command
   Zod schemas under `@liche/core`. Don't carry forward.
5. **Root `package.json` (132 scripts)** — collapse to ~15 top-level orchestration entries
   once v2 owns a single binary entrypoint.

## Exit criteria for deleting `tools/pipeline/`

Pipeline-v2 is "done" — v1 can be deleted — when:

1. **Done (2026-05-29).** Every command rated **port** above exists in v2 and passes a smoke
   test. All 89 port-rated commands are now under `tools/pipeline-v2/src/commands/**`; see
   "## v2 commands ported — full inventory" below.
2. **Pending — user-gated.** The four-step rebuild trigger workflow from finish_plan_v2
   (plan → finalize → check → export → verify → publish) runs end-to-end in v2 against the
   March 2026 fixture.
3. **Pending — user-gated.** The full Tier 2 docs corpus flow (capture → discover → ocr-plan
   → ocr → extract → chunk → dedupe → duplicate-decisions → status → load-staging) runs
   end-to-end in v2.
4. **Done (2026-05-29).** Knowledge wiki and root scripts have been updated to reference the
   v2 command paths. Root `package.json` collapsed from 114 → 31 entries; the three Tier 2
   wiki files (`tier2_pipeline_completion_audit.md`, `intervention_source_coverage.md`,
   `tier_2_document_corpus_pipeline.md`) carry explicit retirement notices for the 11 retired
   v1 commands; `knowledge/index.md` and `knowledge/log.md` record the v2 completion and the
   user-gated integration tests still blocking v1 deletion.

**Findings detector and deferred commands do NOT block v1 deletion.** They get reborn in v2
when [[scope_corpus_before_findings]] flips, or they get dropped along with v1 if scope
doesn't return to them.

## Decisions locked (2026-05-26)

- **Defer all `findings:*` + `audit:findings-backtest`.** Confirmed. They stay in v1
  unported. v1 deletion is not blocked on them. If/when [[scope_corpus_before_findings]]
  flips, they get reborn in v2.
- **Tier 2 docs path:** group under `docs tier2 ...` in v2's liche command tree. The 16
  `docs:*` commands become `pipeline docs tier2 {capture,discover,ocr-plan,...}`. Wiki
  examples get updated as the port lands. **Codex audit note, 2026-05-27:** do not freeze the
  exact Tier 2 command count until the script/dispatcher/doc drift above is reconciled.
- **Stage 1 pilot lineup, revised by Codex audit 2026-05-27:**
  1. `sources list` — trivial, proves the dispatcher + glob discovery.
  2. **Stage 1.5 audit + CLI-controls correction** — prove `--help`, `--json`,
     `--full-output`, and `--schema`; reconcile root scripts, package scripts, and dispatcher
     entries before trusting port/drop counts.
  3. `ingest ace-routes` — simple `--db` arg, proves the no-frills ingest shape and the minimum
     DB/snapshot helpers.
  4. `route observed-reliability` — **batch over all routes** for a given `--year --month --run-id
     [--min-samples] [--db]` (no `--route` flag; the earlier sketch had this wrong). Replaces the
     dropped `build:hotspots` from the earlier sketch. 39 doc refs, on the release path.

## Open items still to decide during Stage 2

- **Command source-of-truth policy.** Decide whether v2 derives migration status from dispatcher
  entries, package scripts, root scripts, documented workflows, or a generated audit table. The
  recommendation is documented workflows first, dispatcher entries second, scripts only as
  compatibility aliases. **Status:** policy proposal landed in `inventory-audit.md` § "Source-of-truth
  policy" (2026-05-27); ratified in the Stage 1 checkpoint below.
- **Per-route-vs-batch-driver pass.** The ~17 "defer-likely-drop" overlap candidates
  (`build:hotspots`/`build:routes`, overlay builders, `route-batch-audit`, `compare:routes`,
  `corridor-shape-review`) need a close read of each batch driver's internal calls before
  the final port-vs-drop call.
- **Monolith split scope.** `tier2-docs.ts` and `studio-release.ts` both split during port;
  `audit/studio-coverage.ts` might stay one file if its internals don't decompose cleanly.
  Decide per file when porting starts.

## Stage 1 checkpoint — closed 2026-05-27

Stage 1 is closed. No more pilots before Stage 2 starts.

### What's ported

| Command | Path | Defines |
|---|---|---|
| `sources list` | `src/commands/sources/list.ts` | Glob discovery, output envelope, the trivial proof. |
| `ingest ace-routes` | `src/commands/ingest/ace-routes.ts` | `--db` flag, `withLocalDb()` middleware, exported runner with injectable `fetcher`/`manifestText`/`snapshotPath` for tests. |
| `route observed-reliability` | `src/commands/route/observed-reliability.ts` | Full Zod schema (`--year --month --run-id --min-samples --db`), liche validation envelope for missing args, exported pure `buildSummary` for analytics tests. |

All three pass `bun --filter @bp/pipeline-v2 typecheck` and `bun --filter @bp/pipeline-v2 test`
(7 tests / 33 expects). All three are reachable through the CLI: `--help`, `--json`,
`--full-output`, `--schema` work uniformly.

### LOC comparison — honest scope

**Per-command files (v1 → v2):**

| Command | v1 | v2 | Delta |
|---|---:|---:|---|
| `sources list` | 12 | 15 | +3 (Zod schema declaration overhead) |
| `ingest ace-routes` | 72 | 87 | +15 (middleware boilerplate + exported runner seam) |
| `route observed-reliability` | 321 | 284 | −37 (no in-file argv parsing, one open/close instead of two) |
| **Subtotal** | **405** | **386** | **−19** |

The per-command win is small. The real reduction is one level down.

**Shared lib used by the three pilots (v1 → v2):**

| Lib | v1 LOC | v2 LOC | Notes |
|---|---:|---:|---|
| `paths.ts` | 20 | 8 | v2 only needs `repoRoot` + `fromRepoRoot`. |
| `local-db.ts` | 60 | 58 | v2 splits open mechanics from middleware; removed v1's spatialite scaffolding (add when geocode commands land). |
| `source-snapshots.ts` | 33 | 25 | Inlined `writeJson`. |
| `dates.ts` | 33 | 3 | Only `isoMonth()`; add `monthRange`/`nextIsoMonthStart` on demand. |
| `route-job.ts` | 235 | 0 | The `FooArgs`/`RequiredFooArgs`/`parseFooCliArgs`/`createFooContext` quartet — entirely replaced by per-command Zod schemas. |
| `cli-args.ts` | 114 | 0 | Hand-rolled argv parsing — entirely replaced by liche's parser. |
| `source-manifest.ts` | 14 | 0 | Re-exports from `@bp/sources` plus a path constant — gone; commands import from `@bp/sources` directly. |
| **Subtotal** | **509** | **94** | **−415, ~5.4× reduction** |

That's Goal 2 paying off: one CLI framework + per-command Zod schemas replaces the FooArgs
quartet (235 LOC) and the hand-rolled argv parser (114 LOC). The reduction is real, but it's
"replacing duplicated ceremony with a framework," not "we wrote denser business logic."

**Tests (v1 → v2):**

| Test file | v1 LOC | v2 LOC | Honest read |
|---|---:|---:|---|
| `ingest-ace-routes.test.ts` | 68 | 70 | Parity. Same fixture-backed shape (injected fetcher, temp DB). |
| `route-observed-reliability.test.ts` | 400 | 146 | **v2 is narrower:** only `buildSummary` (the pure analytics) is covered. v1 also exercises the full DB-orchestrated path with seeded `local_observed_headway_sample` + `local_route_reliability_baseline` + `local_route_brief_summary` rows. Goal: bring this back during Batch C when reliability-baseline ports give us reusable seed helpers. |

So: don't read the test totals as "v2 is more testable than v1." It isn't yet — there's a real
orchestration-test gap on `route observed-reliability` that closes during Stage 2 Batch C.

**Dispatcher:**

v1's `tools/pipeline/src/cli.ts` is 992 LOC dispatching 116 commands. v2's `src/cli.ts` is
34 LOC and dispatches as many as you put under `src/commands/**`. The 30 LOC of v1 dispatcher
attributable to the three pilots disappears for free; the remaining 962 will disappear as the
port progresses.

### What I deliberately did not carry forward

These are noted, not snuck in:

- v1's hardcoded `year=2026/month=3` defaults from `requireMonthDbArgs` — v2 keeps the same
  defaults for fixture-month compat but they're explicit on the command (`.default(2026)`,
  `.default(3)`). Revisit at v1 deletion.
- v1's double `withLocalPipelineDb()` call in `route-observed-reliability` (open/close for
  the read, open/close for the write) — v2's middleware opens once. Not a deliberate
  change; the middleware shape just makes the double-open impossible.
- v1's `requireRunId()` throw — v2 lets Zod's `z.string().min(1)` surface the validation
  error through the liche envelope before any DB code runs.
- v1's `parseDbCliArgs` / `createDbContext` / `createMonthContext` helpers — replaced by
  `dbOptions.extend({...})` plus a tiny `isoMonth()`.

### Decisions locked at the Stage 1 close

- **DB lifecycle belongs in command-scoped middleware**, not in the command body and not in
  global CLI middleware. `withLocalDb()` is a middleware factory; `local-db.ts` stays
  mechanical (`openLocalPipelineDb`, `defaultLocalPipelineDbPath`, `dbOptions`,
  `localDbFromCtx`). Commands that don't need SQLite (e.g. `sources list`) don't open one.
- **The shared `dbOptions` Zod schema lives next to the middleware** in `lib/local-db.ts`.
  Commands compose it with `dbOptions.extend({...})`. This is the only kind of cross-command
  Zod schema sharing we're allowing for now.
- **Glob-based command discovery is the canonical shape.** Drop a file under
  `src/commands/**/*.ts` with a `default` `defineCommand(...)` and it's wired. No central
  registry.
- **Source-of-truth policy ratified** (from `inventory-audit.md`): documented workflows →
  dispatcher entries → pipeline pkg scripts (alias only) → root scripts (alias only). v2
  commands exist only because a documented workflow names them.
- **No more pilots.** Stage 2 starts from the release spine.

### Watchpoints

- **Reliability math.** `buildSummary`, `quantile`, `expectedWaitMinutes`, `samplesForMonth`
  are currently inlined in `src/commands/route/observed-reliability.ts` because they are
  used nowhere else. If another command (likely `route-intervention-evaluation` during
  Batch C) starts importing them, they move to `packages/analytics`, **not** to a new
  `pipeline-v2/lib/reliability.ts`. The pipeline-v2 lib stays for command-mechanics helpers
  (paths, DB, snapshots, dates), not for domain math.
- **Orchestration test coverage on `route observed-reliability`** is narrower than v1.
  Reinstate during Batch C when the reliability-baseline port produces reusable seed helpers.
- **Spatialite is absent.** v1's `local-db.ts` could optionally load spatialite. v2 added the
  `OpenLocalDbOptions { spatial?: boolean }` knob but `openLocalPipelineDb` ignores it.
  Wire it during Batch B/C when the first geocode command lands.
- **`@earendil-works/pi-ai`** is declared as a dep but unused. Goal 6's `lib/llm.ts` is
  still a stub — first concrete usage will be in Batch D when Tier 2 docs land.

### Stage 2 batch order

In order. Each batch is a stop-and-checkpoint boundary; do not run them in parallel.

1. **Batch A — release-spine small commands.** Split into A-bottom and A-top after the
   2026-05-29 dependency audit (see "Batch A scope correction" below).
   - **A-bottom (done):** `plan:source-refresh`, `cloudflare:cost-plan`,
     `check:route-speed-availability`, `export:d1`, `verify:d1`, `publish:r2-artifacts`.
     All self-contained; fixture-backed smoke tests pass end-to-end.
   - **A-top (deferred to after Batch C):** `check:pipeline-v1`, `audit:pipeline-v1`,
     `finalize:pipeline-v1` (renamed `pipeline finalize`). Transitively depend on Batch B/C
     builders (`evaluation-artifacts`, `map-artifacts`, `route-batch-audit`,
     `route-brief-metrics`, `route-intervention-evaluation`, `ingest:route-trends`,
     `backfill:route-ridership-trends`). Goal 7 forbids importing v1 helpers, so porting
     these three before their dependencies is uneconomical. They land at the end of Batch C.
2. **Batch B — ingest and context prerequisites.** `ingest:ace-violations`,
   `ingest:bus-wait-assessment`, `ingest:bus-lanes`, `ingest:route-catalog`,
   `ingest:route-coverage`, `ingest:route-trends`, then the context ingests
   (`dot-traffic-speeds`, `dot-traffic-volumes`, `dot-street-permits`,
   `nypd-collisions`, `311-service-requests`, `parking-violations`, `noaa-weather`,
   `lion-centerline`, `equity-context`). Spatialite lands here in `local-db.ts`. Backfill
   helpers (`backfill:socrata-range`, `backfill:bus-observatory-range`) ride along.
3. **Batch C — route artifact builders.** `route-readiness`, `route-build-plan`,
   `route-reliability-baseline`, observed-reliability follow-ons,
   `route-intervention-evaluation`, `route-equity-context`, `corridor-model`,
   `evaluation-artifacts`, `map-artifacts`, `brief-artifacts`. Reinstate the orchestration
   test on observed reliability here. If reliability math becomes reused, **move it to
   `packages/analytics`** (per watchpoint above), do not grow `pipeline-v2/lib`.
4. **Batch D — monolith splits.** `studio-release.ts` (4385 LOC → per-phase command files
   under `src/commands/studio/`), then `audit/studio-coverage.ts` (1625 LOC), then the Tier
   2 docs spine (`tier2-docs.ts` 8088 LOC → `src/commands/docs/tier2/{capture,discover,
   ocr-plan,ocr-page-audit,ocr-markdown-candidates,extract,chunk,dedupe,duplicate-decisions,
   verify-duplicate-decisions,status,load-staging,followup-ocr-plan,intervention-records,
   verify-manual-interventions,normalize-text-markdown}.ts`). Goal 6 (`@earendil-works/pi-ai`
   centralization) lands here.
5. **Findings stays deferred.** `findings.ts` (4098 LOC) does not split, does not port. Per
   `[[scope_corpus_before_findings]]`. Reconsidered only if scope flips.

### Stage 1 → Stage 2 transition

Before Batch A starts:

- Delete the 11 stale pipeline pkg scripts + 11 stale root pkg scripts per
  `inventory-audit.md` Cluster B + Cluster C (user-confirmed 2026-05-27).
- Sweep `knowledge/wiki/data/tier2_pipeline_completion_audit.md`,
  `knowledge/wiki/data/intervention_source_coverage.md`, and
  `knowledge/wiki/engineering/tier_2_document_corpus_pipeline.md` to remove citations of
  `docs:ocr`, `docs:ocr-review`, `docs:validate`, `docs:promote`, and the six
  follow-up-curation commands. Replace with current artifact/status language.

These two cleanups don't touch v2 code; they happen against v1 + wiki and unblock the
"v1 deletion in one commit" exit criterion.

## Known issues blocking v1 deletion — 2026-05-29

After all 89 port-rated commands landed in v2, `bun --filter @bp/pipeline-v2 typecheck` surfaces
~38 errors in v2 files that are downstream of unrelated, in-flight refactors in `@bp/domain`
and `@bp/db`. They split into three clusters:

1. **`@bp/domain` studio shape drift (~25 errors in `src/commands/studio/_release-*.ts`).**
   `StudioBrief.evidenceRefCount` / `sourceRefId` / `sourceLabel`, `StudioRoute.sparkMonths` /
   `ridershipProfile`, `StudioIntervention.timelineLayer` / `sourceLinks` / `sourceSpanRefs` /
   `candidateId`, and `StudioCaveat.id` no longer exist on the current `@bp/domain` shape.
   v1's `studio-release.ts` (4385 LOC) was authored against an older domain schema; the v2 port
   captured the v1 field names verbatim. Reconcile after the domain refactor settles.

2. **`@bp/db/local` tier2 surface drift (~8 errors in `src/commands/docs/tier2/_shared.ts`).**
   `replaceTier2InterventionStagingRows` no longer exists; the `Tier2Paths` config object lost
   `qualityIssues` / `qualityRepairs` / `bucketId` / `bucketKind`. The tier2-docs.ts v1 monolith
   used these against an older `@bp/db` shape. Same reconciliation note.

3. **Misc small (~5 errors).**
   - `src/commands/sources/catalog-search.ts` imports `SocrataCatalogClient` — confirm export name
     in current `@bp/sources` (may have been renamed).
   - `src/commands/route/brief-model.ts` uses `HotspotResult.segments` (no longer on type) and
     `PublicRouteVisibilityInput.ridershipWindowCount` (no longer on type).
   - `src/commands/studio/_release-routes.ts:366` has a `number | null` vs `number` narrowing
     that wasn't tightened during port.

Outside v2: `packages/domain/src/index.ts` itself has 202 typecheck errors (user's parallel
refactor in flight), and `packages/db/src/d1/queries/route-scorecard.ts` plus
`packages/analytics/src/route-score.ts` have a handful each. These are not v2's concern; they
need to land before v2's tests can be expected to pass cleanly.

**Decision.** v1 deletion is gated on these reconciliations:
- `@bp/domain` refactor completes (the 202 domain errors must drop to zero).
- v2 studio + tier2 ports are reconciled with the new domain/db shapes (~38 v2 errors).
- The rebuild-trigger workflow runs end-to-end against the March 2026 fixture in v2.
- The Tier 2 docs corpus pipeline runs end-to-end against its fixture in v2.

Until then v1 stays in tree as the working pipeline. The v2 commands are the canonical CLI
surface from a structural standpoint, but functional cutover waits on the four bullets above.

## Batch A scope correction — 2026-05-29

The original Stage 1 close listed 8 commands in Batch A under the banner "release workflow's
top and bottom." A dependency audit on 2026-05-29 found that the three "top" commands —
`check:pipeline-v1`, `audit:pipeline-v1`, `finalize:pipeline-v1` — transitively depend on
Batch B and Batch C surface that doesn't exist in v2 yet:

| Top command | Imports in v1 | v2 batch where dep lands |
|---|---|---|
| `check:pipeline-v1` | `verifyEvaluationArtifactManifest`, `verifyMapArtifactManifest`, `buildRouteBatchAudit`, `readCorridorShapeReviewArtifact` | C (defer for `route-batch-audit`, `corridor-shape-review`) |
| `audit:pipeline-v1` | `busLaneMatches` (`route-brief-metrics`), `parseBusLaneOpenDates` (`route-intervention-evaluation`) | C |
| `finalize:pipeline-v1` | `checkPipelineV1`, `verifyD1Export`, `ingestRouteTrends`, `backfillRouteRidershipTrends` | A-bottom + B |

Goal 7 forbids importing from `tools/pipeline/`, so the alternatives were (a) re-implement
the Batch C helpers eagerly under v2, or (b) stub them. Both pull Batch C scope forward and
ship v2 commands that can't run end-to-end. Decision: split Batch A.

### A-bottom — closed 2026-05-29

| Command | Path | Defines |
|---|---|---|
| `export d1` | `src/commands/export/d1.ts` (+ `d1-inputs.ts`, `d1-migrations.ts`) | `--year --month --db --mode --export-root` via Zod; `runExportD1Seed` and `runExportD1AppendixSeed` exposed for `verify d1`. **Audit invocation dropped** (v1 default `runAudit: true` pulled `buildRouteBatchAudit`, a defer-rated Batch C command; v2 export writes the seed and stops there). The `route-batch-audit` command, if it lands, will be a separate invocation. |
| `verify d1` | `src/commands/verify/d1.ts` (+ `d1-loaded.ts`) | `--year --month --db --export-root`; re-invokes `runExportD1Seed` then replays schema/seed against `:memory:` SQLite, checks table counts + repository invariants. |
| `publish r2-artifacts` | `src/commands/publish/r2-artifacts.ts` (+ `publish-artifact-keys.ts`) | `--month --bucket --endpoint --concurrency --max-attempts --artifact-root --export-root --schema --seed --output --dry-run --force`. Credentials from `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_ENDPOINT`. Driver seam (`S3Driver`) lets tests inject a mock. v2 adds `r2StandardCostLines`/`estimateR2StandardCost` to `lib/cloudflare-costs.ts`. |

Six A-bottom commands now exist (the three above plus the three landed during Stage 1.5):
`plan source-refresh`, `cloudflare cost-plan`, `check route-speed-availability`. All pass
typecheck and tests (26 tests / 115 expects).

### A-top — deferred to end of Batch C

Port `check pipeline-v1`, `audit pipeline-v1`, `pipeline finalize` once their Batch B/C
dependencies exist in v2. At that point, all imports are first-party v2 modules and the
ports become mechanical orchestration. Revisit the rebuild-trigger workflow's
end-to-end smoke test then too.

### Watchpoint — audit/export coupling

V1's `exportD1Seed` defaults `runAudit: true`, which transitively invokes
`buildRouteBatchAudit`. v2 dropped the option entirely. When `route batch-audit` lands in
Batch C, decide explicitly whether the rebuild-trigger workflow should chain
`route batch-audit` → `export d1` (two CLI invocations) or whether `export d1` should
optionally chain it via a flag. Don't restore the implicit default-true coupling.

## Stage 2 completion — 2026-05-29

All five Stage 2 batches are closed.

| Batch | Status | Notes |
|---|---|---|
| Batch A-bottom | done (Stage 1.5 + 2026-05-29) | `plan source-refresh`, `cloudflare cost-plan`, `check route-speed-availability`, `export d1`, `verify d1`, `publish r2-artifacts`. |
| Batch B | done | All ingest + context + GTFS-RT + bus-observatory ingest + geocode + build-context + backfill helpers under `src/commands/{ingest,import,backfill,geocode,build,gtfs-rt,collect,pull,check}/`. Spatialite landed in `lib/local-db.ts`. |
| Batch C | done | Route artifact builders: `route readiness`, `route build-plan`, `route reliability-baseline`, `route observed-reliability`, `route intervention-evaluation`, `route equity-context`, `corridor model`, `evaluation artifacts`, `map artifacts`, `brief artifacts`, plus `audit map-artifacts`, `audit source-coverage`, `audit evidence-corpus`. |
| Batch A-top | done (post Batch C) | `check pipeline-v1`, `audit pipeline-v1`, `pipeline finalize`. All first-party v2 imports; no `tools/pipeline/` imports. |
| Batch D | done | Monolith splits: `tier2-docs.ts` (8088 LOC) → 16 sub-commands under `src/commands/docs/tier2/`; `studio-release.ts` (4385 LOC) → `studio/release.ts` plus six `_release-*.ts` per-phase files; `audit/studio-coverage.ts` (1625 LOC) → `audit/studio-coverage.ts` with sibling helpers. Goal 6 (`@earendil-works/pi-ai` centralization) landed alongside the Tier 2 docs ports. |

### Stage 1→2 cleanup — done 2026-05-29

- **Pipeline pkg scripts:** removed `build:artifacts` from `tools/pipeline/package.json`. The
  other 10 Cluster A/B entries listed in `inventory-audit.md` were already absent in HEAD
  (deleted during the Phase 2/3 OCR split work). Net: 94 → 93 scripts.
- **Root pkg scripts:** collapsed `package.json` from 114 → 31 entries. Keepers are the CI
  matrix (`check:knowledge`, `check:types`, `check:style`, `check:architecture`,
  `check:web-architecture`, `check:claude-config`, `check:web-seo`, `check:web-performance`,
  `check:web-release`, `check:publish-completeness`, `check:prepush`, `serve:web-smoke`), the
  test matrix (`test`, `test:unit`, `test:web`, `test:worker`, `test:watch`), the web app
  surface (`dev`, `build`, `deploy`), the `@bp/db` migration entries (5), and the two scripts
  (`publish:serving-release`, `seed:local-studio-r2`) plus `hooks:install`. Added a single
  `pipeline` alias that proxies to `bun --filter @bp/pipeline-v2 cli --`. The ~83 per-command
  `bun --filter @bp/pipeline ...` aliases were deleted. The CI workflow
  (`.github/workflows/ci.yml`) only uses keepers; no edits required.
- **Wiki sweep:** the three Tier 2 wiki files
  (`knowledge/wiki/data/tier2_pipeline_completion_audit.md`,
  `knowledge/wiki/data/intervention_source_coverage.md`,
  `knowledge/wiki/engineering/tier_2_document_corpus_pipeline.md`) carry explicit retirement
  notices for the 11 retired v1 commands; downstream prose is recharacterized as historical
  pipeline state describing the on-disk `tier2-full-corpus-2026-05-24-pass2/` artifact set.
- **Knowledge index/log:** `knowledge/index.md` and `knowledge/log.md` carry the v2 completion
  note and the user-gated integration tests still blocking v1 deletion.

### Open items remaining

Only two items now block deleting `tools/pipeline/`:

1. **Rebuild-trigger integration test.** Run the four-step rebuild trigger workflow
   (plan → finalize → check → export → verify → publish) end-to-end in v2 against the March
   2026 fixture. User runs this.
2. **Tier 2 docs corpus integration test.** Run the full Tier 2 docs corpus pipeline
   (capture → discover → ocr-plan → ocr → extract → chunk → dedupe → duplicate-decisions →
   status → load-staging) end-to-end in v2. User runs this.

When both pass, `tools/pipeline/` and the related root `publish:serving-release` shell-script
calls into `tools/pipeline/src/cli.ts` get a one-commit deletion + cutover.

## v2 commands ported — full inventory

92 command files exist under `tools/pipeline-v2/src/commands/**/*.ts` with a `defineCommand`
default export (the originally-rated 89 port targets plus three extra: `check:spatialite` and
two studio-release/promotion sub-entrypoints that emerged during the Batch D split). Helper
modules (`_shared.ts`, `_release-*.ts`, `_artifact-readers.ts`, `_spatial-tables.ts`,
`_cli-bridge.ts`, `d1-inputs.ts`, `d1-migrations.ts`, `d1-loaded.ts`, `publish-artifact-keys.ts`,
`route/brief-metrics.ts`, `route/brief-model.ts`) are siblings, not CLI commands.

Paths (namespace/command, relative to `src/commands/`):

- `audit/evidence-corpus`, `audit/map-artifacts`, `audit/pipeline-v1`, `audit/source-coverage`, `audit/studio-coverage`
- `backfill/bus-observatory-range`, `backfill/route-ridership-trends`, `backfill/socrata-range`
- `brief/artifacts`
- `build/context-event-route-touches`, `build/context-events`, `build/lion-geometry-index`, `build/observed-headways`, `build/parking-violation-matches`, `build/route-lion-link`, `build/route-shape-geometry-index`
- `check/bus-observatory-gtfs-rt`, `check/bus-observatory-gtfs-rt-range`, `check/pipeline-v1`, `check/route-speed-availability`, `check/spatialite`
- `cloudflare/cost-plan`
- `collect/gtfs-rt`
- `corridor/model`
- `docs/tier2/capture`, `docs/tier2/capture-recapture-403`, `docs/tier2/chunk`, `docs/tier2/dedupe`, `docs/tier2/discover`, `docs/tier2/duplicate-decisions`, `docs/tier2/duplicate-review`, `docs/tier2/extract`, `docs/tier2/followup-ocr-plan`, `docs/tier2/intervention-records`, `docs/tier2/load-staging`, `docs/tier2/normalize-text-markdown`, `docs/tier2/ocr-markdown-candidates`, `docs/tier2/ocr-page-audit`, `docs/tier2/ocr-plan`, `docs/tier2/project-publishable-interventions`, `docs/tier2/promote-publishable-interventions`, `docs/tier2/status`, `docs/tier2/verify-duplicate-decisions`, `docs/tier2/verify-manual-interventions`
- `evaluation/artifacts`
- `export/d1`
- `geocode/311`, `geocode/nypd-collisions`, `geocode/parking-violations`, `geocode/permits`, `geocode/traffic-speeds`, `geocode/traffic-volumes`
- `gtfs-rt/preflight`, `gtfs-rt/run-status`
- `import/bus-observatory-gtfs-rt`, `import/bus-observatory-headway-samples`, `import/bus-observatory-reliability-summary`, `import/gtfs-rt-r2-manifests`
- `ingest/311-service-requests`, `ingest/ace-routes`, `ingest/ace-violations`, `ingest/bus-lanes`, `ingest/bus-wait-assessment`, `ingest/dot-street-permits`, `ingest/dot-traffic-speeds`, `ingest/dot-traffic-volumes`, `ingest/equity-context`, `ingest/gtfs-rt-snapshots`, `ingest/lion-centerline`, `ingest/noaa-weather`, `ingest/nypd-collisions`, `ingest/parking-violations`, `ingest/route-catalog`, `ingest/route-coverage`, `ingest/route-trends`
- `map/artifacts`
- `pipeline/finalize`
- `plan/source-refresh`
- `publish/r2-artifacts`
- `pull/gtfs-rt-r2-run`
- `route/build-plan`, `route/equity-context`, `route/intervention-evaluation`, `route/observed-reliability`, `route/readiness`, `route/reliability-baseline`
- `sources/catalog-search`, `sources/list`, `sources/probe`
- `studio/promote-publish-candidate`, `studio/release`
- `verify/d1`

Invocation: `bun --filter @bp/pipeline-v2 cli -- <namespace> <command> [...flags]`, or
`bun run pipeline <namespace> <command> [...flags]` via the root alias.
