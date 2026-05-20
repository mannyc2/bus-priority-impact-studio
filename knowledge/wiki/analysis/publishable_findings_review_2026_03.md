# Publishable Findings Review: March 2026

Status: working review note for manually promoting high-evidence findings.

## Review Goal

Promote only findings that are supported by multiple datasets and can be stated without
overclaiming causality. For March 2026, the strongest candidates should combine:

- Bus Observatory observed-reliability evidence.
- Local route speed / hotspot evidence.
- Context-event route-touch evidence, especially DOT street permits.
- Optional corroboration from collisions, 311, parking, or ACE route touches.

## Publication Bar

A finding is publication-ready only when the evidence packet can name the underlying
metrics, source tables, and limits of the claim.

Minimum evidence:

- `local_route_observed_reliability_summary`: observed sample count, long-gap share,
  wait reliability ratio, and excess wait.
- `local_route_hotspot_summary`: route weighted average speed, observation count,
  bus trip count, ridership exposure, and hotspot count.
- `local_context_event_route_touch`: context counts by source, event kind, and
  physical segment count for the analysis month.

Avoid these claims until deeper evidence review:

- "Permits caused the slowdown."
- "No intervention exists."
- "ACE or enforcement failed."

Prefer phrasing like:

- "Route X combined poor observed reliability, slow route speeds, and dense DOT permit
  activity touching the route in March 2026."
- "This is a high-priority review target, not a causal conclusion."

## Shortlist

These routes combine severe observed reliability, slow route speed/hotspot evidence,
and substantial permit touches in March 2026.

| Route | Review status | Why it is promising | Main caveat |
| --- | --- | --- | --- |
| B25 | Best first website candidate | Persistent reliability problem, slow March speed, high ridership exposure, and dense DOT permit context on Fulton Street / Downtown Brooklyn corridor streets. | Needs physical-segment overlap check before implying permits touched the exact worst speed segments. |
| BX41 | Strong candidate | Highest long-gap share in this reviewed set, substantial permit touches, and many route speed observations. | Route speed is less severe than B25/B12/BX15; frame as reliability-led. |
| B12 | Strong candidate | Very slow route speed, high reliability pain, high permit-touch count, and broad context corroboration. | Needs route geography and top permit clusters checked for a clean public story. |
| B15 | Strong but noisy | Very large sample support, highest context activity, and high ridership exposure. | Context volume may reflect route length/activity; needs normalization before ranking. |
| BX15 | Known reliability candidate | Very poor reliability metrics and slow route speed with permit and ACE context touches. | Permit volume is lower than Brooklyn candidates; intervention claims need separate review. |

## Evidence Snapshot

From `data/local/pipeline.sqlite` and March 2026 artifacts:

| Route | Observed samples | Long-gap share | Wait ratio | Excess wait min | Route avg speed mph | Speed obs | Bus trips | Ridership exposure | Hotspots | DOT construction permits | DOT opening permits | Collisions | 311 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B25 | 13,700 | 0.7818 | 17.7054 | 83.5272 | 6.4742 | 1,973 | 31,203 | 1,177,096 | 10 | 135 | 27 | 59 | 452 |
| BX41 | 5,848 | 0.8136 | 17.3109 | 97.8653 | 7.6237 | 2,049 | 30,045 | 947,369 | 10 | 167 | 33 | 41 | 326 |
| B12 | 10,604 | 0.7747 | 19.5541 | 74.2163 | 6.2316 | 1,695 | 36,800 | 1,266,931 | 10 | 168 | 28 | 50 | 439 |
| B15 | 26,199 | 0.7190 | 16.4426 | 69.4917 | 7.9070 | 2,686 | 55,290 | 2,640,844 | 10 | 212 | 81 | 97 | 709 |
| BX15 | 3,514 | 0.7900 | 22.5405 | 86.1618 | 6.8414 | 1,944 | 36,061 | 1,399,176 | 10 | 48 | 9 | 24 | 220 |

## B25 First-Pass Evidence

B25 is the best first manual-review target because it is strong across independent
signals:

- Observed reliability: 13,700 Bus Observatory samples, 78.18% long-gap share,
  17.7054 wait reliability ratio, and 83.5272 excess wait minutes.
- Speed/hotspots: 6.4742 mph route weighted average speed, 1,973 speed observations,
  31,203 bus trips, 1,177,096 ridership exposure, and 10 hotspot segments.
