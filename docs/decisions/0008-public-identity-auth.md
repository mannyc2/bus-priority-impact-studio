# 0008 - Public identity & magic-link auth

Date: 2026-05-25

## Status

Accepted. Phase 1 (schema unification) and Phase 2 (magic-link + sessions) are implemented; Phases 3–5 are planned in `~/.claude/plans/staged-greeting-elephant.md`.

## Context

The Studio previously authenticated only controlled operators via a `studio_actor` + hashed `studio_actor_token` pair (ADR 0004 + migration `0015_studio_actor_auth.sql`). The reserved `publicAccountAuthStatus: "not_available"` and `userDirectoryStatus: "not_available"` literals on `/api/v1/studio/me` signaled this was a deliberate MVP boundary.

The user wanted a public identity layer, framed as: *"I didn't really intend to have auth but some stable identifier is useful."* The narrow goal is per-visitor identity (claim across devices via email) that unlocks Save-as-alert, saved searches, public comments on briefs, and a path to promote a public identity to a `studio_actor` operator role — not a full account system.

## Decision

Unify identity into one `identity` table; `studio_actor` becomes a role attachment (`studio_actor_role`). Authentication is email magic-link only — no passwords, SSO, MFA, or third-party identity providers. Sessions are random tokens stored hashed in D1, presented as an HttpOnly cookie (`bp_session`).

D1 schema (`0018_identity_unification.sql`):

- `identity` — `identity_id` PK, `email`, `email_normalized` (UNIQUE), `display_name` nullable, `active`, timestamps.
- `identity_session` — single table for all session shapes via a `kind` discriminator: `magic_pending` (15 min expiry, single-use via `consumed_at`), `session` (30 d expiry), `legacy_bearer` (backfilled from `studio_actor_token`, no expiry).
- `studio_actor_role` — `identity_id` + `workspace_id` + `scopes_json`. Replaces the workspace/scopes columns previously on `studio_actor`.
- Backfill copies every `studio_actor` to an `identity` + `studio_actor_role`, and every `studio_actor_token` to a `legacy_bearer` `identity_session`. Legacy bearer tokens keep working through the same shim until ADR cleanup phase.

Worker contract:

- `POST /api/v1/auth/magic-link/request` `{ email }` → always 204 (no enumeration leak). Sends an email via the binding chosen in ADR 0009; in dev mode (no binding) logs the link and returns 202 with `{ __devMagicLink }` in the body.
- `POST /api/v1/auth/magic-link/consume` `{ token }` → atomically flips `consumed_at`, creates a 30-day `session`, sets `Set-Cookie: bp_session=<raw>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
- `POST /api/v1/auth/signout` → revokes the session, clears the cookie.
- `GET /api/v1/me` → returns `IdentityMeResponse` for cookie or bearer auth, or `IdentityAnonymousMeResponse` when anonymous. Both expose `operator: StudioActorProfileSchema | null` so callers can branch without a second request.
- The existing `GET /api/v1/studio/me` (`StudioActorMeResponse`) is unchanged for operators, but `publicAccountAuthStatus` and `userDirectoryStatus` are now real enums (`"magic_link"` / `"d1_identity"`) rather than `"not_available"` literals.

Session cookie design: random 32-byte base64url token, stored only as sha256-hex in `identity_session.token_hash`. No cookie signing — the random token is its own credential. Non-sliding 30 d expiry; `last_used_at` is updated per request via `recordSessionUse` but the expiry is not extended. Re-auth at expiry.

## Alternatives considered

- **OAuth / SSO**: adds a third-party runtime dependency and a provider choice the user explicitly rejected as overkill ("whatever is cheapest"). Rejected.
- **Passwords**: doubles the surface area (reset flow, password hashing, lockouts) for a system that doesn't really need accounts in the first place. Rejected.
- **Passkeys (WebAuthn)**: best long-term UX but the largest first-cut surface. Rejected for MVP.
- **Two separate tables (`public_account` + `studio_actor` with a nullable FK)**: simpler diff per phase, but bakes in a permanent split between operator and public identities. Rejected because every operator-facing surface would need to bridge the two. Unification keeps the data model honest.

## Consequences

### Positive

- One identity table, one session table, one role-attachment table. Every existing operator-facing query keeps working through a thin shim.
- The `/me` contract finally tells callers what auth methods exist on this deployment.
- Promotion path (Phase 4) is a single `studio_actor_role` insert keyed on `identity_id`.

### Negative

- The migration is non-trivial and locks in unification before any UI for it exists.
- Magic-link delivery is now a hard runtime dependency for any new public-account UX (mitigated by dev fallback; see ADR 0009).
- The `kind` discriminator on `identity_session` means the table has nullable columns that are only valid for some rows (`expires_at` nullable for `legacy_bearer`, `consumed_at` only for `magic_pending`). Documented in the schema comment; cheaper than three near-identical tables.
