# Plan 084: Retire the monthly-baseline doctrine — ADR-0022 + steering-doc truth sweep

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Drift check (run first)**:
> `git diff --stat 27755f4..HEAD -- README.md analytics-primer.html docs/decisions docs/architecture/data-corpus-overview.md docs/research/hard-cutover-dossier-contract.md knowledge/index.md knowledge/log.md knowledge/wiki/engineering/cloudflare_operations_runbook.md knowledge/wiki/engineering/web_api_endpoint_architecture.md knowledge/wiki/engineering/data_pipeline_operationalization_status.md knowledge/wiki/engineering/serving_snapshot_2_full_route_baseline.md knowledge/wiki/engineering/frontend_data_handoff.md knowledge/wiki/engineering/cli_commands.md knowledge/wiki/data/public_facing_data_catalog.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (run first; unblocks 085-087 and governs the amended 079-081)
- **Category**: docs
- **Planned at**: commit `27755f4`, 2026-07-12 (working tree dirty in `plans/`,
  `knowledge/`, and study-approval/intervention-corpus files — none of them in
  this plan's scope except `knowledge/log.md`, which is append-only)

## Why this matters

On 2026-07-12 the operator directed that the concept of "monthly baselines"
and month-keyed releases be removed from the product entirely: served and
analyzed data is multi-year wherever source coverage allows, release identity
is a publication event (not a calendar month), and the only month-shaped thing
the project tracks going forward is *how far behind upstream each source is*.
ADR-0017 (2026-06-07) retired the "the product is a monthly release" slogan
but deliberately **kept** "baseline month" as a first-class anchor — and that
kept anchor is why `wrangler.jsonc` still pins `BASELINE_MONTH: "2026-03"`,
why the public status endpoint serves a field literally named
`canonicalMonthlyRelease`, and why a dozen steering docs still teach monthly
promotion mechanics as current practice. This plan records the superseding
decision (ADR-0022) and makes the *doctrine and steering docs* truthful. Code
follows in plans 085 (serving contract), 086 (pipeline release identity), and
087 (freshness ledger); the in-flight map plans 079-081 carry amendment blocks
so they implement the new vocabulary natively.

**The rule this plan must follow**: a doc may only describe code behavior that
exists at the commit where the doc change lands. Doctrine statements (what the
product *is*) are rewritten now. Mechanics descriptions (what commands/env
vars *do* today) are NOT falsified — they get a short dated de-month note
pointing at ADR-0022 and the follow-up plan that will change them; the full
rewrite is a done-criterion of that follow-up plan.

## Current state

- `docs/decisions/0017-mixed-freshness-publication-model.md` — status
  "Accepted" (line 7). Its terms table (lines 39-47) defines **Baseline
  month** as "The latest reviewed complete public monthly performance month
  used as the stable reference for route cards, current-state claims, and
  release-keyed detector output." Lines 49-55 bless "release-month detector
  output" and "same-month observed release promotion gates" (the detector
  program has since been deleted — gen-7 plan 061).
- `docs/decisions/README.md:23` — summarizes ADR-0017 as "…replacing the broad
  'monthly release' slogan with historical corpus, baseline month, current
  signal…".
- `README.md:91` — "…public static/open-data source probes and canonical
  monthly releases can still run, but realtime appendix and observed monthly
  promotion gates cannot pass."
- `docs/architecture/data-corpus-overview.md:302-354` — the "release labels"
  section already warns against the slogan (line 302: `Avoid using "monthly
  release" as a product slogan`) but keeps baseline-month vocabulary as
  current doctrine (line 310: "**Baseline month** | What reviewed complete
  public monthly performance month anchors current route cards?"; lines
  323-337 baseline-month anchoring guidance).
