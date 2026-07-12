# Plan 057: Treatments & history tab — one grouped timeline, bounded lists, hidden citations, no meta-metrics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. HARD dependency: 053 (tab shell) and
> 049 (SourceNote); 054 recommended first (it owns the plain trend chart
> this plan deletes here).

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (largest section rewrite; two real bug fixes ride along)
- **Depends on**: 049 + 053 (hard); 054 recommended
- **Category**: direction (product/UX) + bug
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator, 2026-07-06: "Treatments & history is an absolute mess … Why are
there metrics about families or records 'with source labels'. Nobody knows
or cares about this. Same with 'document refs'. … The dated history is
probably the worst … badges of 'unda' — what is a unda? why is the date a
badge? why are we displaying some timeline as cards? Why are we doing
citations as these huge blocks of arbitrary text …? We should also not be
unconsensually showing all 95 cards of 'dated history' or 79 wiki
treatments."

All verified, with two real bugs:

1. **"unda"** — `timelineYearLabel()` (`TreatmentsHistorySection.tsx:303-306`)
   does `dateLabel.match(/\b\d{4}\b/)` and falls back to
   `dateLabel.slice(0, 4)`; undated wiki events carry
   `dateLabel: "undated"` (`wikiTimelineRow`, line 223), so the year badge
   renders literally "unda".
2. **Duplicate citations** — `CitationChips` maps `citationKeys` with no
   dedupe (`WikiEvidence.tsx:32-34`); served arrays contain duplicate keys,
   so the same "title / publisher / date / p. N" chip prints twice.
   (Plan 049's `citationEntries()` already dedupes — this plan swaps the
   call sites onto `SourceNote`.)

Both unbounded lists are real: `MergedTimelineList` renders every row
(lines 284-299) and `WikiTreatmentEvidence` renders every intervention +
project (lines 320-331). The four "PostureStat" tiles (Families / In place
/ Planned / Records "with source labels", lines 106-119) and the "Document
refs" list (lines 131-134) are meta-metrics — they move into the hidden
`SourceNote` disclosure. The section's duplicate plain `SpeedTrend` block
(lines 146-174) is deleted — the Overview tab owns the trend (plan 054).

## Current state

- `apps/web/src/components/route/TreatmentsHistorySection.tsx` (567 LOC):
  - Lines 67-183 render: SectionHeader + "N evaluated"/"N signals" badges →
    4× `PostureStat` → grid: `TreatmentInventory` ("In the record") +
    `TreatmentSourceList` ("Document refs") → "Dated history"
    (`MergedTimelineList`, sub "… Use before reading speed.") →
    `WikiTreatmentEvidence` → grid: duplicate `SpeedTrend` ChartFrame +
    `ComparisonCards` ("Evaluation cards").
  - KEEP the data layer: `mergedTreatmentTimelineRows` (185-213; dedupes
    serving+wiki by `sortKey:kind:title`, skips citation-less wiki events),
    `wikiTimelineRow` (219-233), `treatmentTimelineSort` (235-243; dated
    desc, undated last), `wikiEventTone` (249-266),
    `interventionComparisonCards` (400-419), `treatmentSourceRows`
    (421-431), `treatmentHistoryInsightRows` (61-65).
  - `windowLabel` (560-567) renders ASCII `->` — change to `→`.
- `apps/web/src/components/route/RoutePublicAtoms.tsx` —
  `RPubInterventionCard` (lines 257-327): the year-in-a-badge +
  date-as-mono card with `CitationChips` walls. After this plan it is
  importerless → DELETE (and if `RoutePublicAtoms.tsx` is then empty of
  components — plans 053/055 removed the rest — delete the whole file and
  fix remaining type imports).
- `apps/web/src/components/route/WikiEvidence.tsx` — `CitationChips`
  (24-68) DELETED here (last call sites are this section);
  `citationByKey`/`citationLabel` STAY (plan 049's `citationEntries` uses
  them).
