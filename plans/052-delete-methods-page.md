# Plan 052: Delete the methods page end-to-end (route, page, nav, SEO, worker endpoint)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. HARD prerequisite: plan 051 (home
> rewrite) must be DONE — the old home loader calls `fetchStudioMethods`,
> which this plan deletes.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the worker serving surface and its contract tests)
- **Depends on**: 051 (hard — home's `fetchStudioMethods` call must be gone)
- **Category**: tech-debt (surface deletion)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator verdict 2026-07-06: "Methods page: Delete it entirety." The
methods page is self-referential documentation ("How we know this" as a
whole page); the operator's direction is that provenance lives as
mostly-hidden `SourceNote` disclosures next to the data it describes
(plan 049), not as a destination page. After plan 051, nothing links to
`/methods`; keeping the page, its Worker endpoint, and its contract entries
would be dead public surface.

Deliberate remainder: the pipeline still BUILDS `studio/v1/methods.json`
during `studio release`. Stopping that build is pipeline work with its own
blast radius (release command, publish-completeness checks) and is NOT in
this plan — the artifact simply stops being served.

## Current state

Frontend (all verified 2026-07-06):

- `apps/web/src/routes/methods.tsx` (22 LOC) — file route; loader calls
  `fetchStudioMethods`; imports `MethodsLoadingPage, MethodsPage` EAGERLY
  (this page is in the entry chunk today — deleting it shrinks entry).
- `apps/web/src/studio/pages/methods.tsx` (356 LOC) — the page component
  (contains a "Generated [date]" string and kicker eyebrows; it sits in the
  plan-050 doctrine allowlists).
- `apps/web/src/studio/shell.tsx` — `navItems` contains
  `{ to: "/methods", label: "Methods" }`.
- `apps/web/src/studio/seo.ts` — `PUBLIC_STUDIO_ROUTES` entry
  `{ path: "/methods", … }` (line 25) and the `pathname === "/methods"`
  metadata block (lines 59-65).
- `apps/web/src/worker/spa.ts:18` — SPA path regex
  `/^\/(?:interventions|map|methods|routes)\/?$/` (post-051 shape; remove
  `methods`).
- `apps/web/src/lib/head.ts:3` — default description ends "…intervention
  timelines, and public-data methods." (copy edit).
- `apps/web/src/routes/__root.tsx:15` — root description "…intervention
  timelines, maps, and methods." (copy edit).
- `apps/web/src/components/route/DataNotesSection.tsx` — contains a link to
  `/methods` (grep `methods` in that file; strip the link element, keep the
  surrounding coverage content — plan 053 redesigns this section later).
- `apps/web/src/studio/api-client.ts:177-179` —

  ```ts
  export function fetchStudioMethods(options?: StudioQueryOptions) {
    return loadStudioJson<StudioMethodsResponse>(studioPath("studio.methods"), options);
  }
  ```

- `apps/web/src/studio/api-contract.ts:8-10` — re-exports
  `StudioMethodDataset`, `StudioMethodsResponse` from
  `@bp/domain/studio/docs` (remove the re-export lines; the domain types
  themselves stay — other packages may reference them).
- `apps/web/src/routeTree.gen.ts` — regenerates on build; never hand-edit.

Worker/API (verified present, exact lines to be located by grep):

- `packages/studio-api/src/contracts/registry.ts` — the `studio.methods`
  contract entry (path `/api/v1/studio/methods`).
- `packages/studio-api/src/contracts/routing.ts` — routing entry for the
  same key.
- `packages/studio-api/src/contracts/openapi.ts` — OpenAPI path entry.
- `packages/studio-api/src/studio/read-handlers.ts` — the methods read
  handler (serves the R2 projection).
- Tests referencing it: `packages/studio-api/test/http-routing.test.ts`,
  `packages/studio-api/test/api-facade.test.ts`,
  `packages/studio-api/test/package-exports.test.ts` (asserts
  `client.path("studio.methods")`).

Checks: `tools/pipeline-v2/src/checks/check-web-seo.ts` loops
`PUBLIC_STUDIO_ROUTES` (no separate methods constant — removing the seo.ts
entry is sufficient). Sitemap regenerates via `studio release` (operator).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Studio-api typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 (script exists in that package; if named differently, use `bunx tsc -p packages/studio-api/tsconfig.json --noEmit`) |
| Studio-api tests | `bun test packages/studio-api --timeout 5000` | all pass |
| Worker tests | `bun run test:worker` | all pass |
| Web tests + build | `bun run test:web && bun --filter @bp/web build` | pass, in budget |
| SEO check | `bun run check:web-seo` | exit 0 (4 public routes + `/routes`) |
| Doctrine | `bun run check:design-doctrine` | exit 0 |

## Scope

**In scope**:
- DELETE `apps/web/src/routes/methods.tsx`, `apps/web/src/studio/pages/methods.tsx`
- EDIT `apps/web/src/studio/shell.tsx`, `apps/web/src/studio/seo.ts`,
  `apps/web/src/worker/spa.ts`, `apps/web/src/lib/head.ts`,
  `apps/web/src/routes/__root.tsx`,
  `apps/web/src/components/route/DataNotesSection.tsx` (link strip only),
  `apps/web/src/studio/api-client.ts`, `apps/web/src/studio/api-contract.ts`
- EDIT `packages/studio-api/src/contracts/{registry,routing,openapi}.ts`,
  `packages/studio-api/src/studio/read-handlers.ts`
- EDIT the three studio-api test files (remove methods cases only)
- EDIT `tests/harness/design-doctrine.test.ts` (remove `studio/pages/methods.tsx` from allowlists)
- `plans/README.md` (status row)

**Out of scope**:
- Pipeline: `studio release`/`_release-*` methods.json build steps and
  `check:publish-completeness` expectations — the artifact keeps building.
- `@bp/domain/studio/docs` types — other packages may use them; leave.
- Any DataNotesSection redesign beyond removing the one link (plan 053).
- Redirects: no `/methods` redirect is added — the SPA's not-found page
  handles stale links (`$.tsx` catch-all).

## Git workflow

- Branch: `codex/052-delete-methods-page`
- Two commits: (1) web deletion, (2) worker/API deletion. Do NOT push or
  open a PR unless the operator instructed it.

## Steps

### Step 1: Delete the web page + wiring

1. Delete `apps/web/src/routes/methods.tsx` and
   `apps/web/src/studio/pages/methods.tsx`.
2. `shell.tsx`: remove the Methods nav item.
3. `seo.ts`: remove the `PUBLIC_STUDIO_ROUTES` `/methods` entry and the
   `pathname === "/methods"` block.
4. `worker/spa.ts`: regex → `/^\/(?:interventions|map|routes)\/?$/`.
5. `lib/head.ts` + `routes/__root.tsx`: drop the "methods" mention from the
   two description strings (e.g. "…slow segments, and intervention
   timelines from public data.").
6. `DataNotesSection.tsx`: remove the `/methods` link element(s) — locate
   with `rg -n "methods" apps/web/src/components/route/DataNotesSection.tsx`;
   keep surrounding content intact.
7. `api-client.ts`: delete `fetchStudioMethods` (line 177) and its
   `StudioMethodsResponse` import. `api-contract.ts`: delete the
   `@bp/domain/studio/docs` re-export block (lines 7-10).

**Verify**: `rg -rn "/methods|fetchStudioMethods|StudioMethodsResponse" apps/web/src --glob '!routeTree.gen.ts'`
→ 0 matches. `bun --filter @bp/web typecheck` → exit 0 (this also proves
nothing else imported the deleted page). `bun --filter @bp/web build` →
exit 0 (regenerates `routeTree.gen.ts` without `/methods`; budget passes —
entry should SHRINK since the methods page was imported eagerly).

### Step 2: Delete the worker endpoint

In `packages/studio-api`: locate every methods reference
(`rg -n "methods" packages/studio-api/src`) and remove: the registry
contract entry, the routing entry, the OpenAPI path, and the read handler
block. Keep shared helpers intact — only delete methods-specific branches.

**Verify**: `rg -rn "studio.methods|studio/methods" packages/studio-api/src`
→ 0 matches. Studio-api typecheck → exit 0.

### Step 3: Update the API tests

In the three test files, delete ONLY the methods-specific tests/assertions
(`http-routing`: the `/api/v1/studio/methods` route case;
`package-exports`: the `client.path("studio.methods")` assertion;
`api-facade`: methods fixture setup + response assertions). Do not weaken
any other endpoint's coverage.

**Verify**: `bun test packages/studio-api --timeout 5000` → all pass;
`bun run test:worker` → all pass.

### Step 4: Doctrine ratchet + full gate

Remove `studio/pages/methods.tsx` from the plan-050 allowlists (a deleted
file is by definition stale there).

**Verify**: `bun run check:design-doctrine` → exit 0, then the full gate:
`bun --filter @bp/web typecheck && bun run test:web && bun run test:worker && bun --filter @bp/web build && bun run check:web-seo && bun run check:architecture && bun run check:style`
→ all pass.

## Test plan

No new tests — this is a deletion; the assertion of success is the
existing suites passing WITHOUT the methods cases, plus:
- `check:web-seo` passing proves the SEO surface no longer expects `/methods`.
- A dev-server spot check: GET `/methods` renders the not-found page
  (catch-all `$.tsx`), NOT a crash.

## Done criteria

- [ ] `rg -rn "/methods|fetchStudioMethods|StudioMethodsResponse" apps/web/src --glob '!routeTree.gen.ts'` → 0 matches
- [ ] `rg -rn "studio.methods|studio/methods" packages/studio-api/src packages/studio-api/test` → 0 matches
- [ ] `bun --filter @bp/web typecheck` exit 0; studio-api typecheck exit 0
- [ ] `bun test packages/studio-api --timeout 5000` exit 0
- [ ] `bun run test:worker` exit 0; `bun run test:web` exit 0
- [ ] `bun --filter @bp/web build` exit 0, in budget
- [ ] `bun run check:web-seo` exit 0; `bun run check:architecture` exit 0
- [ ] Dev server: `/methods` → not-found page
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 051 is not DONE (check `plans/README.md`): `routes/index.tsx` still
  imports `fetchStudioMethods` — STOP, wrong order.
- `rg -n "methods" packages/studio-api/src` surfaces methods references in
  files NOT listed in Scope (e.g. an auth-scope map or a projection
  manifest) — report the census before deleting.
- Any worker test failure that is NOT a removed-methods case — the
  endpoint removal touched shared routing; report.
- The `studio release` pipeline command's tests
  (`tools/pipeline-v2/test/**release-seo**`) fail — they may pin the
  5-route seo manifest; if so, update ONLY the expected route list to drop
  `/methods` (and include `/routes` from plan 051), and note it in the
  status row.

## Maintenance notes

- The pipeline still builds `studio/v1/methods.json`; a follow-up pipeline
  plan may retire that build step and its publish-completeness expectation
  — operator's call, deliberately not bundled here.
- If method-catalog provenance is ever wanted again, it returns as
  `SourceNote` entries next to data (plan 049), not as a page.
- Reviewer: scan the studio-api diff for accidental deletion of shared
  routing helpers — only methods-specific branches should disappear.