- `analytics-primer.html:518` — glossary entry: `{n:"DetectorRunId",
  cat:"detector", d:"One execution against a release month, e.g.
  source_gap-2026-03.", w:"domain/findings"}` — doubly stale: release-month
  framing AND the detector program was deleted (plan 061).
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md:94,120` — "Run
  it when promoting a baseline month or a corrected release artifact set" /
  "…or promote a new baseline month."
- `knowledge/wiki/engineering/web_api_endpoint_architecture.md:419` — cache
  table row "Monthly baseline Studio responses"; lines ~221-224 document
  `baselineMonth` and `releaseLayer: "baseline_release" | …` as the API meta
  contract.
- `knowledge/wiki/engineering/data_pipeline_operationalization_status.md:21` —
  "Production `/api/v1/status` reports `baselineMonth=2026-03`, canonical
  monthly release `status=pass`, 381 routes…". Today is 2026-07-12: that
  serving label is four months old, and nothing in the repo currently reports
  that lag — which is exactly the gap plan 087 fills.
- `knowledge/wiki/data/public_facing_data_catalog.md:80,161` — rows keyed to
  "baseline observed release month" and "Record baseline month, current signal
  month…".
- `knowledge/wiki/engineering/serving_snapshot_2_full_route_baseline.md:51` —
  "The first rich baseline month should stay `2026-03`…" (historical plan doc,
  work landed).
- `knowledge/wiki/engineering/frontend_data_handoff.md:220` — "Release facts
  such as baseline month, current signal month…".
- `knowledge/wiki/engineering/cli_commands.md:191` — "…become the promotion
  gate" (release-month promotion framing).
- `docs/research/hard-cutover-dossier-contract.md:73-79` — "Explicitly kept
  (per ADR-0017 and Track B): … Release-keyed detector output … `baselineMonth`
  as pipeline/provenance metadata". This doc is the 2026-06 execution record;
  it stays as history but needs a banner noting the "explicitly kept" list is
  superseded.
- Repo conventions: ADRs live in `docs/decisions/NNNN-slug.md` with `## Status`
  / `## Context` / `## Decision` / `## Consequences` sections — use ADR-0017
  itself as the structural exemplar. `knowledge/` is the LLM-maintained wiki;
  CLAUDE.md requires updating `knowledge/index.md` and `knowledge/log.md` when
  durable project decisions change.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Knowledge-wiki lint | `bun run check:knowledge` | exit 0 |
| Style check | `bun run check:style` | exit 0 |
| Grep gates | see Done criteria | exact counts listed there |

(No package builds are needed — this plan touches no TypeScript.)

## Scope

