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

## Commands

```bash
bun run sources:list
bun run sources:probe
bun run ingest:m1 -- --route M1 --year 2026 --month 3
bun run hotspots:m1 -- --route M1 --year 2026 --month 3
```

`ingest:m1` writes fetched route/month rows to ignored `data/raw/route-slices/` and normalized segment-speed, route, stop, and ridership outputs to ignored `data/working/route-slices/`.
`hotspots:m1` reads the normalized working slice, joins hourly ridership exposure when present, and writes ignored hotspot artifacts to `data/artifacts/route-slices/`.
