# Plan 093: Expand typed intervention relevance beyond ACE without weakening study admission

> **Executor instructions**: Follow this plan step by step. Confirm every
> verification result before continuing. If a STOP condition occurs, stop and
> report — never fill a missing relevance decision with a generic speed or
> ridership chart. Update this plan's row in `plans/README.md` when complete.
>
> **Dependency check (run first)**: Plans 091, 090, 092, and 082 must all say
> `DONE`. Plan 091 supplies exact typed treatments/occurrences; Plan 090 owns
> the value-blind observation contract; Plan 092 owns presentation taxonomy;
> Plan 082 supplies the first typed chart renderer. Plans 074/075 remain the
> independent study lane and may still be inactive pending their recorded
> gates; this plan does not activate them.
>
> **Input preflight (run next)**: the Plan 091 inventory index and every
> referenced bundle must strictly decode, and their `releaseId`, `publishedAt`,
> and coverage identity must match
> `data/artifacts/studio/v1/release.json`. Plan 090's observation index must
> name `studio_route_intervention_inventory` and
> `local_route_month_trends_history` as its exact two input refs. A mixed or
> stale release is a STOP before any write.
>
> **Drift check**:
> `git diff --stat ac940967..HEAD -- packages/analytics/src/intervention-evidence packages/analytics/src/data-products/registry.ts packages/domain/src/studio/intervention-observations.ts tools/pipeline-v2/src/lib/intervention-observations.ts tools/pipeline-v2/src/lib/study-engine/study-events.ts tools/pipeline-v2/src/commands/studio/export-intervention-observations.ts apps/web/src/components/route/intervention-trend-model.ts apps/web/src/components/route/OverviewSection.tsx apps/web/test/shared/intervention-trend-model.test.ts knowledge/wiki/engineering/intervention_evidence_relevance.md`
>
> The dependency plans are expected to create or edit most paths. Compare the
> live IDs, Effect schemas, route inventory occurrence fields, claim ceilings,
> and chart model with "Current state". If an equivalent concept moved, report
> and update the plan references. If semantics differ, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (new descriptive observation admission and public chart
  coverage; bounded by pre-value specs, explicit unsupported dispositions,
  immutable study behavior, and annotation-only rendering)
- **Depends on**: `plans/091-route-intervention-inventory.md`,
  `plans/090-structured-intervention-observations.md`,
  `plans/092-route-intervention-recognition-ui.md`, and
  `plans/082-route-trend-intervention-markers.md` (all HARD)
- **Category**: direction
- **Planned at**: commit `ac940967`, 2026-07-18

## Why this matters

Plan 090 deliberately supports only automated bus-lane enforcement. That is
the right safe first slice, but it is not the complete version of the user's
idea: Tracker should programmatically know which of its own products and
metrics are relevant to each treatment, resolve those observations around a
reviewed occurrence, and visualize them without relying on extracted claims.
If the roadmap stops at 090 + 082, bus lanes, busways, signal work, stop
changes, boarding/fare changes, service redesigns, and capital work remain
explicitly unsupported for inline data even after Plan 092 acknowledges them
in the inventory.

This plan makes support breadth auditable. It gives every canonical treatment
kind a value-blind disposition and unlock requirement, adds route-level
descriptive specifications for `bus_lane` and `busway`, and extends the typed
Overview renderer to those occurrences. It does not infer causal effects,
approve candidates, or weaken the stricter study event gate.

## Current state after the dependencies

### Plan 090 is a foundation, not broad coverage

`plans/090-structured-intervention-observations.md` fixes two ACE bindings
before values are read:

| Binding | Metric | Role | Claim ceiling |
|---|---|---|---|
| `route_speed_around_implementation_v1` | `route_average_speed_mph` | primary outcome | descriptive observation |
| `route_ridership_around_implementation_v1` | `route_monthly_ridership` | context | descriptive observation |

Both use a 25-month event-centered window. Every other admitted family emits
`unsupported_treatment_family` with `analysisFamily: null` and no bindings.
The plan's value-magnitude
invariance tests and ban on before/after deltas are binding here.

### Displayable, observable, and study-eligible are different gates

- Plan 092 may display every reviewed treatment/occurrence supplied by Plan
  091's route inventory. Displayability requires source lineage and exact
  identity, not a metric.
