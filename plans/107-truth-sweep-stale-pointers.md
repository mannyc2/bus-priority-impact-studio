# Plan 107: Fix the stale pointers and the deletion-script footgun before any cleanup lands

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 20 table).
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- scripts/reclaim-raw-json.sh README.md apps/web/public/llms.txt apps/web/public/sitemap.xml packages/db/src/local/schema.ts packages/db/src/local/repositories/corpus-context.ts packages/domain/src/findings/index.ts docs/decisions/0018-detector-calibration-readiness-loop.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (land FIRST — it removes a live data-loss footgun and the most recruiter-visible defects)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `292d2bd0`, 2026-08-01, branch `ops/gen18-artifact-publication` (working tree dirty with in-flight gen-18/19 work; none of this plan's files are in the dirty set except none — verify with `git status --porcelain -- <in-scope paths>` before starting; only `.gitignore` is dirty repo-wide among adjacent files, and it is out of scope here)

## Why this matters

This repo is a portfolio piece for MTA data/software roles. Its README links a
directory that does not exist in any clone, its `llms.txt` (the file that tells
crawlers and LLM agents what the site offers) advertises a page that 404s, and
an operator maintenance script contains an `rm -rf` line that would delete a
file CI's unit tests read at module scope. These are minutes-to-fix defects
whose cost is trust. Fixing them first also makes the later cleanup plans
(108–113) safe: the reclaim script's bad line targets the same directory tree
plan 112 works near.

## Current state

- `scripts/reclaim-raw-json.sh:23-24` — a generated, operator-run disk-reclaim
  script contains:

  ```sh
  # orphaned artifact - 52582584801 bytes - Tier 2 docs pipeline was deleted in plan 024; plan 038 source audit measured this orphan at about 51 GB.
  rm -rf -- 'data/artifacts/docs'
  ```

  The comment is wrong: `data/artifacts/docs` is NOT fully orphaned.
  `.gitignore:31-35` deliberately un-ignores exactly one file in that tree:

  ```
  !data/artifacts/docs/
  data/artifacts/docs/*
  !data/artifacts/docs/gap-roadmap-docs-2026-05-25/
  data/artifacts/docs/gap-roadmap-docs-2026-05-25/*
  !data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json
  ```

  and two live consumers read that file:
  - `packages/analytics/test/route-treatment-crosswalk.test.ts:29-32` reads it
    at module scope (runs in CI via `bun run test:unit`);
  - `tools/pipeline-v2/src/commands/studio/export-intervention-corpus.ts:29-32`
    pins it as `DEFAULT_CORPUS_PATH` with
    `DEFAULT_CORPUS_SHA256 = "593cb776ffdfb4c95526772757c54ac6bfb60ba2dbe1443f013445e251132d04"`.

  Running the script as written deletes a tracked, SHA-pinned source input and
  breaks CI. (The file would be recoverable from git, but the operator running
  a disk-reclaim script should not be handed a trap.)

- `README.md:11` links `[readiness artifacts](data/artifacts/analytics-detector-readiness/)`.
  That directory is gitignored (`.gitignore:25 data/artifacts/*`, no negation)
  and has zero tracked files — the link 404s for every visitor to the GitHub
  repo. The actual tracked consolidated readiness record is
  `data/artifacts/detector-calibration-register.json` (537 lines, read by
  `packages/domain/test/studio-route-insights.test.ts:459-463`).

- `README.md:12` promotes the "[Tier 2 status runbook](knowledge/wiki/engineering/tier2_processing_status_and_resume.md)"
  as a top-level entry point. The in-repo Tier 2 system was deleted by plan 024
  (2026-07-03) and rebuilt in the separate `mta-wiki` repo; the page opens with
  "This page records the current Tier 2 document-processing state", which is
  false, and plan 113 deletes it.

- `apps/web/public/llms.txt:11` links the `/methods` page (deleted end-to-end by
  plan 052; `apps/web/src/worker/spa.ts` now 404s it with `X-Robots-Tag:
  noindex`) and `llms.txt:19` links `/api/v1/studio/methods`, which is not a
  registered route in `packages/studio-api/src/contracts/registry.ts`. Both
  lines under the current headings:

  ```
  - [Source and methodology notes](https://bus-priority-impact-studio.c20carroll.workers.dev/methods)
  ...
  - [Methodology payload](https://bus-priority-impact-studio.c20carroll.workers.dev/api/v1/studio/methods)
  ```

- `apps/web/public/sitemap.xml` omits `/routes`, a real indexable page listed
  in `apps/web/src/studio/seo.ts:22` (`PUBLIC_STUDIO_ROUTES`).

- Three shipped source comments point readers at
  `knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md`, a wiki
  directory that no longer exists: `packages/db/src/local/schema.ts:1135`,
  `packages/db/src/local/repositories/corpus-context.ts:3`,
  `packages/domain/src/findings/index.ts:7`.

- `docs/decisions/0018-detector-calibration-readiness-loop.md:6` has Status
  "Accepted" with no completion note, though the calibration program completed
  2026-06-11 and its producing package (`@bp/applied-research`) is deleted.
  Plan 112 deletes the program's receipt directories; the ADR should say where
  the record went.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Shell syntax | `bash -n scripts/reclaim-raw-json.sh` | exit 0, no output |
| Unit tests | `bun run test:unit` | exit 0 |
| Knowledge check | `bun run check:knowledge` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Types | `bun run check:types` | exit 0 (needs ~8 GB heap; the script sets NODE_OPTIONS itself) |

## Scope

**In scope** (the only files you should modify):
- `scripts/reclaim-raw-json.sh`
- `README.md`
- `apps/web/public/llms.txt`
- `apps/web/public/sitemap.xml`
- `packages/db/src/local/schema.ts` (one comment line)
- `packages/db/src/local/repositories/corpus-context.ts` (one comment line)
- `packages/domain/src/findings/index.ts` (one comment line)
- `docs/decisions/0018-detector-calibration-readiness-loop.md` (one status line)
- `knowledge/log.md` (append one entry)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `.gitignore` — it is dirty with in-flight branch work; plan 112 owns the
  gitignore reconciliation.
- Any file under `data/` — nothing there changes in this plan.
- The other `rm` lines in `reclaim-raw-json.sh` — they target genuinely
  regenerable raw caches and are the script's purpose.
- `knowledge/wiki/**` — plan 113 owns wiki content.

## Git workflow

- Branch: `advisor/107-truth-sweep` off the repo's main branch (coordinate
  with the operator if `ops/gen18-artifact-publication` is still unmerged —
  this plan touches no file in that branch's dirty set, so either base works).
- Commit style: scope-prefixed imperative, e.g. `scripts: drop the tracked-corpus rm line from reclaim-raw-json` (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Defuse the reclaim script

In `scripts/reclaim-raw-json.sh`, delete the two lines quoted above (the
`# orphaned artifact...` comment and `rm -rf -- 'data/artifacts/docs'`) and
insert in their place:

```sh
# data/artifacts/docs is NOT fully orphaned: .gitignore pins
# gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json
# as a tracked, SHA-pinned source input (read by route-treatment-crosswalk.test.ts
# and export-intervention-corpus). Reclaim the untracked capture subtrees
# individually if disk pressure requires; never remove the pinned file.
```

**Verify**: `bash -n scripts/reclaim-raw-json.sh` → exit 0, and
`grep -c "rm -rf -- 'data/artifacts/docs'" scripts/reclaim-raw-json.sh` → `0`.

### Step 2: Fix the README entry points

In `README.md:11`, replace the dead
`[readiness artifacts](data/artifacts/analytics-detector-readiness/)` link with
`[detector calibration register](data/artifacts/detector-calibration-register.json)`
(keep the ADR-0018 link that precedes it). In `README.md:12`, replace the Tier 2
runbook bullet with one sentence stating that the document-evidence backend
lives in the separate `mta-wiki` repository and is consumed via versioned
release bundles (keep the line's "what to look at" framing; do not link into
`knowledge/wiki/`).

**Verify**: `grep -n "analytics-detector-readiness\|tier2_processing_status_and_resume" README.md` → no matches.

### Step 3: Fix llms.txt and sitemap.xml

Delete `llms.txt` lines 11 (`/methods` page) and 19 (`/api/v1/studio/methods`).
Leave every other line intact — the remaining API links are registered studio
routes. Add a `/routes` `<url>` entry to `apps/web/public/sitemap.xml`,
matching the existing entry format exactly.

**Verify**: `grep -c "methods" apps/web/public/llms.txt` → `0`, and
`grep -c "/routes<" apps/web/public/sitemap.xml` → `1` (adjust the grep to the
file's actual URL format; the point is one `/routes` entry exists).

### Step 4: Drop the three dangling source comments

In each of `packages/db/src/local/schema.ts:1135`,
`packages/db/src/local/repositories/corpus-context.ts:3`,
`packages/domain/src/findings/index.ts:7`, remove only the reference to
`knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md` (the
directory was deleted long ago). Keep the rest of each comment if it still
describes the code; delete the whole comment line only if the pointer was its
entire content.

**Verify**: `grep -rn "wiki/analysis" packages/ apps/ tools/` → no matches.

### Step 5: Close the ADR-0018 status

In `docs/decisions/0018-detector-calibration-readiness-loop.md`, change the
Status line to: `Accepted — program complete 2026-06-11; all 21 detectors dispositioned; calibration receipts preserved in git history (removed from the working tree by plan 112).`

**Verify**: `grep -n "program complete 2026-06-11" docs/decisions/0018-detector-calibration-readiness-loop.md` → 1 match.

### Step 6: Log and index

Append one dated entry to the END of `knowledge/log.md` summarizing steps 1–5
(one line each). Update this plan's row in `plans/README.md` to DONE.

**Verify**: `bun run check:knowledge` → exit 0.

## Test plan

No new tests — this plan changes no runtime behavior. The regression net is:

- `bun run test:unit` → exit 0 (proves the crosswalk test's fixture is intact).
- `bun run check:types && bun run check:style` → exit 0.
- `bun --filter @bp/web build` → exit 0 (public/ files are copied assets; the
  build proves nothing references the removed llms.txt lines).

## Done criteria

ALL must hold:

- [ ] `bash -n scripts/reclaim-raw-json.sh` exits 0 and the script no longer contains `data/artifacts/docs`
- [ ] `grep -rn "analytics-detector-readiness" README.md` → no matches
- [ ] `grep -rn "wiki/analysis" packages/ apps/ tools/` → no matches
- [ ] `grep -n "methods" apps/web/public/llms.txt` → no matches
- [ ] `bun run test:unit` exits 0
- [ ] `bun run check:types`, `bun run check:style`, `bun run check:knowledge` all exit 0
- [ ] No files outside the in-scope list are modified (`git status --porcelain`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live file (the branch may
  have landed conflicting edits).
- `packages/analytics/test/route-treatment-crosswalk.test.ts` fails BEFORE your
  change — that means the pinned corpus file is already missing or altered, and
  the reclaim script may already have been run; report immediately, this is a
  data-recovery situation, not a docs fix.
- You find additional `rm` lines targeting tracked files (`git ls-files <path>`
  non-empty for any `rm` target).

## Maintenance notes

- The reclaim script is GENERATED (header says "Generated 2026-07-05 ... from
  data/artifacts/raw-deprecation/deletion-manifest-2026-07-05.json"). If the
  generator (`tools/pipeline-v2/src/lib/raw-deprecation.ts`, whose constant at
  line 262 produced the bad entry) ever regenerates this script, the same wrong
  line will reappear — the generator classifies `data/artifacts/docs` as
  orphaned because it predates the `.gitignore` pin. If regeneration is ever
  planned, fix the classifier first.
- `llms.txt` and `sitemap.xml` are hand-maintained and drift silently. A
  follow-up worth considering (not in this plan): generate both from
  `PUBLIC_STUDIO_ROUTES` in `apps/web/src/studio/seo.ts:20-26`, which
  `check-web-seo.ts` already treats as the source of truth.
- Plan 113 deletes the Tier 2 wiki page this plan unlinks from the README; the
  order doesn't matter, but if 113 lands first the README link is briefly
  broken — that is why this plan is sequenced first.
