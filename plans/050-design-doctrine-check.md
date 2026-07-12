# Plan 050: Design-doctrine harness check — ban metadata slop mechanically (interpunct chains, kicker eyebrows, banned phrases)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. Plans 048/049 should land first (049
> deletes files that would otherwise land in the allowlist).

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW (new test file + two package.json script lines; no runtime code)
- **Depends on**: 049
- **Category**: dx (lint/guardrail)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

The operator (2026-07-06): "We need to add some lint rule to web app that
detects the pattern present in the following examples. It is like 'metadata
slop' where it feels like it's used whenever trying to fill up space on the
page." The three named patterns:

1. **Interpunct metadata chains** — `Bus Priority Impact Studio · A civic
   data project`, `Manhattan: 6.4 mph · Brooklyn: 6.6 · …`. 26 instances
   exist in `apps/web/src` today.
2. **Kicker eyebrows** — small uppercase label above a large heading ("In
   focus this month" over "Three routes telling three different stories").
   ~44 uppercase-tracking label instances exist; the eyebrow signature
   (semibold/bold + uppercase + tracking 0.12-0.16em) appears in 16 files.
3. **Banned phrases** — the June-2026-12 standing bans that keep regressing
   ("data as of" chips) plus the 2026-07-06 additions ("A civic data
   project", "route feed generated", section titles like "How we know
   this").

Codifying these as a harness test makes the ban permanent: gen-6 page plans
(051-058) each shrink the allowlist, and the check blocks regressions
forever after. This repo's established mechanism for exactly this kind of
rule is a bun-test file over globbed sources
(`tests/harness/production-boundaries.test.ts`), wired into
`check:architecture` — not a Biome plugin (no GritQL plugins are in use in
`biome.jsonc`, and phrase/pattern bans over JSX text fit the harness style
the team already maintains).

## Current state

- `tests/harness/production-boundaries.test.ts` — the exemplar. Mechanism:
  `Bun.Glob("**/*.{ts,tsx}").scan({ cwd: root })` → read file text →
  regex/string assertions with per-file failure messages, e.g.:

  ```ts
  async function readFiles(root: string): Promise<Array<{ path: string; text: string }>> {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const files: Array<{ path: string; text: string }> = [];
    for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
      files.push({ path: `${root}/${path}`, text: await Bun.file(`${root}/${path}`).text() });
    }
    return files;
  }
  ```

  IMPORTANT: that file also pins root script strings (`requiredRootScripts`,
  lines 15-21). It pins `check:web-architecture` exactly; it does NOT pin
  `check:architecture`, so `check:architecture` can gain a new sub-command
  without touching the pinned constants. Do not modify
  `production-boundaries.test.ts`.

- Root `package.json` scripts (relevant lines):

  ```json
  "check:architecture": "bun run check:web-architecture && bun run check:claude-config",
  "check:web-architecture": "bun test tests/harness/production-boundaries.test.ts --timeout 5000",
  ```

- Known current violations (why a ratchet allowlist is required — these
  files are owned by later plans): interpunct in
  `studio/pages/home.tsx` (5×, incl. lines 484, 577, 705, 707, 784),
  `components/route/RoutePublicAtoms.tsx:88`,
  `components/CorridorProfile.chart.tsx:178`,
  `components/TreatmentBadge.tsx:66`, `components/InterventionTimeline.tsx:50`,
  `components/route/RouteGeoMap.tsx` (2×),
  `components/route/RouteMapLibre.map.tsx:171`; kicker signature
  (`uppercase` + `tracking-[0.12em|0.14em|0.16em]`) in ~10 files including
  `home.tsx`, `RoutePublicAtoms.tsx`, `RouteVerdictLede.tsx`,
  `studio/pages/methods.tsx`, `studio/pages/network-map.tsx`,
  `components/route/RouteMapSection.tsx`; phrases in `home.tsx`
  ("A civic data project" ×2, "route feed generated" ×2, "How we know
  this", "How to use this site", "In focus this month") and
  `studio/pages/methods.tsx` ("Generated ").

- Functional small-caps labels (KPI labels, chart tick labels) use
  `tracking-[0.06em]`/`[0.08em]`/`[0.1em]` and are NOT banned — the banned
  signature is specifically the 0.12-0.16em eyebrow range.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run the new check alone | `bun test tests/harness/design-doctrine.test.ts --timeout 5000` | all pass |
| Architecture chain | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Full unit gate | `bun run test:unit` | all pass (harness dir is inside `tests`) |

## Scope

**In scope**:
- CREATE `tests/harness/design-doctrine.test.ts`
- EDIT root `package.json` (add `check:design-doctrine`, extend
  `check:architecture`)
- `plans/README.md` (status row)

**Out of scope**:
- Fixing ANY of the current violations — plans 051-058 own their files and
  must shrink the allowlist as they land. This plan only freezes today's
  violation set.
- `tests/harness/production-boundaries.test.ts` — do not touch.
- `biome.jsonc` — no Biome-plugin approach.

## Git workflow

- Branch: `codex/050-design-doctrine-check`
- One commit. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the harness test

Create `tests/harness/design-doctrine.test.ts`, following the
`readFiles`-over-glob shape of `production-boundaries.test.ts` (root:
`apps/web/src`; skip paths containing `/dev/`, `/worker/`, and files ending
`.gen.ts`). Three rule groups, each a `test(...)`:

```ts
// Design doctrine (operator verdicts 2026-06-12 and 2026-07-06):
// 1. No interpunct metadata chains in UI source — write natural language.
// 2. No kicker eyebrows (small uppercase label over a heading).
// 3. Banned phrases that keep regressing.
// The allowlist is a RATCHET: it freezes violations that existed when this
// check landed. Plans 051-059 delete them. Adding a file is forbidden;
// removing entries as files are cleaned is required (stale entries fail).

const INTERPUNCT = /·|&middot;/; // the raw char AND the HTML entity (RPubSlowCard uses &middot;)
const KICKER_CLASS = /uppercase[^"'`]*tracking-\[0\.1[246]em\]|tracking-\[0\.1[246]em\][^"'`]*uppercase/;
const BANNED_PHRASES = [
  /civic data project/i,
  /feed generated/i,
  /data as of/i,
  /how we know this/i,
  /how to use this site/i,
  /in focus this month/i,
];
```

Allowlist shape (paths relative to `apps/web/src`):

```ts
const ALLOWLIST: Record<"interpunct" | "kicker" | "phrase", readonly string[]> = {
  interpunct: [/* filled in step 2 */],
  kicker: [/* filled in step 2 */],
  phrase: [/* filled in step 2 */],
};
```

Assertions per rule group:
1. Every violating file is in the rule's allowlist —
   `expect(violators.filter(notAllowed), "<path> violates design doctrine (<rule>) — use SectionCard/SourceNote/natural language instead").toEqual([])`
   style, with one expect per file so failures name the file.
2. Every allowlist entry still violates (stale-entry guard):
   `expect(allowlisted.filter(clean), "stale design-doctrine allowlist entries — remove them").toEqual([])`.

Escape hatch: a line containing the comment `design-doctrine-allow` is
skipped for the interpunct rule only (for a future legitimate typographic
use; none exists today — do not add one to make the test pass).

### Step 2: Freeze the current violation set

Run the check with empty allowlists:
`bun test tests/harness/design-doctrine.test.ts --timeout 5000` → it fails,
printing every violating file per rule. Copy those exact file lists into
`ALLOWLIST`. Re-run → all pass. (This makes the frozen set exact-by-
construction rather than trusting this plan's census.)

**Verify**: `bun test tests/harness/design-doctrine.test.ts --timeout 5000`
→ pass. Sanity: the allowlist should be ≈ the files named in "Current
state"; if a file appears that is NOT owned by one of plans 051-058 (check
their Scope sections in `plans/`), STOP and report — a slop pattern exists
somewhere no redesign plan covers.

### Step 3: Wire into the check chain

In root `package.json`:

```json
"check:design-doctrine": "bun test tests/harness/design-doctrine.test.ts --timeout 5000",
"check:architecture": "bun run check:web-architecture && bun run check:design-doctrine && bun run check:claude-config",
```

**Verify**: `bun run check:architecture` → exit 0 (all three sub-checks).
`bun run check:web-architecture` alone → still exit 0 (its pinned
`requiredRootScripts` assertions are unaffected — confirm the
`check:web-architecture` script string itself was not modified).

### Step 4: Full gate

**Verify**: `bun run test:unit` → all pass (the new file runs inside the
`tests` glob). `bun run check:style` → exit 0.

## Test plan

The deliverable IS a test. Additional self-checks inside it:
- A fixture-string unit test for `KICKER_CLASS` within the same file:
  matches `"text-[11px] font-semibold uppercase tracking-[0.12em]"` and
  `"tracking-[0.16em] uppercase"`, does NOT match
  `"font-bold uppercase tracking-[0.08em]"` (functional KPI label) or
  `"tracking-[0.1em] uppercase"` (0.10em is allowed).
- A fixture test that `BANNED_PHRASES` matches "route feed generated" and
  "Data as of Jun 2026" but not "generatedAt" (identifier) — the phrase
  regexes operate on raw text, so pick phrase forms that cannot collide
  with identifiers (all six above contain spaces; keep it that way).

## Done criteria

- [ ] `bun test tests/harness/design-doctrine.test.ts --timeout 5000` exit 0
- [ ] `bun run check:architecture` exit 0
- [ ] `bun run check:web-architecture` exit 0 (untouched)
- [ ] Deleting any one allowlist entry makes the check fail with a stale-entry
      message ONLY if that file was actually cleaned (spot-check by removing
      `studio/pages/home.tsx` from `phrase` — must fail with the
      violates-doctrine message… wait, no: removing a still-violating file
      must fail with the "violates design doctrine" message; restore it)
- [ ] `bun run test:unit` exit 0; `bun run check:style` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 2 surfaces a violating file that no gen-6 plan's Scope covers
  (report the file; the operator decides whether it needs its own cleanup).
- The kicker regex flags more than ~20 files — the signature is too broad;
  report the census instead of widening the allowlist.
- `check:web-architecture` fails after your package.json edit — you
  modified a pinned script string; revert and re-read step 3.

## Maintenance notes

- Every gen-6 page plan (051-058) MUST remove its files from `ALLOWLIST`
  as part of its own done criteria; the stale-entry guard forces this.
- Plan 059 (map redesign, last in the generation) verifies the allowlist
  is empty or contains only deliberate survivors, and records any survivor
  in the wiki design doctrine.
- When adding future banned phrases (new operator verdicts), add the regex
  AND run the empty-allowlist pass to freeze new violations explicitly.
- If Biome later ships first-class custom rules the team wants, this test
  can port; the ban list is the durable artifact, not the mechanism.
