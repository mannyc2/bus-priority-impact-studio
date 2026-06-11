# Public Access Auth Gating Plan

Status: Draft plan
Last updated: 2026-06-06

## Goal

Keep Bus Priority Impact Studio publicly explorable by default. Require sign-in only at the moment a user tries to do something that needs a stable identity, spends AI budget, collaborates, publishes, or mutates privileged product state.

The working rule is:

> Viewing the site is anonymous. Acting on behalf of a person or operator is authenticated.

Manual unpublished drafting is the exception: it may be no-login, but it still needs an unguessable guest/capability credential so draft writes are not a public open mutation API.

This plan builds on ADR 0008 (`docs/decisions/0008-public-identity-auth.md`), ADR 0014, ADR 0016, and the current Studio authoring notes.

## Implementation status (2026-06-06)

Audited against the current branch. The **product/data layer of this plan largely shipped; central enforcement did not.**

Built:

- Auth taxonomy as registry data: `RouteAuth = public | optional-session | session{scopes}` (`packages/studio-api/src/contracts/route-spec.ts`).
- Refined operator scopes on routes, not a generic `write:briefs` (Implementation Plan step 1). The registry tags routes across `public`, `optional-session`, `identity`, `write:briefs`, `read:briefs`, `review:briefs`, and `publish:briefs`.
- Guest draft ownership (step 5) and claim-flow scaffolding (step 6): `bp_guest` cookie (`packages/studio-api/src/studio/auth.ts`), plus `owner_kind` / `guest_token_hash` / `guest_claimed_at` columns (`packages/db/src/d1/schema.ts`) and SHA-256 token hashing.
- Public-identity surfaces (step 4): `/api/v1/alerts`, `/api/v1/saved-searches`, `/api/v1/briefs/:briefId/public-comments` (`packages/studio-api/src/identity-surface-routes.ts`).
- De-gated public readers (step 2): only `apps/web/src/routes/briefs/$briefId/review.tsx` still calls `requireAuthenticatedRoute`.

Not done:

- **Step 1's matrix is not authoritative.** No request-path code reads `route.auth` to enforce; the dispatcher never references it. Enforcement is hand-wired inside `studio/brief-drafts.ts` (~20 sites), `auth-routes.ts`, and `identity-surface-routes.ts`, and OpenAPI security is hand-maintained separately in `packages/domain/src/studio-openapi.ts`. Auth therefore has three sources of truth that can drift — e.g. the permission-failure codes in step 9 and the idempotency `428` are not centrally guaranteed (idempotency currently returns `400`).

### Dependency on the Studio API refactor

Making this plan's matrix authoritative requires the **centralized dispatcher — Phase 3 of the Studio API hard-cutover refactor** (`knowledge/wiki/engineering/studio-api-refactor.md`) — the single place that would read `route.auth` and enforce "public by default" structurally instead of per handler. Until that lands, every new route must be hand-checked: a route can be tagged `public` in the registry while its handler gates (or vice versa) with nothing failing the build. Prioritize the enforcement seam before expanding route surface.

## Current Auth Model

The repo already has three identity levels:

| Level | Who | What it unlocks |
|---|---|---|
| Anonymous visitor | No session cookie | Public website, public APIs, public briefs/findings/routes/docs, public artifacts, public comments read. |
| Guest draft author | No magic-link session; unguessable draft edit credential | Create/edit an unpublished scratch draft without AI, review, collaboration, or publication. |
| Public identity | Magic-link session, no operator role | Account page, own saved searches, own alerts, posting public comments, future personal preferences. |
| Studio operator | Public identity plus `studio_actor_role` scopes | Private draft overlays, authoring, AI generation, review, publish-candidate workflow, admin role grants. |

Operator scopes currently modeled in `@bp/domain`:

