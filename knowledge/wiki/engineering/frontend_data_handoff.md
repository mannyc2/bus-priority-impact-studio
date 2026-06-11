---
title: Frontend Data Handoff
type: engineering
status: active
last_updated: 2026-05-26
owner: codex
source_count: 5
tags: [frontend, design-handoff, api, data-contracts, studio]
---

# Frontend Data Handoff

## Why this matters

This page translates the broader [[wiki/data/public_facing_data_catalog|Public-Facing Data Catalog]]
into page-level guidance for frontend design, refactors, and API planning.

Use it when updating Studio pages so design choices stay aligned with the evidence that can be
shown honestly. The question for each page is not only "what does the current endpoint return?"
but also "what user-facing data exists or could be surfaced with a small API/projection change?"

## Design status legend

| Status | Meaning for design |
|---|---|
| Use now | Current Studio API and projections support this field or panel. |
| Add with API work | Data exists in D1/R2/generated artifacts, but needs endpoint or projection wiring. |
| Add with pipeline work | Public source or local pipeline path exists, but serving projection work is needed. |
| Show unavailable | The product need is valid, but the source is missing or not good enough. |
| Do not show | The data is raw/private/internal or would imply unsupported precision. |

## Page Guidance

### Routes Home

Use now:

- Route label, SBS badge, corridor name, route slug, public route list.
- Observed average speed, scheduled-comparison delta, average calendar-day riders.
- Constrained flags for ACE, DOT bus-lane geometry match, and TSP snapshot status.
- Low lane-overlap filters and route search/autocomplete.

Add with API work:

- Route-score/source explainer for why the list is ordered.
- Route-level peak-period fields if the route/hour speed or ridership windows are promoted to
  `StudioRoute`.

Show unavailable or omit:

- Week-over-week decline language until a real comparator is exposed.
- Stop-level boarding filters.
- Official borough geography filters unless route-boundary joins are added.

Labeling notes:

- Use "Observed avg speed," not "weighted avg speed," unless a ridership-weighted metric is
  actually returned.
- Use "Average riders/day" only when the tooltip explains monthly boardings divided by calendar
  days.

### Route Detail

Use now:

- Header identity, endpoint labels, route miles, stop count, peer route.
- Observed speed, speed percentile with peer-universe context, trend sparkline.
- Observed reliability block with run/provenance labels.
- Slow segment list over observed timepoint-to-timepoint segments.
- Segment scheduled speed, rider-hours of delay, slow-share by hour, lane overlap, ACE route
  coverage, TSP snapshot status.
- Route artifact refs, source/data notes, and curated intervention timeline records.

Add with API work:

- More visible immutable evidence resolver links for charts and source rows.
- Route-level reliability detail panels from scheduled baseline plus observed GTFS-RT rows.
- Deferred map/evidence panels that load after the route shell.

Show unavailable or omit:

- Stop-level boarding panels until APC/Bus OD data exists.
- Segment passenger-load claims.
- Current installed TSP claims beyond the dated 2017 source.
- Causal intervention impact language unless the evaluation method permits it.

Labeling notes:

- Say "route-slice delay exposure" or "rider-hours of delay," not "passenger load."
- Say "DOT route-shape lane overlap," not "bus lane mileage."
- Show TSP match method when TSP appears on a segment or treatment record.

### Route Ladder

Use now:

- Ordered segment ladder from generated route-slice segment evidence.
- Segment geometry preview, slow share, observed/scheduled speed gap, rider-hours, lane/TSP/ACE
  treatment glyphs.
- Sparse public segment notes when present.

Add with API work:

- Richer evidence drawer for selected segment using evidence catalog resolver IDs.
- Map-heavy geometry deferral and cross-viewport visual audit.

Show unavailable or omit:

- Stop-pair boardings.
- Per-segment ACE violation counts.
- Any generated segment note that lacks a source line.

Labeling notes:

- Call the universe "observed MTA timepoint segments" where space allows.
- Use tooltips for glyphs; avoid turning method caveats into body prose unless the user has opened
  the detail panel.

### Compare

Use now:

- Descriptive route-vs-route comparison over observed speed, route-slice delay exposure, lane
  overlap, reliability where available, and public-route percentile context.

Add with API work:

- Compare-specific cohort explanations and data-quality panels.
- Trend windows from longer route-level performance sources once ingested.

Show unavailable or omit:

- Causal control-route language.
- Synthetic 24-hour claims derived from sparse sparklines.

Labeling notes:

- "Peer" is descriptive unless a matched cohort method is present.
- Keep "comparison-adjusted, not causal proof" language near intervention deltas.

### Findings

Use now:

- Finding feed and detail pages.
- Reviewed/promoted findings when available.
- Detector-backed review candidates with detector, evidence, confidence, caveat, and review
  provenance.
- Reasoning trail: observed behavior, treatment inventory, expected behavior, gap, conclusion.

