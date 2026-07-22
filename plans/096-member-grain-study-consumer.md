# Plan 096: Member-grain study consumer and fresh reviewed universe

## Status

- **State**: IN PROGRESS
- **Priority**: P0
- **Effort**: L
- **Depends on**: Plans 074 and 075; MTA Wiki member-extent bridge and its
  immutable unpromoted release candidate
- **Authority**: operator authorization in the originating Tracker task to
  implement, completely review, receipt, push, and merge this consumer cut

## Outcome

Consume the MTA Wiki operational-occurrence member-extent companion at exact
occurrence × route × treatment-member grain. Preserve stable study-event IDs,
but create a new candidate-universe identity bound to exact producer release,
occurrence, relationship, and member-extent lineage. Bind the unchanged May
2026 outcome/spine snapshot through a distinct review cut only after its bytes
remain equal and all physical-scope bindings are rebound at member grain.

This plan authorizes estimator admission decisions only. It does not authorize
a study run, publication, D1 mutation, production pointer change, or deploy.

## Contract boundary

1. Import the explicitly named member-extent manifest and verify every listed
   byte count and SHA-256. Require exact parity with the pinned operational
   occurrence payload. Never read `LATEST` or the forecast-realized overlay.
2. Preserve treatment-member IDs and attach the exact producer member rows to
   each Wiki candidate. Candidate IDs remain stable; the new
   `candidate-set-v4` identity includes the full rows and reserved
   `memberExtentLineage` manifest/projection receipt.
3. Keep the analysis boundary separate. `study-review-cut-v1` continues to
   bind candidate universe, analysis month, outcome snapshot, speed spines,
   exact physical-scope binding receipt, engine, and review policy.
4. Generalize bounded physical-scope bindings to candidate + occurrence +
   analysis route + producer route record + treatment-member + extent ID.
   Missing, duplicate, route-only, occurrence-only, family-only, stale-member,
   component, projection, or producer-lineage mismatch fails closed.
5. A route-wide producer extent needs no geometry binding. A bounded extent
   resolves only bounded-scope identity and still needs exact geometry/spine.
   Unresolved, stop-set, mixed, or heterogeneous members remain ineligible.
6. Require a fresh v5 receipt with exactly one decision per candidate. Legacy
   v3/v4 receipts never authorize this universe; historical v3 artifacts and
   bytes remain unchanged.

## Execution

1. Land strict Effect Schema contracts, import/candidate/review/scope builders,
   CLI commands, deterministic tests, worksheet support, and lifecycle docs.
2. Wait for the producer task to provide exact release ID, generator/merge
   commit, release manifest SHA-256, occurrence payload receipt, member-extent
   manifest/projection receipts, and clean-clone determinism receipt.
3. Import only those immutable pins. Build the complete candidate universe and
   deterministic repeat. Rebind unchanged May scope geometry only where the
   old binding resolves exactly one unchanged bounded treatment member.
4. Prove the committed May outcome/spine receipts byte-equal before reuse;
   otherwise create a fresh snapshot. In all cases the new scope receipt and
   candidate universe produce a new review-cut ID.
5. Reconcile every candidate exactly once against candidate-set-v3 and the May
   receipt. Transfer only byte/exact-fact-equal decisions. Re-adjudicate every
   changed member, calendar, phase, pattern, overlap, or scope fact. Q45/Q86/Q87
   gain only the member-extent fact. B41 and M57 retain their independent
   pattern failures unless unchanged rules actually pass; all later ACE phases
   remain quarantined.
6. Create the authorized complete v5 receipt, repeat the build, run focused and
   comprehensive verification, commit, push, open a ready PR, merge after CI,
   and verify `origin/main` without running deploy/publication workflows.

## Acceptance criteria

- [ ] Strict import verifies exact producer release and every member companion
      file; mutable pointers and forecast overlays are absent from inputs.
- [ ] Candidate-set v4 is deterministic, retains exact treatment-member IDs,
      includes member-extent lineage, and preserves stable event IDs.
- [ ] Member scope v2 rejects every under-specified or stale binding and admits
      only exact route-wide or exact bounded evidence at member grain.
- [ ] Review-cut v5 binds outcome, spine, scope, engine, and complete candidate
      universe; legacy receipts and incomplete/duplicate decisions fail.
- [ ] Existing rc26/v3 bytes and tests remain unchanged.
- [ ] Fresh complete reconciliation records exact decision deltas and explicit
      Q45/Q86/Q87, B41, M57, and later-ACE outcomes.
- [ ] Deterministic rerun and comprehensive verification pass; PR merges
      without study execution, artifact publication, D1 mutation, or deploy.

## STOP conditions

Stop rather than guess if producer pins are incomplete, mutable, or do not
verify; occurrence/member parity differs unexpectedly; a historical binding
cannot resolve one exact member; May outcome/spine bytes differ; any candidate
is not reviewed exactly once; or completion would require study execution,
publication, D1 mutation, production deployment, weakened evidence gates, or
reopening settled Plan 083 decisions.
