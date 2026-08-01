# 0023 - Atomic serving release pointer

Date: 2026-08-01

Extends: ADR-0022.

## Status

Accepted.

## Context

The public Worker historically elected Studio, exact-route, map, and R2 state
independently. Plan 097 safely caught production up within that same contract,
but its bounded recovery could not make a later artifact-contract change
atomic. The production D1 migration ledger also differs truthfully from a
clean bootstrap after reviewed direct recovery of migrations 0032-0034.

The resolved-transit public pack introduces new logical artifacts. Publishing
those aliases independently would permit one request to observe D1 from one
reviewed cut and R2 from another.

## Decision

1. One singleton compare-and-swap pointer selects an immutable serving release;
   its release selects one content-derived candidate across D1 and R2.
2. Candidate identity excludes wall-clock timestamps, local paths, and the
   provenance-only source commit. Explicit builder/schema versions and logical
   output hashes carry semantic code changes.
3. Generated D1 projections are candidate-scoped. Auth, user, and independently
   refreshed current-signal rows are never release-scoped and survive pointer
   activation and rollback unchanged.
4. Public R2 bodies use hash-bearing immutable keys. A release-qualified public
   URL resolves only an active or retained-public release; ready-but-unpublished
   candidates are not anonymously addressable.
5. Activation and rollback are the same one-statement CAS pointer transition.
   They never reseed, restore, swap a database binding, or use D1 Time Travel.
6. The legacy D1 stream is frozen as clean-bootstrap history. All forward
   production changes use `migrations/d1-v2`, the distinct
   `bp_d1_migrations_v2` ledger, and a tracked byte-checksum manifest. Production
   applies only v2; local bootstrap tests apply legacy then v2.
7. A request resolves the pointer once. Every repository and artifact lookup
   receives that resolved candidate/release context; dynamic public endpoints
   cannot select a candidate or release.

## Consequences

- Candidate staging is additive and retryable while the active cut remains
  byte-identical.
- The first pointer adoption mirrors the existing Plan 097 production cut as
  baseline A and preserves its release identity.
- Every contract cutover proves A→B→A→B with immutable receipts before the
  release is considered complete.
- Legacy fallback is legal only while the pointer is still generation zero and
  null. Plan 101 removes that bounded compatibility code after the first live
  pointer release.
