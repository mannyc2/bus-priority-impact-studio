# Plan 102: Give every documented change a typed date with a precision, and make chronological order correct everywhere

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b25542b0..HEAD -- apps/web/src/studio/pages/interventions.tsx apps/web/src/components/route/route-history-ledger.ts apps/web/test/shared/interventions-page.test.ts apps/web/test/shared/treatments-history.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> semantic mismatch, treat it as a STOP condition.

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (pure presentation module plus two call sites; no schema,
  serving, or publication change)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b25542b0`, 2026-07-24

## Why this matters

`/interventions` sorts its ledger on the raw date string. Source documents write
dates in prose, so `"TBD"`, `"Thursday, March 19th at 6:00pm"` and `"Summer"`
all sort above every ISO date, and the first screen of the public page is
rows from 2010 and 2015 open houses under year headers in the order
2025, 2020, 2010, 2018, 2026. Measured on 2026-07-24 against the live
deployment: of the first 30 rows of the Documented tab, 22 have no parseable
year and fall into the undated rollup, leaving 8 dated rows in 5 out-of-order
groups.

This is not a data-quality problem. 183 of the 205 free-text rows (89%) carry a
resolvable year or range, and 167 of them are already written in the machine
form `2026-spring`. The product simply never reads them. A typed date value
with an explicit precision fixes ordering, display, filtering and programmatic
access at once, and it is the prerequisite for the overlap detection that
Plan 103 is built on: "do these two changes overlap" is an interval
intersection once dates are intervals.

## Current state

### The two sort paths disagree, and one of them is broken

`apps/web/src/studio/pages/interventions.tsx` sorts on the raw string
(excerpt at lines 800-811 of the file as of `b25542b0`):

```ts
  return attachInterventionFacets(
    [...enrichedRegistryRows, ...corpusInterventionRows(routes, corpus, registryEventIds)],
    facetIndex,
  ).sort(
    (left, right) =>
      right.event.sortKey.localeCompare(left.event.sortKey) ||
      (left.routes[0]?.label ?? "").localeCompare(right.routes[0]?.label ?? "") ||
      left.event.title.localeCompare(right.event.title),
  );
```

`event.sortKey` is assigned verbatim from the source date. For a wiki timeline
row (`interventions.tsx:929`) it is
`event.dateNormalized ?? event.dateText ?? "0000"`, so `"TBD"` and
`"Thursday, March 19th at 6:00pm"` become sort keys. Because `localeCompare`
is descending here, any string starting with a letter outranks every string
starting with a digit.

`apps/web/src/components/route/route-history-ledger.ts` already works around
this, but only partially. `put()` at line 61 builds
`sortKey: input.sortKey ?? historyYearLabel(dateLabel) + dateLabel`, prefixing
the extracted year so free text at least groups into the right year; and
`compareLedgerRows` (lines 261-276) partitions dated from undated first:

```ts
function compareLedgerRows(left: HistoryLedgerRow, right: HistoryLedgerRow): number {
  const leftDated = historyYearLabel(left.dateLabel) !== "Undated";
  const rightDated = historyYearLabel(right.dateLabel) !== "Undated";
  if (leftDated !== rightDated) return leftDated ? -1 : 1;
  if (leftDated && rightDated) {
    const byDate = right.sortKey.localeCompare(left.sortKey);
    if (byDate !== 0) return byDate;
  }
  ...
}

