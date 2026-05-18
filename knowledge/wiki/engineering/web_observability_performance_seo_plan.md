---
title: Web Observability, Performance, and SEO Plan
type: engineering
status: active
last_updated: 2026-05-18
owner: codex
source_count: 2
tags: [frontend, observability, lighthouse, seo, cloudflare, web-vitals]
---

# Web Observability, Performance, And SEO Plan

## Purpose

The next website phase needs two feedback loops:

1. Lab checks that tell us whether a route is fast, indexable, accessible, and SEO-safe before a
   release.
2. Production telemetry that tells us how fast real users experience the route-first Studio after it
   is deployed.

Do not treat a Lighthouse score as the whole SEO story. Lighthouse is a controlled lab audit. Core
Web Vitals field data and crawlable page metadata are the release signals that matter most.

## Targets

Use these targets for the public website:

| Signal | Target | Notes |
|---|---:|---|
| LCP | p75 under 2.5s | Real-user field data, split mobile/desktop |
| INP | p75 under 200ms | Real-user field data; Lighthouse cannot directly measure INP |
| CLS | p75 under 0.1 | Real-user field data |
| Lighthouse Performance | 90+ mobile, 95+ desktop | Lab release gate, not an SEO guarantee |
| Lighthouse SEO | 100 on public pages | Catch crawlability/meta/link mistakes |
| Lighthouse Accessibility | 95+ | Do not regress semantics while iterating |
| Route JS budget | Keep main app chunk under 325 kB gzip until API-backed pages stabilize | Revisit after real map/evidence modules land |
| Route smoke | Every canonical public route returns 200, `/system` excluded from production | Run after build/preview |

The route-first pages are content-heavy enough that HTML metadata matters. Each public route should
have a useful title, description, canonical URL, and crawlable body text even before richer evidence
modules hydrate.

## Measurement Layers

### 1. Existing Navigation Marks

The app already has `apps/web/src/router-events.ts`, which marks:

- `bp:navigation:start`
- `bp:navigation:rendered`
- `performance.measure("bp:navigation")`

Keep this. It is useful for route-to-route transitions and can feed a debug overlay or beacon later.

Immediate task:

- Add route id, from/to path, and whether the navigation used a view transition to the emitted
  custom events.
- Keep event payloads JSON-compatible.

### 2. Lab Audits

Run Lighthouse against the production build and the projection-backed smoke server, not Vite dev:

```bash
bun --filter @bp/web build
bun run build:studio-release
bun run serve:web-smoke
BP_RUN_LIGHTHOUSE=1 BP_LIGHTHOUSE_URL=http://127.0.0.1:4173 CHROME_PATH=/path/to/chrome bun run check:web-performance
```

The performance check audits the canonical public route matrix when `BP_RUN_LIGHTHOUSE=1`:

```text
/
/search?q=manhattan+ace
/routes/m15-sbs
/routes/m15-sbs/ladder
/compare
/findings
/findings/m15-full-treatment-still-declining
/briefs
/briefs/m15-madison-corridor
/briefs/m15-madison-corridor/evidence
/methods
/docs
```

Do not include `/system` in production Lighthouse gates. It is dev-only.

Current enforceable Lighthouse thresholds:

- Desktop performance: 0.95+
- Accessibility: 0.95+
- Best practices: 0.95+
- SEO: 1.00

Artifacts should be written under:

```text
data/artifacts/web-audits/<timestamp>/
```

Write a compact summary JSON:

```ts
type LighthouseRouteSummary = {
  path: string;
  device: "mobile" | "desktop";
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  largestContentfulPaintMs: number | null;
  totalBlockingTimeMs: number | null;
  cumulativeLayoutShift: number | null;
  transferSizeBytes: number | null;
  scriptBytes: number | null;
  passed: boolean;
};
```

Run mobile first, desktop second. Mobile is the stricter release signal.

### 3. SEO Crawlability Checks

Add a lightweight static/preview check alongside Lighthouse:

- Every public route has a non-empty `<title>`.
- Every public route has a unique meta description.
- Root has canonical product copy.
- Route, finding, and brief pages include route/finding/brief names in title and visible body text.
- `/system` returns not-found in production or is excluded from the production route tree.
- No public page title says "Design System" except dev.
- No page ships accidental fixture/debug labels such as `TODO`, `lorem`, or `system gallery`.
- Static assets use cacheable hashed filenames.
- Response headers for HTML are not immutable; response headers for hashed assets are immutable.

