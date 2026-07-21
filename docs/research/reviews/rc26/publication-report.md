# Plan 075 rc26 publication report

Date: 2026-07-21

Status: **PASS — 17/17 authorized rc26 objects published to production and verified; Plan 075
DONE**.

## Authorization and scope

The publication is bound to candidate set
`candidate-set-v3:80050ed598f3b2ab0d0a1e99` and the approved seven-study rc26 cut. The operator
first approved the anchors, retained B67's descriptive tier, activated Plan 075, and authorized
publication:

> approve Plan 074 rc26 anchors; accept the six historical published-claim TBD cells and the completed B67 negative finding; keep B67 descriptive; approve Plan 075 activation and authorize publication of the rc26 study artifacts.

The operator then authorized the concrete GitHub and Cloudflare operation:

> I explicitly approve pushing codex/075-rc26-activation to git@github.com:mannyc2/bus-priority-impact-studio.git, opening and merging its PR, then publishing the validated 17 rc26 objects to Cloudflare R2 bucket bus-priority-artifacts and verifying production.

The activation record merged through
[PR #88](https://github.com/mannyc2/bus-priority-impact-studio/pull/88) at commit
`d61a3af81745e79460b76d33e2e36d3748913f5a`. The existing Plan 075 UI implementation remains the
one merged by [PR #59](https://github.com/mannyc2/bus-priority-impact-studio/pull/59), whose recorded
validation passed types, architecture, 181 web tests, and the web build budget.

## Publication operation

Target bucket: `bus-priority-artifacts`.

Publication used two fail-safe phases so payloads existed before their activation pointers:

1. At `2026-07-21T22:09:19.575Z`, nine non-pointer objects uploaded successfully: the anchor
   report, approved event set, and seven study payloads.
2. At `2026-07-21T22:11:16.923Z`, eight activation objects uploaded successfully: the study index
   and seven route rollups.

Both publisher executions passed with zero failures. A pre-publication rollback capture recorded
the prior five-study index, approved event set, anchor report, and seven route-rollup states; B67
and M96 route rollups were absent before this cut. No rollback was needed.

## Published object integrity

Every object returned HTTP 200 through the public artifact endpoint and matched its staged SHA-256
digest byte-for-byte.

| R2 key | Bytes | SHA-256 |
| --- | ---: | --- |
| `studio/v2/studies/anchors-report.md` | 9,957 | `117e3ec6d7b4f3e875fdc2987c4aa9317fcf707f3af9ce56195642354669113d` |
| `studio/v2/studies/study-events.json` | 1,465,649 | `7923d0ea4e86a07d70a354f22ae8d732ee8cc198612dffe25bdae6bdaf30c18f` |
| `studio/v2/studies/study-event-v2-0cbbed3260f58eceb20275c7.json` | 12,440 | `15a4cb2a22f917816adb66b63e1e9b00c3e0bd3b21de6dd4df58e0378e2092c4` |
| `studio/v2/studies/study-event-v2-4c9efea0d35e2912037d99c2.json` | 11,576 | `68d0009d55c8d32ba7c87a3d683e913a5b10d4218940153887deef0a3feb66b8` |
| `studio/v2/studies/study-event-v2-4d0530b77a63ac21ae95229b.json` | 11,871 | `3621229a104070e84339b4f1534904af4c650ef261a44fde8314a6c175593fe1` |
| `studio/v2/studies/study-event-v2-5f0d2e20b6fcecbefe91966a.json` | 12,647 | `ae7d75d00b7e110f9aaf2fb4d5c59e15851fdc576760024f36b4623b6ce4265f` |
| `studio/v2/studies/study-event-v2-6afced32d375c2933f5344f9.json` | 12,333 | `4161a6869c6cf475aa6910b79bf0d0b8623a8b89148fd9f9d8a16e122dee8469` |
| `studio/v2/studies/study-event-v2-bff2030b147ab90027f3e748.json` | 12,447 | `2a7a2c51941cb74f30a4423c03036f48c5c56b43a050f8a8dc6b56bdbfa3f8fc` |
| `studio/v2/studies/study-event-v2-d70a3ee36eb94ae88732065f.json` | 39,596 | `a6b1ce3fa1e4e7ccbda4137a57b7c7f3f56681581430bc696e14c5bdf342457d` |
| `studio/v2/studies/index.json` | 4,090 | `081a994624f503c13b404c7596505f3a86c497c05bbc9c10aa63aab5e488eccf` |
| `studio/v2/routes/b67/studies.json` | 43,729 | `082370dd451d41b52f28ef2412b07019804d9db4e8a70f057f3cf4eeae1f8ab8` |
| `studio/v2/routes/b82-sbs/studies.json` | 14,609 | `b6de88ef96bbbe2d702813659467c8092eb61f9ea71b4cd4ab8a3c6c67ab78cb` |
| `studio/v2/routes/bx28/studies.json` | 14,423 | `be9d07fd2eadff6a946adea5b6215b5ec0584631ffb4fd3d7260154b8ee9769e` |
| `studio/v2/routes/bx38/studies.json` | 14,300 | `8223088aeb8fcca47f6e3151e31b523cf05f6f80b96074439233e81ff9fb252e` |
| `studio/v2/routes/bx9/studies.json` | 14,444 | `be4c487996eaf00399b81c1f319beb4905570f47547063df1737b2ecd8ef5c93` |
| `studio/v2/routes/m79-sbs/studies.json` | 13,510 | `3b70088cd936895c48773b2435cc0d938a81cc12e43e38381b00de0fdedb8552` |
| `studio/v2/routes/m96/studies.json` | 13,904 | `5640e00e5fc1bbb45eb8df38facc7e3b10cea498c7a5b4f33c89f8c84fd25c4c` |

The published anchor report intentionally remains the immutable approval snapshot at the hash
above. Its pre-publication boundary language is historical; this report is the subsequent
publication receipt.

## Production verification

- The public study index contains exactly seven studies: B67, B82+, BX28, BX38, BX9, M79+, and
  M96.
- The B67 payload and route rollup resolve to
  `study-event-v2-d70a3ee36eb94ae88732065f`. B67 remains `descriptive`, reports the approved
  all-day association of `+0.13899495728934547 mph`, and still fails both the minimum-sample and
  placebo-in-time gates.
- `/routes/b67?tab=history&study=study-event-v2-d70a3ee36eb94ae88732065f` and `/interventions`
  both returned HTTP 200 from production.
- The coordinated serving release intentionally remains
  `pub_20260605T183601689Z`, published at `2026-06-05T18:36:01.689Z`, with coverage
  `2023-04` through `2026-03`. This was a scoped R2 study-artifact promotion; it did not require or
  perform a D1 seed, Worker deployment, or coordinated-release pointer change.
- Closure verification passed `git diff --check`, the knowledge validator, and 36 focused History,
  interventions, and design-doctrine tests. PR #88's comprehensive CI verification also passed
  before merge.

Plan 075 is complete. Plan 076 remains blocked independently because rc26 has only two gated
estimates in one treatment family, below its required minimum of three.
