# Plan 070: Add browser-hardening headers to Worker responses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- apps/web/src/worker/ apps/web/test/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED (an over-tight CSP can break the map or charts — the plan mitigates with an inventory step and smoke test)
- **Depends on**: plans/068-verification-baseline.md
- **Category**: security
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

The public site serves HTML with only `Cache-Control` and (sometimes)
`X-Robots-Tag`. There is no Content-Security-Policy, no
`X-Content-Type-Options`, no frame-ancestors restriction, no `Referrer-Policy`,
no HSTS. The site is read-only with no cookies or sessions, so the practical
blast radius is small — but LLM-derived corpus text renders in the UI (and more
will after plans 073-075), CSP is cheap insurance against an injected link or
markup slipping into that path, and this is a portfolio site that
security-literate reviewers will scan with observatory tools. Defense-in-depth
plus professional polish.

## Current state

- `apps/web/src/worker/index.ts` — the single Worker fetch entrypoint. All
  responses flow out of `default.fetch` via four returns: API responses
  (`handleStudioFetch`), production-closed 404s, SPA fallback
  (`serveSpaFallback`), and asset passthrough (`env.ASSETS.fetch`). Excerpt
  (lines 16-24):

```ts
export default {
  async fetch(request: Request, env: Env = {}, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (isApiPath(url.pathname)) {
      return (
        (await handleStudioFetch(request, env, ctx)) ?? new Response("Not found", { status: 404 })
      );
    }
```

- `apps/web/src/worker/spa.ts:54-63` — the only headers currently set on HTML:

```ts
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  // Local dev must never cache the SPA shell, or edits won't show without a hard reload.
  headers.set(
    "Cache-Control",
    isLocalDevHost(url.hostname) ? "no-store" : "public, max-age=60, stale-while-revalidate=300",
  );
  if (metadata.noindex) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
```

- SEO injection: `spa.ts` rewrites HTML via `injectSeoIntoHtml(...)` — before
  writing the CSP you MUST check whether it injects inline `<script>` tags
  (e.g. JSON-LD). `grep -n "script" apps/web/src/worker/*.ts apps/web/src/studio/seo*` .
- The map is maplibre-gl (WebGL; it uses `blob:` workers and `data:`/`blob:`
  images). Charts are Recharts (inline SVG styles). Tailwind is compiled CSS.
- Production host: `https://buspriorityimpact.studio` (see
  `tools/pipeline-v2/src/commands/studio/_release-seo.ts:6`,
  `SITEMAP_ORIGIN`); workers.dev host also exists. Local dev must NOT get HSTS.
- Worker tests: `bun run test:worker` (the `@bp/web` package's worker suite —
  find existing tests with `ls apps/web/test` and match their structure).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Worker tests | `bun run test:worker` | all pass |
| Web build | `bun --filter @bp/web build` | exit 0, budget check passes |
| Typecheck | `bun run check:types` | exit 0 |
| Smoke | `bun run serve:web-smoke` | serves; pages respond 200 |

## Scope

**In scope**:
- `apps/web/src/worker/index.ts` (apply a header-wrapping helper at the fetch boundary)
- `apps/web/src/worker/` — one new small module (e.g. `security-headers.ts`) or
  additions to `spa.ts`
- Worker test file(s) under `apps/web/test/` asserting the headers