| Scope | Required for |
|---|---|
| `read:briefs` | Reading private draft overlays, draft refs, draft comments, agent run/proposal status, version milestones. |
| `write:briefs` | Creating/editing drafts, attaching evidence, deterministic validation writes, AI run creation, proposal submission/apply/reject, version restore. |
| `review:briefs` | Creating review threads, requesting review, submitting verdicts. |
| `publish:briefs` | Marking/retracting publish candidates, exporting candidates, recording promotion receipts. |
| `admin:identities` | Listing identities and granting/revoking operator roles. |

## Public By Default

These surfaces should stay accessible without auth:

| Surface | Routes / APIs | Notes |
|---|---|---|
| Marketing and overview pages | `/`, `/docs`, `/docs/*`, `/methods`, `/system` where public | No sign-in prompt before reading. |
| Route exploration | `/routes`, `/routes/:routeId`, `/routes/:routeId/ladder`, `/compare` | Route cards, route profiles, ladders, maps, method caveats, and comparison projections are public read models. |
| Findings | `/findings`, `/findings/:findingId` | Published/review-candidate finding projections remain public, with provenance labels and caveats. |
| Brief reading | `/briefs`, `/briefs/:briefId`, `/briefs/:briefId/evidence`, `/briefs/:briefId/history` | Released briefs are public. If a signed-in operator can read a private draft overlay, `GET /api/v1/studio/briefs/:briefId` may overlay it, but anonymous users still get the released projection. |
| Search | `/search`, `GET /api/v1/studio/search` | Search result browsing is public. Saving a search is gated only when the user clicks save. |
| Public APIs | `/api/health`, `/api/openapi.json`, `/api/v1/status`, `/api/v1/routes`, `/api/v1/routes/:routeId`, `/api/v1/map/manifest`, `/api/v1/artifacts/:artifactKey`, `/api/v1/hotspots`, `/api/v1/compare`, public `studio/*` read projections | Keep cacheable and anonymous where payloads contain only release artifacts or public derived read models. |
| Public comments read | `GET /api/v1/briefs/:briefId/public-comments` | Reading comments is public. Posting comments requires public identity. |

Anonymous browsing should not be interrupted by global sign-in walls. Header account chips, save buttons, comment boxes, and authoring controls can show just-in-time sign-in or permission prompts.

## Auth-Required Subset

### Public Identity Required

These features need a stable user identifier but do not require operator scopes:

| Feature | Gate | Why |
|---|---|---|
| Account page | Magic-link session | Shows the current identity and sign-out controls. |
| Save as alert | Magic-link session at `POST /api/v1/alerts` | Writes user-owned alert state and may later send notifications. |
| Saved searches | Magic-link session at `POST /api/v1/saved-searches` and own list/delete endpoints | Writes user-owned saved state. |
| Post public comment | Magic-link session at `POST /api/v1/briefs/:briefId/public-comments` | Needs attribution, moderation hooks, and abuse controls. |
| Delete own public comment | Magic-link session | Mutates user-owned comment state. |

UX rule: let the user reach the relevant public page first. When they click save or post, preserve the intended action and redirect to `/signin?redirect=...` if needed.

### Guest Draft Credential Required

These features should be possible without magic-link sign-in, but not as credential-free writes:

| Feature | Gate | Why |
|---|---|---|
| Create scratch draft | Worker-minted guest draft credential | Lets a visitor start writing immediately while giving the server an owner/abuse boundary. |
| Edit scratch draft metadata/body/blocks/refs manually | Same guest credential, scoped to one draft | Supports no-login editing without exposing every draft to arbitrary mutation. |
| Attach deterministic public evidence | Same guest credential, scoped to one draft | The source object is public, but the unpublished draft write is private to the guest/link. |
| Claim scratch draft | Magic-link session | Moves the draft from disposable guest ownership to recoverable account/operator ownership. |

Guest drafts are deliberately limited:

- no AI generation or agent runs,
- no private draft overlay for anyone except the holder of the edit credential,
- no review threads, reviewer verdicts, or role-based collaboration,
- no publish-candidate/export/promotion,
- no email notifications,
- no durable cross-device recovery unless claimed.

