# Claude Code project setup

This directory contains project-scoped Claude Code configuration.

## Standalone skills

- **`react-best-practices`** — Vercel Labs React performance rules (70+ rules, 8 priority tiers).
- **`composition-patterns`** — Vercel Labs React composition patterns (compound components, explicit variants, state lifting).

## Type discipline

Type rules are documented in `knowledge/wiki/engineering/package_structure.md` under the "Type discipline" section. In short:

- Domain types and Zod schemas live in `packages/domain`.
- DB row types live in `packages/db`.
- Source DTO schemas live in `packages/sources`.
- Component files may define unexported local `Props` types only.
- Prefer `type` over `interface`. No `any` — use `unknown` at boundaries and parse with Zod.
