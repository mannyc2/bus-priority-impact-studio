---
title: Tier 2 Extraction Best Practices
type: engineering
status: active
last_updated: 2026-06-07
owner: codex
tags: [tier2, extraction, normalization, vocabulary, canonical-merge, best-practices]
---

# Tier 2 Extraction Best Practices

This page records the issues found during the qv1-qv10 Tier 2 reconciliation and the rules future
Tier 2 extraction runs should follow. It is intentionally operational: use it before launching any
new extraction queue, repair queue, or projection pass.

## Verified issues from qv1-qv10

### Queue lineage was easy to misread

qv1-qv7 were the broad corpus extraction. qv8-qv10 were a repair subset, not a new/full corpus.
Treating qv8-qv10 as the corpus tail undercounted the real extracted inventory and would have
projected from only the repaired subset.

Best practice: every extraction wave must carry an explicit queue role:

- `full_corpus`
- `repair_subset`
- `targeted_backfill`
- `validation_canary`

Every downstream projection must start from a canonical merge artifact, not from a queue folder or a
hand-picked tail.

### The inner raw structure was not fully consistent

The agentic surfaces share the same broad accepted-surface contract, but category-like raw fields
were not stable enough across all accepted PDFs and queue waves. In particular, `eventFamily` was
introduced late enough that usable family-like source values appeared under several aliases:
`eventFamily`, `eventFamilyRaw`, `family`, `familyRaw`, `eventKind`, `eventKindRaw`, `eventType`,
and `eventTypeRaw`.

The same pattern appears outside events: future projection should expect key-specific raw aliases,
not one canonical raw path, unless the extraction prompt has already enforced the path.

Best practice: before projection, run raw-field graduation against the canonical merge and inspect
source paths per graduation key. Do not assume the prompt's preferred field path is the only path
used by earlier queues.

### Open vocabulary debt was larger than the event-family bug

After the manual event-family/subtype/treatment overlay, event keys had zero missing projection
rows. The remaining qv1-qv10 missing-projection debt was elsewhere:

| key | missing projection fields |
| --- | ---: |
| `entityRole` | 6,986 |
| `metricFamily` | 5,379 |
| `metricSubjectFamily` | 5,135 |
| `entityKind` | 2,429 |
| `claimResearchUseTag` | 1,955 |
| `contextKind` | 1,609 |
| `questionKind` | 1,544 |
| `claimKind` | 1,392 |
| `metricUnit` | 640 |
| `tableKind` | 546 |

Best practice: do not declare a Tier 2 extraction "normalized" because one prominent field family is
fixed. Report missing projection by key and distinguish `missing_projection`, `preserve_raw`, and
explicit `unresolved`.

### Missing source fields are different from unmapped raw values

There were 43 event candidates with no family-like source field. They can be reviewed from label or
raw text, but that is a different policy than projecting from an extracted raw payload field.

Best practice: raw text or display label can produce review suggestions, not projection rows, unless
a documented policy explicitly allows fallback canonicalization from those fields.

### Raw payloads must remain immutable

The successful repair pattern was additive:

- preserve the extracted `rawPayload`;
- build projection rows over selected raw field values;
- write canonical values to `canonicalPayload`;
- put quarantined fields in `normalization.unresolvedFields`.

Best practice: never mutate raw payload fields to make downstream normalization easier. Fix the
projection layer or create a new extraction run with a new contract.

## Future extraction rules

### Before launching a queue

1. Record the queue role, intended source universe, source count, window count, prompt version, and
   schema version.
2. Decide whether the queue is allowed to supersede earlier queues. Repair queues should supersede
   only matching source/page windows through canonical merge precedence.
3. Use the current extraction prompt contract's field-name table. If a new raw categorical field is
   added, list its backward-compatible aliases in this page or the queue runbook before launch.
4. Keep high-entropy names and labels separate from category fields. For example, a project title or
   street label should not be used as `entityKind` unless the intent is really a class.

### During extraction

1. Emit stable raw category fields for every surface kind that owns them.
2. Emit source-stated values as raw strings; do not collapse labels to a canonical vocabulary inside
   the LLM pass unless the vocabulary is supplied explicitly.
3. Carry per-field evidence handles wherever possible. Category fields without support are still
   usable for quarantine, but publication-grade claims need support.
4. Keep unknowns explicit. Prefer absent field or `unknown` over inventing a bespoke class label.

### Immediately after a queue finishes

1. Build or refresh self-heal plans for every queue participating in the corpus.
2. Run `docs tier2 agentic-canonical-merge` over the ordered self-heal plans.
3. Run `docs tier2 raw-field-graduation` against the canonical merge.
4. Build a residual debt report before expanding the corpus again.
5. Run direct projection-index checks for each key being declared complete.

### Before expanding to another corpus slice

The current slice should have:

- a canonical merge inventory: clean, superseded, dirty/quarantined, unresolved;
- a raw-field graduation artifact for the exact canonical merge;
- a vocabulary projection artifact;
- an application summary with `targetConflictCount = 0`;
- a residual debt report split by key and decision;
- a documented decision for any rawText/displayLabel fallback policy.

Only then expand to the next queue or source universe.

## Recommended overlay order after qv1-qv10 event repair

1. `metric_vocab_overlay_v1`: `metricFamily`, `metricSubjectFamily`, `metricUnit`.
2. `entity_vocab_overlay_v1`: `entityRole`, `entityKind`.
3. `narrative_surface_vocab_overlay_v1`: `claimKind`, `claimResearchUseTag`, `contextKind`,
   `questionKind`, `tableKind`.
4. Event quarantine policy review only if product needs to collapse `preserve_raw` event labels or
   canonicalize the 43 review-only no-family event candidates.

This order prioritizes serving usefulness and detector evidence before broad curation labels.

## Verification command pattern

Use the smallest relevant commands, but always include one artifact-backed application check:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 manual-vocab-projection-overlay ...
bun --filter @bp/pipeline-v2 cli -- docs tier2 vocab-surface-apply ...
bun --filter @bp/pipeline-v2 typecheck
```

For any key claimed complete, run a direct projection-index check over the canonical merge and prove
`missingProjection = 0` for that key.