- Plan 090 observations require a reviewed relevance specification and data
  coverage. They are descriptive series only.
- `tools/pipeline-v2/src/lib/study-engine/study-events.ts` applies the causal
  candidate gate used by Plan 074. Its sources, treatment families, date
  checks, overlap gates, approvals, and rejection reasons must remain
  byte-for-byte behaviorally unchanged.

Do not reuse the causal gate as the only descriptive gate: that would keep
all non-study families invisible. Do not weaken it either. Add a separate
observation-anchor admission function over Plan 091's published inventory.

### Existing products are sufficient for the first extension

After Plan 090, the registry already references:

- `local_route_month_trends_history` at route × month grain;
- feature contract `route_metric_history` with resolver
  `sqlite.local_route_month_trend.history.v1`;
- `route_average_speed_mph` and `route_monthly_ridership` metrics;
- explicit coverage and null-gap handling.

These route-level products can describe route-wide context around a bus-lane
or busway implementation. For a corridor/segment-scoped treatment, route
average speed is **context**, not a localized treatment outcome. This plan
does not silently substitute it for the segment-scope product. A future
reviewed spec may use `route_segment_month` only after deterministic physical
scope → served segment IDs is proven.

## Target relevance registry

Every canonical treatment kind from Plan 091 must have exactly one registry
entry with:

```ts
type TreatmentRelevanceDisposition =
  | { status: "supported"; specIds: readonly string[] }
  | { status: "blocked"; reasonId: string; unlockRequirement: string }
  | { status: "not_relevant"; reasonId: string };
```

Each supported spec fixes, before values are read:

- canonical treatment kind/family and admitted lifecycle/date/scope states;
- product ID, feature grain, resolver ID, metric ID, units, and role;
- exact entity join policy and coverage floor;
- before/after display window and null policy;
- claim ceiling and fixed display priority;
- required lineage and method limitation text.

Unknown/custom `other_documented` values are blocked by default and preserve
their raw label. A project milestone without a related typed treatment
occurrence is timeline-only; project title text never selects a spec.

### First non-ACE specifications (binding)

Add `bus_lane` and `busway` using the existing route metric history:

| Kind | Route scope speed role | Corridor/segment scope speed role | Ridership role | Window | Claim ceiling |
|---|---|---|---|---|---|
| `bus_lane` | `primary_outcome` | `context` with scope-mismatch limitation | `context` | implementation month ±12 | `descriptive_observation` |
| `busway` | `primary_outcome` | `context` with scope-mismatch limitation | `context` | implementation month ±12 | `descriptive_observation` |

Use distinct stable binding/spec IDs for the two treatment kinds, while both
reference the canonical product/resolver/metric definitions. Do not copy raw
column/resolver strings without registry consistency tests. If a treatment's
scope is `source_only`, its route-speed binding is blocked with
`scope_unresolved`; it remains visible in inventory/timeline.

The remaining kinds stay explicit `blocked` or `not_relevant` in this plan.
Their reasons must name a concrete missing semantic or data contract, for
example: current TSP route/intersection inventory, stop-level dwell/boarding
history, route-lineage comparability across redesigns, or a dated operational
occurrence. Do not claim support merely because route speed exists.

## Observation-anchor gate

Add a tagged pure gate over Plan 091 occurrence/treatment rows. An anchor is
eligible for descriptive resolution only when:

- route identity is exact/projectable and the bundle route matches the
  occurrence route ref;
- the treatment kind has a supported relevance disposition;
- lifecycle state is current/implemented/historical-confirmed, never planned,
  proposed, candidate, source-gap, or `awaiting_approval`;
- effective date has day or month precision and yields a valid ISO month;
- required source refs/lineage exist and relevant `sourceStates` are not
  unavailable;
- scope is admitted by the spec;
- event/treatment IDs are stable and nonempty.

