---
title: Studio API hard-cutover refactor
type: engineering
status: planning
last_updated: 2026-06-05
owner: codex
source_count: 0
tags: [studio-api, api, cloudflare, worker, hard-cutover, contracts, client, authoring]
---

# Studio API hard-cutover refactor

This is the canonical plan for refactoring `@bp/studio-api`.

It supersedes [[wiki/engineering/studio_api_refactor_plan|Studio API Refactor Plan]], which described
the first package extraction. The package now exists, but its public surface is too broad. The next
move is a hard cutover to the intended architecture, not a compatibility migration.

## Goals

- Make `@bp/studio-api` a framework-neutral Studio REST kernel with explicit client-safe and
  server-only subpaths.
- Remove the root package export. `import "@bp/studio-api"` should fail.
- Remove the old `@bp/studio-api/authoring` export. Authoring server code must live under
  `@bp/studio-api/server/authoring`.
- Replace duplicated route/path/client/OpenAPI definitions with one typed route registry.
- Move browser fetch/path logic out of `apps/web/src/studio/api-client.ts` and into
  `@bp/studio-api/client`.
- Split the large authoring module into resource handlers, services, transforms, idempotency,
  publishing, and agent runtime modules.
- Fix cache, auth, CSRF, idempotency, and JSON error behavior as part of the cutover.
- Reduce LOC and complexity by deleting legacy barrels, duplicate path builders, and hand-maintained
  route/OpenAPI surfaces after the new structure is wired.

## Non-goals

- Do not keep a legacy fallback export, compatibility barrel, or deprecated alias.
- Do not adopt TanStack, React, Hono, tRPC, oRPC, ts-rest, Fastify, or Elysia inside
  `@bp/studio-api`.
- Do not create `apps/api` as part of this refactor.
- Do not move analytics, source fetching, pipeline jobs, or wiki/runtime reads into the public
  request path.
- Do not preserve implicit public-read draft overlays if they make response caching ambiguous.

## Hard-cutover rule

The only acceptable temporary overlap is implementation overlap inside one branch:

```text
build new contracts/client/server modules beside the current package
  -> update all package, Worker, and app imports in one cutover
  -> delete old exports and duplicated modules before declaring done
```

Do not ship both old and new public import paths.

## Current fault lines

The current package has two environment-ambiguous entrypoints:

```text
@bp/studio-api
@bp/studio-api/authoring
```

The root export currently exposes request dispatch, scheduled jobs, source refresh helpers, auth
primitives, token helpers, projection helpers, route predicates, observability helpers, and
low-level HTTP helpers through one browser-importable door. That makes client/server boundaries
too easy to cross.

Large and duplicated surfaces to shrink or delete:

| Surface | Current issue |
|---|---|
| `packages/studio-api/src/studio/brief-drafts.ts` | One large module mixing HTTP routing, authz, D1 workflows, transforms, comments, proposals, versions, publishing, AI, and Durable Object runtime. |
| `packages/studio-api/src/public-api.ts` | Public route matching and response assembly are separate from Studio read route matching and OpenAPI. |
| `packages/studio-api/src/studio/read-handlers.ts` | Routing, projection access, response cache behavior, and draft overlay hooks are mixed. |
| `apps/web/src/studio/api-client.ts` | Browser client owns duplicated route strings and fetch behavior. |
| `packages/domain/src/studio-openapi.ts` | OpenAPI path ownership is separated from the actual server matcher. |
| `packages/studio-api/src/http/routing.ts` | Route templates are handwritten regexes instead of generated from a registry. |

## Package identity

`@bp/studio-api` is the framework-neutral REST resource kernel for Studio:

- `contracts`: client-safe route specs, path builders, error contracts, cache/idempotency metadata,
  and generated OpenAPI.
- `client`: client-safe fetch wrapper over those contracts.
- `server`: Cloudflare Worker/server-only dispatch, auth, persistence, scheduled jobs, authoring,
  source-refresh cron, and the `BriefAuthorAgent` runtime.

It is not a TanStack package, not a generic Cloudflare helper package, and not an app router.

## Final exports

Use explicit subpaths only:

```json
{
  "exports": {
    "./contracts": "./src/contracts/index.ts",
    "./contracts/openapi": "./src/contracts/openapi.ts",
    "./client": "./src/client/index.ts",
    "./client/fetch": "./src/client/fetch.ts",
    "./server": "./src/server/index.ts",
    "./server/worker": "./src/server/worker.ts",
    "./server/scheduled": "./src/server/scheduled.ts",
    "./server/auth": "./src/server/resources/auth/index.ts",
    "./server/authoring": "./src/server/resources/authoring/index.ts",
    "./server/authoring/agent": "./src/server/resources/authoring/agent/index.ts",
    "./server/testing": "./src/server/testing/index.ts"
  }
}
```

Forbidden:

```text
"."
"./authoring"
```

Rationale:

- `contracts` and `client` are safe for browser, SPA, TanStack Router loaders, and future SSR
  loader wrappers.
- `server/*` declares Worker-only intent.
- No root export means environment ambiguity fails at import time.
- No compatibility export means stale imports cannot survive silently.

## Target structure

```text
packages/studio-api/src/
  contracts/
    index.ts
    route-spec.ts
    registry.ts
    public.routes.ts
    studio-read.routes.ts
    studio-authoring.routes.ts
    auth.routes.ts
    observability.routes.ts
    schema.routes.ts
    errors.ts
    cache-policy.ts
    idempotency.ts
    path-builder.ts
    openapi.ts

  client/
    index.ts
    fetch.ts
    paths.ts
    errors.ts
    types.ts

  server/
    index.ts
    env.ts
    context.ts
    worker.ts
    scheduled.ts

    routing/
      matcher.ts
      dispatch.ts
      parse-request.ts
      serialize-response.ts
      route-context.ts

    http/
      json.ts
      errors.ts
      cache.ts
      csrf.ts
      timing.ts
      headers.ts

    resources/
      public/
        handlers.ts
        service.ts
        serializers.ts
      studio-read/
        handlers.ts
        service.ts
        projection-store.ts
        projection-response.ts
      auth/
        handlers.ts
        service.ts
        cookies.ts
        magic-links.ts
        sessions.ts
        csrf.ts
      observability/
        handlers.ts
      schema/
        handlers.ts
      authoring/
        handlers.ts
        service.ts
        authz.ts
        idempotency.ts
        transforms/
        comments/
        proposals/
        publishing/
        agent/

    persistence/
      d1.ts
      r2.ts
      projection-keys.ts

    jobs/
      source-refresh.ts
      gtfs-rt-capture.ts
      route-speed-watcher.ts

    testing/
      fakes.ts
      route-harness.ts

  testing/
    client-import-smoke.ts
    server-import-smoke.ts
```

The structure is a target, not a requirement to create tiny files before code pressure justifies
them. Split where it deletes duplication, isolates browser-safe code, or makes the authoring
workflow legible.

## Contract registry

Each route spec should own:

```text
id
operationId
method
path
tags
summary
auth policy
cache policy
idempotency policy
params/query/body schema
response schemas
```

The registry should generate:

- request matcher
- `405 Allow` method table
- path builders
- route template labels for logs and `Server-Timing`
- typed client input/output helpers
- OpenAPI paths
- schema routes

The registry should not import handlers. `contracts/**` and `client/**` must not import
`server/**`, `@bp/db`, Cloudflare Think, Workers AI, Durable Objects, React, TanStack, Vite, apps,
tools, sources, analytics, applied-research, or knowledge files.

## Server dispatcher

`server/routing/dispatch.ts` is the only `/api/*` dispatcher.

Behavior:

- Return `null` for non-API paths so `apps/web` can handle assets and SPA fallback.
- Return JSON `404` for unmatched `/api/*` paths.
- Return JSON `405` with `Allow` for path matches with unsupported methods.
- Parse params, query, and body from route specs.
- Enforce auth, CSRF, idempotency, and cache policy centrally.
- Call one thin handler per route ID.
- Serialize errors through one JSON envelope.

Error envelope:

```ts
type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};
```

Delete plain-text API `Not found` responses during the cutover.

## Authoring split

Break `brief-drafts.ts` by responsibility:

| Target | Responsibility |
|---|---|
| `authoring/handlers.ts` | HTTP-only route handlers keyed by route ID. |
| `authoring/service.ts` | D1 orchestration and workflow state transitions. |
| `authoring/authz.ts` | Workspace, operator, draft, and proposal permission checks. |
| `authoring/idempotency.ts` | Required idempotency keys, body hash checks, replay, and conflict behavior. |
| `authoring/transforms/*` | Draft records, body Markdown, claims, blocks, refs, validation, comments, proposals, versions, publish candidates. |
| `authoring/comments/*` | Comment/thread service and route handlers. |
| `authoring/proposals/*` | Proposal operations, apply/reject, and repair feedback. |
| `authoring/publishing/*` | Publish/retract/export/audit logic. |
| `authoring/agent/*` | `BriefAuthorAgent`, prompts, model selection, tools, runs, proposal submission. |

