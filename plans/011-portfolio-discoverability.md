# Plan 011: Make the repo's strongest evidence discoverable in a 10-minute cold read

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- README.md knowledge/index.md packages/applied-research/package.json .github/workflows/ci.yml`
> On mismatch with "Current state", compare before proceeding; treat
> contradictions as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs / direction
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Completion note

Completed on 2026-07-01 in hard-cutover form. The README now links the verified
live Worker URL, the analytics primer, detector readiness ADR/artifacts, Tier 2
document-processing status, ADRs, and contributor/agent instructions. It also
reflects the current `tools/pipeline-v2` and `packages/studio-api` structure.

The original Step 4 is obsolete because `packages/applied-research` was
intentionally deleted during the product simplification cutover. No replacement
package README was created. `knowledge/index.md` now marks the applied-research
wiki pages as historical context rather than live package ownership doctrine.

Verification performed:

- `.github/workflows/ci.yml` still declares `https://bus-priority-impact-studio.c20carroll.workers.dev/`.
- `curl -I -L --max-time 15 https://bus-priority-impact-studio.c20carroll.workers.dev/` returned HTTP 200.
- `test -e analytics-primer.html` returned present.
- `test -d packages/applied-research` returned missing, matching the hard cutover.

## Why this matters

This project's explicit purpose is a portfolio piece for MTA data/software
roles. A hiring-manager cold read (2026-06-13) found the depth real but the
discoverability broken: the README never links the **live deployed app**
(the URL exists only inside the CI workflow), never shows what the product
looks like, and never points at the three strongest artifacts — the
detector-calibration evidence, `analytics-primer.html`, and the Tier 2
document-extraction pipeline. A reviewer with 10 minutes will miss all of
it. These are minutes-scale fixes with outsized payoff: the difference
between "a repo" and "a deployed analytics product with visible rigor."

## Current state

- `README.md` (repo root) — describes the project and structure but contains
  no live URL, no screenshot, and no pointers to the artifacts below. Read
  it fully before editing; preserve its voice and structure.
- The production URL appears in `.github/workflows/ci.yml` (the deploy
  job; the cold read found `https://bus-priority-impact-studio.c20carroll.workers.dev/`)
  — verify the current value from the workflow/wrangler config rather than
  trusting this plan.
- `analytics-primer.html` (repo root, ~61KB) — a self-contained visual
  walkthrough of the analytics architecture (domain concepts, grains,
  detector lifecycle, causal/forecasting/study distinctions). Linked from
  nowhere.
- Tier 2 extraction pipeline — documented across
  `knowledge/wiki/engineering/tier2_*.md` (10+ pages) and
  `docs/decisions/0018-…`; 30+ MTA policy documents processed with OCR,
  schema validation, and deterministic gates. Not mentioned in README.
- Detector calibration evidence —
  `data/artifacts/analytics-detector-readiness/` (readiness outputs backed
  by ~860 reviewed gold labels across 18 detectors; see ADR-0018). Not
  mentioned in README.
- `packages/applied-research/` — large package (detector studies, causal
  inference, review artifacts) with no package-level README and no
  `description` in its `package.json`.
- `CLAUDE.md` / `AGENTS.md` exist and are CI-enforced but are not flagged
  early in README for contributors/agents.
- Known false alarms — do NOT act on these: `.env` is NOT committed
  (gitignored, never in history; only `.env.example` with placeholder
  values is tracked); the reported failing `detector-study` test passes in
  isolation (5/5) — if you see it fail in a full-suite run, report it as
  flaky, do not chase it here.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm live URL | `grep -rn "workers.dev\|routes\s*=" .github/workflows/ci.yml apps/web/wrangler* 2>/dev/null` | the deployed hostname |
| Link check (relative paths) | `grep -oE "\]\(([^)h][^)]*)\)" README.md \| sed 's/](//;s/)//' \| while read -r p; do [ -e "$p" ] \|\| echo "MISSING: $p"; done` | no MISSING lines |
| Markdown sanity | `bun --filter @bp/web typecheck` not needed; README-only changes have no build gate — rely on the link check |

## Scope

**In scope** (the only files you may modify/create):
- `README.md`
- `knowledge/index.md` (one link line for the primer)
- `packages/applied-research/README.md` (create)
- `packages/applied-research/package.json` (add `description` field ONLY)
- `docs/` — a `docs/screenshots/` directory ONLY if Step 2's screenshot
  happens

