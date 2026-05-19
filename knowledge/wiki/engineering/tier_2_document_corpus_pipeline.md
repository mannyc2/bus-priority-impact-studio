---
title: Tier 2 Document Corpus Pipeline
type: engineering
status: planned
last_updated: 2026-05-19
owner: codex
source_count: 8
tags: [corpus, documents, findings, llm, pipeline-v2]
---

# Tier 2 Document Corpus Pipeline

## Purpose

Tier 2 is the intervention and policy document corpus from
[[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]].
It should help the Studio explain official interventions, seed recall backtests, and enrich
route/corridor findings without letting prose become the source of metric truth.

The design question is whether to use a wiki compiler pattern, such as
`ussumant/llm-wiki-compiler`, or build a project-specific pipeline. The answer is: borrow the
compiler pattern for synthesis and navigation, but make the detector-facing layer typed,
auditable, and validation-first.

## Decision

Do not adopt a general wiki compiler as the canonical finding-detector input.

Use a two-track architecture:

1. **Human/agent synthesis track**: raw source captures and selected excerpts compile into
   `knowledge/wiki/` summaries and a local/static search index.
2. **Detector track**: the same documents produce structured candidate JSON with source URL,
   document date, chunk/span references, extracted claim type, mentioned entities, confidence,
   and validation state.

Only validated candidate rows can feed deterministic finding detectors, intervention events,
source-gap findings, backtest sets, or public brief evidence.

## Agent Runtime Direction

Use `pi-coding-agent` as the likely local/offline agent harness for Tier 2 extraction experiments,
but treat it as a developer pipeline tool, not as public app infrastructure.

Pi is attractive here because it is intentionally minimal and extensible:

- project-local context files can define repo instructions;
- `.pi/SYSTEM.md` can replace the default system prompt, with `APPEND_SYSTEM.md` for additions;
- built-in tools can be explicitly enabled or disabled;
- extensions can register custom tools, commands, UI confirmations, and event hooks;
- tool calls can be intercepted before execution, which supports path protection and permission
  gates;
- print/JSON/RPC/SDK modes make it possible to embed an extraction run inside a deterministic
  pipeline command later.

The main risk is tool overbreadth. Pi's defaults are useful for coding, but document extraction
should not need arbitrary shell or filesystem mutation. Start with a project-local Pi package that
exposes narrow document tools and leaves broad coding tools off for extraction runs.

Proposed project-local shape:

```text
.pi/
  SYSTEM.md
  APPEND_SYSTEM.md
  settings.json
  skills/
    tier2-doc-extractor/SKILL.md
  prompts/
    extract-document-candidates.md
    validate-document-candidates.md
  extensions/
    tier2-doc-tools.ts
```

For interactive planning/debugging, normal Pi coding sessions can still use the repo's `AGENTS.md`
and read-only filesystem tools. For reproducible extraction, run a constrained mode such as:

```bash
pi --no-tools --no-extensions -e .pi/extensions/tier2-doc-tools.ts \
  --system-prompt .pi/SYSTEM.md \
  -p @data/artifacts/docs/runs/<run_id>/task.md
```

Exact flags may change after a spike, but the design intent is stable: the extraction agent sees
only document chunks, lookup tools, and schema-validating artifact writers.

## Tool Envelope

Tool access should be role-specific. The extraction agent should not get every tool the coding
agent gets.

| Runtime role | Built-in tools | Custom tools | Write scope | Notes |
|---|---|---|---|---|
| Discovery planner | `read`, `grep`, `find`, `ls` | `source_registry_lookup`, `document_backlog_write` | Reviewed backlog only | Used by humans/agents to prepare seeds, not to validate claims |
| Capture/chunk job | none or scripted Bun job only | optional `doc_capture_status` | `data/raw/`, `data/artifacts/docs/` through pipeline code | Prefer deterministic code, not LLM decisions |
| Extractor | none by default | `doc_get_chunk`, `doc_search`, `candidate_write`, `extraction_audit_write` | Candidate JSON artifacts only | No shell, no arbitrary file writes, no wiki edits |
| Entity/link validator | none by default | `route_lookup`, `street_lookup`, `intervention_lookup`, `candidate_validation_write` | Candidate validation state only | Deterministic tool results outrank model rationale |
| Wiki author | `read`, `grep`, `find`, `ls`, maybe `edit` | `candidate_read`, `source_span_read` | `knowledge/wiki/` and `knowledge/log.md` | Only after validation or explicit human review |
| Pipeline implementer | normal repo coding tools | none required | repo code/tests | Separate from extraction runs |

Recommended custom tool contracts:

