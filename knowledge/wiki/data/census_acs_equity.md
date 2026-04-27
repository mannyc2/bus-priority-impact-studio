---
title: Census ACS Equity Context
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 1
tags: [census, acs, equity, demographics, low-car-households]
---

# Census ACS Equity Context

## Why this matters

Equity/context layers need tract-level indicators before route catchments can be computed. The first backend artifact uses Census ACS 5-year profile data for NYC census tracts.

## Current ingest

Command:

```bash
bun run ingest:equity-context -- --year 2024
```

Live output for ACS 2024:

- `data/raw/equity/acs5-profile-nyc-tracts-2024.json`
- `data/working/equity/nyc-tract-equity-context-2024.json`
- `data/working/equity/nyc-tract-equity-context-2024-summary.json`

Summary:

- 2,327 NYC tract rows
- 8,483,844 total population
- 3,334,088 occupied housing units
- 1,844,706 no-vehicle households
- 55.33% citywide no-vehicle household share
- 50.8% median tract no-vehicle household share
- 43.7% median tract public-transit commuter share

## Variables

- `DP05_0001E`: total population
- `DP03_0062E`: median household income
- `DP03_0128PE`: poverty rate
- `DP03_0021E` / `DP03_0021PE`: public transportation commuters and share
- `DP04_0045E`: occupied housing units
- `DP04_0058E` / `DP04_0058PE`: no-vehicle households and share
- `DP05_0090PE`, `DP05_0096PE`, `DP05_0097PE`, `DP05_0099PE`: selected race/ethnicity shares

## Remaining work

- Join tracts to route stop catchments or route geometry.
- Add tract geometry source handling.
- Add job access from LEHD/LODES or a travel-time model; ACS profile fields do not measure job accessibility.

## Sources

- https://api.census.gov/data/2024/acs/acs5/profile — verified_at: 2026-04-27
