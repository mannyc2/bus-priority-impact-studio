---
title: Agent-First Contributor Leaderboard
type: engineering
status: draft
last_updated: 2026-05-24
owner: codex
source_count: 0
tags: [agents, contributors, leaderboard, issues, civic-evidence]
---

# Agent-First Contributor Leaderboard

## Purpose

Build a contributor leaderboard for people who find useful MTA bus reliability and data issues,
but make the submission path **agent-first**: a person should be able to point a Codex, Claude, or
similar coding agent at the Studio and get back a typed, reviewable issue artifact.

The leaderboard is not a complaint counter. It is a public projection of verified civic evidence:
contributors earn credit when their reports improve the Studio's route evidence, detector coverage,
source quality, or public reliability understanding.

## Product Thesis

The best version of this feature rewards contributors for finding facts the system can act on:

- a route or segment where observed reliability is worse than the published evidence suggests;
- a recurring source gap, stale source, bad join, missing stop, bad route geometry, or schedule
  mismatch;
- a high-impact corridor pattern that current detectors missed;
- a duplicate report that adds independent corroboration or narrows the affected time/window;
- a correction that changes a finding, caveat, route brief, or data-quality audit.

The worst version rewards volume. Avoid raw report-count gamification. Points should come from
confirmed usefulness, not from filing many low-confidence observations.

## Scope

### V1 Scope

- Bus-first issue intake for routes, stops, segments, corridors, and Studio findings.
- Agent-readable intake spec, JSON Schema, OpenAPI docs, and copy-paste task prompt.
- Typed issue draft contract with route/stop/window/problem/evidence/caveat fields.
- Server-side validation and duplicate fingerprinting.
- Human or trusted-reviewer confirmation before points are awarded.
- Public leaderboard snapshots by week, month, all time, route, and borough.
- Contributor profile pages with opt-in public display names.

### Out Of Scope

- Acting as an official MTA or emergency reporting channel.
- Open-ended chat submissions.
- Awarding points for unreviewed reports.
- Real-time incident reporting that requires immediate operational response.
- Exposing contributor email, exact private trip history, or private screenshots.
- Letting LLM prose create metric claims without deterministic evidence.

## Product Rule

Every contribution must become a Studio artifact, not a free-form message.

Allowed contribution artifacts:

- contributor issue report;
- evidence correction;
- duplicate/corroboration link;
- source-gap report;
- detector miss report;
- route/stop/segment metadata correction;
- reviewer note;
- promoted finding seed.

Disallowed as first-class artifacts:

- global "Ask AI" transcripts;
- vague complaints without route, window, and evidence;
- screenshots or comments that expose personal information;
- reports targeting individual transit workers;
- claims that cannot be tested against public evidence or contributor-observed facts.

## Agent-First Walkthrough

This is the canonical v1 dogfood flow. A contributor asks their agent:

> Investigate whether the M15 SBS has a recurring reliability or data-quality issue that the
> Studio should know about. Submit one issue only if it is specific, falsifiable, and evidence-backed.

The agent should be able to complete this without prior repo context:

1. `GET /.well-known/bp-agent.json`
   -> API base URL, auth scope names, docs links, schema versions, rate limits, and issue-intake
   instructions.
2. `GET /api/openapi.json`
   -> canonical API contracts, including issue schemas.
3. `GET /api/v1/studio/routes/m15-sbs`
   -> route identity, borough, current release labels, caveats.
4. `GET /api/v1/studio/routes/m15-sbs/segments?from=2026-03&to=2026-03&grain=month`
   -> segment time series and quality block.
5. `GET /api/v1/studio/findings?routeSlug=m15-sbs`
   -> existing findings, so the agent can avoid duplicates.
6. `POST /api/v1/contributor/issues/validate`
   body: a draft issue packet.
   -> deterministic validation, duplicate candidates, missing fields, and impact estimate.
7. `POST /api/v1/contributor/issues`
   body: the same packet plus `idempotencyKey`.
   -> stored draft or submitted issue.
8. `GET /api/v1/contributor/issues/{issueId}`
   -> status, review state, duplicate links, validation result, and scoring eligibility.

