---
title: Testing Standards
type: engineering
status: active
last_updated: 2026-07-05
owner: codex
source_count: 8
tags: [testing, bun, vitest, cloudflare, effect-schema, tdd, prepush]
---

# Testing Standards

## Why this matters

Bus Priority Impact Studio should be credible as a software/data product. That means tests must verify domain contracts, source parsing, pipeline behavior, serving read models, and Cloudflare Worker request behavior. The goal is not maximal test volume. The goal is a small harness that catches mistakes Codex and humans are likely to make.

This follows the repo behavior rules in `CLAUDE.md`: think first, prefer simple changes, change surgically, and define verifiable goals before coding.

## What we know

### Facts from sources

- Bun workspaces support `workspace:*` dependencies, shared dependency catalogs, and `--filter` for workspace-scoped scripts.
- Bun's built-in test runner supports TypeScript tests, path filters, per-test timeouts, watch mode, GitHub Actions annotations, reruns, randomization, and concurrency controls.
- Bun is a local runtime/toolchain. Cloudflare Workers are deployed to Cloudflare's `workerd` runtime, and Wrangler is the Cloudflare CLI.
- Cloudflare recommends its Workers Vitest integration for Worker and Pages Functions tests; the integration runs tests inside the Workers runtime, provides runtime APIs/bindings, supports isolated per-test-file storage, and uses Miniflare locally.
- Effect Schema provides runtime contracts for decoding/encoding, transformations, branded values, tagged variants, metadata, and JSON Schema generation in the installed Effect v4 line.

### Inferences for this project

- Use Bun for dependency install, workspace scripts, source/package tests, and fast pre-push checks.
- Use Cloudflare's Vitest integration only for Worker production-behavior harnesses because Bun's test runner does not execute tests inside `workerd`.
- Use Effect Schema contracts as production contracts, not just test helpers. Tests should import the same contracts used by the Worker, source adapters, pipeline artifacts, and analytics outputs.
- Keep live-network tests opt-in. Most tests should use fixtures so pre-push is deterministic and cheap.

## Testing layers

| Layer | Command | Tool | Purpose | Runs in pre-push? |
|---|---|---|---|---|
| Type checks | `bun run check:types` | TypeScript | Strict compile-time contracts across the repo | Yes |
| Style/static checks | `bun run check:style` | Biome | Formatting, unsafe imports, explicit `any`, unused imports | Yes |
| Unit/contract tests | `bun run test:unit` | Bun test | Domain schemas, source DTO parsing, analytics math, DB serializers | Yes |
| Worker runtime tests | `bun run test:worker` | Cloudflare Vitest pool | API behavior inside Workers-compatible runtime | Yes, keep smoke-sized |
| Full check | `bun run check` | Mixed | Type + style + unit + Worker tests | CI and manual |
| Live source probes | future opt-in command | Bun pipeline | Verify public endpoints and schemas | No |

## TDD default

For behavior changes, prefer this loop:

1. Write the smallest failing test that reproduces the behavior.
2. Implement the smallest production change.
3. Run the narrowest relevant command.
4. Broaden only if the change crosses package boundaries.

Examples:

- Domain schema change: add a Bun test in `packages/domain/test/*.test.ts`, then update the schema.
- Source adapter change: add a fixture-backed test in `packages/sources/test/*.test.ts`, then parse the DTO.
- Worker API change: add a Worker harness test in `apps/web/test/**/*.worker.test.ts`, then add the handler.
- Boundary rule change: update `tests/harness/production-boundaries.test.ts`, then change imports or package responsibilities.

## Test file placement

Production source trees should stay production-only. Do not put `*.test.ts`, `*.spec.ts`, or Worker harness files under `src/`.

Use these locations:

| Code area | Test location | Runner |
|---|---|---|
| `packages/<name>/src/` | `packages/<name>/test/*.test.ts` | Bun test |
| `tools/pipeline-v2/src/` | `tools/pipeline-v2/test/*.test.ts` | Bun test |
| `apps/web/src/worker/` | `apps/web/test/**/*.worker.test.ts` | Cloudflare Vitest pool |
| Cross-cutting architecture rules | `tests/harness/*.test.ts` | Bun test |

Package tests may import from `../src/index.js` when they are validating that package's public barrel, or from a focused source module when a narrow internal behavior needs direct coverage. Avoid deep relative imports from app code.

