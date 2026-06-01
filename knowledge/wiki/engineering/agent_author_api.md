---
title: Agent-Author API
type: engineering
status: draft
last_updated: 2026-06-01
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
       body: { routeSlug?: "m15-sbs", fromFindingId?: "...", sourceBriefId?: "..." }
       → { draft } with a new draft-only brief id
6.  PATCH /api/v1/studio/briefs/{briefId}/draft
       body: { title?, dek?, summary?, bodyMd?, status? }
       → 204 No Content
7.  POST /api/v1/studio/briefs/{briefId}/draft/generate
       body: {}
       → { status, error, draft } (queues a Think / Workers AI generation run; no inline inference)
8.  GET /api/v1/studio/briefs/{briefId}
       → public brief, overlaid with draft state only for an authorized operator
9.  GET /api/v1/studio/briefs/{briefId}/evidence
       → searchable catalog of additional evidence the brief could cite
10. PATCH /api/v1/studio/briefs/{briefId}/draft/claims/2
       body: { evidenceIds: ["e-madison-rh-share"], caveatIds: ["c-observed-speed"] }
       → 204 No Content
11. POST /api/v1/studio/briefs/{briefId}/draft/validate
       → { score, weakClaims, missingEvidence, blockingIssues[] }
12. POST /api/v1/studio/briefs/{briefId}/draft/review
       body: { message: "..." }
       → 204 No Content
13. POST /api/v1/studio/briefs/{briefId}/draft/verdict
       body: { verdict: "approve" | "request_changes", message?: "..." }
       → 204 No Content
14. POST /api/v1/studio/briefs/{briefId}/draft/publish
       body: {}
       → 204 No Content
15. GET /api/v1/studio/briefs/{briefId}/draft/publish-candidate-export
       → publish-candidate payload for release review
