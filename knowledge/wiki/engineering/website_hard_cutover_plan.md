---
title: Website Hard Cutover Plan
type: engineering
status: active
last_updated: 2026-05-18
owner: codex
source_count: 4
tags: [frontend, api, cli, design-system, tanstack-router, react]
---

# Website Hard Cutover Plan

## Why this exists

The exported design bundle is an entire new product shape, not a visual refresh of the current
map-led app. The current frontend grew around a floating MapLibre panel, hotspot filters, and
fixture-backed route panels. The new product is a route evidence studio: routes are the atomic unit,
maps are evidence, findings are AI-surfaced but source-backed, and briefs are the output.

This cutover should be hard. Do not keep legacy panels, fixture fallbacks, or map-first navigation as
alternate paths.

Hard means:

- No production page keeps a legacy endpoint fallback.
- No production page catches an API miss and renders sample/demo data.
- No production route imports dev fixtures once its Studio API exists.
- No production Worker Studio handler imports the local Studio seed; it must read the versioned
  release artifact or D1/R2 serving projections and fail closed when they are missing.
- Existing non-Studio `/api/v1/*` endpoints may survive temporarily for compatibility, but they are
  not the frontend contract.
- Missing data is a designed unavailable state from the Studio API, not a client fallback.

## Source Of Truth

Primary reference bundle:

```text
/tmp/bp-design-system/bus-priority-impact-studio/project/
```

Reference files to port:

| File | Screens |
|---|---|
| `route-first.jsx` | Routes home, route detail, brief reading view |
| `search-results.jsx` | Search results |
| `ladder.jsx` | Route ladder / interactive segment view |
| `compare.jsx` | Side-by-side route comparison |
| `findings.jsx` | Findings feed, finding detail |
| `authoring.jsx` | Annotation flow, claim composer |
| `brief-lifecycle.jsx` | Review comments, version history diff |
| `data-page.jsx` | Methods/data/caveats/glossary |
| `states.jsx` | Route loading and empty states |
| `system.jsx` | Shared visual primitives now represented by flat composites in `apps/web/src/components` |

Important user intent from the design chats:

- Route-first won. The home page is search-first with a ranked routes-needing-attention list.
- The map is not the homepage. Maps appear as evidence after a route, segment, finding, or brief is
  selected.
- The product should make analysts feel they did the work even when AI assembled the first pass.
- AI should read as evidence and reasoning, not as a chatbot. The attribution glyph is `◆`.
- The canonical AI doctrine lives in [[wiki/project/ai_interaction_model|AI Interaction Model]].
- Methods/data/credits belong on a real page, with source callouts near specific charts only when
  they earn their place.
- Docs should serve humans and agents equally, with left sidebar navigation, friendly explanatory
  copy, API reference, changelog, data credits, and quickstart/code examples.

## Canonical Routes

| Route | Design source | Purpose |
|---|---|---|
| `/` | `RF_Home` | Search-first route entry and AI-ranked routes needing attention |
| `/search` | `RF_SearchResults` | Grouped results for routes, segments, briefs, and methodology |
| `/routes/$routeId` | `RF_RouteDetail` | Route detail, AI diagnosis, KPI strip, slow segments, interventions |
| `/routes/$routeId/ladder` | `RF_Ladder` | Interactive vertical route ladder and segment exploration |
| `/compare` | `RF_Compare` | Route vs route / positive-control comparison |
| `/findings` | `FindingsFeed` | AI-surfaced discovery feed |
| `/findings/$findingId` | `FindingDetail` | Reasoning trail and evidence behind one finding |
| `/briefs` | `BF_Gallery` plus route-first brief IA | Brief gallery |
| `/briefs/$briefId` | `RF_Brief` / `BF_Reading` | Published cited narrative |
| `/briefs/$briefId/evidence` | `BF_Evidence` | Citation/evidence drill-down |
| `/briefs/new` | `RF_Annotate` entry state | Start a brief from route/finding/search context |
| `/briefs/$briefId/edit` | `RF_Authoring` | Claim editor and evidence inspector |
| `/briefs/$briefId/review` | `RF_BriefReview` | Reviewer comments on claims/body copy |
| `/briefs/$briefId/history` | `RF_BriefHistory` | Version history and diff |
| `/methods` | `DataPage` | Datasets, qualitative sources, computed metrics, caveats, glossary |
| `/docs` | New docs page from chat 9 | API/CLI docs, quickstart, changelog, credits |
| `/system` | Ported system page | Internal design-system reference while the cutover is active |

Delete `/digest` and the old map-panel route semantics.

## Frontend Architecture Rules

Use TanStack Router file routes and route loaders. Page modules should import only the data and
components they render so route-level code splitting stays effective.

