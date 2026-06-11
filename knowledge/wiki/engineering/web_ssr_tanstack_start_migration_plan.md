---
title: Web SSR (TanStack Start) Incremental Migration Sketch
type: engineering
status: draft
last_updated: 2026-06-04
owner: claude
source_count: 6
tags: [frontend, ssr, tanstack-start, cloudflare, worker, performance, seo, d1]
---

# Web SSR (TanStack Start) Incremental Migration Sketch

## Status

Exploratory sketch, not an approved decision. No ADR yet. This page exists to scope the work and
record the one benefit that is actually specific to our architecture before anyone commits. If we
proceed, this becomes a plan and we open an ADR under `docs/decisions/`.

## Why consider SSR at all

`apps/web` is a **client-rendered TanStack Router SPA**:

- `apps/web/index.html` ships an empty `<div id="root">`.
- `apps/web/src/main.tsx` mounts with `createRoot(rootElement).render(<RouterProvider router={router} />)`.
- `apps/web/src/router.tsx` builds the router with `defaultPreload: "intent"`, no SSR config.
- The Cloudflare Worker (`apps/web/src/worker/index.ts`) serves the static shell via the `ASSETS`
  binding (`not_found_handling: "single-page-application"`, `run_worker_first` for navigations) and
  exposes data over `/api/*` JSON endpoints backed by the same Worker's D1 / R2 / AI bindings.

We **already inject per-route SEO `<head>` at the edge**: `withSpaSeo` →
`getStudioSeoMetadata` / `injectSeoIntoHtml` (`apps/web/src/studio/seo.ts`,
`apps/web/src/worker/index.ts:349`). So route-aware title / description / canonical / OG tags exist
today **without** SSR. That removes the usual headline reason for SSR and isolates the reason that
is real for us.

### The one benefit specific to this app

The renderer and the database would live in the **same Worker**. Today a content page runs:

```text
HTML shell -> download JS -> boot React -> browser fetch /api/... -> render
```

That `/api/...` step is a full browser->Worker network round-trip to a Worker that **already holds
the D1 binding in-process**. Under SSR, a route loader runs server-side and reads D1 directly
(`createD1ServingDb(env.DB)` + the existing `@bp/db/d1` query functions the API handlers already
call, e.g. `getRouteScorecard`, `listRouteBriefSummaries`). The network hop collapses into an
in-process read, and HTML arrives with data already in it. This is a direct **LCP/FCP** win on the
data-heavy public pages and a waterfall we cannot remove on the client.

### Secondary benefits

- **Body-content crawlability.** Edge injection covers `<head>`; the page *content* (scorecard
  numbers, brief prose) is still absent from initial HTML, so non-JS consumers (link unfurlers, LLM
  scrapers, stricter crawlers) see an empty root. SSR puts real content in the HTML.
- **Pre-hydration readability** on slow devices.
- **Single data path.** Loaders call `@bp/db` query functions directly instead of duplicating fetch
  logic against `/api/*`.

### What SSR does NOT buy us (so we size it honestly)

- It does **not** shrink the bundle. We still ship and hydrate the same JS; the
  `web_observability_performance_seo_plan.md` JS budget is unchanged and total bytes may grow
  (HTML + serialized loader state + JS).
- It adds **React server-render CPU on the request path** of a Worker that already runs `/api/*`,
  two cron triggers, and the `BriefAuthorAgent` Durable Object. Brushes against the CLAUDE.md rule
  about keeping work off the public request path (modest for render, but real).
- **Client-only surfaces gain nothing**: `maplibre-gl` maps and the authenticated/interactive studio
  (`account`, `admin.identities`, `signin`, authoring composer) get complexity, not payoff.
- Introduces **hydration mismatch** as a new bug class.

## Deployment topology: one worker vs. two workers

SSR and the worker topology are **orthogonal** — decide them separately:

- **Splitting workers** buys: a least-privilege public surface, independent deploys, smaller per-worker
  bundles, and an API that becomes a real product with its own contract. No rendering change required.
- **SSR** buys: LCP + body-content SEO on content pages.

They compose, and either can ship first.

### API package before API app

Before adding a second deployed Worker, extract the current `/api/*`, auth, authoring, source-refresh,
and agent runtime into `packages/studio-api`. This is useful whether SSR ships or not:

