# Log

Append-only chronological log. Use the prefix format `## [YYYY-MM-DD] type | title`.

## [2026-04-26] seed | Initial LLM wiki scaffold

Created Codex-ready wiki seed for Bus Priority Impact Studio. Added project, data, engineering, analysis, template pages, source registry, source manifest, and starter scripts.

Next required action: validate source metadata and schemas with Socrata/API probes before implementation.

## [2026-04-26] research | Managed services options

Added [[wiki/project/managed_services_options|Managed services options]] decision memo covering Cloudflare, Neon, Supabase, Turso, Railway, Render, Fly.io, and a VPS baseline. Recommendation: keep heavy analytics local, serve the public MVP on Cloudflare Pages/Workers/D1/R2, and reserve Neon Postgres/PostGIS for dynamic geospatial upgrades.
## [2026-04-26] architecture | TypeScript package structure and wiki relocation

Added `wiki/engineering/package_structure.md`, moved the prior LLM wiki under repo-level `knowledge/`, added root `CLAUDE.md` and `AGENTS.md`, and updated engineering docs to use a TypeScript-only MVP with Cloudflare Workers/D1/R2 and local pipeline jobs instead of Python/FastAPI/Postgres.

## [2026-04-27] architecture | Bun-first repo basics, Zod contracts, and test harnesses

Converted the repo blueprint from pnpm-first to Bun-first, added strict TypeScript and Biome configs, scaffolded Zod v4 domain/source/DB contracts, added Bun unit tests, added a Cloudflare Worker runtime test harness, added optimized pre-push hooks, and documented the testing/TDD standards in [[wiki/engineering/testing_standards|Testing standards]].

## [2026-04-27] architecture | Explicit package barrel exports

Added a package barrel export rule: package root `src/index.ts` files must use explicit named re-exports, keep type-only exports as `export type`, and avoid wildcard or namespace re-exports so public APIs stay small and tree-shaking remains predictable.

## [2026-04-27] architecture | Test placement standard

Standardized test placement outside production `src/` trees. Package and pipeline unit tests live in sibling `test/` directories, Worker runtime tests live under `apps/web/test/`, and only cross-cutting architecture harnesses live in root `tests/`.