Add with pipeline work:

- Source-gap findings.
- Larger reviewer/gold-set coverage and calibrated confidence.
- More context detectors over 311, permits, parking, traffic, weather, and equity.

Show unavailable or omit:

- Unreviewed candidate findings styled as approved claims.
- Free-form "AI says" panels.

Labeling notes:

- Use the `◆` glyph only as evidence attribution, following
  [[wiki/project/ai_interaction_model|AI Interaction Model]].
- Prefer "review candidate" or "generated finding" when not approved.

### Briefs And Composer

Use now:

- Brief gallery, generated/public route briefs, brief detail, split evidence page, split history
  page.
- D1-backed draft creation, metadata edit, claim add/edit/delete, evidence search, validation,
  review request, publish-candidate creation/export, and retraction.
- Brief generation job polling with deterministic fallback or hosted runner when configured.

Add with API work:

- Better reviewer/workflow semantics beyond current operator-role model.
- Richer export manifests and resolver UI for immutable artifacts.
- Deferred evidence/history loading in route loaders.

Show unavailable or omit:

- Treat generated release history as if it were human editorial version history.
- Direct public promotion from a normal user page request.
- Unsupported causal or policy recommendation copy.

Labeling notes:

- Distinguish `Generated`, `Published`, `Draft`, `In review`, `Approved`, and
  `Publish candidate`.
- Keep generated brief claims tied to evidence IDs and caveats.

### Search

Use now:

- Grouped results for routes, findings, and briefs.
- Route autocomplete over route labels, IDs, corridor names, and route metadata.

Add with API work:

- Evidence catalog search results.
- Methods/docs search results from generated docs metadata.
- Context/source results once those resources have public IDs.

Show unavailable or omit:

- Global chatbot search or request-time LLM answers.
- Raw source capture search unless snippets have public source refs and permissions.

### Methods And Docs

Use now:

- Dataset cards, metric definitions, caveats, glossary, public source credits.
- Docs endpoint metadata and response examples generated from OpenAPI/runtime schemas.
- Release facts such as baseline month, current signal month, route/brief/finding counts, and
  source-ref counts where present.

Add with API work:

- More granular changelog and per-endpoint data-family coverage.
- Generated docs for a future CLI or SDK surface.

Show unavailable or omit:

- Hand-authored example payloads that do not parse against current schemas.
- Rate-limit/auth/CLI claims unless implemented.

Labeling notes:

- Methods pages should explain what is measured and what is unavailable without pipeline jargon.
- Data credits should say source refs, not citations, unless there is a human-readable citation
  payload.

### Account And Authenticated State

Use now:

- Current actor/session profile and Studio scopes for composer permissions.
- Public identity/profile records where account pages use them.
- Saved alert/search/comment records where corresponding UI exists.

Add with API work:

- Clearer permission and workspace affordances for review/publish workflows.

Do not show:

- Admin/operator role grant controls in general public routes.
- Private tokens, raw session state, or internal idempotency keys.

## Refactor checklist

Before changing a page:

1. Identify every visible field and map it to the public data catalog.
2. Mark each field as use-now, API-work, pipeline-work, unavailable, or do-not-show.
3. Confirm the field has a source/provenance label, quality caveat, or empty-state decision.
4. Check `knowledge/wiki/engineering/synthetic_data_inventory.md` for fields that need relabeling.
5. If a new field is needed, add or update the `packages/domain` Studio schema before wiring UI.
6. If the data exists but is not served, design the endpoint/projection against
   [[wiki/engineering/web_api_endpoint_architecture|Web API Endpoint Architecture]] and
   [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]].
7. If the source does not exist, render an honest unavailable state or substitute a named proxy.

## Copy rules for data status

Use these labels consistently:

| Situation | Preferred wording | Avoid |
|---|---|---|
| Route/hour ridership used for segment delay exposure | Route-slice delay exposure, rider-hours of delay | Segment boardings, stop loads |
| DOT bus-lane geometry joined to route shape | DOT route-shape lane overlap | Official bus lane mileage |
| Dated TSP source | 2017 TSP status snapshot | Current TSP coverage |
| Detector candidate finding | Review candidate, detector-backed candidate | Approved finding |
| Generated route brief | Generated brief | Published editorial brief |
| Peer route by observed-speed proximity | Descriptive peer | Control route |
| Missing source | Unavailable, source gap, no public source yet | Coming soon without a caveat |

## Sources

- [[wiki/data/public_facing_data_catalog|Public-Facing Data Catalog]]
- [[wiki/engineering/website_data_support_audit|Website Data Support Audit]]
- [[wiki/engineering/synthetic_data_inventory|Synthetic Data Inventory]]
- [[wiki/engineering/web_api_endpoint_architecture|Web API Endpoint Architecture]]
- [[wiki/project/ai_interaction_model|AI Interaction Model]]