```text
current apps/web Worker
  -> assets + SPA fallback + edge SEO
  -> packages/studio-api handles /api/*
  -> packages/studio-api handles scheduled refresh
  -> packages/studio-api exports BriefAuthorAgent
```

That package-first step keeps SSR optional. If SSR is rejected, the existing SPA still gets a
smaller Worker and cleaner API tests. If SSR is approved, an `apps/api` Worker can become a thin
wrapper around the already-extracted package, while the site Worker focuses on rendering and
read-only serving. See [[wiki/engineering/studio_api_refactor_plan|Studio API Refactor Plan]].

### Key enabling fact

**A D1 database binds to multiple Workers** — the binding is a reference, not ownership. So a separate
site worker can read D1 **directly** in its SSR loaders while the API worker also binds the same DB.
Splitting therefore does **not** cost the SSR LCP win: that win is from avoiding the *browser*→Worker
hop, not from co-location with the API. An SSR loader → D1 binding call is in-process in whichever
worker runs it.

### Option A — single worker (lighter)

Keep one worker; wrap, don't replace. `apps/web/src/worker/index.ts` already owns `/api/*`, cron
`scheduled()`, the `BriefAuthorAgent` DO export, and the asset/SEO fallback. Start's render handler
becomes the branch that today is `serveSpaFallback`. Fewest moving parts; no routing/cookie changes.

### Option B — two workers (preferred direction, 2026-06-04)

