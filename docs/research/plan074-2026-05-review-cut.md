# Plan 074 May 2026 outcome review cut

Date: 2026-07-21

Status: **approved and executed**. The operator approved all 484 decisions for
`study-review-cut-v1:5298f37aac8780666c742f7d`, authorized the strict v4 receipt and complete run,
and closed the fresh result-specific anchor gate. The complete run produces three
`gated_estimate` studies in the automated-bus-lane-enforcement family. Plan 076 consumed that floor
and completed its non-public spike, but recommends no public opportunity surface because no
segment has affirmative untreated evidence. No result is a causal claim.

## Immutable boundary

The outcome-only cycle remains pinned to MTA Wiki `v1-rc26` at producer commit `832242cf`:

- candidate universe: `candidate-set-v3:80050ed598f3b2ab0d0a1e99`;
- candidate-universe logical SHA-256:
  `7bfdefd2faf8595c00a8cc4d421da5933a34391de093d80b61bcb600ed0b3320`;
- review cut: `study-review-cut-v1:5298f37aac8780666c742f7d`;
- producer manifest:
  `c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0`;
- producer occurrence artifact:
  `6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef`;
- Tracker import:
  `b9c41aafb499b3cf3c8b5e74192be64b1615393d50c5d2cf4edc66260857d6cd`;
- raw registry: 741 rows, logical SHA-256
  `f47a173d615585415983e7e935dbed1244365f54b67aadc4f2b8355808803211`;
- available exact analysis routes: 393, logical SHA-256
  `5d9724f71fa169972d6265a5cbcab7c983c7d0cbfd6cc8287023df4d4d41d3f5`;
- member-extent lineage: `null` for this rc26-pinned cycle.

The new contract keeps the source candidate universe separate from the analysis review cut. The
candidate universe reserves a hashed `memberExtentLineage` slot at
`occurrence_route_member` grain. A later consumer migration can populate it and preserve exact
occurrence, route, and treatment-member identities without mixing producer lineage into the
outcome/spine/engine identity. The completed producer companion work is deliberately not consumed
here.

## Official availability and isolated refresh

The repository availability command wrote its evidence under explicit `/tmp` roots with
`min-speed-routes=300`:

| Evidence | Bytes | SHA-256 | Result |
|---|---:|---|---|
| May probe | 1,853 | `8de6aef78bc05f92786c48c3618d701498b089e670b881b37a1ae670fe53bdaf` | latest complete `2026-05` |
| June probe | 1,850 | `78feae52195369d80bcb8d74c0c3391775baf3dd43df139bbb63c9a59b9c40a3` | zero June rows; latest remains May |

Official raw-cell completeness is exact:

| Month | Rows | Routes | Trips | Scratch normalized rows | Scratch normalized trips |
|---|---:|---:|---:|---:|---:|
| 2026-04 | 535,184 | 360 | 7,148,423 | 533,330 | 7,132,862 |
| 2026-05 | 476,481 | 359 | 7,096,970 | 475,812 | 7,086,885 |

The raw-cell table retains every official cell; the existing normalizer removes cells that cannot
enter the estimator. Every official route has normalized rows, there are no missing route
partitions, and SQLite `quick_check` is `ok`.

The canonical 181,824,405,504-byte database and its live sidecars were read-only. A full clone was
unnecessary. The scratch database was created from all 44 current migrations and only the exact
required canonical tables/rows. It is 4,964,397,056 bytes after refresh. Its historical speed input
was 17,473,351 rows, 385 routes, 36 months, and 252,634,464 trips. The complete normalized
2023-04..2026-05 projection has 18,482,493 rows, 393 routes, and 266,854,211 trips; its ordered
logical SHA-256 is
`5666e9e84b2880a24d38e36e09122f0a956823bedea3da6f95818e474edc6374`.

## Spines, scope, and review inputs

The complete 2023-04..2026-05 build wrote 393/393 route artifacts, with 91
`series_ready`, 25 `series_ready_with_gaps`, 277 `needs_pattern_review`, and zero failed.
The manifest is 360,880 bytes, SHA-256
`4ff10b34dfea4c32ac7638799271c430ec0935f464182ce781153fb50439f1b7`.
The logical manifest plus every route artifact receipt is
`a618781b5502b8825a120879c4bb559771de0385b8453dcef8b9c9f35c8c49e2`.

