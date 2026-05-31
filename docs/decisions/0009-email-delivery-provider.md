# 0009 - Email delivery provider for magic-link auth

Date: 2026-05-25

## Status

Accepted. Default provider is **Cloudflare Email Service** via the Workers `send_email` binding; **Resend** is documented as the fallback if the project ever moves off Workers Paid.

## Context

ADR 0008 commits to email magic-link as the only auth method, so a working outbound email path is now a hard requirement. The project lives on Cloudflare Workers, the domain is already on Cloudflare DNS, and the user requirement was framed as "whatever is cheapest."

Three viable providers in May 2026:

| Option | Setup | Cost | Cloudflare lock-in |
|---|---|---|---|
| **Cloudflare Email Service** (`send_email` binding) | Onboard domain in dashboard → CF auto-adds MX/SPF/DKIM/DMARC on `cf-bounce` subdomain. Add `send_email` binding in `wrangler.jsonc`. Requires Workers Paid ($5/mo). | 3,000/mo free on Workers Paid, then $0.35/1k. | Full — but the project is already there. |
| **Resend** | Create API key, configure SPF/DKIM, store key in worker secret. | 3,000/mo free across all tiers; paid tiers start at $20/mo for 50k. | None — REST API works from any platform. |
| **MailChannels** | Was the historical Workers default; discontinued for free outbound. | n/a. | n/a. |

## Decision

Use **Cloudflare Email Service** as the default. Configuration:

- `wrangler.jsonc` declares `send_email` binding named `EMAIL`.
- `Env.EMAIL?: EmailSendBinding` in `apps/web/src/worker/index.ts` — defined as a local interface (the new Email Service API is not yet in `@cloudflare/workers-types`).
- Sender address comes from `env.AUTH_EMAIL_FROM` (e.g., `auth@<domain>`); operator must set this to a verified sender once the domain is onboarded.
- `sendMagicLinkEmail(env, { to, link })` calls `env.EMAIL.send({ to, from, subject, html, text })`.

Dev fallback when `env.EMAIL` is `undefined` (local `wrangler dev` without remote bindings, or a Workers Free deployment):

- Log the link to the worker console.
- Only when `env.ENVIRONMENT === "development"`, echo the link in the HTTP response as `{ __devMagicLink: "..." }` with status 202.
- In all other cases, still return 204 so the public contract is consistent.

Fallback path documented for the future: if the project ever leaves Workers Paid, swap `EmailSendBinding` for a Resend HTTPS POST (`POST https://api.resend.com/emails` with `RESEND_API_KEY` secret). No domain code change required outside `sendMagicLinkEmail`.

## Alternatives considered

- **Resend as default**: Free tier matches CF Email Service on volume, but adds a second vendor, a secret to manage, and a non-CF surface to monitor. Rejected so long as the project stays on Workers Paid.
- **MailChannels**: Discontinued. Not viable.
- **SES / Postmark / SendGrid**: Higher operational overhead (IAM keys, dedicated IP, suppression lists) than this volume warrants. Rejected.

## Consequences

### Positive

- Native Worker binding; no API key in secrets, no second vendor SLO to track.
- The free monthly budget is well above the expected magic-link volume for a single-tenant Studio.
- Dev mode produces a working sign-in loop on a laptop with zero email config.

### Negative

- Hard dependency on Workers Paid.
- The new Email Service API is not yet typed in `@cloudflare/workers-types`, so the binding is described by a local `EmailSendBinding` interface and the call surface is intentionally narrow.
- Domain onboarding is a one-time manual step in the CF dashboard before email actually delivers.