Only `@bp/studio-api/server/authoring/agent` may export `BriefAuthorAgent`.

## Browser client

`@bp/studio-api/client` should own framework-neutral fetch behavior:

- construct paths through the contract registry
- set default `credentials: "same-origin"`
- encode query/body
- decode success and error responses
- expose typed route input/output helpers

`apps/web` keeps React and TanStack concerns:

- loaders
- hooks
- optimistic UI
- route invalidation
- component-local view-model mapping

`apps/web` should not own Studio route strings after the cutover.

## Worker import shape

Final `apps/web` Worker imports:

```ts
import { handleStudioFetch } from "@bp/studio-api/server/worker";
import { handleStudioScheduled } from "@bp/studio-api/server/scheduled";

export { BriefAuthorAgent } from "@bp/studio-api/server/authoring/agent";
```

`apps/web/src/worker/spa.ts` should get any API-path predicate from a client-safe contract/helper
subpath, not the old root export.

## Security and correctness gates

### Cache policy

Cache policy belongs in route metadata.

Rules:

- Public published reads may use public cache.
- Auth routes must use `Cache-Control: no-store, private`.
- Draft authoring routes must use `Cache-Control: no-store, private`.
- Any response affected by session, operator, workspace, or draft overlay must use
  `Cache-Control: no-store, private` and `Vary: Cookie`.
- Any response with `Set-Cookie` must not be public-cacheable.
- Optional-session routes must become private/no-store when session changes output.

Prefer an explicit private draft preview route over hidden draft overlay on public published brief
reads.

### Idempotency

Require `Idempotency-Key` for mutating authoring routes:

- create brief
- patch draft
- generate
- create/update/delete claims, blocks, refs, comments, and replies
- accept/apply/reject proposals
- version restore
- publish/retract
- promotion receipt
- agent run/proposal submission

Recommended scope:

```text
identityId + workspaceId + routeId + method + canonical path params + body hash + idempotency key
```

Behavior:

- Missing key returns `428 Precondition Required`.
- Same key and same body replays the stored response.
- Same key and different body returns `409 Conflict`.
- Records are never shared across identities or workspaces.
- Validation failures and unexpected `5xx` responses should not be recorded as successful
  idempotent results.

### Auth, magic links, and CSRF

- Route-level auth scopes live in route metadata.
- Resource-level authz remains in services for ownership and workflow state.
- Cookie-authenticated mutations need same-origin `Origin` or `Referer` checks and a CSRF token or
  double-submit token.
- Magic-link request responses must not reveal account existence.
- Full magic links may be logged only when `ENVIRONMENT === "development"` and an explicit dev flag
  allows it.
- In non-development, missing email bindings should not log tokens.

## Implementation sequence

This is one public cutover, but it can be built in a controlled order.

### 1. Add skeleton and guard tests

- Add `contracts`, `client`, and `server` folders.
- Add import-boundary tests for client-safe and server-only graphs.
- Add package-export tests proving no root export and no `./authoring` export.

Verification:

```sh
bun --filter @bp/studio-api typecheck
bun --filter @bp/studio-api test
```

### 2. Build the route registry

- Define route specs for existing public, Studio read, authoring, auth, observability, and schema
  routes.
- Generate path builders, matcher inputs, route templates, and OpenAPI from the registry.
- Keep domain Zod schemas in `@bp/domain`; move route/path/OpenAPI ownership into
  `@bp/studio-api/contracts`.

Verification:

```sh
bun --filter @bp/studio-api test ./test/contracts --timeout 5000
```

### 3. Add the new dispatcher

- Implement centralized `404`, `405`, request parsing, auth, CSRF, idempotency, cache policy, and
  response serialization.
- Wire existing resource logic through the new dispatcher before deleting old route matchers.

Verification:

```sh
bun --filter @bp/studio-api test ./test/server --timeout 5000
```

### 4. Move resources

- Move public reads into `server/resources/public`.
- Move Studio reads into `server/resources/studio-read`.
- Move auth into `server/resources/auth`.
- Split authoring by responsibility.
- Move scheduled work into `server/jobs` and expose it only through `server/scheduled`.