**Out of scope** (do NOT touch):
- `packages/studio-api/**` — API JSON responses get the universal headers via
  the boundary wrapper in `index.ts`; do not thread headers through studio-api
  internals (plan 063 owns that file's restructure).
- Any change to caching semantics (`Cache-Control` values stay exactly as-is).
- CSP `report-uri`/reporting endpoints — no collector exists; don't add one.

## Git workflow

- Branch: `advisor/070-security-headers` off the current branch.
- One commit, e.g. "Worker: security headers on all responses (CSP on HTML)".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory what the CSP must allow

Before writing any policy, enumerate real external/inline usage:

```sh
grep -rn "https://" apps/web/src --include='*.ts' --include='*.tsx' | grep -v test | grep -v "\.md"
grep -n "script" apps/web/src/worker/spa.ts apps/web/src/studio/seo-manifest.gen.ts 2>/dev/null
grep -rn "injectSeoIntoHtml" apps/web/src/worker/
```

Record: (a) any external origins fetched by the client (tile/style/font URLs);
(b) whether SEO injection writes inline `<script>` (JSON-LD counts). These
determine `connect-src`/`img-src` and whether `script-src` needs an inline
allowance.

**Verify**: you can list every origin the app touches at runtime. If tiles or
styles load from an origin you cannot determine statically, run
`bun run serve:web-smoke`, load `/map`, and read the network log.

### Step 2: Implement the header wrapper

Create a small helper (new file `apps/web/src/worker/security-headers.ts` or a
function in `spa.ts`) and apply it to every return path in
`apps/web/src/worker/index.ts`'s `fetch` by wrapping the final response:

- On ALL responses: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`.
- On HTML responses only (Content-Type includes `text/html`):
  `Content-Security-Policy` composed from step 1's inventory. Baseline shape
  (adjust from inventory, do not copy blindly):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'<+ tile origins>; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'`.
  If step 1 found injected JSON-LD, add `'unsafe-inline'` to `script-src` OR
  (better, if trivial) note it and keep `script-src 'self'` while moving the
  JSON-LD to an allowed form — do NOT restructure SEO injection beyond a
  trivial attribute change; if it isn't trivial, use the allowance and record
  it in the maintenance note.
- HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) ONLY
  when `!isLocalDevHost(url.hostname)`.
- Never overwrite a header the response already sets (check with
  `headers.has(...)` first).

**Verify**: `bun run check:types` → exit 0.

### Step 3: Tests

Add worker tests asserting: (a) `/` HTML response carries CSP, nosniff,
Referrer-Policy, frame-ancestors (via CSP), and HSTS for a non-local host;
(b) an API JSON path carries nosniff but NOT CSP; (c) a local-dev-host request
carries no HSTS. Match the structure of the existing tests in `apps/web/test/`.

**Verify**: `bun run test:worker` → all pass, including the new tests.

### Step 4: Live smoke against the real pages

`bun run serve:web-smoke`, then in another shell:

```sh
curl -sI http://localhost:<port>/ | grep -iE "content-security|x-content-type|referrer"
```

and load `/map` and a route detail page (e.g. `/routes/M15%2B` or whatever slug
format the app uses — check `/routes` first) in the smoke browser/log.

**Verify**: headers present on HTML; the map renders (tiles + WebGL worker not
blocked); a chart renders on a route page. Any CSP violation appears in the
browser console — there must be none.

## Test plan

Covered in step 3: three new worker-test cases (HTML headers, API headers,
local-dev HSTS exemption). Model after the existing worker tests run by
`bun run test:worker`.

## Done criteria

- [ ] `bun run test:worker` exits 0 with the 3 new header assertions
- [ ] `bun --filter @bp/web build` exits 0 (perf budget unaffected)
- [ ] `bun run check:types` exits 0
- [ ] Smoke: `/`, `/map`, one route detail render without CSP console violations
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The map or charts break under every CSP variant you can compose from the
  step-1 inventory — report the exact violated directive + origin instead of
  shipping a policy with `default-src *`-class holes.
- SEO injection turns out to inject inline event handlers or dynamic script
  URLs (not just JSON-LD) — report; that needs a design decision.
- You find yourself editing `packages/studio-api` — out of scope; report.

## Maintenance notes

- Plans 073-075 add new artifact fetches; if any come from a new origin,
  `connect-src` must be extended — grep for this plan's helper when adding
  external fetches.
- If `'unsafe-inline'` landed in `script-src` for JSON-LD, a follow-up can
  replace it with a hash-based allowance; record the decision in the PR.
- Reviewer: confirm Cache-Control values are byte-identical before/after.
