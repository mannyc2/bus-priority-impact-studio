---
title: Studio API Refactor Plan
type: engineering
status: planning
last_updated: 2026-06-05
owner: codex
source_count: 4
tags: [api, cloudflare, worker, ssr, tanstack-router, package-boundaries]
---

# Studio API Refactor Plan

## Purpose

The current Worker is doing too much in one deployable module: static asset fallback, SPA SEO
injection, public Studio reads, mutable brief authoring, auth, source-refresh cron, GTFS-RT capture,
and the `BriefAuthorAgent` Durable Object. At the same time, SSR is still undecided.

The next architecture move should preserve that optionality:

```text
extract a reusable Studio API package first
  -> keep the existing web Worker as the only deployed app for now
  -> add a separate API app/Worker only after SSR or least-privilege needs justify it
```

This is a plan, not an ADR. If the package boundary lands and an `apps/api` Worker becomes a
deployment decision, record that decision under `docs/decisions/` and update
[[wiki/engineering/package_structure|Repo Package Structure]].

## Decision posture

Use a **package-first, app-later** refactor.

### Recommended now

Add a new internal runtime package:

```text
packages/studio-api/
  src/
    env.ts
    http/
      json.ts
      errors.ts
      timing.ts
      routing.ts
    studio/
      projections.ts
      routes.ts
      search.ts
      findings.ts
      briefs.ts
      snapshot.ts
    authoring/
      drafts.ts
      comments.ts
      agents.ts
      promotion.ts
    auth/
      sessions.ts
      magic-links.ts
    operations/
      source-refresh.ts
    index.ts
```

The existing `apps/web` Worker stays deployed and delegates `/api/*`, scheduled refreshes, and
agent classes to this package. Static assets, SPA fallback, and edge SEO stay in `apps/web`.

### Defer for now

Do **not** add `apps/api` until one of these gates is met:

- SSR is approved and the site Worker should be separated from API/cron/AI/DO responsibilities.
- Least-privilege binding split becomes a release requirement: site reads only; API owns writes,
  cron, AI, and Durable Objects.
- Independent API deploys, rate limits, or external API versioning become product requirements.
- The package extraction is complete enough that `apps/api` would be a thin wrapper, not a second
  implementation.

## Why this helps even without SSR

The package split moves backend complexity forward without betting on rendering:

- `apps/web/src/worker/index.ts` can shrink to request routing, assets, SEO shell handling, and
  delegation.
- Studio API code becomes testable without the asset/SPA branch in the way.
- The upcoming `GET /api/v1/studio/snapshot` and data expansion endpoints get a proper home.
- `apps/api` becomes an easy wrapper later instead of a risky fork.
- SSR loaders, if added, can call shared `@bp/db` query/projection helpers without duplicating API
  resource logic or fetching public HTTP endpoints from inside the same platform.

## Package boundary

`packages/studio-api` is a Cloudflare-edge runtime package. It may know about `Request`,
`Response`, D1, R2, Workers AI, Durable Objects, cookies, and headers. It must not know about React,
TanStack Router route files, Vite assets, MapLibre, source adapters, local pipeline commands, or
wiki files.

Allowed imports:

```text
packages/studio-api -> packages/domain, packages/db
apps/web            -> packages/studio-api, packages/domain, packages/db
future apps/api     -> packages/studio-api
```

Forbidden imports:

```text
packages/studio-api -> apps/*
packages/studio-api -> packages/analytics
packages/studio-api -> packages/applied-research
packages/studio-api -> packages/sources
packages/studio-api -> tools/*
packages/studio-api -> knowledge/*
packages/studio-api -> React / TanStack Router UI route modules
```

The boundary harness should eventually enforce this.

## Export shape

The package should expose a small surface:

```ts
export type StudioApiEnv = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  AI?: Ai;
  BRIEF_AUTHOR_AGENT?: DurableObjectNamespace;
  ASSETS?: never;
  BASELINE_MONTH?: string;
  LAST_BUILT_SPEED_MONTH?: string;
};

export function isStudioApiRequest(url: URL): boolean;
export function handleStudioApiRequest(request: Request, env: StudioApiEnv, ctx: ExecutionContext): Promise<Response>;
export function handleStudioScheduled(controller: ScheduledController, env: StudioApiEnv, ctx: ExecutionContext): Promise<void>;
export class BriefAuthorAgent extends Think<StudioApiEnv, BriefAuthorAgentState> {}
```

`ASSETS` is deliberately absent from the package environment. Asset fallback remains a site concern.

## Current web Worker after extraction

The web Worker should become a composition layer:

```text
fetch(request, env, ctx)
  -> /api/*                       -> handleStudioApiRequest(request, env, ctx)
  -> /system closed in production -> existing 404/noindex behavior
  -> SPA navigation               -> ASSETS fallback + edge SEO injection
  -> static asset                 -> ASSETS.fetch(request)

scheduled(controller, env, ctx)
  -> handleStudioScheduled(controller, env, ctx)

BriefAuthorAgent
  -> re-export from packages/studio-api
```

This keeps current deployment behavior while making the API transport portable.

## Future app shapes

### Current shape

```text
apps/web Worker
  assets + SPA fallback + edge SEO
  /api/* -> packages/studio-api
  scheduled -> packages/studio-api
  BriefAuthorAgent -> packages/studio-api
```

### Optional split without SSR

