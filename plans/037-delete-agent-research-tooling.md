# Plan 037: Delete the failed agent-research tooling (keep the live AI-notes path)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- tools/agent-codemode tools/agent-corpus-lib tools/sandbox tools/pipeline-v2/src/lib/codemode tools/pipeline-v2/src/lib/sandbox.ts tools/pipeline-v2/src/lib/llm.ts tools/pipeline-v2/package.json package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (every deletion has reverse-reference proof; the one live
  LLM path is explicitly fenced off)
- **Depends on**: none (plan 036 recommended first but not required)
- **Category**: tech-debt
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The operator has ended the "agents research the data corpus" experiments:
"We aren't going to have agents researching the data corpus; those
experiments have failed." The tooling that supported them — a Python corpus
library, a Docker sandbox, a codemode tool-loop harness, and an agent skill
tree — is fully orphaned (zero imports from any live command) but still
carries dependencies, ~1,900 lines of code and tests, a root build script,
and five ADRs' worth of doctrine that mislead every new session. This plan
deletes the whole system in one hard cutover.

**Critical distinction this plan must preserve**: the repo has ONE live LLM
use that is NOT part of the failed experiments. The `studio release` command
generates AI segment notes via `@earendil-works/pi-ai`, and those notes
render on the public site (`apps/web/src/components/route/SlowSegments.tsx:145`
renders `segment.aiNote`). That path stays.

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**The deletion set (all orphaned, with proof):**

- `tools/agent-codemode/` — contains only
  `skills/corpus-navigation/SKILL.md`. No code references.
- `tools/agent-corpus-lib/` — Python library (`bp_corpus/*.py`,
  `pyproject.toml`, `uv.lock`, plus untracked `.venv/`, `.mypy_cache/`,
  `.pytest_cache/`, `.ruff_cache/`). No `bp_corpus` import anywhere in the
  repo's TypeScript or scripts.
- `tools/sandbox/` — `Dockerfile`, `build.sh`, `README.md`, `.dockerignore`.
  Referenced only by the root script `"sandbox:build": "tools/sandbox/build.sh"`
  (`package.json:66`) and by `tools/pipeline-v2/src/lib/sandbox.ts`.
- `tools/pipeline-v2/src/lib/codemode/` — `index.ts`, `tool-loop.ts`,
  `stderr-event-sink.ts`. `tool-loop.ts` is the only importer of
  `@earendil-works/pi-agent-core` in the repo, and imports `lib/sandbox.ts`
  and `lib/llm.ts`. Zero imports of `lib/codemode` from any file under
  `tools/pipeline-v2/src/commands/`.
- `tools/pipeline-v2/src/lib/sandbox.ts` — imported only by
  `lib/codemode/tool-loop.ts` and the codemode test.
- `tools/pipeline-v2/test/lib/codemode/` — tests for the harness only.
- Dependency `@earendil-works/pi-agent-core` in
  `tools/pipeline-v2/package.json` — sole importer is `lib/codemode/tool-loop.ts`.
- Root script `sandbox:build` in `package.json:66`.

**The live path you must NOT delete:**

- `tools/pipeline-v2/src/commands/studio/_release-segments.ts` — imported by
  `commands/studio/release.ts` and `commands/studio/_release-routes.ts`
  (verified). It calls `complete` from `@earendil-works/pi-ai` and
  `openRouterModel` from `lib/llm.ts` to build `StudioAiAnalystNote` /
  `StudioAiPublicNote` payloads (`@bp/domain/studio/segment-evidence`).
- `tools/pipeline-v2/src/lib/llm.ts` — its `openRouterModel` export is live
  (used by `_release-segments.ts:9`). Its OTHER exports may be dead: the file
  also defines provider helpers beyond `openRouterModel` (open the file and
  list exports). Step 4 trims the file to the live surface instead of
  deleting it.
- Dependency `@earendil-works/pi-ai` stays (live importers:
  `_release-segments.ts`, `lib/llm.ts`).
- `tools/pipeline-v2/src/lib/route-briefs/` — a first-pass audit called this
  orphaned; it is NOT. Live importers: `src/effect/route-brief-model.ts`,
  `commands/studio/release.ts`, `commands/studio/_release-types.ts`,
  `commands/audit/pipeline-v1.ts`, and a test. Do not touch.

**Doctrine to retire (status edits, not deletions):**

