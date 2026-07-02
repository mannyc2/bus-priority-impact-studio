# Plan 016: Define the MTA-wiki route evidence import contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 58dfaeb..HEAD -- \
>   packages/domain/package.json \
>   packages/domain/src/studio \
>   packages/domain/src/json-schema/index.ts \
>   tools/pipeline-v2/src/commands/docs/tier2/mta-wiki-bridge.ts \
>   tools/pipeline-v2/src/commands/studio \
>   tools/pipeline-v2/src/lib \
>   tools/pipeline-v2/test \
>   tests/harness
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch that changes the architecture, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-30

## Why this matters

The product is no longer a brief/finding authoring studio. AI should survive
only backstage as structured source-backed facts from `/mnt/models/dev/mta-wiki`.
That repo already has a large canonical corpus, but it does not expose the
route-shaped artifact the Bus app needs. This plan creates a small Bus-side
contract and read-only importer so later plans can delete composer/research
surfaces without losing timelines, interventions, source citations, and caveats.

## Current state

- `/mnt/models/dev/mta-wiki` is a separate Bun monorepo. Do not add it as a
  workspace dependency of this repo. Treat it as a read-only local data source
  unless the operator explicitly asks to change MTA-wiki itself.
- MTA-wiki canonical data lives under `/mnt/models/dev/mta-wiki/data/canonical`.
  Recon on 2026-06-30 found:
  - `routes.jsonl`: 319 rows
  - `projects.jsonl`: 1,862 rows
  - `events.jsonl`: 7,941 rows
  - `metric_claims.jsonl`: 36,534 rows
  - `relations.jsonl`: 20,650 rows
  - `treatment_components.jsonl`: 2,648 rows
  - `source_gaps.jsonl`: 480 rows
  - `sources.jsonl`: 2,566 rows
- MTA-wiki instructions say structured observations should carry source-backed
  evidence refs and that transcripts are audit surfaces, not factual inputs.
  They also say claims, metric claims, events, treatment components, and
  relations are canonical data-only records that should be inspected through
  canonical record tools and surfaced on related route/project/corridor pages.
- A canonical MTA-wiki record looks like this:

  ```json
  {
    "record_id": "metric_1-15-miles-bus-lanes-may2025",
    "record_kind": "metric_claim",
    "source_ids": ["116_st_morningside_ave_pleasant_ave_cb10_may2025"],
    "payload": {
      "metric_name": "bus_lane_length",
      "value": 1.15,
      "unit": "miles",
      "scope": "116th St project area",
      "description": "Adds 1.15 miles of bus lanes"
    },
    "evidence_refs": [
      {
        "source_id": "116_st_morningside_ave_pleasant_ave_cb10_may2025",
        "evidence_id": "116_st_morningside_ave_pleasant_ave_cb10_may2025#p025_c0002",
        "source_path": "raw/sources/116_st_morningside_ave_pleasant_ave_cb10_may2025/blocks.jsonl",
        "page_number": 25,
        "block_id": "p025_c0002",
        "text_sha256": "sha256:a8dc4aa709766e03fbfa632548213541ce0075809984991754552802cbeed869"
      }
    ]
  }
  ```

- The existing Bus bridge is not the desired product contract:
  `tools/pipeline-v2/src/commands/docs/tier2/mta-wiki-bridge.ts` projects
  canonical JSONL into a Tier 2 intervention review queue and imports
  `@bp/applied-research/evaluation`. Its command summary says it creates an
  "honest Tier 2 intervention review queue bridge." Later source-review code
  tells reviewers to use MTA-wiki rows as supplementary authoring context only.
  This plan creates a public route-evidence import instead.
- `packages/domain/src/studio/routes/index.ts` already has route detail shapes
  for route cards, segments, artifacts, insights, capability, dossier, history,
  and speed-history artifacts. Do not replace those. Add a route-evidence
  artifact that the route page and pipeline can join to the existing route
  detail response.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| MTA-wiki validate | `cd /mnt/models/dev/mta-wiki && bun run validate` | exit 0 |
