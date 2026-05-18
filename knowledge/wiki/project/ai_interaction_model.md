---
title: AI Interaction Model
type: project
status: active
last_updated: 2026-05-18
owner: codex
source_count: 0
tags: [ai, llm, ux, findings, briefs]
---

# AI Interaction Model

## Core Thesis

AI in Bus Priority Impact Studio is not a chatbot layer. It is a constrained evidence-shaping
subsystem inside a route evidence brief builder.

The product promise remains:

> Pick a route. See where it fails, who is affected, what interventions exist, and whether the
> evidence supports action.

LLMs help prepare evidence for judgment. They do not replace the analyst, recommend policy, invent
metrics, or provide a global "Ask AI" surface. The interface can be conversational in behavior, but
it should be visually richer than chat: findings, reasoning trails, claim seeds, caveats, source
notes, and composer drafts.

The user-facing rule is:

> The AI does the preparation, but the analyst feels they did the work and learned something.

## Product Rule

Every AI output must become a Studio artifact, not a free-form reply.

Allowed output forms:

- finding card or finding detail with reasoning trail;
- route diagnosis strip;
- segment note;
- claim seed;
- brief claim draft;
- caveat;
- reviewer note;
- source-note candidate;
- document-claim candidate;
- review question.

Do not add:

- global "Ask AI" entry points;
- chat threads or chat bubbles;
- "AI says..." framing;
- robot, sparkle, or gradient AI branding;
- LLM-generated policy recommendations;
- request-time metric computation by an LLM.

## Where AI Lives

| Surface | LLM role | Trigger |
|---|---|---|
| Brief composer | Draft claims, attach evidence, propose caveats, suggest reviewer notes | Explicit generation for long tasks; on-demand edits inside the composer |
| Route Detail diagnosis strip | Explain why observed route behavior diverges from the treatment-stack expectation | Proactive summary, with progressive expansion for ranked drivers |
| Findings | Draft 5-step finding artifacts from deterministic detector output for anomalies, treatment gaps, emerging risks, and source gaps | Precomputed feed; analyst opens reasoning trail and judges |
| Segment rows | Provide short anomaly notes or claim seeds for a selected segment | Progressive inline reveal |
| Annotate to brief handoff | Pre-populate the composer with claim seeds from a segment, route, or finding | Subtle contextual affordance |
| Corpus expansion | Extract candidate source notes, document claims, entity links, and review questions | Offline or pipeline-side candidate generation |

## Where AI Does Not Live

- Home search. Route lookup and autocomplete are deterministic over the route/search index.
- Top-level navigation. No global AI button.
- KPI calculation, route ranking math, source freshness, row counts, joins, and table rendering.
- Public request handlers for heavy analytics or source probing.
- Policy or intervention recommendations. The product surfaces evidence, not directives.
- Causal claims unless the deterministic evaluation method supports them and the methodology gate
  allows the wording.

## Interaction Triggers

Use all three trigger styles, chosen per surface:

| Trigger | Use |
|---|---|
| Proactive | AI-derived evidence is already present when useful, such as a diagnosis strip or finding feed. |
| Progressive | Deeper reasoning is hidden until the analyst asks for it, such as ranked drivers or segment notes. |
| Explicit on-demand | Long-running work, especially brief generation or regeneration, gets a clear action. |

Explicit "generate" actions are for longer tasks. Small contextual assists should be subtle
affordances, not buttons that summon a chatbot.

## Commit Before Conclusion

The preferred interaction pattern is "commit before conclusion": the analyst chooses a lens,
segment, rank axis, evidence set, or claim before the system reveals the synthesized conclusion.

Examples:

- Route ladder challenge: hide speeds, ask the analyst to identify the worst segment from
  treatments, then reveal measured impact.
- Hotspot ranking: let the analyst choose whether "worst" means rider-hours, severity, decline, or
  treatment gap before reading the top result.
- Brief claims: let the analyst include, exclude, or edit claims and evidence while strength
  recomputes.

Do not overuse forced guessing in routine workflows. The general rule is editorial commitment, not
gamification.

## Canonical AI Output Shape

The finding reasoning trail is the canonical shape for AI-surfaced public evidence:

1. Observed behavior: what was measured.
2. Treatment inventory: what is in place.
3. Expected behavior: what comparable routes or prior windows suggest.
4. Gap identified: what diverges.
5. Conclusion: the narrowest defensible inference.

Every public finding also needs:

- source line or evidence reference for each step;
- confidence label;
- caveat block;
- comparable routes or sanity-check context when available.

New AI surfaces should reuse this structure or explicitly explain why a smaller artifact is enough.
Do not invent a separate "AI panel" layout for prose.

## Visual Conventions

The `◆` glyph is the only public AI attribution mark.

Use it in three contexts:

- proactive strip, such as route diagnosis;
- inline marker on a row or evidence item;
- micro-label in metadata, such as `◆ AI` or `◆ 5 sources`.

AI-generated output should be typeset like evidence, not like a message from a bot. Use the same
fonts, hierarchy, citation pattern, confidence labels, and caveat placement as analyst-authored
content.

## Determinism Gradient

Most of the system remains deterministic.

| Layer | Rule |
|---|---|
| Deterministic | Route ranking, KPI rollups, search, filters, toggles, history/diff, source freshness, joins, rendering, validation |
| LLM with strict shape | Finding artifact drafting from detector output, route diagnosis, brief claim drafts, evidence attachment proposals |
| LLM with bounded loose prose | Segment notes, caveat bodies, claim seed wording, reviewer-note drafts |
| Agentic loop | Only inside brief generation or agent-author composition, with staged claims and accept/edit/reject review |

Generated artifacts must carry enough provenance for audit: input evidence IDs, source or chunk
references, prompt/model version or hash, generated time, validation status, and rejection/skipped
state when applicable.

## Implementation Pointers

Existing UI and contracts should be reused:

- `apps/web/src/components/AIDiagnosisStrip.tsx`
- `apps/web/src/studio/pages/finding-detail.tsx`
- `apps/web/src/studio/pages/findings-feed.tsx`
- `apps/web/src/studio/pages/brief-workflows.tsx`
- `apps/web/src/studio/pages/route-annotate.tsx`
- `apps/web/src/studio/pages/route-ladder.tsx`
- `packages/domain/src/studio-schemas.ts`

Related wiki pages:

- [[wiki/engineering/web_api_endpoint_architecture|Web API Endpoint Architecture]]
- [[wiki/engineering/web_app_support_plan|Web App Support Plan]]
- [[wiki/engineering/agent_author_api|Agent-Author API]]
- [[wiki/engineering/llm_wiki_rag|LLM Wiki + RAG Layer]]
- [[wiki/analysis/finding_coverage_and_corpus_expansion|Finding Coverage and Corpus Expansion]]
