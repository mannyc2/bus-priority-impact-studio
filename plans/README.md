# Implementation Plans

This is the execution index for numbered implementation plans. Each plan
file is a self-contained spec — goals, verification commands, STOP
conditions — with its status tracked below. Each executor: read your plan
fully before starting, honor its STOP conditions, and update your row when
done. Plan bodies for completed generations live in git history (deleted
from the working tree 2026-08; numbering stays monotonic — never reuse a
number).

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

---

# Generation 21 — production-regression fix-pack + interventions/map UX repair (2026-08-02)

Planned by an `improve` read-only audit (four parallel scoped auditors —
provenance archaeology, live production probing, interventions UX mechanics,
map/route-detail mechanics — every load-bearing claim re-verified against
source by the lead session). Only `plans/**` changed. Audited against
`origin/main@e0c00aaf`; production probed 2026-08-02 on release
`pub_20260801T232501631Z`.

**Landing note (read before executing anything).** These plans were authored
on the stale `ops/gen18-artifact-publication` tree and grafted onto main
2026-08-04; plan bodies 115-126 and this section are the only parts that
landed. Plan 113 had already deleted 98 plan bodies plus every
`plans/mockups/` comp, so comps referenced below are read via
`git show <old-sha>:plans/mockups/...`. Two pieces of work these plans
reference stayed on the old tree and were NOT landed: the 2026-08-02
kernel-descope amendments to plans 098-101 (those plans are closed DONE on
main with production receipts), and the map hover/header fix — Plan 121
re-implements the latter on main, so treat main as the only base.

