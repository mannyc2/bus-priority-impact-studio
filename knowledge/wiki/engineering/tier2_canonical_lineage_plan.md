---
title: Tier 2 Canonical Lineage — unify extracted → reviewed → serving
type: engineering
status: proposed_rev3_full_corpus
last_updated: 2026-06-07
owner: claude
tags: [tier2, lineage, reconciliation, intervention-records, projection, plan]
---

# Tier 2 Canonical Lineage Plan (rev 3)

Operationalizes the standing next-action in [[wiki/data/tier2_document_corpus]]:
*"Backfill the full-corpus reviewed intervention-record layer."* Rev 2 incorporated a
code-grounded audit (responses table below). **Rev 3 corrects the foundation:** qv8–qv10 is a
repair subset, not the corpus.

## Rev 3 correction — qv8–qv10 is a repair subset, not the corpus

A queue-set audit showed qv1–qv7 cover the full corpus (**6,095 windows / 283 sources**); qv8–qv10
is a **repair subset** (1,374 windows / 178 sources) fully contained in it, leaving **4,721 windows /
105 sources that exist only in qv1–qv7**. So `canonical-merge-qv8-qv9-qv10` is the recovered *tail*,
not the extracted corpus. The earlier "use qv8–qv10 only" framing is dropped: **account for qv1–qv10,
don't rerun it** — import what is clean, supersede with qv8+, quarantine/selectively-retry what is dirty.

This reuses existing machinery (verified): the merge is parameterized
(`agentic-canonical-merge --self-heal-plans <list>`), and qv1–qv7 already have `queue.json` + shards +
audits, so their self-heal plans build from existing artifacts (**no re-extraction**). The merge's
existing precedence — clean-candidate-per-window, later-clean-wins, later-failure-never-displaces-earlier-clean,
all-dirty→unresolved — *is* "import clean / supersede with qv8+ / quarantine the rest." The qv-series share
one contract (`promptVersion tier2-agentic-extraction-v1`, `schemaVersion 1`); qv7→qv8 changed only the
`payloadSchemaId` namespacing, not the structure — so early outputs are import-compatible.

This replaces rev 2's "Phase 1 — re-key qv8–qv10 surfaces." Everything downstream (graduation, vocab,
dispositions, record builder v2, serving) is unchanged but now runs on the **full qv1–qv10 corpus**, and
must be re-pointed off the qv8–qv10-only artifacts. Reconciling the *old human-reviewed 36-source run* is
demoted to an optional later migration (the corpus is now built from qv1–qv10, not from that run).

## Audit responses (rev 1 → rev 2)

