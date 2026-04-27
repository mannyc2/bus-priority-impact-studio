---
title: Memo Generation
type: analysis
status: draft
last_updated: 2026-04-26
owner: codex
source_count: 0
tags: [memo, llm, route-brief]
---

# Memo Generation

## Goal

Generate route-improvement briefs that combine deterministic metrics with source-backed text.

## Brief sections

1. Executive summary.
2. Route context.
3. Performance findings.
4. Hotspot map/table.
5. Ridership/rider-impact proxy.
6. Intervention status: ACE, bus lanes, alerts.
7. Recommended next investigation.
8. Caveats and missing data.
9. Sources.

## Data contract

LLM receives a JSON payload like:

```json
{
  "route_id": "M1",
  "analysis_period": "2026-01",
  "metrics": {
    "avg_speed_mph": 6.2,
    "worst_segments": [],
    "ridership_weighted_score": null
  },
  "sources": [],
  "caveats": []
}
```

Numbers must come from code, not LLM memory.

## Tone

- Analyst memo, not marketing copy.
- Plain-language caveats.
- No official endorsement language.
- Clear distinction between “computed by this project” and “claimed by MTA source.”