Return tagged rejections such as `unsupported_treatment_kind`,
`non_operational_lifecycle`, `date_precision_insufficient`,
`source_unavailable`, `scope_unresolved`, and `route_identity_mismatch`.
Count every rejection in the export summary. This eligibility authorizes only
descriptive observations; it must not be imported by the study engine.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Analytics tests | `bun --filter @bp/analytics test` | exit 0; exhaustive registry and invariance tests pass |
| Domain tests | `bun --filter @bp/domain test` | exit 0; expanded strict observation bundle decodes |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | exit 0; anchor gate/materializer tests pass and study snapshots are unchanged |
| Inventory preflight/export | `bun run pipeline -- studio export-route-intervention-inventory --db data/local/pipeline.sqlite --release-artifact data/artifacts/studio/v1/release.json --intervention-corpus data/artifacts/studio/v2/interventions/corpus.json --route-evidence-index data/artifacts/studio/v2/wiki/index.json --wiki-occurrences data/artifacts/studio/v2/wiki/operational-occurrences-v3.json --artifact-root data/artifacts` | exit 0; v5 occurrence + v2 evidence inputs agree and strict route inventory is current |
| Observation export | `bun run pipeline -- studio export-intervention-observations --db data/local/pipeline.sqlite --inventory-index data/artifacts/studio/v2/interventions/route-inventory-index.json --release-artifact data/artifacts/studio/v1/release.json --artifact-root data/artifacts` | exit 0; ACE + supported bus-lane/busway counts and explicit rejection counts print |
| Focused web | `bun test apps/web/test/shared/route-intervention-model.test.ts apps/web/test/shared/intervention-trend-model.test.ts apps/web/test/shared/overview-section.test.ts --timeout 5000` | all pass |
| Web suite/build | `bun run test:web && bun --filter @bp/web build` | exit 0; bundle budget passes |
| Full gate | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use the `effect-ts` skill if available for additions to the strict
  observation artifact schema.
- Use `vercel-react-best-practices` if available for the pure chart-selection
  model; no renderer should scan observed values to choose an event/metric.

## Scope

**In scope** (the only files to create/modify; use the live equivalent path
if Plan 090 created a directory with the same named responsibility):

- `packages/analytics/src/intervention-evidence/spec.ts`
- `packages/analytics/src/intervention-evidence/index.ts`
- `packages/analytics/src/data-products/registry.ts`
- `packages/analytics/test/intervention-evidence-spec.test.ts`
- `packages/domain/src/studio/intervention-observations.ts`
- `packages/domain/src/studio/index.ts`
- `packages/domain/test/studio-intervention-observations.test.ts`
- `tools/pipeline-v2/src/lib/intervention-observation-events.ts` (new)
- `tools/pipeline-v2/src/lib/intervention-observations.ts`
- `tools/pipeline-v2/src/commands/studio/export-intervention-observations.ts`
- `tools/pipeline-v2/test/lib/intervention-observation-events.test.ts` (new)
- `tools/pipeline-v2/test/lib/intervention-observations.test.ts`
- `tools/pipeline-v2/test/commands/studio/export-intervention-observations.test.ts`
- `tools/pipeline-v2/test/lib/study-events.test.ts` (characterization only;
  no production study-gate edits)