```

Decisions this walkthrough forces (each must have an explicit answer before any endpoint ships):

- **Async drafting is required.** LLM-paced brief generation cannot fit a synchronous request.
  The live Worker records a generation job and signals the Cloudflare Think / Workers AI
  `BriefAuthorAgent` out-of-band.
- **Strength scoring is server-authoritative.** Step 9 cannot be a client-side compute; otherwise
  agents can publish briefs the system would consider weak. The validate endpoint is the gate.
- **Idempotency keys on every write.** Agents retry. Without keys we get duplicate claims and
  duplicate publishes. Required as the `Idempotency-Key` header on every draft mutation.
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
| `GET /studio/briefs/{id}` | Read the public brief, with draft overlay for authorized operators. | Anonymous reads remain public; operator reads need `read:briefs` in the draft workspace. |
| `POST /studio/briefs` | Create a new draft-only brief from a `routeSlug`, `sourceBriefId`, or `fromFindingId`. | `write:briefs`; `Idempotency-Key` required; returns `{ draft }`. Authorized reads can fetch draft-only briefs by id. |
| `PATCH /studio/briefs/{id}/draft` | Edit brief-level metadata/status/body markdown. | `write:briefs`; `Idempotency-Key` required. Seeds from the release brief if needed. |
| `POST /studio/briefs/{id}/draft/generate` | Queue a Think / Workers AI generation run. | `write:briefs`; no inline inference; returns `{ status, error, draft }`; missing bindings fail closed with `not_configured`. |
| `POST /studio/briefs/{id}/draft/agent-runs` | Start an authoring agent run against the current draft version/hash. | `write:briefs`; `Idempotency-Key` required; no model execution yet. |
| `POST /studio/briefs/{id}/draft/agent-runs/{runId}/propose-edit` | Submit structured agent edit operations. | `write:briefs`; returns either a stored proposal id or machine-readable repair/stale-base feedback; accepted draft content is unchanged. |
| `GET /studio/briefs/{id}/draft/proposals/{proposalId}` | Fetch a stored agent proposal. | `read:briefs`; used for preview and human approval. |
| `POST /studio/briefs/{id}/draft/proposals/{proposalId}/apply` | Apply all or selected proposal operations after human approval. | `write:briefs`; `Idempotency-Key` required; mutates accepted draft content, records accepted operation ids, and creates a version snapshot. |
| `POST /studio/briefs/{id}/draft/proposals/{proposalId}/reject` | Reject a stored agent proposal. | `write:briefs`; `Idempotency-Key` required; accepted draft content is unchanged. |
| `GET /studio/briefs/{id}/draft/versions` | List draft version milestones. | `read:briefs`; returns D1-backed version refs. |
| `POST /studio/briefs/{id}/draft/versions/{versionId}/restore` | Restore a draft version snapshot as a new version. | `write:briefs`; `Idempotency-Key` required; resets status to draft and recomputes validation. |
| `POST /studio/briefs/{id}/draft/claims` | Add a claim. | `write:briefs`; returns the new claim with `n` assigned. |
| `PATCH /studio/briefs/{id}/draft/claims/{n}` | Edit a claim: text, evidence ids, caveat ids, state. | `write:briefs`; deterministic strength recompute is deferred. |
| `DELETE /studio/briefs/{id}/draft/claims/{n}` | Remove a claim. | `write:briefs`; renumbers remaining claims. |
| `POST /studio/briefs/{id}/draft/blocks` | Add a typed primitive block for the markdown content graph. | `write:briefs`; returns the normalized block. |
| `PATCH /studio/briefs/{id}/draft/blocks/{blockId}` | Edit a typed primitive block. | `write:briefs`; block id must match the path. |
| `DELETE /studio/briefs/{id}/draft/blocks/{blockId}` | Remove a typed primitive block. | `write:briefs`; validation reports body refs that now point at missing blocks. |
| `POST /studio/briefs/{id}/draft/refs/resolve` | Validate/normalize proposed block, evidence, metric, source, artifact, and unresolved refs. | `write:briefs`; local block refs resolve from D1, evidence/source/metric refs from the brief projection, and artifacts from route detail refs. |
| `POST /studio/briefs/{id}/draft/validate` | Run server-side validation. | `write:briefs`; returns `{ score, weakClaims, missingEvidence, blockingIssues[] }`, including missing/mismatched body block refs. |
| `POST /studio/briefs/{id}/draft/review` | Send to review by adding a comment. | `review:briefs`; status becomes `in_review`. |
| `POST /studio/briefs/{id}/draft/verdict` | Approve or request changes. | `review:briefs`; optional message is stored as a review comment; approval is separate from publish-candidate marking. |
| `POST /studio/briefs/{id}/draft/publish` | Mark as publish candidate. | `publish:briefs`; does not mutate the public release. |
| `POST /studio/briefs/{id}/draft/retract` | Retract a publish candidate. | `publish:briefs`; history is preserved. |
| `GET /studio/briefs/{id}/draft/publish-candidate-export` | Fetch candidate payload. | `publish:briefs`; combines D1 draft with R2 release context. |
| `.../draft/comments*` | Draft-private anchored review threads, replies, suggestions, and resolution. | Implemented for D1 draft-private collaboration; see `docs/architecture/studio-review-collaboration-and-promotion.md`. |
| `GET /studio/briefs/{id}/history` | Versions with diffs. | Same shape as today. |
| `GET /studio/briefs/{id}/evidence` | Catalog of evidence the brief could attach. | Supports `?search`, `?kind`, server-side ranked by relevance to the brief's route/segments. |

## Decisions Settled In This Spec

- **Audience**: agents-as-authors, equally first-class with the web composer UI.
- **Composing is async.** Brief generation is LLM-paced; the Worker records a job and signals the
  `BriefAuthorAgent` Durable Object to run Workers AI out-of-band.
- **Strength is server-authoritative.** Clients cannot bypass `validate` to publish weak briefs.
- **Idempotency keys on all draft writes.** Agents retry; the API never creates duplicates.
- **Auth is settled for draft authoring.** ADR 0008 sessions resolve operator roles. Draft writes
  use `write:briefs`, review uses `review:briefs`, publish/export uses `publish:briefs`.
- **No raw observational data.** Mid-layer is derived projections only.
- **The web composer is a client of this API**, not a privileged surface. Anything possible in the
  UI is possible via REST.
- **Review collaboration and public promotion are now scoped.** Draft-private review threads use
  anchored quote selectors and suggested-edit primitives; promotion stays a two-phase flow where
  the Worker exports a validated candidate and the pipeline writes immutable public projections.
  See `docs/architecture/studio-review-collaboration-and-promotion.md`.

## Decisions Still Open

- **Bearer-token agent auth.** Browser/operator auth is settled via ADR 0008 cookies; external agent
  bearer-token UX and lifecycle remain open.
- **Public body/block backfill implementation.** Draft `bodyMd`, block rows, and resolver validation
  exist, and the promotion model is scoped; released public projections still need ref persistence,
  candidate-export validation, and promotion-command hardening.
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
agent, given only the docs, follows steps 1-13 above and ends with a published brief whose
evidence and caveats round-trip through `GET /briefs/{id}` correctly. The internal team must run
the same walkthrough against the same endpoints — that is the dogfeed test.

## Related

- [[web_api_endpoint_architecture|Web API Endpoint Architecture]] — read-side surface.
- [[web_app_support_plan|Web App Support Plan]] — composer UI loader/transition model.
- `apps/web/src/studio/api-contract.ts` — existing Zod schemas to extend.
- `apps/web/src/studio/pages/brief-workflows.tsx` (`BriefComposerPage`) — the UI client of this API.