**In scope** (the only files you should modify):
- `docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md` (create)
- `docs/decisions/0017-mixed-freshness-publication-model.md` (status marker only)
- `docs/decisions/README.md`
- `README.md`
- `docs/architecture/data-corpus-overview.md`
- `docs/research/hard-cutover-dossier-contract.md` (banner only)
- `analytics-primer.html` (one glossary entry)
- `knowledge/index.md`, `knowledge/log.md` (append entry)
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md` (dated note only)
- `knowledge/wiki/engineering/web_api_endpoint_architecture.md` (dated note only)
- `knowledge/wiki/engineering/data_pipeline_operationalization_status.md` (dated note only)
- `knowledge/wiki/engineering/serving_snapshot_2_full_route_baseline.md` (banner only)
- `knowledge/wiki/engineering/frontend_data_handoff.md` (dated note only)
- `knowledge/wiki/engineering/cli_commands.md` (dated note only)
- `knowledge/wiki/data/public_facing_data_catalog.md` (dated note only)

**Out of scope** (do NOT touch):
- Any `.ts`/`.tsx`/`.jsonc` source or config file — code changes belong to
  plans 085-087 and the amended 079-081.
- `knowledge/raw/**` — immutable source captures.
- `plans/**` other than your status row — the advisor session already applied
  the 079/080/081 amendment blocks.
- Historical ADRs other than 0017 (e.g. ADR-0012 mentions release months; it
  is a retired program's record and stays untouched).
- `apps/web/README.md` — its status-endpoint section describes live mechanics;
  plan 085 rewrites it when the mechanics change.
- Anything under `data/` — operator-owned artifacts.

## Git workflow

- Branch: `advisor/084-retire-month-anchors-doctrine` (or fold into the
  operator's current branch if they direct so — the tree is already dirty).
- One commit per step group is fine; message style matches repo history
  (imperative, e.g. "Retire monthly-baseline doctrine (ADR-0022)").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write ADR-0022

Create `docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md`,
modeled structurally on ADR-0017. Required content (write in ADR prose, not
this bullet form):

- **Status**: Accepted. **Supersedes**: the baseline-month/release-month
  anchor portions of ADR-0017 (name them).
- **Context**: ADR-0017 retired the "monthly release" slogan but kept
  "baseline month" as a first-class anchor; the detector program that
  motivated release-month keying was deleted (plan 061); production serving
  still pins `BASELINE_MONTH=2026-03` while it is July 2026, and nothing
  reports that lag. Operator direction 2026-07-12: remove the concept
  entirely.
- **Decision** (the five rules, verbatim-ish):
  1. No product, serving, or release identity is a calendar month. A release
     is a **publication event**: `releaseId` + `publishedAt` (ISO datetime) +
     per-dataset **coverage windows** `{ start, end, grain }`.
  2. Served and analyzed data spans the full available history per source
     ("multi-year when the source supports it"). A single month is never the
     outer boundary of a user-facing dataset when more coverage exists.
  3. **Freshness is measured against now and against upstream**, never
     against a "release month": per source, upstream-latest vs
     ingested-latest vs published-coverage-end, maintained by the freshness
     ledger (plan 087). Serving surfaces compute staleness at read time.
  4. Months remain valid ONLY as: source grain (upstream publishes
     month-partitioned data), time-series coordinates, and ingest/storage
     partitions. A directory or table keyed by month is a partition, not an
     identity.
  5. Reviewed publication gates stay (publishing is deliberate, per
     ADR-0017's operational rules 1-4, which remain in force) — but the gate
     validates coverage consistency and provenance, not month equality.
- **Vocabulary table** (old → new), to be used by plans 085/086/087 and the
  amended 079-081: `baselineMonth` (identity) → `coverage: {start, end}` +
  `publishedAt`; `canonicalMonthlyRelease` → `release`; `releaseMonth` (on
  manifests) → `publishedAt` + `coverage`; `releaseLayer:
  "baseline_release"` → `"published_release"`; `completenessStatus:
  "partial_public_monthly_only"` → `"partial_public_speed_only"`; "promote a
  baseline month" → "publish a release"; env `BASELINE_MONTH` /
  `LAST_BUILT_SPEED_MONTH` → deleted (serving derives coverage from D1/R2).
- **Consequences**: plans 085-087 execute the code change; ADR-0017's terms
  "Baseline month" and the monthly-cadence blessing list are retired; its
  terms "Historical corpus", "Source-capture snapshot", "Serving projection",
  "Publication/promotion" survive unchanged.

**Verify**: `test -f docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md && rg -c 'Supersedes' docs/decisions/0022-*.md` → file exists, count ≥ 1.

### Step 2: Mark ADR-0017 superseded and update the decisions index

In `docs/decisions/0017-mixed-freshness-publication-model.md`, change the
`## Status` section body from `Accepted.` to:

```
Accepted 2026-06-07. Partially superseded by ADR-0022 (2026-07-12): the
"baseline month" anchor, release-month keying, and the monthly-cadence
blessing list are retired; the operational rules (lightweight cron,
deliberate publication, snapshot evidence) remain in force.
```

Do not edit any other section — ADRs are records. In
`docs/decisions/README.md`, update line 23's ADR-0017 summary to note the
partial supersession and add a line for ADR-0022.

**Verify**: `rg -n 'ADR-0022' docs/decisions/0017-mixed-freshness-publication-model.md docs/decisions/README.md` → ≥ 2 hits.

### Step 3: Rewrite the two doctrine surfaces (README.md, data-corpus-overview)

- `README.md:91`: rewrite the sentence so the env var's consequence is
  described without monthly-release doctrine, e.g.: "…without the key, public
  static/open-data source probes and reviewed serving releases still run, but
  the realtime appendix and observed-reliability promotion checks cannot
  pass." (Keep the factual content: what works without the key.)
- `docs/architecture/data-corpus-overview.md` lines ~302-354: rewrite the
  release-labels section to ADR-0022 vocabulary — release = publication event
  with coverage windows; delete the "Baseline month" question row (line ~310)
  or replace it with "Coverage: what per-dataset windows does the current
  release cover, and how far behind upstream is each?"; keep the March-2026
  provenance caveat block (lines ~354) as a dated factual note about the
  currently-published release. Where the section describes *current pinned
  mechanics* (e.g. `/api/v1/status` month semantics), keep the description
  accurate and add: "Month-keyed mechanics scheduled for removal — ADR-0022,
  plans 085-087."

**Verify**: `rg -in 'canonical monthly release|monthly promotion gate' README.md docs/architecture/data-corpus-overview.md` → 0 hits; `rg -in 'ADR-0022' docs/architecture/data-corpus-overview.md` → ≥ 1.

### Step 4: Fix the analytics-primer glossary entry

In `analytics-primer.html` line ~518, the `DetectorRunId` glossary entry:
rewrite its description to mark it historical, e.g. `d:"Historical: one
detector execution against a release month (detector program deleted 2026-07,
plan 061)."`. Match the surrounding JS-object formatting exactly (single-line
entry in the array). Do not restructure the primer.

**Verify**: `rg -n 'DetectorRunId' analytics-primer.html` → 1 hit containing the word `Historical`.

### Step 5: Dated de-month notes on mechanics docs; banners on historical docs

Add a short dated note (2-3 lines, at the top of the relevant section, not
the file top unless noted) of the form:

> **De-month status (2026-07-12)**: the month-keyed mechanics described here
> are scheduled for removal per ADR-0022 — serving contract in plan 085,
> release identity in plan 086, freshness ledger in plan 087. Until those
> land, this section describes live behavior.

Apply to:
- `cloudflare_operations_runbook.md` — above the section containing line 94
  ("promoting a baseline month"); the full rewrite is plan 086's done
  criterion.
- `web_api_endpoint_architecture.md` — above the API-meta/caching material
  (the `baselineMonth` contract fields and the line-419 cache row); full
  rewrite is plan 085's done criterion.
- `data_pipeline_operationalization_status.md` — as a dated addendum noting:
  production still reports `baselineMonth=2026-03` as of 2026-07-12 (≈4
  months old) and the freshness ledger (plan 087) will make that lag a
  first-class report.
- `frontend_data_handoff.md` (line ~220 context) and `cli_commands.md` (line
  ~191 context) — same short note.
- `public_facing_data_catalog.md` — same note above the tables containing
  lines 80/161.

Add a **historical banner** (one line under the H1: `> Historical document
(work completed/superseded); month-anchored language reflects the doctrine of
its time — see ADR-0022.`) to:
- `knowledge/wiki/engineering/serving_snapshot_2_full_route_baseline.md`
- `docs/research/hard-cutover-dossier-contract.md` — banner must also say the
  §1 "Explicitly kept" list is superseded by ADR-0022.

**Verify**: `rg -l 'De-month status \(2026-07-12\)' knowledge/wiki docs` → exactly 6 files; `rg -c 'ADR-0022' docs/research/hard-cutover-dossier-contract.md knowledge/wiki/engineering/serving_snapshot_2_full_route_baseline.md` → ≥ 1 each.

### Step 6: Wiki index + log

- Append a `knowledge/log.md` entry (match existing entry format, dated
  2026-07-12): monthly-baseline doctrine retired end-to-end; ADR-0022 written;
  plans 084-087 + gen-9 amendments; freshness ledger replaces month anchors.
- Update `knowledge/index.md` if it references the monthly-release model or
  ADR-0017 as current doctrine (check with
  `rg -in 'monthly|baseline month|0017' knowledge/index.md`; if zero hits,
  add nothing — do not force an edit).

**Verify**: `rg -n '2026-07-12' knowledge/log.md | tail -1` → the new entry; `bun run check:knowledge` → exit 0.

## Test plan

Documentation-only plan: the tests are the grep gates above plus
`bun run check:knowledge` and `bun run check:style` (both must exit 0). No
unit tests to write.

## Done criteria

- [ ] `docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md` exists
      with Status, Context, Decision (5 rules), vocabulary table, Consequences
- [ ] `rg -n 'ADR-0022' docs/decisions/0017-*.md docs/decisions/README.md` → ≥ 2 hits
- [ ] `rg -in 'canonical monthly release|monthly promotion gate' README.md docs/architecture` → 0 hits
- [ ] `rg -l 'De-month status \(2026-07-12\)' knowledge/wiki docs` → 6 files
- [ ] `rg -n 'Historical' analytics-primer.html | rg DetectorRunId` → 1 hit
- [ ] `bun run check:knowledge` and `bun run check:style` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- ADR numbering: a `docs/decisions/0022-*.md` already exists (another session
  claimed the number) — renumber only after checking `ls docs/decisions/`.
- Any in-scope doc's cited line content does not match the "Current state"
  excerpts (the docs may have been swept by another plan; 071 already touched
  README/master-plan).
- You find yourself wanting to edit a `.ts` file to "make the doc true" —
  that is plans 085-087's work.
- `knowledge/log.md` conflicts on write (the working tree already has an
  uncommitted `log.md` modification — append after the existing uncommitted
  tail; if the file looks corrupted or mid-edit, stop).

## Maintenance notes

- Plans 085/086/087 each carry "rewrite the mechanics doc" done-criteria that
  replace the dated notes this plan adds; if any of those plans is dropped,
  the corresponding note must be resolved another way — do not let the notes
  rot.
- The reviewer should scrutinize the ADR's vocabulary table: it is the single
  source the code plans implement from. A wording change there after 085
  starts means re-syncing the plans.
- ADR-0017's operational rules (cron lightweight, deliberate publication)
  intentionally survive — reviewers should reject any later edit that deletes
  ADR-0017 outright.
