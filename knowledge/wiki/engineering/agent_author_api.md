---
title: Agent-Author API
type: engineering
status: draft
last_updated: 2026-05-18
owner: codex
source_count: 0
tags: [api, worker, agents, briefs, llm, composer, write-side]
---

# Agent-Author API

## Purpose

The product commits to **agents as first-class authors**, not just readers. External developers
will bring their own coding agents to compose route evidence briefs against the Studio API. The
internal pipeline must dogfood the same surface — anything an agent can do, the team can do, and
vice versa.

This page is the canonical specification for the agent-author write surface: the endpoints,
contracts, and decisions that fall out of one end-to-end walkthrough. It extends
[[web_api_endpoint_architecture|Web API Endpoint Architecture]] (read-side) and
[[web_app_support_plan|Web App Support Plan]] (composer UI), and supersedes any earlier framing
that treated agents as read-only consumers.

This spec does not introduce an open-ended chat agent. It applies
[[wiki/project/ai_interaction_model|AI Interaction Model]] to the write-side API: agents compose
typed brief artifacts, claims, evidence links, caveats, review notes, and publish candidates.

## Commitment

The Year-1 audience for the Studio API is mixed:

- **Humans** authoring briefs in the web composer UI (today).
- **Coding agents** authoring briefs via REST/CLI/SDK (this spec).

Both consume the same write-side contract. The web composer is one client of that API, not its
authoritative surface. A behaviour that exists only in the UI but not in the API is a bug.

## Canonical Walkthrough

This is the load-bearing flow. Every endpoint in this spec exists to serve one of its steps;
anything not on this flow is out of scope for v1.

> **Scenario**: A coding agent is asked to publish a brief about why the M15 SBS keeps declining
> despite full ACE coverage. The agent has no preloaded findings or briefs; it is starting cold.

```
1.  GET /api/v1/studio/findings?routeSlug=m15-sbs
       → list of findings on this route
2.  GET /api/v1/studio/findings/m15-full-treatment-still-declining
       → 5-step reasoning trail, caveat, comparable routes
3.  GET /api/v1/studio/routes/m15-sbs/segments?from=2025-04&to=2026-04&grain=month
       → mid-layer time series (per-segment per-month medians)
4.  GET /api/v1/studio/data/violations?route=m15-sbs&segment=madison-28-58
       → mid-layer ACE violation counts by period
5.  POST /api/v1/studio/briefs
       body: { fromFindingId: "m15-full-treatment-still-declining", title?, claims?[] }
       → 202 Accepted, { jobId, briefId, status: "drafting" }
6.  GET /api/v1/studio/briefs/{briefId}        (polled until status != "drafting")
       → full brief with system-drafted claims, evidence, caveats
7.  GET /api/v1/studio/briefs/{briefId}/evidence?search=madison+rh
       → searchable catalog of additional evidence the brief could cite
8.  PATCH /api/v1/studio/briefs/{briefId}/claims/2
       body: { attachEvidence: ["e-madison-rh-share"], applyCaveats: ["c-observed-speed"] }
       → updated claim with recomputed strength
9.  POST /api/v1/studio/briefs/{briefId}/validate
       → { score, weakClaims, missingEvidence, blockingIssues[] }
10. POST /api/v1/studio/briefs/{briefId}/review
       body: { reviewers: ["sr@example.com"], message?: "..." }
       → 202 Accepted, { reviewId }
11. POST /api/v1/studio/briefs/{briefId}/publish
       body: { idempotencyKey: "agent-run-7f3a..." }
       → 200 OK, { briefId, version, publishedAt }
```

Decisions this walkthrough forces (each must have an explicit answer before any endpoint ships):

- **Async drafting is required.** LLM-paced brief generation cannot fit a synchronous request.
  `POST /briefs` returns a job, agent polls.
- **Strength scoring is server-authoritative.** Step 9 cannot be a client-side compute; otherwise
  agents can publish briefs the system would consider weak. The validate endpoint is the gate.
- **Idempotency keys on every write.** Agents retry. Without keys we get duplicate briefs and
  duplicate publishes. Required on `POST /briefs`, `PATCH .../claims/{n}`, `POST .../publish`.
- **Reviewer assignment is async.** Step 10 enqueues; it does not block. The brief stays in the
  agent's hands until a human reviewer acts.
- **Publish is reversible but not undoable.** A published brief can be retracted via
  `POST .../retract` but the original `publishedAt` and `version` are immutable history.

## Read-Side: Mid-Layer Data

Today's read API exposes evidence-shaped data (route summaries, segment month-medians, findings,
briefs). For agents to form defensible novel claims they need a tier finer than findings but
coarser than raw GTFS-RT. The minimum mid-layer surface:

| Endpoint | Purpose |
|---|---|
| `GET /studio/routes/{id}/segments?from&to&grain` | Per-segment time series. `grain` = month (v1), week (v2), day (v3). |
| `GET /studio/data/violations?route&segment&from&to` | ACE violation counts by location × period. |
| `GET /studio/data/treatments?route&asOf` | Treatment-state-by-period (lane, ACE, TSP) — what was in force on a date. |
| `GET /studio/data/cohorts?route` | Peer-cohort definition + per-period stats used by the detection model. |
| `GET /studio/data/evidence?search&kind&route` | Search the canonical evidence catalog (numbers/charts/sources/caveats). |

