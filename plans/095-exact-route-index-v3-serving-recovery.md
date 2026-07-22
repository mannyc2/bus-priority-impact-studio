# Plan 095: Recover exact route-index v3 serving

## Status

- **State**: IN PROGRESS
- **Priority**: P0
- **Effort**: S-M
- **Depends on**: Plans 085, 086, 092, and 094 (implementation merged)
- **Authority**: operator's 2026-07-22 authorization for the exact D1/Worker
  recovery, GitHub merge, Cloudflare mutation, deployment, and production QA

## Outcome

Restore the strict schema-v3 route index and route-detail reads without
falling back to schema v2, aliasing routes, weakening decoding, or inventing
identity rows. Preserve the existing published release identity and the exact
`B44` / `B44+` distinction. Close the deployment gap that allowed a green
Worker release while its required D1 serving projection was absent.

## Failure envelope and traced boundary

The Plan 094 production deployment at `061fdfd5` completed successfully, but
the following fresh reads failed on 2026-07-22:

| Request | Status | Request ID | Cloudflare ray |
|---|---:|---|---|
| `/api/v1/studio/routes?schema=3` | 500 | `9abeefcf-62ae-45ec-9cee-43bd250ec3b1` | `a1f2e90c68572ced-ORD` |
| `/api/v1/studio/routes/bx38` | 500 | `e443c300-0533-4359-9744-9490cfa80a6d` | `a1f2e90e0aac5e39-EWR` |

The response body was the correct redacted production envelope:
`{"error":{"code":"INTERNAL","message":"Internal error."}}`. Schema-v2
route listing, route history, speed history, and hourly profile remained 200.
Local Worker tail and D1 inspection were attempted first but the checkout has
no Cloudflare token; the credentialed GitHub production environment is the
authorized audit and recovery path.

The traced cause boundary is narrow:

1. Schema v3 and route detail both call
   `listStudioRouteIndexSourceRows` and strict exact presentation decoding.
2. Migration `0032_route_catalog_trip_type.sql` and exact trip-type seed
   support landed after the last production D1 export.
3. The production compatibility hotfix intentionally tolerates the missing
   table only for the legacy route-card path; it marks the catalog unavailable
   and does not fabricate trip types.
4. Schema v3 must have exact source-backed route and trip types, so the legacy
   D1 shape cannot authorize it. Current CI deploys the Worker but neither
   verifies D1 projection integrity nor smokes schema v3 after deployment.

The immutable `wiki-v1-rc25` route-evidence v2 index is the existing exact
identity source for this recovery. Its 375 identities bind MTA Wiki manifest
SHA-256 `77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f`,
route-identity SHA-256
`47d5976ce87cc00069e68909df38a2bfeffa1374edb3991f038b483fb013b586`,
and Current Bus Routes SHA-256
`d0147d9bb26dd142fb2cb325c32d30284bc5207853be2638e77723ef695b69d4`.
Its 394 route-type rows exactly match the canonical D1 catalog for those 375
routes and it supplies 394 exact trip-type rows. Fourteen legacy/catalog-only
D1 routes have no admitted exact identity and must not be synthesized into
schema v3.

## Implementation

1. Add a deterministic recovery generator that strict-decodes the existing
   route-evidence v2 index, verifies injective route IDs/slugs, verifies every
   admitted route/type against a read-only D1 audit snapshot, and writes an
   idempotent SQL projection plus a hash/count receipt. It must reject source,
   route-universe, route-type, trip-type, duplicate, or release mismatch.
2. Add a D1/Worker test reproducing the incomplete exact projection. Schema v2
   remains available, while schema v3 and route detail admit only complete
   exact identities and never manufacture the 14 unresolved rows.
3. Add a credentialed, read-only production audit that records migration/table
   state, exact/legacy route counts, type/trip-type counts, missing/orphan rows,
   release metadata, and representative `B44`/`B44+` identity rows before any
   write.
4. Deploy the compatibility-preserving Worker first, then apply only the
   verified `0032`/`0034` table migrations and generated idempotent projection
   through Wrangler. This ordering keeps schema v2 usable while the exact
   projection is absent and prevents the old global table-presence behavior
   from observing a partially populated table. Re-run the integrity query and
   require 375 complete exact routes, 394 route types, 394 trip types, zero
   orphans, and exact `B44`/`B44+` separation.
5. Add a post-recovery smoke gate for schema-v3 list, rich/sparse routes, B44,
   B44+, route History dependencies, and exact response decoding. A 500,
   identity collapse, release mismatch, or non-200 detail fails the workflow.
   Later releases must carry their own exact registry row and projection hash;
   the one-time Plan 095 receipt cannot authorize a different release.
6. Run focused tests, full repo verification, merge after CI, execute the
   authorized recovery, deploy, and verify the live Plan 094 History page on
   desktop and mobile.

## Acceptance criteria

- [ ] Read-only production audit and Worker logs or explicit credential limit
      are recorded before mutation.
- [ ] Recovery SQL and receipt are deterministic and bound to exact source,
      route universe, release metadata, byte count, and SHA-256.
- [ ] Schema-v3 and route detail fail closed on incomplete/duplicate/mismatched
      exact identity; schema v2 compatibility remains unchanged.
- [ ] Production D1 has exactly the verified complete exact projection, zero
      orphan rows, and distinct B44/B44+ identities.
- [ ] Schema-v3 list and rich/sparse/B44/B44+ detail endpoints return 200 and
      strict-decode after deployment.
- [ ] The live Plan 094 History UI passes desktop/mobile exact-identity,
      keyboard, source-link, empty-state, and overflow checks.
- [ ] Focused and comprehensive verification pass; commits, PR, workflow,
      D1 operation hashes/counts, deployment, and production requests are
      recorded in the completion receipt.

## STOP conditions

Stop rather than repair around the contract if the exact source hash or route
universe differs from the pinned receipt; production release metadata is not a
passing published release; B44/B44+ collapse; any generated row lacks exact
source identity; the integrity query reports an unexplained orphan/duplicate;
or recovery would require schema-v2 fallback, aliasing, relaxed decoding,
fabricated rows, or a new evidence/publication claim.
