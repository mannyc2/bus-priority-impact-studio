# packages/analytics

Deterministic analytics layer.

## Responsibilities

- Clean source rows.
- Build segment-speed aggregates.
- Construct hotspot outputs.
- Compute route scores.
- Build ACE/bus-lane comparison inputs.

## Rules

- This package is for local batch compute, not public request handlers.
- Prefer deterministic SQL/TypeScript over LLM output.
- Keep heavyweight joins and artifact generation outside `apps/web`.
