# Stage 1.5 inventory audit

Author: Claude, 2026-05-27. Reconciles the script/dispatcher/root drift flagged in
`migration-plan.md` § "Current decision — Codex audit, 2026-05-27".

## Reconciled numbers

| Set | Count | Source |
|---|---:|---|
| `tools/pipeline/src/cli.ts` dispatcher entries | 116 | top-level keys of the dispatch object |
| `tools/pipeline/package.json` scripts that dispatch into `src/cli.ts` | 126 | scripts whose body matches `src/cli\.ts` (excludes 3 plumbing scripts: `build`, `typecheck`, `test`) |
| Root `package.json` scripts that name-match a pipeline pkg script | 101 | intersection of root script keys with pipeline dispatching script keys; pure aliases |
| Root `package.json` scripts that mention `@bp/pipeline` or `tools/pipeline` at all | 108 | includes the 101 aliases plus 7 orchestration scripts |

Set algebra:

- **Both** (dispatcher ∩ pipeline pkg): **115**
- **Dispatcher-only** (no pkg script): **1** — `docs:intervention-records`
- **Script-stale** (pkg script targets a missing dispatcher entry): **11**

## The 1 dispatcher-only entry

`docs:intervention-records` — new (last commit subject, Tier 2 Phase 3 synthesis). **Port.**
Already classified `port` in the triage table at L265. No action; the missing pkg script
disappears naturally when v2 owns command discovery.

## The 11 script-stale entries

All 11 would fail at runtime today — they invoke `bun run src/cli.ts <name>` against a name
the dispatcher no longer registers. Grouped by cause:

### Cluster A — superseded by split commands (4)

The original `docs:ocr` → `docs:ocr-review` → `docs:validate` → `docs:promote` lineage was
broken up during Phase 2/3 OCR work. The current dispatcher exposes the split form
(`docs:ocr-plan`, `docs:ocr-page-audit`, `docs:ocr-markdown-candidates`, `docs:extract`,
`docs:intervention-records`) but the old top-level scripts and the docs prose still cite the
pre-split names.

- `docs:ocr`
- `docs:ocr-review`
- `docs:validate`
- `docs:promote`

Each is still referenced 5–6 times in `knowledge/wiki/` (notably
`tier_2_document_corpus_pipeline.md` and `intervention_source_coverage.md`). v2 has no
need to port them — the split successors are already in the triage table. **Action:**
during Stage 2 monolith decomposition of `tier2-docs.ts`, sweep the wiki to replace these
names with their current equivalents.

### Cluster B — orphaned follow-up-curation thread (6) — `drop-confirmed: stale scripts/wiki only`

These pkg scripts (and their matching root aliases) reference dispatcher entries that were
never built — or were removed before publication. The thread exists in
`/tmp/.tmp-followup-curation/` artifacts and gets cited in `tier_2_document_corpus_pipeline.md`,
but the cli.ts dispatch object has none of them.

- `docs:audit-promoted-source-backing`
- `docs:followup-curation-bundle`
- `docs:followup-curation-decisions`
- `docs:followup-curation-queue`
- `docs:followup-resolution-audit`
- `docs:verify-followup-curation`

**Status (user confirmed 2026-05-27): dead CLI surface, not defer-for-now.** Treated as
**drop-confirmed** for v2 unless pilot 2 uncovers an active runtime dependency (unlikely:
none are dispatcher entries today). Do not port. Do not preserve aliases. Keep any existing
on-disk artifacts and wiki history as historical evidence.

**Action for Stage 2 wiki sweep:** replace old follow-up-curation command prose
(`docs:followup-curation-*`, `docs:verify-followup-curation`, `docs:audit-promoted-source-backing`)
with current artifact/status language — describe the on-disk artifact state and the live
gates from `docs status`, not the dead commands.

### Cluster C — orphan alias (1) — `drop`

- `build:artifacts` — pkg script only; no root reference, no dispatcher entry, no wiki citation
  beyond a single mention. Pure script bloat. Drop.

## Triage-table impact

None of the 11 script-stale entries appear in the migration-plan triage table (the table is
sourced from the dispatcher, not the scripts). So the 65/89-port count is unaffected.

The 6 follow-up-curation entries are **net-new drops** (user-confirmed 2026-05-27) the
triage table didn't see because it never knew they existed. Adjusts the explicit drop count
from 5 → 12 (5 original + 6 cluster B + 1 cluster C / `build:artifacts`).

## Source-of-truth policy (proposal)

For Stage 2 porting decisions, in priority order:

1. **Documented workflow** (`data_pipeline_finish_plan_v2.md`, Tier 2 spine in
   `tier_2_document_corpus_pipeline.md`) — if a workflow names it, port it.
2. **Dispatcher entry in `cli.ts`** — if it's there and on a live workflow, port it.
3. **Pipeline pkg script** — alias-only; never the source of truth.
4. **Root script** — alias-only; never the source of truth.

A command exists in v2 only when something in (1) requires it. (2) is the canonical inventory
of what v1 *can do today*. (3) and (4) are duplication that v2's auto-discovery deletes.

## What this changes

- Stage 1.5 verification standard from the plan is met (CLI controls real, audit produced).
- The triage table at the bottom of `migration-plan.md` is safe to use as the basis for
  Stage 2 port batches.
- Cluster B (6) + Cluster C (1) = **7 net-new drops** confirmed; the explicit-drop count
  moves from 5 → 12.