export function historyYearLabel(dateLabel: string): string {
  return dateLabel.match(/\b\d{4}\b/u)?.[0] ?? "Undated";
}
```

Within a year this is still wrong (`"2013Thursday…"` outranks `"2013-12"`), and
`historyYearLabel` cannot see that `2013-2014` spans two years.

Display formatting is duplicated and lossy. `interventions.tsx:743-752`:

```ts
function timelineDateLabel(dateish: string): string {
  const isoParts = dateish.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/u);
  if (isoParts !== null) {
    const month = MONTH_LABELS[Number(isoParts[2]) - 1];
    if (month !== undefined) return isoParts[3] === undefined ? month : `${month} ${isoParts[3]}`;
  }
  const year = yearLabel(dateish);
  const remainder = dateish.replace(year, "").trim();
  return remainder.length > 0 ? remainder : "Year";
}
```

`2026-spring` matches nothing here and renders as the literal `spring`.

### The complete real input vocabulary

Measured on 2026-07-24 from `/api/v1/studio/interventions/evidence` (12 route
bundles, 787 timeline records). 582 records carry a strict ISO date
(`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`). The remaining 205 records use 67 distinct
free-text literals, in exactly five shapes. **This table is the complete
universe and the executor must cover all of it**:

| Shape | Distinct literals | Records | Every literal |
|---|---:|---:|---|
| `YYYY-<season>` | 41 | 167 | `2010-summer`, `2011-fall`, `2011-spring`, `2011-winter`, `2012-fall`, `2012-spring`, `2012-summer`, `2012-winter`, `2013-fall`, `2013-spring`, `2013-summer`, `2014-fall`, `2014-spring`, `2014-summer`, `2014-winter`, `2015-fall`, `2015-spring`, `2015-summer`, `2015-winter`, `2016-fall`, `2016-spring`, `2016-winter`, `2017-spring`, `2017-winter`, `2019-fall`, `2019-summer`, `2019-winter`, `2020-spring`, `2022-fall`, `2022-summer`, `2022-winter`, `2023-fall`, `2024-fall`, `2024-spring`, `2024-summer`, `2024-winter`, `2025-fall`, `2025-spring`, `2025-summer`, `2026-fall`, `2026-spring` |
| `YYYY-YYYY` | 4 | 8 | `2013-2014`, `2014-2015`, `2015-2016`, `2017-2018` |
| `YYYY/YYYY` | 1 | 2 | `2019/2020` |
| prose containing a year | 5 | 6 | `Late 2018/Early 2019`, `late 2025 or 2026`, `March 18 and 23, 2010`, `March 18 and 24, 2010`, `November 16–19, 2020` |
| no year at all | 16 | 22 | `TBD`, `February 13th`, `June 12`, `May 21`, `Thursday, March 19th at 6:00pm`, `Thursday, March 19 at 6:00pm`, `Early April`, `Early Summer`, `July 14`, `June - September`, `June 16`, `Late Summer/Fall`, `May 17`, `September 27 & 28`, `Spring`, `Summer` |

Note `November 16–19, 2020` uses U+2013 EN DASH, not a hyphen. `2013-2014`
must not be mistaken for `YYYY-MM`; disambiguate on the second group being four
digits.

The reviewed corpus (`studio/v2/interventions/corpus.json`) is cleaner: 310
records, 41 with an `effectiveDate` that is always strict ISO with a
`datePrecision` of `day` (14), `month` (19) or `year` (9); the other 269 have
`effectiveDate: null`. The route projection's 569 intervention annotations all
carry strict ISO `year` values (`YYYY` or `YYYY-MM`), earliest `1963`.

### Conventions to match

- Pure presentation models live beside the pages that use them and export named
  functions only. Follow `apps/web/src/studio/home-route-index.ts` and
  `apps/web/src/components/route/route-history-ledger.ts`: no classes, no
  default exports, no React imports, no `Date` mutation.
- Tests are Bun tests under `apps/web/test/shared/`, one file per module, using
  `describe`/`test`/`expect` from `bun:test`. Model the new test file on
  `apps/web/test/shared/route-insight-placement.test.ts` (a pure-model test with
  no router or DOM).
- `CLAUDE.md` §2 and §3: minimum code, surgical changes, no speculative
  configurability. This module has exactly the six exports listed below and no
  options bag.

## Target contract

Create `apps/web/src/studio/change-date.ts`. It is pure, browser-safe, imports
nothing from the app, and exports exactly:

```ts
export type ChangeDatePrecision = "day" | "month" | "quarter" | "year" | "range" | "unknown";