The detailed loading/composer plan lives in
[[web_app_support_plan|Web App Support Plan]]. Keep that page current when changing route loader
cache behavior, brief projections, or composer persistence.

Apply the Vercel React guidance as follows:

- Avoid broad page barrels. Keep route pages in focused files and import direct modules.
- Do not build a component with many boolean modes. Use explicit components such as
  `RouteHomePage`, `RouteDetailPage`, `BriefReviewPage`, and `DocsPage`.
- Lift shared page/chrome state into a provider only when multiple siblings need it. The shell
  should not know page implementation details.
- Keep static sample/reference data outside render functions. Build maps/sets once at module scope.
- Enable TanStack Router structural sharing at the router and use `select` for `useParams`,
  `useSearch`, and `useRouterState` subscriptions so route wrappers re-render only when the field
  they consume changes.
- If a selector returns an object, keep it JSON-compatible and opt into structural sharing for that
  hook unless the router default already covers it.
- Prefer loader-level parallel fetches once API endpoints exist. Do not fetch serially in page
  components.
- Pass TanStack Router `abortController.signal` into Studio API client fetches so outdated
  navigations cancel in-flight requests.
- Use route-specific `staleTime` and narrow `loaderDeps` for Studio projections instead of relying
  on the default `staleTime: 0` everywhere.
- Defer slow, non-critical brief evidence/history and map-heavy payloads so the page shell can
  render before secondary panels resolve.
- Derive state during render for simple filters/sorts; do not mirror derived state in effects.
- Keep MapLibre dynamically contained in evidence/map modules, not in the global shell bundle.

View transition posture:

- Current React package does not export React's `<ViewTransition>` or `addTransitionType`.
- Use TanStack Router `viewTransition` links now and the copied CSS recipes/reduced-motion rules.
- Isolate persistent shell chrome with `viewTransitionName: "persistent-nav"`.
- When React's ViewTransition API is available in this app, add named transitions:
  - route cards/search rows to route detail: shared route badge/title
  - findings feed row to finding detail: shared finding title
  - brief card to brief body: shared brief title
  - route detail to ladder: route badge shared element

## API Direction

The new UI needs product-shaped contracts, not just compact route cards. The detailed plan lives in
`knowledge/wiki/engineering/web_api_endpoint_architecture.md`. Add schema-first contracts to
`packages/domain` and keep Worker handlers in `apps/web/src/worker`.

The public surface should be RESTful. D1 rows and R2 object keys are private serving details, not
API resources. The backend should materialize versioned Studio projections from D1/R2 in the Bun
pipeline, publish those projections to R2, and let the Worker map `/api/v1/studio/*` URLs to the
private projection keys. Do not expose `/api/v1/r2/*`, `/api/v1/studio/objects/*`, or projection-key
URLs as client contracts.

`bun run build:studio-release` is pipeline-owned. It uses the D1 serving export plus generated
route-slice artifacts to write the R2 projection tree consumed by the Worker. The web app may keep
`studio/sample-data.ts` for dev/test contract fixtures, but the release script path must not import
it.

Read API:

| Endpoint | Contract |
|---|---|
| `GET /api/v1/studio/routes` | Search/home cards, attention ranking, route metadata |
| `GET /api/v1/studio/search?q=` | Grouped route/segment/brief/methodology results |
| `GET /api/v1/studio/routes/:routeId` | Route detail payload with KPIs, AI diagnosis, segments, interventions |
| `GET /api/v1/studio/routes/:routeId/ladder` | Ordered segment ladder with treatments and hourly severity |
| `GET /api/v1/studio/compare?a=&b=` | Symmetric comparison payload with deltas and evidence summaries |
| `GET /api/v1/studio/findings` | AI-surfaced finding cards |
| `GET /api/v1/studio/findings/:findingId` | Finding detail and reasoning trail |
| `GET /api/v1/studio/briefs` | Brief gallery |
| `GET /api/v1/studio/briefs/:briefId` | Brief narrative, claims, citations, evidence refs |
| `GET /api/v1/studio/methods` | Dataset cards, metric definitions, caveats, glossary |
| `GET /api/openapi.json` | Generated public OpenAPI schema |