Implementation preference: use an HttpOnly `bp_guest` cookie for same-browser continuity plus an optional unguessable edit token in the private draft URL for share/resume. Store only hashes of guest/edit tokens in D1. Public released brief IDs remain ordinary readable IDs; guest draft edit credentials must be separate high-entropy secrets.

### Operator Required

These features require a Studio operator role because they access workspace-private state, spend AI budget, collaborate, or affect publication:

| Feature | Minimum scope | Examples |
|---|---|---|
| Private draft read overlay | `read:briefs` | Draft-only brief projection, draft refs, draft comments, agent/proposal reads, draft versions. |
| Operator draft creation and editing | `write:briefs` | Signed-in/operator-owned `/briefs/new`, `/briefs/:briefId/edit`, `/routes/:routeId/annotate`, `POST /api/v1/studio/briefs`, `PATCH .../draft`, claim/block/ref writes, attach, validate, restore. |
| AI generation and agent runs | `write:briefs` | `POST .../draft/generate`, `POST .../draft/agent-runs`, `POST .../propose-edit`, proposal apply/reject. AI is gated at trigger time because it spends inference budget and works over private draft state. |
| Review collaboration | `review:briefs` for reviewer actions, `read:briefs` for reading private threads, `write:briefs` for author-side suggestion acceptance | Draft-private comments, replies, review request, approve/request-changes verdicts. |
| Publish workflow | `publish:briefs` | Mark/retract publish candidate, export candidate payload, record promotion receipt. Public projection mutation remains offline pipeline promotion. |
| Operator role administration | `admin:identities` | `/admin/identities`, grant/revoke operator roles. |

UX rule: public pages may show authoring entry points such as "Send to brief" or "New brief", but the route/action should gate only when the user commits to authoring.

## AI-Specific Rule

AI does not make a page private by itself. The trigger and private workspace outputs are what require auth.

Public:

- reading an already published AI-assisted brief,
- seeing provenance/caveat labels,
- reading public findings generated by offline pipelines after review/promotion,
- reading docs about AI methodology.

Authenticated:

- starting `draft/generate`,
- starting or interacting with a `BriefAuthorAgent`,
- polling private agent runs or proposals,
- applying/rejecting agent proposals,
- asking AI to repair draft validation or review issues.

The model call must remain out of the public REST request path. Auth failure should happen before job/run rows are created or inference work is queued.

Guest draft users may see AI affordances, but triggering them should prompt sign-in/operator upgrade. If the product later wants public-account AI for non-operators, that should be a separate budget/rate-limit decision; do not accidentally grant it through guest draft editing.

## Implementation Plan

1. **Keep the route inventory explicit.**
   Maintain a small auth matrix in the route registry or generated API docs that marks each API as `public`, `optional-session`, `identity`, or `operator(scope)`. The current registry already covers most public and Studio read/draft routes, but it should reflect refined scopes for review and publish endpoints instead of treating every draft subresource as generic `write:briefs`.

2. **Remove page-level auth from public readers.**
   Public navigation, route detail, compare, findings, brief reading, evidence, history, docs, and search should never call `requireAuthenticatedRoute`. `/account`, `/admin/identities`, `/briefs/:briefId/review`, and publish/admin routes stay guarded. `/briefs/new`, `/briefs/:briefId/edit`, and `/routes/:routeId/annotate` should become no-login capable when they are operating on a guest-owned scratch draft, while still requiring operator auth for workspace-owned drafts.

3. **Use optional sessions for richer reads.**
   `GET /api/v1/me` stays optional. `GET /api/v1/studio/briefs/:briefId` may use an optional session to overlay an operator-readable draft, but the anonymous response must remain the public projection or a normal public 404.