export type ChangeDate =
  | {
      precision: Exclude<ChangeDatePrecision, "unknown">;
      /** Inclusive ISO calendar day the interval opens on. */
      start: string;
      /** Inclusive ISO calendar day the interval closes on. */
      end: string;
      /** Human display at the stated precision, e.g. "Spring 2026". */
      display: string;
      /** The exact source string this was read from. */
      raw: string;
    }
  | { precision: "unknown"; display: string; raw: string };

/** Reads any documented date string. Never throws; unparseable input is `unknown`. */
export function parseChangeDate(raw: string | null | undefined): ChangeDate;

/** Newest first. `unknown` always sorts last, never first. Ties broken on end, then raw. */
export function compareChangeDatesNewestFirst(left: ChangeDate, right: ChangeDate): number;

/** True when two known intervals share at least one day. `unknown` never overlaps. */
export function changeDatesOverlap(left: ChangeDate, right: ChangeDate): boolean;

/** Group heading: the calendar year for a single-year interval, "2013–2014"
 *  for a multi-year interval, "Undated" for unknown. */
export function changeDateGroupLabel(value: ChangeDate): string;

/** Machine-sortable key, for callers that must keep a string sort. Known dates
 *  return the ISO `start`; unknown returns "" so callers can partition. */
export function changeDateSortKey(value: ChangeDate): string;
```

### Binding parse rules

Apply in this order; the first match wins.

1. `^\d{4}-\d{2}-\d{2}$` → `day`. `start = end = raw`. Display
   `"2 October 2025"` (day, full month name, year).
2. `^\d{4}-\d{2}$` → `month`. `start` first of month, `end` last of month.
   Display `"May 2024"`.
3. `^(\d{4})-(spring|summer|fall|autumn|winter)$` (case-insensitive) →
   `quarter`. **Seasons map to calendar quarters**: winter → Q1
   (`-01-01`..`-03-31`), spring → Q2 (`-04-01`..`-06-30`), summer → Q3
   (`-07-01`..`-09-30`), fall/autumn → Q4 (`-10-01`..`-12-31`). Display
   `"Spring 2026"`. This is a deliberate simplification: the precision is
   explicitly a quarter, and calendar quarters keep
   `winter < spring < summer < fall` monotone inside a year, which a
   meteorological winter spanning December of the previous year would not.
   Document this choice in a comment on the mapping table.
4. `^(\d{4})[-/](\d{4})$` where the second group is four digits → `range`.
   `start` is 1 January of the lower year, `end` 31 December of the higher.
   Display `"2013 to 2014"`.
5. `^\d{4}$` → `year`. Display `"2013"`.
6. Otherwise, scan the string for four-digit years with `/\b(19|20)\d{2}\b/g`:
   - two or more distinct years → `range` from 1 January of the lowest to
     31 December of the highest. Display: the original string, trimmed.
   - exactly one year → look for an English month name
     (`january`…`december`, case-insensitive, first match). If found, emit
     `month` for that month of that year; otherwise emit `year`. Display: the
     original string, trimmed.
   - no year → `unknown`, `display: "Date not stated"`.

Rule 6 must produce, for the six prose literals in the table above:
`Late 2018/Early 2019` → range 2018-01-01..2019-12-31;
`late 2025 or 2026` → range 2025-01-01..2026-12-31;
`March 18 and 23, 2010` and `March 18 and 24, 2010` → month 2010-03;
`November 16–19, 2020` → month 2020-11.

### Binding comparison rules

`compareChangeDatesNewestFirst` returns a negative number when `left` should
render first (newest first):

1. Known before unknown, always.
2. Both known → `right.start.localeCompare(left.start)`; if zero,
   `left.end.localeCompare(right.end)` — the shorter, more precise interval
   leads when two dates open on the same day, so `2026-04` renders above
   `2026-spring`; if still zero, `left.raw.localeCompare(right.raw)`.
3. Both unknown → `left.raw.localeCompare(right.raw)`.

`changeDatesOverlap` is `left.start <= right.end && right.start <= left.end`
for two known values, and `false` whenever either side is `unknown`.

`changeDateGroupLabel` returns the four-digit year when
`start.slice(0,4) === end.slice(0,4)`, otherwise
`` `${start.slice(0,4)}–${end.slice(0,4)}` `` (EN DASH), otherwise
`"Undated"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused new tests | `bun test apps/web/test/shared/change-date.test.ts --timeout 5000` | all pass |
| Adjacent web tests | `bun test apps/web/test/shared/interventions-page.test.ts apps/web/test/shared/treatments-history.test.ts --timeout 5000` | all pass |
| Web suite | `bun run test:web` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Architecture and doctrine | `bun run check:architecture` | exit 0 |
| Web build and budgets | `bun run check:web-release` | exit 0 |
| Full gate | `bun run check` | exit 0 |

