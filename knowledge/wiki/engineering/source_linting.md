---
title: Source Linting
type: engineering
status: active
last_updated: 2026-04-26
owner: codex
source_count: 0
tags: [lint, sources, qa]
---

# Source Linting

## Purpose

Prevent the project from making unsourced or stale claims.

## Required checks

For every dataset/API:

- Source URL present.
- Dataset ID present if Socrata.
- Metadata fetched and stored in `raw/metadata/`.
- Column list stored.
- Row count stored.
- Last-updated date stored if available.
- Wiki data page updated.
- Source status not `needs_schema_probe` for core sources before app metrics are published.

For every narrative claim:

- Source URL listed in `Sources` section.
- `verified_at` date included.
- If claim is computed, code/table/query path included.

For every generated route brief:

- Source data snapshot date.
- Metric computation date.
- Caveats section.
- No MTA endorsement language.

## Failure states

- Missing schema for core dataset: block implementation claims.
- Missing source for official MTA claim: block memo generation.
- Missing route geometry QA: block maps.
- Realtime endpoint served directly to users: block deployment.