4. **Wire public-identity actions just in time.**
   Implement or confirm API routes for alerts, saved searches, and public comments using the existing `identity`, `alert`, `saved_search`, and `public_comment` D1 query helpers. `GET` for public comments stays open; writes require a session and operate only on the current identity's rows.

5. **Add guest draft ownership before opening no-login writes.**
   Add a guest/capability ownership path for scratch drafts before allowing anonymous create/edit endpoints. The draft record should distinguish `workspace`, `identity`, and `guest` ownership; all guest writes should require the matching credential hash, idempotency key, schema validation, size limits, and simple rate limits. Guest draft IDs should not be enumerable.

6. **Add a claim/upgrade flow.**
   A signed-in public identity should be able to claim a guest draft. Operators with `write:briefs` can then convert or copy it into a workspace-owned draft. Claiming should rotate or revoke guest edit credentials so stale links cannot keep editing after ownership changes unless link-sharing is explicitly added.

7. **Gate AI and privileged draft writes before side effects.**
   For `draft/generate`, `agent-runs`, proposal operations, workspace draft mutations, review, and publish endpoints, verify session, operator role, workspace, scope, D1 binding, idempotency key, and request schema before writing job/run/proposal rows or signaling Think/Workers AI. Guest draft writes use the guest credential checks from step 5 instead.

8. **Separate public identity from operator promotion.**
   Any public identity can exist without an operator role. Only `admin:identities` can grant or revoke `studio_actor_role` scopes. Public-account features should never infer operator privileges from email alone.

9. **Make permission failures product-readable.**
   Return `401` for no session, `403` for signed-in users without the required role/scope, and `404` for private resources outside the user's workspace where revealing existence would be noisy. UI should translate these into sign-in, account/permission, or not-found states without blocking public browsing.

## Verification

Add or keep focused tests for:

- anonymous `GET` succeeds for public route, finding, brief, docs, status, search, artifact, map, hotspot, and compare APIs;
- anonymous `GET /api/v1/studio/briefs/:briefId` returns only public projection;
- operator `GET /api/v1/studio/briefs/:briefId` overlays draft state only with `read:briefs` in the draft workspace;
- anonymous/public-identity users cannot create workspace drafts, trigger AI, read draft comments, apply proposals, or publish candidates;
- anonymous users can create and manually edit a scratch draft only when they hold the matching guest/edit credential;
- anonymous users cannot read or mutate a guest draft without its edit credential;
- guest draft users cannot trigger AI, create review threads, mark publish candidates, export publish candidates, or record promotion receipts;
- signed-in users can claim a guest draft, and old guest credentials stop working after claim unless explicitly preserved;
- public identity can create/list/delete its own alerts and saved searches;
- public comments: anonymous `GET` succeeds, anonymous `POST` returns `401`, signed-in `POST` succeeds;
- operator scope checks distinguish `write:briefs`, `review:briefs`, `publish:briefs`, and `admin:identities`;
- generated OpenAPI/auth docs match the route registry.

Smallest relevant commands once code changes exist:

```sh
bun --filter @bp/web test:worker
bun run check:types
```

## Future Feature Rule

For every new feature, choose the least restrictive gate:

| If the feature... | Gate |
|---|---|
| Reads release artifacts or public derived data | Anonymous |
| Personalizes without server persistence | Anonymous local state |
| Creates or manually edits an unpublished scratch draft | Guest/capability credential |
| Saves user-owned server state | Public identity |
| Sends email/notifications | Public identity |
| Posts user-visible content | Public identity plus moderation/rate limits |
| Reads private drafts/review state | Operator `read:briefs` |
| Mutates workspace drafts or starts AI | Operator `write:briefs` |
| Reviews/approves/request changes | Operator `review:briefs` |
| Changes publish lifecycle | Operator `publish:briefs` |
| Manages roles | Operator `admin:identities` |

If a feature does not fit one of these reasons, it should stay public until a concrete abuse, privacy, cost, or mutation requirement appears.