## Suggested executor toolkit

- No skill is required. This is a pure function module with a fixed input
  vocabulary; write the parse table first and the callers second.
- Do not reach for a date library. `Date` is not needed: every interval endpoint
  in the rules above is a fixed string, and the only arithmetic is
  days-in-month, which is a 12-entry table plus a leap-year check on February.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/studio/change-date.ts` (new)
- `apps/web/test/shared/change-date.test.ts` (new)
- `apps/web/src/studio/pages/interventions.tsx` (sort, grouping and date
  display only)
- `apps/web/src/components/route/route-history-ledger.ts` (sort and grouping
  only)
- `apps/web/test/shared/interventions-page.test.ts`
- `apps/web/test/shared/treatments-history.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `packages/domain/**`, `packages/analytics/**`, `tools/pipeline-v2/**` — the
  serving payloads keep their current string shape. This plan normalizes at the
  presentation boundary only. Changing the artifact contract would require a
  republication, which this plan is not authorized to do.
- `apps/web/src/components/route/route-intervention-model.ts` — its
  `compareDatesNewestFirst` operates on Plan 091 inventory dates, which are
  already strict ISO. Leave it alone; Plan 103 revisits it.
- `apps/web/src/components/route/intervention-trend-model.ts` — observation
  months are strict `YYYY-MM` by contract.
- Any change to which rows appear, which routes they attach to, filter
  semantics, the `validateInterventionsSearch` URL contract, or pagination.
  This plan changes **order and date rendering only**. If a test asserts a
  different set of visible rows after your change, that is a STOP condition.

## Git workflow

- Branch: `codex/102-typed-change-dates`, cut from a clean checkout of
  `origin/main`.
- Commits by logical unit: the module plus its tests; then the two call sites
  plus their test updates. Imperative subject lines matching recent history
  (for example `Type documented change dates` and
  `Order the intervention ledger by date`).
- Do not push, open a PR, publish artifacts, or deploy unless separately asked.

## Steps

### Step 1: Write the module and pin the complete real vocabulary

1. Create `apps/web/src/studio/change-date.ts` implementing the target contract
   and the binding parse and comparison rules above.
2. Create `apps/web/test/shared/change-date.test.ts`. It must include a table
   test that feeds **every one of the 67 free-text literals listed in "Current
   state"** through `parseChangeDate` and asserts the expected precision, and
   separately asserts exact `start`/`end` for at least one literal of each of
   the five shapes.
3. Assert the counts the table promises. Over that 67-literal list the totals
   are exactly: **41 `quarter`**, **7 `range`** (the four `YYYY-YYYY`, plus
   `2019/2020` from rule 4, plus `Late 2018/Early 2019` and
   `late 2025 or 2026` from rule 6), **3 `month`** (the two `March … 2010`
   literals and `November 16–19, 2020`, all from rule 6), and **16 `unknown`**.
   41 + 7 + 3 + 16 = 67; assert that sum too, so a future literal cannot be
   silently absorbed.
4. Add ISO cases: `2025-10-02` → day, `2024-05` → month, `1963` → year.
5. Add ordering cases: a list containing `TBD`, `2026-04`, `2013-2014`,
   `2026-spring` and `2025-10-02` sorts to
   `2026-04`, `2026-spring`, `2025-10-02`, `2013-2014`, `TBD`.
   (`2026-spring` opens on 2026-04-01 and so ties with `2026-04`; the shorter,
   more precise interval leads.)