- `doc_get_chunk(source_id, chunk_id)`: returns text, document metadata, hash, and page/offset refs.
- `doc_search(query, source_group?, limit?)`: lexical search over captured chunks and wiki summaries.
- `source_registry_lookup(source_id_or_url)`: returns known source registry metadata and status.
- `route_lookup(mention)`: returns candidate route IDs from deterministic route catalog matching.
- `street_lookup(mention, borough?)`: returns normalized street/LION/corridor candidates and match confidence.
- `intervention_lookup(route_id?, corridor_id?, date?)`: returns existing ACE/bus-lane/intervention rows.
- `candidate_write(candidate)`: writes only schema-valid candidate JSON to the current run artifact.
- `candidate_validation_write(candidate_id, validation)`: appends validation state, not claim text edits.
- `extraction_audit_write(audit)`: writes model id, prompt hash, source hash, and candidate counts.

Path protection rules for Pi extensions:

- block writes outside `data/artifacts/docs/`, `knowledge/wiki/`, and `knowledge/log.md`;
- block writes to `.env*`, `data/raw/`, migrations, app code, and package code during extraction runs;
- block `bash` entirely for extractor and validator roles;
- when a file mutation tool is added, queue mutations per target path so parallel tool calls cannot
  overwrite each other;
- truncate large outputs and write full outputs to run artifacts with explicit paths.

## System Prompt Shape

The Tier 2 extraction system prompt should be short, strict, and role-bound. It should not read like
a general coding-agent prompt.

Recommended sections:

1. **Role**: "You are the Tier 2 document extraction agent for Bus Priority Impact Studio."
2. **Authority model**: "Document prose can create candidate context, not metric facts. Computed
   speed, reliability, ridership, and effect-size claims only come from deterministic tables."
3. **Tool contract**: "Use `doc_get_chunk`/`doc_search` for source text, lookup tools for entities,
   and `candidate_write` for output. Do not rely on memory for MTA facts."
4. **Extraction target**: enumerate allowed candidate objects and required fields.
5. **Validation states**: `unvalidated`, `validated`, `needs_review`, `rejected`, with a reason.
6. **Citation discipline**: every candidate needs source URL, document date or unknown-date state,
   chunk/span id, and content hash.
7. **No promotion**: the agent cannot mark sources active, publish findings, edit metrics, or make
   public claims.
8. **Uncertainty behavior**: preserve ambiguity as `needs_review`; do not silently normalize weak
   route/corridor/date links.
9. **Output discipline**: write candidate JSON through the tool, then summarize counts and blockers.

Sketch:

```markdown
You are the Tier 2 document extraction agent for Bus Priority Impact Studio.

Your job is to read captured public documents and produce candidate JSON for deterministic
validation. You do not publish findings, promote sources, compute metrics, or edit public briefs.

Use document tools for source text and lookup tools for route/street/intervention candidates.
Never rely on memory for official MTA/DOT facts. Every candidate must include source URL,
document date or unknown-date state, chunk/span reference, content hash, confidence, and
validation state.

Allowed outputs:
- document_source_candidate
- document_claim_candidate
- document_entity_link_candidate
- document_intervention_seed
- review_question_candidate
- llm_extraction_audit

If evidence is missing, ambiguous, or only implied, write a review question or source-gap
candidate. Do not convert prose into a metric claim.
```

## Why Not Just Use a Wiki Compiler

`llm-wiki-compiler` is useful inspiration. Its public README describes a Claude/Codex-compatible
plugin that compiles scattered markdown or codebase knowledge into topic articles, with workflows
for init, capture, compile, ingest, search, lint, and graph visualization. Its codebase mode also
targets knowledge files such as READMEs, ADRs, API contracts, deployment config, and runbooks.

That maps well to this repo's existing persistent wiki pattern:

- `knowledge/raw/` holds source captures and metadata.
- `knowledge/wiki/` holds synthesized pages.
- `knowledge/index.md` is the navigation surface.
- `check:knowledge` and source linting enforce minimum project structure.

But a compiled wiki page is not enough for the findings detector. The detector needs stable,
queryable rows:

- which document made the claim;
- when the document was published;
- what exact span or chunk supports the claim;
- which route, corridor, street, intervention, source dataset, or date was mentioned;
- whether deterministic validation confirmed the entity/date/link;
- whether the statement is official context, a caveat, a methodology note, or a candidate finding.

Use wiki compilation as a reader and author aid. Use typed candidate artifacts as the contract
between documents and detectors.

## Tier 2 Source Order

Start narrow. Tier 2 should reduce a known missed-finding risk, not become a PDF lake.