- **API / data worker** (today's worker, slimmed): `/api/*`, `scheduled()` cron, `BriefAuthorAgent`
  DO, the `AI` binding, and **read+write** D1/R2. System of record.
- **Site worker** (new, SSR + assets): binds D1 **read** and R2 **read**, used only by SSR loaders.
  No `AI`, no cron, no DO, no write. Public surface shrinks to "render + read."

Decisions inside Option B:

- **Direct-to-D1 vs. service binding for SSR reads.** Direct-to-D1 (site worker binds D1 read) is
  simplest and fewest hops. Alternative: a **service binding** site→API (Worker-to-Worker RPC, stays
  on Cloudflare's network, sub-ms, no CORS) so the site worker holds *zero* DB bindings and the API
  worker stays the single DB owner — purer least-privilege at the cost of one in-network hop. Both
  preserve the SSR win.
- **Stay same-origin (decisive).** The session is a `SameSite=Lax; HttpOnly; Secure; Path=/` cookie
  (`bp_session`, `apps/web/src/worker/index.ts:5342`). Path-route `/api/*` to the API worker under one
  hostname (or have the site worker forward `/api/*` to the API worker via the service binding). Do
  **not** move the API to an `api.*` subdomain — that forces cross-site cookies (`Domain=.`,
  `SameSite=None`) plus credentialed CORS, more config and a small security loosening.
- **Cross-script DO** is available if ever needed: a worker can bind a DO namespace whose class lives
  in another worker via `script_name`. The SSR site should not need the author agent, so it binds no DO.
- **Shared logic is a non-issue.** Both workers already depend on the `@bp/db` and `@bp/domain`
  workspace packages, so the split is about which handlers + bindings live where, not duplicated query
  code.

Tradeoff: Option B is more infra (two `wrangler` configs, a routing rule, two deploys). Justified by
the least-privilege public surface, independent iteration, and a clean service split to show for the
portfolio — but name it, per the CLAUDE.md simplicity bias.

## Recommended shape: SSR the content routes only

TanStack Start (same team as TanStack Router, SSR-native, Vite-based) is the natural target under
either topology. The constant commitment is **per-route opt-in**: SSR only the public, data-driven,
shareable routes; leave the studio and map-heavy routes client-rendered.

### Route split (from the canonical public matrix)

| Route | SSR candidate? | Why |
|---|---|---|
| `/`, `/findings`, `/findings/$`, `/briefs`, `/briefs/$`, `/compare`, `/routes/$`, `/methods`, `/docs` | **Yes** | Public, D1/R2-backed, shareable content; LCP + body-SEO win |
| `/search` | Maybe | Query-driven; SSR first paint optional |
| `/account`, `/admin.identities`, `/signin`, `/auth.consume`, studio authoring composer | **No** | Personalized/interactive; no SEO value, hydration cost |
| Anything embedding the MapLibre map | **No (client-only)** | `maplibre-gl` cannot meaningfully SSR; render in a `ClientOnly` boundary |

## What the migration touches

### 1. Entry points (new + changed)

- **`apps/web/src/router.tsx`** — keep `createRouter`, but the factory must be callable per-request
  on the server (fresh router per request, no module-level singleton for the SSR path). Client keeps
  a singleton.
- **New client entry** — replace `createRoot(...).render(<RouterProvider/>)` in
  `apps/web/src/main.tsx` with Start's hydration (`hydrateRoot` via `StartClient`). The
  `installRouterEventObservers` / web-vitals reporters stay; they just attach after hydrate.
- **New server entry** (e.g. `apps/web/src/entry-server.tsx`) — Start's request handler
  (`createStartHandler` + `defaultStreamHandler`) that renders the matched route tree to an HTML
  stream.
- **`apps/web/index.html`** — the empty `#root` shell is replaced by Start's document/shell so SS'd
  markup lands inside it; the existing `<head>` font preconnect/preload stays.
- **`apps/web/vite.config.ts`** — add the TanStack Start Vite plugin alongside the existing
  `tanstackRouter` (`autoCodeSplitting`), `react`, `tailwindcss`, and `cloudflare` plugins. Confirm
  ordering with the Start + Cloudflare plugin guidance.

### 2. The worker request flow (asset / SSR / API)

Today's navigation flow (single worker):

```text
fetch() -> canServeSpaFallback() -> serveSpaFallback() -> ASSETS.fetch() -> withSpaSeo() (inject <head>)
```

**Option A target (single worker)** — the SSR branch slots into the existing `fetch()`:

```text
fetch()
  -> isApiPath()            -> existing /api handlers          (unchanged)
  -> isProductionClosedPath -> 404 for /system in prod         (unchanged)
  -> navigation + SSR route -> Start SSR handler (reads D1/R2 directly, streams HTML)
  -> navigation + CSR route -> serveSpaFallback()/withSpaSeo()  (unchanged shell path)
  -> static asset           -> ASSETS.fetch()                  (unchanged)
```

**Option B target (two workers):**

```text
API/data worker  fetch()  -> /api/* handlers, scheduled(), BriefAuthorAgent DO   (D1/R2 read+write, AI)
site worker      fetch()  -> navigation + SSR route -> Start SSR handler -> D1 read (direct binding)
                          -> navigation + CSR route -> serveSpaFallback()/withSpaSeo()
                          -> static asset           -> ASSETS.fetch()
                          -> /api/*                 -> path-routed to API worker (or service-binding forward)
```

Key points (both options):

- `run_worker_first` in `wrangler.jsonc` already routes every navigation through the worker, so the
  SSR branch slots in without changing asset routing. Keep `!/assets/*`, `!/index.html`, etc.
  exclusions.
- **SEO de-duplication.** SSR'd routes produce their own `<head>`, so `withSpaSeo`/`injectSeoIntoHtml`
  must **not** also rewrite those responses (double meta). Decide ownership per route: SSR routes own
  their head via route `head()`; CSR routes keep edge injection. `getStudioSeoMetadata` /
  `PUBLIC_STUDIO_ROUTES` becomes the shared source the route `head()` reads from, so metadata stays
  defined in one place.
- **Bindings into loaders.** The SSR handler needs the Cloudflare `env` (D1 read; R2 read). Pass
  `env`/`ExecutionContext` into the Start handler per request (request-scoped context), not a module
  global — Workers have no ambient process env.

Option-specific:

- **Option A:** `scheduled()`, the `BriefAuthorAgent` DO export, and the `AI` binding stay in the one
  worker alongside SSR.
- **Option B:** `scheduled()`, the DO export, and `AI` move to the API/data worker. The site worker's
  `wrangler` config keeps only D1 **read** + R2 **read** + `ASSETS`, plus the `/api/*` route or a
  service binding to the API worker. Keep `/api/*` same-origin to preserve the `SameSite=Lax`
  `bp_session` cookie (no CORS).

### 3. Which loaders move server-side

These are **new** TanStack Router `loader`s on the SSR routes; today these routes fetch in-component
or via client loaders against `/api/*`. The win is calling the **same `@bp/db/d1` functions the
Worker API already imports**, so there is little new query code:

| Route | Server loader reads | Existing function to reuse |
|---|---|---|
| `/routes/$routeId` | route scorecard | `getRouteScorecard(createD1ServingDb(env.DB), ...)` |
| `/findings`, `/findings/$` | findings/brief summaries | `listRouteBriefSummaries`, `getRouteBriefSummary` |
| `/briefs`, `/briefs/$` | published brief projections | existing brief-draft/serving reads in `@bp/db/d1` |
| `/compare` | comparison ranks | `listRouteComparisonRanks`, `buildStudioCompareProjection` |
| `/` | landing summaries | `listCorridorSummaries`, `listRouteReadiness` |

Rule: a loader returns only serializable data (it ships to the client as hydration state). Keep R2
blob/large-array work out of the loader payload — reference by id, fetch lazily, same discipline as
`web_app_support_plan.md`'s deferred-evidence policy.

The `/api/*` endpoints **stay** — they back client-side navigations after hydration, external
callers, and the smoke/Lighthouse harness. SSR loaders and `/api/*` handlers should call the same
`@bp/db` functions so there is one query path, two transports.

## Phasing

Because the split and SSR are orthogonal, prefer a sequence that isolates each risk. The
**split-first** order de-risks the topology before touching rendering:

0. **Extract `packages/studio-api` while still SPA.** Move API helpers, Studio read endpoints, draft
   authoring endpoints, source refresh, and `BriefAuthorAgent` exports behind a package boundary.
   The existing `apps/web` Worker remains the only deployed Worker and delegates to the package.
   Decision gate: Worker tests still pass and the web Worker is mostly composition logic.
1. **(Option B only) Split the worker while still SPA.** Add an API/data worker only if the package
   extraction proves clean and a topology split is still desired. The site worker owns assets + SPA
   shell + edge SEO + `/api/*` same-origin route/service-binding forward; the API worker owns
   `/api/*`, cron, DO, and AI. No rendering change. Decision gate: cookies, routing, and two deploys
   all work; `bp_session` survives same-origin.
2. **Spike SSR on one route (`/findings` or `/routes/$`).** Stand up Start, SSR exactly one route,
   measure p75 LCP vs the current CSR path with the existing Lighthouse matrix
   (`bun run check:web-performance`). Decision gate: real LCP delta on a 3G/mobile profile.
3. **Generalize the SSR branch**; move the content-route table above to server loaders (direct D1 read
   on the site worker); split SEO ownership (SSR head vs edge injection).
4. **Harden hydration**: wrap map/interactive widgets in `ClientOnly`; fix mismatches; confirm the
   studio/auth routes still CSR cleanly.
5. **Write the ADR** recording the chosen topology (one worker vs. two), the per-route SSR boundary,
   and the read-only-D1-on-the-site-worker decision once the spike proves the LCP win.

If sticking with Option A, still do step 0; skip step 1.

## Verification

- `bun --filter @bp/web build` then `bun --filter @bp/web test:worker` (worker request-routing tests
  must still pass; add cases for the SSR branch + the no-double-SEO rule).
- `bun run build:studio-release && bun run serve:web-smoke` then the canonical-route smoke + the
  Lighthouse matrix from `web_observability_performance_seo_plan.md` — compare LCP/transfer before
  and after on the spike route.
- `bun run check:types` (scoped; repo-wide check is known to OOM at default heap).

## Open questions

- **Topology: one worker (A) or two (B)?** Leaning B for the least-privilege public surface and
  independent deploys, accepting the extra `wrangler`/routing config. A is the fallback if Start
  insists on owning `fetch`.
- Does TanStack Start's current Cloudflare integration cleanly co-exist with a hand-written worker
  entry (Option A needs it to share `fetch` with `/api/*` + cron + DO; Option B's site worker can let
  Start own `fetch` since the API worker is separate)? Spike must answer this.
- **Direct-D1 vs. service-binding for SSR reads** on the site worker — fewest hops vs. zero DB binding
  on the public surface. Decide with the spike's latency numbers.
- Streaming vs blocking render under Workers CPU limits for the heaviest pages (`/compare`).
- Whether the LCP win survives once serialized loader state is added to total transfer.

## Related

- `web_observability_performance_seo_plan.md` — LCP/INP/CLS targets, Lighthouse route matrix, JS
  budget, the smoke/audit harness this plan verifies against.
- `web_app_support_plan.md` — TanStack Router data-loading policy, route-loader caching, deferred
  evidence payloads.
- `web_api_endpoint_architecture.md` — the `/api/*` contract SSR loaders share query code with.
- `map_strategy.md` — why the map stays client-only under any SSR split.