| Domain typecheck | `bun --filter @bp/domain typecheck` | exit 0, no errors |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0, no errors |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test --timeout 5000` | all relevant tests pass |
| Architecture | `bun run check:web-architecture` | exit 0 |

## Scope

**In scope**:

- `packages/domain/src/studio/route-evidence.ts` (create)
- `packages/domain/src/studio/index.ts`
- `packages/domain/src/json-schema/index.ts`
- `packages/domain/package.json`
- `tools/pipeline-v2/src/lib/mta-wiki-canonical.ts` (create)
- `tools/pipeline-v2/src/commands/studio/import-mta-wiki-route-evidence.ts` (create)
- `tools/pipeline-v2/test/studio-mta-wiki-route-evidence.test.ts` (create)
- Small fixtures under `tools/pipeline-v2/test/fixtures/mta-wiki-route-evidence/` (create)

**Out of scope**:

- Editing `/mnt/models/dev/mta-wiki`. This plan reads that repo only.
- Importing MTA-wiki packages into this repo.
- Changing the web UI.
- Deleting `@bp/applied-research`; that is plan 018.
- Promoting MTA-wiki writer Markdown or transcripts as source facts.

## Steps

### Step 1: Add a narrow domain contract

Create `packages/domain/src/studio/route-evidence.ts` with Zod schemas and
types for a versioned artifact:

- `StudioRouteEvidenceArtifactSchema`
  - `artifactKind: "bp.studio.route_evidence.v1"`
  - `schemaVersion: 1`
  - `generatedAt`
  - `source: { kind: "mta-wiki-canonical-jsonl", mtaWikiRoot, canonicalRoot }`
  - `summary: { routeCount, matchedBusRouteCount, unmatchedWikiRouteCount, citationCount }`
  - `routes: StudioRouteEvidenceBundle[]`
- `StudioRouteEvidenceBundleSchema`
  - Bus route key: `routeId`, `routeSlug`
  - MTA-wiki route key: `wikiRouteRecordId`, `wikiRouteIds`, `wikiAliases`
  - `coverage`: counts for timeline, interventions, metric claims, projects, gaps, and citations
  - `timeline`: dated or date-text events
  - `interventions`: route-scoped treatment/project facts
  - `metricClaims`: source-stated metrics such as bus-lane length, ridership, cost, duration, status
  - `projects`: route-scoped project summaries
  - `sourceGaps`: source-backed gaps
  - `citations`: normalized citations keyed by `source_id#block_id`
- Each evidence item must carry `citationKeys`. Each citation must carry at
  least `sourceId`, `blockId`, `evidenceId`, `sourcePath`, and optional
  `pageNumber`, `sourceTitle`, `publisher`, `sourceUrl`, `publishedDate`.

Use `.strict()` for public artifact shapes. Keep text fields nullable or
optional when MTA-wiki lacks a value; never synthesize a date, metric, or
impact claim.

Export the new schema/types explicitly from `packages/domain/src/studio/index.ts`.
Add a subpath export `./studio/route-evidence` in `packages/domain/package.json`.
If `packages/domain/src/json-schema/index.ts` exports public Studio schemas, add
the route evidence artifact JSON Schema there too.

**Verify**:

```sh
bun --filter @bp/domain typecheck
```

Expected: exit 0.

### Step 2: Add a read-only canonical JSONL loader

Create `tools/pipeline-v2/src/lib/mta-wiki-canonical.ts`.

The loader should:

- Resolve the MTA-wiki root from an explicit option, then `MTA_WIKI_ROOT`, then
  `join(dirname(repoRoot), "mta-wiki")`, matching the existing bridge default.
- Read these files from `data/canonical`: `sources.jsonl`, `routes.jsonl`,
  `projects.jsonl`, `events.jsonl`, `metric_claims.jsonl`, `relations.jsonl`,
  `treatment_components.jsonl`, `source_gaps.jsonl`.
- Parse JSONL with line-numbered errors.
- Expose minimal local TypeScript types for canonical records. Do not import
  from `/mnt/models/dev/mta-wiki` or use `any`.
- Expose helpers to normalize Bus route IDs. Match `M15`, `M15 SBS`,
  `M15-SBS`, and `M15+` to the same comparable key. Preserve the raw aliases
  in output.

You can reuse the existing bridge's path/default/root ideas, but do not import
from `@bp/applied-research`.

**Verify**:

```sh
bun --filter @bp/pipeline-v2 typecheck
```

Expected: exit 0.

### Step 3: Build the route-scoped projection

Create `tools/pipeline-v2/src/commands/studio/import-mta-wiki-route-evidence.ts`
as a Liche command. Suggested command path:

```ts
path: ["studio", "import-mta-wiki-route-evidence"]
```

Options:

- `--mta-wiki-root`
- `--routes-path` defaulting to the current Studio routes projection when available
- `--output` defaulting to `data/artifacts/studio/v2/wiki/route-evidence.json`
- `--generated-at`
- `--min-matched-routes` default `1`

Projection rules:

1. Load the Bus Studio route list so output is keyed by actual Bus route IDs
   and slugs. Use `StudioRoutesResponseSchema`.
2. Match MTA-wiki route records to Bus routes by normalized route ID and aliases
   from `payload.route_id`, `payload.route_label`, `payload.route_name`,
   `_merged_field_values.route_id`, and `_merged_field_values.route_label`.
3. Include facts that are directly related to a matched route by:
   - a `relations.jsonl` edge where `relation_family` is `route_scope`, or
   - a project/treatment/metric/event payload field that explicitly names the
     route ID.
4. From a route-scoped project or corridor, include one hop of related
   `treatment_context`, `timeline_context`, `metric_context`, and
   `claim_context` records. Do not perform open-ended graph traversal.
