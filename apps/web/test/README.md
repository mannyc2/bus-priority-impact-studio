# Web Test Layout

Keep web tests outside `src/`; production trees should not contain `*.test.ts`,
`*.spec.ts`, or Worker harness files.

Use these directories:

- `shared/` for Bun tests of pure UI helpers, generated manifests, and fixture contracts.
- `route-scorecards/` for Bun tests around route scorecard fixtures and UI-facing data shapes.
- `worker/` for Cloudflare Worker runtime tests only. These files must end in
  `.worker.test.ts` and run through `bun --filter @bp/web test:worker`.

Use Worker tests sparingly. Prefer one high-signal smoke over many mocked route
cases: real bindings, real D1 migrations, compact fixtures, and domain response
schemas at the boundary.