The internal team should run the same walkthrough with a local agent before shipping the feature.
If an external coding agent cannot discover the rules and submit one valid issue from the docs
alone, the feature is not agent-first yet.

## Agent Manifest

Add a small static/Worker-served manifest at `/.well-known/bp-agent.json`.

Suggested fields:

```json
{
  "name": "Bus Priority Impact Studio",
  "purpose": "Find and submit typed MTA bus reliability evidence issues.",
  "apiBaseUrl": "https://example.com",
  "openapiUrl": "https://example.com/api/openapi.json",
  "schemaVersion": "contributor-issue-v1",
  "auth": {
    "required": true,
    "scopes": ["read:studio", "write:contributor_issues"]
  },
  "entrypoints": {
    "routeLookup": "/api/v1/studio/routes/{routeSlug}",
    "findings": "/api/v1/studio/findings",
    "validateIssue": "/api/v1/contributor/issues/validate",
    "submitIssue": "/api/v1/contributor/issues"
  },
  "rules": [
    "Submit one specific issue per packet.",
    "Do not submit if the issue is already covered by an existing finding unless adding new evidence.",
    "Do not include private personal data or names of individual workers.",
    "Use deterministic evidence IDs whenever available."
  ]
}
```

This manifest is not a new runtime architecture. It is a discovery layer over the same Worker API,
OpenAPI contracts, and D1/R2 serving split already planned for Studio.

## Issue Contract

Name the domain object `ContributorIssue`, not just `Issue`, to avoid confusion with internal batch
audit issues.

Core fields:

| Field | Purpose |
|---|---|
| `issueId` | Server-assigned stable ID. |
| `idempotencyKey` | Required on create/update writes so agent retries do not duplicate reports. |
| `submittedBy` | Contributor ID; public display is opt-in. |
| `agent` | Optional agent name/version/client metadata. |
| `scope` | Route, stop, segment, corridor, finding, source, or brief. |
| `problemKind` | Enum such as `reliability_pattern`, `speed_hotspot`, `source_gap`, `bad_geometry`, `bad_stop`, `schedule_mismatch`, `realtime_mismatch`, `finding_correction`, `duplicate_corroboration`. |
| `routeIds` | Validated route IDs when route-scoped. |
| `stopIds` | Validated GTFS stop IDs when stop-scoped. |
| `segmentIds` | Studio segment IDs when segment-scoped. |
| `observedWindow` | Date/time window, timezone, recurrence pattern, and grain. |
| `claim` | One narrow, falsifiable sentence. |
| `evidence` | Studio evidence IDs, public source URLs, cited snippets under quote limits, or contributor observations. |
| `reproductionSteps` | How a reviewer or agent can check the issue. |
| `expectedBehavior` | What the data/UI/source should show if correct. |
| `actualBehavior` | What appears wrong. |
| `confidence` | Contributor/agent self-assessed confidence. |
| `caveats` | Known uncertainty, missing source, or alternate explanation. |
| `duplicateFingerprint` | Server-derived hash over normalized scope, kind, window, and claim. |
| `status` | Review lifecycle state. |
| `visibility` | `private_review`, `public_after_confirmed`, or `public_now` if allowed. |

Use Zod schemas in `packages/domain` and generated JSON Schema/OpenAPI output so agents can validate
locally before posting.

## Review Lifecycle

Suggested states:

| State | Meaning | Points? |
|---|---|---:|
| `draft` | Created but not submitted for review. | No |
| `submitted` | Ready for automated checks and triage. | No |
| `needs_evidence` | Specific missing fields or weak evidence. | No |
| `duplicate_candidate` | Similar issue exists; may become corroboration. | Maybe |
| `confirmed` | Reviewer accepts that the issue is real and useful. | Yes |
| `promoted` | Issue changes a finding, source gap, route brief, or detector backlog. | Yes + bonus |
| `resolved` | Underlying data/product issue fixed or source caveat added. | Yes + bonus |
| `rejected` | Not reproducible, unsafe, off-topic, or unsupported. | No |
| `withdrawn` | Contributor removed it before confirmation. | No |

Review should start with deterministic gates:

