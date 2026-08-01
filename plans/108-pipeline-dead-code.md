# Plan 108: Delete pipeline-v2's completed-operation and no-ship code (~9.5K LOC)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 20 table).
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- tools/pipeline-v2/scripts tools/pipeline-v2/src/lib/mta-wiki-rc22-lineage.ts tools/pipeline-v2/src/commands/study/opportunity-prototype.ts tools/pipeline-v2/src/lib/study-engine tools/pipeline-v2/src/lib/route-ids.ts tools/pipeline-v2/src/checks/check-map-segment-identity.ts tools/pipeline-v2/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Note `tools/pipeline-v2/test/cli/registry.test.ts`
> is MODIFIED in the planning-time working tree (in-flight gen-19 work adds new
> commands) — the registry count you find may be higher than the 115 recorded
> here. That is expected drift: adjust the arithmetic, not the approach.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none (but plan 112's receipt deletions depend on THIS plan)
- **Category**: tech-debt
- **Planned at**: commit `292d2bd0`, 2026-08-01, branch `ops/gen18-artifact-publication` (dirty tree)
- **Rebaselined 2026-08-01 (advisor)**: execute against main@`90dd5282`
  (PRs #114-#117 merged). Verified: every deletion target is byte-identical
  between `292d2bd0` and `90dd5282`; the ONLY in-scope drift is
  `test/cli/registry.test.ts`, which gained `"public-intervention-episodes"`
  in the `studio` array and moved `toHaveLength` 114 → 115. CORRECTION to the
  excerpt below: at `292d2bd0` the count was 114; at the `90dd5282` baseline
  it is 115. Step 3's edit is therefore: remove ONLY `"opportunity-prototype"`
  (line ~108), do NOT touch `"public-intervention-episodes"` (~line 123),
  decrement 115 → 114. The new `test/public-intervention-episodes.test.ts` is
  live gen-19 work — not in any delete cluster. Run the drift check against
  `90dd5282`, not `292d2bd0`.

## Why this matters

`tools/pipeline-v2` is the repo's largest code area (~120K tracked LOC). About
9.5K LOC of it is machinery for operations that are finished and adjudicated:
one-off review-cut reconciliation scripts for the rc19–rc26 label program,
migration forensics for wiki release candidates three generations old, and the
Plan 076 opportunity-ranking prototype whose shipping was explicitly rejected
by operator decision. All of it typechecks and much of it runs on every
`bun test`, for zero ongoing signal. Deleting it also unblocks plan 112: the
forensics tests are the only readers of ~217K lines of frozen receipt JSON
under `docs/research/artifacts/`.

Background facts an executor needs: the CLI registry is glob auto-discovery
(`src/cli/registry.ts` globs `commands/**/*.ts`), so a file being "registered"
carries no liveness signal; liveness was established by tracing published
artifact keys, D1 export inputs, serving reads, CI, and shell runbooks.
`test/cli/registry.test.ts` pins the exact command inventory:

```ts
// tools/pipeline-v2/test/cli/registry.test.ts:135-139
test("loads every pipeline command descriptor loudly", async () => {
  const commands = await discoverCommandDescriptors();
  expect(commands).toHaveLength(115);
  expect(buildCommandRegistrySnapshot(commands)).toEqual(expectedRegistry);
});
```

`expectedRegistry` (same file, from line 8) is a literal object with one array
per command group; deleting a command means removing its array entry AND
decrementing the count.

## Current state — the four deletion clusters

**Cluster A — completed review-cut reconciliation scripts (10 files, 3,202 LOC).**
All under `tools/pipeline-v2/scripts/`, each with ZERO references anywhere in
the repo (verified per-basename grep across code, CI, package.json, shell
scripts, docs): `reconcile-rc19-codex-review.ts` (817),
`reconcile-member-grain-review-cut.ts` (451), `reconcile-plan074-review-cut.ts`
(316), `reconcile-rc26-plan074-review.ts` (305), `prepare-rc25-codex-review.ts`
(297), `reconcile-rc25-codex-review.ts` (281), `transfer-rc19-codex-review.ts`
(253), `prepare-rc19-codex-review.ts` (232), `triage-rc19-codex-review.ts`
(119), `build-route-index-v3-recovery.ts` (131). Three import live libs (e.g.
`admitStudyTreatmentScope` from `src/lib/study-engine/scope.ts`) — the
dependency runs one way; the libs stay.

**Cluster B — mta-wiki rc19/rc22/rc23 migration forensics (8 files, 4,281 LOC).**
`src/lib/mta-wiki-rc22-lineage.ts` (819) — only importers are
`scripts/audit-mta-wiki-rc22-lineage.ts` and its own test.
`test/mta-wiki-rc22-lineage.test.ts` (324) and
`test/mta-wiki-rc23-reproducibility.test.ts` (136) read seven frozen JSON
receipts under `docs/research/artifacts/` on every `bun test`.
`scripts/audit-mta-wiki-rc22-lineage.ts` (518), `scripts/audit-mta-wiki-rc23-delta.ts`
(776), `scripts/replay-mta-wiki-rc22-candidates.ts` (88),
`scripts/audit-mta-wiki-candidate-set.ts` (1,529),
`scripts/snapshot-rc19-study-merge-inputs.ts` (91) are one-off audits whose
outputs are committed as replay-record/audit JSON. The live wiki release line
is rc25+ (production serves against v1-rc28 evidence); rc22 is contract-blocked
and rc23 permanently quarantined per `data/study-event-approvals/README.md:41-45`.
Note: `audit-mta-wiki-rc23-delta.ts` exports `Rc23DeltaAuditSchema`, imported
ONLY by `test/mta-wiki-rc23-reproducibility.test.ts:5` — both are in this
cluster, so they delete together with no schema-donor constraint.

**Cluster C — Plan 076 opportunity prototype (4 files + 1 barrel line, 1,717 LOC).**
`plans/README.md` records the operator decision: "076 is a completed design
spike with a no-ship recommendation. No opportunity/composite lens enters
`/map` or route detail from this result." The code is a closed cluster:
`src/commands/study/opportunity-prototype.ts` (1,138) is the sole importer of
`src/lib/study-engine/opportunity.ts` (234); tests
`test/commands/study/opportunity-prototype.test.ts` (209) and
`test/lib/opportunity.test.ts` (136). The barrel line to remove is
`src/lib/study-engine/index.ts:8`: `export * from "./opportunity.ts";`. Its
output artifact key (`studio/v2/studies/opportunity-prototype`) appears in no
publish manifest, no D1 export, no serving read.

**Cluster D — orphan micro-modules (3 files, 85 LOC).**
`src/lib/route-ids.ts` (19) — zero importers; its `canonicalRouteId` is a
divergent trap copy of route-ID canonicalization. `src/lib/speed-pace-feature-resolver.ts`
(7) — a re-export shim over `@bp/analytics/features` whose only consumer is its
own test `test/lib/speed-pace-feature-resolver.test.ts` (59).

**Cluster E — the never-wired check (2 files, 232 LOC).**
`src/checks/check-map-segment-identity.ts` (161) has an `import.meta.main`
entrypoint but, unlike its eight siblings, no `package.json` script and no CI
step — built for plan 078 (DONE), then never wired. Its test is
`test/checks/map-segment-identity.test.ts` (71). **CAUTION**: a DIFFERENT file,
`test/map-segment-identity.test.ts` (130, at the test root, no `checks/`
segment), is a live doctrine check over `src/lib/route-briefs/model.ts` and
must NOT be deleted.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | exit 0, all pass |
| Types | `bun run check:types` | exit 0 |
| Architecture gates | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope** (delete or edit ONLY these):
- The 27 files enumerated in clusters A–E above (delete)
- `tools/pipeline-v2/src/lib/study-engine/index.ts` (remove line 8 only)
- `tools/pipeline-v2/test/cli/registry.test.ts` (remove `"opportunity-prototype"` from the `study` array; decrement the `toHaveLength` count by 1)
- `knowledge/log.md` (append one entry), `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `tools/pipeline-v2/scripts/audit-route-index-v3-d1.ts`,
  `check-plan097-recovery-reader.ts`, `check-production-route-index-v3.ts` —
  CI-invoked (`.github/workflows/ci.yml:97,157,205,227,232`).
- `src/lib/study-engine/scope.ts`, `study-events.ts`, and every other
  study-engine module — live (the `study run`/`merge-events` path).
- `src/commands/publish/recovery.ts` and all Plan 097 machinery — LIVE
  production serving until plan 098 lands.
- `src/lib/route-briefs/**` — live via `commands/studio/release.ts:41`.
- `test/map-segment-identity.test.ts` (the root-level one) — live doctrine check.
- The `corridor`, `geocode`, `ingest`, `backfill`, `collect`, `pull`,
  `gtfs-rt`, `import`, `sources` command groups — the geocode/context-event
  chain is plan 111's coordinated scope, NOT this plan's.
- Everything under `docs/research/artifacts/` — the receipts the deleted tests
  read stay on disk until plan 112.
- Untracked in-flight files: `src/inputs/**`, `src/lib/public-intervention-episodes.ts`,
  `src/commands/studio/public-intervention-episodes.ts`, their tests.

## Git workflow

- Branch: `advisor/108-pipeline-dead-code`, based on the landed main branch
  (this plan edits `test/cli/registry.test.ts`, which the gen-19 branch also
  modifies — if that branch is unmerged, base on it or wait; see STOP #3).
- One commit per cluster (A through E), message style: `pipeline-v2: delete <cluster>` — matches repo style like `apps/web: lead /interventions with the network change record`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete cluster A (reconciliation scripts)

`git rm` the ten files listed in Current state / Cluster A.

**Verify**: `grep -rn "reconcile-rc19-codex-review\|reconcile-member-grain\|reconcile-plan074\|reconcile-rc26-plan074\|prepare-rc25-codex\|reconcile-rc25-codex\|transfer-rc19-codex\|prepare-rc19-codex\|triage-rc19-codex\|build-route-index-v3-recovery" --include="*.ts" --include="*.json" --include="*.yml" --include="*.sh" . | grep -v node_modules` → no matches.
Then `bun --filter @bp/pipeline-v2 test` → exit 0.

### Step 2: Delete cluster D (orphan micro-modules)

`git rm tools/pipeline-v2/src/lib/route-ids.ts tools/pipeline-v2/src/lib/speed-pace-feature-resolver.ts tools/pipeline-v2/test/lib/speed-pace-feature-resolver.test.ts`

**Verify**: `grep -rn "lib/route-ids\|speed-pace-feature-resolver" --include="*.ts" tools packages apps` → no matches. `bun --filter @bp/pipeline-v2 test` → exit 0.

### Step 3: Delete cluster C (opportunity prototype)

1. `git rm` the four files in Cluster C.
2. In `src/lib/study-engine/index.ts`, delete line 8 (`export * from "./opportunity.ts";`).
3. In `test/cli/registry.test.ts`, remove `"opportunity-prototype"` from the
   `study` array and decrement the `toHaveLength(N)` count by exactly 1.

**Verify**: `grep -rn "opportunity" --include="*.ts" tools/pipeline-v2/src tools/pipeline-v2/test` → no matches referencing the deleted modules (hits on
unrelated words are fine; there should be none for `study-engine/opportunity`
or `opportunity-prototype`). `bun --filter @bp/pipeline-v2 test` → exit 0
including the registry test.

### Step 4: Delete cluster B (rc forensics)

`git rm` the eight files in Cluster B (five under `scripts/`, one under
`src/lib/`, two under `test/`).

**Verify**: `grep -rn "mta-wiki-rc22-lineage\|rc23-delta\|replay-mta-wiki-rc22\|audit-mta-wiki-candidate-set\|snapshot-rc19-study-merge" --include="*.ts" tools packages apps tests scripts` → no matches. `bun --filter @bp/pipeline-v2 test` → exit 0.

### Step 5: Delete cluster E (unwired check)

`git rm tools/pipeline-v2/src/checks/check-map-segment-identity.ts tools/pipeline-v2/test/checks/map-segment-identity.test.ts`

Confirm FIRST that you are deleting `test/checks/map-segment-identity.test.ts`
and that `test/map-segment-identity.test.ts` (root level) still exists after.

**Verify**: `ls tools/pipeline-v2/test/map-segment-identity.test.ts` → exists.
`grep -rn "check-map-segment-identity" package.json tools .github` → no matches.

### Step 6: Full gate + bookkeeping

Run the full gate; append one `knowledge/log.md` entry (dated, listing the five
clusters and their LOC); set this plan's row DONE in `plans/README.md`.

**Verify**: `bun --filter @bp/pipeline-v2 test && bun run check:types && bun run check:architecture && bun run check:style` → all exit 0.

## Test plan

No new tests. The deleted tests' subjects are deleted with them (that is the
point). The regression net is the full pipeline suite plus the registry
inventory test, which will fail loudly if the count or the `study` array edit
is wrong. Expected suite delta: the six deleted test files no longer run;
every other test count is unchanged.

## Done criteria

ALL must hold:

- [ ] All 27 files above are gone (`git ls-files` returns nothing for each)
- [ ] `tools/pipeline-v2/test/map-segment-identity.test.ts` (root) still exists
- [ ] `bun --filter @bp/pipeline-v2 test` exits 0
- [ ] `bun run check:types`, `check:architecture`, `check:style` all exit 0
- [ ] Registry test passes with count exactly 1 lower than its pre-plan value
- [ ] No files outside the in-scope list are modified (`git status --porcelain`)
- [ ] `plans/README.md` row updated; `knowledge/log.md` entry appended

## STOP conditions

Stop and report back (do not improvise) if:

- Any grep in steps 1–5 returns an unexpected importer — the graph has changed
  since planning.
- The registry test fails for any reason other than the expected count/array
  edit in step 3.
- `test/cli/registry.test.ts` in your checkout differs structurally from the
  excerpt (the gen-19 branch adds commands): reconcile the count arithmetic
  against the live file, and if `opportunity-prototype` is absent from the
  `study` array, someone already removed it — report instead of guessing.
- Deleting `opportunity.ts` breaks an import of `median` or any other helper:
  a caller imported it despite the planning-time verification. Restore the
  file, report the caller.
- Any file in Cluster B is also referenced from a test NOT in Cluster B.

## Maintenance notes

- Plan 112 (receipts purge) depends on step 4: the seven
  `docs/research/artifacts/` files those tests read become unreferenced when
  the tests go. If 112's executor runs before this plan, its keep-list is
  larger — the plans document the dependency both ways.
- The migration reports under `docs/research/` name the deleted Cluster B
  scripts as their reproduction recipe. The committed replay-record JSONs
  remain the surviving evidence (until 112 prunes those too, keeping the two
  live fixtures). If the operator ever wants rc-era forensics re-run, git
  history has the scripts.
- After this plan, `tools/pipeline-v2/scripts/` should contain only the three
  CI-invoked scripts plus any gen-19 additions — a good review check.