6. Add overlap cases: `2013` overlaps `2013-03`; `2013-2014` overlaps `2014`;
   `2013` does not overlap `2015`; `TBD` overlaps nothing including itself.

**Verify**: `bun test apps/web/test/shared/change-date.test.ts --timeout 5000`
→ all pass, including the 67-literal table.

### Step 2: Sort and render the interventions ledger through the module

In `apps/web/src/studio/pages/interventions.tsx`:

1. Parse once per row when the row is built. Add a `date: ChangeDate` field to
   `InterventionDisplayEvent` alongside the existing `year` and `sortKey`
   fields; populate it in `interventionRows`, `corpusInterventionRows`,
   `wikiTimelineRow`, `wikiTreatmentRow` and `wikiProjectRow` from the same
   string each currently assigns to `sortKey`. Do not delete `year` or
   `sortKey` in this step — other call sites read them.
2. Replace the `.sort(...)` comparator so the primary key is
   `compareChangeDatesNewestFirst(left.event.date, right.event.date)`, keeping
   the existing route-label and title tie-breaks after it.
3. Replace `yearLabel(row.event.year)` with
   `changeDateGroupLabel(row.event.date)` at every call site
   (`datedRows`/`undatedRows` partitioning, `yearGroups`, `yearDistribution`,
   the `LedgerRow` "When" cell). Keep the exported `yearLabel` function and its
   existing tests intact — it is asserted directly by
   `interventions-page.test.ts` and removing it is out of scope.
4. Replace `timelineDateLabel(row.event.year)` with `row.event.date.display`
   and `timelineDateTime(row.event.year)` with the interval `start` (omit the
   `dateTime` attribute entirely when the precision is `unknown`).
5. Delete `timelineDateLabel`, `timelineDateTime` and the now-unused
   `MONTH_LABELS` constant **only if** nothing else in the file references
   them after step 4. `CLAUDE.md` §3: remove only what your own change made
   unused.

**Verify**:

```sh
bun test apps/web/test/shared/interventions-page.test.ts --timeout 5000
rg -n "sortKey\.localeCompare" apps/web/src/studio/pages/interventions.tsx
```

Expected: tests pass; `rg` returns no matches.

### Step 3: Sort and group route history through the module

In `apps/web/src/components/route/route-history-ledger.ts`:

1. Add `date: ChangeDate` to `HistoryLedgerRow`, populated in `put()` from
   `input.dateLabel`. Keep `dateLabel` (rows render it) and keep `sortKey` only
   if a caller still reads it; if nothing does after step 2 below, delete it.
2. Rewrite `compareLedgerRows` so the date comparison is
   `compareChangeDatesNewestFirst(left.date, right.date)`, keeping the existing
   kind-order and title tie-breaks. Delete the manual dated/undated partition —
   `compareChangeDatesNewestFirst` already sorts `unknown` last.
3. Change `groupRouteHistoryLedger` to group on `changeDateGroupLabel(row.date)`
   instead of `historyYearLabel(row.dateLabel)`.
4. Keep `historyYearLabel` exported: `treatments-history.test.ts` imports it
   directly and `TreatmentsHistorySection.tsx` uses it to decide the
   "Date unavailable" label. Re-implement its body as
   `changeDateGroupLabel(parseChangeDate(dateLabel))` so there is one parser,
   and update its doc comment.

**Verify**:

```sh
bun test apps/web/test/shared/treatments-history.test.ts --timeout 5000
rg -n "historyYearLabel\(.*\) !== \"Undated\"" apps/web/src/components/route/route-history-ledger.ts
```

Expected: tests pass; `rg` returns no matches.

### Step 4: Add the regression tests that would have caught the bug

1. In `apps/web/test/shared/interventions-page.test.ts`, add a test that builds
   rows from a fixture containing `TBD`, `Thursday, March 19th at 6:00pm`,
   `2026-spring`, `2026-04` and `2013-2014`, calls `interventionRows`, and
   asserts that the first row's group label is `2026` and that no row whose
   date is unknown appears before a row whose date is known.