## Effect Schema Standards

Use Effect Schema in production code for data entering or leaving package boundaries:

- Source API responses.
- Pipeline artifact inputs/outputs.
- D1 row serializers/deserializers.
- Worker JSON responses.
- Generated JSON Schema contracts.

Use these Effect Schema capabilities intentionally:

| Feature | Project use |
|---|---|
| Branded schemas | Route IDs, Socrata dataset IDs, ISO months, and other validated identifiers |
| Strict/closed object contracts | Public API responses and serving read models |
| Readonly output types | Immutable outputs such as route scorecards |
| Transformations/codecs | Boundary normalization, such as raw route-id strings to branded route IDs |
| Schema metadata/annotations | Schema documentation and auditability |
| JSON Schema generation | Generated contracts for public API and route-brief artifacts |
| Tagged variants/unions | Source manifest records when there are multiple real source kinds |

Do not wrap every function in Effect Schema. Decode at boundaries, then use typed values internally.

## Production-behavior harnesses

### Worker harness

`apps/web/test/**/*.worker.test.ts` must run under `@cloudflare/vitest-pool-workers`, not Bun test. These tests verify API behavior close to Cloudflare production behavior.

Keep this harness small:

- Health route.
- Unknown-route behavior.
- D1/R2 bindings when real local migrations and fixtures exist.
- Static-asset fallback when route pages exist.

### Architecture boundary harness

`tests/harness/production-boundaries.test.ts` uses Bun test to make import-boundary failures obvious:

- `apps/web` must not import `@bp/analytics`, `@bp/sources`, `tools/pipeline-v2`, or `knowledge/`.
- `packages/domain` must not import infrastructure or local packages.

This catches a common failure mode: accidentally moving heavy source fetching or analytics into public request paths.

### Fixture-first source harness

Source adapters should start with public-data metadata fixtures. Live probes can be added later, but they should be manual or CI-optional until rate limits and source availability are understood.

## Pre-push standard

The hook at `.githooks/pre-push` is optimized to stay enabled:

- Docs/wiki-only pushes run `bun run check:knowledge`.
- Code/config pushes run `bun run check:prepush`.
- Heavy live-network probes, historical backfills, and e2e demos do not run in pre-push.

Install it with:

```bash
bun run hooks:install
```

## Commands

```bash
bun install
bun run check:types
bun run check:style
bun run test:unit
bun run test:worker
bun run check
bun run hooks:install
```

## Caveats

- Bun is not installed in every CI/image by default; GitHub Actions must use `oven-sh/setup-bun`.
- Cloudflare Worker tests require Vitest because the official runtime harness is Vitest-based.
- The repo currently has scaffold-level tests and harnesses. Add new tests alongside real feature implementation, not speculative coverage.
- Keep dependency versions in the root Bun catalog so package-level manifests do not drift.

## Open questions

- Should route score fixtures live under each package or centralized `data/fixtures/`? Default: package-local until cross-package fixtures are needed.
- Should live Socrata probes run in CI nightly? Default: no, not until the source registry has stable probe code.
- Should pre-push run the Worker harness forever? Default: yes while it is smoke-sized; remove from pre-push if it becomes slow or flaky.

## Sources

- Bun workspaces docs — https://bun.sh/docs/pm/workspaces — verified_at: 2026-04-27
- Bun test runner docs — https://bun.sh/docs/test — verified_at: 2026-04-27
- Bun bunfig docs — https://bun.sh/docs/runtime/bunfig — verified_at: 2026-04-27
- Bun TypeScript declarations guide — https://bun.com/docs/guides/runtime/typescript — verified_at: 2026-04-27
- Effect Schema source mirror — `.agent-sources/effect/packages/effect/src/Schema.ts` — verified_at: 2026-07-05
- Effect JSON Schema source mirror — `.agent-sources/effect/packages/effect/src/JsonSchema.ts` — verified_at: 2026-07-05
- Effect Schema guide — `/home/cjpher/.codex/skills/effect-ts/references/guide-schema.md` — verified_at: 2026-07-05
- Cloudflare Workers Vitest integration docs — https://developers.cloudflare.com/workers/testing/vitest-integration/ — verified_at: 2026-04-27
