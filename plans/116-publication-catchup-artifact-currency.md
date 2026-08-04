# Plan 116: Publish the June/July catch-up and the missing serving artifacts (OPERATOR-EXECUTED runbook)

> **This is a data/publication operation, not a code plan.** It is executed by
> the operator (with the publishing agent that prepared the candidate), under
> Plan 098's activation discipline. A code executor must NOT run this plan.
> Cloudflare and GitHub mutations require the operator's own credentials and
> explicit intent at each gate.

## Status

- **Priority**: P0 (it is the single highest-value data operation available —
  it clears most of the site's honest-empty states)
- **Effort**: S-M operator time (the candidate is already built and verified)
- **Risk**: MED (production activation; mitigated by 098's CAS pointer +
  rollback drill, already proven in production on 2026-08-02)
- **Depends on**: Plan 098 (DONE, active); Plan 115 strongly recommended first
  (see "Interaction with Plan 115")
- **Category**: bug (data currency) / ops
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

Production serves release `pub_20260801T232501631Z` with coverage
`2023-04..2026-05`. Live probing on 2026-08-02 classified the user-visible
empty states; most are artifacts that have NEVER been published in any
release, not code bugs:

| Empty state (surface) | Artifact key probed | Status in BOTH releases |
|---|---|---|
| "Treatment inventory unavailable" (route Overview) | `studio/v2/routes/<slug>/intervention-inventory.json` | 404 |
| /interventions Kind filter data, route inventory index | `studio/v2/interventions/route-inventory-index.json` | 404 |
| Facet index | `studio/v2/interventions/facet-index.json` | 404 |
| Evidence index | `studio/v2/interventions/evidence-index.json` | 404 |
| Plan 090 observation bundles (Overview markers) | `studio/v2/routes/<slug>/intervention-observations.json` | 404 |
| Per-route studies | `studio/v2/routes/<slug>/studies.json` | 404 (while `studio/v2/studies/index.json` is 200) |
| "No month history for this segment." (Segments tab) | `/api/v1/studio/routes/<slug>/speed-history` | 200 but `spineReadiness: null` — the served artifacts predate the current producer, which always writes a non-null value (`packages/analytics/src/feature-history/route-speed-history.ts:749`); the routes index even says `capability.surfaces.speedHistory = {"state":"building","reason":"speed months present, history artifact not built"}` while 36 months of cells are served and then discarded by the client (`apps/web/src/components/route/segment-history-data.ts:176-178`) |

Separately, a fully verified June/July catch-up candidate exists (prepared
2026-08-02 by the publishing agent): speeds/reviewed serving through June
2026, hourly ridership + ACE violations through July, 4,247 artifacts,
1,848 required uploads, D1 seed proven twice, full workerd parity. It is
blocked ONLY on operator GitHub auth + Cloudflare token.

## Critical caveat before executing the prepared sequence

The candidate was cut from source commit `1266baf5…`, which is **NOT an
ancestor of origin/main** (verified 2026-08-02) — its branch
`codex/gen17-june-catchup` was never pushed (GitHub auth was invalid), and
main has since moved ~120 commits, including changes to Plan 098's own
activation machinery (PRs #140-#148: pointed-catalog reader, manifest
registration binding, content-addressed receipts, rollback-absence proof).

**Do not run the saved production sequence as-is.** First have the publishing
agent rebase/rebuild against current `origin/main` and re-verify. Content
hashes make the rebuild cheap (verified-skip re-uses identical bytes).

## Interaction with Plan 115

The activation re-points byte-identical artifacts whose bodies embed an older
release stamp. Until Plan 115 lands and deploys, any such re-pointing
re-triggers the site-wide "0/348 verified routes" failure. Sequence:
**land + deploy Plan 115 first**, then activate. If activation must go first,
expect map facts to stay broken until 115 deploys — do not diagnose that as a
data problem.

## Operator gates (each requires explicit operator action)

1. **G1 — Merge the candidate branch.** `gh auth login`, push
   `codex/gen17-june-catchup` (rebased on current main), PR, checks green,
   merge. Verify `git merge-base --is-ancestor <candidate-source> origin/main`
   → exit 0 at execution time.
2. **G2 — Candidate content checks (before any Cloudflare mutation).** On the
   rebuilt candidate root, verify:
   - `jq '.spineReadiness' <candidate>/objects/**/speed-history artifacts` →
     non-null for every route (clears the "No month history" class). If the
     builder still emits null, STOP — the speed-history rebuild did not run;
     publishing it again changes nothing.
   - The candidate manifest lists logical keys for
     `studio/v2/interventions/route-inventory-index.json`,
     `facet-index.json`, per-route `intervention-inventory.json`, and the
     Plan 090 observation bundles. (The 2026-08-02 packet said the 090/091
     indexes are included with their honest May coverage — verify, don't
     assume.) Any key absent → that empty state SURVIVES this activation;
     record which, so nobody re-diagnoses it as a bug.
   - Per-route `studies.json`: only if the study exporter already emits them;
     absence is acceptable (the studies index serves) — record it.
   - **Trend inputs reached the index projection** (added 2026-08-02): the
     candidate's schema-3 routes index must carry non-null `spark` and
     `movement6mPct` for sampled routes (bx20, b1, m79-sbs). The ACTIVE
     release serves null for 375/375 while route-detail carries real values —
     the index was built without the speed-history artifact ("speed months
     present, history artifact not built"). If the REBUILT candidate still
     has nulls, STOP: that is a projection-builder defect, not a data gap,
     and publishing again changes nothing on /routes.
3. **G3 — Activation.** Run the (rebased) 098 activation: registration →
   R2 publish with verified skip → candidate-scoped D1 staging → CAS pointer
   activation → completion receipt. The packet's expected mutation shape
   (temporary operator Worker, 1,848 PUTs, CAS generation bump, receipt,
   operator-Worker deletion) still applies after rebase.
4. **G4 — Post-activation smoke (10 GETs, ~2 minutes).** Against
   `https://bus-priority-impact-studio.c20carroll.workers.dev`:
   - `/api/v1/map/manifest` → 200, new releaseId, coverage end advanced
     (speeds `2026-06`; per-dataset coverage honest, no global intersection)
   - `/api/v1/artifacts/studio/v1/map-route-facts.json` → 200
   - `/api/v1/studio/routes/bx20/speed-history` → 200, `spineReadiness` non-null
   - `/api/v1/artifacts/studio/v2/routes/bx20/intervention-inventory.json` → 200
   - `/api/v1/artifacts/studio/v2/interventions/route-inventory-index.json` → 200
   - `/api/v1/artifacts/studio/v2/interventions/public-episodes-v2.json` → 200
   - `/api/v1/studio/routes?schema=3` → 200, new releaseId, AND sampled
     routes carry non-null `spark`/`movement6mPct` (the /routes "12-mo
     trend" column stops rendering blank); route capability
     `speedHistory`/`trend` no longer report `building`
   - Load `/map` in a browser: facts resolve (not 0/N verified), no mismatch
     paragraph; `/routes/bx20?tab=segments`: rider-hrs number present,
     segment sparkline renders.
   Any failure → 098 one-pointer rollback, then investigate.

## STOP conditions

- Ancestry check in G1 fails at execution time.
- Any G2 content check fails (do not activate a candidate that doesn't fix
  what it is being activated to fix).
- Any 098 batch proof fails — the machinery's own STOP applies.
- Post-activation smoke fails and rollback also fails → follow 098's
  documented recovery, do not improvise.

## Done criteria

- [ ] Production releaseId advanced; coverage reflects June/July per dataset
- [ ] All G4 probes pass
- [ ] The empty-state table above re-probed: each row either 200/resolved or
      explicitly recorded as "still absent, owned by <plan>"
- [ ] `plans/README.md` gen-21 row updated with the new releaseId
- [ ] `knowledge/log.md` publication entry appended (operator habit)

## Maintenance notes

- The "absent artifact" list doubles as the serving-coverage checklist for
  the NEXT candidate build; keep it with the publication receipts.
- Plan 100's advisory freshness alarm (built locally on
  `codex/100-publication-control-plane` at `53a0e354`, unmerged) would have
  caught the June/July lag automatically — landing it is the follow-up that
  makes this class of staleness visible without an audit.
- The 2026-08-02 kernel descope of Plans 098-101 (binding operator decisions)
  exists only in the stale local tree's plan files — land or re-apply those
  plan-file amendments so the plan record matches the operative decisions.
