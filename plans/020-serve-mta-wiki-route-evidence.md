# Plan 020: Serve the MTA-wiki route evidence end-to-end

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```sh
> rg -n 'StudioRouteEvidence' packages tools apps --include-zero
> git log --oneline -3 -- tools/pipeline-v2/src/commands/studio/import-mta-wiki-route-evidence.ts
> ```
>
> If anything besides the importer and the domain contract references
> `StudioRouteEvidence*`, someone started this work — reconcile before
> proceeding.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plan 019 (landed tree)
- **Category**: product / serving
- **Planned at**: 2026-07-01

## Why this matters

Plan 016 built the contract and importer; nothing consumes it. The
`bp.studio.route_evidence.v1` artifact (2.7 MB,
`data/artifacts/studio/v2/wiki/route-evidence.json`) carries 12 route bundles
with 2,354 citations — timelines, interventions, metric claims, projects, and
source gaps, all block-cited to real documents — and the public route pages
render **none of it**. The Evidence/timeline surfaces still read the old
Tier 2 materialized views (`Tier2RouteEvidenceBundle` in
`packages/studio-api/src/studio/read-handlers.ts:158`), produced by the
68 kLOC `docs/tier2` command tree that plan 024 wants to delete.

This plan is the last mile: publish the artifact per-route, serve it through
the existing API surface, render it, and switch the timeline path off the
Tier 2 bundles. It is what makes MTA-wiki *the* document-evidence backend of
the product — and it is the deletion precondition for plan 024.

## Current state

- Importer: `tools/pipeline-v2/src/commands/studio/import-mta-wiki-route-evidence.ts`
  (`studio import-mta-wiki-route-evidence`). Output summary on 2026-07-01:
  `routeCount: 12, matchedBusRouteCount: 12, unmatchedWikiRouteCount: 300,
  citationCount: 2354, omittedAmbiguousRecordCount: 147`. All 12 served routes
  matched; the 300 unmatched wiki routes are corpus routes the product does
  not serve yet (plan 021 expands the corpus; do not chase them here).
- Contract: `packages/domain/src/studio/route-evidence.ts`
  (`StudioRouteEvidenceArtifactSchema`, `StudioRouteEvidenceBundleSchema`,
  strict, citation-keyed).
- Serving today: `GET /api/v1/studio/routes/:routeId/timeline` serves Tier 2
  route timeline bundles indexed by the D1 `route_timeline_index` table;
  `read-handlers.ts` also folds Tier 2 evidence bundles into route detail.
- R2 publish flow: `publish/r2-artifacts` command; artifact keys validated by
  `isValidArtifactKey` (plan 012). D1 `route_artifact` table maps
  `(routeId, month, artifactName) → key/sha/bytes`.
