# data/

Local generated data and fixtures.

## Directories

- `raw/` — non-refetchable captures and raw handoffs for local work. Gitignored except `.gitkeep`.
- `working/` — intermediate local outputs. Gitignored except `.gitkeep`.
- `artifacts/` — generated serving artifacts such as GeoJSON, route briefs, and D1 seed SQL. Gitignored except `.gitkeep`.
- `fixtures/` — small test fixtures that are safe to commit.

Do not store the LLM wiki here. The wiki lives in `knowledge/`.

Monthly Socrata rows that have been proved in `data/local/pipeline.sqlite` should not regrow here;
re-run the relevant ingest command if recovery is needed. Keep committed fixtures small and
purpose-built.