Verification:

```sh
bun --filter @bp/studio-api typecheck
bun --filter @bp/studio-api test
```

### 5. Cut over app and Worker imports

- Replace `@bp/studio-api` root imports in `apps/web`.
- Replace `@bp/studio-api/authoring` imports with `@bp/studio-api/server/authoring/agent`.
- Replace `apps/web/src/studio/api-client.ts` route/path logic with wrappers around
  `@bp/studio-api/client`.

Verification:

```sh
bun --filter @bp/web build
bun run test:worker
```

### 6. Delete legacy

Delete or collapse:

- `packages/studio-api/src/index.ts`
- `packages/studio-api/src/authoring.ts`
- old broad root exports
- old `./authoring` export
- old ad hoc route regex dispatch
- duplicated app path/client logic
- hand-maintained OpenAPI path ownership outside the registry
- broad exports for token helpers, cookie helpers, projection keys, source-refresh internals, and
  low-level HTTP utilities

Verification:

```sh
bun run check:types
bun run check:web-architecture
bun run test:worker
```

## Test requirements

### Contract tests

- Every route has unique `id` and `operationId`.
- Every route has method, path, auth, cache, idempotency, tags, and response schemas.
- Every `:param` in a path is declared in `params`.
- Path builders round-trip through the matcher.
- OpenAPI generation covers every route exactly once.

### Dispatcher tests

- Unknown `/api/*` returns JSON `404`.
- Wrong method returns JSON `405` and correct `Allow`.
- Non-API path returns `null`.
- Malformed params/query/body return consistent JSON validation errors.

### Import smoke tests

Browser/client entry may import:

```ts
import { studioApiRoutes } from "@bp/studio-api/contracts";
import { createStudioApiClient } from "@bp/studio-api/client";
```

It must not include:

```text
@bp/db
@cloudflare/think
workers-ai-provider
ai
DurableObject
src/server
apps/
tools/
knowledge/
React
TanStack
Vite
```

Server entry may import:

```ts
import { dispatchStudioApiRequest } from "@bp/studio-api/server";
import { handleStudioFetch } from "@bp/studio-api/server/worker";
import { handleStudioScheduled } from "@bp/studio-api/server/scheduled";
import { BriefAuthorAgent } from "@bp/studio-api/server/authoring/agent";
```

It must not import apps, tools, knowledge, sources, analytics, applied-research, React, TanStack, or
pipeline code.

### Runtime tests

Use Bun for pure contract, dispatch, and service tests. Use the Cloudflare Vitest pool only for
Worker runtime behavior:

- Worker `fetch`
- scheduled handler
- Durable Object agent
- R2/D1 binding behavior
- `ctx.waitUntil`

Do not make live external network calls by default. Source refresh and AI tests need injected
fetchers/model providers or explicit opt-in flags.

## Final verification

Before declaring the refactor done:

```sh
bun --filter @bp/studio-api typecheck
bun --filter @bp/studio-api test
bun --filter @bp/web build
bun run check:types
bun run check:web-architecture
bun run test:worker
```

If docs/wiki files are touched in the same change:

```sh
bun run check:knowledge
```

## Open decisions

Recommended defaults:

| Question | Default |
|---|---|
| Should source refresh remain in `@bp/studio-api/server/scheduled`? | Yes for this cutover. Revisit only after the API boundary is clean. |
| Should public brief reads overlay drafts? | No. Prefer an explicit private draft preview route. |
| Missing idempotency key status? | `428 Precondition Required`. |
| Production response validation? | Tests/staging by default; sample production only if needed. |
| TanStack Start integration? | App concern. `@bp/studio-api` remains framework-neutral. |

## Completion definition

The cutover is complete only when:

- `import "@bp/studio-api"` fails.
- `import "@bp/studio-api/authoring"` fails.
- `apps/web` uses `@bp/studio-api/client` for Studio API path/fetch behavior.
- Worker imports use only `@bp/studio-api/server/*`.
- OpenAPI paths are generated from the route registry.
- API `404` and `405` responses use the JSON error envelope.
- Auth/session/draft responses cannot be public-cacheable.
- Authoring mutations have scoped idempotency.
- Legacy exports and duplicated route/client/OpenAPI definitions are deleted.
- The verification commands above pass or any skipped check is explicitly explained.