| # | Finding (verified) | Resolution in rev 2 |
|---|---|---|
| P0-a | `docs tier2 intervention-records` is **LLM synthesis** over `ocr-markdown-candidates.json` (`_intervention-records.ts:775,789`), not a deterministic projector over canonical surfaces. | Phase 4 no longer reuses that command. New **deterministic record-candidate builder** over qv8–qv10 surfaces (the LLM reading was already done + cited by the agentic harness). Explicit fork for the synthesis/identity step: deterministic-merge first, in-policy **cited-LLM** resynthesis only where identity is ambiguous (§Policy). |
| P0-b | `bp.document_intervention_record.v1` is `.strict()`; persists only `recordId/sourceId/recordKind/evidenceCandidateIds/extraction` (`intervention-records/index.ts:327`). `documentId`/`routeResolutionTier` would fail parse. | Lineage lives in a **new contract** — `bp.document_intervention_record.v2` (additive: `documentId`, `routeResolutionTier`, `evidenceSpanRefs`, `sourceDisposition`). v1 stays untouched. Lower-diff alternative noted: a separate `tier2-lineage-wrapper-v1` keyed by `recordId`. |
| P1-c | `extractedReviewedOverlap` is computed from raw `sourceId` booleans (`_tier2-source-coverage.ts:377`); no crosswalk input. | Phase 0 now **instruments the audit**: add `--source-crosswalk`, fold sourceIds to `documentId`, and compute overlap + reconciliation on `documentId`. The audit is only an oracle *after* this. |
| P1-d | Record evidence refs use old IDs (`document_evidence:…:ocr_markdown:…`); qv8–qv10 use `agentic-…:surface…`. Source crosswalk ≠ evidence crosswalk. | New records built from qv8–qv10 cite surface IDs **natively** (no crosswalk needed for the new layer). A separate **evidence-span crosswalk** (`documentId+page+contentHash/quote → surfaceId`) is its own phase, used only to migrate the 36-source human-reviewed records, with explicit ambiguity handling. |
| P1-e | "Reviewed sources → 175" conflates review disposition with record existence; some sources validly yield zero interventions. | Success metric changed to **review receipts**: every extracted source has either ≥1 record OR an explicit `sourceDisposition` (`no_actionable_intervention` / `supporting_context_only` / `suppressed`). Audit counts the two separately. |
| P2-f | `_event-route-resolution` consumes `document-derived-surfaces-v1/events.jsonl`+`entities.jsonl` (`_event-route-resolution.ts:13,76`), not qv8–qv10 `normalizedAcceptedSurfaces`. | Added **Phase 1.5 resolver adapter**: project qv8–qv10 surfaces into the events/entities shape (or add a native entrypoint). No claim of plug-and-play reuse. |
| P2-g | Local `pipeline.sqlite` is blocked by a Drizzle migration-journal mismatch (`tier2_operational_date_extraction_review.md:194`); route resolution + D1 touch it. | Promoted to a hard **Gate G0** before any sqlite-touching phase (1.5/2/6). No destructive rebuild. |

## Thesis (unchanged, audit-confirmed)

Reconciliation, not recall. ~15,925 surfaces / 175 sources extracted; only 19 sources usable,
because `extractedReviewedOverlap = 0` (extracted vs reviewed are different runs with disjoint
sourceIds). Build one keyed lineage over existing artifacts; **no full page re-run.** Verified
counts that hold: 1,339 canonical windows, 35 unresolved, 15,925 surfaces, 18,529 detector-feature
rows, 151 route bundles, 175 source-coverage rows, 1,960 unresolved review items.

## Policy: where the LLM is and isn't (made explicit per P0-a)

- The **agentic qv8–qv10 extraction already did the LLM reading**, with per-field evidence handles.
  Building records from those surfaces is **deterministic grouping/projection** — no new LLM call.
- Facts (dates/routes/numbers/geo) resolve through deterministic resolvers only.
- **The one place an LLM may re-enter** is record *synthesis* when deterministic intervention-identity
  is ambiguous (which surfaces across pages describe the same intervention). There it runs as
  **extract-with-citation + deterministic validation**, flagged as an explicit LLM step — never
  ungrounded fact inference. Phase 4 defaults to deterministic-merge and escalates only the residual.

## Outcome (definition of done — corrected)

- Audit (now `documentId`-aware) reports `extractedReviewedOverlap > 0` and `reconciliation.*Unmatched → 0`.
- **Every extracted source has a review receipt**: ≥1 v2 record OR an explicit `sourceDisposition`.
  (Not "175 record-bearing sources.")
- New records parse 100% against **v2**; every record's `evidenceSpanRefs` resolve to a canonical
  surface natively; lineage fields (`documentId`, `routeResolutionTier`) present.
- Serving read models consume the v2 layer; D1 verify passes.

## Non-goals / constraints

No new OCR/backlog extraction (Phase 7). No ungrounded LLM facts. No new hosted infra (TS-only).
Heavy work in `tools/pipeline-v2` writing artifacts. Don't edit `knowledge/raw/`; don't make the
static homepage numbers data-driven.

## Phases

