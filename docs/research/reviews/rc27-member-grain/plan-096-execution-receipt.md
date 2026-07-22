# Plan 096 execution receipt

## Authority boundary

This receipt records a complete estimator-admission review. It authorizes no
study execution, publication, D1 or R2 mutation, production pointer, release
promotion, or deployment. The MTA Wiki quality-provenance and forecast
overlays were excluded from candidate construction.

## Producer pins

| Input | Exact pin |
|---|---|
| Producer merge | `fcab0d181b2ab4195f7467cc8b792a9daea911f6` |
| Release-byte commit | `3ad61a369931157b87655ff96a2fd66c926c986b` |
| Generator commit | `939b66078b2faec2b5edbf87ead8df3d967bda82` |
| Release | `v1-rc27`, manifest v5, SHA-256 `ed2332e653c7c9b5e37faee52198ff9f4c17d725c539831a4010471be5de622a` |
| Full release verification | 355 addressed files, 343,304,720 bytes, 85,396 canonical records; every listed byte count and SHA-256 matched |
| Member manifest | 2,056 bytes, SHA-256 `46f7ad9a3ec5cc470ff0d041c18d0ce75fe628890999516ad1b43efe26fefa68` |
| Member contract | 2,059 bytes, SHA-256 `82df80b7c04689cd047d9f07c267248618b50666296a0e49e9219b21ed32facf` |
| Member projection | 254,849 bytes, SHA-256 `da1af6ef9b96c5b92dce22d7708bad5b661c6761ac4562bd9d3fe46f7bd735dc`; 308 rows / 306 eligible / 31 reviewed |
| Clean-clone receipt | `data/quality/v1-rc27/release-verification-receipt.json`, SHA-256 `21e8601c3ad882f14d10daa96982767aa505fb4d536fedab531b2b00731356ca` |
| Durable Queens inputs | acquisition `4942692197828512e80d0de304bf28227bf9be0a923156e7ff50a07b6ebc0183`; source manifest `fffa92bba9524e6ee5ea861a2dd19dfe64125ab9066f223a2ab46b6568b8315e` |

The mutable `LATEST` pointer was not used. The quality manifest
`b367a627410dc3f1e26e63aaf90eaecef7fcab884028399cbae265e5fc8cee9c`
and forecast overlay
`ebbec691ffd5cdadaf7fbbbad6aa3b070b219a190bcdfafcc3fd164e75f36609`
are recorded only as excluded, non-authorizing producer facts.

## Outcome and spine pins

The isolated May scratch DB is 4,969,938,944 bytes with SHA-256
`07d9d297aac22e3d57bda1909700ad8d2c1ccd7b5651eb43362253701398e079`.
Its logical outcome snapshot covers 2023-04 through 2026-05: 18,482,493
study-projection rows, 393 routes, 266,854,211 trips, logical SHA-256
`5666e9e84b2880a24d38e36e09122f0a956823bedea3da6f95818e474edc6374`.

The official availability receipt is 1,853 bytes, SHA-256
`8de6aef78bc05f92786c48c3618d701498b089e670b881b37a1ae670fe53bdaf`:
April has 535,184 source rows / 360 routes / 7,148,423 trips; May has
476,481 / 359 / 7,096,970, and May is the latest complete month. The study
projection applies the unchanged ingest rules and contains 533,330 April rows
and 475,812 May rows.

The full 2023-04..2026-05 spine manifest is 360,880 bytes, SHA-256
`4ff10b34dfea4c32ac7638799271c430ec0935f464182ce781153fb50439f1b7`:
393 routes, with 91 `series_ready`, 25 `series_ready_with_gaps`, 277
`needs_pattern_review`, and zero failed artifacts.

## Tracker artifacts

| Artifact | Identity / SHA-256 |
|---|---|
| Occurrence import | `f547ae756d3c3a92285e595d1301162c2b45bf4ab02f7856071415d6814c1a70` |
| Member import | `d42e6665a9001210e90728c0e1f2bb3f9f81eba19f880a119f578ce5aab7f2db` |
| Candidate universe | `candidate-set-v4:3373f95c88d08ffef608581d`; deterministic candidate artifact SHA-256 `400371bed0633a00f8106d06a3dcefeb6f47cbd88c720c6b735c0f867608021b` |
| Scope bindings v2 | `fc05286412ffd7270868d19edc916bc12a9928b8c9d937523a74a8cc654397a9`; two exact B41/B67 bindings |
| Review inputs | `754ef948db22acb4b80ccb95c367b6b926b7ae9f6e28f55ab5b2b7a1f695371f` |
| Awaiting event set | `study-review-cut-v1:df3d8d2eda43c77738cf50ad`; SHA-256 `5487f522f1db9b1ace0faad54875b5ff47f5059f5f008caa09e16ffb8f3500b7` |
| Review worksheet | `97e57e1f77b672d30ae4dd6bb98a37808a533c703616dcdc31b4484c1a2a1457` |
| Reconciliation | `a7c0d4bff50d7ca336a36e47e6779d1df039c82a90052378aecc40196b8a705d` |
| Approval receipt | `84b057fcb7ff1c3ee98e678b50e98a8ebafba80c0f39243be248b26aa315de31` |
| Approved regeneration | scratch-only SHA-256 `7f773bd84a202f569ecd47c93f864034882fb6bc410ce0ba9f6af1fe836f12cc` |

Every generated artifact above was reproduced byte-identically from the same
logical inputs and repository-relative input paths. The complete
review covers 484 candidates exactly once: 97 fresh adjudications and 387
exact transfers, yielding 9 approvals / 475 rejections and zero decision
delta. Twenty later ACE phases remain quarantined.

## Focus outcomes

- Q45, Q86, and Q87 gain exact bounded member identity only. Each still needs
  an exact candidate + occurrence + route + member geometry/spine binding;
  Q86/Q87 additionally remain pattern-failed.
- Q63 and Q80 also have bounded members without matching member-grain scope
  bindings; Q63 remains pattern-failed.
- B41 retains its exact migrated bounded binding but remains
  `needs_pattern_review`.
- M57 retains independent route-wide ACE registry evidence and a 6/5 calendar,
  but remains `needs_pattern_review`.
- B60 and B68 remain estimator-admitted with independent exact route-wide ACE
  registry evidence, 6/5 calendars, and ready spines.
- No study was run. A separate explicit study-run authorization remains
  required before consuming this receipt in an estimator pass.
