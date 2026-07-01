# Plan 028: MTA-wiki work orders (cross-repo requests)

> **This is not an executable plan for this repo.** It is the bus product's
> requirements list for `/mnt/models/dev/mta-wiki`, written 2026-07-01 from a
> consumer-side audit. Execute these **in the mta-wiki repo, under its own
> AGENTS/CODEX rules** (immutable specs, submission journals, canonical
> materialization). An agent working in mta-wiki should read this file plus
> the bus-side contract (`packages/domain/src/studio/route-evidence.ts` and
> `tools/pipeline-v2/src/commands/studio/import-mta-wiki-route-evidence.ts`)
> before starting. Nothing here authorizes editing mta-wiki's immutable
> `docs/immutable-mta-llm-wiki-spec.md` or raw source captures.

## Status

- **Priority**: P2 (order 1 below is P1 — it gates the bus repo's plan 020
  hardening and plan 024's confidence)
- **Owner**: the mta-wiki repo (this repo only consumes)
- **Consumer state assumed**: mta-wiki at 2026-07-01 — 84,040 canonical
  records / 11 kinds, 2,567 sources, 98,102 submissions, validate clean.
- **ADOPTED 2026-07-01**: mta-wiki turned these orders into its plan of
  record, `/mnt/models/dev/mta-wiki/docs/v1-release-plan.md` (orders 1→Phase
  1, 2+3→Phase 2, 4→Phase 3a/3c, 5→Phase 3d, 6→post-v1), with a
  data-quality release gate (Phase 4) added on top. Executors work from that
  plan; this file remains the consumer-side requirements record. The release
  will additionally ship `route_anchors.jsonl` (exact GTFS-route → canonical
  record mapping) — when it exists, the bus importer's alias heuristics and
  the `--wiki-release` pinning become bus-side follow-ups under plan 020's
  maintenance notes.

## Why this matters

Generation 3 makes mta-wiki *the* document-evidence backend for the public
bus product (plans 016/020/024 delete the in-repo Tier 2 system in its
favor). The consumer-side audit found the corpus strong and governance real,
but five specific frictions land directly on the bus importer today, and the
integration currently reads a live working directory rather than a versioned
release — the one architectural smell in the seam.

## Work orders, ranked

### 1. Versioned snapshot releases (P1)

`data/exports/canonical-jsonl/<timestamp>/` exists but is manual and
unversioned. Wanted: a `bun run export:release` that writes per-kind JSONL +
a manifest (`release_id`, semver or date tag, per-kind counts and sha256,
generator commit) to a stable path, and a documented "latest release"
pointer. The bus importer then pins a release id instead of reading
`data/canonical/` live, making bus builds reproducible and rerunnable.
Acceptance: two consecutive exports with no intervening submissions are
byte-identical; the bus importer can resolve `--wiki-release <id>`.

### 2. Route canonicalization pass (P1)

319 route records: 302 `true_route`, 8 `split_candidate`, 8
`aggregate_list_context`, 1 `data_only_scope`, and 10 with null
`route_id`; variants like B44 appear as 4 records (local/limited/SBS/BRT).
Wanted: a documented rule for which record is the canonical page-anchor per
operating route (or an explicit `canonical_route_record_id` relation), and
dispositions for the 10 null-route_id records (proposal/experimental scope
labels are fine — just make them machine-readable). The bus importer
currently guesses via alias normalization; it should not have to.
Acceptance: for every GTFS bus route id, zero-or-one canonical wiki route
record resolvable without heuristics.

### 3. Empty-payload cleanup (P2)

~220 canonical records carry `payload: {}` (219 of them routes). They are
unusable downstream and depress match/coverage counts. Wanted: fill from
sources where evidence exists, else retire with a recorded reason.
Acceptance: `select count(*) from records where payload = '{}'` ≈ 0, or
each survivor carries an explicit `payload_pending` marker.

### 4. Published relation-family taxonomy (P2)

The bus importer hard-codes knowledge of `route_scope`,
`treatment_context`, `timeline_context`, `metric_context`, `claim_context`.
Wanted: a machine-readable taxonomy export (family → subject/object kinds,
semantics, assertion-status vocabulary) so consumers validate against the
wiki's own contract instead of a copied list. The in-flight
assertion-status cleanup (unknown → delivered/planned/proposed, 8,727 →
6,372 and falling) directly improves bus timeline quality — finishing it is
part of this order. Acceptance: taxonomy file in the release manifest;
relation `assertion_status: unknown` below ~10% for route-scoped families.

### 5. Single normalized date per record (P3)

Records carry `date_text` / `date` / `year` inconsistently; the bus timeline
wants one sort key. Wanted: runner-authored `date_normalized` (ISO) +
`date_precision` (day/month/year/unknown) on events and projects in the
export, preserving verbatim `date_text`. Never synthesize precision that the
source doesn't state. Acceptance: every event/project in a release export
has the pair, with `unknown` as an honest value.

### 6. Relation-resolved route export (P3, nice-to-have)

Today the bus importer does route matching + one-hop graph walking itself
(~its whole complexity). If the release export included a per-route bundle
(route record + resolved one-hop facts + citations), the bus importer
shrinks to schema validation + projection. Only worth doing after orders
1-2; the bundle shape can copy the bus contract
(`StudioRouteEvidenceBundle`) minus bus-specific keys.

## What the bus repo does in return

- Pins releases (order 1) and deletes its live-directory fallback.
- Reports importer-side match/omission stats per release back into
  `LOG.md`-able form (the `omittedAmbiguousRecordCount: 147` class is
  wiki-actionable signal).
- Keeps its importer read-only and out of mta-wiki's package graph, as
  plan 016 established.

## STOP conditions (for the mta-wiki-side executor)

- Any order conflicting with the immutable spec — the spec wins; report
  back instead.
- Route canonicalization tempting you to merge records that sources treat
  as distinct services — variants are evidence, not errors; the ask is a
  canonical *anchor*, not destructive merging.
- Backfilling dates or payloads beyond what cited evidence supports.
