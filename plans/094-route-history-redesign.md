# Plan 094: Route-detail Treatments & History redesign

## Status

- **State**: BLOCKED — UI merged/deployed; production exact route-index v3 and
  route-detail reads return HTTP 500 before the History surface can render
- **Priority**: P1
- **Effort**: M
- **Depends on**: Plans 074, 075, 082, 089, 090, 091, 092, and 093 (DONE)
- **Authority**: operator's 2026-07-22 blanket approval for the recommended
  evidence-conservative route History design
- **Accepted comp**:
  `plans/mockups/094-route-history-redesign/route-history-comp.html`

## Product outcome

Make one route's documented treatment state, chronological record, and measured
outcomes understandable without presenting those concepts as interchangeable.
The page must remain lossless at the typed-record boundary and honest when a
serving artifact is absent.

## Recon receipt and binding decisions

The design was checked once against the post-093/post-089 contracts and the
canonical read-only `wiki-v1-rc25` route-evidence index. The index contains 375
exact route identities. Representative route counts are recorded below; these
are design-validation facts, never production constants.

| Exact route | Timeline | Interventions | Projects | Citations | Outcome case |
|---|---:|---:|---:|---:|---|
| BX38 (`bx38`) | 20 | 5 | 2 | 53 | published matched-control |
| B67 (`b67`) | 62 | 47 | 2 | 173 | published descriptive |
| B44 (`b44`) | 86 | 79 | 1 | 216 | no published study |
| B44+ (`b44-sbs`) | 111 | 92 | 7 | 308 | no published study |
| B1 (`b1`) | 0 | 0 | 0 | 0 | sparse/no study |

The corpus reaches 747 History records on Q52+, so a History index, search, and
typed row filter are justified for dense routes. They are omitted below the
12-row threshold to keep sparse routes calm. B44 and B44+ remain separate in
the comp, view model, URL, tests, and browser verification.

The canonical legacy serving root and current production do not contain a
decodable Plan 091 route-inventory artifact: the public route-inventory index
and representative route bundles return 404, and the local legacy release is
schema v2 while the strict exporter requires the post-085 release identity.
The UI therefore treats inventory as unavailable, never as empty and never as
permission to infer current state from an implemented event. When a valid
bundle exists, its explicit `currentState[]` is the sole current-state
authority.

The accepted information architecture is:

1. **Treatments & history header** — exact route label, a structured count
   sentence, and compact jump links to Current state, History, and Outcomes.
   No authored route narrative.
2. **Current state** — render only the inventory bundle's typed
   `currentState[]`. Distinguish unavailable, partial, checked-empty, available
   empty, and available positive states. `implemented` is not silently treated
   as current.
3. **History ledger** — one newest-first ledger groups dated records by year
   and keeps Undated last. It merges occurrences, route service records, wiki
   timeline rows, typed evidence interventions, projects, and source gaps by
   stable relationship IDs only. A related item may be nested under its retained
   row, but every typed record keeps a stable target and source access.
4. **Dense-route controls** — above 12 rows, show local lexical search and
   an exact typed-kind filter (`event`, `treatment`, `project`, `source gap`).
   Search matches display fields only; it never classifies evidence or creates
   treatment relevance. Results paginate in 20-row increments.
5. **Outcomes** — published matched-control, published descriptive, and legacy
   peer-adjusted comparisons use separate labels and visual treatment. The
   legacy comparison is muted and unlinked. Candidate/unapproved rows are not
   inputs.
6. **Sources & coverage** — each row retains its citations. Typed PDF citations
   link to the original URL plus `#page=N` when a page is present. No text
   fragment is invented because the contract carries no quotable excerpt.

Calmer row styling uses one typed row label and, only where supported, one
meaningful lifecycle/status label. The page does not repeat separate “before &
after,” “timeline,” “documented treatments,” and “related projects” sections.

## Evidence and compatibility boundaries

- Consume Plan 091 exact inventory and `currentState[]`, Plans 090/093 typed
  relevance/observations, Plan 092 anchors and exact route URL, Plan 082 marker
  semantics, and only Plan 074/075 published study tiers.
- Keep B44 (`b44`) and B44+ (`b44-sbs`) distinct. Do not normalize, fan out, or
  alias routes.
- Use exact typed fields and relationship IDs only. Never classify lifecycle,
  relevance, or treatment kind from title/description substrings.
- Retain every typed record and explicit missing-data state. No silent drop due
  to a display cap or missing optional join.
- Preserve `?tab=history&study=` and `?tab=history&record=` focus behavior.
  Search and filter remain local so the established Plan 092 URL contract does
  not grow and the fixed bundle budget stays intact.
- Preserve public failure behavior: optional inventory/study/observation
  failures do not block the route, while route-detail failure still does.
- Do not alter data schemas, estimator logic, publication gates, R2/D1 objects,
  or marker eligibility.

## Implementation steps

1. Add focused pure-helper and component tests for explicit current state,
   complete ledger composition/deduplication, typed filtering, pagination,
   outcomes, PDF page links, exact routes, deep links, and empty states.
