# tools/pipeline

Local batch pipeline CLI.

## Responsibilities

- Probe live source schemas and write metadata.
- Fetch selected route/month data.
- Build local working datasets.
- Generate route scorecards, hotspot artifacts, and D1 seed SQL.
- Write generated artifacts to `data/artifacts/`.

## Rules

- This is allowed to be slower and heavier than the public app.
- Prefer fixture-backed tests and explicit commands.
- Do not add Python here unless the TypeScript/local-SQL path fails on a documented requirement.
