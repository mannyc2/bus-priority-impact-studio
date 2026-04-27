# data/

Local generated data and fixtures.

## Directories

- `raw/` — downloaded public datasets for local work. Gitignored except `.gitkeep`.
- `working/` — intermediate local outputs. Gitignored except `.gitkeep`.
- `artifacts/` — generated serving artifacts such as GeoJSON, route briefs, and D1 seed SQL. Gitignored except `.gitkeep`.
- `fixtures/` — small test fixtures that are safe to commit.

Do not store the LLM wiki here. The wiki lives in `knowledge/`.