Hard rules:

- These return **derived projections**, not raw observations. Same projection-backed BFF model as
  the existing read API.
- No endpoint exposes GTFS-RT samples, D1 row primary keys, or R2 object paths.
- Every projection has a `quality` block (`releaseLayer`, `confidence`, `caveats[]`) matching the
  existing Studio response shape.
- Time-series responses include a `windowGrain` echo so agents can verify they got what they
  asked for.

## Write-Side: Brief Composition

Every action the web composer can take is a write-side endpoint. The shape follows the existing
`StudioBrief` / `StudioClaim` / `ClaimEvidence` / `ClaimCaveat` Zod schemas in
`apps/web/src/studio/api-contract.ts` — extend those, don't fork.

| Endpoint | Action | Notes |
|---|---|---|
| `POST /studio/briefs` | Create a brief from a finding, route, or empty seed. | Async; returns `{ jobId, briefId, status: "drafting" }`. Idempotency key required. |
| `GET /studio/briefs/{id}` | Read the current draft / published state. | Same shape as today's response. Add `status` field (`drafting | draft | in-review | published | retracted`). |
| `PATCH /studio/briefs/{id}` | Edit brief-level metadata (title, dek). | Idempotency key required. |
| `POST /studio/briefs/{id}/claims` | Add a claim. | Returns the new claim with `n` assigned. |
| `PATCH /studio/briefs/{id}/claims/{n}` | Edit a claim: text, attach/detach evidence, apply/remove caveats, change state. | Server recomputes `strength`. |
| `DELETE /studio/briefs/{id}/claims/{n}` | Remove a claim. | Renumbers remaining claims. |
| `POST /studio/briefs/{id}/validate` | Run server-side validation. | Returns `{ score, weakClaims, missingEvidence, blockingIssues[] }`. Required before publish. |
| `POST /studio/briefs/{id}/review` | Send to review. Enqueues reviewer notification. | Brief stays editable; status becomes `in-review`. |
| `POST /studio/briefs/{id}/publish` | Publish. | Refuses if validate returned `blockingIssues`. Idempotent on `idempotencyKey`. |
| `POST /studio/briefs/{id}/retract` | Retract a published brief. | History is preserved; the brief moves back to `draft`. |
| `GET /studio/briefs/{id}/history` | Versions with diffs. | Same shape as today. |
| `GET /studio/briefs/{id}/evidence` | Catalog of evidence the brief could attach. | Supports `?search`, `?kind`, server-side ranked by relevance to the brief's route/segments. |

## Decisions Settled In This Spec

- **Audience**: agents-as-authors, equally first-class with the web composer UI.
- **Composing is async.** Brief generation is LLM-paced; `POST /briefs` returns a job id.
- **Strength is server-authoritative.** Clients cannot bypass `validate` to publish weak briefs.
- **Idempotency keys on all writes.** Agents retry; the API never creates duplicates.
- **No raw observational data.** Mid-layer is derived projections only.
- **The web composer is a client of this API**, not a privileged surface. Anything possible in the
  UI is possible via REST.

## Decisions Still Open

- **Auth model.** Bearer token + scopes is the working assumption (`read:routes`, `read:findings`,
  `write:briefs`, `publish:briefs`). Per-workspace tokens vs per-developer is unresolved.
- **Workspace model.** Today there's one global brief library. With external agents, do briefs
  belong to a workspace? If so, what's the boundary — author, org, project?
- **Rate limits.** Working assumption is 500 rpm per token. Brief generation has a separate budget
  (e.g. 10 active drafts per token).
- **Webhooks vs polling for async jobs.** Polling is the v1 default; webhooks deferred.
- **CLI parity.** Every endpoint above gets a 1:1 `bpi` CLI subcommand. Subcommand naming
  conventions are unresolved (`bpi briefs draft` vs `bpi briefs new`, etc.).

## Out Of Scope (v1)

- Real-time GTFS-RT pings or sub-month time-series grains.
- Agent-submitted findings as a typed object (decided against — see chat thread; the dogfeed loop
  runs through briefs).
- Multi-route briefs.
- Global chat, free-form AI replies, or an "Ask AI" endpoint.
- Anything that ships AI-generated content without the analyst-in-the-loop pattern. AI drafts;
  humans (or agents acting on behalf of humans) accept, edit, or reject.

## Verification

A v1 implementation of this spec is verified by **one end-to-end walkthrough**: an external coding
agent, given only the docs, follows steps 1-11 above and ends with a published brief whose
evidence and caveats round-trip through `GET /briefs/{id}` correctly. The internal team must run
the same walkthrough against the same endpoints — that is the dogfeed test.

## Related

- [[web_api_endpoint_architecture|Web API Endpoint Architecture]] — read-side surface.
- [[web_app_support_plan|Web App Support Plan]] — composer UI loader/transition model.
- `apps/web/src/studio/api-contract.ts` — existing Zod schemas to extend.
- `apps/web/src/studio/pages/brief-workflows.tsx` (`BriefComposerPage`) — the UI client of this API.
