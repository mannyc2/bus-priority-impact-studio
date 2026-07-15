# Tracker branch and worktree reconciliation

Date: 2026-07-15

This report records the content-level reconciliation performed before
publishing the rc19 Tracker integration. It distinguishes current cumulative
work from old, superseded branch histories. No branch was deleted, no release
was promoted, and no production data was written.

## Remote baseline

- Fetched `origin` with pruning before reconciliation.
- `origin/main` is `2834fac2`, the merge of PR 59 (“Ship Studio data, map,
  and study upgrades”).
- `origin/advisor/075-studies-integration` is `829700a5`.
- Local `bcbe4c95` is the one post-merge importer commit (“Import
  bundle-aware MTA Wiki occurrences”). The consolidation branch starts from
  that commit, so its pull-request diff retains the importer without replaying
  PR 59.

## Carried into the consolidation branch

| Source | Disposition | Reason |
|---|---|---|
| Dirty July integration workspace | Preserved as two commits | The reviewed 310-row intervention corpus, plans 068–088, approved comps, corpus fail-closed checks, and map/interventions UI changes form coherent, tested layers. |
| `codex/rc19-exact-dedup-fix` (`6dd32198`) | Cherry-picked | This is the narrow consumer fix required by rc19: exact cross-source event identities deduplicate while retaining both provenances; ambiguous occurrence matches fail closed. |
| `codex/mta-wiki-rc19-audit` (`93e87bce`, `12c9a53b`) | Cherry-picked and rebaselined | The historical 501-row discovery set remains audit evidence; the corrected, non-authorizing set has 489 rows. Append-only log conflicts were resolved by retaining the newer production-line log and appending the audit entry. |
| Plans 074, 075, and 083 | Amended in place | The immutable 5-of-403 receipt remains historical. The current rc19 set has 489 unapproved rows; Plan 083 now measures the 39/37 historical cohort, 40/38 current ACE cohort, 75/74 rc19-addition cohort, and all 267 routes separately. |

## Divergent branches not merged

| Branch/tip | Disposition | Evidence |
|---|---|---|
| `feat/a1-segment-speed-cell-grain` / local `main` (`54bd801c`) | Do not merge its 117-commit old lineage | The current production line already contains the unfiltered segment-speed normalizer, `local_route_segment_speed_cell` schema/repository/migrations, cell-grain ingest, route-month golden diff, route-trends projection, tests, and documentation. Patch hashes differ because the work was integrated through a different history; the required behavior and files are present. |
| `codex/track-b-feature-grain-coverage-command` (`194a3336`) | Do not port automatically | Its only unique command is built on `@bp/applied-research`, which was deliberately removed by `8ea377db` when the research pipeline collapsed into analytics and later detector/Tier-2 doctrine was deleted. Reintroducing the commit would restore a retired package boundary. Any future coverage audit needs a fresh specification against the current analytics registry. |
| `codex/024-current-stop-status` (`616044b8`) | Superseded | It records an intermediate Plan 024 stop. Remote `main` contains the completed Tier-2 deletion and marks Plan 024 DONE. |
| `codex/024-delete-tier2-current` (`cc450edc`) | Superseded by current deletion history | Its large deletion patch belongs to an older fork. The final deletion and later native-schema/pipeline cleanup are already ancestors of remote `main`; replaying it would overwrite evolved files. |
| `codex/028-mta-wiki-done` (`dea51c59`) | Keep as historical branch only | It marks the older `v1-rc5` work order complete. Plan 028 correctly remains a historical rc5 milestone; rc19 is explicitly a pinned, unpromoted candidate and is covered by the new audit instead. |
| `worktree-agent-a24343b8496b09d2a` (`b9253df6`) | Retired snapshot | This is a 14k-line snapshot of the old Tier-2 OCR pipeline under pipeline v1. That machinery was intentionally deleted and must not be resurrected. |
| `codex/reviewable-current-worktree-slices` (`f7dd59af`) | Superseded design brief | Its unique tip is an early route-detail/map design prompt. The shipped gen-6 UI, Plans 077–081, and operator-approved HTML comps are newer design authority. |
| Other local topic branches | Already represented | The branch inventory shows the remaining Plan 019–079, gen-6, detector, route-dossier, and regression-fix tips are ancestors of `origin/main` and need no replay. |

## Worktree disposition

- The active source workspace now uses `codex/reconcile-tracker-lines`.
- The Codex audit worktree and clean rc19-fix worktree were read-only sources
  for the cherry-picks. Their commits are represented on the consolidation
  branch.
- Older clean worktrees and stale registrations were not removed because
  cleanup is independent of code reconciliation and could disrupt another
  task. They carry no additional production changes identified by this audit.

## Reproduction evidence

- rc19 manifest SHA-256:
  `c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f`
- Frozen logical merge inputs:
  `17530e0bc5a857463249d32a882ae7027a77ea44041babe00c5d761662363104`
- Occurrence import:
  `47371908c45642aeec58bec3d7f450290e761bafe572afedf993fc11d065022e`
- Candidate set (two fresh builds plus committed artifact):
  `42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`
- Rebaselined deterministic audit JSON (two fresh runs):
  `075ac2bae5d62847e091f2dca64b0f03b2341f2333ccec88ed7025916dd329a6`

The rc19 review remains non-authorizing: 16 recommendations to approve and
473 recommendations to reject, with no approval receipt and no permission to
run or publish a study.
