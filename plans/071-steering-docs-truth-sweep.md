# Plan 071: Steering-doc truth sweep (README, SEO paths, master plan status)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- README.md tools/pipeline-v2/src/commands/studio/_release-seo.ts apps/web/public/sitemap.xml docs/research/master-plan-product-questions.md knowledge/log.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: plans/068-verification-baseline.md (recommended, for gates)
- **Category**: docs
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

This repo is operated primarily by agents, and several steering documents now
actively lie: README claims a schema stack that was deleted (ADR-0020), the SEO
release code still advertises the deleted `/methods` page (so the sitemap
points at a 404), and the umbrella product plan references a package and an
authoring surface that no longer exist. Stale steering docs misroute future
sessions into wasted work. This sweep makes the load-bearing docs true again
without rewriting history.

## Current state

Four verified staleness sites:

1. `README.md:109` (verify with `grep -n "Zod v4" README.md`):
   > `- Zod v4 domain contracts with branded route IDs, codecs, registries, metadata, and JSON Schema export.`
   Reality: ADR-0020 (`docs/decisions/0020-effect-schema-only.md`) made Effect
   Schema the only first-party schema layer; zod is deleted and gated out.

2. `tools/pipeline-v2/src/commands/studio/_release-seo.ts:13`:
   ```ts
   const STATIC_PUBLIC_PATHS = ["/", "/map", "/interventions", "/methods"] as const;
   ```
   The `/methods` page was deleted end-to-end by plan 052 (commit `9919641`,
   "Delete the methods page end-to-end (web + worker endpoint)"). The sitemap
   generated from this list therefore advertises a 404. The generated outputs
   are committed at `apps/web/public/sitemap.xml` and
   `apps/web/src/studio/seo-manifest.gen.ts` (paths declared at
   `_release-seo.ts:9-10`).

3. **Interaction you must NOT break**: `tools/pipeline-v2/src/commands/studio/release.ts`
   still builds the methods artifact —
   line 501: `methods: methodDatasetsFromDocsSources(docsSources),` and
   line 543: `await writeJson(resolve(outputDir, "methods.json"), buildStudioMethodsProjection(release));`.
   Plan 063 (gen-7, TODO) records that the serving snapshot still LOADS
   `methods.json` and keeps a degrade row for it. Therefore: remove `/methods`
   from the SEO paths ONLY; do not delete the `methods.json` build in this
   plan. Add a one-line comment at `release.ts:543` pointing at plan 063.

