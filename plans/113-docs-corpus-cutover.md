# Plan 113: Cut the doc corpus over to living documents only — plans/, mockups/, knowledge/ (~63K lines)

> **Executor instructions**: Follow this plan step by step. This plan deletes
> HISTORY, not code: git preserves every byte, and the argument for each
> deletion is that the file teaches a retired architecture as current. The
> keep-lists are exhaustive — when a file is not on a keep-list but your
> step-4 stale-gate says it looks live, KEEP it and report it; never force a
> deletion past a failed gate. When done, update the status row in
> `plans/README.md` (Generation 20 table).
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- plans knowledge/index.md knowledge/AGENTS.md knowledge/README.md knowledge/docs knowledge/wiki tools/pipeline-v2/src/checks/check-knowledge.ts README.md`
> `plans/README.md` is modified on the gen-19 branch — this plan REQUIRES that
> branch merged first (it rewrites the same file). If `git status` shows
> `plans/README.md` dirty, STOP.
> Also verify plan 112 has landed (`ls docs/research/reviews/rc19` must fail):
> the rc19 receipts are what hash-pinned plans 074/075/083 in place; if they
> still exist, move those three files to this plan's keep-list.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (no mechanical breakage possible — `check:knowledge` guards only 3 files, no harness references `plans/` or `knowledge/wiki` paths — the risk is editorial: losing a "do not re-audit" rejection or deleting a page that is still doctrine)
- **Depends on**: plan 112 (receipt constraint), plan 107 (README repoints); gen-19 branch merged
- **Category**: docs
- **Planned at**: commit `292d2bd0`, 2026-08-01
- **Rebaselined 2026-08-01 (advisor)**: main is now `90dd5282` (PRs
  #114-#117). Two consequences. (1) Plan 105 LANDED via PR #115 — so at
  execution time, verify 105's row reads DONE in the committed
  `plans/README.md`, and if so MOVE `103-route-change-chronology.md`,
  `105-metric-tab-annotation-layer.md`, and `plans/mockups/082-overview-trend-markers/`
  from the keep-list to the delete-list (their keep reasons — 105's open
  status and its hard citation of 103, plus the comp-gate precedent — died
  with 105's landing; step 2 then deletes all 9 mockup directories and step 1
  keeps 10 files + gen-20 plans). (2) The "gen-19 merged" precondition is
  satisfied at `90dd5282`; the committed `plans/README.md` there does NOT yet
  contain the Generation 20 section (it lives uncommitted in the advisor's
  tree), so the dispatch prompt must inline the gen-20 section text for the
  step-3 rewrite to preserve.

## Why this matters

The doc corpus is ~88K tracked lines (plans 40.5K md + mockups 4.8K html +
non-raw knowledge 42.8K md). 98 of 106 numbered plans are DONE / REJECTED /
SUPERSEDED; ~24K lines of wiki document five programs that no longer exist in
this repo (the Tier-2 pipeline, the detector program, authoring/briefs,
pipeline-v1 doctrine, superseded serving plans); `knowledge/index.md` — the
file every agent is told to read first — opens with "Generation 4 status" and
points at a superseded design authority; and the plan index is 2,071 lines of
which ~1,445 describe fully-finished generations. An agent following the
documented onboarding path today lands on instructions to write into
directories that don't exist and implement against packages that were deleted.
This plan cuts the corpus to living documents (~25K lines survive) and then
hardens `check:knowledge` so it cannot silently drift again.

Empirical precedent that doc deletion is safe here: the `knowledge/wiki/analysis/`
directory was deleted long ago, left seven dangling references (three in
shipped package source), and nothing broke or complained.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Knowledge check | `bun run check:knowledge` | exit 0 |
| Full check | `bun run check` | exit 0 |
| Reference sweep | `grep -rn "plans/\|knowledge/wiki" --include="*.ts" apps packages tools tests scripts` | see step gates |

## Scope

**In scope**: `plans/**` (deletions + README rewrite), `knowledge/wiki/**`
(deletions), `knowledge/index.md` (rewrite), `knowledge/AGENTS.md` and
`knowledge/README.md` (edits), `knowledge/docs/` (delete),
`tools/pipeline-v2/src/checks/check-knowledge.ts` +
`tools/pipeline-v2/test/check-knowledge.test.ts` (harden), `knowledge/log.md`
(append only — NEVER rewrite or reorder it; its append-only doctrine stands).

**Out of scope** (do NOT touch): `knowledge/raw/**` (immutable by project
rule — 303 tracked files, no exceptions); `knowledge/log.md` content;
`docs/**` (plan 112 owned it); the 11 keep-plans and their statuses;
`.claude/**`; `CLAUDE.md`; `AGENTS.md` (repo root).

## Current state (facts the steps rely on)

- Open plans (8): 026 BLOCKED, 045 IN PROGRESS, 098–101 TODO, 105 TODO,
  106 BLOCKED. Everything else is DONE / REJECTED / SUPERSEDED per the
  `plans/README.md` status tables.
- `plans/105-metric-tab-annotation-layer.md:8,23` hard-cites
  `plans/103-route-change-chronology.md` ("Dependency check (run first)" and
  "**Depends on**: … (HARD)") — 103 must survive until 105 lands.
- `knowledge/wiki/engineering/intervention_evidence_relevance.md:190` (a
  keep-page) cites `plans/090-structured-intervention-observations.md` — 090
  survives with it.
- The only non-Markdown reference to `plans/` anywhere in code was
  `tools/pipeline-v2/scripts/audit-mta-wiki-candidate-set.ts` (deleted by plan
  108). After 108+112, no code, test, check, or CI references any plan file.
- `check:knowledge` asserts the existence of exactly `knowledge/index.md`,
  `knowledge/log.md`, `knowledge/raw/source_manifest.yaml` — nothing else in
  `knowledge/` has any mechanical guard.
- The pre-push hook treats `*.md`-only pushes as docs-only (runs only
  `check:knowledge`). This plan mixes `.ts` edits (step 6), so the full
  pre-push gate runs — but do NOT rely on the hook: run `bun run check`
  yourself before finishing.

## Git workflow

- Branch: `advisor/113-docs-corpus-cutover` off landed main (after 112).
- Commits: one per step below. Message style `plans: …` / `knowledge: …`
  (matches e.g. `knowledge: record the /interventions network change record`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete the 95 closed plan files

KEEP exactly these 11 files (plus `mockups/`, handled in step 2):
`README.md`, `026-effect-httpapi-worker.md`, `045-transit-kit-work-orders.md`,
`090-structured-intervention-observations.md`, `098-atomic-serving-release.md`,
`099-full-history-freshness-slo.md`, `100-publication-control-plane.md`,
`101-deterministic-incremental-demonth.md`, `103-route-change-chronology.md`,
`105-metric-tab-annotation-layer.md`, `106-consume-resolved-transit-public-pack.md`,
and the generation-20 plans `107-…` through `114-…`.

Pre-gate: for each keep-plan, grep it for `plans/0` and `plans/1` file-path
citations and confirm every cited path is itself on the keep-list (at planning
time the only hard file citation among keepers was 105 → 103; prose references
by number — "Plan 074" — are fine and expected to dangle into the README's
history line).

Delete every other `plans/NNN-*.md` (95 files at planning time: 001–106 minus
the 11 keepers).

**Verify**: `ls plans/*.md | wc -l` → 12 + the number of gen-20 plans;
`grep -rn "plans/0\|plans/1" --include="*.ts" apps packages tools tests scripts` → no matches.

### Step 2: Delete the mockup comps for DONE plans

`git rm -r` these 8 directories under `plans/mockups/`: `075-history-tab`,
`076-opportunity-layer`, `080-network-decision-map`,
`081-route-segment-explorer`, `089-interventions-redesign`,
`094-route-history-redesign`, `103-route-change-chronology`,
`104-network-change-record`. **KEEP `082-overview-trend-markers/`** — plan 105
(TODO) extends 082's Overview markers to the other metric tabs, and 082's comp
is the nearest approved visual precedent under the repo's comp-gate doctrine.
The durable design rules were already extracted to
`knowledge/wiki/engineering/studio_design_pass_status.md` (a keep-page).

**Verify**: `ls plans/mockups/` → exactly `082-overview-trend-markers`.

### Step 3: Rewrite plans/README.md (~2,071 → ≤700 lines)

Structure of the rewritten file, top to bottom:

1. Header: what this index is, executor instructions (keep the existing
   wording), and a note: "Plan bodies for completed generations live in git
   history (deleted from the working tree 2026-08; numbering stays monotonic —
   never reuse a number)."
2. **Generation 20** section (this cleanup) — keep as-is.
3. **Generation 19 / 18 / 17** sections — keep, but trim each to: the intro
   paragraph, the status table, and the dependency/safety notes that concern
   OPEN rows (098-101, 105, 106). Delete measured-data blocks that were
   already superseded in-file.
4. **Generations 1–16 collapsed**: one line each, e.g.
   `- Gen 9 (077-081) — truthful interactive maps; all DONE 2026-07-12.`
   Include the open-row exceptions inline: gen-3 line notes 026 BLOCKED
   (worker-Effect spike regression), gen-5 line notes 045 IN PROGRESS
   (transit-kit Orders 2-4 gated).
5. **`# Standing rejections and verified negatives (do not re-audit)`** — an
   appendix consolidating every "Findings considered and rejected" and
   "Audit corrections" bullet from ALL generation sections, deduplicated,
   grouped by theme (serving/API, maps, design system, schema/Effect,
   pipeline/data, false positives). PRESERVE EVERY DISTINCT CLAIM — compress
   wording, not content. This is the load-bearing part of the rewrite: these
   ledgers are what stop future audits from re-proposing settled work. Expect
   ~250-350 lines.
6. Keep the "Status values:" legend once, at the top.

**Verify**: `wc -l plans/README.md` → ≤ 700; `grep -c "do not re-audit" plans/README.md` → ≥ 1; every keep-plan has a status row; no mockup path other than `082-overview-trend-markers` is referenced.

### Step 4: Delete the retired-programs wiki pages (~66 files)

KEEP exactly (41 files + 4 `.gitkeep`):
- `knowledge/wiki/data/` — ALL files EXCEPT `tier2_document_corpus.md` and
  `agent_corpus_map.md` (17 keepers: ace_enforcement, census_acs_equity,
  intervention_source_coverage, mta_bus_geospatial, mta_bus_ridership,
  mta_bus_route_segment_speeds, mta_bus_schedules_and_gtfs,
  mta_bus_stop_boardings, mta_bus_time_realtime, mta_developer_resources,
  mta_open_data_program, nyc_dot_bus_lanes, policy_docs_corpus,
  public_facing_data_catalog, service_alerts_and_planned_changes,
  source_registry, tsp_data_acquisition).
- `knowledge/wiki/engineering/` — 16 keepers: `package_structure.md`,
  `data_model.md`, `analytics_architecture.md`, `analytics_backfill_runbook.md`
  (verified live operational doctrine — status: active, covers current
  pipeline-v2 backfills), `cloudflare_operations_runbook.md`, `etl_plan.md`,
  `cli_commands.md`, `testing_standards.md`, `freshness_ledger.md`,
  `studio_design_pass_status.md`, `ui_copy_doctrine.md`,
  `web_api_endpoint_architecture.md`, `intervention_evidence_relevance.md`,
  `studio-api-refactor.md` (the self-declared successor page),
  `map_strategy.md`, `charting_library_evaluation.md`.
- `knowledge/wiki/project/` — 6 keepers: `overview.md`, `business_problem.md`,
  `mvp.md`, `metrics.md`, `ai_interaction_model.md`,
  `managed_services_options.md`.
- `knowledge/wiki/templates/` — `dataset_page_template.md`,
  `analysis_page_template.md` (delete `route_brief_template.md` — the briefs
  product is gone).

For EVERY file not on the keep-list, run this stale-gate before `git rm`:

```
grep -l -iE "applied.research|tier ?2|baseline ?month|monthly release|brief|composer|detector (operating|registry|evaluation)|tools/pipeline[^-]|dossier|pipeline.v1|rc2[0-9]" <file>
```

plus a head-read of its frontmatter/title. The file deletes if it matches the
retired-concept grep OR its frontmatter/`knowledge/index.md` entry marks it
superseded OR it is a plan/status page for a program `plans/README.md` records
as DONE-and-replaced. If a file matches NONE of those, KEEP it, add it to the
step-5 index, and list it in the PR under "kept on failed stale-gate" — at
planning time the audit expected roughly 66 deletions here; a handful of
keep-escapes is normal, mass gate-failure is a STOP.

**Verify**: `git ls-files knowledge/wiki | grep -v .gitkeep | wc -l` → ~41
(±5 for gate-kept files); `bun run check:knowledge` → exit 0.

### Step 5: Rewrite knowledge/index.md; fix AGENTS.md and README.md

`knowledge/index.md`: replace the "Generation 4 status (2026-07-04)" block
with a current one (generation 19+ per `plans/README.md`; design authority =
the 2026-07-06 operator critique as recorded in the plans README, superseding
the July-4 export); remove the "Continue generation-5 execution" line; relink
ONLY surviving pages (every keep-page gets an entry — including the previously
orphaned keepers `freshness_ledger`, `ui_copy_doctrine`, `census_acs_equity`,
`intervention_source_coverage`, `public_facing_data_catalog`); keep the
caveat-banner pattern the file already uses.

`knowledge/AGENTS.md`: repoint every `tools/pipeline` → `tools/pipeline-v2`;
delete the `wiki/analysis/*.md` instruction (directory doesn't exist); strip
"brief building" / "composer" from the mission and LLM-rules language.
`knowledge/README.md`: remove the embedded bootstrap prompt referencing
`tools/pipeline`. Delete `knowledge/docs/` entirely (a verbatim duplicate of
that prompt plus a `.gitkeep`).

**Verify**: `grep -rn "tools/pipeline[^-]" knowledge/ --include="*.md" | grep -v log.md` → no matches; `grep -n "Generation 4" knowledge/index.md` → no matches; every `[[wiki/...]]` link in index.md resolves (`for f in $(grep -o 'wiki/[a-z_/-]*\.md' knowledge/index.md); do ls knowledge/$f >/dev/null || echo MISSING $f; done` → no output).

### Step 6: Harden check:knowledge (~40 LOC, lands LAST so it starts green)

Extend `tools/pipeline-v2/src/checks/check-knowledge.ts` to also: (a) resolve
every wiki link in `knowledge/index.md` to an existing file, (b) fail on any
`knowledge/wiki/**/*.md` with no index entry, (c) fail on frontmatter
`status:` values outside the enum `knowledge/AGENTS.md` declares (fix the
handful of nonconforming keepers — e.g. `local_db_usage_audit.md` uses
`current` — as part of this step if they survived step 4). Update
`tools/pipeline-v2/test/check-knowledge.test.ts` to cover the three new
failure modes (model it on the existing string-assertion style, or better,
run the check against a temp fixture tree).

**Verify**: `bun run check:knowledge` → exit 0 against the cleaned tree; break
one link locally, confirm it exits non-zero, revert.

### Step 7: Full gate + bookkeeping

`bun run check` → exit 0 (this includes types/style/architecture/tests — the
step-6 `.ts` edits make this mandatory, and the pre-push docs-only fast path
must NOT be relied on). Append one dated `knowledge/log.md` entry (counts per
step; "bodies preserved in git history"). Set this plan's README row DONE.

## Test plan

Step 6's extended check IS the new test surface: three new failure modes with
test coverage. Everything else is guarded by `check:knowledge` (link/orphan
integrity), `bun run check`, and the step gates.

## Done criteria

- [ ] `plans/` contains only README.md + 11 keepers + gen-20 plans + `mockups/082-overview-trend-markers/`
- [ ] `plans/README.md` ≤ 700 lines with the standing-rejections appendix present
- [ ] `knowledge/wiki` ≈ 41 files, all indexed; `knowledge/docs/` gone
- [ ] `knowledge/index.md` names the current generation and design authority
- [ ] `grep -rn "tools/pipeline[^-]" knowledge/ --include="*.md" | grep -v log.md` → no matches
- [ ] Hardened `check:knowledge` passes, and fails when a link is broken (spot-tested)
- [ ] `bun run check` exits 0
- [ ] `knowledge/log.md` untouched except one appended entry
- [ ] `plans/README.md` gen-20 row updated

## STOP conditions

- `plans/README.md` is dirty at start (gen-19 unmerged).
- A keep-plan cites a plan file you are about to delete (step-1 pre-gate).
- Step 4's stale-gate fails (keeps) more than ~10 files — the keep-list model
  is wrong; report rather than force.
- You find a `knowledge/wiki` page referenced from CODE (not prose) — none
  existed at planning time; report it.
- The step-3 rewrite would drop any rejection-ledger claim entirely (you
  cannot find a home for it in the appendix) — report the specific bullet
  instead of deleting it.

## Maintenance notes

- When plan 105 lands, `plans/103-route-change-chronology.md` and
  `plans/mockups/082-overview-trend-markers/` lose their last citations and
  can be deleted in 105's own cleanup step — note this in 105's row.
- When plans 098-101 and 106 close, the same one-line-collapse applies to
  generations 17 and 19.
- The standing-rejections appendix is now the single "do not re-audit"
  surface — future advisor sessions should append to it, not recreate
  per-generation ledgers.
- `knowledge/log.md` (9,361 lines, append-only, out of chronological order)
  was deliberately left alone — operator-owned; see plan 114's decision log.
