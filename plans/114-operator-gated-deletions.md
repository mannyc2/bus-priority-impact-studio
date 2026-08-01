# Plan 114: Operator-gated deletions — approvals worksheets, the spine prototype, the v1 endpoints

> **Executor instructions**: Every step in this plan is gated on an explicit
> operator decision that must be RECORDED (quoted) in the PR description
> before the step's deletion runs. No token, no step — skip and mark the row
> accordingly. These are not riskier deletions technically; they are deletions
> whose justification the operator owns: audit-trail doctrine, a recorded
> spike decision, and a public API surface.
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- data/study-event-approvals packages/analytics/src/feature-history packages/studio-api/src/public-api.ts packages/domain/src/routes tools/pipeline-v2/src/lib/study-engine`

## Status

- **Priority**: P3
- **Effort**: S-M (per step)
- **Risk**: MED (each step is LOW technically; the gate is the point)
- **Depends on**: 108, 109, 112 landed (for clean grep baselines)
- **Category**: tech-debt / docs
- **Planned at**: commit `292d2bd0`, 2026-08-01
- **Operator tokens (recorded 2026-08-01, via interactive question round)**:
  Step A: **"Delete them"** — approved. Step B: **"Delete the code"** —
  approved. Step C: **"Retire them"** — approved. Step D: default accepted
  (leave `knowledge/log.md` as-is). These recorded answers ARE the gate
  tokens this plan requires; quote this block in the PR description.

## Why this matters

Three deletion opportunities from the 2026-08-01 cleanup audit are real and
verified but sit behind decisions only the operator can make. Bundling them
into one gated plan keeps them from being either silently dropped (and
re-audited later) or silently executed (and regretted). A fourth item — the
project log — is recorded here as a decision NOT to delete.

## Step A: Superseded review worksheets in the approvals ledger (150,054 lines)

**The facts.** `data/study-event-approvals/reviews/` holds six
`*.review-worksheet.json` files (38,691 + 32,264 + 28,437 + 27,669 + 14,101 +
8,892 lines) with zero code references. The study engine consumes the
SIBLINGS, not the worksheets: `receipts/` (operator approval artifacts, bound
via the `--approval` CLI flag of `study merge-events` —
`tools/pipeline-v2/src/commands/study/merge-events.ts:269-271,314`) and
`scope-bindings/` ("used by `study run`" per the directory README). The README
itself frames the worksheets as "the immutable non-authorizing starting
point" (`data/study-event-approvals/README.md:55-56`) — the receipt carries
the authority; the worksheet is pre-decision scaffolding.

**The decision the operator owns.** The directory is doctrinally a "tracked,
append-only handoff". Deleting worksheets keeps every authorizing receipt but
breaks worksheet↔receipt pairing in the working tree (pairs remain in git
history). If the operator considers pairing part of audit defensibility, the
answer is no; if git history suffices, the answer is yes.

**If approved**: `git rm data/study-event-approvals/reviews/*.review-worksheet.json`
(exactly six files — `candidate-set-49af8c8721457fa7532a7345.review-report.md`
in the same directory STAYS), and amend the worksheet paragraph of
`data/study-event-approvals/README.md` in the same commit so doctrine and tree
agree. **Verify**: `bun run test:unit` → exit 0; `git ls-files data/study-event-approvals/reviews` → 1 file (the report md); receipts/ and scope-bindings/ untouched.

## Step B: The plan-083 spine-pattern-grouping prototype (670 LOC)

**The facts.** `packages/analytics/src/feature-history/spine-pattern-grouping-prototype.ts`
(356) + its test (314) are provably unreferenced (zero references outside the
`feature-history/index.ts` barrel lines and the test). But the spike's
decision doc says, verbatim: "Recommendation: retain only as a prototype"
(`docs/research/spine-pattern-grouping-decision.md:28`) and "Recommendation:
reject productionization" (`:34`). Both spike deliverables
(`spine-pattern-grouping-{findings,decision}.md`) are keep-docs holding the
durable measurements.

**The decision the operator owns.** Does "retain only as a prototype" mean
keep the 670 LOC in-tree, or does it mean "its status stays prototype — never
productionize"? The audit's reading (contrasted with the doc's warning that
productionizing "would add an engine/version/rebuild obligation") is the
latter: delete the code, keep the two research docs as the record. But the
sentence is genuinely ambiguous and the spike was operator-adjudicated.

**If approved**: delete the two files, prune the
`feature-history/index.ts:119-124` barrel entries
(`prototypeExactAliasCanonicalization`, `prototypeRecurringPatternProfiles`).
**Verify**: `bun --filter @bp/analytics test && bun run check:types` → exit 0;
`git ls-files docs/research | grep spine` → both research docs still tracked.

## Step C: The four v1 public endpoints with no first-party caller (~590-910 LOC)

**The facts.** `packages/studio-api/src/public-api.ts` dispatches seven v1
routes. Three are live (`/api/v1/status` — used by the plan-097 HTTP check;
`/api/v1/artifacts/*` — the main serving path; `/api/v1/map/manifest`). Four
have no caller anywhere in the repo: `/api/v1/routes`
(`buildRouteListResponse`, ~line 412), `/api/v1/routes/:id/profile` (~474),
`/api/v1/hotspots` (~830), `/api/routes/:id/scorecard` (~42). Their domain
response schemas (`RouteCard`, `RouteListResponse`, `RouteProfileResponse`,
`HotspotCard`, `HotspotListResponse`, `RouteCompareResponse` in
`packages/domain/src/routes/index.ts`) are orphaned with them, as may be the
D1 queries `route-scorecard.ts` and `corridor-summaries.ts` if nothing else
reads them after removal. `contracts/openapi.ts` currently advertises the
four routes publicly, and a generation-7 rejection deliberately KEPT the
OpenAPI surface as "portfolio-visible" — retiring endpoints changes what that
document shows.

**The decision the operator owns.** "No first-party caller" is provable;
"no external consumer at all" is not — these are public URLs on a portfolio
site (they appear in older README/llms.txt revisions). Retiring them is a
product decision about the public API's shape.

**If approved**: remove the four dispatch branches and builders, the matching
route specs in `contracts/registry.ts` (~lines 60, 71, 104), the six domain
schemas, any data-products registry `downstreamConsumers` strings naming the
removed paths, and then — only if a caller-free gate confirms — the D1 query
modules. Update `api-facade.test.ts` cases covering the removed routes.
**Verify**: `bun --filter @bp/studio-api test && bun run test:worker && bun run check:types` → exit 0; `curl`-style smoke of the three surviving routes in local dev; the OpenAPI document no longer lists the four paths.

## Step D (decision record, no action): knowledge/log.md stays

9,361 lines, append-only by doctrine, the only narrative record of decisions
that never became ADRs — and nothing programmatic reads past its existence
check. The audit recommends leaving it whole (an archive-by-month split is
available if the operator ever wants it, keeping `log.md` as an index; its
internal ordering defect — entries are not chronological despite the header —
would be fixed by that split). Record the operator's choice in the PR; default
is leave-as-is.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test:unit` | exit 0 |
| Studio-api tests | `bun --filter @bp/studio-api test` | exit 0 |
| Worker tests | `bun run test:worker` | exit 0 |
| Analytics tests | `bun --filter @bp/analytics test` | exit 0 |
| Types / full | `bun run check:types && bun run check` | exit 0 |

## Scope

**In scope**: exactly the files each approved step names; `knowledge/log.md`
(append one entry covering the decisions taken); `plans/README.md` (status row).

**Out of scope**: everything else — in particular `receipts/` and
`scope-bindings/` under the approvals ledger, the two spine research docs,
the three live v1 endpoints, and `contracts/openapi.ts` beyond the mechanical
consequence of step C.

## Git workflow

- Branch: `advisor/114-operator-gated` off landed main; one commit per
  approved step, each quoting its operator token in the commit body.
- Do NOT push or open a PR unless the operator instructed it.

## Done criteria

- [ ] Each step either executed WITH a quoted operator token or marked SKIPPED (operator declined / not asked) in the README row
- [ ] All verification commands for executed steps exit 0
- [ ] No file outside the executed steps' scopes modified
- [ ] `plans/README.md` row updated; `knowledge/log.md` entry appended

## STOP conditions

- Any step's gate token is missing, paraphrased-beyond-recognition, or
  ambiguous — skip the step; never infer approval.
- Step C's caller-free gate for the D1 query modules shows a surviving
  reader — delete the endpoints only, keep the queries, and say so.
- Any verification fails twice.

## Maintenance notes

- If step A is declined, add a line to `data/study-event-approvals/README.md`
  recording that worksheets are intentionally retained for pairing — so the
  next audit doesn't re-raise it.
- If step C is declined, consider adding the four endpoints to `llms.txt` /
  README API docs instead — an advertised-but-undocumented public surface is
  the worst of both.
- Investigate-only findings recorded during the 2026-08-01 audit, for some
  future session (NOT planned): the four coexisting `StudyEvent*` schema
  generations (V2–V5) in `packages/domain/src/studio/study.ts` — collapsible
  only after a one-time re-cut of on-disk artifacts at V5 (risk HIGH,
  effort L); and the orphaned schema-table constants
  (`localLionSegmentGeom`, `localRouteShapeGeom`) whose removal is gated on
  local-migration policy.
