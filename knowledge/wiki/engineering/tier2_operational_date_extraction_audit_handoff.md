---
title: Tier 2 Operational-Date Extraction Audit Handoff
type: engineering
status: superseded
last_updated: 2026-06-03
owner: codex
source_count: 0
tags: [tier2, documents, extraction, operational-dates, superseded]
---

# Tier 2 Operational-Date Extraction Audit Handoff — SUPERSEDED

> **Superseded 2026-06-03 by
> [`tier2_operational_date_extraction_review.md`](./tier2_operational_date_extraction_review.md).**
>
> This handoff proposed shipping the problem to another LLM session plus a
> 4-enum taxonomy, a gold set, and an evaluation harness — before anyone had
> looked at the data. Inspection of the real corpus showed that was unnecessary:
>
> - The operational fact the source asserts (`statusRaw`, `familyRaw`,
>   `subtypeRaw`, `dateRaw`, per-evidence `roleRaw`) was **already extracted** in
>   `rawCandidate`; it was being discarded downstream, not missing.
> - `dateValidationState` was blanket-stamped `requires_historical_gtfs` on all
>   8,428 events instead of being derived from those signals.
>
> It was solved **deterministically — no LLM rerun, no re-extraction, no upfront
> gold set/eval harness** — by `classifyOperationalDate()` in `@bp/domain` plus a
> `document-operational-date-assertions-v1` builder, then reviewed against the
> source before any sqlite load. See the review doc for the design, the final
> distribution (929 trusted operational dates), the three precision defects the
> review caught, and known limitations.
>
> The premise still holds and is now implemented: official MTA/DOT operational
> statements are trusted; historical GTFS is only a route/service exposure check,
> not a universal date validator.
