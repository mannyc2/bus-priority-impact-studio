# Plan 073: Serve the reviewed intervention corpus and reconcile it against the evaluation registry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cd878f7..HEAD -- packages/domain/src/studio packages/domain/src/documents/intervention-records tools/pipeline-v2/src/commands/studio apps/web/src/studio/pages/interventions.tsx apps/web/src/studio/api-client.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (first plan of the business-problem arc: 073 → 074 → 075 → 076)
- **Effort**: M-L
- **Risk**: MED (new public content; mitigated by review gates and graceful-null serving)
- **Depends on**: plans/068-verification-baseline.md
- **Category**: direction
- **Planned at**: commit `cd878f7`, 2026-07-09

## Why this matters

The project's unique asset is a reviewed, evidence-cited corpus of NYC bus
priority interventions: **310 records from 51 sources** (LLM-extracted, then
human-reviewed 2026-05-27) — and it has never reached the product. The live
`/interventions` page serves a much thinner registry (~81 events, mostly ACE
program rows). Serving the corpus makes `/interventions` genuinely
comprehensive, with source citations. Its reconciliation is a documentation
and coverage report, not a causal-date feed: plan 074 admits only trusted live
registry events and strict, manifest-pinned MTA Wiki operational anchors.
Unknown, planned, publication, and status-as-of dates remain visible here
without becoming treatment onsets.

## Current state

- **The corpus**: `data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json`
  (~2.3MB). Verified header:

```json
{
  "version": 3,
  "generatedAt": "2026-05-27T17:20:55.275Z",
  "summary": { "selectedSourceCount": 51, "extractedSourceCount": 51, "failedSourceCount": 0, "recordCount": 310, ... }
}
```

  Inspect the record array's location and one full record with `jq` before
  coding (e.g. `jq 'keys' <file>` then the first record). Records conform to
  `DocumentInterventionRecordSchema`.

- **The record schema**: `packages/domain/src/documents/intervention-records/index.ts`.
  The persisted shape (verified excerpt, lines 327-356):

```ts
const DocumentInterventionRecordObjectSchema = DocumentInterventionRecordDraftSchema.extend({
  recordId: z.string().min(1),
  sourceId: z.string().min(1),
  recordKind: DocumentInterventionRecordKindSchema,   // "implemented" | "in_progress" | "proposed"
  evidenceCandidateIds: z.array(z.string().min(1)),
  extraction: z.object({ ... }).strict(),
}).strict();
```

  Read `DocumentInterventionRecordDraftSchema` in the same file for the full
  field list (routes, primaryTreatments, customTreatments, corridor,
  effectiveDate, datePrecision, statusHistory, treatmentComponents, metrics,
  caveats). Do not guess field names — read the schema.

- **The live registry the site evaluates against**:
  `packages/db/src/local/schema.ts:1244` — `localInterventionEvent`
  (`local_intervention_event`), plus `local_route_intervention_comparison`
  rows built by
  `tools/pipeline-v2/src/lib/local-db-aggregates/route-intervention-evaluation.ts`.
  ~81 events across ~60 routes today.

- **The serving seam** (how a new artifact becomes public):
  1. A domain schema module declares the artifact type + key. Exemplar:
     `packages/domain/src/studio/route-dossier.ts` (verified excerpt):