- route/stop/segment IDs parse and exist in the active release;
- window is valid and not impossibly broad;
- source/evidence IDs resolve;
- claim is non-empty, narrow, and not a policy recommendation;
- duplicate fingerprint and nearest existing issue candidates are returned;
- impact estimate can be computed or explicitly marked unavailable;
- privacy filters reject emails, phone numbers, private addresses, and worker names.

Human review can be lightweight at first. The key is that score-awarding status transitions are
server-owned and auditable.

## Scoring Model

Scoring is a ledger, not a mutable total. Each point event has a reason, issue ID, reviewer/source,
created time, and optional expiration period.

Initial point events:

| Event | Points | Notes |
|---|---:|---|
| Confirmed specific issue | 10 | Base award after review. |
| Adds new deterministic evidence to an existing issue | 3 | Corroboration, not duplicate spam. |
| High rider-impact route/corridor | +5 to +20 | Use existing route/ridership/severity projections. |
| Promoted into Studio finding/source gap/brief caveat | +15 | Means it changed a public artifact or backlog. |
| Reproducible fix or correction accepted | +20 | For metadata/schema/UI/data corrections. |
| Rejected, vague, unsafe, or unreviewed | 0 | No negative points for honest misses in v1. |
| Repeated duplicate after warning | 0 and rate-limit signal | Keep abuse handling separate from scoring. |

Leaderboard totals should be computed into snapshot tables so public reads are cheap:

- weekly;
- monthly;
- all-time;
- by route;
- by borough;
- by problem kind.

Tie-breakers should prefer confirmed impact, promoted count, then oldest qualifying contribution.

## Data Storage

Keep the current architecture:

- `packages/domain`: `ContributorIssueSchema`, `ContributorIssueEvidenceSchema`,
  `ContributorScoreEventSchema`, `LeaderboardEntrySchema`.
- `packages/db`: D1 serving tables and repositories for issues, issue evidence, review events,
  score ledger, contributors, and leaderboard snapshots.
- `apps/web/src/worker`: thin API handlers only; no source fetching, detector execution, or
  analytics imports.
- `tools/pipeline`: optional snapshot/reconciliation job for leaderboard rollups and issue-to-
  finding promotion audits.
- R2: optional large evidence bundles later, such as sanitized screenshots or agent packets. V1 can
  avoid attachment uploads and use public URLs plus Studio evidence IDs.

Suggested D1 tables:

- `contributor`;
- `contributor_api_token` or token metadata if auth is in scope;
- `contributor_issue`;
- `contributor_issue_evidence`;
- `contributor_issue_review_event`;
- `contributor_score_event`;
- `leaderboard_snapshot`;
- `idempotency_key`.

Use R2 only for immutable, sanitized, larger artifacts. Do not put raw private screenshots or
unmoderated uploads directly into public artifacts.

## API Surface

Read endpoints:

- `GET /api/v1/contributor/leaderboard?period=week|month|all&route=&borough=&kind=`;
- `GET /api/v1/contributor/profiles/{handle}`;
- `GET /api/v1/contributor/issues/{issueId}`;
- `GET /api/v1/contributor/issues?route=&status=&kind=`;
- `GET /.well-known/bp-agent.json`.

Write endpoints:

- `POST /api/v1/contributor/issues/validate`;
- `POST /api/v1/contributor/issues`;
- `PATCH /api/v1/contributor/issues/{issueId}`;
- `POST /api/v1/contributor/issues/{issueId}/submit`;
- `POST /api/v1/contributor/issues/{issueId}/withdraw`;

Reviewer endpoints:

- `POST /api/v1/contributor/issues/{issueId}/review`;
- `POST /api/v1/contributor/issues/{issueId}/link-duplicate`;
- `POST /api/v1/contributor/issues/{issueId}/promote`;
- `POST /api/v1/contributor/issues/{issueId}/score-events`;

Every write endpoint must require an idempotency key. Agents retry. The API must not create
duplicate issues or duplicate score events because a network request was repeated.

## Web Surfaces

Keep the UI quiet and evidence-centered:

- leaderboard page with weekly/monthly/all-time tabs;
- route leaderboard panel on route detail pages;
- contributor profile with confirmed issues and promoted artifacts;
- issue detail page showing claim, scope, evidence, validation status, duplicate links, review
  history, and any resulting Studio artifact;
