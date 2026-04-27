# Raw Source Layer

This directory stores immutable source captures and source metadata.

## Subdirectories

- `downloads/` — local-only source captures that should not be committed by default.
- `metadata/` — local generated JSON metadata and schema probes; gitignored except `.gitkeep`.
- `notes/` — manual notes from source pages or source-reading sessions.
- `assets/` — local images from clipped articles or diagrams.

## Rule

Commit source manifests, wiki summaries, notes, and small test fixtures. Keep generated probe outputs, full datasets, large API exports, GTFS zips, generated GeoJSON, and other bulky source captures local; use `data/raw/`, `data/working/`, `data/artifacts/`, `knowledge/raw/downloads/`, or `knowledge/raw/metadata/` as appropriate.