- DOT permit context: 135 construction-permit touches and 27 street-opening-permit
  touches in March 2026, spanning 35 construction physical segments and 19 opening
  physical segments.
- Other context: 59 collision touches, 452 current 311 complaint touches, 18 parking
  violation touches, and 1 ACE aggregate touch.
- Reliability trend: across 38 Bus Observatory months with sample support, B25 averaged
  79.46% long-gap share; 37 of 38 months were at or above 75%, and 17 months were at
  or above 80%.

Example B25 permit rows include March work windows on Broadway, Fulton Street, Gold
Street, Hull Street, and related corridor streets. The safest publication claim is
that B25 had severe reliability and speed problems during a month with substantial
route-touching DOT permit activity. The current evidence does not prove those permits
caused the route performance.

### B25 Segment Detail

The strongest B25 speed evidence is concentrated around the Downtown Brooklyn and
Fulton Street portion of the route:

| Rank | Direction | Segment | Observations | Trips | Avg mph | Slow-window share | Rider impact score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | E | Tillary St/Cadman Plaza East to Fulton St/Bond St | 167 | 2,569 | 4.6318 | 0.9641 | 75 |
| 2 | W | Fulton St/Bond St to Cadman Plaza West/Tillary St | 168 | 2,515 | 5.0704 | 0.8333 | 67 |
| 3 | W | Fulton St/Greene Av to Fulton St/Bond St | 168 | 2,590 | 5.7118 | 0.8214 | 56 |
| 4 | E | Fulton St/Bond St to Fulton St/Carlton Av | 161 | 2,641 | 6.3740 | 0.7516 | 45 |
| 5 | E | Fulton St/Nostrand Av to Fulton St/Ralph Av | 161 | 2,810 | 6.3691 | 0.7143 | 45 |

The permit context is also concentrated enough to describe publicly, but the street
names below come from permit records rather than from a one-to-one match to hotspot
segment geometry:

| Street | Permit touches | Physical segments | Active window covered by March touches |
| --- | ---: | ---: | --- |
| Fulton Street | 26 | 14 | 2026-03-02 to 2026-06-24 |
| Front Street | 16 | 3 | 2026-03-12 to 2026-04-01 |
| Court Street | 10 | 2 | 2026-03-12 to 2026-05-29 |
| Adams Street | 10 | 1 | 2026-03-25 to 2026-05-15 |
| Broadway | 9 | 2 | 2026-03-02 to 2026-04-30 |

The top permit types are operationally plausible street-friction context: equipment
placement, DOT milling/paving, roadway or sidewalk occupancy, reconstruction, and
hardware regrading. This strengthens the case for B25 as a review target, while still
not proving causality.

Physical-segment check:

- The 26 permit-record Fulton Street touches correspond to 14 distinct physical IDs
  that are route-linked to B25.
- Of those 14 physical IDs, 2 are named `FULTON ST` in `local_route_lion_link`; one
  additional linked physical ID is `OLD FULTON ST`, and one is `CADMAN PLZ W`.
- This confirms route-corridor context, but it does not prove the permit rows touch
  the exact same physical route segments as the top speed hotspots.

The public wording should therefore say "along the same route corridor" or "touching
the B25 route" unless a later geometry check maps hotspot segments directly to LION
physical IDs.

## Draft Website Finding

Working title: B25 reliability problems persisted while March speeds and street-work
context converged on the Fulton Street corridor.

Draft claim:

In March 2026, the B25 combined a persistent reliability problem with slow route-speed
evidence and substantial DOT permit activity touching the route corridor. Bus
Observatory data shows 13,700 observed samples and a 78.18% long-gap share for the
month; across 38 recovered Bus Observatory months, B25 averaged 79.46% long-gap share.
The March speed summary shows 6.47 mph route-weighted average speed, 1,973 speed
observations, 31,203 bus trips, and 10 hotspot segments. The strongest hotspot ran
eastbound from Tillary St/Cadman Plaza East to Fulton St/Bond St at 4.63 mph, with
96.41% of observed windows classified as slow. The route also had 162 DOT permit
touches in March, including 26 permit-record Fulton Street touches across 14
B25-linked physical street segments.

Evidence limit:

This finding is safe as a multi-dataset prioritization finding. It should not claim
that permits caused the B25 slowdown until exact physical-segment or geometry overlap
is verified.

## BX41 First-Pass Evidence