- ADRs `docs/decisions/0010-python-in-sandbox.md`,
  `0011-deep-novel-findings-mode.md`, `0012-agent-authored-detectors.md`,
  `0013-bun-typescript-codemode-sandbox.md`,
  `0016-studio-brief-author-agent-runtime.md` — all describe the retired
  system. Convention: edit each ADR's `## Status` section to
  `Retired 2026-07-04 — agent-corpus research experiments ended; tooling
  deleted (plan 037).` Do not delete ADR files.
- `knowledge/wiki/data/agent_corpus_map.md` — add a one-line banner at top:
  `> **Retired 2026-07-04**: the agent corpus tooling this page maps was
  deleted (plan 037). Kept as history.` Do not delete wiki pages.
- If `docs/architecture/agent-harness-migration.md` or
  `docs/architecture/studio-agent-stack.md` exist (check first — they were
  reported by one audit pass), delete them; they are process notes, not ADRs.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (after dep edit) | `bun install` | exit 0 |
| Typecheck pipeline | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Unit tests | `bun run test:unit` | all pass |
| Architecture harness | `bun run check:web-architecture` | all pass |
| Knowledge check | `bun run check:knowledge` | exit 0 |

## Scope

**In scope**:
- Delete: `tools/agent-codemode/`, `tools/agent-corpus-lib/`,
  `tools/sandbox/`, `tools/pipeline-v2/src/lib/codemode/`,
  `tools/pipeline-v2/src/lib/sandbox.ts`,
  `tools/pipeline-v2/test/lib/codemode/`
- Edit: `tools/pipeline-v2/src/lib/llm.ts` (trim to live exports),
  `tools/pipeline-v2/package.json` (remove `@earendil-works/pi-agent-core`),
  root `package.json` (remove `sandbox:build` script), `bun.lock` (via
  `bun install`)
- Status edits: the five ADRs listed above,
  `knowledge/wiki/data/agent_corpus_map.md`, `knowledge/log.md` (one entry),
  `knowledge/index.md` (only if it links the deleted map page)
- Delete if present: `docs/architecture/agent-harness-migration.md`,
  `docs/architecture/studio-agent-stack.md`

**Out of scope** (do NOT touch, even though they look related):
- `tools/pipeline-v2/src/commands/studio/_release-segments.ts`,
  `_release-types.ts`, `_release-geometry.ts`, `_release-routes.ts`,
  `commands/studio/release.ts` — live release pipeline.
- `tools/pipeline-v2/src/lib/route-briefs/` — live (see above).
- `@earendil-works/pi-ai` dependency — stays.
- `tools/pipeline-v2/src/checks/check-pioneer-provider.ts` and the root
  scripts `check:pioneer-provider` / `env:check:llm` — the provider smoke
  check is independent of the agent harness (it does not import pi-* or
  `lib/llm.ts`; verified).
- `tools/pipeline-v2/src/lib/spatialite.ts` and ADR-0007 — spatialite is the
  live geo-join path, unrelated to the sandbox.

## Git workflow

- Branch: `plan/037-delete-agent-research`
- Commit style: imperative one-liners (match `git log --oneline`, e.g.
  "Delete Tier 2 pipeline and stale doctrine").
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-prove orphanhood, then delete the directories

```bash
rg -l "lib/codemode|makeToolLoopRunner" tools/pipeline-v2/src/commands tools/pipeline-v2/src/checks   # expect: no output
rg -l "lib/sandbox" tools/pipeline-v2/src --glob '!node_modules' | grep -v "lib/codemode"             # expect: no output
rg -l "bp_corpus" . --glob '!node_modules' --glob '!tools/agent-corpus-lib' -g '*.ts' -g '*.py' -g '*.sh'  # expect: no output
rg -l "pi-agent-core" tools/pipeline-v2/src | grep -v "lib/codemode"                                  # expect: no output
```

Then:

