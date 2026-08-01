# Plan 112: Purge the frozen receipt corpora from docs/ and tracked data/ (~1.63M tracked lines)

> **Executor instructions**: Follow this plan step by step. This plan is almost
> entirely `git rm` of files with zero code references — its danger is not
> subtlety but keep-list discipline. Never use a glob broader than the step
> specifies; verify the keep-set after every step. If anything in the "STOP
> conditions" section occurs, stop and report. When done, update the status
> row in `plans/README.md` (Generation 20 table).
>
> **Operator-receipt note**: `data/` deletions are doctrinally operator-owned
> in this repo ("data/ is operator-owned: no executor ever deletes or rewrites
> anything under data/" — generation-7 shared constraint). The operator's
> 2026-08-01 aggressive-cleanup directive authorizes PREPARING these deletions;
> the PR merge is the operator's approval act. Say exactly that in the PR
> description, list every deleted path cluster with its line count, and note
> that git history preserves all of it.
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- docs/research data/artifacts data/study-event-approvals data/ops docs/architecture docs/screenshots .gitignore`
> Also verify plan 108 has LANDED: `ls tools/pipeline-v2/test/mta-wiki-rc22-lineage.test.ts` must FAIL (file gone). If it exists, plan 108 has not landed — the keep-list below is wrong for that world; STOP.

## Status

- **Priority**: P1 (highest raw-LOC leverage in the whole cleanup)
- **Effort**: M (mostly mechanical; the work is keep-list care)
- **Risk**: MED (breaking CI is easy if the keep-list is violated; everything is recoverable from git)
- **Depends on**: plan 108 (hard — it deletes the tests that read seven of these files), plan 107 (recommended — defuses the reclaim-script line near this tree)
- **Category**: tech-debt / docs
- **Planned at**: commit `292d2bd0`, 2026-08-01

## Why this matters

Of the ~2.85M tracked lines in this repo, about 1.9M are JSON receipts under
`docs/` and `data/`: seven superseded generations of mta-wiki release-candidate
imports, LLM review-shard worksheets for candidate sets the project's own
ledger marks unapproved/blocked/quarantined, and the complete receipt tree of
the detector-calibration program that closed 2026-06-11 — 828K lines whose
producer package was deleted and which nothing can read. Every clone, grep,
and audit pays for them. Git history preserves every byte; the working tree
does not need to.

The critical discipline is the LOAD-BEARING keep-list: nine files under these
trees are read by CI at module scope or pinned by SHA-256, and deleting the
wrong one breaks `bun run test:unit` for everyone.

## Current state — clusters and their keep-lists

1. **`data/artifacts/detector-calibration-*/` — 15 directories, 183 files,
   828,329 lines.** Zero code references. The program's contract lives in
   ADR-0018; the register survives. **KEEP: `data/artifacts/detector-calibration-register.json`**
   (top-level FILE, 537 lines) — read by
   `packages/domain/test/studio-route-insights.test.ts:459-463`, which asserts
   the serving blocklist in `route-insights.ts:66` mirrors it. A glob like
   `detector-calibration-*` catches the register; delete DIRECTORIES only.

2. **`docs/research/artifacts/` — 28 files, ~527K lines.** After plan 108
   deleted the rc22-lineage/rc23-reproducibility tests and the one-off audit
   scripts, exactly TWO files remain load-bearing:
   - `candidate-set-v3-80050ed598f3b2ab0d0a1e99.study-events.json` (30,008) —
     the immutable APPROVED rc26 study cut, byte-frozen by
     `tools/pipeline-v2/test/lib/study-review-cut.test.ts:242-247` ("the
     committed rc26 v3 artifact still decodes byte-for-byte", exact SHA-256).
   - `mta-wiki-v1-rc24-route-fixture-receipt.json` (140) — read by
     `tools/pipeline-v2/test/studio-mta-wiki-route-fixture.test.ts:22-25`.
   Everything else in the directory — rc19/rc22/rc23/rc25/rc26/rc27
   operational-occurrences imports, superseded candidate-set and
   study-review-cut artifacts, lineage audits, replay records, the
   `mta-wiki-rc19-study-candidate-audit.{json,md}` pair — is a frozen receipt.

3. **`docs/research/reviews/` — 72 files, 287,352 lines.** Superseded LLM
   review shards for rc19 (plus its corrected re-issue), rc25, rc26,
   rc27-member-grain, and `review-cut-5298f37aac8780666c742f7d`. The rc19 set
   "remains unapproved, and its Codex recommendations are not a receipt"
   (`data/study-event-approvals/README.md:41-45`). **KEEP:
   `docs/research/reviews/plan097/`** (3 files, 272 lines — the gen-17
   production-recovery attestations).

4. **Six small unreferenced data receipts, 18,896 lines**:
   `data/artifacts/studio/v2/studies/study-events-v3-operational-occurrences-1.json` (15,644),
   `data/artifacts/context-events/311-curb-friction-taxonomy-agreement.json` (1,426),
   `data/artifacts/studio/v2/wiki/operational-occurrences-v3-operational-occurrences-1.json` (1,007),
   `data/ops/gtfs-rt-r2-production-length-manifests-2026-05-17.txt` (480),
   `data/artifacts/evidence-packet-completeness-2026-03.json` (193),
   `data/artifacts/studio/v2/studies/anchors-report.md` (146).
   **KEEP by contrast**: `data/artifacts/studio/v2/studies/temporal-anchor-audit.md`
   (deliberately negated at `.gitignore:44`), the gap-roadmap corpus JSON
   (SHA-pinned input of `studio export-intervention-corpus`), and
   `data/artifacts/studio/v2/routes/route-capability-manifest.json` (live,
   in-flight).

5. **`docs/architecture/` — delete the 4 authoring-era specs, 1,332 lines**:
   `brief-markdown-primitives.md` (491), `studio-agent-edit-approval-versioning.md`
   (378), `studio-review-collaboration-and-promotion.md` (298),
   `studio-brief-authoring-ux.md` (165). They specify surfaces hard-deleted in
   2026-07 (`grep -rln "brief-draft\|briefDraft\|studio_brief\|StudioBrief"
   apps/web/src packages tools` → nothing), and their governing ADRs
   (0014/0015/0016) already carry Superseded/Retired markers. **KEEP** the
   other four (`README.md`, `data-corpus-overview.md`,
   `public-access-auth-gating-plan.md`, and anything else present).

6. **`docs/research/*.md` — delete 6 superseded handoffs, 1,141 lines**:
   `backend-goal-seam-calibration.md` (self-marked "Superseded 2026-06-10 …
   do not implement from this document"), `hard-cutover-dossier-contract.md`
   (self-marked historical/superseded by ADR-0022),
   `master-plan-product-questions.md` (own header voids its tracks),
   `design-brief-route-detail-and-map.md` (briefs the rejected verdict-layer
   design; zero refs), `member-grain-study-review-lifecycle.md` (superseded by
   the approvals README + plan 096; zero refs),
   `tracker-branch-reconciliation-2026-07-15.md` (one-time reconciliation;
   zero refs). **KEEP the other 13** research docs — still cited, and several
   record negative results that are expensive to re-derive.

7. **`docs/screenshots/` — 14 PNGs, 1.8MB, 0 lines** — before/after evidence
   for plans 022/025 (DONE 2026-07-03). Optional deletion (clone weight, not
   LOC).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Unit tests | `bun run test:unit` | exit 0 |
| Full tests | `bun run test` | exit 0 |
| Types / arch / style / knowledge | `bun run check:types && bun run check:architecture && bun run check:style && bun run check:knowledge` | exit 0 |
| Ignore-drift probe | `git ls-files data | xargs -I{} git check-ignore --no-index -v {}` | see step 6 |

## Scope

**In scope**: the seven clusters above (deletions), `.gitignore` (step 6 only,
and only if the gen-19 branch has merged), `knowledge/log.md` (append),
`plans/README.md` (status row).

**Out of scope** (do NOT touch):
- The nine-file load-bearing set named above; `data/study-event-approvals/**`
  ENTIRELY (the worksheet deletion is operator-gated plan 114; receipts and
  scope-bindings are live study-engine inputs);
- `data/artifacts/docs/gap-roadmap-docs-2026-05-25/**`;
- `data/artifacts/studio/v2/routes/**`, `data/artifacts/studio/v2/detectors/**`,
  `data/artifacts/loc/**`, `data/artifacts/web-audits/**` (check outputs);
- everything untracked under `data/` (in-flight gen-19 artifacts and local
  caches — `git ls-files` is the arbiter: this plan deletes TRACKED files only);
- `docs/decisions/**` (ADRs are the decision record — plan 107 already added
  the 0018 note);
- `knowledge/**` except the log append (plan 113 owns knowledge).

## Git workflow

- Branch: `advisor/112-receipts-purge` off landed main (after 108).
- One commit per cluster with the line count in the message, e.g.
  `docs+data: delete detector-calibration receipt tree (828,329 lines; register kept)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Detector-calibration receipt directories

`git rm -r` each of the 15 `data/artifacts/detector-calibration-*/`
DIRECTORIES (trailing slash; enumerate them with
`git ls-files 'data/artifacts/detector-calibration-*/' | cut -d/ -f1-3 | sort -u` first).

**Verify**: `git ls-files data/artifacts/detector-calibration-register.json` → still tracked. `bun run test:unit` → exit 0 (the route-insights register test is the canary).

### Step 2: docs/research/artifacts (26 of 28 files)

Pre-gate: `grep -rn "docs/research/artifacts" --include="*.ts" tools packages apps tests scripts | grep -v node_modules` → every hit must reference ONLY the two keep files. If any other filename appears, plan 108's state differs from expectation — STOP.

Delete every file in `docs/research/artifacts/` EXCEPT
`candidate-set-v3-80050ed598f3b2ab0d0a1e99.study-events.json` and
`mta-wiki-v1-rc24-route-fixture-receipt.json`.

**Verify**: `ls docs/research/artifacts/ | wc -l` → `2`; `bun --filter @bp/pipeline-v2 test` → exit 0 (the SHA-pinned rc26 test and the rc24 fixture test both green).

### Step 3: docs/research/reviews (69 of 72 files)

`git rm -r docs/research/reviews/rc19 docs/research/reviews/rc25 docs/research/reviews/rc26 docs/research/reviews/rc27-member-grain docs/research/reviews/review-cut-5298f37aac8780666c742f7d`

**Verify**: `ls docs/research/reviews/` → exactly `plan097`; `git ls-files docs/research/reviews | wc -l` → `3`.

### Step 4: The six small data receipts

`git rm` the six files in cluster 4.

**Verify**: `git ls-files data/artifacts/studio/v2/studies/` → contains `temporal-anchor-audit.md` and NOT the two deleted files; `bun run test:unit` → exit 0.

### Step 5: docs/architecture + docs/research markdown

`git rm` the 4 architecture files (cluster 5) and 6 research docs (cluster 6).
Optionally `git rm -r docs/screenshots/` (record the choice either way).

**Verify**: `grep -rn "brief-markdown-primitives\|studio-brief-authoring-ux\|backend-goal-seam-calibration\|hard-cutover-dossier-contract" --include="*.md" README.md knowledge/index.md docs/decisions` → no matches in living docs (hits inside plans/ history are fine; plan 113 handles those).

### Step 6: .gitignore reconciliation (SKIP if `.gitignore` is dirty)

If `git status --porcelain .gitignore` is clean: add a negation so the
surviving tracked register is policy-consistent
(`!data/artifacts/detector-calibration-register.json` beneath the
`data/artifacts/*` rule), then run the ignore-drift probe from the commands
table and confirm every remaining tracked `data/` path either matches a
negation or is intentionally listed in the PR. If `.gitignore` is dirty with
in-flight work, record this step as deferred in the PR and move on.

**Verify**: `git check-ignore --no-index -v data/artifacts/detector-calibration-register.json` → matches the new negation (or step recorded deferred).

### Step 7: Full gate + bookkeeping

`bun run test && bun run check:types && bun run check:architecture && bun run check:style && bun run check:knowledge` → all exit 0. Append one dated
`knowledge/log.md` entry (clusters + line counts + "git history preserves the
receipts"). Set this plan's README row DONE.

## Test plan

No new tests. The canaries are: `studio-route-insights.test.ts` (register),
`study-review-cut.test.ts` (SHA-pinned rc26 artifact),
`studio-mta-wiki-route-fixture.test.ts` (rc24 receipt),
`route-treatment-crosswalk.test.ts` (gap-roadmap corpus — untouched), all
inside `bun run test:unit`. Run it after every step, not just at the end.

## Done criteria

- [ ] Tracked-line delta ≈ −1.63M (measure: `git diff --shortstat` on the PR)
- [ ] The nine-file load-bearing set still tracked, byte-identical (`git diff --stat` empty for each)
- [ ] `docs/research/artifacts/` has exactly 2 files; `docs/research/reviews/` has exactly `plan097/`
- [ ] `bun run test`, `check:types`, `check:architecture`, `check:style`, `check:knowledge` all exit 0
- [ ] Nothing untracked was touched; nothing under `data/study-event-approvals/` changed
- [ ] PR description lists every cluster with line counts and the operator-approval framing
- [ ] `plans/README.md` row updated; `knowledge/log.md` entry appended

## STOP conditions

- The drift-check shows plan 108 not landed (the forensics tests still exist).
- Any step's verify shows a keep-file deleted or modified — restore
  immediately (`git checkout -- <path>`) and re-run the cluster.
- `bun run test:unit` fails at any step — do not proceed to the next cluster
  with a red suite.
- You are tempted to "also" delete something under `data/study-event-approvals/`
  or an untracked path — that is plan 114 / operator territory.

## Maintenance notes

- After this plan, `docs/research/` holds only living documents and the two
  pinned fixtures; a future `improve` audit should treat any NEW 10K-line JSON
  landing under `docs/` as a process smell (receipts belong in git history or
  external storage, not the working tree).
- The `.gitignore` reconciliation (step 6) is what prevents recurrence — if it
  was deferred, schedule it right after the gen-19 branch merges.
- The two kept fixtures are pinned by tests that name their SHA/paths; if the
  study engine ever re-cuts at a newer rc, those tests and fixtures move
  together.