```
G0 (DB gate) ─▶ 0 (crosswalk + audit instrumentation)
        └▶ 1 (canonical surfaces) ─▶ 1.5 (resolver adapter) ─▶ 2 (fact projection)
              ─▶ 3 (noise gate + dispositions) ─▶ 4 (deterministic record builder, v2)
                    ├▶ 4.5 (evidence-span crosswalk: migrate human review)   [fork]
                    └▶ 5 (review-tail triage, parallel)
              ─▶ 6 (serving + close-out)
7 deferred.
```

### Gate G0 — Local DB health (was a risk; now a gate)
Reconcile the Drizzle migration journal or point at a known-good migrated DB before Phase 1.5/2/6.
No destructive rebuild. **Verify:** a no-op `route intervention-evaluation` (or equivalent) runs
against `pipeline.sqlite` without the journal-replay error.

### Phase 0 — Source crosswalk + audit instrumentation
- Build `tier2-source-crosswalk-v1.json`: every run's `sourceId` → canonical `documentId`, keyed on
  normalized `finalUrl` (+ `rawArtifactKey`/content-hash fallback for drift/recaptures). Hand-reconcile
  the 11 named unmatched (`reviewedSourcesUnmatched` 7 + `promotedSourcesUnmatched` 4).
- **Add `--source-crosswalk` to `audit tier2-source-coverage`**; fold sourceIds to `documentId`;
  recompute `extractedReviewedOverlap` + reconciliation on `documentId`.
- **Verify:** crosswalk resolves all 11 named unmatched; instrumented audit reports overlap > 0;
  every captured source → exactly one `documentId` (orphans logged, not silently dropped).

### Phase 1 — Construct the full canonical corpus (qv1–qv10)
- **1a.** Build self-heal plans for qv1–qv7 via `docs tier2 agentic-self-heal --queue <run>/queue.json`
  (reads existing shards/artifacts/audits; **no re-extraction**). Each plan is the window-level inventory:
  clean / dirty / blocked / missing-audit per window.
- **1b.** `docs tier2 agentic-canonical-merge --self-heal-plans <qv1,…,qv10 ordered>` → one
  `canonical-merge-qv1-qv10-v1.json`: clean early windows imported, qv8+ repairs supersede, all-dirty →
  unresolved/quarantine.
- **1c.** Re-key accepted surfaces to `documentId`+page → `tier2-canonical-surfaces-v1`.
- **1d.** Re-point downstream (raw-field-graduation, vocab-synthesis, consumer-index, materialized-views)
  off the qv8–qv10 artifacts onto the qv1–qv10 merge.
- **Verify:** merged window/source counts ≈ **6,095 / 283** (vs the 1,339 tail); report
  clean-imported vs qv8+-superseded vs unresolved/quarantine counts; every accepted surface has
  `documentId`+page+≥1 evidence handle. Targeted retries are allowed but must emit a self-heal plan that
  feeds *this* merge (no parallel lineage).

### Phase 1.5 — Resolver adapter (new, per P2-f)
Project `normalizedAcceptedSurfaces` → the `events.jsonl`/`entities.jsonl` shape `_event-route-resolution`
expects (or add a native surface entrypoint). **Verify:** adapter output validates against the resolver's
input contract on a fixture; row counts reconcile.

### Phase 2 — Deterministic fact projection (gated on G0)
`rawPayload → canonicalPayload` (additive; raw never mutated): dates → `parseOperationalDate`+`classifyOperationalDate`;
routes → `_event-route-resolution` via adapter (+ `routeResolutionTier`); numbers → numeric/source-stated;
geography → gazetteer; `statusRaw` → strict enum map; descriptive (13 keys) → graduation map.
**Verify:** `canonicalPayload` for all deterministic fields; unresolved → `normalization.unresolvedFields[]`;
date-precision + route-link rate reported, now cited per-field (improves the 8,428-assertion baseline that
lacked date provenance).