Structured data is not required for the next release, but leave room for:

- `WebSite` on `/`
- `Dataset` for `/methods`
- `Article` for public route briefs after citations are real

### 4. Production Field Telemetry

Do not write high-cardinality web-vital events to D1.

Phase 1 should use no new storage:

- Cloudflare request logs and Worker logs for request status/duration.
- Existing browser performance marks for local debugging.
- Lighthouse artifacts committed only when intentionally small; otherwise keep under ignored
  `data/artifacts/`.

Phase 2 can add custom Real User Monitoring if needed:

- Client samples Web Vitals and route navigation measures.
- Client sends `navigator.sendBeacon("/api/v1/observability/web-vitals", payload)`.
- Worker validates a small Zod payload and writes to a proper event sink.
- Preferred event sink is Cloudflare Analytics Engine or another Cloudflare-native analytics product,
  not D1. If we add that managed service, record the decision in `docs/decisions/` and
  `knowledge/log.md`.

Proposed RUM payload:

```ts
type WebVitalEvent = {
  schemaVersion: 1;
  routeId: string;
  path: string;
  metric: "LCP" | "INP" | "CLS" | "TTFB" | "NAVIGATION";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  navigationType?: "navigate" | "reload" | "back-forward" | "route-transition";
  viewport: { width: number; height: number };
  connection?: { effectiveType?: string; saveData?: boolean };
  release: { gitCommit: string; baselineMonth: string };
};
```

Sampling rule:

- Start at 10% of sessions.
- Always sample local/dev only when `localStorage.bpDebugVitals = "1"`.
- Never include full URLs with private query strings; send route ids and sanitized paths.

### 5. Worker/API Observability

For API endpoints, add structured logs and `Server-Timing`:

- `route`: route template, not raw path.
- `status`: HTTP status.
- `durationMs`: total handler time.
- `d1Ms`: repository time when measured.
- `r2Ms`: artifact read time when measured.
- `cache`: hit/miss/revalidated when available.
- `requestId`: `cf-ray` or generated request id.
- `baselineMonth`: active release month.

Add `Server-Timing` headers for local and production debugging:

```text
Server-Timing: app;dur=12, d1;dur=4, r2;dur=0
```

Do not log API keys, raw source URLs with secrets, or per-user identifiers.

## Immediate Implementation Tasks

Current slice:

- Added `check:web-release`, which builds the web app and runs `check:web-seo` plus
  `check:web-performance`.
- Added `check:web-seo` for the canonical public route matrix, unique title/description metadata,
  canonical links, hashed assets, and `/system` noindex behavior.
- Added `check:web-performance` for built-asset budgets and a compact summary JSON under
  `data/artifacts/web-audits/latest/performance-budget.json`.
- Added Worker edge injection for crawlable title/meta/canonical tags on SPA deep links.
- Closed `/system` in production Worker fallback with `404` and `X-Robots-Tag: noindex`.
- Added a debug-only browser performance reporter that logs route navigation timing, LCP, and CLS in
  dev or when `localStorage.bpDebugVitals = "1"`.

Next:

1. Split Worker `Server-Timing` into app/D1/R2 phases as the Studio projection generator moves from
   local seed input to D1/R2 sources.
2. Add structured Worker API logs with route templates and request ids.
3. Add production RUM endpoint only after deciding the event sink; do not put raw RUM in D1.

## Release Gate

A website release should not be promoted until:

- `bun run check:types`
- `bun run check:style`
- `bun run test:web`
- `bun --filter @bp/web build`
- `bun run check:web-seo`
- `bun run check:web-performance`
- Worker tests for touched API/observability code

If Lighthouse fails but the route is intentionally blocked by missing API data, the route should show
a designed unavailable state and the failure should be documented in the summary JSON. Do not
silently waive SEO or accessibility failures.

## Sources

- web.dev, "Web Vitals" — https://web.dev/articles/vitals — Core Web Vitals use LCP, INP,
  and CLS; good thresholds are evaluated at the 75th percentile of page loads, segmented by mobile
  and desktop.
- web.dev, "Largest Contentful Paint" — https://web.dev/articles/lcp — LCP target is under 2.5
  seconds for most users; web-vitals library is the recommended browser measurement path when custom
  field collection is needed.
