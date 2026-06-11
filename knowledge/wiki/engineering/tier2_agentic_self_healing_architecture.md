---
title: Tier 2 agentic self-healing architecture
type: engineering
status: active
last_updated: 2026-06-05
owner: codex
tags: [tier2, llm, extraction, self-heal, audit]
---

# Tier 2 Agentic Self-Healing Architecture

The Tier 2 agentic extraction harness should recover from known failure classes without hiding
data-quality risk. Self-healing is runner-owned: the model may use tools and resubmit drafts, but
the runner classifies outcomes, decides whether another attempt is allowed, records the policy, and
quarantines anything that cannot be made safe by deterministic validation.

## Why this exists

The qv7/qv8 runs showed that a one-shot full corpus run is the wrong abstraction. Many qv7 windows
failed because of provider 503/504 responses or missing forced-tool responses, not because the
source window was unextractable. A temp-1 qv8 retry recovered many accepted surfaces from the qv7
tail, but provider failures and small schema/evidence mistakes still remained. The correct system is
an audit-driven loop, not manually named qv queues.

## Lanes

Every shard receives exactly one primary lane:

- `clean` means the manifest, artifact, and audit exist; audit blockers are zero; final drafts have
  no rejected rows or validation issues.
- `pending_or_in_progress` means no manifest exists yet and no worker error is present. Live pools
  should wait, not schedule another run.
- `worker_retry` means the local worker failed or wrote an incomplete shard.
- `provider_transient_retry` means the final attempt or audit shows provider failure, usually 429,
  502, 503, or 504. Retry is allowed with bounded attempts and provider request ids preserved.
- `tool_response_retry` means the model/provider returned no parseable forced-tool response. Retry
  is allowed with stricter forced-tool feedback.
- `validator_feedback_retry` means the model produced drafts, but deterministic validation/audit
  rejected part of the output. Retry is allowed with prior validation feedback as context.
- `source_tool_enrichment` means the row needs filesystem/PDF/search transcript evidence, most often
  for missing-data or absence claims. The next attempt must provide source tools, not just OCR
  handles.
- `quarantine` means the failure is not covered by an automatic policy. Preserve all paths for human
  or schema review.

## Runner Loop

1. Run a bounded worker pool over a queue.
2. Build a self-heal plan from `queue.json`, shard manifests, artifacts, audits, claims, and worker
   errors.
3. Wait on `pending_or_in_progress` shards until the current pool drains.
4. Create the next retry queue from retry-eligible lanes only.
5. Change one policy dimension at a time where possible: provider, temperature, concurrency, repair
   rounds, or source-tool availability.
6. Stop when the plan has no retry-eligible shards, or when retry budgets are exhausted.
7. Publish only clean rows; route all source-tool and quarantine lanes to review.

## Retry Budgets

Provider failures are not evidence failures. They get bounded retries with adaptive concurrency.
If provider failures dominate completed shards, the next run should reduce concurrency or switch
provider rather than simply doubling workers. Tool-response failures get a small number of prompt
repair attempts. Validator-feedback failures should include the prior audit/validation feedback,
but still require a fresh deterministic pass before acceptance.

## Artifact Contract

The self-heal plan is an artifact, not console output. It records source queue, source run id, next
run settings, lane counts, issue/http counts, retry window ids by lane, and per-shard paths to the
manifest, artifact, audit, claim, and worker error. This makes later qv runs reproducible and lets
downstream audits ask why a row was accepted, retried, enriched, or quarantined.

Current implementation entrypoint:

```sh
bun --filter @bp/pipeline-v2 cli -- docs tier2 agentic-self-heal --queue <queue.json> --output <plan.json>
```

## Non-goals

- Do not silently coerce invalid model output into accepted surfaces.
- Do not infer canonical ids or missing-data claims without deterministic support.
- Do not retry pending live shards in a second pool.
- Do not treat source-stated agency metrics as Studio-computed metrics.
