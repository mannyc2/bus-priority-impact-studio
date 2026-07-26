# 104 comp round — `/interventions` as the network change record

**Status: APPROVED (2026-07-24). The operator approved the concept and all five
recommended decisions, including that the build-out chart leads the page.**
`interventions-comp.html` is the acceptance target for
`plans/104-network-change-record.md`. Open it in a browser.

## What the operator approved

Route detail owns one route's history. What is left for a global page is
**global state, more timeline-y than the routes page**. Not a longer list of the
same rows: the two things that only exist at network scale.

1. **How far bus priority has spread.** Cumulative routes reached by each kind
   of treatment, 2007 to today. This is the strongest object in the dataset and
   it leads the page. Its flat lines carry it: Select Bus Service has not
   reached a new route since 2017 and signal priority has stood at 4 routes
   since 2013, while bus lanes went from 11 routes to 323 and camera
   enforcement from nothing to 58.
2. **Which routes are changing.** A change-oriented index, grouped by recently
   changed, most changed, measured, proposed and never changed, with the
   published study result where one exists.

Then what is proposed, grouped by the plan that proposed it rather than listed
as 248 rows. Then the Plan 089 ledger, unchanged, demoted behind a link.

## Deliberately preserved

The headline and standfirst are Plan 089's operator-approved D27 copy and stay
exactly as they are. The ledger below keeps its filters, tabs, studied
checkbox, grouping, undated rollups, pagination and URL contract; this plan
moves it and does not change it.

## Deliberately deleted

The year histogram. The build-out chart supersedes it, and two charts of the
same shape on one page is precisely the duplication this concept exists to
remove.

## Wording that is load-bearing

Bus-lane records are route shape against the city's published DOT bus-lane
centreline geometry, which the serving-surface manifest is explicit is **not
audited regulatory mileage**. Every visible string therefore says "runs on a
street with a bus lane", never "has a bus lane" and never a mileage figure.

## Data provenance

Every number in the comp is real, measured on 2026-07-24:

- route projection, 389 routes carrying 569 dated intervention records, 66
  routes with none;
- the full cumulative table for six treatment families, 2007 to 2026, is
  reproduced in `plans/104-network-change-record.md` under "Current state" and
  is the fixture the implementation must reproduce;
- reviewed corpus, 310 records, 248 proposed across 22 source plans;
- published study index, 7 studies, 2 matched-segment and 5 descriptive.

2026 is a partial year because the served release is frozen mid-year, and the
chart says `2026 so far`. The implementation must derive that from the data
rather than hard-coding the year.
