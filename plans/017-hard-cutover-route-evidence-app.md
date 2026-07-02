# Plan 017: Hard-cut the web app to route evidence pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 58dfaeb..HEAD -- \
>   apps/web/package.json \
>   apps/web/src/routes \
>   apps/web/src/studio \
>   apps/web/src/components/brief \
>   apps/web/src/components/route \
>   apps/web/src/worker \
>   apps/web/wrangler.jsonc \
>   apps/web/test \
>   packages/domain/package.json \
>   packages/domain/src/studio \
>   packages/domain/src/json-schema/index.ts \
>   packages/studio-api/package.json \
>   packages/studio-api/src \
>   packages/studio-api/test \
>   tests/harness
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch that changes the architecture, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/016-mta-wiki-route-evidence-contract.md`
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-30

## Why this matters

The product direction is a hard cutover, not hiding old surfaces. Keep the name
Bus Priority Impact Studio, but make it a complete, minimal public product:
home, route detail pages, map, interventions, and methods. Delete brief,
finding, composer, review, authoring, and AI chat/composer concepts from the
runtime. Every route page should render a complete useful page, even when a
route has sparse evidence.

## Current state

- `apps/web/src/studio/shell.tsx` currently has nav items for Routes, Map,
  Findings, Briefs, and Docs. Findings and Briefs are no longer product
  surfaces. Docs should become a simpler Methods surface.
- Current route files include public and authoring surfaces:

  ```text
  apps/web/src/routes/briefs.tsx
  apps/web/src/routes/briefs/$briefId.tsx
  apps/web/src/routes/briefs/$briefId/edit.tsx
  apps/web/src/routes/briefs/$briefId/evidence.tsx
  apps/web/src/routes/briefs/$briefId/history.tsx
  apps/web/src/routes/briefs/$briefId/review.tsx
  apps/web/src/routes/briefs/new.tsx
  apps/web/src/routes/findings.tsx
  apps/web/src/routes/findings/$findingId.tsx
  apps/web/src/routes/compare.tsx
  apps/web/src/routes/search.tsx
  apps/web/src/routes/docs.tsx
  apps/web/src/routes/docs/$page.tsx
  apps/web/src/routes/methods.tsx
  apps/web/src/routes/routes/$routeId.tsx
  apps/web/src/routes/map.tsx
  ```

- `apps/web/src/studio/pages/route-detail.tsx` already has the useful skeleton:
  overview KPIs, map, where/when, reliability, riders, treatments, and evidence.
  It still renders Compare and Brief actions in the route header.
- `apps/web/src/components/brief/` is a full authoring/review/prose system and
  should be deleted if no longer imported.
- `apps/web/src/studio/api-client.ts` imports and exports many brief/finding
  functions, including `fetchStudioFindings`, `fetchStudioBriefs`, draft
  mutations, review mutations, and agent proposal calls.
- `packages/domain/src/studio/release.ts` still includes findings, briefs,
  versions, comments, search, and compare response schemas.
- `packages/domain/src/studio/projections.ts` still builds finding, brief,
  brief evidence, brief history, search, compare, methods, and docs
  projections.
- `packages/studio-api/src/api.ts` dynamically imports
  `./studio/brief-drafts.js` for draft reads and writes.
- `apps/web/wrangler.jsonc` has a `BRIEF_AUTHOR_AGENT` Durable Object binding
  and migration. `apps/web/src/worker/index.ts` re-exports `BriefAuthorAgent`;
  `apps/web/src/worker/env.ts` includes the binding type.
- `packages/studio-api/package.json` exports `./server/authoring` and
  `./server/authoring/agent` and depends on `@cloudflare/think`, `ai`, and
  `workers-ai-provider` for authoring.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0, no errors |
| Studio API typecheck | `bun --filter @bp/studio-api typecheck` | exit 0, no errors |
| Domain typecheck | `bun --filter @bp/domain typecheck` | exit 0, no errors |
| Web shared tests | `bun test apps/web/test/shared --timeout 5000` | all pass |
| Worker tests | `bun --filter @bp/web test:worker` | all pass |
| Architecture | `bun run check:web-architecture` | exit 0 |
| Web build | `bun --filter @bp/web build` | exit 0 and bundle budget passes |

## Scope

**In scope**:

- `apps/web/src/routes/**`
- `apps/web/src/studio/**`
- `apps/web/src/components/brief/**` (delete)
- `apps/web/src/components/route/**`
- `apps/web/src/worker/**`
- `apps/web/wrangler.jsonc`
- `apps/web/package.json`
- `apps/web/test/**`
- `packages/domain/src/studio/**`
- `packages/domain/src/json-schema/index.ts`
- `packages/domain/package.json`
- `packages/studio-api/src/**`
- `packages/studio-api/test/**`
- `packages/studio-api/package.json`
- `tests/harness/production-boundaries.test.ts`
- `bun.lock`

**Out of scope**:

- Deleting `packages/applied-research`; that is plan 018.
- Changing route speed/ridership/math semantics.
- Adding browser-side Effect.
- Adding a chatbot, AI composer, or special finding feed under a new name.
- Editing generated `apps/web/src/routeTree.gen.ts` by hand. Let the TanStack
  router plugin regenerate it through the normal web build/dev flow.

## Final public product shape

Keep these public pages:

- `/` - useful home with route discovery and top civic questions.
- `/routes/$routeId` - complete route evidence page for every route.
- `/map` - network map.
- `/interventions` - route/corridor intervention timeline explorer.
- `/methods` - source, caveat, and methodology page.

Delete these product pages and API resources:

- `/briefs`, `/briefs/*`
- `/findings`, `/findings/*`
- `/compare`
- `/search`
- `/docs`, `/docs/*` unless retained only as redirects to `/methods`
- authoring/review/admin/account/sign-in pages if no non-brief protected
  surface remains
- `/api/v1/studio/briefs*`
- `/api/v1/studio/findings*`
- `/api/v1/studio/compare`
- `/api/v1/studio/search`
- brief draft, review, publish, agent, public comment, and identity-scoped
  authoring resources

## Steps

### Step 1: Remove route files for deleted surfaces

Delete the route files for briefs, findings, compare, search, docs, account,
admin identity, sign-in, and auth consume if no remaining non-brief protected
route uses them. Keep `/system` only if it is still a useful public diagnostic;
otherwise delete it too.

Create `apps/web/src/routes/interventions.tsx` using existing intervention
data from route detail projections or the route-evidence artifact from plan
016. Create or rewrite `apps/web/src/routes/methods.tsx` as the first-class
methods page. The old `/methods` file currently redirects to docs; remove that
redirect.

Update `apps/web/src/studio/shell.tsx` nav to the final pages only. Suggested
nav labels: Routes or Home, Map, Interventions, Methods. Do not include
Findings, Briefs, Docs, Search, Compare, or AI labels.

**Verify**:

```sh
rg -n 'createFileRoute\("/(briefs|findings|compare|search|docs|account|signin|auth.consume|admin.identities)' apps/web/src/routes
```

Expected: no matches, unless you intentionally kept a documented redirect to
`/methods`. If you keep redirects, their files must not import deleted pages or
API calls.

### Step 2: Delete brief and finding UI components

Delete `apps/web/src/components/brief/`.
Delete these page modules:

- `apps/web/src/studio/pages/brief-workflows.tsx`
- `apps/web/src/studio/pages/briefs.tsx`
- `apps/web/src/studio/pages/finding-detail.tsx`
- `apps/web/src/studio/pages/findings-feed.tsx`
- `apps/web/src/studio/pages/compare.tsx`
- `apps/web/src/studio/pages/search-results.tsx`
- docs page modules if `/methods` replaces them

Delete compare-only route components under
`apps/web/src/components/route/compare/` and compare wrappers such as
`CompareContext.tsx`, `RouteCompareIdentity.tsx`, `RouteCompareMetricStrip.tsx`,
and `RouteDeltaStrip.tsx` if no kept page imports them.

Update route detail components:

- Remove the Brief button from `apps/web/src/studio/pages/route-detail.tsx`.
- Remove the Compare link from route detail if `/compare` is deleted.
- Remove `SendToBriefSheet` buttons and imports from `SlowSegments`,
  `OverviewSection`, and `DataNotesSection`.
- Keep honest empty states for sparse route sections.

**Verify**:

```sh
rg -n 'Brief|Finding|SendToBrief|Composer|ReviewBrief|compare|/briefs|/findings|/compare' apps/web/src
```

Expected: no runtime matches. It is acceptable for changelog/test names to
contain old words only if those files are clearly not imported into production;
prefer deleting stale tests too.

### Step 3: Collapse the browser API client and contracts

In `apps/web/src/studio/api-client.ts`, delete all functions and imports for:

- findings
- briefs
- draft mutations
- review comments
- publish candidate export
- agent runs/proposals
- compare
- search
- docs if `/methods` replaces docs

Keep route, route index, map, route history, route speed history,
route timeline/evidence, interventions, methods, status, and RUM calls.

In `apps/web/src/studio/api-contract.ts`, remove re-exports for deleted
brief/finding/authoring/search/compare schemas and types. Keep only public
route/map/intervention/method/status contracts.

Remove now-unused AI/browser dependencies from `apps/web/package.json` only
after `rg` proves there are no imports. Candidates include
`@cloudflare/ai-chat`, `@cloudflare/codemode`, `@cloudflare/shell`,
`@cloudflare/think`, `agents`, `ai`, `workers-ai-provider`, `react-markdown`,
`remark-directive`, `remark-gfm`, `sonner`, and `cmdk`.

**Verify**:

```sh
bun --filter @bp/web typecheck
```

Expected: exit 0.

### Step 4: Remove brief/finding/authoring domain contracts

Delete or empty the public exports for:

- `packages/domain/src/studio/briefs/`
- `packages/domain/src/studio/findings/`
- brief/finding/search/compare pieces in `packages/domain/src/studio/release.ts`
- brief/finding/search/compare projection builders in
  `packages/domain/src/studio/projections.ts`
- brief/finding JSON Schema exports in `packages/domain/src/json-schema/index.ts`
- `./studio/briefs` and `./studio/findings` subpath exports in
  `packages/domain/package.json`

Keep route, route-evidence, intervention, docs/methods if still used, identity
only if a non-brief product surface still needs it, RUM, shared, snapshots, and
field provenance.

Important: do not delete `packages/domain/src/findings/` detector contracts in
this plan unless all pipeline and analytics imports are already gone. Plan 018
handles deeper detector/research deletion.

**Verify**:

```sh
bun --filter @bp/domain typecheck
rg -n '@bp/domain/studio/(briefs|findings)|StudioBrief|StudioFinding|StudioSearch|StudioCompare' packages/domain apps/web/src packages/studio-api/src
```

Expected: typecheck exits 0 and grep has no runtime matches for deleted Studio
contracts.

### Step 5: Remove Studio API read and authoring resources

Update `packages/studio-api/src/contracts/registry.ts`:

- Delete brief/finding/search/compare/docs route specs.
- Delete `read:briefs`, `write:briefs`, `review:briefs`, and `publish:briefs`
  scope constants if no remaining route uses them.
- Keep public route/map/status/artifact/hotspot/timeline/evidence/methods
  route specs.

Update `packages/studio-api/src/contracts/openapi.ts` and related contract
tests so generated OpenAPI no longer documents deleted resources.

Delete or simplify:

- `packages/studio-api/src/studio/brief-drafts.ts`
- `packages/studio-api/src/server/resources/authoring/**`
- brief/finding loaders in `packages/studio-api/src/studio/projections.ts`
- brief/finding cases in `packages/studio-api/src/studio/read-handlers.ts`
- brief public comments in `packages/studio-api/src/identity-surface-routes.ts`
- any D1 identity/session code that only exists for brief authoring

Update `packages/studio-api/package.json`:

- Remove `./server/authoring` and `./server/authoring/agent` exports.
- Remove `@cloudflare/think`, `ai`, and `workers-ai-provider` if no imports
  remain.

**Verify**:

```sh
bun --filter @bp/studio-api typecheck
bun --filter @bp/studio-api test
rg -n 'brief|finding|authoring|BriefAuthorAgent|read:briefs|write:briefs|review:briefs|publish:briefs' packages/studio-api/src packages/studio-api/test
```

Expected: typecheck/tests pass. Grep should return no runtime matches except
comments in intentionally deleted migration notes, if any are kept.

### Step 6: Remove Worker AI/authoring bindings

Update `apps/web/src/worker/index.ts` to remove the `BriefAuthorAgent`
re-export. Update `apps/web/src/worker/env.ts` to remove the
`BRIEF_AUTHOR_AGENT` binding type.

Update `apps/web/wrangler.jsonc`:

- Remove the `durable_objects.bindings` entry for `BRIEF_AUTHOR_AGENT`.
- Remove the AI binding if no remaining Worker code uses `env.AI`.
- For Durable Object migrations, verify Wrangler behavior before deleting old
  migration history. If `wrangler` rejects removal of a historical migration
  entry, keep the old migration record but leave no live binding/export.

Delete Worker tests that only exercise brief drafts or authoring. Keep public
route/API tests and add/update negative tests proving deleted endpoints return
404.

**Verify**:

```sh
bun --filter @bp/web test:worker
rg -n 'BRIEF_AUTHOR_AGENT|BriefAuthorAgent|env\.AI|durable_objects|new_sqlite_classes' apps/web packages/studio-api
```

Expected: worker tests pass. No live binding/export references remain. A
historical Wrangler migration string may remain only if documented in a code
comment or plan note.

### Step 7: Make route pages complete when sparse

Use the existing route-detail tab structure as the target:

- overview KPIs
- all available years of speed/ridership/reliability data
- map and slow segments
- ridership
- timeline/interventions
- before/after where applicable
- source/caveat panel

For sparse routes, render honest minimal sections rather than hiding the page:

- no special finding required
- no rare-issue route card required
- no fabricated before/after
- source/caveat panel must explain missing evidence

Join the plan 016 route-evidence artifact in the API or route detail projection
only at the serving boundary. The browser should fetch typed public resources;
it must not read MTA-wiki files or private R2 keys directly.

**Verify**:

```sh
bun test apps/web/test/shared --timeout 5000
bun --filter @bp/web typecheck
```

Expected: tests and typecheck pass.

### Step 8: Regenerate route tree, lockfile, and final checks

Run install/build tooling after package dependency changes:

```sh
bun install
bun --filter @bp/web build
bun run check:web-architecture
```

Expected: install updates `bun.lock` if dependencies changed. Web build exits 0
and bundle budget passes. Architecture check exits 0.

## Test plan

- Delete obsolete brief/finding/authoring tests with their code.
- Add or update tests for:
  - route detail renders with sparse route evidence
  - `/interventions` renders from route/intervention data
  - `/methods` renders without docs route dependency
  - deleted API endpoints return 404
  - shell nav has no Briefs/Findings/Docs/Search/Compare entries
- Required verification:
  - `bun --filter @bp/domain typecheck`
  - `bun --filter @bp/studio-api typecheck`
  - `bun --filter @bp/web typecheck`
  - `bun test apps/web/test/shared --timeout 5000`
  - `bun --filter @bp/web test:worker`
  - `bun run check:web-architecture`
  - `bun --filter @bp/web build`

## Done criteria

- [ ] Final public pages are `/`, `/routes/$routeId`, `/map`, `/interventions`,
      and `/methods`.
- [ ] Brief, finding, composer, review, authoring, compare, search, and docs
      product surfaces are deleted, not hidden.
- [ ] Route detail has no Brief or Compare action.
- [ ] Browser, Worker, Studio API, and domain code have no live Studio brief or
      Studio finding contracts.
- [ ] Worker has no live `BRIEF_AUTHOR_AGENT` binding/export.
- [ ] AI authoring dependencies are removed where unused.
- [ ] Sparse routes still render a complete route evidence page.
- [ ] Required verification commands pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A non-brief product requirement still depends on auth/operator identity.
- Wrangler requires a Durable Object deletion/migration procedure that cannot
  be verified locally.
- Removing docs/search/compare would leave no route discovery path on `/`.
- The route page needs data that only exists in deleted brief/finding
  projections and cannot be supplied by route, route history, route evidence,
  map, or methods resources.
- The bundle budget fails after deleted dependencies are removed; investigate
  but do not raise the budget in this plan.

## Maintenance notes

- Plan 018 should run after this. It deletes the research package and pipeline
  commands that generated brief/finding/research artifacts.
- Reviewers should focus on dead endpoint removal, generated route tree drift,
  and whether any old Studio brief/finding language remains in user-visible
  copy.
