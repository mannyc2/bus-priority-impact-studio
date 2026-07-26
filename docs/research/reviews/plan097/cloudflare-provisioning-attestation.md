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
  `7f570d37839b382f0b00488ed8c7f6d03dcb80dd5a933c19c85f3d40dd17327c`
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

The initial Access-scoped token was insufficient. A replacement bounded token
then provisioned one 24-hour service token and three self-hosted Access
applications:

| Phase | Application ID | Policy ID |
|---|---|---|
| preflight | `8b356267-b390-4731-b918-7e3933a495a7` | `c1daa8ce-34ed-41ea-924f-e41ac27d6f5d` |
| proof | `0d393afc-15ad-484c-8353-50e8d05e2286` | `c66441f3-3c55-46a4-a184-49f0e64174b2` |
| activation | `848e3df5-76a0-46f5-9d27-bfd752579fe3` | `118f057b-5e91-49e6-99c7-c56873a9b4f4` |

Each policy allowed only the exact service-token resource
`9a57c852-0ec3-4d8e-95d3-01c08420f2af`. Before each operation, anonymous and
wrong-secret requests were rejected by Access, the correct service identity
reached the Worker, and the separate execution token was still required for
mutating actions.

The protected official workflows then produced the signed preflight in run
`30180085025`, disposable proof in run `30180351221`, and production
completion receipt in run `30180632361`. Their exact hashes and artifact
digests are recorded in `release-closure-attestation.md`.

## Retirement

The Access boundary and operation Workers were temporary. After production
completion and independent public verification, all three operation Workers,
all three Access applications/policies, and the one-time service token were
deleted. Exact post-delete reads returned Cloudflare code 10007 for the
Workers and HTTP 404 for every Access application and the service token.

All Plan 097 GitHub Actions secrets, including the Access API token, signing
private key, bootstrap/execution tokens, audiences, and service-token
credentials, were deleted. The ordinary deployment token was retained. The
proof D1 and operations R2 buckets remain only as audit evidence.

## Authority boundary

Provisioning alone authorized no production mutation. The later signed
preflight, exact A→B→A proof, and fresh execution token bounded the one
production activation that elected `pub_20260725T164123260Z`. That completed
Plan 097; the retired credentials and Workers cannot authorize another
release.
