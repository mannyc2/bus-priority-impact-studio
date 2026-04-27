# packages/sources

Source adapter layer.

## Responsibilities

- Socrata metadata and sample-row probes.
- MTA developer feed clients.
- Source manifest loading and source snapshot metadata.
- DTO parsing for raw public datasets.

## Rules

- Network access is allowed here and in `tools/pipeline`, not in `packages/domain`.
- Keep functions small and fixture-testable.
- Do not compute route scores here; return source data or normalized rows.
