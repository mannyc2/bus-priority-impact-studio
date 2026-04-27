---
title: ACE Impact Evaluation
type: analysis
status: draft
last_updated: 2026-04-26
owner: codex
source_count: 2
tags: [analysis, ace, causal-inference, event-study]
---

# ACE Impact Evaluation

## Goal

Estimate whether speeds/reliability improved after ACE implementation on a route, while showing caveats.

## Why this matters

MTA’s ACE page includes official program-level impact claims. The app can independently reproduce or contextualize route-level changes using public segment-speed data and ACE start dates.

## Design levels

### Level 0: descriptive before/after

Compare average segment speed before and after ACE start date.

Pros: easy.  
Cons: highly confounded.

### Level 1: before/after with seasonality controls

Compare same months or day/hour windows across years.

Pros: better seasonal control.  
Cons: still confounded by unrelated route/traffic changes.

### Level 2: difference-in-differences

Compare ACE route changes to matched non-ACE routes.

Matching features:

- borough,
- route type,
- baseline speed,
- baseline ridership,
- bus-lane overlap,
- CBD flag,
- time-of-day pattern.

### Level 3: event study

Estimate monthly changes around ACE implementation date:

```text
speed ~ route_fixed_effect + month_fixed_effect + event_time_indicators + controls
```

## Required outputs

- Route and implementation date.
- Pre/post windows.
- Treatment/control definition.
- Effect estimate.
- Confidence/caveats.
- Visual timeline.

## Caveats

- ACE may launch with warning periods before fine-bearing enforcement.
- Official start dates may represent route-level launch, not segment-specific enforcement intensity.
- Bus lanes, congestion pricing, route redesigns, seasonal variation, and service changes can confound results.
- Do not claim causal proof unless design supports it.

## Sources

- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y — verified_at: 2026-04-26
