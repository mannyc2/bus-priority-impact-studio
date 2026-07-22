# Plan 089: Redesign `/interventions` as a typed network ledger

## Status

- **State**: IN PROGRESS
- **Priority**: P1
- **Effort**: M
- **Depends on**: Plans 090, 091, 092, and 093 (DONE)
- **Authority**: operator approval on 2026-07-22 for D22-D27 exactly as shown
  in `plans/mockups/089-interventions-redesign/interventions-comp.html`

## Binding design decisions

The approved round-4 comp is the visual and copy authority for this plan.

- Preserve the previously approved Variant A, hero band/table dress, two
  surfaces, stat-tab header, toolbar selects, and in-card histogram (D17,
  D18, D20).
- Preserve the rejected hero forest plot, `Studied` tab, and labeled year
  divider rows. Do not reintroduce them.
- **D22**: use a text-only hero with one compact, data-derived mono summary
  line and no chart.
- **D23**: make `Documented` and `Planned` the only tabs. `Studied only` is an
  accessible toolbar filter, because study coverage is an attribute rather
  than a record partition.
- **D24**: group documented records ledger-style by margin year with counts
  and a firmer opening rule. Group planned records by a structured source-plan
  label. Never infer a plan name from prose; use an honest unnamed-plan label
  when current contracts provide none.
- **D25**: remove redundant kind badges from documented rows. Preserve only
  meaningful planned/source-state badges.
- **D26**: compress the outcome column to an estimate, a confidence interval
  when available, and a linked `matched-segment study` or `descriptive study`
  register label. Existing peer-adjusted comparisons remain muted and
  unlinked.
- **D27**: use the headline `What the city built for buses — and what it
  changed.` and the approved standfirst `Every documented bus lane, busway,
  camera corridor, and service change on the tracked network — with
  matched-control studies where the data can support them.`

Plan 092's exact-route URL, typed family, search, History deep-link,
accessibility, and pagination contracts remain binding. The toolbar may retain
its exact-route control as the smallest compatibility adaptation to the comp.
The current typed contract calls its stable grouping a treatment family; the
UI may label that control `Kind` but must filter only on those typed facet
values, never row prose.

## Scope and evidence boundary

Implement only the public `/interventions` route and its focused tests, then
record the implementation receipt in project documentation.

- Partition records from typed lifecycle state where available, with the
  existing explicit proposed/future source state as the fallback. Do not use
  titles or descriptions.
- Resolve study coverage from the published `StudyIndexArtifact`; do not treat
  a candidate, awaiting-approval row, or descriptive comparison as a newly
  authorized study.
- Derive all counts and histogram bins from the same record universe used by
  the page. No comp number is production data.
- Preserve exact route IDs/slugs and stable occurrence/treatment/project
  History targets from Plan 092.
- Preserve undated records as explicit rollups and keep the 30-row load-more
  boundary. A page slice must never split a group without honest remaining
  counts.
- Do not change evidence schemas, estimation, publication gates, Worker
  serving contracts, D1/R2 contents, or route History behavior.

## Implementation steps

1. Add focused fixtures/tests for the two partitions, studied filtering,
   histogram derivation, year/source-plan grouping, compact study labels,
   undated rollups, pagination, URL normalization, exact History links, and
   accessible control names.
2. Replace the sidebar/timeline layout with the approved text hero and one
   responsive ledger card containing stat tabs, toolbar, histogram, column
   header, grouped rows, undated rollups, and load-more control.
3. Keep filter and tab state URL-backed. Preserve bounded query strings,
   default omission, post-load exact-route validation, live match
   announcements, and pagination reset behavior.
4. Run focused web tests while iterating, then the complete type, style,
   architecture, unit/web/Worker, build, knowledge, SEO, performance, and
   design-doctrine gates.
5. Perform and record desktop and 390 px browser checks for keyboard control,
   focus visibility, URL back/forward restoration, History links, no
   horizontal overflow, readable outcome compression, and data-derived
   histogram/group counts.
6. Commit, push, open a ready PR, merge only after required checks, let the
   normal main-branch workflow deploy, and verify the production route and
   API without publishing new data artifacts.

## Acceptance criteria

- [ ] D22-D27 and every preserved resolved/rejected comp decision are visible
      in the implementation, with no hard-coded artifact counts.
- [ ] Only Documented and Planned are tabs; studied is a composable,
      accessible URL-backed filter.
- [ ] The histogram and all tab/group/summary counts derive from current
      rows, typed facets, and the published study index.
- [ ] Documented rows group by margin year; planned rows group by structured
      plan/source label; undated and unnamed-plan states remain honest.
- [ ] Documented rows have no redundant kind/status badges; planned/source-gap
      rows retain only meaningful state badges.
- [ ] Study rows show the approved compact register labels and confidence
      intervals; peer-adjusted rows are muted, unlinked, and descriptive.
- [ ] Plan 092 URL bounds, exact identity, History links, announcements,
      pagination reset/load-more, and responsive/accessibility behavior pass.
- [ ] No evidence contract, study gate, publication authority, or serving
      artifact changes.
- [ ] Focused tests, `bun run check`, `bun run check:web-release`,
      `bun run check:knowledge`, and the recorded browser pass succeed.
- [ ] The ready PR merges, the normal production deploy succeeds, and the live
      `/interventions` route is verified.

## STOP conditions

Stop and report rather than improvising if the live post-093 contracts cannot
express partition, typed filter, exact route, stable History target, or study
coverage without prose inference; if a candidate/unapproved artifact would be
needed; if a design request would weaken an evidence/publication gate; or if a
required verification fails twice after a reasonable fix.
