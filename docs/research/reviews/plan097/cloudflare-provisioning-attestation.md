# Plan 097 Cloudflare provisioning attestation

This attestation records the bounded Cloudflare resources prepared on
2026-07-25 for the `mta-wiki` `v1-rc28` release candidate. It is not a signed
preflight, disposable A→B→A proof, production authorization, activation
receipt, or completion receipt.

## Bound candidate

- Candidate release: `pub_20260725T164123260Z`
- Operation: `plan097:pub_20260725T164123260Z`
- Coverage: `2023-04` through `2026-05`
- Activation bundle SHA-256:
  `595c7d489d3f03af5e86a6ccfaf8d6d953d9bbc6a5f1f1555024c59e85933dc0`
- Artifact manifest SHA-256:
  `6bc5cc028bfd20eadb7912b6022212847ba2f8087511450ac463f9e783300e70`
- Artifact count and bytes: 3,002 objects; 774,069,604 bytes
- Exact route count: 375
- Source release: `mta-wiki` `v1-rc28`
- Source manifest SHA-256:
  `b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c`

## Provisioned resources

GitHub Actions run `30166626225` created or confirmed the isolated storage
resources. Its sanitized provisioning receipt recorded:

- disposable D1 `bus-priority-plan097-proof`
  (`903545fb-84b1-4571-b962-e6f6fd7c46aa`);
- R2 `bus-priority-plan097-preflight-artifacts`;
- R2 `bus-priority-plan097-preflight-operations`;
- R2 `bus-priority-plan097-proof-artifacts`;
- R2 `bus-priority-plan097-proof-runtime`; and
- R2 `bus-priority-plan097-production-operations`.

GitHub Actions run `30166831112` applied the canonical disposable schema and
verified 35 D1 migrations and 48 application tables. The proof database and
all Plan 097 R2 buckets are distinct from production.

## Signing and authorization material

A one-time Ed25519 key pair was generated for the signed preflight. The
trusted public SPKI SHA-256 is
`7b6bb824b4754df8686bfc10e4295a2e47d9ab4da34a92c29af1199842adb8c6`
and the key ID is `plan097-20260725-rc28`. The private key, bootstrap token,
and disposable-proof execution token were stored as encrypted GitHub Actions
secrets; their values were not logged or committed.

The existing `CLOUDFLARE_API_TOKEN` successfully managed Workers, D1, and R2,
but Cloudflare denied its reads of Access organizations, applications, and
service tokens. No Access team domain, application audience, service-token
client ID, or service-token client secret exists in repository variables,
repository secrets, production-environment variables/secrets, or the local
gitignored environment.

Protected GitHub Actions run `30167076567` then exercised the same credential
through the registered `ci.yml` workflow. The reusable Plan 097 Access job
received the stored token and Cloudflare returned HTTP 403 on the first Access
API request. This distinguishes the blocker from a missing GitHub secret,
workflow-dispatch problem, local authentication problem, or ungranted
operator approval.

Cloudflare Access must be provisioned or exposed through a token with
`Access: Apps and Policies Write`, `Access: Service Tokens Write`, and
organization read access before an operation Worker can be deployed. The
runbook intentionally forbids deploying the operation Workers before the
Service Auth policy is active and the unauthenticated/JWT-negative checks
pass.

## Authority boundary

No production D1 row, production R2 object, serving release pointer, or
production Worker deployment changed during this provisioning. Plan 097
remains in progress until the Access gate, signed preflight, disposable proof,
fresh production token gate, activation, public verification, and canonical
completion receipt all pass.