5. Decorate citations from `sources.jsonl`; if source metadata is absent,
   keep the raw source ID and evidence block data.
6. Deduplicate citation keys and sort output deterministically by route ID,
   date, record ID, and citation key.
7. Mark unsupported/ambiguous records as omitted with counts in `summary`;
   do not guess.

The command should write the artifact and return a compact summary:
`outputPath`, `routeCount`, `matchedBusRouteCount`, `unmatchedWikiRouteCount`,
`citationCount`, and `omittedAmbiguousRecordCount`.

**Verify**:

```sh
bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-route-evidence \
  --mta-wiki-root /mnt/models/dev/mta-wiki \
  --output data/artifacts/studio/v2/wiki/route-evidence.json \
  --min-matched-routes 1 \
  --json
```

Expected: exit 0. JSON output reports at least 1 matched route and writes the
artifact. The generated artifact is under `data/` and should remain gitignored.

### Step 4: Add fixture-backed tests

Create fixture JSONL files under
`tools/pipeline-v2/test/fixtures/mta-wiki-route-evidence/` with a tiny corpus:

- one Bus route, such as M15 SBS
- one MTA-wiki route record with aliases
- one project related to that route
- one event with `date_normalized`
- one metric claim
- one treatment component
- one source gap
- one source metadata record
- relations linking the route/project/treatment/event/metric

Test cases in `tools/pipeline-v2/test/studio-mta-wiki-route-evidence.test.ts`:

- normalizes route aliases (`M15`, `M15 SBS`, `M15-SBS`, `M15+`)
- emits a strict `bp.studio.route_evidence.v1` artifact
- includes timeline, intervention, metric claim, project, source gap, and
  citation rows
- deduplicates citation keys
- omits ambiguous graph edges instead of guessing
- fails with a clear message when a required JSONL file is missing

**Verify**:

```sh
bun --filter @bp/pipeline-v2 test --timeout 5000
```

Expected: all relevant pipeline-v2 tests pass, including the new fixture tests.

### Step 5: Record the contract boundary in architecture tests

Update `tests/harness/production-boundaries.test.ts` only if needed to preserve
these rules:

- `apps/web/src` must not import MTA-wiki files or pipeline code.
- `packages/domain` must remain infrastructure-free.
- The MTA-wiki importer lives in `tools/pipeline-v2`, not in Worker or browser
  code.

Do not add a runtime dependency on `/mnt/models/dev/mta-wiki`.

**Verify**:

```sh
bun run check:web-architecture
```

Expected: exit 0.

## Test plan

- New tests: `tools/pipeline-v2/test/studio-mta-wiki-route-evidence.test.ts`
  with the cases listed above.
- Existing tests to keep passing:
  - `bun --filter @bp/domain typecheck`
  - `bun --filter @bp/pipeline-v2 typecheck`
  - `bun run check:web-architecture`
- Optional live-data smoke after fixture tests pass:

  ```sh
  cd /mnt/models/dev/mta-wiki && bun run validate
  cd /mnt/models/dev/bus-reliability-tracker
  bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-route-evidence \
    --mta-wiki-root /mnt/models/dev/mta-wiki \
    --output data/artifacts/studio/v2/wiki/route-evidence.json \
    --min-matched-routes 1 \
    --json
  ```

## Done criteria

- [ ] Route evidence schemas and explicit exports exist in `@bp/domain`.
- [ ] The pipeline command reads MTA-wiki canonical JSONL read-only and writes
      `bp.studio.route_evidence.v1`.
- [ ] No code imports from `/mnt/models/dev/mta-wiki` packages.
- [ ] Fixture tests cover alias matching, graph scoping, citations, and
      ambiguity handling.
- [ ] `bun --filter @bp/domain typecheck` exits 0.
- [ ] `bun --filter @bp/pipeline-v2 typecheck` exits 0.
- [ ] `bun --filter @bp/pipeline-v2 test --timeout 5000` passes relevant tests.
- [ ] `bun run check:web-architecture` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `/mnt/models/dev/mta-wiki/data/canonical` is missing or `bun run validate`
  fails there.
- Route matching cannot deterministically map at least one Bus route to
  MTA-wiki route records.
- Implementing the importer appears to require editing MTA-wiki itself.
- The route evidence shape starts duplicating route speed/ridership/history
  data already owned by Bus Studio artifacts.
- You need open-ended graph traversal to make a useful artifact. Keep it to
  direct route edges plus one hop from route-scoped project/corridor records.

## Maintenance notes

- Plan 017 consumes this artifact on the web/API side.
- Plan 018 can delete the older Tier 2 MTA-wiki review queue after this public
  route-evidence import exists.
- Reviewer focus: route ID normalization, citation preservation, and whether
  omitted ambiguous records are counted rather than silently dropped.