Focused readiness:

| Route | Fresh state | Artifact SHA-256 | Review result |
|---|---|---|---|
| B60 | `series_ready_with_gaps` | `480811f3908fd32b6e8a2982e391d6cdcbc1419b0dface3b839cb443d06c9f1b` | eligible for operator estimator-admission decision |
| B68 | `series_ready` | `3c3f724f748eadecc2acc2b1a7a02f2c05d707b1026c8cf3e5da940533c69ce4` | eligible for operator estimator-admission decision |
| M57 | `needs_pattern_review` | `1b6e96612299c663cde418ae7a89c09f2d8cb3327e593775bf6c8d1346a01a61` | rejected; readiness gate remains dispositive |

Every carried-forward recommended-approved treated route is also fresh and hash-bound:

| Route | Fresh state | Artifact SHA-256 |
|---|---|---|
| B67 | `series_ready_with_gaps` | `8e0a409cf872d235b43906a52cc46e7a818ce5d93697f03009ca762ea91c3604` |
| B82+ | `series_ready` | `41f5c7d3b56e497fbcd17afedc904ee927b8826df9531c58d5ccca3e36a1339f` |
| BX28 | `series_ready_with_gaps` | `a13e5d8d7daf0fa716e4bce89398ea46d0beb91ee12d087d21cbd92f9dd5e569` |
| BX38 | `series_ready_with_gaps` | `6c89c4d78f70bd1d3a347c966b76fd4d2c3370b65106b27ad6b1ff06def07a34` |
| BX9 | `series_ready_with_gaps` | `6917dec389d09e0b5bae95de094ad7ee23392dd875b2436dda9ffdaa1438a561` |
| M79+ | `series_ready` | `d5ca2d5d86d85be49048db4c693dd02728bfca38db976eeb2d3ad004e4b43dfc` |
| M96 | `series_ready` | `97fbcce50c0232870bde743bbf7d5d125f6e1a218516c244f740e44fc1b24243` |

Control selection is study-window-dependent, so the review receipt binds all 393 route artifacts,
not a guessed subset. The full set is the exact control-spine ceiling the complete run can consume.

The refreshed Flatbush scope artifact is 2,638 bytes, SHA-256
`a4fa053e10e1be5853c953ca872c87ae6af2e356e0a30561f79aece5efa1e006`.
It retains the five reviewed geometry IDs and reproduces the same two stable B41 and B67 spine
segments with May source-segment IDs. The source snapshot hashes remain exactly rc26. The complete
review-input artifact is 125,041 bytes, SHA-256
`13fc63b4b5a3ba378a79b7f2b58963c7700282a999cebeb9d5cd6bb808a75b6e`;
it binds engine `segment-matched-did-v2` and policy `plan074-admission-v1`.

## Complete non-authorizing review

Three independent awaiting-cut builds are byte-identical. The 1,295,550-byte artifact SHA-256 is
`6ca946c9dfd0ba624337caa99214273369bb6e88e73fb0647d58eec0715b9c02`.
The complete worksheet has 484 `REVIEW_REQUIRED` rows, remains deliberately non-authorizing, and
has SHA-256 `f9413bdb021d04962def7c09ec11030f5d162f97eae47ced4dc61a31eac8a21a`.

The reconciliation reviewed each candidate exactly once against its exact current spine artifact,
calendar, scope admission, onset/phase/conflict facts, and unchanged rc26 semantics. Because every
route artifact belongs to the new outcome cut, all 484 rows were freshly adjudicated and no old
decision was silently transferred. The non-authorizing reconciliation SHA-256 is
`d5b3b4267067ef2b2a70ee7e6319edfc72a572fa8902f8fe88f4959f85cce43e`:

- recommendations: 9 approve for estimator admission, 475 reject;
- exact delta from rc26: B60 and B68 change from rejected to recommend-approve;
- B60/B68 each have exact 2025-12-08 day onset, `single_phase`, no earlier same-route ACE onset,
  no conflict, trusted route-wide ACE registry scope, a ready spine, and 6 pre/5 post months;