4. `docs/research/master-plan-product-questions.md` — the umbrella product
   plan (2026-06-10). Verified-stale claims include: references to
   `applied-research/src/{core,causal,forecasting}` (the `@bp/applied-research`
   package has been deleted; surviving machinery consolidated into
   `@bp/analytics`), Track F composer/authoring capabilities (all authoring
   surfaces were hard-deleted by plan 017's cutover), and §3's A1
   "preserve native segment-speed grain" (DONE 2026-06-10 —
   `local_route_segment_speed_cell` exists). The document remains valuable as
   the strategy umbrella (Tracks A-G); it must not be rewritten, only
   status-annotated.

Repo conventions that apply:
- `knowledge/` contract: CLAUDE.md requires updating `knowledge/log.md` when
  durable project decisions change; the log format is checked by
  `bun run check:knowledge`. Read the last ~3 entries of `knowledge/log.md`
  first and match their format exactly.
- Do not edit anything under `knowledge/raw/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Knowledge contract | `bun run check:knowledge` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Web build | `bun --filter @bp/web build` | exit 0 |

## Scope

**In scope**:
- `README.md` (the stale scaffold bullets only)
- `tools/pipeline-v2/src/commands/studio/_release-seo.ts` (the STATIC_PUBLIC_PATHS entry + a comment)
- `tools/pipeline-v2/src/commands/studio/release.ts` (ONE comment line at the methods.json write; no behavior change)
- `apps/web/public/sitemap.xml` (remove the `/methods` `<url>` entry by hand, consistent with the source change)
- `docs/research/master-plan-product-questions.md` (prepend a status block only)
- `knowledge/log.md` (one new entry)

**Out of scope** (do NOT touch):
- `plans/README.md` generation headers — the advisor already reconciled the
  gen-6 status line when writing the gen-8 index.
- Deleting the `methods.json` build or `buildStudioMethodsProjection` — plan
  063 owns that lifecycle.
- Any other README modernization (architecture diagrams, feature lists) —
  fix only what is verifiably false.
- `apps/web/src/studio/seo-manifest.gen.ts` — route titles only; `/methods`
  does not appear there as a route title (verify with grep; if it DOES appear,
  STOP and report).

## Git workflow

- Branch: `advisor/071-docs-truth-sweep` off the current branch.
- One commit, e.g. "Docs truth sweep: Effect Schema in README, drop /methods from SEO, master-plan status block".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: README schema claim

Replace the `Zod v4 domain contracts...` bullet at README.md:109 with a bullet
that is true today, e.g.:
`- Effect Schema domain contracts (ADR-0020) with branded route IDs, registries, metadata, and JSON Schema export.`
Then sweep the rest: `grep -n -i "zod" README.md` — fix or remove any other
claim that zod is in use (historical mentions like "migrated from zod" may
stay).

**Verify**: `grep -n -i "zod v4" README.md` → no matches.

### Step 2: SEO paths + sitemap

- In `_release-seo.ts:13`, remove `"/methods"` from `STATIC_PUBLIC_PATHS` and
  add a trailing comment: `// "/methods" removed: page deleted by plan 052`.
- In `apps/web/public/sitemap.xml`, delete the `<url>` block whose `<loc>` ends
  in `/methods` (keep everything else byte-identical).
- In `release.ts:543`, add above the write:
  `// methods.json is still loaded by the serving snapshot; its deletion is owned by plan 063.`

**Verify**: `grep -rn '"/methods"' tools/pipeline-v2/src apps/web/public/sitemap.xml` →
only hits (if any) are the plan-063 comment; the sitemap has no `/methods`
entry. `bun --filter @bp/pipeline-v2 test` → all pass.

### Step 3: Master-plan status block

Prepend to `docs/research/master-plan-product-questions.md`, directly under the
H1, a clearly-dated block (match the doc's plain-markdown style):

```markdown
> **Status update (2026-07-09).** This plan predates two structural changes:
> (1) the `@bp/applied-research` package was deleted — surviving study/gate
> machinery lives in `@bp/analytics` (gen-7 plan 061 deletes the dead detector
> subgraph); (2) all authoring/composer surfaces (Track F) were hard-deleted by
> the plan-017 cutover — Track F as written is void. Track A1 (native
> segment-speed cell grain) is DONE. The Track C study engine and Track D
> mta-wiki contract are being executed as plans 073-076 (see `plans/README.md`,
> generation 8). Read sections referencing `applied-research` or the composer
> as historical.
```

Do not edit the body.

**Verify**: `head -30 docs/research/master-plan-product-questions.md` shows the
block; `git diff --stat` shows only an addition at the top of that file.

### Step 4: Knowledge log entry

Append one entry to `knowledge/log.md` in the file's existing format recording:
docs truth sweep (README schema claim, /methods SEO removal, master-plan status
block) with today's date and this plan's number.

**Verify**: `bun run check:knowledge` → exit 0.

## Test plan

No new tests. Gates: `bun --filter @bp/pipeline-v2 test` (the SEO module has
existing tests — if a test pins the 4-entry STATIC_PUBLIC_PATHS list, update
that assertion in the same commit), `bun run check:knowledge`,
`bun --filter @bp/web build`.

## Done criteria

- [ ] `grep -n -i "zod v4" README.md` → no matches
- [ ] `grep -rn '"/methods"' tools/pipeline-v2/src/commands/studio/_release-seo.ts` → no matches
- [ ] `grep -c "/methods" apps/web/public/sitemap.xml` → 0
- [ ] Master-plan doc has the dated status block; body untouched below it
- [ ] `bun run check:knowledge`, `bun --filter @bp/pipeline-v2 test`, `bun --filter @bp/web build` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `/methods` appears in `seo-manifest.gen.ts` route titles or anywhere in
  `apps/web/src` beyond generated artifacts — the plan-052 deletion was less
  complete than believed; report before touching more files.
- A pipeline test asserts `methods.json` must be listed as a public path (not
  just built) — report; that contradicts this plan's premise.

## Maintenance notes

- When plan 063 lands its degrade-policy table, the `methods.json` build at
  `release.ts:543` and the comment added here should be removed together.
- The master-plan doc will need a second status pass after plans 073-076 land;
  keep using dated prepend-blocks, never in-place rewrites.
