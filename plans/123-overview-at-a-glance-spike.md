# Plan 123: "Route at a glance" — Overview enrichment spike (comp-gated)

> **Executor instructions**: This is a DESIGN SPIKE plan, not a
> build-everything plan. Its deliverable is (1) a verified data census, (2) a
> comp under `plans/mockups/123-overview-at-a-glance/`, and (3) after the
> operator's APPROVE token, the implementation of exactly what the comp
> shows. Do not implement ahead of the token. On any STOP condition, stop
> and report. Update this plan's status row in `plans/README.md` (Generation
> 21 section) at each phase boundary.
>
> **Branch base**: audited against `origin/main@e0c00aaf`. Branch off current
> `origin/main`. Plan 122 must land first (it removes the Overview speed
> sentence this card replaces).
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/components/route/OverviewSection.tsx packages/domain/src/studio/routes/index.ts packages/domain/src/studio/route-dossier.ts`
> Plan 122's Overview edit is expected drift. Unexplained mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M (coarse — spike + one card)
- **Risk**: MED (design judgment; comp-gated)
- **Depends on**: plans/122-route-detail-hygiene.md AND
  plans/126-one-route-map.md (amendment below); operator comp approval
  (Phase B gate); Plan 116 improves several inputs but is NOT a blocker
- **Category**: direction
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

Overview is the tab every visitor lands on. Today it renders a prose
paragraph, a treatment badge row, a riders badge, the speed-history chart, a
mini locator map — and a ranked insight list that is empty on ~92% of routes
(the stale committed capability fixture reports `detectorFindings:
insufficient_data` for 389/389; verify live in Phase A). Meanwhile the
serving layer already delivers per-route evidence that nothing renders. The
operator's direction: stop duplicating the speed scalar there and use the
space to surface more of the data corpus.

**Amendment (2026-08-02, operator bug sweep).** Two upstream changes move
this spike's canvas:

- Plan 126 makes the Overview "Route map" card the ONE interactive route
  map (anchored popup, direction treatment, DOT-lanes overlay) and makes
  the speed-history chart fill its card. Phase B's comp MUST show that
  composition — interactive map card, filled chart, no mini locator. Run
  this spike only after 126 lands.
- Plan 122 now deletes the "No flags raised" filler card outright; the
  insight list renders nothing when empty. Read this plan's premise bullet
  about the ~92%-empty list accordingly — the hole it left is part of what
  the glance card earns its slot with.

## The candidate inventory (verified field-level, 2026-08-02)

Every candidate is already in the route-detail payload or an already-fetched
artifact — no new pipeline work, no new fetch:

| Candidate | Source (schema) | Today |
|---|---|---|
| 12-month movement companion | `route.context12mPct` — `packages/domain/src/studio/routes/index.ts:154` | rendered nowhere; its 6-month partner shows twice |
| Signal-priority coverage | `route.tspCoverage` (`yes/partial/none`) — `routes/index.ts:140` | rendered nowhere (ACE/lane are shown; TSP never) |
| Rider-hours lost | `route.riderHoursLost` — `routes/index.ts:136` | Riders tab + map lens only; the project's headline metric absent from Overview |
| Named peer comparison | `data.peerRoute` (full route object) — `routes/index.ts:431`, populated via `projections.ts:89` | consumed nowhere; Overview cites a peer percentile without naming the peer |
| Treatment posture + latest dated events | `dossier.treatmentPosture` (`aceActive`, `aceSince`, `busLaneMatchedLaneCount`, `latestEvents[≤5]`) — `route-dossier.ts:61-71` | string appears nowhere in apps/web; dossier already fetched on this page |
| Ridership trend + percentile | `dossier.ridership` (current, movement, percentile, 36-pt sparkline) — `route-dossier.ts:107` | Overview shows only a static riders/day badge |
| Slowest/busiest windows | `data.slowestWindows` / `data.peakWindows` — `routes/index.ts:437,440` | consumed only by other tabs' charts |
| Who the route serves | `data.equityContext` (5 fields) — `routes/index.ts:290-300` | Riders tab only |
| Evidence depth | `capability.surfaces[*].depth.monthsCovered` — `route-capability.ts:82-95` | asserted nowhere; the capability system's portfolio point |

Grain rule (binding): all of the above are route-level and legal on
Overview. Nothing segment-derived may render there (display-grain doctrine).

## Phase A — data census (no design yet)

1. Probe 5 live route-detail responses (bx20, bx28, m79-sbs, b82-sbs, q52-sbs)
   from `https://bus-priority-impact-studio.c20carroll.workers.dev/api/v1/studio/routes/<slug>`
   plus each one's dossier fetch (find the dossier URL in
   `apps/web/src/studio/api-client.ts` — the same fetch OverviewSection's
   sparkline uses). GET-only, ≤15 requests.