- M57 has the same exact occurrence and 6 pre/5 post months but remains rejected solely because its
  fresh spine still needs pattern review;
- the six other mechanically eligible but rejected ACE rows remain later-phase quarantines with
  exact earlier same-route onsets;
- the seven rc26-approved rows remain recommend-approved after fresh scope, spine, and calendar
  review.

The strict v4 receipt has SHA-256
`13be429629a0eeea241a841ed3a7362ed85fa88b9108fc4b53363bd1570a297c`. It contains exactly 484
unique, non-blank decisions: 9 approvals and 475 rejections. The rc26/v3 receipt remains immutable,
cannot decode as v4, and cannot bind this `reviewCutId`. The approved event set has SHA-256
`89e1d58d06a57034eddb77f926040d88731120acc86d7e819427068acb037aab`.

## Approved estimator result

Isolated B60 and B68 runs were followed by one complete nine-study run and an exact same-root
repeat. Both complete manifests contain 19 JSON outputs and hash to
`de8e9eecc32ff924aa0c7e5c01a094de7d90ff2ca3e49287937881677559c0ef`; the focused and complete B60
and B68 files are also byte-identical.

- B60 is a `gated_estimate`, `no_detectable_change`: -0.0360 mph (-0.5024%), 95% interval
  [-0.1098, +0.0462], 16 treated segments, 135 controls, and all gates pass.
- B68 is `descriptive`, `no_detectable_change`: -0.0087 mph (-0.1116%), 95% interval
  [-0.1018, +0.0727], 12 treated segments, 135 controls. Its sole failing gate is the placebo:
  -0.1269 mph exceeds the 0.0872 mph interval half-width.
- M57 remains rejected solely because the unchanged fresh spine is `needs_pattern_review`.
- The complete index contains nine studies, three gated estimates, six descriptive comparisons,
  and six no-detectable-change results. Every ineligibility, lane fallback, and scope-error counter
  is zero.

The three gated automated-bus-lane-enforcement studies are BX38, BX9, and B60. Their signed relative
effects are -0.0300%, +2.1014%, and -0.5024%; Plan 076's prescribed median transfer is therefore
-0.0300087582%. This meets the written count floor but is explicitly not evidence of a positive
transferable benefit.

The complete result-specific review and exact rc26 deltas are in
`docs/research/reviews/review-cut-5298f37aac8780666c742f7d/anchors-report.md`. The operator's latest
authorization closes the anchor stop for this immutable cut. The 21 study, rollup,
approved-event-set, index, and anchor objects were subsequently published under the new immutable
review-cut prefix and verified byte-for-byte. Existing stable production study keys remain rc26
because overwriting any published object is forbidden. The exact release receipt is
`docs/research/reviews/review-cut-5298f37aac8780666c742f7d/publication-report.md`.

## Queued producer member-extent follow-on

The completed producer handoff records a 484-row readiness bridge: 7 frozen approved, 321
source-fixable bus-lane identity gaps, 83 source-fixable member-extent gaps, 45 Tracker
spine/pattern cases, 8 Tracker calendar cases, and 20 later-ACE quarantines. Its extent companion
has 308 occurrence × route × member rows (306 eligible): 2 `route_wide`, 9 `bounded_segment`, and
297 unresolved. The pinned future-input manifest hashes are:

- readiness: `0b07f6e9b134ba9b8ec15278ab07a4ff2cb5fec27669b01208a911d8469b9192`;
- extent: `bfc505e3233b4cedfa8964dbfdcbf11a3d0bd984ed78048bfc456c3a737375b2`;
- overlay: `3509abde0c7330fcfa30b7d5dd210cf4d1a7acf9a820c9c0103b536db4dc15e2`.

After this outcome-only gate, a separate consumer migration must import and verify the producer
member-extent companion, preserve `treatment_record_id` through candidate construction, include
the companion manifest/projection hashes and member resolutions in a new candidate-universe
identity, generalize scope bindings to candidate + occurrence + route + member, and require a fresh
complete approval receipt. It must not replay rc26 decisions. That work is cross-cutting and is not
silently included in this review cut.
