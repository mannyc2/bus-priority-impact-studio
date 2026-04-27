# 0001 — Bun-first TypeScript/Zod/testing toolchain

Date: 2026-04-27

## Decision

Use Bun as the local package manager, workspace runner, script runner, and default test runner for the MVP. Use Zod v4 for runtime contracts at data boundaries. Use strict TypeScript plus Biome for static checks. Use Cloudflare's Vitest Worker pool only for Worker runtime harnesses.

## Why

The MVP is a TypeScript web app plus local TypeScript data pipeline. A Bun-first repo keeps local development to one primary tool while preserving Cloudflare compatibility. Cloudflare Workers still execute in `workerd`; Bun is not the deployed Worker runtime.

## Consequences

- Root package versions live in the Bun catalog in `package.json`.
- `pnpm-workspace.yaml` is removed.
- Fast package/source tests use `bun test`.
- Worker production-behavior smoke tests use Vitest with `@cloudflare/vitest-pool-workers`.
- Pre-push hooks run docs-only checks for wiki changes and code checks for code/config changes.
- Add Python, Postgres/PostGIS, or a VPS only after a documented requirement forces escalation.