BX41 is a strong second candidate, especially for a reliability-led story with cleaner
Webster Avenue permit overlap than B25's Fulton Street check.

- Observed reliability: 5,848 Bus Observatory samples, 81.36% long-gap share,
  17.3109 wait reliability ratio, and 97.8653 excess wait minutes.
- Reliability trend: across 38 Bus Observatory months with sample support, BX41
  averaged 82.37% long-gap share; 37 of 38 months were at or above 75%, and 33 months
  were at or above 80%.
- Speed/hotspots: 7.6237 mph route weighted average speed, 2,049 speed observations,
  30,045 bus trips, 947,369 ridership exposure, and 10 hotspot segments.
- DOT permit context: 167 construction-permit touches and 33 street-opening-permit
  touches in March 2026, spanning 25 construction physical segments and 18 opening
  physical segments.
- Other context: 41 collision touches, 326 current 311 complaint touches, and 1
  parking violation touch.

The strongest sample-supported BX41 speed evidence is on Melrose/Webster:

| Rank | Direction | Segment | Observations | Trips | Avg mph | Slow-window share | Rider impact score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | S | Melrose Av/E 160 St to Melrose Av/E 149 St | 168 | 2,457 | 6.1548 | 0.8036 | 63 |
| 2 | N | Webster Av/E 180 St to Webster Av/East Fordham Rd | 173 | 2,560 | 6.6100 | 0.8035 | 54 |
| 3 | N | 3 Av/149 St to Melrose Av/E 161 St | 168 | 2,514 | 6.6351 | 0.6905 | 51 |
| 5 | S | Webster Av/Bedford Park Blvd to Webster Av/East Fordham Rd | 168 | 2,420 | 7.3888 | 0.5774 | 35 |

Note: hotspot rank 4 had only 5 observations and 15 bus trips, so it should not be
used as lead public evidence despite its low speed.

BX41 permit clusters:

| Street | Permit touches | Physical segments | Active window covered by March touches |
| --- | ---: | ---: | --- |
| Webster Avenue | 62 | 14 | 2026-03-02 to 2026-06-28 |
| East Gun Hill Road | 31 | 3 | 2026-03-13 to 2026-06-08 |
| East 180 Street | 24 | 1 | 2026-03-23 to 2026-06-24 |
| Willett Avenue | 14 | 1 | 2026-03-13 to 2026-06-10 |
| Bedford Park Boulevard | 13 | 1 | 2026-03-04 to 2026-06-11 |

Physical-segment check:

- The 62 permit-record Webster Avenue touches correspond to 14 distinct physical IDs
  route-linked to BX41.
- Of those 14 physical IDs, 10 are named `WEBSTER AVE` in `local_route_lion_link`.
- This is stronger physical-route overlap than the B25 Fulton Street check, but still
  supports context and prioritization rather than causality.

Draft claim:

In March 2026, the BX41 showed a persistent reliability problem and a Webster Avenue
street-work context that is unusually well aligned with its route geometry. Bus
Observatory data shows 5,848 observed samples and an 81.36% long-gap share for the
month; across 38 recovered Bus Observatory months, BX41 averaged 82.37% long-gap
share. The March speed summary shows 7.62 mph route-weighted average speed, 2,049
speed observations, 30,045 bus trips, and 10 hotspot segments. The route also had 200
DOT permit touches in March, including 62 permit-record Webster Avenue touches across
14 BX41-linked physical street segments, 10 of which are also named `WEBSTER AVE` in
the route-LION bridge.

Evidence limit:

This finding is safe as a reliability-led, multi-dataset prioritization finding. It
should not say permits caused BX41's reliability problem or speed hotspots.

## Next Manual Checks

Before publishing B25:

1. Decide whether collisions and 311 are supporting context or too broad/noisy for
   the public version.
2. Confirm whether the Fulton Street permit cluster overlaps the same physical
   segments as the top route-speed hotspots, rather than merely the same route.
3. Normalize permit/context volume by route length or route segment count before using
   context counts to rank routes against one another.

Before publishing BX41:

1. Decide whether to lead with persistent reliability rather than speed, since March
   speed is poor but less severe than B25/B12.
2. Confirm whether Webster Avenue permit physical IDs line up with the Webster Avenue
   hotspot segments, not just the route-level Webster Avenue link set.
3. Exclude the tiny-sample Claremont Parkway hotspot from any public-facing claim.
