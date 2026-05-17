---
title: Business Problem
type: project
status: active
last_updated: 2026-05-17
owner: codex
source_count: 4
tags: [mta, business-problem, bus-priority]
---

# Business Problem

## Problem statement

MTA and its city partners need to know where bus service is slow or unreliable, what factors may be contributing, which routes/segments are the strongest candidates for intervention, and whether past interventions improved rider outcomes.

## Why this is implementable from public data

The public-data ecosystem supports a credible version of this problem:

- MTA publishes route-segment bus speeds with travel time, distance, trip counts, route/timepoint geography, month/day/hour, and trip type.
- MTA publishes bus route and stop geospatial datasets that allow segment speeds to be mapped along real route shapes.
- MTA publishes route/hour ridership estimates that allow route performance to be weighted by rider impact.
- MTA publishes ACE implementation and violation datasets that can support intervention tracking.
- NYC DOT publishes bus-lane locations that can be joined to route/segment geometry.

## Stakeholders

Potential stakeholder profiles:

- MTA Data & Analytics / Open Data.
- Bus planning and scheduling analysts.
- Customer communications teams.
- Public advocates and watchdog groups.
- Riders and journalists who need interpretable performance evidence.

## Product value

The product should reduce the effort required to answer:

- Which route/segment is slowest at the time riders actually use it?
- Which slow segments are persistent rather than one-month anomalies?
- Which slow segments overlap with bus lanes, ACE corridors, or recurring blocked-lane enforcement?
- Which routes have large rider impact and weak intervention coverage?
- Did ACE or bus-lane-related enforcement produce measurable speed/reliability changes?

## Outsider positioning

The product should not look like a generic bus analytics dashboard that re-derives facts MTA analysts already know. The credible outsider artifact is a source-backed finding:

```text
specific route/corridor problem
  -> public evidence
  -> reliability/intervention caveat
  -> brief with reproducible method and citations
```

The strongest defense against "MTA already has analytics" is not more dashboard surface area. It is showing that the system can find, reproduce, and explain a specific public-data pattern that is useful outside the internal planning workflow.

Breadth and depth serve different jobs:

- Breadth: full-network route/corridor coverage makes triage possible and prevents cherry-picking.
- Depth: route/corridor briefs, GTFS-RT reliability evidence, intervention status, citations, hashes, and caveats make a finding defensible.
- Product shape: the frontend should expose proof-finding workflows and generated briefs first, not an undirected dashboard.

## Success criteria

A demo should be able to produce a route or corridor brief with:

- Map of slow segments.
- Route-level speed and ridership-weighted severity.
- Observed reliability/bunching status when collected samples support it.
- Intervention status: ACE, bus lanes, and service-alert context.
- Before/after evidence or explicit source-gap status for interventions.
- Clear caveats, citations, method status, and artifact hashes.

## Sources

- https://www.mta.info/open-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26