Headline findings: (1) the 2026-08-01 Plan 098 activation re-pointed
byte-identical deduplicated artifacts whose bodies still embed the previous
release's identity stamp; the client's strict stamp-equality checks null ALL
route facts — network map "0/348 verified", dead delay lens, "verified
exposure unavailable" on every route (integrity hashes all pass; plan 115).
(2) Most remaining empty states are artifacts never published in any release;
a fully verified June/July catch-up candidate exists but was cut from a
non-ancestor commit and needs rebase + re-verify before the operator
activates it (plan 116). (3) `/interventions` was swapped wholesale on
2026-07-28, three days before its plan existed, discarding the comp-approved
Plan 104 layout; the shipped page renders per-route episodes as near-duplicate
rows with schema vocabulary, fake collapsibles, and a doctrine-evading kicker
eyebrow (plans 117-120). (4) The network map still runs dwell-then-dim hover
(160 ms latch, whole-canvas 0.92→0.2 flips, no transitions); the operator's
2026-07-26 "hover never dims" decision was never landed or recorded
(plan 121). (5) Route detail renders the speed scalar three times with two
different numbers, and discards 36 served months of segment history because
the artifacts predate `spineReadiness` (plans 122, 116). (6) The active
release's routes-index projection carries `spark`/`movement6mPct` null for
375/375 routes (route-detail has real values), so the /routes "12-mo trend"
column is silently blank citywide; and raw capability diagnostics ("speed
months present, history artifact not built") render verbatim as public copy
under the honest-empty "Building" state (plan 124 + 116's amended gates).

**Operator bug sweep (2026-08-02, folded into the plans below — verified
against `origin/main@881d5611`, after the gen-17 tail closed).** Nine
reported defects and where each landed: the unplanned "No flags raised"
detector card → 122 (delete); two route maps and the Slow-segments readout
rail → NEW plan 126 (Overview map becomes THE interactive map with the
Plan-125 popup pattern + native direction treatment; explorer map + rail
retire); the hand-rolled "When riders ride" div chart → 126 (Recharts/
shadcn pair + styled tooltip); raw crosswalk slugs
(`priority_corridor_designation`, …) as public treatment names + the
"+N more" popover blowout → 122 (137 self-labeled crosswalk rows; client
label guard + helper fix + popover hygiene); speed-history chart floating
in card whitespace → 126 (chart fills card; shrink-the-card rejected);
"Checked" tab badge + "Checked clean / Detectors ran; no publishable
signal." empty copy → 124 (reworded; supersedes the keep-verbatim rule for
checked_clean only); single-option "Speed"/"All day" toggles and the
foreign-reading borough selector → 121 (suppress degenerate toggles;
DELETE the selector — it was `ui/select` with an unstyled trigger); the
run-on map note "(i)" → 121 (lead/body/hint as three lines); all-zero
legend "under 7 (0) …" → symptom of 115 (data discarded client-side; the
gen-17 publications ARE live) with an honest-degrade guard in 121; the
/routes filter input off the search primitive → 124.

## Execution order & status (gen 21)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 115 | Route facts under byte-reused releases (hash+coverage, not stamps) | P0 | M | none | DONE (executed 2026-08-04; no drift from `e0c00aaf` in the three in-scope files. Join and route-fact parity now compare coverage only; `releaseIdentityMatches`/`releaseIdentityLabel` deleted and the public status paragraph no longer prints `pub_` identifiers. SHA-256 integrity gating untouched. Byte-reuse regression pinned in both `api-client.test.ts` and `route-fact-evidence.test.ts`; 449 web tests, `check:types`, `@bp/web build` (137.4 KB gz entry), `check:architecture` all green. Production probe of the legend still owed — it needs a deploy.) |
| 116 | June/July catch-up + missing-artifact publication (OPERATOR runbook) | P0 | S-M | 098 active; 115 first recommended | TODO (blocked on operator auth; candidate must be rebased onto current main) |
| 117 | Merge identical cross-route episodes in the view model | P1 | M | none; before 118 | DONE (executed 2026-08-04; no drift from `e0c00aaf`. Step 1 measured the live citywide artifact: 222 episodes → 76 merged entries, 22 entries fold >1 member, largest = 36 producer episodes sharing one title/summary/citation/date (Queens Bus Network Redesign, 2025-06-29) and 12 tracker episodes (ACE, 2024-06-20). The >40% STOP fired at 64.9%; the operator authorized the full merge after the evidence refuted its "key is too coarse" premise — inside every group the title, summary and citations are identical and all 104 route-scoped components survive the union. `mergeIdenticalEpisodes` merges on authority + date + treatment mix + route-stripped title; `networkChangeGroups` now keys on day + treatment mix instead of `citations[0]`; the group badge strip caps and counts one unique-route list. Step 5 skipped on evidence: 0/188 routes hold two same-key episodes, so `PublicRouteHistory.tsx` is untouched. Live simulation: 0 same-key siblings left as separate rows, all 222 ids reachable exactly once. 455 web tests, `check:types`, `check:architecture`, `@bp/web build` (137.4 KB gz entry, 415.2 KB total) all green. Note for 119: after the merge no live bucket reaches `GROUP_THRESHOLD`, so the group `<details>` heading no longer renders on production data.) |
| 118 | Episode public copy layer (vocab, separators, disclaimer, badges, lint) | P1 | M | 117 | DONE (executed 2026-08-04 on top of 117; only 117's expected test-file drift from `e0c00aaf`). New `apps/web/src/studio/episode-copy.ts` owns the wording: provenance eyebrow deleted (SourceNote is the provenance surface), component sentences render as lead / detail / extent with real separator characters instead of margins, `action: unknown` leads with the Plan-106-sanctioned "Recorded change: <family>" and never an invented verb, extent descriptions that only rename a badge-shown route are dropped, the placement disclaimer is stated once above the list with identical dated states collapsed to one line plus a count, dates format as "July 27, 2026", the lowercase routeKey echo beside each badge is gone, and the tracker summary boilerplate is suppressed client-side. Route-history h1 is now "History" (the badge names the route). Doctrine lint ratcheted: kicker regex widened to `0.0[45]em` and three banned phrases added, PASSING with zero allowlist growth. Two documented deviations: `extentLine` drops the plan's unused `routeCount` parameter, and the done-criterion `rg "routeKey}"` still matches two legitimate React `key=` props (the rendered span is deleted). 466 web tests, `check:design-doctrine`, `check:types`, `@bp/web build` (137.4 KB gz entry, 415.7 KB total) all green.) |
| 119 | Real disclosure controls (Collapsible) on interventions surfaces | P1 | M | 117, 118 | DONE (executed 2026-08-04 on top of 117/118; drift was exactly those two plans, all five `<details>` sites present as planned). All five converted to the repo's `ui/collapsible` primitive via one shared `Disclosure` in `PublicChangeEntry.tsx`: a real `<button>` trigger with `aria-expanded`, a state-aware label (Show/Hide) and a chevron rotating on `group-data-[panel-open]`. ChangeGroup's static `<span>Open</span>` is gone; its trigger now carries only count + date + heading + control, while the source label and route-badge strip moved OUT to an always-visible sibling row — badges are non-interactive spans so they COULD have stayed inside, but a line-height hit target beats a grid-sized one and the strip reads the same either way. Three corrections to the plan's assumptions: the primitive is Base UI, not Radix; panels use `hiddenUntilFound` so disclosed content stays in the served document and find-in-page still reaches it (plain Collapsible unmounts closed panels, which `<details>` did not — this would have dropped the placement disclaimer out of the SSR HTML); the ChangeGroup collapsible is currently unreachable on live data because 117's merge leaves no bucket at `GROUP_THRESHOLD`. Bundle unchanged at 137.4 KB gz entry / 415.7 KB total. 466 web tests, `check:types`, `check:architecture` green. Keyboard behaviour asserted from rendered markup (`<button type="button" tabindex="0" aria-expanded="false">`); no live browser check was run.) |
| 120 | /interventions reconciliation: adopt episodes page, delete orphan, URL state | P1 | M | OPERATOR GATE (step 0); 117-119 first | DONE (executed 2026-08-04. Step 0 token APPROVE recorded verbatim in the plan file and `knowledge/log.md`. Route now lazy-imports the live page directly: the 10.90 KB (3.70 KB gz) interventions chunk disappears. Deleted after reference-checking each: `studio/pages/interventions.tsx` (1,234 lines), `RouteChangeIndex.tsx`, `ProposedPlans.tsx`, the route-index/proposed-plans half of `network-change-record.ts` (364 lines; build-out half stays live and keeps its coverage), `interventions-page.test.ts`, and the three zero-caller fetchers — net −3,352/+330 lines. URL state restored: `family`, `route`, `all` drive the page; the seven params that mapped to nothing are gone. One deviation: `family` is validated as a SHAPE not the plan's enum — the episode artifact's treatment-family vocabulary is not the retired ledger's, so mapping one onto the other would have invented a crosswalk; an unknown key reads as no filter rather than an empty page (pinned by test). The api-client loader tests that used the deleted fetchers were re-pointed onto live fetchers rather than deleted — they cover loader semantics, not those endpoints. 439 web tests, `check:types`, `check:architecture`, `check:web-release`, `@bp/web build` (137.0 KB gz entry, 415.3 KB total) all green.) |
| 121 | Calm network map: hover never dims, sr-only title band, honest chrome (no single-option toggles, borough selector deleted, structured note) | P1 | M-L | none | TODO |
| 122 | Route-detail hygiene: one speed scalar, honest history states, map hover, treatment labels + popover, no filler card | P1 | M-L | 115 recommended first | TODO |
| 123 | "Route at a glance" Overview enrichment spike (comp-gated) | P2 | M | 122, 126; operator comp token | TODO |
| 124 | Routes-index trend honesty + capability vocabulary out of public copy + search-field unification | P1 | S-M | none (data half rides 116's amended gates) | TODO |
| 125 | One click surface on the network map (popup leads; rail stays on browse) | P2 | S-M | 121 (same file, sequential) | TODO |
| 126 | One route map: Overview map goes interactive (popup + direction); explorer map + readout rail retire; riders chart on the chart kit; charts fill cards | P1 | L | 122 (same files); before 123 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale)

## Dependency and safety notes (gen 21)

- 115 first: it is the P0 production regression and every later activation
  (116) re-triggers the same class until it lands. 116 is operator-executed
  and may proceed in parallel once 115 is deployed.
- 117 → 118 → 119 → 120 execute SEQUENTIALLY (same files:
  `PublicChangeEntry.tsx`, `PublicInterventions.tsx`,
  `public-episode-view.ts`); never in parallel worktrees. 120 additionally
  holds the operator adjudication (gen-19 page canonical, Plan 104 layout
  contract formally retired) and must not run without its Step 0 token.
- 118 copies the approved `changeHeadline` grammar out of
  `network-change-record.ts` BEFORE 120 deletes that file's dead half.
- 121 and 122 are independent of the interventions chain and of each other
  (disjoint files) and may run in parallel worktrees with any of 117-120.
- 125 runs strictly AFTER 121 (both edit `studio/pages/network-map.tsx`).
  Operator decision 2026-08-02 recorded in 125: the anchored popup is the
  single desktop click surface; `NetworkMapSelected` survives only for the
  mobile sheet and `?segment=` share links (its unique cargo: rank — moved
  into the popup — plus the segment-evidence list and canonicalization
  notices, which stay on those two paths).
- 126 runs strictly AFTER 122 (same files: `OverviewSection.tsx`,
  `SegmentExplorer.tsx`, `RouteMapLibre.map.tsx`; 122's hover fixes carry
  into the surviving map). It is independent of the interventions chain and
  of 121/125 (different map component), but its popup ports Plan 125's
  anchored-popup ruling — read 125 before executing 126. Expected
  supersession: 122's step-3 readout strings die with the rail 126 deletes;
  the data-layer discriminants survive.
- 123 is comp-gated (Phase B operator token) and now runs after BOTH 122
  (empties the Overview slot) and 126 (the comp must show the interactive
  map card + filled chart).
- Comps referenced by these plans predate Plan 113's mockup deletion — read
  them via git history (e.g. `git show 926ce17c:plans/mockups/080-.../...`).
  Plan 123 reintroduces one living comp directory as its acceptance record.

## Findings considered and rejected / deferred (gen 21 — do not re-audit)

- **"Network map" h1 as an unplanned regression** — inverted premise: Plan
  059 specified the h1 character-for-character and the approved 080 comp
  shows the band; nothing on main ever deleted it. The 2026-07-26 title-band
  deletion exists only in the unmerged local tree. Removing it now is an
  operator-directed supersession, implemented + recorded by plan 121.
- **Artifact-side merge of per-route episodes** — impossible without
  breaking the producer conformance gate
  (`public-intervention-episodes.ts:352-358` pins 222/188/268); the merge is
  view-model-only (plan 117). The true upstream fix (one record per real
  change) is owed in mta-wiki, out of this repo's scope.
- **Relocating the Overview speed CHART to Slow segments** — rejected: two
  route-level charts inside a segment-grain tab violates display-grain
  doctrine. Only the duplicated scalar goes (plan 122); the monthly trend
  stays on Overview.
- **Blanket widening of the kicker lint** to all small-tracking uppercase —
  rejected: it would flag ~12 legitimate 0.06-0.08em column/stat labels. The
  surgical fix (add the 0.04-0.05em signature + 3 banned phrases) is in
  plan 118.
- **Treating "Treatment inventory unavailable" / 404 inventory artifacts as
  code bugs** — they are honest states for artifacts never published in any
  release; ownership is publication (plan 116), client handles them
  correctly via 404→null.
- **`TreatmentsHistorySection` + legacy route-history stack retirement** —
  deferred again (still the live fallback for missing artifacts and
  `?study=`/`?record=` deep links); blocker recorded in plan 120's
  maintenance notes (public path needs deep-link parity first).
- **Absent-artifact 500 envelope (Plan 031)** — no longer applies on the
  `/api/v1/artifacts/*` path: probing shows clean 404 `NOT_FOUND` envelopes
  with a 307 release redirect; the 404→null client path works. Do not
  re-plan Plan 031 for this path.
- **`fetchStudioInterventionsEvidence` throw-vs-null inconsistency** — real
  but moot standalone: all three legacy interventions fetchers have zero
  callers and their endpoints are 404; deletion folded into plan 120.
- **RDX-04 (detector findings / reliability empty citywide)** — upstream
  detector-coverage work, not a UI fix; evidence base is the stale v1
  fixture, so plan 123's Phase A verifies against live payloads before any
  design leans on it. Report-only here.
- **Stale v1 artifacts committed in-repo** (`public-episodes.json` v1 vs v2
  reader; capability manifest v1 vs schema 2) — fixture hygiene, not serving
  breaks: plan 122 step 6 handles the capability manifest; the episodes
  fixture is superseded by the served `public-episodes-v2.json` and its
  cleanup can ride any interventions PR.

---

# Generation 20 — aggressive LOC cleanup (2026-08-01)

Planned at commit `292d2bd0` on the dirty `ops/gen18-artifact-publication`
tree by an `improve` read-only audit (six parallel scoped audits —
pipeline-v2, packages, apps/web, docs+data receipts, knowledge+plans, and a
reference-graph safety rail — every load-bearing claim re-verified against
source by the lead session). Only `plans/**` changed. Operator direction:
aggressive cleanup — delete docs, one-off files, and legacy code; reduce
LOC significantly. Plans were written for all high-confidence findings,
with operator-judgment deletions isolated in 114.

Measured baseline (tracked lines at `292d2bd0`): ~248K code, ~2.5M JSON,
~104K markdown. The plans remove ~24.4K code LOC and ~1.69M receipt/doc
lines outright, plus up to ~152K more behind 114's operator gates —
roughly 60% of all tracked lines, ~10% of code. None of the deleted web
code ships in the production bundle (already tree-shaken), so no plan may
claim bundle-size wins.

## Execution order & status (gen 20)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 107 | Truth sweep: stale pointers + reclaim-script footgun | P1 | S | none | DONE (executed, reviewer-verified, MERGED PR #118 2026-08-01) |
| 108 | pipeline-v2 dead code (forensics, one-offs, no-ship spike; ~9.5K LOC) | P1 | M | none | DONE (executed, reviewer-verified, MERGED PR #119 2026-08-01; −9,520 lines; registry 115→114; the 7 pre-existing oversize-receipt `check:style` errors cleared once 112 landed) |
| 109 | packages dead code (records policy, detector primitives, identity; ~7.7K LOC) | P1 | M | none (111 needs its step 8) | DONE (executed, MERGED PR #122 2026-08-01) |
| 112 | Receipts purge: docs/research + tracked data receipts (~1.63M lines) | P1 | M | 108 hard; 107 rec. | DONE (executed, MERGED PR #121 2026-08-01) |
| 113 | Docs corpus cutover: plans/, mockups/, knowledge/ (~63K lines) | P1 | L | 112, 107; gen-19 merged | DONE (executed 2026-08-01; −63,135 net lines; 98 plan bodies + 9 mockup dirs + 61 wiki pages deleted, README 2,163→691, `check:knowledge` hardened from 3 file-existence assertions to link/orphan/status gates) |
| 110 | apps/web dead code (~3.5K LOC + 41 CSS) | P2 | S-M | none (coordinate branch base) | DONE (executed, MERGED PR #123 2026-08-01) |
| 111 | Dead observation chain: geocode→context-events→parking→rts (~4.7K LOC) | P2 | M | 108, 109; gen-19 merged | DONE (executed, reviewer-verified, MERGED PR #124 2026-08-01; −4,544 lines; `export-intervention-corpus.ts --reconcile-report` found to be a live caller of the summary-rows loader, so that file stayed whole) |
| 114 | Operator-gated: approvals worksheets, spine prototype, v1 endpoints | P3 | S-M | 108, 109, 112 | DONE (executed 2026-08-01; −151,615 net lines; all three tokens quoted in their commits, Step D recorded as no-action. `corridor-summaries.ts` kept — its caller-free gate found a live reader in `verify/d1-loaded.ts`) |

## Dependency and safety notes (gen 20)

- 107 first (defuses `reclaim-raw-json.sh`'s `rm -rf data/artifacts/docs`
  line, which would delete a CI-load-bearing tracked file). 108 before 112:
  108 deletes the tests that are the only readers of ~217K lines of
  `docs/research/artifacts` receipts, and dissolves the receipt hash-pins on
  plans 074/075/083. 112 before 113 for the same receipt-constraint reason.
- 111 and 113 both require the gen-19 branch merged first (they edit
  `data-products/registry.ts` / `test/cli/registry.test.ts` /
  `plans/README.md`, all dirty on that branch). 110 has zero file overlap
  with the branch's dirty set but coordinate the base anyway.
- The nine-file load-bearing keep-set for 112 (SHA-pinned rc26 candidate set,
  rc24 fixture receipt, detector-calibration register, gap-roadmap corpus,
  approvals receipts/scope-bindings, capability manifest, temporal-anchor
  audit) is enumerated inside the plan — violating it breaks `bun run test:unit`.
- `data/` deletions remain operator-approved-by-PR-merge; each such PR lists
  every cluster with line counts. `knowledge/raw/**` and all
  `packages/db/migrations*/` are untouchable in every plan.
- Registry-count arithmetic: `test/cli/registry.test.ts` pins the command
  inventory; 108 decrements it by 1, 111 by 10 more. The gen-19 branch adds
  commands, so executors reconcile against the live count, not this note.
- **Rebaseline (2026-08-01, mid-execution)**: main advanced to `90dd5282`
  (PRs #114-#117 merged — plan 105 landed; the gen-19 public-episodes work
  committed). Executors 107-109 ran against that baseline; targeted diffs
  verified all deletion targets byte-identical, with only the registry-test
  count (114→115, new `public-intervention-episodes` command) and 10 new
  out-of-scope `packages/domain/package.json` export lines as in-scope-adjacent
  drift. Plans 108/109/113 carry rebaseline blocks; 105's landing moved
  103/105/mockups-082 into 113's delete-list. The "gen-19 merged" gates on
  110/111/113 are satisfied.
- **113's pre-gate adjudication (2026-08-01)**: keep-plan 090 cites
  084/085/086/088/091 (all DONE, all deleted) in a "Depends on" provenance
  field. Reviewer ruling: dangling file-path citations inside a DONE
  keep-plan's body are acceptable by design — same precedent as 113's own
  citations of 103/105 — because git history is the archive. 090's body was
  left untouched; the five files were deleted with the rest.

## Findings considered and rejected / deferred (gen 20 — do not re-audit)

- **Plan-097 recovery machinery (~3.7K LOC across apps/web + db + pipeline)**
  — NOT dead: `PLAN097_RECOVERY_ENABLED` routes every production artifact
  read through the per-release recovery manifest until plan 098 lands. Its
  deletion belongs on plan 098's checklist, not on a cleanup sweep.
- **`TreatmentsHistorySection` (623 LOC) as superseded by gen-18
  `PublicRouteHistory`** — wrong: it is what production actually serves
  (the new artifact key cannot resolve pre-098, and `?study=`/`?record=`
  deep links pin the legacy branch). Consolidation belongs to the gen-18/19
  owner after the artifact serves.
- **`route-briefs` lib, `corridor` group, ingest/backfill/collect/gtfs-rt
  acquisition layer, all `packages/sources` adapters, `source-refresh` cron,
  data-products registry/completeness, JSON-Schema/OpenAPI machinery** — all
  verified live during this audit; do not re-propose.
- **Squashing or pruning `packages/db/migrations*/`** (~150K generated JSON
  lines) — rejected again; generation-17 D1-ledger safety stands, and the
  repo's own LOC accounting already excludes generated migrations.
- **`knowledge/log.md` deletion or rewrite** — declined; append-only doctrine
  and sole narrative record. Optional by-month split recorded in 114 step D.
- **Four drifted `schema-decode` copies** (analytics/studio-api/pipeline/web)
  — real duplication, deferred: consolidation is a refactor with live-path
  risk, not a deletion; keep out of cleanup PRs.
- **`StudyEvent*` V2–V5 schema generations** (`domain/studio/study.ts`) —
  investigate-only: V2–V4 readers still decode on-disk artifacts; collapsing
  requires a re-cut at V5 first (HIGH risk, L effort).
- **Orphaned schema-table constants** (`localParkingViolationMatch`,
  `localLionSegmentGeom`, `localRouteShapeGeom`, `studioActor*`) — tables
  outlive code by design here; removal is gated on migration policy nobody
  has commissioned.
- **Dead exports inside gen-18/19 in-flight files** (7 in
  `studio/pages/interventions.tsx`, 2 in `api-client.ts`, 3 constants in
  `network-map-model.ts`, `RouteDetailLoadingPage` in `route-detail.tsx`) —
  deliberately left to the branch owner; listed in plan 110's maintenance
  notes.
- **`geoclient-current-v2.yaml` and `docs/research/analytics-package.zip`** —
  both untracked and gitignored; zero tracked LOC; operator can delete from
  disk at will, no plan needed.
- **`.agents/`, `.codex/`, `.gstack/`, `.repos/`** — not git-tracked; out of
  scope for a tracked-LOC cleanup.
- **`bun run loc` snapshot artifact** — the repo's own LOC check
  (`check-loc.ts`) writes `data/artifacts/loc/latest.json`; use it to measure
  the before/after once plans land (report-only, always exits 0).

---

# Generation 19 — reviewed resolved-transit public-pack cutover (refreshed 2026-08-01)

Plan 106 was refreshed against `origin/main@5dd08062` after `mta-wiki` Plans
053-056 completed and the final non-prerelease
`resolved-pack-v1-production` GitHub Release was published. The exact release,
archive, manifest, resource, and accepted-conformance hashes are pinned in the
plan. The strict v2 importer, projection, readers, and deterministic unpublished
candidate are complete. Plan 098's protected production activation and
rollback proof are complete; Candidate B is active at serving generation 4
and the Tracker cutover is deployed.

## Execution order & status (gen 19)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 106 | Cut the site over to the reviewed resolved-transit public pack | P0 | XL | final producer release; 098 activation; Plan 057 authorization (all satisfied) | DONE (candidate `b647f0f1…`; generation-4 production deployment verified) |

## Dependency and safety notes (gen 19)

- Public producer input is the exact 11-resource
  `resolved-pack-v1-production` public pack. The five pinned operator
  Tracker-conformance files are build-only; no operator field may become
  public.
- The accepted target is exact: 222 episodes, 188 route artifacts, and 268
  memberships — 157 producer episodes plus 65 Tracker ACE enrichments, with
  131 mapped legacy episodes, eight exclusions, and 26 producer additions.
- Final semantics include five unknown actions and 138 unknown extents. The
  104 placements are 95 `last_confirmed_active` and nine `unknown`; the
  confirmed-current footprint is empty, so the site may make no current-active
  producer claim.
- Producer publication and `LATEST` promotion are complete. Plan 106, the
  Tracker pin, and deployment are complete through Plan 098's protected
  generation-4 activation and rollback proof.

---

# Generation 18 — the interventions and route-history rethink (2026-07-24)

Planned against `origin/main@b25542b0` from an operator-approved design
concept (revision 2, 2026-07-24), reviewed against the live deployment and
pinned artifacts. **Governing rule (decides every placement below): if it
has a date, it is history; if it is a condition, it belongs to the metric
that measures it.** The Treatments & history tab survives on exactly one
justification — it shows the **order, duration, and overlap** of dated
changes, which no metric tab can. Metric tabs keep current condition and
receive pointers only. `/interventions` becomes the network's change
record, led by how bus priority spread across the system.

Operator decisions (2026-07-24, binding): **D1** keep the history tab on
the tense rule above (delete it, not degrade to inventory, if chronology/
overlap don't land); **D2** treatment extents render on the existing route
map with a real legend, deep-linked from a change (no map inside history,
no route strip); **D3** agency-stated figures render inline in the citing
sentence, attributed, never in a verdict slot or on our own axis; **D4**
the network build-out chart leads `/interventions`; **D5** sequence typed
dates → route chronology → network page, with per-change evidence filled
in as each treatment kind becomes measurable.

## Execution order & status (gen 18)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 102 | Typed change dates and correct chronological order | P1 | M | none | DONE (verified 2026-07-26; all 67 free-text literals pinned) |
| 103 | Route Treatments & history as a change chronology | P1 | L | 102 | DONE (PR #111; the overlap STOP condition fired against live evidence and the operator resolved it 2026-07-26 by capping the display, not the claim) |
| 104 | `/interventions` as the network change record | P1 | M | 102 | DONE (2026-07-26; measured-data section re-derived against release `pub_20260725T164123260Z` after Plan 097's republish invalidated the original figures). LAYOUT CONTRACT RETIRED by operator adjudication (Plan 120, 2026-08-04); the build-out chart and the approved copy grammar carried forward — the grammar into `apps/web/src/studio/episode-copy.ts` via Plan 118, before Plan 120 deleted the module half that held it. |
| 105 | Metric-tab annotation layer and the no-duplication sweep | P2 | M | 103 | DONE (2026-07-26, amended; Additions 1-2 shipped with the `recordAnchorId` field; Addition 3's marker link deferred to a separate comp-gated plan) |

## Notes (gen 18)

- **Resolved Plan 098 prerequisite** (not itself a plan here): the Plan
  091 inventory and Plan 090 observation-bundle artifacts were never
  exported/published, so reading them returned HTTP 500 — indistinguishable
  from absent, since `PLAN097_RECOVERY_ENABLED` routes every artifact read
  through the active release's recovery manifest, and an absent key throws
  `logical_entry_missing`. Uploading to the logical key changes nothing
  without candidate registration. Plan 098's pointer is now active at
  generation 4, so later reviewed candidates can stage new keys atomically;
  unregistered Plan 090/091 keys remain honestly absent rather than silently
  bypassing the release manifest.
- The citywide evidence endpoint was down (HTTP 503, Cloudflare 1102 — a
  Worker resource limit, not missing data); fixed in code by PR #114
  (mta-wiki plan 106), which moved the reduction into the pipeline, but
  the new precomputed artifact was gated on Plan 098 and is now served by the
  generation-4 Plan 106 candidate.
- Numbering: mta-wiki's tracker plan for member-grain outcome certification
  takes the next free number after this generation (106+); don't renumber
  102-105.

---

# Generation 17 — production currency + atomic incremental publication (2026-07-22)

Planned against `origin/main@ecf556a79e23b4b9374d08210a380754756f357b`
by an `improve` read-only audit. Only `plans/**` changed. The audit replaced
four untracked, stale drafts whose numbering collided with landed Plan 096 and
whose proposed D1 ledger baseline was unsafe.

Operator decisions (2026-07-22, binding): remove month as release identity
but retain it as source grain/coordinate/partition; run detection daily;
publish a new complete critical-source partition within seven days and
never remain more than one source period behind; serve each dataset's full
trustworthy range without forcing a global intersection; optimize
Cloudflare cost, build time, upload bytes, and latency together; require
zero-downtime staging and one-pointer rollback; keep publication reviewed
rather than automatic; make a semantic no-change run a non-release.

Revised operator decisions (2026-08-02, binding; supersede the 2026-07-22
set where they conflict): retain de-month release identity, full trustworthy
per-dataset history without a global intersection, reviewed publication,
semantic no-change as a non-release, zero-traffic staging, and one-CAS-pointer
activation/rollback. Daily detection and the seven-day deadline are an
advisory habit backed by one scheduled issue, not a binding SLO. For unbuilt
work, drop the separate preview environment, hash-chained receipts,
operator-time accounting, fenced GC/tombstones, route-history chunking,
repo-wide decode inventory, and dependency-DAG cache. Full local rebuild plus
verified SHA-256 upload skip is the dedup mechanism.

Fresh-`origin/main` reconciliation on 2026-08-02 established that Plan 098
and Plan 106 had already completed in production before the dirty-tree
descope was written. The attempted Plan 098 amendment is moot and its remote
work must never be replayed. The protected-main approval, zero-traffic Worker
proof, CAS activation/rollback, and content-addressed durable receipts that
098 shipped remain binding proven machinery; Plan 100 generalizes them
instead of replacing them with CLI-only activation. Plans 099-101 use their
2026-08-02 kernels, amended for this drift.

Bounded bootstrap exception (production had no pointer yet): Plan 097 did
the same-schema catch-up with one proven atomic D1 activation batch and one
proven selective restore batch — no public contract change, no overwriting
active objects, no proceeding without remote proof on both. Plan 098
then establishes the pointer; every later activation/rollback uses it.
Production D1 also holds mutable auth/session/user state, so 097 preserved
it via selective serving-data recovery rather than replacing the database;
098 versions only generated serving projections behind that one pointer.

## Execution order & status (gen 17)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 097 | Safe production catch-up without migration forgery | P0 | M-L | 085-087, 095 (DONE) | DONE (2026-07-26; production serves `pub_20260725T164123260Z`, 375 exact routes; no rollback invoked) |
| 098 | Atomic serving releases with immutable artifacts | P0 | XL | 097 | DONE (2026-08-02; Candidate B active at generation 4 after production rollback drill) |
| 099 | Full dataset history and honest per-dataset coverage (kernel) | P2 | M-L | backfill: none; serving ships through normal publication | DONE (2026-08-02; generation-6 full-history candidate active, honest dataset gaps public, durable publish + no-op receipts verified) |
| 100 | One publish state machine and scheduled freshness alarm (kernel) | P1 | S-M | publisher: catch-up active; alarm: advisory ledger | DONE (2026-08-02; protected no-op, durable receipt, alarm issue #154, and staged Worker production smoke verified) |
| 101 | Deterministic artifacts, verified skip, de-month vestige sweep (kernel) | P1 steps 1-2; P2 rest | M | steps 1-2: none; sweep: 098 active and 099/100 complete | DONE (2026-08-02; deterministic generation-5 publish, generation-6 zero-PUT no-op, and protected-main vestige-sweep deploy receipts verified) |

## Notes (gen 17)

- Plan 098 activated and completed its production A→B→A→B rollback drill on
  2026-08-02. [097's STOP-receipt branch was moot: it completed cleanly
  2026-07-26.]
- Plan 098 separates content-derived candidate identity from activation-time
  release identity, versions only generated D1 data, and preserves auth/
  user/current-signal rows. One request resolves one release/candidate.
- The June/July catch-up including the pending gen-18 artifacts completed on
  2026-08-02 at generation 5, proving Plan 101 steps 1-2 over 4,247 artifacts.
- Plan 100 follows; its scheduled advisory alarm may land independently.
  Plan 099 then backfills full trustworthy history and honest per-dataset
  coverage and ships through a normal publish. Plan 101's vestige sweep is last.
- Plan 099 freshness is advisory. Plan 100's schedule detects drift and
  maintains one issue but has no serving credentials and never publishes.
- Plan 101 keeps monolithic route histories unless Plan 099 makes a payload
  impractical; no dependency-DAG cache or fenced automatic GC is required.
- Months remain legal observation/source-partition values under ADR-0022 —
  the ratchet targets selectors/defaults/config/release paths, not the word
  `month` or monthly data.

---

# Generations 1-16 (summary — plan bodies in git history)

- Gen 16 (096) — member-grain study consumer; DONE 2026-07-22.
- Gen 15 (095) — exact route serving recovery; DONE 2026-07-22.
- Gen 14 (094) — route-detail Treatments & History redesign; DONE 2026-07-22.
- Gen 13 (089) — approved `/interventions` network-ledger redesign; DONE
  2026-07-22.
- Gen 12 (090-093) — exact, lossless route intervention inventory + typed
  relevance + UI recognition + first non-ACE observation expansion; all
  DONE 2026-07-18.
- Gen 11 (084-088) — de-month cutover: monthly baselines/releases retired
  for coverage windows, ADR-0022, a freshness ledger, a harness gate; all
  DONE 2026-07-12.
- Gen 10 (082-083) — route-detail annotation layer + study-coverage spike;
  all DONE 2026-07-12.
- Gen 9 (077-081) — truthful interactive maps; all DONE 2026-07-12.
- Gen 8 (068-076) — audit fix-pack + business-problem arc (study engine,
  studies surface, opportunity spike); all DONE except 069 REJECTED
  (tautology premise false).
- Gen 7 (061-067) — determinism/LOC-reduction: dead detector subgraph,
  pipeline-v1 doctrine, decode-once serving, one ingest workflow, native
  Effect Schema; all DONE 2026-07-06.
- Gen 6 (048-060) — MTA visual language + page overhaul; all DONE 2026-07-06.
- Gen 5 (036-047) — consolidation: Effect Schema, `effect/unstable/cli`,
  raw-JSON deprecation, `packages/domain` prune; all DONE except **045 IN
  PROGRESS (nyc-transit-kit Orders 2-4 gated)**.
- Gen 4 (030-035) — post-incident hardening + July design repair; all DONE
  2026-07-04.
- Gen 3 (019-029) — the route evidence product: hard cutover, mta-wiki
  serving, corpus expansion, editorial redesign, Tier-2 deletion; all DONE
  except **026 BLOCKED (worker-Effect spike regressed `test:worker` ~3s to
  ~8-9s)**.
- Gen 1-2 (001-005, 008, 011-012 UI/UX + portfolio; 016-018 hard product
  cutover; 006-007, 009-010, 013-015 Effect-stack scoping) — all DONE
  except 013/006/010 REJECTED (superseded) and 007/009/014 SUPERSEDED (by
  026/026/029).

---

# Standing rejections and verified negatives (do not re-audit)

Every distinct claim below survives from a "Findings considered and
rejected," "Audit corrections," or equivalent corrections section in a
generation whose full body was compressed above. Wording is compressed;
content is not. The `[gen N]` tag names the originating generation for
provenance — most cite code paths or artifacts as they existed **at that
time**, not necessarily today.

## Serving/API

- [gen 4] "502 body leaks Zod issues" — FALSE: `snapshotContractFailureResponse`
  logged details to console only; the response body was the plain envelope.
- [gen 4] "/interventions double-fetches the 813KB `?schema=2` index" —
  FALSE: it fetched the v1 routes list + compact evidence payload and
  already degraded gracefully.
- [gen 4] "Evidence endpoint uncached" — FALSE: production served
  `cache-control: public, max-age=60, stale-while-revalidate=86400` + ETag.
- [gen 4] "Display months still break the snapshot post-#57" — eliminated:
  post-#57 D1 rows parse-or-skip and cannot fail the v2 compose; the
  isolated failure (model projection months) was fixed by plan 030.
- [gen 4] Borough heuristic defaults unknown prefixes to Manhattan; termini
  split on `" - "` — real, low impact; not worth a plan.
- [gen 4] Client-side Zod parse of the 1.19MB evidence payload on the main
  thread — real but minor (cached, infrequent); revisit only if it grows.
- [gen 4] "Evidence payload uncompressed on the wire" — FALSE: production
  served `content-encoding: br`.
- [gen 4] "Snapshot 2.0 fallback path untested" — FALSE: the #58 regression
  test existed (`api-facade.test.ts:2736`); plan 030 rewrote it.
- [gen 4] "Zod issues leak to clients in 502 details" — FALSE: error bodies
  are exactly `{error:{code,message}}`; issues go to console only.
- [gen 4] "R2 artifact passthrough lacks path validation" — stale:
  `decodeArtifactKey` + `isValidArtifactKey` already guarded it (plan 012).
- [gen 4] ETag inconsistency across response helpers — real but small;
  deferred, standardize on the studio helper only if legacy endpoints
  matter again.
- [gen 4] `.parse` on D1 rows in `db/d1/queries/route-batch-status.ts` —
  same 1101 crash class, covered by plan 031's envelope; per-site
  conversion not planned.
- [gen 8] Artifact-key path traversal via repeated URL-encoding — misread
  of `isValidArtifactKey`: non-stabilizing keys return false, dot
  components are rejected every decode pass, R2 keys have no traversal.
- [gen 8] Magic-link auth endpoints unthrottled — the endpoints don't
  exist; the auditor projected ADR-0008's design into code.
- [gen 8] Route-detail loader lacks 404 handling — false; both fetches use
  `loadNullableStudioJson` (404 → null).
- [gen 8] Unbounded `object.json()` on R2 artifacts — artifacts are
  self-published in the same trust domain; defending against them
  contradicts the CLAUDE.md no-impossible-scenario rule.
- [gen 8] Pre-063 characterization tests for `read-handlers` — real,
  offered and not selected; degrade behavior was pinned by roughly one
  regression test.
- [gen 18] Changing the serving payload's date shape — rejected: plan 102
  normalizes at the presentation boundary; retyping the artifact would
  force a republication generation 17 owns.
- [gen 1-2] CSRF on brief-draft writes (feature since deleted) — mitigated
  by `SameSite=Lax` cookies; idempotency-key enforcement was plan 008.
- [gen 1-2] R2 double-decode + error-message hygiene + missing negative
  auth tests — real but low severity; consolidated into plan 012.
- [effect-study] "58 scattered scope-check sites" in studio-api —
  overstated: they funneled through `hasStudioScope`/`requireStudioOperator`;
  the real issue (registry metadata unenforced by the dispatcher) became
  plan 008.

## Maps

- [gen 9] Replace MapLibre with Leaflet, deck.gl, or another renderer —
  rejected: ADR-0003 already settles MapLibre; the defects were invalid
  style values, lifecycle, interaction, contracts — not a renderer limit.
- [gen 9] Restore the hour scrubber/autoplay/carpet animation — rejected:
  removed for a calmer evidence UI; missing hours aren't an apparently
  continuous movie.
- [gen 9] Add dedicated map/treatment/opportunity pages or tabs — rejected
  by the binding no-new-navigation direction; improve existing surfaces.
- [gen 9] Use a hosted street basemap immediately — deferred: CSP, terms,
  attribution, reliability, and privacy need a separate decision; the
  release already had useful first-party geographic context.
- [gen 9] Migrate all map artifacts to PMTiles now — deferred: the network
  artifact was ~396KB gzip; add budgets and measure cost first.
- [gen 9] Ship an opportunity lens now — rejected: plan 076's transparent
  prototype had three gated ACE inputs but zero scoreable segments
  (treatment absence unestablished for 818 unknowns).
- [gen 9] Perform route/lane or historical joins in the browser/Worker —
  rejected: heavy geospatial work stays in the Bun pipeline; clients
  consume precomputed, verified joins.
- [gen 9] Treat ACE/TSP midpoints or an offset route line as "close
  enough" — rejected: a precise-looking false point/line is worse than an
  explicit route-level badge and source-gap state.
- [gen 9] Defensively render malformed own-pipeline coordinate arrays —
  rejected again: validate owned artifacts at build/release boundaries,
  not impossible-shape defenses in request/render code.
- [gen 8] Coordinate `[1]` access in `RouteMapLibre.map.tsx:245` —
  own-pipeline GeoJSON positions are always 2-element; left as-is.
- [gen 12, gen 18] Segment-level tags for camera enforcement (ACE) or
  signal priority (TSP) — rejected twice: both have zero within-route
  variance (Plan 081); lane coverage genuinely varies and keeps its tag.
- [gen 1-2] 311 complaint heatmap layer — real opportunity but needs
  pipeline spatial-join work and a design pass; deferred until after the
  map foundation (002/003).

## Design system

- [gen 12] A bespoke badge on every `/interventions` row — rejected: typed
  filters/search make all kinds discoverable; the ledger stays text-led.
- [gen 12] Silently executing the full 089 comp as a process — still
  rejected: executable only because the operator token approved D22-D27.
- [gen 18] Deriving Overview trend markers from `route.interventions[]`
  when the observation bundle is missing — rejected: bypasses the Plan
  090/093 relevance gate; an explicit STOP condition in plan 105.
- [gen 10] Computed before/after deltas, percentages, or verdict shading
  from a marker date on route charts — rejected: the repo's own studies
  prove raw deltas mislead (M79+/B82+); markers carry dates/labels only.
- [gen 10] A standalone /studies page or new tab — already rejected by the
  binding 2026-07-09 operator direction; integrate into existing surfaces.
- [gen 10] Markers for year-only/undated events on a month-axis chart —
  rejected: a year can't be honestly placed at a month position.
- [gen 10] Corpus records as chart markers in v1 — rejected for now: all
  310 served corpus records were pre-window (0 `evaluableInWindow`).
- [gen 10] Fixing the SpeedTrend index axis as its own plan — folded into
  082 instead, avoiding a double-touch of the same chart file.
- [gen 8] Segments-tab fetch waterfall / per-tab code-splitting / eager map
  GeoJSON / keystroke filtering on /routes — not worth doing: the
  lazy-artifact split was documented, entry budget was green.
- [gen 7] Borough-heuristic semantic fix, web-vitals lazy-install,
  feature-contract memoization, `dev/`/`fixtures/` bundle exclusion —
  cosmetic/unproven cost; not planned.
- [gen 6] "The M86 badge clipping can't be verified" — WRONG: an inline
  duplicate appended `-SBS` to labels already containing SBS, no `nowrap`.
  Fixed in plan 049.
- [gen 6] "No data duplication across sections — all intentional" —
  overridden: segment speeds surfaced in 4 sections, hourly data in 4; tab
  plans gave each family one home.
- [gen 6] "12 served routes / 6 wiki bundles" — stale local pilot
  artifacts; production served 381 routes; plans stayed corpus-size
  independent via capability gating.
- [gen 6] "Keep one 'route feed generated' timestamp" / "move featured
  routes to /case-studies" / "add pagination only if perf demands" — all
  rejected: the operator's directives were explicit.
- [gen 6] Biome/GritQL plugin for the slop lint — rejected: the custom-rule
  mechanism is the bun-test harness, already wired into `check:architecture`.
- [gen 6] Renaming section registry values or route URLs for the tab IA —
  rejected: `ROUTE_DETAIL_SECTIONS` stayed; tabs compose via `?tab=`.
- [gen 6] Deleting the pipeline's `methods.json` build with the methods
  page — out of scope of plan 052 (serving-only removal).
- [gen 6] `RouteBoardingsTrend` "proxy" mode (synthesized rider counts from
  scaled speed data) — killed in plan 056 as a fabrication hazard.
- [gen 6] "60th Street" spacing in citations — source-data artifact from
  wiki extraction, not a render bug; UI made dupe-immune in plans 049/057.
- [gen 6] Per-tab `React.lazy` code-splitting — deferred; charts/maps were
  already lazy at the component boundary.
- [gen 6] Borough roundel palette changes (Brooklyn's brown reads muddy on
  white) — operator taste call, recorded, not planned.
- [gen 6] Trend chart with intervention event markers — attractive but
  needed a design pass; later built as plans 082/105.
- [gen 4] "Nav should be Routes/Map/Findings/Briefs per system.jsx" —
  by-design divergence: findings/briefs were hard-deleted in gen-3 (017).
- [gen 4] "SBS badge should be two pills per system.jsx" — by-design:
  `RouteBadge.tsx` documents the merged MTA-style roundel deliberately.
- [gen 4] "Route title 24px vs design 21px" (+ two px-nudges) —
  mis-attributed: cited `RouteIdentity.tsx` was dead code (deleted by 035).
- [gen 4] "Route detail is a tabbed workbench; flatten the tabs" — premise
  wrong: already a single scroll with an anchor nav.
- [gen 4] "KPI strip must be four oversized stats" — the two July design
  references disagreed (4 vs 5); plans kept 5.
- [gen 4] "Add reviewer card (avatar, quote, audit-trail ID) to
  How-we-know" — rejected: no real reviewers exist; banned by doctrine.
- [gen 4] "About this corridor fact sheet" — data-blocked: route length
  was fabricated then (nulled by 032), peak frequency wasn't served.
- [gen 4] Grid-first section leads / treatments timeline-first / hour-strip
  unification / chart annotation restraint — real, deferred post-034.
- [gen 4] Monolith decomposition (`home.tsx` 800 LOC,
  `TreatmentsHistorySection.tsx` 558, `DataNotesSection.tsx` 525) — real
  tech debt, deferred.
- [gen 4] Format-utility consolidation, SlowSegments `useMemo`,
  `React.memo` on chart layers — not worth doing (micro-wins).
- [gen 4] Direction options recorded but not planned: reviving `/search`
  results, an analyst triage home, or `/interventions` treatment filters —
  all cut in gen-3, reviving any is an explicit product decision.
- [gen 1-2] "Comp F verdict hero" as the Overview redesign — an auditor
  read chat30 as converging on a judged-verdict headline; the user's
  2026-06-12 verdict dislikes that. Only structural ideas (ranked findings,
  composed figure, map-last) survived, with real numbers.
- [gen 1-2] Search "slowest" sort / compare & search URL-default bugs —
  already fixed in uncommitted changes on `frontend-regression-fixes`.
- [gen 1-2] KPI strip judged-word labels — already fixed (Speed/Trend/
  Excess wait/Riders/Bus lane).
- [gen 1-2] Hour×day-of-week matrix — no served payload carried DOW grain.
- [gen 1-2] Brief history real diff engine (feature since deleted) —
  required a versioned-draft API; plan 005 made the page honest instead.
- [gen 1-2] Search facet count duplication — real but low impact then.
- [gen 1-2] Weather-reliability surface — blocked on causal-method review.

## Schema/Effect

- [gen 5] Migrate `packages/db` to `@effect/sql`/`effect/sql-drizzle` —
  rejected: no drizzle bridge exists on the v4 line (verified against
  vendored effect-smol + installed `drizzle-orm@1.0.0-rc.3`); a raw rewrite
  loses drizzle-kit codegen and puts Effect runtime in the Worker hot path.
  Plan 041 took derived-types instead; revisit only if Effect ships a v4
  drizzle integration AND worker handlers go Effect-native.
- [gen 5] The gen-2 rejection "Effect Schema replacing zod is LOC-neutral
  churn; zod v4 stays" is SUPERSEDED by 2026-07-04 operator direction and
  changed facts (2,462 LOC of schema dead weight; zero hard-to-migrate zod
  APIs in use); recorded in ADR-0020.
- [gen 5] Effect Schema parsing in the BROWSER as the zod replacement —
  rejected; plan 042 removed client-side runtime parsing entirely (types
  only), keeping "Effect stays out of the browser" true by construction.
- [gen 8] Effect 4 beta pin, drizzle-kit RC, TS caret width — decided
  toolchain posture (ADR-0019/0020, dev-only tools); revisit at Effect 4
  stable.
- [gen 7] Migrate the 99 command descriptors to raw `effect/unstable/cli`
  `Command.make` per file — rejected: plan 040 kept the thin `defineCommand`
  descriptor + glob discovery + completeness test; 066 migrated only the
  schema dialect.
- [gen 7] Delete `schema-routes.ts`/OpenAPI serving (no product consumer) —
  kept: portfolio-visible API surface, and after plan 067 costs one native
  `toJsonSchemaDocument` call.
- [gen 7] `.passthrough()` → strict on RAW upstream row schemas —
  deliberate tolerance of Socrata column additions; only normalized
  outputs tighten.
- [gen 7] Typed-error (`Schema.TaggedErrorClass`) sweep of the 32
  non-Effect pipeline commands — deferred per ADR-0019's "as commands are
  touched" rule; blanket migration is churn without a failing behavior.
- [gen 7] `loadStudioProjection`'s `Response | T` union → tagged result —
  real weak invariant, deferred to one dedicated PR after 063/066 settled
  the file.
- [effect-study] Effect Schema replacing zod in `packages/domain`/
  `packages/sources` (original 2026-06-13 verdict, later superseded above)
  — the "domain is ~70% LOC" premise was false: zod was ~7% of the
  package; migration would have been LOC-neutral churn across ~65 files.
- [effect-study] `@effect/sql` (original verdict) — rejected: `packages/db`
  already provided typed schemas, batch inserts, transactions; a wrapper
  adds a layer, removes nothing.
- [effect-study] Effect in the browser bundle — hard boundary: the
  initial-JS budget had 59 bytes of headroom at the time; any Effect
  runtime in the client fails the build (ADR-0019).
- [effect-study] Rewriting the `@liche/core` command framework on Effect —
  rejected: ~300 command files of churn for no orchestration gain; Effect
  entered the pipeline behind Promise-shaped `lib/` seams (superseded by
  plan 015).
- [effect-study] Publishing `tools/pipeline-v2` or mirroring `@bp/sources`
  1:1 as the public CLI/package — rejected; nyc-transit-kit was designed
  independently around official API/provider families, this repo is a
  consumer, not the blueprint.

## Pipeline/data

- [gen 18] A separate plan to publish the Plan 091 artifacts — rejected: a
  data op against an already-existing exporter, recorded as a standing
  prerequisite instead.
- [gen 17] Origin main already had `plans/096-member-grain-study-
  consumer.md` when a proposed production "Plan 096" collided — replaced
  by Plan 097.
- [gen 17] Migration history starts at 0000 incl. schema/data/index
  changes; table existence can't authorize invented `d1_migrations` rows —
  CI's direct 0032/0034 recovery had skipped 0033.
- [gen 17] Production D1 holds non-reconstructible live writes (auth/
  session/user state) — a seeded shadow D1 is unsafe; selective
  serving-data rollback required instead.
- [gen 17] Studio derives "latest" from `route_batch_status`, maps elect
  their own latest row, most R2 reads use mutable stable keys — atomicity
  needs candidate-scoped D1 rows + one active pointer/artifact map.
- [gen 17] Post-audit amendments required a durable pre-mutation baseline,
  fail-closed decode, separate cost evidence, and a fenced verified-object
  catalog (never treat receipts/ETags/filenames/size as content proof).
- [gen 17] A fresh release lacked a canonical exact-route registry row,
  would have regressed schema-v3/detail/history despite Plan 095's repair.
- [gen 17] The pre-099 freshness ledger permitted 3 periods of lag, let
  critical unknowns pass strict mode, mapped sources to one global range —
  plan 099 replaces the semantics, not just the label.
- [gen 17] R2 hash skipping is unsafe when ETag is empty; builders mixed
  wall-clock `generatedAt` with reusable payloads or reused decodable
  files without a fingerprint — plan 101 fixes both.
- [gen 12] Duplicate exact-route/name plan — rejected: landed MTA Wiki
  Plan 035 owns exact route identity/labels; downstream plans consume it.
- [gen 12] Another intervention database or page — rejected: reuse the
  materializer, reviewed corpus, evidence bundles, R2 serving, History,
  and `/interventions`.
- [gen 12] Use source prose/claims to infer treatments, metrics, or chart
  markers — rejected: typed relationships establish what/when/where;
  vetted relevance specs select data before values are inspected.
- [gen 12] One generic speed/ridership profile per intervention — rejected
  as semantically weak/cherry-picking-prone; unsupported kinds stay
  explicit, requiring an unlock.
- [gen 12] Treat rc23 candidates or `awaiting_approval` rows as public
  facts because they're structured — rejected: candidate review isn't
  publication; the candidate-set artifact is never a serving input.
- [gen 11] D1/local tables keyed `(routeId, month)` — GRAIN: correct
  partitioning, no migration; only response metadata changed.
- [gen 11] `lib/socrata-monthly-ingest.ts` name + cadence — GRAIN:
  upstream publishes month-partitioned data; the name is accurate.
- [gen 11] "Monthly ridership" chart title / "Monthly riders (K)" legend /
  "official monthly speed evidence" caveat / "monthly speeds" copy —
  rejected as findings: they name dataset grain, not a baseline anchor.
- [gen 11] `RouteDetailHeader` month label under the speed metric — GRAIN
  (a `dataAsOf` label on a data point); kept.
- [gen 11] Study engine (074) / studies surface (075) month usage —
  verified grain (event-anchored multi-year windows); no amendment.
- [gen 11] Month-partitioned artifact/export layouts — kept as
  partitions; identity moved into manifest fields (`publishedAt`,
  `coverage`). A releaseId-keyed layout migration was rejected as churn.
- [gen 11] `cloudflare-costs.ts` "monthly" mentions — billing-cycle
  arithmetic, unrelated to release identity.
- [gen 11] Renaming `source-refresh` job ids (`route_speed_monthly_
  watcher`) — an artifact contract; only strings de-monthed, ids stayed.
- [gen 11] Banning "month" outright in the plan-088 harness gate —
  rejected: the gate bans IDENTITY tokens/pinned literals; month-grain
  vocabulary (`dataAsOf`, `startMonth`/`endMonth`, `--month`) stays legal.
- [gen 11] Docs-audit subagent misclassified plans 079-081 as "completed;
  archive" (they were TODO) and `data/artifacts/**` docs as in-scope —
  corrected by the lead.
- [gen 10] Readmitting rejected study candidates or softening gates/spine
  thresholds for the original "≥10 studies" floor — rejected; the operator
  accepted the complete 7/7 approved-pair run, closed plan 074.
- [gen 8] `weightedAverage` NaN hardening + `quantile` negative-index
  guard (route-grain lib) — inputs are internally controlled; folded as
  assertions into plan 074's engine instead.
- [gen 8] Analytics test-ratio (28.4K src / 7K test LOC) — most untested
  mass was the dead subgraph plan 061 deleted.
- [gen 8] Release/export command boilerplate extraction (~8-10 files) —
  real but deferred: 066's schema sweep touches the same files.
- [gen 7] Unify `packages/db` local/d1 row mappers — real but high-risk
  for ~200 LOC; different databases, different casings; not planned.
- [gen 7] Consolidate/structuralize the 8 check scripts — 5 are legitimate
  runtime scanners, 3 file-inventory ones are ~175 LOC total; marginal.
- [gen 7] Deleting `domain/findings` wholesale after plan 061 — WRONG:
  analytics `core/{detector,evidence,coverage}.ts` and
  `features/route-month.ts` were live importers; 067 deleted only
  zero-importer exports.
- [gen 7] `route-equity-contexts.ts` unchecked `rows[0]` + enum cast —
  real, verified; folded into plan 063 Step 1.
- [gen 7] Unmanaged `Effect.runPromise` in `effect/concurrency.ts` — real;
  folded into plan 064 Step 4.
- [gen 5] Move/rename `tools/pipeline-v2` to `apps/` — rejected: the
  boundary harness pins script strings, ~90 files would churn for no
  functional gain; vocabulary agreed, path stayed.
- [gen 5] Migrate `packages/sources` adapters into nyc-transit-kit —
  rejected: adoption was already correct (kit does transport/decode, 18
  adapters are bus-specific normalization); only 3 capabilities moved
  (plan 045).
- [gen 5] Delete `_release-segments.ts` / `lib/llm.ts` / `pi-ai` with the
  agent tooling — WRONG: `studio release` imports `_release-segments.ts`,
  its AI notes render publicly (`SlowSegments.tsx` → `segment.aiNote`);
  plan 037 kept that path, deleted only `pi-agent-core`/codemode/sandbox.
- [gen 5] Delete `lib/route-briefs/` — WRONG: imported by
  `effect/route-brief-model.ts`, `commands/studio/release.ts`,
  `commands/studio/_release-types.ts`, `commands/audit/pipeline-v1.ts`.
- [gen 5] Delete `geoclient-current-v2.yaml` — referenced as the spec
  pointer by the geoclient client; stayed.
- [gen 5] Remove `es-toolkit` — live via `apps/web/vite.config.ts` aliases
  onto a vendored compat shim (recharts shimming).
- [gen 5] Consolidate `src/checks/*` into CLI subcommands — deferred DX
  polish; root scripts pin the file paths, the boundary test asserts them.
- [gen 5] Preserve the CLI's silent glob command discovery — rejected: the
  import-failure skip was a defect (a broken command file vanished), not a
  feature; plan 040 kept discovery but made failures loud, backed by an
  exact completeness test.
- [gen 5] Delete `check-pioneer-provider` — independent of the agent
  harness (fetch-based smoke, no `pi-*` imports); stayed.
- [gen 5] `data/raw/socrata-partitioned` (142 GB) immediate deletion — not
  gated yet: layout was month-opaque until plan 038 classified it.
- [gen 5] `studioBrief` D1 tables "actively used" — the query module was
  exported only by the `@bp/db` barrel with zero consumers; dead-in-
  waiting, reconciled against drop migration 0029 by plan 041.
- [gen 5] "`data/raw/route-slices` (7.4 GB) is orphaned — delete now" —
  WRONG: `commands/studio/release.ts` still defaulted its raw-slice root
  there; plan 038's gate had to verdict it, not deletable on sight.
- [gen 5] "Only two lines block raw deletion" — undercounted:
  `route-treatment-summary.ts` also read `data/raw/network/` snapshots,
  and `release.ts` referenced the raw route-slice root; full list in 038.
- [gen 5] "All of `domain/documents/` (4,531 LOC) is orphaned" —
  over-broad: only four subtrees (2,462 LOC) had zero external importers;
  `candidates`, `intervention-records`, `operational-date`, and the
  documents root were live. Plan 043 pruned exactly the dead four.
- [gen 5] "Delete `schema-registry/` immediately (0 importers)" — the
  registry MECHANISM was live domain-internally, feeding
  `@bp/domain/json-schema` → studio-api OpenAPI; only a 5-line re-export
  stub dir was dead (plan 043 deleted it).
- [gen 5] Re-point `_release-geometry.ts` from raw network snapshots to
  SQLite — real, desirable, but high-risk (must prove artifact parity);
  left as a named operator follow-up, not folded into plan 039.
- [gen 5] `--prune` for stranded `socrata-partitioned` chunks (skip-if-
  exists strands out-of-range chunks on narrower re-runs) — real, small,
  deferred.
- [gen 4] Network-map `scheduledMph` fabricated in the pipeline (×1.18
  factor) — REAL, deferred to a pipeline+republish follow-up so it didn't
  block the serving-layer fix.
- [gen 1-2] Stale v1 command references in `knowledge/` wiki pages — real
  (caveat-bannered); wiki maintenance, deliberately left unplanned.

## False positives

- [gen 1-2, gen 8] `.env` with live keys / "credentials committed in .env"
  — FALSE, confirmed by two separate audits: gitignored, absent from
  `git ls-files`, zero git history; only placeholder `.env.example` tracked.
- [gen 1-2] "`TrendOverlay.chart.tsx` doesn't exist / lazy-chart pattern is
  invented" — FALSE: nine `*.chart.tsx` files existed, the convention was
  established.
- [gen 1-2] "1 failing detector-study test" — UNCONFIRMED: passed 5/5 in
  isolation; if it fails in full-suite runs it's order-dependent/flaky.
- [gen 5] "112 commands" (subagent census) — corrected to 99 live command
  descriptors after plans 038/039; other `commands/` files are helpers.
- [gen 8] "113 CLI commands have zero fixture tests" — false; 60
  fixture-backed command tests existed under `tools/pipeline-v2/test/
  commands/`.
- [gen 7] "dev/fixtures ship in the prod bundle" (subagent claim) —
  UNVERIFIED, not a finding: no route imports them, Vite tree-shakes.
- [effect-study] Socrata app-token leak in pipeline error logs — false
  positive: the token is an `X-App-Token` header, never in URLs.