2. For each candidate above, record: populated? null? plausible? Include
   `data.insights` emptiness (RDX-04 verification: the stale fixture said
   detector findings are absent citywide — confirm against the live payload
   before designing around the hole).
3. Write the census as a table into the comp directory README.

**Verify**: census table exists with a row per candidate × 5 routes; each
cell cites the JSON path checked.

## Phase B — comp + gate

Build ONE comp: `plans/mockups/123-overview-at-a-glance/overview-comp.html`,
full-tab (operator taste: full-tab comps, fixed-slot layouts, terse copy,
no raw URLs; crisp solid emphasis, no glow). Content: a single "route at a
glance" card in the slot Plan 122 emptied, drawing on 3-5 census-verified
candidates — recommended: `context12mPct` beside the existing movement stat,
`riderHoursLost` with its coverage label, named peer row, `tspCoverage`
completing the ACE/lane/TSP triad, and `treatmentPosture.latestEvents`
(≤3, dated, linking to `?tab=history`). Follow the study-card rules: no
gate/check internals on the face, provenance in the existing SourceNote/Data
notes pattern, no date lines where a chart already carries dates.

Write the comp README with: what each element binds to (field path), what
was REJECTED in the census (unpopulated fields), and the approval line.

**GATE**: request the operator token ("approve 123 comp" or amendments).
Record it verbatim in the README. Do NOT proceed without it.

## Phase C — implement exactly the approved comp

- New pure model in `apps/web/src/components/route/` (e.g.
  `route-glance-model.ts`) + render in `OverviewSection.tsx`. Null-safe: any
  missing field drops its row silently; the card renders only if ≥2 rows
  exist (never an empty frame).
- Tests: model unit tests per row (populated/null); OverviewSection render
  test updated.

**Verify**: `bun test apps/web/test/shared --timeout 15000` → exit 0;
`bun run check:types` → 0; `bun --filter @bp/web build` → 0;
`bun run check:architecture` → 0 (doctrine: no kickers, no interpuncts, no
banned phrases in the new card).

## Done criteria

- [ ] Census table committed in the comp README (Phase A)
- [ ] Comp committed; operator token recorded verbatim (Phase B)
- [ ] Implementation matches the comp; all gates green (Phase C)
- [ ] Card renders on the 5 census routes locally or via prod screenshot
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- Census shows ≥3 of the recommended candidates unpopulated on ≥3 of the 5
  routes — the card premise fails; report the census instead of designing
  around nulls.
- Operator token not granted or granted with amendments — apply amendments,
  re-gate.
- Anything requires a new endpoint, a new fetch, or segment-grain data on
  Overview.

## Maintenance notes

- Plan 116's activation improves freshness of several inputs; re-run the
  census after it if Phase A ran before.
- If detector coverage ever ships (RDX-04's upstream fix), the insight list
  returns; the glance card and the insight list must not double-state the
  same fact — revisit then.
- Note for the comp: `plans/mockups/**` was deleted from main by Plan 113
  (comps live in git history). This plan reintroduces ONE comp directory as
  a living acceptance target; keep it after implementation as the approval
  record, matching the pre-113 convention.