Composing API:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/studio/briefs` | Create a draft brief from route/finding/segment context |
| `POST /api/v1/studio/briefs/:briefId/claims` | Add a claim |
| `PATCH /api/v1/studio/briefs/:briefId/claims/:claimId` | Edit claim text/evidence/caveats |
| `POST /api/v1/studio/briefs/:briefId/generate` | Deterministic staged draft generation |
| `POST /api/v1/studio/briefs/:briefId/reviews` | Add review comment/request changes |
| `GET /api/v1/studio/briefs/:briefId/history` | Version list and diff payload |

No public request handler may import analytics or source adapters. If an endpoint needs a number
that does not exist in D1/R2 yet, add a serving projection or mark the page section unavailable with
a designed empty/error state. Do not compute heavy metrics on request.

## Observability And SEO Direction

The immediate observability plan lives in
`knowledge/wiki/engineering/web_observability_performance_seo_plan.md`.

Next release gates:

- Build and run Lighthouse against the projection-backed smoke server for the canonical route
  matrix.
- Add SEO crawlability checks for titles, descriptions, production `/system` exclusion, and route
  body text.
- Add Worker `Server-Timing` and structured API logs for Studio endpoints.
- Use existing router performance marks for client navigation timing.
- Do not write raw RUM events to D1; choose a proper event sink before adding production web-vitals
  beacons.

## CLI And Docs Direction

Follow the Cloudflare-style pattern from chat 9. The full spec lives in
`knowledge/wiki/engineering/generated_cli_distribution_plan.md`.

1. Define API/CLI surface in TypeScript contracts first.
2. Generate OpenAPI, docs tables, and CLI command metadata from those contracts.
3. Build a Bun-first CLI later as `apps/cli`, compiled with `bun build --compile`.
4. Publish a single release manifest that can drive npm optional platform packages, Python wheels,
   and Homebrew formulae when distribution matters.

Early commands:

```text
bpi routes list --borough manhattan --json
bpi routes get M15+ --json
bpi routes ladder M15+ --json
bpi findings list --json
bpi findings get f1 --json
bpi briefs create --route M15+
bpi briefs generate <brief-id> --json
bpi docs open
```

Command rules:

- Always support `--json`.
- Use `get`, never `info`.
- Use `--force`, never `--skip-confirmations`.
- Make local/remote execution explicit once local API mirrors exist.

Distribution rules:

- The runtime schema generates CLI source; package-manager wrappers ship only the compiled binary.
- `CliReleaseManifest` is the only contract from binaries to npm/PyPI/Homebrew renderers.
- The manifest must include schema version/commit so every release traces back to the exact source
  contract that produced it.
- macOS binaries are signed and notarized before hashes are computed.
- Linux wheel tags are blocked until the manylinux vs musllinux choice is proven in CI.
- Windows is deferred for the first release, but the manifest reserves `win32` so Scoop/WinGet can be
  added without reshaping the contract.

## Cutover Phases

### Phase 0: Shell And Route Map

- Replace `AppShell` with canonical `StudioShell`.
- Add all canonical TanStack route files.
- Replace old route components with reference-aligned page skeletons.
- Delete old map-panel routes and `/digest`.

### Phase 1: Product Read Models

- Add domain schemas for route detail, ladder, search, findings, briefs, methods, and docs metadata.
- Add Worker endpoints with D1/R2-backed payloads where serving data exists.
- Remove fixture fallback loaders from web runtime code in the same patch as the replacement loader.
- Add an architecture check that fails production runtime imports from `studio/sample-data.ts`,
  `fixtures/demo-snippets.ts`, and legacy panel/data-loader modules.

Current slice: the initial Studio contracts live in `packages/domain/src/studio-schemas.ts`,
page-shaped projection builders live in `packages/domain/src/studio-projections.ts`, the Worker
serves `/api/v1/studio/*` from versioned R2 Studio projection artifacts, production route loaders
call those endpoints directly, and architecture checks now reject production runtime imports from
sample/demo data. The local Studio seed remains only as a test/artifact-generation input. The next
Phase 1 step is generating the Studio projection artifacts from D1/R2 sources.

### Phase 2: Page Ports

- Port each reference artboard into real React pages.
- Preserve visual hierarchy and copy from the source files.
- Convert inline prototype logic into composed components and typed data.

### Phase 3: Composing Surface

- Implement draft creation, claim editing, staged generation, evidence attachment, review comments,
  and history payloads.
- Add Worker harness tests before exposing write endpoints.
- Keep composer writes feature-flagged until draft storage, auth/reviewer identity, and publish
  promotion are explicit.
- Store draft metadata/claims/comments as bounded product rows; store large body snapshots and
  publish candidates in R2.
- Never let a normal page request mutate the public March release projection.

### Phase 4: Docs And CLI Foundation

- Build `/docs` with API reference, quickstart examples, changelog, and data credits.
- Add `/api/openapi.json`.
- Add a CLI surface design package or metadata schema. Do not publish a CLI until contracts settle.

## Verification

For each phase:

- `bun run check:style`
- `bun run check:types`
- `bun run test:web`
- Worker tests for API changes
- `bun --filter @bp/web build`
- Smoke routes locally with dev server:
  `/`, `/search`, `/routes/m15-sbs`, `/routes/m15-sbs/ladder`, `/compare`, `/findings`,
  `/briefs`, `/methods`, `/docs`

Do not declare the cutover complete while old panel loaders, old fixture fallbacks, or old route
semantics are still reachable from production routes.