- `apps/web/src/components/route/intervention-trend-model.ts`
- `apps/web/src/components/route/route-intervention-model.ts` (extend Plan
  092's named presentation helper only)
- `apps/web/src/components/route/OverviewSection.tsx`
- `apps/web/test/shared/intervention-trend-model.test.ts`
- `apps/web/test/shared/route-intervention-model.test.ts`
- `apps/web/test/shared/overview-section.test.ts`
- `knowledge/wiki/engineering/intervention_evidence_relevance.md`
- `knowledge/wiki/engineering/cli_commands.md`
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope**:

- `tools/pipeline-v2/src/lib/study-engine/study-events.ts`, study candidates,
  approvals, estimators, gates, artifacts, publication, or Plan 075 activation.
- New source extraction, Wiki admission, route identity, treatment inventory,
  route badge, or `/interventions` filter work.
- Generic expression/query DSLs, embeddings/LLM metric selection, or selecting
  metrics/events because observed values are large, favorable, significant,
  complete, or visually interesting.
- Segment-localized outcome claims. Route context is labeled as such until a
  separate deterministic treatment-scope → segment contract lands.
- Before/after means, deltas, percentages, directions, verdicts, causal copy,
  or project-title-derived markers.
- Supporting every family in one batch. Explicit blocked entries are a valid
  and required result.

## Git workflow

- Branch: `codex/093-expand-intervention-relevance` after all dependencies.
- Commit the registry/disposition matrix before running or inspecting any
  observation export. Follow with anchor gate/materializer, renderer, then
  docs/tests receipts.
- Do not push, publish artifacts, deploy, or open a PR unless separately
  requested.

## Steps

### Step 1: Make coverage exhaustive before reading values

1. Extend Plan 090's registry so every Plan 091 canonical treatment kind has
   exactly one disposition. Add the bus-lane/busway specs exactly as above;
   give every remaining kind a stable blocking/not-relevant reason and unlock
   requirement, retaining `analysisFamily: null` for every unsupported or
   not-relevant disposition.
2. Derive product/resolver/metric metadata from the canonical registries and
   assert consistency. Do not read SQLite or artifact observation values in
   this step.
3. Add compile-time/runtime exhaustiveness tests and a serialized coverage
   matrix snapshot sorted by treatment kind/spec ID.
4. Add value-blind invariance fixtures: identical metadata with rising,
   falling, flat, large, small, and null-heavy values selects the same specs
   and priorities.

**Verify**:
`bun test packages/analytics/test/intervention-evidence-spec.test.ts --timeout 5000`
→ all dispositions, metadata consistency, and invariance tests pass.

### Step 2: Add a separate descriptive observation-anchor gate

1. Create `intervention-observation-events.ts` over Plan 091 bundle types and
   implement the exact tagged gate above.
2. Deduplicate only by stable occurrence ID + exact route + treatment ID. Do
   not deduplicate by date/family/title.
3. Add fixtures for route and corridor scopes, source-only scope, year-only
   dates, planned/candidate rows, missing source, B44/B44+ mismatch, and two
   occurrences in one family.
4. Add a characterization test around the existing study-event fixture. The
   candidate/admitted/rejection output before and after this plan must be
   identical; production `study-events.ts` is out of scope.

**Verify**:
`bun test tools/pipeline-v2/test/lib/intervention-observation-events.test.ts tools/pipeline-v2/test/lib/study-events.test.ts --timeout 5000`
→ observation cases pass and the study characterization is unchanged.

### Step 3: Resolve bus-lane/busway observations into strict bundles

1. Teach the Plan 090 materializer to load strictly decoded Plan 091
   inventories and admit supported inventory occurrences through the new
   descriptive gate. Keep the existing trusted ACE path behavior stable.
   Before loading observation values, require the inventory index and every
   referenced bundle to share the Studio release artifact's `releaseId` and
   `publishedAt`; require compatible coverage identity and preserve the
   inventory + trend products as the exact two observation `inputRefs`.
2. Resolve route monthly speed and riders with the same 25-month window/null
   policy. For corridor/segment treatment scope, mark route speed's role and
   limitation as contextual. For `source_only`, emit an explicit unavailable
   binding/rejection rather than values.
3. Keep selection before values. Observation reads happen only after exact
   event/spec/binding resolution. Preserve source product IDs, resolver IDs,
   coverage, null points, scope, claim ceiling, and limitations.
4. Extend export summaries with per-kind/spec/status/source/rejection counts.
   Unknown treatment kinds cannot disappear into ACE or generic route speed.
   Missing/stale inventory, a mixed-release bundle, or an observation input
   ref mismatch fails before any output file is opened.

**Verify**:
`bun test tools/pipeline-v2/test/lib/intervention-observations.test.ts tools/pipeline-v2/test/commands/studio/export-intervention-observations.test.ts --timeout 5000`
→ all pass, including shuffled-input determinism, magnitude invariance,
missing inventory, and mixed `releaseId`/`publishedAt` rejection before
writes.

### Step 4: Extend the typed chart model, not the History heuristic

1. Extend Plan 092's named treatment presentation helper with reviewed
   operational annotation stems `Bus lane starts` and `Busway starts`; keep
   all other metadata unchanged. Then extend `intervention-trend-model.ts` to
   recognize the new stable bindings and resolve each marker by occurrence/
   treatment ID through that helper, exactly like amended Plan 082.
2. Choose focal event/spec by fixed registry priority, implementation month,
   then stable ID. Never inspect point values, direction, completeness beyond
   the spec's predeclared minimum, or study results.
3. Render bus-lane/busway implementation markers on the real month axis. When
   the selected speed binding is contextual because physical scope is
   narrower than the route, label it "Route average speed (context)" and
   expose the method limitation near the chart.
4. Preserve Plan 082's dossier fallback: unsupported/unavailable bundles show
   the ordinary month-preserving speed trend with zero derived markers.
5. Do not derive a project-start marker unless the bundle contains a typed,
   dated operational occurrence related to that project.

**Verify**:
`bun test apps/web/test/shared/route-intervention-model.test.ts apps/web/test/shared/intervention-trend-model.test.ts apps/web/test/shared/overview-section.test.ts --timeout 5000`
→ ACE regressions plus bus-lane/busway route/context/unsupported cases pass.

### Step 5: Document the coverage matrix and future unlock protocol

Update `intervention_evidence_relevance.md` with:

- exhaustive supported/blocked/not-relevant matrix generated from the
  registry (not manually divergent prose);
- display vs observation vs study gate table;
- first-spec semantics and contextual-scope limitation;
- procedure for adding one family: source/occurrence authority, product,
  grain, metric, scope, window, coverage, claim ceiling, value-blind tests,
  and renderer label;
- explicit blockers for remaining kinds and the data contract that would
  unlock each.

Append counts and verification receipts to `knowledge/log.md`.

**Verify**:

```sh
bun run check:knowledge
bun run test:web
bun --filter @bp/web build
bun run check
```

Expected: all exit 0.

## Test plan

- Exhaustive disposition for every canonical treatment kind and raw custom
  fallback.
- Bus-lane/busway route, corridor/segment context, source-only blocked, and
  missing/partial coverage.
- Exact identity and stable occurrence dedupe, including B44/B44+.
- Lifecycle/date/source gate rejection cases.
- Values rising/falling/flat/null-heavy produce identical binding/event
  selection and priority.
- Existing ACE observation outputs and study-event characterization remain
  unchanged.
- Inventory provenance: missing/stale index, bundle/release metadata mismatch,
  coverage mismatch, and wrong input-ref product fail before writes.
- Chart uses typed IDs/labels, context limitation, real dates, and zero-marker
  dossier fallback; no delta/effect language.

## Done criteria

- [ ] Every canonical treatment kind is programmatically supported, blocked, or not relevant with an explicit reason/unlock requirement.
- [ ] `bus_lane` and `busway` produce value-blind typed route observation bundles for eligible reviewed occurrences.
- [ ] Corridor/segment scope is labeled route context; source-only scope receives no guessed values.
- [ ] Observation-anchor admission is separate from study admission, and study fixture outputs are unchanged.
- [ ] Every observation bundle retains exactly the matching Plan 091 inventory
      and route-trend input refs; mixed release/provenance fails before writes.
- [ ] Plan 082's renderer shows typed bus-lane/busway markers/series without text parsing or numeric cherry-picking.
- [ ] Unsupported kinds remain visible in Plan 092 inventory with zero generic observation fallback.
- [ ] No before/after/effect fields or causal language are added.
- [ ] `bun run check` exits 0 and only Scope files changed.

## STOP conditions

Stop and report if:

- any dependency is not DONE or the live schemas cannot express exact
  treatment/occurrence/scope/source state;
- a proposed spec cannot name a canonical product, feature grain, resolver,
  metric, coverage rule, scope policy, and claim ceiling before values are
  read;
- the first two kinds would require title/claim parsing, route-family joining,
  a candidate/approval change, or a causal gate relaxation;
- a corridor/segment treatment would be presented as a localized outcome
  without deterministic segment scope;
- existing ACE observation or study characterization changes;
- an unsupported kind would silently receive generic speed/ridership;
- verification fails twice after a reasonable fix or an out-of-scope file is
  required.

## Maintenance notes

- Add one reviewed relevance spec at a time. A complete disposition matrix
  does not mean every family must have a chart.
- Revisit TSP only after a current route/intersection inventory exists;
  revisit stop/fare work when the relevant stop/dwell/boarding grain exists;
  revisit route redesign after exact longitudinal route-lineage comparability
  is modeled.
- Reviewers should inspect registry changes before generated observations and
  verify that no favorable result influenced support, priority, or copy.
- Inventory acknowledgement can grow independently of observation/study
  coverage; keep those product claims separate in UI and documentation.
