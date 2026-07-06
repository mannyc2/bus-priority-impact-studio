# Bus Priority Impact Studio design handoff - 2026-07-04

This directory is an immutable source capture of the July 4, 2026 Bus Priority
Impact Studio design export provided by the operator as
`bus priority impact studio(4).zip`.

Use this as the current frontend design reference for audit and planning. The
older May tarbell design-pass notes are retained as historical implementation
status, not current acceptance.

Start with:

- `design-system.html` and `system.jsx` for tokens, primitives, route badges,
  shell, states, and anti-patterns.
- `verdict-compositions.jsx`, `verdict-shell.jsx`, `verdict-primitives.jsx`,
  `verdict-data.jsx`, `verdict-editorial.jsx`, and `verdict-mobile.jsx` for
  route-detail verdict direction.
- `route-public.jsx` and `route-detail-tabs.jsx` for public and analyst route
  detail references.
- `home-public.jsx`, `route-first.jsx`, and `search-results.jsx` for route
  discovery and search direction.
- `screenshots/` for visual calibration.

Do not edit files in this capture in place. Add a new dated capture for a newer
design export and update `knowledge/wiki/engineering/studio_design_pass_status.md`.