- Web: route detail renders Evidence via `DataNotesSection.tsx` and
  Treatments/Timeline via `TreatmentsHistorySection.tsx` /
  `TimelineSection.tsx`; `/interventions` page
  (`apps/web/src/studio/pages/interventions.tsx`, 194 LOC) renders from route
  detail projections.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rebuild artifact | `bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-route-evidence --mta-wiki-root /mnt/models/dev/mta-wiki --json` | exit 0, ≥12 matched routes |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test --timeout 5000` | pass |
| API tests | `bun --filter @bp/studio-api test` | pass |
| Worker tests | `bun --filter @bp/web test:worker` | pass |
| Web build | `bun --filter @bp/web build` | exit 0, budget passes |
| Architecture | `bun run check:web-architecture` | exit 0 |

## Scope

**In scope**:

- Pipeline: a publish step that splits the artifact into per-route R2 objects
- `packages/studio-api`: serving the per-route evidence bundle
- `packages/domain`: only additive serving-shape tweaks if strictly needed
- `apps/web`: rendering evidence (timeline, interventions, metric claims,
  source gaps, citations) on the route page; feeding `/interventions` from it
- Cutover of the timeline endpoint from Tier 2 bundles to wiki evidence

**Out of scope**:

- Editing `/mnt/models/dev/mta-wiki` (work orders live in plan 028).
- Expanding the served route corpus (plan 021).
- Deleting the Tier 2 pipeline (plan 024 — but this plan must record the
  parity evidence 024 needs).
- Any visual redesign beyond what rendering the new data requires (plan 022).

## Steps

### Step 1: Publish per-route evidence artifacts

Extend the publish path so each `StudioRouteEvidenceBundle` lands at its own
R2 key, e.g. `studio/v2/wiki/routes/<routeSlug>.json`, plus a small index
object `studio/v2/wiki/index.json` (route list, generatedAt, counts). Whole
bundles are small (2.7 MB / 12 routes); no pagination needed. Reuse the
existing `publish/r2-artifacts` mechanics and key validation; record keys in
`route_artifact` or a sibling index the read path can consult — follow
whichever pattern `route-speed-history` artifacts already use, do not invent
a new registry.

**Verify**: pipeline test with a fixture artifact proves the split writes one
object per route + index, deterministically ordered.

### Step 2: Serve the bundle

Add the evidence bundle to the existing route surface — prefer extending the
route timeline endpoint's response (it is already route-scoped and cached)
over adding a new endpoint; fall back to
`GET /api/v1/studio/routes/:routeId/evidence` if the shapes fight. Responses
must be the domain schema's shape (strict, citation-keyed); no synthesized
fields. Sparse/missing bundle → explicit empty shape, not 404, so every route
page can render an honest empty state.

**Verify**: studio-api test: fixture bundle in a fake R2 → endpoint returns
schema-valid payload; missing bundle → typed empty; worker tests pass.

### Step 3: Render it on the route page

Feed the existing sections from the new payload:

- Timeline: merge wiki timeline events (dated + date-text) into
  `TimelineSection`; keep D1 `intervention_event` rows; dedupe on
  (date, kind, label) with wiki citations winning ties.
- Treatments: render wiki interventions/projects with their citations.
- Evidence/Data notes: render source gaps and the citation list (source
  title, publisher, date, page) — each evidence item links its citations.
- Metric claims: render as a compact "what sources claim" list (value, unit,
  scope, citation) — clearly attributed as source statements, not our
  measurements.

Copy rule: citations are the product's spine — every wiki-derived row that
renders must show or link its citation. Never render a wiki item without one.

**Verify**: `bun test apps/web/test/shared` including a new test: route
fixture with evidence renders timeline/interventions/citations; fixture
without evidence renders honest-empty sections.

### Step 4: Feed /interventions from wiki evidence

The interventions page should aggregate across served routes from the
per-route bundles (or the index object), replacing/augmenting its current
projection source. Keep filters (evaluated/future/needs-source) working;
"needs source" maps naturally to `sourceGaps`.

**Verify**: interventions page test renders wiki-fed rows with citations.

### Step 5: Cut the timeline path over and record parity

Switch the timeline endpoint's backing from Tier 2 bundles to the wiki
evidence path. Before deleting anything, snapshot both payloads for the 12
routes and record the diff in the commit message (this is plan 024's evidence
that Tier 2 timeline serving is retired). Leave the Tier 2 code in place —
024 deletes it.

**Verify**: `bun --filter @bp/studio-api test` + `bun --filter @bp/web
test:worker` green; no route page regression in shared tests.

## Test plan

- Pipeline: per-route split fixture test (deterministic keys/order).
- Studio API: bundle served, empty-state served, schema-validity asserted.
- Web: render + honest-empty tests as above.
- Full pre-merge gate as in plan 019 step 6.

## Done criteria

- [ ] Per-route wiki evidence objects + index published to R2.
- [ ] Route pages render wiki timeline, interventions, metric claims, source
      gaps — every item cited.
- [ ] `/interventions` is fed by wiki evidence.
- [ ] Timeline endpoint no longer reads Tier 2 bundles; parity diff recorded.
- [ ] All verification commands pass; `plans/README.md` updated.

## STOP conditions

- The browser would need to fetch MTA-wiki files or private R2 keys directly
  — the boundary is Worker-served typed responses only.
- Evidence items lack citations at render time — fix upstream in the
  importer, never fabricate or drop the citation silently.
- Timeline parity diff shows the wiki path *losing* real dated events the
  Tier 2 path had — report with examples; the fix may belong in mta-wiki
  (plan 028) or the importer, and a human should choose.
- Bundle budget failure from new rendering code — lazy-load heavier evidence
  UI; do not raise the budget.

## Maintenance notes

- Plan 021 (corpus expansion) multiplies matched routes automatically —
  rerun the importer after each corpus batch; unmatched wiki routes shrink as
  the served corpus grows.
- Plan 024 deletes the Tier 2 producer tree; the parity diff from step 5 is
  its gate.
- Plan 028 asks mta-wiki for a relation-resolved, versioned snapshot export;
  when that lands, the importer shrinks — keep it thin.