| Priority | Source group | Primary use | Validation needed |
|---|---|---|---|
| 1 | Dataset dictionaries and methodology pages for active sources | Explain fields, caveats, source lag, and claim limits | Source URL/date, dataset ID, span reference, source registry match |
| 2 | MTA ACE/ABLE pages, press releases, and implementation updates | Official intervention descriptions, route lists, claimed benefits | Route IDs, implementation dates, program name, source span |
| 3 | NYC DOT bus-priority project pages, SBS/BRT pages, Better Buses materials | Corridor/project context and intervention timeline | Street/corridor link, borough, route mentions, project status/date |
| 4 | MTA board and committee materials mentioning bus performance or customer experience | Known-issue and known-intervention recall seeds | Document date, page/chunk reference, route/corridor link, human review flag |
| 5 | Borough bus network redesign docs and implementation schedules | Route change context and schedule caveats | Old/new route alias validation, effective dates, affected route IDs |
| 6 | NYC Streets Plan and DOT annual reports | Citywide milestone context and policy caveats | Year/report date, milestone category, route/corridor specificity |

## Pipeline Shape

Planned commands should live in `tools/pipeline`, with reusable schemas in `packages/domain` and
local storage/repositories in `packages/db`. The public Worker should only see promoted compact
summaries and evidence references.

1. `docs:discover`
   - Read seed URLs from `knowledge/raw/source_manifest.yaml` and a small reviewed backlog.
   - Emit candidate document records with source group, priority, owner, URL, and intended use.

2. `docs:capture`
   - Fetch HTML/PDF/document metadata where permitted.
   - Store content hash, final URL, retrieved timestamp, title, document date when known, MIME type,
     and raw artifact key.
   - Keep large downloads under ignored `data/raw/` or R2. Keep durable metadata and targeted notes
     under `knowledge/raw/`.

3. `docs:chunk`
   - Convert captured documents into deterministic chunks.
   - Each chunk gets a stable `chunk_id`, source hash, character/page reference when available, and
     a short text excerpt for validation.
   - Build a static lexical index first. Vector search is optional later, not a blocker.

4. `docs:extract`
   - Run LLM extraction over chunks into strict candidate JSON.
   - Output candidate source notes, document claim candidates, entity-link candidates,
     intervention seeds, review questions, and an extraction audit.
   - Extraction is allowed to be lossy and conservative. It does not promote claims.

5. `docs:validate`
   - Confirm route IDs against the route catalog.
   - Confirm streets/corridors through street normalization, LION, route-shape joins, or human review.
   - Confirm intervention dates against existing ACE/bus-lane/intervention records when possible.
   - Confirm cited spans by chunk ID/hash and document date.
   - Mark failures explicitly instead of dropping them silently.

6. `docs:promote`
   - Promote validated facts into local pipeline tables:
     - intervention seeds into `local_intervention_event` or a staging table before that;
     - context/caveat rows into source/evidence tables;
     - known corridors into recall backtest fixtures;
     - document evidence refs into finding candidate evidence links.
   - Promote human-readable summaries into `knowledge/wiki/` only after source/date/span review.

7. `docs:index`
   - Generate a small search artifact over validated document cards, wiki summaries, and approved
     excerpts.
   - Publish search artifacts to R2 when needed. Keep D1 to compact doc cards and evidence refs.

## Candidate Contracts

Initial schemas should be strict Zod contracts in `packages/domain`, with fixture-backed tests before
any live extraction job. Candidate rows can be JSON artifacts first; local SQLite tables can follow
once the shape stabilizes.

Recommended candidate objects:

- `document_source_candidate`: source id, URL, title, publisher, document date, retrieved at,
  content hash, source group, intended use, terms note, priority.
- `document_chunk`: source id, chunk id, content hash, page/section/offset reference, text hash,
  excerpt, artifact key.
- `document_claim_candidate`: source id, chunk id, cited span, claim type, extracted text,
  mentioned entities, date mentions, confidence, validation state.
- `document_entity_link_candidate`: mention text, candidate route/corridor/street/intervention ids,
  linker method, deterministic validation status, review reason.
- `document_intervention_seed`: program, intervention type, route/corridor/street refs,
  announced/effective dates, status, source span, validation state.
- `review_question_candidate`: route/corridor/source refs, why it matters, missing deterministic
  evidence, reviewer priority.
- `llm_extraction_audit`: model id, prompt hash, source hash, extraction timestamp, candidate counts,
  validation summary.

## Detector Integration

Documents should enter the future findings detector in three bounded ways.

### 1. Evidence Enrichment

Validated document claims can attach to deterministic finding candidates as supporting evidence,
context, caveat, or methodology references. This likely requires extending
`local_finding_evidence_link.evidence_kind` with a document-source value such as `source_doc`.