```text
apps/web Worker
  assets + SPA fallback + edge SEO
  /api/* same-origin route/service-binding forward

apps/api Worker
  /api/* -> packages/studio-api
  scheduled -> packages/studio-api
  BriefAuthorAgent -> packages/studio-api
```

### Optional split with SSR

```text
apps/site Worker
  TanStack Start SSR for selected public content routes
  assets + client hydration
  read-only D1/R2 or service binding to API
  no AI, no cron, no authoring DO

apps/api Worker
  /api/* -> packages/studio-api
  scheduled source refresh
  brief authoring writes
  BriefAuthorAgent + Workers AI
```

Keep `/api/*` same-origin unless a later ADR explicitly accepts cross-site cookies and CORS.

## TanStack Router implications

The user-supplied TanStack Router docs reinforce the current app direction:

- Keep file-based routing for UI pages. Code-based routing is explicitly not the normal path.
- Virtual file routes are a possible migration escape hatch if an SSR/site split needs a custom route
  tree while preserving existing route files, but they are not part of the API refactor.
- Use router loaders as the orchestration point for page data. Loader dependencies should include
  only the search params actually consumed by that loader.
- Prefer object-form loaders when configuring `staleReloadMode`, `staleTime`, and future
  route-specific cache policy.
- Pass loader `abortController.signal` through Studio API client helpers so abandoned navigations
  cancel in-flight API/R2 work.
- Use `router.subscribe` for imperative navigation telemetry: `onBeforeNavigate` or `onBeforeLoad`
  for start marks, `onResolved` for pageview/log cleanup, and `onRendered` only for DOM-dependent
  post-render work.

Do not let the API refactor depend on UI route-generation changes. It should improve the backend
package boundary while leaving route files stable.

## Refactor phases

### Phase 0: Guard rails and target skeleton

Create `packages/studio-api` with package metadata, tsconfig, public exports, and a boundary test
that rejects imports from apps, tools, wiki, sources, analytics, applied-research, React, and
TanStack Router UI modules.

Verification:

```sh
bun run check:types
bun run check:web-architecture
```

### Phase 1: HTTP and projection infrastructure

Move behavior-preserving helpers first:

- JSON and error responses.
- `Cache-Control` helpers.
- `Server-Timing` helpers with app/D1/R2 phases.
- request-id and structured route-template logging helpers.
- Studio R2 projection key construction and schema validation.

`apps/web` should delegate to the package but responses should stay byte-for-byte or
schema-equivalent for existing public endpoints.

Verification:

```sh
bun run test:worker
bun run check:web-architecture
```

### Phase 2: Studio read endpoints plus snapshot

Move read-only Studio resources:

- routes,
- search,
- route detail,
- ladder,
- compare,
- findings,
- briefs/evidence/history,
- methods,
- docs,
- the new `GET /api/v1/studio/snapshot`.

This is the right time to add `StudioSnapshotResponseSchema`, generate `studio/v1/snapshot.json`,
and wire OpenAPI/docs for the new resource.

Verification:

```sh
bun run build:studio-release -- --month 2026-03
bun run audit:studio-coverage -- --year 2026 --month 3
bun run test:worker
```

### Phase 3: Auth and brief authoring writes

Move bounded write-side resources:

- identity/session resolution,
- magic-link auth endpoints,
- draft create/update/claims/blocks/refs,
- validation/review/verdict/publish/retract,
- draft-private comments/suggestions,
- promotion receipt and publish-candidate export,
- agent runs/proposals/versions.

Keep write endpoints `no-store`, idempotency-keyed, and schema-validated.

Verification:

```sh
bun run test:worker -- brief-draft
bun run test:worker
```

### Phase 4: Operations and agent runtime exports

Move source-refresh cron and `BriefAuthorAgent` into package exports. `apps/web` re-exports the
class for the existing Worker config. No deployment split yet.

Verification:

```sh
bun --filter @bp/web test:worker
bun run check:types
```

### Phase 5: Optional `apps/api`

Add a deployable API app only after the gates in this plan are met. It should contain only Worker
configuration and a tiny entry module that calls `packages/studio-api`.

Verification before switching traffic:

```sh
bun --filter @bp/api build
bun --filter @bp/api test:worker
bun --filter @bp/web build
bun run check:web-release
```

## Risks and constraints

- Do not create a generic `api` dumping ground. Keep resource modules small and product-shaped.
- Do not move static asset fallback, SPA SEO injection, or UI route metadata into the package.
- Do not have SSR loaders fetch same-origin `/api/*` from inside the same Worker. Use shared DB and
  projection helpers directly.
- Do not expose private R2 keys as public API paths while extracting handlers.
- Keep the public request path read-heavy. Heavy analytics remain in local pipeline commands.

## Acceptance

The refactor is complete when:

- `apps/web/src/worker/index.ts` is mostly composition logic.
- `/api/*` behavior is covered by Worker tests through the package entrypoint.
- route-template logs and app/D1/R2 `Server-Timing` are emitted consistently.
- `GET /api/v1/studio/snapshot` exists and is generated from release artifacts.
- boundary tests enforce the new package import rules.
- adding `apps/api` would be a wrapper/config task, not a code migration.

## Source notes

This plan incorporates user-supplied TanStack Router docs for routing concepts, code-based routing,
virtual file routes, data loading, and router events. The practical conclusions are: keep UI routes
file-based, use object-form loaders and abort signals for route data, and use router events for
imperative navigation telemetry rather than rendering state.
