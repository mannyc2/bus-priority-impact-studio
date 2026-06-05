---
title: Tier 2 Operational-Date Assertions — Build & Review
type: engineering
status: detector_bridge_loaded_pending_migration_journal_cleanup
last_updated: 2026-06-04
owner: codex
source_count: 0
tags: [tier2, documents, operational-dates, intervention-inventory, deterministic, review]
---

# Tier 2 Operational-Date Assertions — Build & Review

## What this is

Supersedes the audit/handoff in `tier2_operational_date_extraction_audit_handoff.md`.
That handoff proposed shipping the problem to another LLM session plus a 4-enum
taxonomy, a gold set, and an evaluation harness — before anyone had looked at the
data. Inspection showed the operational fact the source asserts is already in the
extracted `rawCandidate` (`statusRaw`, `familyRaw`, `subtypeRaw`, `dateRaw`,
per-evidence `roleRaw`). It was being **discarded downstream**, not missing.

So this was solved **deterministically, with no LLM rerun and no re-extraction**,
per the project decision to trust official MTA/DOT sources: if a source states an
intervention was implemented/launched, or states a planned/scheduled launch date,
we record that date and trust it. Historical GTFS is only an optional route/service
**exposure** check, never a universal date validator.

## Implementation

- `packages/domain/src/document-operational-date.ts` — pure `classifyOperationalDate()`
  + Zod types (`SourceStatedStatus`, `OperationalDateValidationState`,
  `OperationalDateAssertion`). Single source of truth for the rule.
- `tools/pipeline-v2/.../_operational-date-assertions.ts` + `operational-date-assertions.ts`
  — builds `document-operational-date-assertions-v1.json` (one row per event,
  keyed `surfaceId`), preserving source signals + evidence refs verbatim.
- `_event-route-resolution.ts` / `_route-review-queue.ts` — `dateValidationState`
  is now derived from the same classifier instead of being blanket-stamped
  `requires_historical_gtfs`. (Code complete + unit-tested; full-corpus artifacts
  pending local-DB rebuild — see Status.)

### Classification logic

Two faithful, low-cardinality signals — deliberately **not** the 1,130-value
free-text `familyRaw` vocabulary that scared the handoff toward an LLM:

1. **`statusRaw` → operational-state axis.** `done` / `committed_future` /
   `proposed` / `existing` / `unknown`. Raw status preferred; normalized
   `eventStatus` is only a fallback when `statusRaw` is absent (~80 rows).
2. **`eventKind` → intervention axis**, for recall (which events are
   service/physical/enforcement changes).
3. **Source-family veto → precision.** `eventKind` is an unreliable
   intervention-vs-process axis (it mislabels meetings as `service_change`), so
   `familyRaw`/`subtypeRaw` (and a narrow set of name phrases) veto outreach /
   meeting / planning / study / design-milestone events.
4. **Usable-date guard.** A date must contain a digit (rejects `future`,
   `unknown`, `during start-up period`; keeps `7/3/16`, `Spring 2016`).

States: `source_stated_operational_date` (done + operational → trusted),
`source_stated_planned_date` (committed_future + operational → trusted, flagged as
plan), `non_operational_milestone`, `operational_without_date`, `needs_review`.

## Independent audit (2026-06-03) → anchor-ready hardening

A 15-agent independent audit scored the first deterministic version **651/1000
(`ship_with_fixes`)**. Weakest dimension: applied-research fitness (430) — the
artifact was a research *substrate*, not a causal treatment table. It verified
the honest distribution but found real defects, all since fixed:

- **Precision bugs:** `ace`/`able` substring matched inside "Pl**ace**"/"resurf**ace**"
  (18/27 trusted `camera_enforcement` rows were not enforcement); `not_implemented`
  mapped to `done` (a *denied* stop request was trusted); subway-mode events
  trusted as bus dates; design/agenda/handoff milestones trusted.
- **Recall:** the hard `eventKind` gate dropped ~81 explicitly-completed
  implementations (Woodhaven bus lanes, Flatbush TSP, Bronx Redesign).
- **Fitness gaps:** no machine-readable date (verbatim text), zero route linkage,
  no cross-source dedup, no confidence; ~70% of trusted dates coarser than month.

### Fixes applied (deterministic-first, per project decision)

- `ace`/`able` word-boundary matcher in `classifyTier2Event`; dropped `able`.
  Result: `enforcement_or_regulatory_change` **305 → 36** (false enforcement gone).
- `normalizeStatedStatus`: negated-status guard (`not_implemented`/`denied`/
  `cancelled` → proposed) + disjunctive `X_or_Y` → review, before the substring fallback.
- Expanded veto: rail-mode (`subway`/`2nd ave subway`/`g train`/`ferry`/`lirr`),
  design/agenda/handoff/site-visit/air-rights, and observation (`traffic volume`/
  `summer streets`/`pre-covid`).
- **Recall rescue**: a genuine operational `familyRaw`/`subtypeRaw` token overrides
  a non-operational `eventKind` (the noisy upstream label no longer silently vetoes a launch).
- **`parseOperationalDate`**: verbatim text → normalized ISO start/end +
  `implementationMonth` (YYYY-MM) + precision; fixes US-slash dates (`7/3/16` → day)
  and replaces the loose `/\d/` guard (rejects "concurrent with…", "Map Date").
- **Anchor adapter** (`document-operational-date-assertions-v1`): route-join from
  the resolution artifact by `surfaceId` (`routeIds`, `routeResolutionTier`),
  cross-source dedup (`interventionId` + `evidenceSourceIds` + `sourceCount`),
  `isRealizedOnset`, `confidence`, and `causalAnchorEligible` (realized AND
  month-or-finer AND route-linked).