- `apps/web/src/components/TreatmentBadge.tsx` — `TreatmentInventory`
  (grouped family/state inventory — KEEP, it's the good part) and a
  tooltip `title={\`${meta.label} · ${state.label}…\`}` at line 66
  (interpunct → comma; removes this file from the doctrine allowlist).
- DEAD (zero importers, verified 2026-07-06): `route/TimelineSection.tsx`
  (175 LOC, only importer of `InterventionTimeline.tsx` and
  `BeforeAfter.tsx`) — NOT deleted here; plan 060 sweeps it. Do not wire
  it back in.
- `apps/web/src/studio/treatment-model.ts` — `routeTreatments`,
  `groupTreatments`, `countTreatmentStates`, `TREATMENT_FAMILIES` (20
  types × 9 states, coverage 0-1). Consume as-is.
- Plan 049: `SectionCard`, `SourceNote` + `citationEntries(evidence, keys)`.
- Doctrine allowlists currently include `TreatmentsHistorySection.tsx`
  and `TreatmentBadge.tsx` — both come off in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- REWRITE the render half of
  `apps/web/src/components/route/TreatmentsHistorySection.tsx` (keep the
  exported data helpers listed above; fix `timelineYearLabel`)
- EDIT `apps/web/src/components/route/RoutePublicAtoms.tsx` (delete
  `RPubInterventionCard`; delete the file if empty)
- EDIT `apps/web/src/components/route/WikiEvidence.tsx` (delete
  `CitationChips`)
- EDIT `apps/web/src/components/TreatmentBadge.tsx` (tooltip interpunct →
  comma; no other changes)
- CREATE `apps/web/test/shared/treatments-history.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (allowlist shrink)
- `plans/README.md` (status row)

**Out of scope**:
- The dead `TimelineSection`/`InterventionTimeline`/`BeforeAfter` cluster
  (plan 060).
- `treatment-model.ts` logic.
- `/interventions` page (plan 058 reuses this plan's row primitives).
- Pipeline-side citation-key dedupe (UI is immune via `citationEntries`;
  noted for the wiki repo).

## Git workflow

- Branch: `codex/057-treatments-history-tab`
- Commits: (1) timeline row + bounded lists, (2) deletions + allowlist.
  Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the two bugs at the data edge

1. `timelineYearLabel` → return a real year or a readable label:

   ```ts
   function timelineYearLabel(dateLabel: string): string {
     const year = dateLabel.match(/\b\d{4}\b/)?.[0];
     if (year) return year;
     return "Undated";
   }
   ```

2. Citations: all citation rendering in this section goes through
   `SourceNote` + `citationEntries(evidence, citationKeys)` (deduped by
   construction). No raw `CitationChips` remain.

### Step 2: Rewrite the section render

New structure (all `SectionCard`):

1. **`SectionCard title="What's on this route"`** — sub is a plain
   sentence derived from `countTreatmentStates`:
   `"${counts.inPlace} treatments in place, ${counts.planned} planned or proposed."`;
   `right={<SourceNote label="About these records" entries={recordEntries}/>}`
   where `recordEntries` = the former meta-metrics:
   `{ label: "${timelineRows.length} dated records (${sourceRows.length} with named sources)" }`
   plus ONE entry per `treatmentSourceRows` row
   (`label: row.label, detail: \`${row.detail} (${row.year})\``). Body:
   `<TreatmentInventory treatments={treatments}/>` unchanged. This
   REPLACES: the PostureStat grid, the "In the record" header, and the
   entire "Document refs" column (`TreatmentSourceList` component —
   delete it).
2. **`SectionCard title="Timeline" sub="Documented changes on this route,
   newest first."`** — the merged rows, rendered as a single-column
   GROUPED-BY-YEAR list (not cards):
   - Group rows by `timelineYearLabel(row.dateLabel)`; order years desc,
     "Undated" last (the existing `treatmentTimelineSort` already orders
     rows; derive groups in order from the sorted list).
   - Year header: plain `text-[13px] font-semibold` text with a hairline.
   - Row: compact grid `[92px_minmax(0,1fr)]` — left: the date as PLAIN
     mono 11px text ("2024-03" → render as given; "Undated" muted); right:
     kind chip (`Badge` neutral; humanize:
     `kind === "serving_intervention" ? "program record" :
     kind.replaceAll("_", " ")`), `title` semibold 13px, `detail` 12px
     muted (2-line clamp via `line-clamp-2`), then
     `<SourceNote entries={citationEntries(evidence, row.citationKeys)}/>`
     (renders nothing when key-less — serving rows instead show their
     `sourceLabel` as a SourceNote entry without href:
     `entries={[{ label: row.sourceLabel }]}` when present).
   - BOUNDED: render the first 10 rows; below, a quiet button
     `Show all ${rows.length} records` toggling the rest (local state).
   - Timeline-placed insights (`treatmentHistoryInsightRows`): if any,
     render them as 1-3 compact signal rows (severity badge + title) at
     the TOP of this card, before the year groups.
3. **`SectionCard title="Documented treatments" sub="Treatments and
   projects extracted from cited source documents."`** — the wiki
   interventions + projects as compact ROWS (same row grid as the
   timeline, minus the date column): kind/status chips + title +
   description (clamped) + SourceNote. BOUNDED: first 8 + `Show all ${n}`.
   Renders nothing when both lists are empty (as today).
4. **`SectionCard title="Before & after evaluations" sub="Comparison
   windows promoted by the pipeline."`** — `ComparisonCards` content kept
   (it is real analysis), restyled minimally: keep the delta metrics; fix
   `windowLabel`'s `->` to `→`; the former "N evaluated" header badge
   becomes this card's count in the sub when > 0
   (`"${cards.length} promoted comparison windows."`).