```bash
git rm -r tools/agent-codemode tools/agent-corpus-lib tools/sandbox
git rm -r tools/pipeline-v2/src/lib/codemode tools/pipeline-v2/test/lib/codemode
git rm tools/pipeline-v2/src/lib/sandbox.ts
rm -rf tools/agent-corpus-lib   # clears the untracked .venv/caches left behind
```

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` → exit 0.

### Step 2: Remove the dead dependency and root script

- In `tools/pipeline-v2/package.json`, delete the
  `"@earendil-works/pi-agent-core"` line. KEEP `"@earendil-works/pi-ai"`.
- In root `package.json`, delete the `"sandbox:build"` script line.
- Run `bun install`.

**Verify**: `bun install` exits 0; `grep -c "pi-agent-core" bun.lock` → `0`;
`grep -c "pi-ai" bun.lock` → non-zero (still present).

### Step 3: Confirm CI/hooks reference nothing deleted

```bash
rg -n "sandbox|codemode|agent-corpus|bp_corpus" .github .githooks scripts --glob '!node_modules'
```

Read every hit. Expected: no functional references (comments/unrelated
matches like "sandboxed" prose are fine). If a workflow or script invokes a
deleted path, STOP.

**Verify**: the command above produces no functional references.

### Step 4: Trim `lib/llm.ts` to the live surface

Open `tools/pipeline-v2/src/lib/llm.ts`. The live consumer imports exactly
`openRouterModel` (`_release-segments.ts:9`). For every OTHER export, run
`rg -n "<exportName>" tools/pipeline-v2/src --glob '!node_modules' | grep -v lib/llm.ts`.
Delete exports with no hits (expected: provider-header/alternate-model
helpers used only by the deleted codemode harness). Keep `openRouterModel`,
its `ensureProviders()` support code, and any export with a live hit.

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` → exit 0;
`bun --filter @bp/pipeline-v2 test` → all pass.

### Step 5: Retire the doctrine

1. Edit the `## Status` section of ADRs 0010, 0011, 0012, 0013, 0016 to:
   `Retired 2026-07-04 — agent-corpus research experiments ended; tooling deleted (plan 037).`
2. Add the retirement banner to `knowledge/wiki/data/agent_corpus_map.md`
   (see Current state for wording).
3. Append one line to `knowledge/log.md` under a `2026-07-04` heading (match
   the file's existing entry format — read its last entries first):
   `Deleted the agent-research tooling (agent-codemode, agent-corpus-lib, sandbox, pipeline codemode harness); retired ADRs 0010-0013/0016. The studio release AI-notes path (pi-ai) is unaffected. (plan 037)`
4. If `knowledge/index.md` links `agent_corpus_map`, annotate the link
   `(retired)`; otherwise leave it.
5. Delete `docs/architecture/agent-harness-migration.md` and
   `docs/architecture/studio-agent-stack.md` if they exist.

**Verify**: `bun run check:knowledge` → exit 0.

### Step 6: Full gate + live-path smoke

**Verify**:
- `bun run test:unit` → all pass
- `bun run check:web-architecture` → all pass
- Live-path proof: `rg -n "openRouterModel" tools/pipeline-v2/src` → exactly
  two files: `lib/llm.ts` (definition) and
  `commands/studio/_release-segments.ts` (consumer)
- `bun --filter @bp/pipeline-v2 cli -- studio release --help` (or the
  command's current help invocation) → exits 0, prints usage (proves the
  release command tree still loads)
- `git status` → only in-scope files changed

## Test plan

Deletion-only plan; existing suites are the net. The codemode test dir is
deleted with its subject. Required green: `@bp/pipeline-v2 test` (fixture
tests), `test:unit`, `check:web-architecture`, `check:knowledge`. No new
tests.

## Done criteria

- [ ] `ls tools/` → exactly `pipeline-v2`
- [ ] `rg -l "codemode|pi-agent-core|bp_corpus" tools packages apps --glob '!node_modules'` → empty
- [ ] `grep -c "sandbox:build" package.json` → 0
- [ ] `grep pi-ai tools/pipeline-v2/package.json` → still present
- [ ] ADRs 0010/0011/0012/0013/0016 contain `Retired 2026-07-04`
- [ ] `bun run test:unit` exits 0; `bun --filter @bp/pipeline-v2 typecheck` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any Step 1 proof command returns hits outside the deletion set.
- Deleting `lib/sandbox.ts` breaks a typecheck somewhere other than
  `lib/codemode/` — an importer appeared since 2026-07-04.
- `_release-segments.ts`, `release.ts`, or `lib/route-briefs/` would need
  edits to keep the build green — they are out of scope; report instead.
- A `.github` workflow or `scripts/*.sh` functionally invokes a deleted path
  (step 3).
- You find yourself wanting to also delete `pi-ai` — that is an explicit
  non-goal; the operator keeps the AI-notes product feature.

## Maintenance notes

- After this plan, `tools/` contains only `pipeline-v2`; plan 040 (Effect
  CLI migration) then has 98 commands and no dead lib/ weight to migrate.
- If the operator later kills the public AI-notes feature, the follow-up
  deletion set is: `_release-segments.ts` LLM branches, `lib/llm.ts`,
  `@earendil-works/pi-ai`, and the `aiNote` render in
  `apps/web/src/components/route/SlowSegments.tsx` — record that as its own
  plan; do not fold it in here.
- Reviewer: the diff must contain zero edits inside `commands/studio/`
  except none at all — if `release.ts` shows up in the diff, reject.
