# Plan 074 May review-cut publication report

Date: 2026-07-22

Status: **PASS — 21/21 immutable review-cut objects published and verified; stable rc26 unchanged**.

## Authorization and scope

The operator approved the exact v4 receipt for
`study-review-cut-v1:5298f37aac8780666c742f7d`, the complete nine-study verification pass, and
publication of validated artifacts that satisfy the existing evidence gates. The implementation and
evidence merged through [PR #90](https://github.com/mannyc2/bus-priority-impact-studio/pull/90) at
`1542925df82b81f0e060146a2737ade450721938` after the `ci-cd` workflow passed.

The release was deliberately restricted to this new immutable prefix:

`studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/`

It did not write any stable `studio/v2/studies/**` or `studio/v2/routes/**` key, activate a serving
pointer, publish the Plan 076 prototype, seed D1, deploy a Worker, or alter the coordinated release.
The source candidate universe and rc26 v3 receipt remain immutable.

## Publication operation

Target bucket: `bus-priority-artifacts`.

The exact 21-file staging set totals 2,047,522 bytes. Its SHA-256 manifest is
`235684136f4031ade04f3745ca3ae6ea48b23d4b4c24995c45fd1a1f59a9b174`.

Before any write, cache-busted public reads returned HTTP 404 for all 21 destination keys. The
credentialed publisher dry run at `2026-07-22T10:58:23.121Z` reported 21 candidates, 21 dry-run
objects, zero skips, and zero failures. Its report is 4,731 bytes, SHA-256
`a5fa711a0566d69cd4fe72b243f52ec6564f0e6ed5850c88711aa33378c04903`.

The execution at `2026-07-22T10:58:35.208Z` uploaded 21/21 objects with zero skips and zero
failures. Its report is 4,739 bytes, SHA-256
`663b69efe26ecffcf9eaf414c1adb0478b04e646f663e6bd14d35ba9a2298b69`.
The operation alone remains within the publisher's zero-usage included-cost estimate.

## Published object integrity

Every new key returned HTTP 200 through the public artifact endpoint and matched its staged
SHA-256 digest byte-for-byte.

| R2 key | Bytes | SHA-256 |
|---|---:|---|
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/anchors-report.md` | 9,094 | `b481cd08559d1680c73ef9de84eb910e9f4385e4506cfcb2bea08043e74b419f` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/study-events.json` | 1,715,123 | `89e1d58d06a57034eddb77f926040d88731120acc86d7e819427068acb037aab` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/index.json` | 5,302 | `4e27d6effb4c0bf72093780de660f5b9c9eb5e9b2fee9d871bf491d52d574903` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-0cbbed3260f58eceb20275c7.json` | 12,743 | `e9a7e5821d9eae9b7962a0edfc589aea6c1be1fe32bb0dec70506563b5163ea5` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-45b1a3e59f241408afefc42d.json` | 15,968 | `0fdbfe7d1324a4a2648ae47268494d3692aedaacc7b1af1097acadd63202a44c` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-4c9efea0d35e2912037d99c2.json` | 11,709 | `bd7dd8d8374ff0c2c398f42a6df78080cfccae1e4325d573a6f1c608c65782e0` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-4d0530b77a63ac21ae95229b.json` | 12,425 | `ff7a09ee255d263cfe4f16275a958ccce5f61dd3deb2c0fbf76efcbcbc261715` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-5f0d2e20b6fcecbefe91966a.json` | 13,029 | `2285ec552788b28f42aa669b32299e547154b3203092446762f6f6eb14a72e49` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-6afced32d375c2933f5344f9.json` | 12,636 | `06ee4f86998aab8e90137ce33c1acfa080cfd8125ff14fe02837fef8dd34b662` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-bff2030b147ab90027f3e748.json` | 13,674 | `b1a9ae2341ffddbbc74d5ef0ed0ce3f2bd0598dcfa4ad9de4ddc977e5f154330` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-d70a3ee36eb94ae88732065f.json` | 40,320 | `765c2eee1642d01dd565906d78d7a1dcc6bf0cccd3c3086f6d46fe01414de8df` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/studies/study-event-v2-d75ce301dd2c427f5bf61c1e.json` | 16,094 | `d5baf850a21a4700ee7c815521b921ece34af9cbf7228c7afc891152b3ab227e` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/b60/studies.json` | 18,395 | `5d17b2c47794277142da8e4ca6ccd40b8390dfe48847d661d32c792a3b24dea1` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/b67/studies.json` | 44,501 | `4c2dad40764923227077e2fbe2079ea2d4f01f44594eae26e2142c38faa554a5` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/b68/studies.json` | 18,249 | `697937f25f674fc614584b0de61027e88a170a37fd2ea49265e8f727d4911d26` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/b82-sbs/studies.json` | 14,991 | `418e9db5f03ef697ea57641588ed362961c75fa8bf04cc6f077ff354ad51486c` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/bx28/studies.json` | 14,730 | `f5d8d6dd17d2bf3e3b6a394bb34f3a013f1e2426d174d076d0e3e1524794dfef` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/bx38/studies.json` | 14,607 | `05d4ddde6e697ca26c902c2bd86a2308a1483e8036b7d75da7cc6cd0316a2533` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/bx9/studies.json` | 15,771 | `5a6f8dbd92a9cd094eb9e63151935e11b9d5281b9ec1365767f9990286c57375` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/m79-sbs/studies.json` | 13,647 | `7749d9cc485d69b97d963e56d0de32804c5b0e6d6dc83eb5ae5d050ef9670160` |
| `studio/v2/review-cuts/study-review-cut-v1-5298f37aac8780666c742f7d/routes/m96/studies.json` | 14,514 | `c2d00ef914982e801fbf803d223c11f1c93c555bc7e61274a43ba596b7ccbfac` |

## Production verification

- The versioned index is bound to analysis month `2026-05` and the exact review cut, contains
  exactly nine studies, and reports three `gated_estimate` rows.
- The B60 object remains `gated_estimate` and passes its placebo gate. The B68 object remains
  `descriptive` and fails its placebo gate. No claim tier changed during publication.
- Cache-busted verification rehashed all 21 versioned objects successfully.
- A separate cache-busted audit rehashed all 17 stable rc26 study objects successfully. The stable
  index still contains seven studies at analysis month `2026-03`.
- The coordinated serving release remains `pub_20260605T183601689Z` with coverage `2023-04`
  through `2026-03`.

This publication is an immutable analytical archive, not a public product activation. Plan 076's
zero-candidate prototype remains non-public, and its no-ship recommendation is unchanged.