## Final distribution (full corpus, 8,428 events)

| validationState | rows |
|---|---:|
| source_stated_operational_date | 640 |
| source_stated_planned_date | 524 |
| non_operational_milestone | 6,947 |
| operational_without_date | 226 |
| needs_review | 91 |

**1,157 trusted operational dates** (recall rescue raised it from 929; the false
positives the audit found are removed). **962** are route-linked.

**Causal-anchor funnel** (the deliverable applied-research actually needs):
**240 `causalAnchorEligible` rows → 109 distinct interventions** (realized +
month-or-finer + route-linked). Re-review of the eligible set: 0 residual
subway/observation/meeting; entries are textbook launches with routes + month
dates + confidence (Q52/Q53 SBS 2017-11, Bx41 SBS 2013-06, M14 A/D 2019-07,
34th St BRT 2011-11, Woodhaven bus lanes 2015-08, ACE/ABLE enforcement — now
correctly labelled). ~99% precise.

### Residual long-tail (where the LLM pass would help)

The deterministic floor reaches ~240 clean anchors. What it cannot fix:
- **Date-block provenance**: only ~50/929 trusted rows had a date-role evidence
  ref; deterministic code cannot *synthesize* a citation that was never captured.
- A small tail of upstream **`eventKind` mislabels** (context/observation events
  tagged `service_change`) that have no clean veto token.
These are exactly the cases a stricter LLM re-extraction into the typed schema
(required date-block citation, realized-vs-planned, normalized date) would close —
to be escalated if the ~240-anchor floor is insufficient.

## Review (the gate before sqlite)

Method: stratified sampling of every bucket + cross-check against the source
signals on each row + ground-truth against known public launch dates. The review
**found and fixed three systematic precision defects** (this is why deterministic
output must be reviewed):

1. **Process/meeting/planning false positives (~422 rows, ~25% of the initial
   operational+planned buckets).** `eventKind` labelled community meetings,
   outreach, and planning phases as `service_change`. Fixed with the
   source-family veto.
2. **Design/study-milestone leakage via event name (`Final Design`, `…- After
   condition`, `Engineering design`, `…FAQ Publication`).** Fixed by checking a
   narrow, high-precision phrase set against the event name.
3. **Placeholder dates (138 rows)** like `future` / `during start-up period`
   carried as trusted dates. Fixed by requiring a digit. (`datePrecision=unknown`
   is *not* a reliable signal — the real `7/3/16` also has precision `unknown`.)

Post-fix the operational bucket is ~99% precise on inspection (e.g. Bx12 SBS 2008
= NYC's first SBS; 14th St Busway 2019; Fordham SBS 2008; Bx41 SBS 2013-06-30 —
all match known facts). Verified the source-family veto does **not** over-exclude
real launches (the apparent over-vetoes — `Nostrand/Rogers SBS Implementation`,
`Queens Bus Network Redesign launch` — are correctly vetoed: `existing_condition`
study baseline and `planning_initiative` respectively).

## Status / gate

- ✅ Operational-date assertions surface built anchor-ready (normalized date +
  route-join + dedup + confidence + eligibility), run over the full corpus, and
  re-reviewed against the audit findings.
- ✅ `@bp/domain` + `@bp/pipeline-v2` typecheck clean; 49 domain + 341 pipeline tests pass.
- ✅ Full-corpus `document-event-route-resolution-v1` and
  `document-route-review-queue-v1` regenerated from the populated v2 local DB
  (`data/local/pipeline.sqlite`, route-stop month `2026-03`). The stale
  blanket `requires_historical_gtfs` state is gone. Resolution now reports
  `source_stated_operational_date=633`, `source_stated_planned_date=524`,
  `non_operational_milestone=6,955`, `needs_review=90`, and
  `operational_without_date=226`; the route queue now has 7,437 items with
  1,856 default route-timeline approvals, 5,157 supporting-context approvals,
  and 424 manual-curation defaults.
- ✅ The live `intervention_event_study` input path is wired. `route
  intervention-evaluation` now reads
  `document-operational-date-assertions-v1.json`, projects detector-ready
  direct/source-context anchors into `local_intervention_event` and
  `local_route_intervention_comparison`, and replaces them under source id
  `tier2_document_operational_date_assertions`. The bridge intentionally excludes
  ambiguous/current-corridor-only route links so review-queue route candidates do
  not become treated routes by accident.
- ✅ Local v2 SQLite load completed for March 2026 through the existing DB opened
  directly: 168 document-anchor event/comparison rows were written alongside 78
  ACE and 495 bus-lane rows. Current document-anchor comparison status:
  `evaluated=3`, `insufficient_pre_data=165`. A direct detector-function check
  over the same SQL produced 741 intervention-panel features, including all 168
  document-anchor features; none became event-study candidates under current
  thresholds, so they currently add coverage/no-hit evidence.
- 🚧 Normal CLI execution against `data/local/pipeline.sqlite` is still blocked
  before command execution by a local Drizzle migration-journal mismatch: the DB
  already has tables such as `local_bus_customer_journey_metric`, but
  `migrateLocalPipelineDb()` attempts to replay their creation. Do not rerun a
  destructive rebuild to paper over this; clean up/reconcile the local migration
  journal or run against a known-good migrated DB before declaring the CLI path
  healthy.
- 🔜 **LLM escalation option** (deferred, not premature): a stricter re-extraction
  into the typed schema would close the date-block provenance gap and the residual
  `eventKind` mislabels. Try it only if the ~240 deterministic anchors prove insufficient.
