# Plan 089: Redesign `/interventions` as a typed network ledger

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: M
- **Depends on**: Plans 090, 091, 092, and 093 (DONE)
- **Authority**: operator approval on 2026-07-22 for D22-D27 exactly as shown
  in `plans/mockups/089-interventions-redesign/interventions-comp.html`

## Implementation receipt

The executable plan landed in `d6c87026`; the typed ledger implementation and
focused regression suite landed in `25bb9c71`. [PR #92](https://github.com/mannyc2/bus-priority-impact-studio/pull/92)
merged the accepted surface at `e7ec1fca37e674e5d53d4cedbcf43ac968b5ac76`.
Production verification then found that the published D1 schema predated the
exact route-trip table and that D1 route cards did not carry the already-public
route annotations. [PR #93](https://github.com/mannyc2/bus-priority-impact-studio/pull/93)
added a narrow legacy-schema availability state at merge
`1f781d9700eae09968fa696b8f8247cf3cd70d4c`; [PR #94](https://github.com/mannyc2/bus-priority-impact-studio/pull/94)
then joined only the published `interventions` arrays by exact, case-sensitive
route ID at merge `9accf147c8b9672fbb764a773f3c63f417be4861`.
D1 remains authoritative for current route identity and operating data. No
schema, D1/R2 object, study artifact, evidence gate, or publication authority
changed.

Browser verification used the canonical read-only schema-v2 route projection,
reviewed intervention corpus, and published study index. Their SHA-256 values
were respectively `8fa238d0b5d813244ef1fcf64ade28051d11eb4b3e8c55fec9500ce0a614e56f`,
`e03bac5f07fd2fbe64264d7132050e28f073c79943c451bdb5da4d8988100ab7`,
and `8569856cd4ab2e7bd31d362a37d783696b8a0acb9dea425f519fcaaba5ce5487`.
That real-data pass rendered 631 documented, 248 planned, and five studied
records without hard-coded counts. The canonical read-only root does not yet
contain the post-093 facet-index artifact, so the Kind control correctly
rendered unavailable and retained all rows; no prose fallback was introduced.

At 1440 px and 390 px, the browser pass verified two tabs, one accessible
Studied checkbox, keyboard tab movement, visible focus, URL back/forward
restoration, exact History targets, plan/year groups, and zero page-level
horizontal overflow. Focused tests pass 18/18; the adjacent interventions,
History, and study-display set passes 42/42. Types, architecture, unit/web,
Worker, bundle, SEO, performance, and scoped Biome checks pass. The complete
`bun run check` reaches only a pre-existing repository-wide Biome 2.5.3
failure in `analytics-primer.html` and `apps/web/src/routes/routes/index.tsx`;
the same four errors reproduce on an untouched `origin/main` snapshot.

The final main workflow `29919113313` passed verification and deployed the
merged Worker. Production returned HTTP 200 for `/interventions`, the route
API, the reviewed corpus, and the published study index. The route API served
389 exact route cards and 569 public annotations; B44 remained `b44` and B44+
remained `b44-sbs`. The live ledger derived 631 documented, 248 planned, and
six studied rows, exposed exactly two tabs and one Studied checkbox, preserved
an exact History target, and had no horizontal overflow at either viewport.
The optional post-093 facet artifact is still absent (HTTP 404), so Kind stays
disabled, and the legacy release cannot satisfy the strict v3 evidence-bundle
closure (HTTP 500), so that optional contribution remains fail-closed. Both
states are handled without losing approved public route/corpus records or
substituting prose inference.

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

- [x] D22-D27 and every preserved resolved/rejected comp decision are visible
      in the implementation, with no hard-coded artifact counts.
- [x] Only Documented and Planned are tabs; studied is a composable,
      accessible URL-backed filter.
- [x] The histogram and all tab/group/summary counts derive from current
      rows, typed facets, and the published study index.
- [x] Documented rows group by margin year; planned rows group by structured
      plan/source label; undated and unnamed-plan states remain honest.
- [x] Documented rows have no redundant kind/status badges; planned/source-gap
      rows retain only meaningful state badges.
- [x] Study rows show the approved compact register labels and confidence
      intervals; peer-adjusted rows are muted, unlinked, and descriptive.
- [x] Plan 092 URL bounds, exact identity, History links, announcements,
      pagination reset/load-more, and responsive/accessibility behavior pass.
- [x] No evidence contract, study gate, publication authority, or serving
      artifact changes.
- [x] Focused tests, repository verification, `bun run check:web-release`,
      `bun run check:knowledge`, and the recorded browser pass succeed. All
      Plan 089 gates pass; the repository-wide style baseline remains as
      recorded above.
- [x] The ready PR merges, the normal production deploy succeeds, and the live
      `/interventions` route is verified.

## STOP conditions

Stop and report rather than improvising if the live post-093 contracts cannot
express partition, typed filter, exact route, stable History target, or study
coverage without prose inference; if a candidate/unapproved artifact would be
needed; if a design request would weaken an evidence/publication gate; or if a
required verification fails twice after a reasonable fix.