- "submit issue" flow that is usable by humans but mirrors the same API contract agents use.

Avoid making the first screen a marketing page. The useful first viewport is the leaderboard plus
recent confirmed contributions and filters.

## Agent Prompt Seed

Publish this as documentation and also expose it from the manifest.

```text
You are helping a contributor submit one high-quality Bus Priority Impact Studio issue.

Goal:
Find at most one specific, falsifiable MTA bus reliability or data-quality issue. Submit nothing if
the evidence is weak, duplicate without new corroboration, private, or outside bus reliability.

Workflow:
1. Read /.well-known/bp-agent.json and /api/openapi.json.
2. Pick a route, stop, segment, finding, or source scope.
3. Check existing findings and contributor issues before drafting.
4. Use Studio evidence IDs whenever possible.
5. Draft exactly one ContributorIssue packet.
6. Call /api/v1/contributor/issues/validate.
7. Fix validation errors once. If still weak, stop and report why.
8. Submit with an idempotency key only if validation says the issue is reviewable.

Rules:
- Do not include private personal data.
- Do not name individual workers.
- Do not make policy recommendations.
- Do not claim causality unless the evidence packet supports it.
- Prefer a narrow correction over a broad complaint.
```

## Implementation Plan

### Phase 0 - Docs And Contract

- Add this wiki page and link it from the index.
- Define `ContributorIssue` and scoring terms in `packages/domain`.
- Generate JSON Schema/OpenAPI for the issue contract.
- Add fixtures for one valid issue, one duplicate, one weak-evidence issue, and one privacy-rejected
  issue.

Verification:

- `bun --filter @bp/domain test`;
- `bun run check:types`;
- generated OpenAPI includes contributor schemas.

### Phase 1 - D1 Model And Repositories

- Add D1 tables for contributors, issues, evidence, review events, score events, snapshots, and
  idempotency.
- Add repository methods in `packages/db`.
- Add unit tests for idempotent create and append-only score events.

Verification:

- `bun --filter @bp/db test`;
- migration generation check;
- fixture round-trip through domain schemas.

### Phase 2 - Worker API

- Add `/.well-known/bp-agent.json`.
- Add validate/create/read endpoints.
- Keep validation deterministic and fast.
- Add Worker tests for happy path, duplicate idempotency, weak evidence, and privacy rejection.

Verification:

- `bun --filter @bp/web test:worker`;
- `bun run check:web-architecture`.

### Phase 3 - Leaderboard Projection

- Add score ledger writes on review events.
- Add snapshot query/job for weekly, monthly, all-time, route, borough, and kind leaderboards.
- Serve leaderboard reads from snapshot tables, not expensive ad hoc aggregation.

Verification:

- fixture-backed repository tests;
- Worker read tests;
- snapshot job deterministic over fixed score events.

### Phase 4 - UI And Dogfood

- Add leaderboard, contributor profile, and issue detail pages.
- Add a small human submit flow that mirrors the same issue contract.
- Run the canonical agent walkthrough with Codex and Claude-style agents.

Verification:

- `bun --filter @bp/web build`;
- Worker smoke for public reads;
- dogfood: an agent with only the manifest/docs submits one reviewable fixture issue.

## Open Decisions

- Auth: per-contributor bearer token, GitHub OAuth, email magic link, or private beta invite codes.
- Moderation: who can confirm/promote issues and whether trusted contributors can self-confirm
  low-risk metadata corrections.
- Attachments: whether v1 allows sanitized screenshot uploads or defers all attachments.
- Public identity: handle-only by default or anonymous-by-default with opt-in display.
- Agent attribution: whether leaderboard shows human only, human plus agent, or separate agent
  client metadata.
- Naming: "Contributor Leaderboard", "Transit Scouts", or another public-facing label.
- Transit scope: bus-first for this product; subway/rail only if future data contracts justify it.

## Related

- [[wiki/project/ai_interaction_model|AI Interaction Model]]
- [[wiki/engineering/agent_author_api|Agent-Author API]]
- [[wiki/engineering/web_api_endpoint_architecture|Web API Endpoint Architecture]]
- [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]]
- [[wiki/engineering/testing_standards|Testing Standards]]