2. In the same file, add a test asserting that `yearGroups` over that fixture
   produces strictly descending group labels.
3. In `apps/web/test/shared/treatments-history.test.ts`, add the equivalent
   assertion for `buildRouteHistoryLedger` plus `groupRouteHistoryLedger`,
   including one `2013-2014` row that must render under the `2013–2014` group
   (EN DASH) and must not be split.

**Verify**:
`bun test apps/web/test/shared/interventions-page.test.ts apps/web/test/shared/treatments-history.test.ts --timeout 5000`
→ all pass, including the new tests.

### Step 5: Run the full gate

```sh
bun run check:types
bun run check:style
bun run check:architecture
bun run test:web
bun run check:web-release
bun run check
```

Expected: all exit 0. `check:web-release` must show the entry bundle at or
below 145 KiB gzip and the aggregate at or below 390 KiB gzip; this module is
pure and small, so a budget failure means something else regressed — treat it
as a STOP condition.

Update only Plan 102's row in `plans/README.md`.

## Test plan

New file `apps/web/test/shared/change-date.test.ts`, modelled structurally on
`apps/web/test/shared/route-insight-placement.test.ts` (pure model, `bun:test`,
no router):

- the 67-literal table, asserting precision for every literal;
- exact `start`/`end` for one literal per shape;
- the three strict ISO shapes;
- display strings for day, month, quarter, year and range;
- ordering, including the `2026-spring` versus `2026-04` tie-break and unknown
  sorting last;
- overlap, including a `range` spanning a `year`, and unknown never
  overlapping;
- group labels, including the multi-year EN DASH form.

Extended in `interventions-page.test.ts` and `treatments-history.test.ts`: the
regression assertions from Step 4. Existing assertions in both files must
continue to pass unchanged except where a test asserted the old broken order —
if you find one, quote it in your report rather than silently rewriting it.

## Done criteria

ALL must hold:

- [ ] `apps/web/src/studio/change-date.ts` exists and exports exactly the six
      named symbols in the target contract, with no default export.
- [ ] `bun test apps/web/test/shared/change-date.test.ts --timeout 5000` passes
      and the file asserts all 67 free-text literals.
- [ ] `rg -n "sortKey\.localeCompare" apps/web/src/studio/pages/interventions.tsx`
      returns no matches.
- [ ] `rg -n "\"SF Mono\"|new Date\(" apps/web/src/studio/change-date.ts`
      returns no matches (no runtime `Date` dependency).
- [ ] `bun run test:web` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `bun run check:web-release` exits 0 with both bundle budgets passing.
- [ ] `git status` shows no modified file outside the In-scope list.
- [ ] Plan 102's row in `plans/README.md` is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- A live free-text literal appears that is not in the 67-literal table and does
  not fall cleanly into rule 6. Report the literal and its record count; do not
  widen rule 6 to swallow it.
- Any change you make alters which rows are visible, which route a row attaches
  to, filter behaviour, the URL contract, or pagination. This plan is
  order-and-display only.
- An existing test asserts the current broken ordering and you would have to
  rewrite its expectation. Quote the test and stop.
- The seasonal quarter mapping turns out to be contradicted by a source
  document in the corpus (for example a `2011-winter` record whose cited text
  says December 2010). Report it; do not invent a cross-year winter interval.
- `bun run check:web-release` fails a bundle budget.

## Maintenance notes

- `parseChangeDate` is the only place a documented date string may be
  interpreted. Any new date rendering must go through it; a reviewer should
  reject a second regex over a date field.
- The seasonal mapping is a documented approximation. If the upstream MTA-wiki
  release ever emits a typed date with an explicit interval, prefer it and let
  the parser handle only legacy strings.
- Plan 103 depends on `changeDatesOverlap`. Widening the parser to guess more
  aggressively will change which changes are reported as overlapping, which is
  a public claim; treat parser changes as evidence changes.
- 22 records legitimately have no year and will always render as undated. That
  is correct, and the count is worth watching: if it grows, the upstream
  extraction has regressed.