5. DELETE: the duplicate `SpeedTrend` ChartFrame block (lines 146-174) and
   its `dossierSpeedSeries`/`SpeedTrend` imports; the `SectionHeader`
   import; the header badges row.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; dev server
`?tab=history` on a flagship route: timeline shows 10 rows + "Show all 95
records"-style button; year groups render; "Undated" group (if any) is
last and shows "Undated", never "unda"; citations are behind "Sources (n)"
popovers.

### Step 3: Delete the superseded pieces

1. `RoutePublicAtoms.tsx`: remove THIS SECTION's `RPubInterventionCard`
   usage only. Do NOT delete the component —
   `studio/pages/interventions.tsx` still imports it (verified); plan 058
   deletes it with its last consumer. Leave a
   `// last consumer: interventions.tsx — plan 058 deletes` note beside it.
2. `WikiEvidence.tsx`: delete `CitationChips` (verify importerless).
3. `TreatmentBadge.tsx:66`: tooltip `·` → `, `.

**Verify**: `rg -n "CitationChips" apps/web/src` → 0 matches;
`rg -ln "RPubInterventionCard" apps/web/src` → exactly 2 files
(`RoutePublicAtoms.tsx` definition + `studio/pages/interventions.tsx`);
typecheck exit 0.

### Step 4: Doctrine ratchet + full gate

Remove `TreatmentsHistorySection.tsx` and `TreatmentBadge.tsx` from the
plan-050 allowlists (and `RoutePublicAtoms.tsx` entirely if the file was
deleted).

**Verify**:
`bun run check:design-doctrine && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass, in budget.

## Test plan

CREATE `apps/web/test/shared/treatments-history.test.ts`
(renderToStaticMarkup + toContain). Fixtures: a route with 3 serving
interventions (one with `comparisonCohort`), an evidence bundle with 12+
timeline events (mixed dated/undated; at least one event with DUPLICATE
citation keys), 3 wiki interventions, 2 projects, 2 citations.

- `timelineYearLabel` pure cases: `"2024-03-01"` → `"2024"`; `"undated"` →
  `"Undated"`; `"circa 2019"` → `"2019"`. The string `"unda"` appears
  NOWHERE in rendered output.
- Bounding: with 12+ rows, the 11th row's title is NOT in the initial
  HTML; the "Show all" button text with the total count IS. (Static render
  shows the collapsed state.)
- Dedupe: the duplicated citation's label appears at most once per
  SourceNote (assert via the popover-entries pure helper
  `citationEntries` if popover content can't render statically — plan 049
  established the fallback).
- Year grouping: "2024" appears as a group header; "Undated" appears after
  the dated years in document order.
- Meta-metrics gone: rendered HTML contains none of "Families",
  "with source labels", "Document refs", "Dated history", "Use before
  reading speed".
- Evaluations: the cohort fixture renders "+0.40 mph"-style deltas and a
  `→` window label (no `->`).

**Verification**: `bun run test:web` → all pass.

## Done criteria

- [ ] `rg -n "unda\b|Document refs|with source labels|PostureStat|TreatmentSourceList" apps/web/src` → 0 matches
- [ ] `rg -n "CitationChips" apps/web/src` → 0 matches;
      `RPubInterventionCard` referenced ONLY by its definition and
      `studio/pages/interventions.tsx` (plan 058 finishes it)
- [ ] `rg -n "SpeedTrend" apps/web/src/components/route/TreatmentsHistorySection.tsx` → 0 matches (Overview owns the trend)
- [ ] Timeline + wiki lists are bounded with Show-all toggles (test-asserted)
- [ ] Doctrine check passes with the files off the allowlists
- [ ] Typecheck, `test:web`, build (in budget), style all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The file diverges from the cited line map — re-baseline.
- `mergedTreatmentTimelineRows`'s dedupe or sort behavior would need to
  change to make grouping work — STOP; the data layer is contractually
  KEEP, only rendering changes.
- `RoutePublicAtoms.tsx` still has live exports you can't relocate in one
  obvious move — leave the file, delete only `RPubInterventionCard`, note
  the leftover in the status row.
- A fixture reveals `citationKeys` referencing citations absent from the
  bundle at scale (>50% missing) — report; the SourceNote will render
  nothing and the timeline may look source-less, which the operator should
  see before shipping.

## Maintenance notes

- History tab now owns ALL treatment/event surfaces. `/interventions`
  (plan 058) reuses this plan's compact row + SourceNote pattern — keep
  them consistent.
- The "trend chart with event markers" idea (marrying Overview's trend
  with these events) is deliberately deferred — it needs design attention;
  record interest in the wiki if the operator asks.
- Pipeline follow-up for the wiki repo: dedupe `citationKeys` at export
  and fix source-title spacing artifacts ("60 th Street" is in the served
  data, not a render bug) — UI is already immune to the dupes.