```ts
import * as z from "../schema-compat.js";
const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
export function routeDossierSummaryKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/dossier.json`;
}
export const RouteDossierSeriesPointSchema = z.object({ month: MonthSchema, value: z.number().nullable() }).strict();
```

     Match this style (yes, `schema-compat` — it is the current dialect of
     `@bp/domain`; gen-7 plans 066/067 will migrate all of it together).
  2. A pipeline command builds and writes the JSON under the artifact root.
     Exemplar command file: `tools/pipeline-v2/src/commands/studio/route-treatment-summary.ts`
     (uses `defineCommand` from `@bp/pipeline-v2/cli/compat`, path helpers from
     `./lib/paths.ts`, `writeJson` from `./lib/json.ts`). Commands are
     registered by glob discovery — a new file in `src/commands/studio/`
     appears automatically; a completeness test enforces conventions.
  3. Publication to R2 via the existing `publish r2-artifacts` command; local
     dev seeding via `scripts/seed-local-studio-r2.sh` (see package.json
     `seed:local-studio-r2`).
  4. The web client fetches artifacts through the existing public artifact GET
     endpoint (see `packages/studio-api/src/public-api.ts` — locate the route
     with `grep -n "artifacts" packages/studio-api/src/public-api.ts`; key
     validation is `isValidArtifactKey` at `public-api.ts:108`). **Do not add
     routes to `read-handlers.ts`** — gen-7 plan 063 owns that file.

- **The page**: `apps/web/src/studio/pages/interventions.tsx`. Verified
  excerpts — filters and data flow (lines 46-72):

```ts
const filters: readonly { id: InterventionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "evaluated", label: "Evaluated" },
  { id: "future", label: "Future" },
  { id: "source-gap", label: "Needs source" },
];
export const INTERVENTIONS_PAGE_SIZE = 30;
export function InterventionsPage({ routes, evidence }: { routes: readonly StudioRoute[]; evidence: readonly (InterventionEvidenceBundle | null)[] }) {
  ...
  const rows = useMemo(() => interventionRows(routes, evidence), [routes, evidence]);
```

  The page already renders per-row source citations via a `SourceNote` popover
  (`apps/web/src/components/**` — grep `SourceNote`), tolerates `evidence`
  nulls, and paginates. Client fetches use
  `apps/web/src/studio/api-client.ts` — `loadNullableStudioJson` (verified,
  lines 96-118) returns `null` on 404: new artifact fetches must use this so a
  missing corpus artifact degrades gracefully instead of erroring the page.

- **Data-window fact that must surface in the UI**: served speed data covers
  **2023-04 through 2026-03**. Corpus records with `effectiveDate` before
  2023-04 are *documented history* (can never be evaluated against our outcome
  data); records inside the window are only *window-aligned documentation*.
  The retained `evaluableInWindow` field is a display/coverage hint, not causal
  eligibility. The UI must not imply any corpus record was evaluated merely
  because that boolean is true.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Typecheck | `bun run check:types` | exit 0 |
| Web build | `bun --filter @bp/web build` | exit 0, perf budget passes |
| Architecture/doctrine | `bun run check:architecture` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Local artifact seed | `bun run seed:local-studio-r2` | exit 0 |
| Smoke | `bun run serve:web-smoke` | /interventions renders |

## Scope

**In scope**:
- `packages/domain/src/studio/intervention-corpus.ts` (new: projection schema + artifact key)
- `tools/pipeline-v2/src/commands/studio/` (new command file, e.g. `export-intervention-corpus.ts`)
- `tools/pipeline-v2/test/commands/studio/` (new fixture test)
- `apps/web/src/studio/api-client.ts` (one new fetch function)
- `apps/web/src/routes/interventions.tsx` (loader addition) and
  `apps/web/src/studio/pages/interventions.tsx` (render corpus rows)
- A reconciliation REPORT artifact + markdown NOTE (written by the same command)

**Out of scope** (do NOT touch):
- `packages/studio-api/src/studio/read-handlers.ts` — plan 063 owns it; serve via the existing artifact endpoint only.
- Mutating `local_intervention_event` or any local DB table — reconciliation is REPORT-ONLY here and is not consumed as a plan 074 causal input.
- The corpus JSON itself and anything under `data/artifacts/docs/` — read-only inputs.
- Route detail History tab — corpus records appear there via plan 075, not here.
- `docs/research/master-plan-product-questions.md` (Track D framing) — context only.

## Git workflow

- Branch: `advisor/073-intervention-corpus-serving` off the current branch.
- Commit per step; message style: short imperative summary (see `git log --oneline -5`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Projection schema

Create `packages/domain/src/studio/intervention-corpus.ts` following the
`route-dossier.ts` style: artifact key
`studio/v2/interventions/corpus.json` via an exported `interventionCorpusKey()`,
and a `StudioInterventionCorpusSchema` with: `schemaVersion` (literal 1),
`generatedAt`, `sourceCorpus` ({path, version, generatedAt, recordCount}), and
`records[]` — a SLIM projection per record: recordId, routes (string[]),
primaryTreatments, customTreatments, title/label (derive: first corridor street
+ treatment label; decide deterministically and document in a comment),
effectiveDate, datePrecision, recordKind, statusLatest (last statusHistory
entry's status), corridorStreets (string[]), evaluableInWindow (boolean:
effectiveDate ≥ 2023-04), sourceId, sourceLabel, caveatCount. Cap `records` at
400 (`z.array(...).max(400)`) — tight caps are this repo's convention. Export
types via `z.output`.

**Verify**: `bun run check:types` → exit 0.

### Step 2: Build command + fixture test

New command `tools/pipeline-v2/src/commands/studio/export-intervention-corpus.ts`
modeled on `route-treatment-summary.ts` (defineCommand + arg parsing + paths +
`writeJson`): reads the corpus JSON (default path = the v3-reviewed file above,
overridable arg), validates records against `DocumentInterventionRecordSchema`
(skip-and-count invalid rather than abort; report count), projects to the
step-1 shape, writes `<artifactRoot>/studio/v2/interventions/corpus.json`.

Fixture test in `tools/pipeline-v2/test/commands/studio/export-intervention-corpus.test.ts`
modeled on `tools/pipeline-v2/test/commands/export/route-dossier-summaries.test.ts`
(tmpdir, minimal fixture corpus of 2-3 records incl. one pre-window and one
in-window date, asserts written JSON parses against the new schema and
`evaluableInWindow` is computed correctly).

**Verify**: `bun --filter @bp/pipeline-v2 test` → all pass. Then run the real
command against the real corpus and `jq '.records | length'` the output →
should be ≤310 and >250 (some proposed/malformed records may drop; if <250,
STOP — the corpus is dirtier than reviewed reports claim).

### Step 3: Reconciliation report (report-only)

In the same command (flag `--reconcile-report`), load the live registry events
(reuse the loader in `route-intervention-evaluation.ts` /
`local-db-aggregates` — find the exported list function with
`grep -rn "listInterventionEvent\|InterventionEventRow" tools/pipeline-v2/src/lib/local-db-aggregates/`)
and match corpus records to registry events by (any shared routeId, same
implementation month from `effectiveDate`, compatible treatment family). Write
`<artifactRoot>/studio/v2/interventions/corpus-reconciliation.json` +
a human-readable `corpus-reconciliation.md`: counts {matched, corpusOnly
(evaluable), corpusOnly (pre-window), registryOnly, dateConflicts}, and the
   full corpusOnly-evaluable list (a source-coverage finding only; these rows
   do not become plan 074 study inputs).

**Verify**: command runs against the real local DB; the report's four counts
sum consistently; commit the .md path in your report (not the artifact).

### Step 4: Serve + render

- `api-client.ts`: add `fetchStudioInterventionCorpus()` using
  `loadNullableStudioJson` against the artifact endpoint path for
  `interventionCorpusKey()` (mirror how existing artifact fetches build their
  URL — grep `fetchNetworkMapGeo` for the pattern).
- `apps/web/src/routes/interventions.tsx` loader: fetch the corpus alongside
  the existing data (nullable — page must render identically to today when
  null).
- `interventions.tsx` page: merge corpus records into the existing rows model:
  each corpus record becomes a row with year (from effectiveDate/datePrecision;
  "Undated" bucket allowed), route badge(s), treatment kind badge, title,
  SourceNote entries (sourceLabel + sourceId), and — for pre-window records — a
  quiet "documented" presentation that must NOT use the Evaluated affordances.
  Dedupe against registry-backed rows using the reconciliation matching rule
  (same route + month + family → prefer the registry row, append corpus
  citation to its SourceNote). Add filter counts accordingly (the existing
  `filters` array semantics: corpus-only records are never "evaluated").

**Verify**: `bun --filter @bp/web build` → exit 0 and perf budget passes
(corpus artifact is data, not bundle — but check the loader didn't eagerly
import heavy modules); `bun run check:architecture` → exit 0 (design doctrine);
`bun run test:web` → pass. Seed local R2 (`bun run seed:local-studio-r2` after
copying the artifact into `data/artifacts/studio/v2/`), `bun run
serve:web-smoke`, open `/interventions`: corpus rows render with sources; with
the artifact absent, the page renders today's content.

## Test plan

- Pipeline: fixture test from step 2 (projection correctness, window flag,
  invalid-record skip count).
- Web: extend the interventions page test if one exists under
  `apps/web/test/` (check first); otherwise rely on build + doctrine + smoke,
  and note the gap in your report.
- Manual smoke: filter chips still correct with merged rows; pagination stable.

## Done criteria

- [ ] `bun --filter @bp/pipeline-v2 test` exits 0 incl. new fixture test
- [ ] Real-corpus run writes `corpus.json` with >250 records and a reconciliation report whose counts sum to the inputs
- [ ] `/interventions` renders corpus rows with SourceNote citations locally; renders unchanged when the artifact is missing
- [ ] Pre-window records are visually distinct from evaluated rows and never carry evaluation numbers
- [ ] `bun run check:types`, `bun run check:architecture`, `bun run test:web`, `bun --filter @bp/web build` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The corpus JSON's actual record shape does not validate against
  `DocumentInterventionRecordSchema` for >20% of records — report the failure
  taxonomy; do not loosen the schema.
- A large share of records lacks a usable `effectiveDate` — report the coverage
  honestly, but do not stop corpus serving or promote document/status dates to
  compensate. Study eligibility is handled by plan 074's separate inputs.
- Serving requires touching `read-handlers.ts` — report; the artifact-endpoint
  assumption failed.

## Maintenance notes

- Plan 074 does not consume `corpus-reconciliation.json`; keep it stable as a
  documentation/source-coverage report. Causal inputs use the separate
  registry + manifest-pinned Wiki anchor path.
- Gen-7 plan 066/067 will migrate the new domain schema off `schema-compat`
  with all its siblings — written in the current dialect deliberately.
- When mta-wiki's export contract lands (master plan Track D), this command is
  the natural import seam: same projection, different source. Keep the
  corpus-reading code isolated in one function.
