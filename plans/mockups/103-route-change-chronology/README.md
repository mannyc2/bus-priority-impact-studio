# 103 comp round — Route page: Treatments & history as a change chronology

**Status: APPROVED (2026-07-24). The operator approved the concept and all five
recommended decisions.** `route-history-comp.html` is the acceptance target for
`plans/103-route-change-chronology.md`. Open it in a browser.

## What the operator approved

The tab survives on one justification: it shows what no metric tab can, which is
**order, duration and overlap** of dated changes. The rule that decides every
placement across route detail is:

> If it has a date, it is history. If it is a condition, it belongs to the
> metric that measures it.

So current-state inventory leaves this tab (Overview's treatment badges and the
map keep it), and the tab gains a chronology whose payload is the hatched
overlap region: on the Bx41, Select Bus Service, a bus lane and the Fordham Road
turn restrictions all land inside 2013, and our segment speed record starts a
decade later, so none of them can be credited with anything.

## Three parts

1. **Standing** — one composed sentence naming what the route has and when it
   arrived, plus chips that jump into the chronology and one link out to the map.
   Not an inventory.
2. **Chronology** — a faint speed line for context, bands positioned by each
   change's date interval, and a hatched region wherever two or more bands
   intersect. Milestones (community boards, contract awards, construction
   phases) collapse into one disclosure line; 111 of Bx41's 114 timeline records
   live there.
3. **Changes** — one entry each, carrying the measurement relevant to *that*
   change at *its* scope and window, and citing its sources inside the sentence
   that uses them.

## Rejected in round 1, do not reintroduce

- **The route strip.** A horizontal schematic of the route duplicated the map
  that already ships, minus panning, streets and every affordance that makes a
  map worth reading. Extents belong on the real map (plan 105).
- **A separate sources section.** Citations dissolve into the sentence that uses
  them; a list of 52 documents is an index of our filing, not evidence.
- **A "How exactly do we know where each change landed" section.** Narrating our
  own epistemics. The scope model gets used, not described.
- **Interpunct metadata chains** such as `4 current treatments · 2 projects
  active`. Banned by `tests/harness/design-doctrine.test.ts`.
- **Any sentence explaining the data model**, e.g. "shown here because it is
  network-scoped and has no parent route project". The audience is a
  non-technical MTA governance reader.

## The five evidence states

Every change carries exactly one, selected value-blind in this fixed order:
`study` (matched or descriptive), `peer_adjusted`, `confounded`, `too_early`,
`no_product`. The comp shows three of them, because Bx41 honestly has no
published study. The `study` state reuses the approved anatomy from
`plans/mockups/075-history-tab/study-cards-comp.html` rather than inventing a
second card.

## Data provenance

Treatments, projects, dates, source documents and citation counts are read from
the live route evidence bundle `studio/v2/wiki/routes/bx41.json` on 2026-07-24:
114 timeline records, 106 treatments, 5 projects, 183 metric claims, 422
citations across 52 documents. The speed line and the two-year mini series are
**illustrative** and labelled as such in the comp, because the route-detail
endpoint does not currently serve a monthly series for Bx41.
