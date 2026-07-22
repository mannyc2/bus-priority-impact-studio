# Plan 095: Recover exact route-index v3 serving

## Status

- **State**: DONE
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

- [x] Read-only production audit and Worker logs or explicit credential limit
      are recorded before mutation.
- [x] Recovery SQL and receipt are deterministic and bound to exact source,
      route universe, release metadata, byte count, and SHA-256.
- [x] Schema-v3 and route detail fail closed on incomplete/duplicate/mismatched
      exact identity; schema v2 compatibility remains unchanged.
- [x] Production D1 has exactly the verified complete exact projection, zero
      orphan rows, and distinct B44/B44+ identities.
- [x] Schema-v3 list and rich/sparse/B44/B44+ detail endpoints return 200 and
      strict-decode after deployment.
- [x] The live Plan 094 History UI passes desktop/mobile exact-identity,
      keyboard, source-link, empty-state, and overflow checks.
- [x] Focused and comprehensive verification pass; commits, PR, workflow,
      D1 operation hashes/counts, deployment, and production requests are
      recorded in the completion receipt.

## Completion receipt

[PR #97](https://github.com/mannyc2/bus-priority-impact-studio/pull/97)
merged at `764f73449cda7424db4d90af3b7b10c02cd8cf56` after the required CI
check passed. Its implementation commits are `d542d30a`, `c8bc17a5`,
`5558e21d`, and `023a67d6`. Main workflow
[`29929242989`](https://github.com/mannyc2/bus-priority-impact-studio/actions/runs/29929242989)
deployed the compatibility-preserving Worker first, applied migrations 0032
and 0034 plus the deterministic projection, passed the post-mutation D1 audit,
and passed the production endpoint smoke.

The immutable recovery identity is
`exact-route-index-v3-recovery-v1:d99b97d40e9c6b62430765c9`. Its SQL SHA-256
is `0efc576c55fa4b6d52cac1e04567ff70529af2b330bae459031c11246a0b46cc`;
the receipt SHA-256 is
`d6046cff2f4cc63d8a1842914b5f3d95144b99a7f88ed09033b5be42bfe5a2ef`.
The receipt binds `wiki-v1-rc25`, the exact route-evidence index at 392,566
bytes and SHA-256
`fd07c9991b3d7c56905b95a2e387eaee182e314eb84a2cb26de68e06b5cf0807`,
the active serving release `pub_20260605T183601689Z`, catalog snapshot
`c31ee2a2de424ace986578faa29b3b5d5f5cbd0310d16ac42e841631e03ce219`,
and exact projection
`620f02ced782735ffec4ad27ce39f2683f0a51715178457b30750ac8e78cd48a`.

The pre-audit receipt (SHA-256
`f0ebb1cf87e23658a5dbfded26d86a7f93ecbdc28c3ae7809d23f4c37c0d7d1c`)
authorized only the three expected actions. The post-audit receipt (SHA-256
`de453779c0953139efa89ba7696786d84dd97a7c992927cf424678f3c8d8607a`)
records 389 catalog routes, 406 catalog route types, 375 exact routes, 394
exact route types, 394 exact trip types, 14 explicitly excluded unresolved
legacy routes, the exact projection hash above, and no remaining action.
No canonical local DB, published rc26 object, schema-v2 identity, or R2 object
was changed by the recovery.

The production smoke receipt (SHA-256
`6e5fd2dfc2a4b38b53150cfa937c2104b384d99c2bc7cb0f2ae6f2c5e318eb53`)
strict-decoded 375 schema-v3 routes and returned 200 for all 14 reads. The
schema-v3 list request ID was `81bf67c4-8a37-40bb-90ff-6d35bac77532`;
representative detail request IDs were
`7e67f01e-215e-4775-8896-832c22da14b4` (BX38),
`ba0149da-87f3-4b76-a241-e39d2f03a49e` (B1),
`b4e4f832-0b44-492a-8540-3b592070accc` (B44), and
`0279d574-e6e0-4d75-b7f1-8493de74e6ba` (B44+). Route history, hourly,
speed-history, and timeline reads also returned 200 for rich and sparse routes.

The first live rich-route pass exposed one bounded Plan 094 bug: a typed
human-readable 2010 date label sorted ahead of ISO 2025. Commit `23582f5e`
prefixes only the internal deterministic sort key with the already-extracted
typed year; it does not classify prose. [PR #98](https://github.com/mannyc2/bus-priority-impact-studio/pull/98)
merged at `217ac1ee6795be10a098a638d8d6a4cf8170b54b`, and main workflow
[`29930802937`](https://github.com/mannyc2/bus-priority-impact-studio/actions/runs/29930802937)
passed CI, skipped every already-satisfied D1 mutation, redeployed, re-audited,
and repeated the endpoint smoke.

The final headless-Chrome production receipt has SHA-256
`d3b8ded6b557cbcffc972f6b587915ccc9b1d772417530e9593495af0f06f09d`.
It verifies 1440 px and 390 px views, zero horizontal overflow, no unlabeled
controls or runtime/core-request failures, sparse empty states, distinct B44
and B44-SBS/B44+ headers, dense M15+ search/filter behavior, descending live
year groups (`2025`, `2024`, `2023`, `2022`, `2019`, `2017`), and keyboard
focus on the typed NYC DOT PDF link ending in `#page=4`. Optional unpublished
inventory/observation/study objects remain honest nullable 404s; they were not
fabricated to make the page look complete. Focused tests, 342 web tests,
types, architecture/doctrine, Worker/D1 harness (23 tests), build, SEO,
performance, and the unchanged entry/total bundle budgets passed.

## STOP conditions

Stop rather than repair around the contract if the exact source hash or route
universe differs from the pinned receipt; production release metadata is not a
passing published release; B44/B44+ collapse; any generated row lacks exact
source identity; the integrity query reports an unexplained orphan/duplicate;
or recovery would require schema-v2 fallback, aliasing, relaxed decoding,
fabricated rows, or a new evidence/publication claim.
