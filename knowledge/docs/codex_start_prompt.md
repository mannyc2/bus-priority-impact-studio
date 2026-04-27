# Codex Start Prompt

Paste this into Codex after opening the repo root:

```text
Read CLAUDE.md, AGENTS.md, knowledge/index.md, knowledge/wiki/project/overview.md, knowledge/wiki/project/managed_services_options.md, knowledge/wiki/engineering/package_structure.md, and knowledge/raw/source_manifest.yaml.

Then perform Phase 0 from knowledge/wiki/project/codex_roadmap.md:
1. Validate the TypeScript-only package layout.
2. Implement the smallest fixture-backed source probe in tools/pipeline.
3. Use that command to probe one Socrata source's metadata and columns.
4. Write metadata to knowledge/raw/metadata/.
5. Update knowledge/wiki/data/source_registry.md and the relevant data page with exact schema, row count, and last-updated date.
6. Append knowledge/log.md.

Do not add Python, FastAPI, hosted Postgres/PostGIS, or a VPS.
```

Follow-up prompt after Phase 0:

```text
Build the smallest M1-route MVP. Use tools/pipeline and packages/sources to ingest MTA Bus Route Segment Speeds for route M1 for the latest complete month available, current bus routes/stops, and route/hour ridership if available. Use packages/analytics to construct hotspot outputs and a route scorecard. Use packages/db to generate D1 seed data and apps/web to show one route scorecard page with citations and caveats. Keep heavy computation local and do not import pipeline/analytics code into public request handlers.
```