2. Extend the route intervention view model to expose typed `currentState[]`
   with presentation metadata. Remove the existing prose-derived event-tone
   heuristic.
3. Replace the five overlapping History cards with the accepted header,
   current-state summary, one lossless ledger, outcomes, and sources/coverage.
4. Add local History search/kind state while retaining the established
   `study`/`record` URL contract.
5. Run focused tests while iterating, then comprehensive type, architecture,
   unit/web/Worker, build, knowledge, release, SEO, performance, and doctrine
   checks.
6. Verify BX38, B67, B44, B44+, and B1 at desktop and 390 px for keyboard,
   focus, overflow, original-source links, exact identity, deep links, dense
   controls, and representative empty states.
7. Commit in complete slices, push, open a ready PR, merge after required CI,
   allow the normal main workflow to deploy, and verify production without
   publishing new artifacts.

## Acceptance criteria

- [x] Explicit typed current state is visibly separate from chronological
      History; unavailable/partial/checked-empty/available-empty states remain
      distinct.
- [x] One History ledger retains every typed occurrence, treatment, evidence
      timeline/intervention/project, service record, and source gap exactly
      once by stable relationships; Undated remains last.
- [x] Dense routes receive accessible local search/filter and pagination;
      sparse routes do not receive unnecessary controls.
- [x] Published matched-control, descriptive, and peer-adjusted outcomes are
      visibly distinct; no candidate/unapproved data or new claim enters.
- [x] Original source URLs remain external; PDF page fragments are added only
      from typed page numbers.
- [x] Existing History study/record links, keyboard focus, reduced motion,
      responsive layout, public failure behavior, and design budgets pass.
- [x] BX38, B67, B44, B44+, and B1 prove rich/sparse, matched/descriptive/none,
      and exact B44/B44+ behavior.
- [ ] Focused and comprehensive verification pass; the ready PR merges and the
      normal production deployment is verified.

## Pre-merge verification receipt

Implementation commits `3df7ad34` and `1a39a7d7` replace the overlapping
History cards with the accepted composition. The exact aggregate JavaScript
bundle is 409,576 gzip bytes, 24 bytes below the unchanged 400 KiB cap; the
entry remains 138.4 KiB gzip under its unchanged 145 KiB cap.

Focused verification passed 26 route-history/presentation tests, typecheck,
production-boundary checks, and design doctrine. Comprehensive root unit and
web tests passed (including 341 web tests); the Cloudflare harness passed 22
Worker tests. Architecture, month doctrine, knowledge, build, SEO, and web
performance passed. Plan 094's complete file set passes scoped Biome. The
repository-wide style command stops at the same four pre-existing diagnostics
on untouched `analytics-primer.html` and `apps/web/src/routes/routes/index.tsx`
as an `origin/main` baseline.

The browser pass used immutable public route artifacts plus the canonical
read-only `wiki-v1-rc25` route-evidence artifact (SHA-256
`c41e4d0dc88316494434a441f64e82b525ca5e712431bce8f3fca1ad92de8bec`).
Because the legacy route JSON predates the current release wrapper, a temporary
smoke server added only the required release identity/coverage metadata; it did
not alter route, treatment, study, or citation content. BX38, B67, B44, B44+,
and B1 passed desktop and 390 px checks for exact identity, matched/descriptive/
peer-adjusted/no-outcome tiers, dense and empty states, keyboard focus, opened
source popovers, local search/filter behavior, and zero horizontal overflow.
The checked-in PDF-link helper is separately fixture-tested because the pinned
route-evidence citations provide typed page numbers but no source URLs.

At receipt time the live route-detail API returns its existing HTTP 500 while
the immutable legacy artifact remains readable. The ready PR and normal main
deployment are therefore the final production audit; no artifact or evidence
contract is weakened to conceal that failure.

## Production audit and blocker

[PR #96](https://github.com/mannyc2/bus-priority-impact-studio/pull/96)
merged at `061fdfd5de8fc06d1e6fa9294a50911ca340bfc7`. Main workflow
[`29925161824`](https://github.com/mannyc2/bus-priority-impact-studio/actions/runs/29925161824)
passed verification and deployed the Worker. The public HTML route returns 200,
but both `/api/v1/studio/routes?schema=3` and every representative
`/api/v1/studio/routes/:slug` request return 500. The schema-v2 route listing,
route history, route speed history, route hourly profile, and immutable route
artifacts return 200.

This isolates the blocker to the exact route-index v3/D1 serving boundary that
Plan 094 must consume. The browser implementation itself is verified against
the same immutable route content and canonical typed evidence, but production
cannot render it until that upstream contract is satisfied. A fallback to the
legacy route projection would silently discard the Plan 091/092 exact identity
contract and is therefore rejected. No D1/R2 data or publication object was
changed during this audit.

## STOP conditions

Stop instead of improvising if preserving a typed record requires prose
classification or route aliasing; if Current state cannot remain explicit; if
a candidate/unapproved artifact would be exposed; if study or publication
gates would be weakened; or if a required verification fails twice after a
reasonable repair.