**Out of scope** (do NOT touch):
- Any source code, tests, CI workflow, or wrangler config.
- `CLAUDE.md` / `AGENTS.md` content.
- `knowledge/log.md` and wiki pages (the stale-v1-reference cleanup found in
  the audit is real but is wiki-maintenance work, deliberately not in this
  plan).
- The flaky test — out of scope entirely.

## Git workflow

- Branch: `advisor/011-portfolio-discoverability` off `main`.
- One commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: README front door

At the top of `README.md` (immediately after the title/intro sentence), add:

1. A **Live app** line: `**Live:** <the URL you verified>` plus a
   one-sentence description of what a visitor lands on (the editorial
   homepage with the all-routes index; route pages with evidence tabs).
2. A short **"What to look at"** block (5 bullets max, links must resolve):
   - the live app
   - `analytics-primer.html` — "open in a browser; visual map of the
     analytics architecture"
   - detector calibration: ADR
     `docs/decisions/0018-detector-calibration-readiness-loop.md` + the
     readiness artifacts directory
   - Tier 2 corpus: one sentence (30+ MTA policy documents → OCR →
     schema-validated intervention records) linking the best single wiki
     page (pick the most current `tier2_*` page after skimming titles)
   - `docs/decisions/` — "18 ADRs; start with 0017 and 0018"
3. A **contributor/agent note** one-liner pointing at `CLAUDE.md` and
   `AGENTS.md`.

Keep total addition under ~30 lines; match the README's existing tone — no
marketing language, no emoji.

**Verify**: the link-check command → no MISSING lines.

### Step 2 (OPTIONAL — only with browser tooling): Screenshot

If a browser/screenshot tool is available in your environment: capture the
live homepage and one route detail page (a flagship route, e.g. M15-SBS) at
~1280px width, save as `docs/screenshots/home.png` and
`docs/screenshots/route-detail.png`, and embed both in README under the
Live line. If no tooling: skip entirely and say so in your report — do NOT
add broken image links or placeholder text.

**Verify**: `ls docs/screenshots/` shows the files AND README renders them
(paths match), or the step is reported as skipped.

### Step 3: Primer pointer in the wiki index

In `knowledge/index.md`, add one line near the top (after the intro
paragraph, before the pipeline-status blockquotes):
`Reader's map: [analytics-primer.html](../analytics-primer.html) is the visual walkthrough of the analytics architecture.`
(Adjust the relative path to actually resolve from `knowledge/`.)

**Verify**: `[ -e knowledge/../analytics-primer.html ] && echo ok` → ok.

### Step 4: applied-research package README

Create `packages/applied-research/README.md` (~20 lines): what the package
is (corpus-backed research engine: detector studies, causal panels, review
artifacts), its main export areas (inspect `package.json` `exports` and
`src/` top-level directories and name them accurately — do not guess), who
consumes it (`tools/pipeline-v2` as a thin CLI), and links to ADR-0012 and
ADR-0018. Add a one-line `description` to its `package.json`.

**Verify**: `bun --filter @bp/applied-research typecheck` → exit 0 (proves
the package.json edit didn't break JSON), and every path named in the new
README exists.

## Test plan

No code paths change. The verification gates are the link checks and the
package typecheck above.

## Done criteria

- [ ] README contains the verified live URL within its first 15 lines
- [ ] README "What to look at" block exists; link check reports no MISSING
- [ ] `knowledge/index.md` references the primer with a resolving path
- [ ] `packages/applied-research/README.md` exists; `package.json` has a description; typecheck exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The live URL cannot be confirmed from the CI workflow or wrangler config
  (don't publish a guessed URL).
- The live app is down/erroring when you check it — report; a dead link is
  worse than no link.
- README has been substantially rewritten since `58dfaeb` (drift) — merge
  intent, don't overwrite.

## Maintenance notes

- When plans 002/003 land (real maps), refresh the screenshots — the map
  pages become the strongest visual.
- The stale v1 wiki references (knowledge/index.md:14-24 caveats) remain a
  separate cleanup; noted in the audit, deliberately unplanned.
- Reviewer should scrutinize: that every claim added to README is true of
  the repo TODAY (route counts, document counts, test counts drift — prefer
  pointing at artifacts over quoting numbers).