### Phase 3 — Noise gate + source dispositions (per P1-e)
Apply the source-family veto (meeting/outreach/planning/design-milestone) + corridor-validated route gate at
the surface→record boundary. Assign each extracted source a `sourceDisposition` when it yields no record.
**Verify:** realized-vs-milestone split reported (baseline 82% `non_operational_milestone`); B65/Utica-class
route-level positives gone; every extracted source has a record or a disposition.

### Phase 4 — Deterministic record-candidate builder → v2 (per P0-a, P0-b)
New builder: group `event_candidate`/`treatment_component`/`service_change_candidate` surfaces by
`documentId` + a deterministic intervention-identity key (routeSet + corridor + treatmentFamily + date window),
project `canonicalPayload`, carry `evidenceSpanRefs` to source surfaces → `bp.document_intervention_record.v2`.
Synthesis fork: deterministic identity-merge first; **escalate only ambiguous clusters** to cited-LLM
resynthesis + validation (§Policy). **Verify:** v2 records parse 100%; every `evidenceSpanRef` resolves to a
Phase 1 surface; identity-merge collision/ambiguity counts reported; escalated fraction logged.

### Phase 4.5 — Evidence-span crosswalk (fork: preserve human review)
To not discard the 36-source human-reviewed dispositions, map old record evidence refs
(`document_evidence:…:ocr_markdown:…`) → qv8–qv10 surfaces via `documentId+page+contentHash/quote`, carrying
each old record's review decision forward as a v2 `sourceDisposition`/receipt. Ambiguous matches → review queue,
not auto-merged. **Decision to make:** migrate (this phase) vs re-review from scratch. **Verify:** matched/ambiguous/unmatched
counts; no human decision silently dropped.

### Phase 5 — Review-tail triage (parallel)
Decide disposition for the 612 `review_only` raw fields + 1,960 `unresolvedReviewQueue` items
(graduate/parse/preserve/drop) as a recorded table, then apply. **Verify:** queue shrinks; every decision recorded.

### Phase 6 — Serving + close-out (gated on G0)
Project v2 records → `publishable-interventions-by-route` / `route_timeline_index`; re-run both audits.
**Verify:** `extractedReviewedOverlap > 0`, `reconciliation.*Unmatched → 0`, every extracted source has a receipt;
D1 verify passes; a spot-check route page renders v2 records with working source links.

### Phase 7 — Incremental backlog extraction (deferred)
Only after 0–6: extract the ~192-source `ocrDerivedNotVerified` gap through the clean pipe, by intervention
density (SBS/BRT/busway/TSP over board books/videos); cited-extraction-or-escalate for coarse dates. MTA
meeting PDFs/videos stay out of scope.

## Open forks to decide before building
1. **Record synthesis** (Phase 4): deterministic-identity-merge only, vs deterministic + cited-LLM escalation for ambiguous clusters. *(Recommend: deterministic-first, escalate the residual.)*
2. **Human-review preservation** (Phase 4.5): migrate the 36-source dispositions via evidence-span crosswalk, vs re-review from the new layer. *(Recommend: migrate the unambiguous, queue the rest.)*
3. **Lineage schema** (P0-b): `…record.v2` (lineage first-class) vs `tier2-lineage-wrapper-v1` (lower diff). *(Recommend: v2 — lineage is the whole point.)*

## Verification defaults
`bun run check:types` scoped per package; `bun --filter @bp/pipeline-v2 test`; one fixture-backed command per
phase; instrumented `audit tier2-source-coverage` + `audit tier2-structured-data` as the funnel oracle.

## Smallest first slice
Phase 1a + 1b: build the qv1–qv7 self-heal plans and run the **qv1–qv10 canonical merge** — no
re-extraction — and report the true corpus inventory (clean-imported / qv8+-superseded / unresolved).
That replaces the qv8–qv10 tail with the real corpus and quantifies exactly how much is clean vs needs
quarantine/retry, before any projection or lineage work.
