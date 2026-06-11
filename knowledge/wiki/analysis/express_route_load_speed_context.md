---
title: Express Route Load-Speed Context
type: analysis
status: implemented
last_updated: 2026-05-25
owner: codex
source_count: 2
tags: [express-bus, capacity, speed, context]
---

# Express Route Load-Speed Context

## Goal

Identify express-route time windows where public maximum-load-point capacity context coincides with
slow observed express-bus speeds. This is a screening layer for express-route story selection, not a
route-score input and not a passenger-load truth source for local, SBS, stop, or segment claims.

## Inputs

- MTA Express Bus Capacity, Socrata `4tpr-3bvc`: weekly express-route load percentage at each
  route's maximum load point by route, direction, day type, and hour.
- MTA Bus Route Segment Speeds 2023-2024, Socrata `58t6-89vi`: observed express-bus speed windows
  by route, direction, day of week, hour, and timepoint segment.

## Implementation

Source: `tools/pipeline/src/jobs/build/express-route-analysis.ts`

```bash
bun --filter @bp/pipeline ingest:express-bus-capacity
bun --filter @bp/pipeline build:express-bus-capacity-context
bun --filter @bp/pipeline build:express-route-analysis
bun --filter @bp/pipeline audit:express-route-analysis
```

## Method

1. Normalize capacity rows to route, week, direction, day type, hour, load percentage, and APC trip
   count.
2. Roll capacity to route/month/direction/day-type/hour using APC-trip-weighted average load,
   peak load, week count, and total APC trips.
3. Fetch matching 2023 speed rows for express routes from `58t6-89vi`.
4. Roll speed to route/month/direction/day-type/hour by mapping Monday-Friday to `Weekday` and
   Saturday-Sunday to `Weekend`.
5. Join capacity to speed at route/month/direction/day-type/hour.
6. Mark a screening candidate only when all are true:
   - capacity is not low-sample (`totalTripsWithApc >= 10`);
   - weighted load is at least 70%;
   - matched average speed is below 8 mph.

## Current Output

Latest live run:

- 79 express routes.
- 13,243 capacity windows.
- 12,674 speed-matched windows.
- 95.7% speed match share.
- 10 high-load/slow-speed screening candidates.

The first candidate cluster is concentrated on:

- `SIM8` southbound weekday 13:00 windows across April-September 2023.
- `X28` southbound weekday 14:00-15:00 windows across April, May, June, and September 2023.

## Outputs

- `data/raw/express-bus-capacity/express-bus-capacity-2023-04-2023-09.json`
- `data/working/express-bus-capacity/express-bus-capacity-normalized-2023-04-2023-09.json`
- `data/artifacts/express-bus-capacity/route-hour-summary-2023-04-2023-09.json`
- `data/artifacts/express-route-analysis/load-speed-context-2023-04-2023-09.json`
- `data/artifacts/express-route-analysis/audit-2023-04-2023-09.json`

Generated `data/` outputs are local artifacts and remain gitignored.

## Audit Gate

`audit:express-route-analysis` validates:

- artifact schema and exact source IDs;
- threshold values;
- required caveats;
- route summary counts and row-derived metrics;
- top-candidate consistency;
- every candidate flag against the threshold rules;
- global speed-match share, warning below 90%.

The live audit passes with 0 errors and 0 warnings.

## Limitations

1. **Express only.** The source does not cover local, limited, or SBS routes.
2. **Maximum-load-point only.** Load is not reported by stop, stop pair, or timepoint segment.
3. **Static 2023 slice.** Coverage is April 2023 through September 2023 and is not a current
   conditions signal.
4. **Descriptive join.** The speed join is route/month/direction/day-type/hour, not vehicle-level
   or stop-level matching.
5. **No causal claims.** A candidate means a high-load express window was also slow; it does not
   identify why it was slow or prove an intervention effect.

## Sources

- https://data.ny.gov/Transportation/MTA-Express-Bus-Capacity-April-2023-September-2/4tpr-3bvc — verified_at: 2026-05-25
- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-2023-2024/58t6-89vi — verified_at: 2026-05-25