The document claim cannot create a metric finding by itself. It can explain why the computed
finding matters or why a caveat applies.

### 2. Recall Backtest Seeds

Validated document mentions should seed a known-corridor and known-intervention set:

- ACE/ABLE rollout routes and dates;
- DOT bus-priority corridors and project phases;
- board-packet mentions of problem corridors;
- bus redesign route changes that affect before/after interpretation.

Backtests then ask whether at least one detector surfaced the relevant route/corridor, whether the
evidence was the right evidence, and whether missing rows became source-gap findings.

### 3. Document-Aware Source Gaps

Some useful outputs are not findings, but source-gap rows:

- official document mentions an intervention, but no validated intervention event exists;
- official document mentions a corridor, but route/street geometry linkage fails;
- official claim implies an effect, but the project lacks enough post-period data;
- board materials mention a route issue, but speed/reliability evidence is missing or stale.

These should write review questions or source-gap finding candidates with `status = open`, not
public claims.

## Storage Split

| Layer | Storage | Rule |
|---|---|---|
| Source registry and durable metadata | `knowledge/raw/source_manifest.yaml`, `knowledge/raw/metadata/` | Small, reviewed, committed when stable |
| Large raw downloads | ignored `data/raw/` or R2 | Never depend on giant committed PDF/text dumps |
| Chunk and extraction artifacts | `data/artifacts/docs/` locally, R2 for published release artifacts | Immutable by source hash and extraction hash |
| Candidate validation state | local SQLite through `@bp/db/local` | Queryable by pipeline and tests |
| Wiki summaries | `knowledge/wiki/` | Human/agent synthesis, not detector authority |
| Public serving | D1 compact doc cards, R2 evidence bundles/search index | No heavy parsing or LLM calls in the Worker |

## Validation Gates

Do not promote a document-derived fact unless it has:

- source URL and final URL;
- retrieval timestamp and content hash;
- document date or explicit `unknown_document_date` state;
- cited chunk/span reference;
- claim type;
- validation state;
- route/corridor/street/intervention link status;
- terms or redistribution note;
- reviewer state when deterministic validation is incomplete.

Metric comparisons still require deterministic metric payloads. Official prose can describe what an
agency said; it cannot supply this project's speed, reliability, ridership, or effect-size values.

## Implementation Order

1. Seed a reviewed Tier 2 backlog of 10-20 documents: ACE/ABLE, one DOT bus-priority page, one bus
   redesign page, one board/committee packet, and methodology docs for active datasets.
2. Spike a project-local Pi runtime with `.pi/SYSTEM.md`, a Tier 2 extraction skill, and a
   `tier2-doc-tools.ts` extension that exposes read-only chunk/search tools plus schema-validating
   candidate writers.
3. Add domain candidate schemas plus fixture tests.
4. Add `docs:capture` for HTML and metadata-only PDF capture.
5. Add deterministic `docs:chunk` and static lexical index output.
6. Add `docs:extract` as an offline artifact generator with strict JSON output and audit metadata.
7. Add `docs:validate` for route IDs, document dates, chunk hashes, and source-registry matches.
8. Add a small recall-backtest fixture fed by validated intervention/corridor seeds.
9. Extend finding evidence links to reference validated document claims.
10. Expose only promoted document cards and evidence refs through Studio projections.

## Open Questions

- Should PDF text extraction be implemented with a Bun/Node dependency, a system binary, or a
  manual metadata-plus-excerpt workflow for the MVP?
- Should document candidate tables be added immediately, or should the first extraction pass stay
  as versioned JSON artifacts until the shape settles?
- What is the minimum human-review state for board-packet claims before they can seed backtests?
- Should a later optional adapter read `llm-wiki-compiler` output, or is this repo's existing
  `knowledge/` structure enough?

## Sources

- https://github.com/ussumant/llm-wiki-compiler - verified_at: 2026-05-19
- https://deepwiki.com/badlogic/pi-mono/4-pi-coding-agent:-coding-agent-cli.md - verified_at: 2026-05-19
- https://raw.githubusercontent.com/badlogic/pi-mono/f3a2c9d0/packages/coding-agent/README.md - verified_at: 2026-05-19
- https://raw.githubusercontent.com/badlogic/pi-mono/f3a2c9d0/packages/coding-agent/docs/extensions.md - verified_at: 2026-05-19
- [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]] - verified_at: 2026-05-19
- [[wiki/data/policy_docs_corpus|Policy and Documents Corpus]] - verified_at: 2026-05-19
- [[wiki/engineering/llm_wiki_rag|LLM Wiki + RAG Layer]] - verified_at: 2026-05-19
- [[wiki/project/ai_interaction_model|AI Interaction Model]] - verified_at: 2026-05-19
