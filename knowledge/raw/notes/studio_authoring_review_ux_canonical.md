---
title: Studio Authoring & Review UX — Canonical Design & Implementation Gap
type: source-note
last_updated: 2026-06-01
source: Claude Design handoff (claude.ai/design)
---

# Studio Authoring & Review UX — Canonical Design & Implementation Gap

> Source-reading note (not an LLM-wiki page). It records the canonical brief **authoring + review**
> UI/UX from the Claude Design handoff and the gap between that design and what the backend +
> frontend support today — i.e. what can start now, what must be scoped down, and what must be
> built before the full canonical flow is real.
>
> **Captured bundles** (gitignored, local-only) live under
> `knowledge/raw/downloads/design-handoffs/`:
> - `02-canonical/bus-priority-impact-studio/` — **canonical** (second handoff).
> - `01-superseded/bus-priority-impact-studio/` — first handoff, superseded (its only unique file
>   is a scratch `authoring-review.html` we wrote).
>
> All `project/*.jsx` paths below are relative to the canonical bundle root
> (`…/02-canonical/bus-priority-impact-studio/`). Pairs with the backend plan at
> `knowledge/wiki/engineering/studio_brief_draft_authoring_worker_plan.md` and
> `docs/decisions/0014-brief-draft-live-write-serving.md`.

## Design sources

Canonical prototype files (read top-to-bottom before implementing the matching surface):

| Surface | Design file | Key components |
| --- | --- | --- |
| Send to brief | `project/authoring-v2.jsx` | `RF_SendToBrief`, `DestRow`, `AV2_DESTS` |
| Composer | `project/authoring-v2.jsx` | `RF_ComposeBrief`, `ComposerTopBar` (now with a `tools` slot), `StreamingFigure`, `SelectedText`, `Block`/`GutterMark` |
| Insert from the corpus | `project/authoring-v2-corpus.jsx` | `CorpusPalette`, `RF_CorpusPalette`, `CORPUS_OPTIONS`, 6 `Preview*` primitives |
| Review (reviewer) | `project/authoring-v2-review.jsx` **(new)** | `RF_BriefReview2`, `MadisonBriefBody`, `RvAnchor`, `RvCommentCard`, `BriefPeople` (review variant) |
| Resolve / triage (author) | `project/authoring-v2-review.jsx` **(new)** | `RF_BriefTriage`, `RvTriageCard` |
| Shared collaboration atoms | `project/authoring-v2-review.jsx` | `useHistory`, `ChromeUndoRedo`, `BriefPeople` (review + share), `RvAvatar`, `RvFigurePin` |
| Brief primitives (figures) | `project/brief-primitives.jsx` | `InlineMetric`, `EmbedSegmentCard`, `EmbedBeforeAfter`, `EmbedHourFigure`, `EmbedProjection`, `EmbedDataLineage`, `EmbedFinding` |
| Design system / tokens | `project/system.jsx` | `BPI` palette, `RouteBadge`, `StudioBar`, `Spark`, `HourBars`, `Button` |
| Brief reading (analyst / public) | `project/route-first.jsx` (`RF_Brief`), `project/brief-public.jsx` (`RF_BriefPublic`) | reading views authoring produces |

Intent lives in the chats: **chat22** (authoring v2 converged) and **chat23** (Send-to-brief refine,
then the review/triage refactor + undo/redo + Share). Of the 23 chats, only **chat23** changed
between the two bundles.

## The canonical flow (what we are building)

One thesis, carried across every surface: **AI works through purposeful design, not a chat box**;
the brief is **one editable editorial column**; **the figures on the page ARE the evidence** (no
shelf, no scores). Banned from the canonical v2 authoring/review flow (retired from the v1 brief
workflow surfaces): strength bars, "3 ev · 2 cav" counts, claim scoring, drag-to-reorder, tabbed
evidence inspectors, chat turns.

1. **Send to brief** (`RF_SendToBrief`) — a universal capture sheet meant to live on *every object
   in the studio* (slow-segment cards, findings, metrics, charts). Previews the captured object and
   routes it to a **new or existing** brief. Replaces the retired `route-annotate.tsx` annotation
   page.
2. **Composer — "the brief writes with you"** (`RF_ComposeBrief`) — the composer *is* the published
   reading view. You edit real prose; AI streams the matching primitive in as a real figure (quiet
   ◆ gutter mark, ghosted proposal, ⏎ to accept). Now also carries **undo/redo** (`ChromeUndoRedo`
   in the top bar's `tools` slot, driven by `useHistory`) and a **Share** control (`BriefPeople`
   `share` variant: access levels Owner / Can edit / Can comment, invite row, link access, copy
   link).
3. **Insert from the corpus** (`CorpusPalette`) — the single unified AI surface. Pre-selects a ◆
   BEST MATCH at the cursor, type-to-filter, ⏎ takes it. Each row is a crafted miniature preview of
   the figure it will insert (segment / hour / before-after / lineage / finding / projection).
4. **Brief outputs** — `RF_Brief` (analyst cited-narrative + claims) and `RF_BriefPublic`
   (published, public-facing).
5. **Review** (`RF_BriefReview2`, reviewer POV) — the brief reads exactly as authored; **comments
   pin to phrases in the prose** (right margin), expand into threads, and can be plain **comments**
   OR **suggested edits** (from→to). Carries an **Approve / Request-changes** workflow and
   **reviewer assignment** (`BriefPeople` review variant: "N of M reviewed" + assign popover).
   Resolving is undoable.
6. **Resolve / triage** (`RF_BriefTriage`, author POV) — the same brief as a resolve queue.
   **Accept** a suggested edit and it lands in the prose (green); **resolve/dismiss** a comment and
   it collapses; a progress meter **gates "Resubmit for review"** until all open items are cleared.
   Undoable; items can be reopened.

**Versioning is deliberately lightweight: undo/redo only.** An autosave-scrubber + version-diff
screen was built and then **retired** at the user's direction ("auto save history is bad… maybe
just undo/redo"). The old `RF_BriefReview` (per-claim comments) and `RF_BriefHistory` (claim diffs)
remain on the canvas only as **retired** reference.

## The core architectural tension — content model

This is the decision that gates everything and must be made first.

- **Backend persistence is claims.** A draft is `{ title, dek, summary, version, claims[] }` where a
  claim is `{ n, title, body?, strength, evidenceIds[], caveatIds[], state }`
  (`packages/domain/src/studio-schemas.ts:282`). Evidence is a flat catalog of
  `{ id, kind: number|chart|source|caveat, title, detail }` (`:228`) that the brief projection ships;
  claims only **reference** `evidenceIds` — they cannot mint new evidence.
- **The design is a single flowing editorial document** — §-numbered prose, inline metric chips,
  embedded figures, and (in review) **comments/suggestions pinned to arbitrary text ranges**
  (`MadisonBriefBody` anchors: `m53`, `slowest`, `peak`, `figure`, `additive`). There is no claim
  number anywhere in the review model.

These do not map cleanly. Reconciliation options:

- **(A) Map design onto claims (recommended for MVP).** Treat each claim as a section: `title` =
  heading, `body` = editable prose; figures render from `evidenceIds` resolved against the brief's
  evidence catalog. Honest to the backend, data-driven, no schema change. Cost: not pixel-literal —
  figures sit per-claim, not at an arbitrary caret; prose-range anchoring (for review) is
  approximate.
- **(B) New block/document model.** Persist an ordered list of blocks (heading / paragraph / figure)
  with stable IDs that comments can anchor to. Faithful to the design (esp. review), but a new
  schema, new endpoints, and a new ADR. Out of scope for a first build.

## What the backend supports today

All write ops require auth (`bp_session` magic-link → operator role, workspace-scoped) and an
`Idempotency-Key` header. Source: `packages/domain/src/studio-openapi.ts`,
`apps/web/src/worker/index.ts`. Paths below are the real public API paths, including the
`/api/v1` prefix.

| Endpoint | Method | Scope | Backs |
| --- | --- | --- | --- |
| `/api/v1/studio/briefs` | GET | public | brief gallery |
| `/api/v1/studio/briefs/{id}` | GET | public (+draft overlay if authed in workspace) | reading view |
| `/api/v1/studio/briefs/{id}/evidence` | GET | public | evidence catalog |
| `/api/v1/studio/briefs/{id}/history` | GET | public | reads **R2 projection**, not D1; no diffs |
| `/api/v1/studio/briefs/{id}/draft` | PATCH | `write:briefs` | title/dek/summary/status |
| `/api/v1/studio/briefs/{id}/draft/generate` | POST | `write:briefs` | records a failed generation job while no runner exists; response is `status: "failed"` + `error`, with `draft.jobLlmStatus: "not_configured"` |
| `/api/v1/studio/briefs/{id}/draft/claims` | POST | `write:briefs` | add claim |
| `/api/v1/studio/briefs/{id}/draft/claims/{n}` | PATCH / DELETE | `write:briefs` | edit / delete claim (auto-renumber) |
| `/api/v1/studio/briefs/{id}/draft/validate` | POST | `write:briefs` | deterministic score (weak claims / missing evidence) |
| `/api/v1/studio/briefs/{id}/draft/review` | POST | `review:briefs` | requires an existing draft; one draft-level `{ message }` note; status → `in_review` |
| `/api/v1/studio/briefs/{id}/draft/publish` | POST | `publish:briefs` | marks `publish_candidate` (does **not** promote) |
| `/api/v1/studio/briefs/{id}/draft/retract` | POST | `publish:briefs` | status → `retracted` |
| `/api/v1/studio/briefs/{id}/draft/publish-candidate-export` | GET | `publish:briefs` | export payload |

Client wrappers already exist for every mutation in `apps/web/src/studio/api-client.ts`.

## What needs implementing before the full canonical flow

### Backend gaps (new endpoints / models required)

| Capability the design assumes | Status | Needed for |
| --- | --- | --- |
| **Create a brief** (`POST /api/v1/studio/briefs`) | ❌ none (collection is GET-only) | Send-to-brief "New brief"; `/briefs/new` |
| **Mint evidence / figures** (`POST /api/v1/studio/briefs/{id}/evidence`) | ❌ none (GET-only) | Send-to-brief capture; insert-from-corpus inserting a *new* figure rather than re-citing one |
| **Prose-anchored comments** (ranges, threads, replies) | ❌ none (review is one flat `{message}`) | Review screen |
| **Suggested edits** (from→to) + **accept-into-prose** | ❌ none | Review + Resolve |
| **Approve / Request-changes** workflow states + **reviewer assignment** | ❌ none (`approved` is just a status string; no assignment) | Review |
| **Access / sharing roles** (Owner / Can edit / Can comment) + link access | ❌ none | Composer Share control |
| **AI generation runner** ("brief writes with you", best-match) | ❌ no runner configured; generate records a failed job with `draft.jobLlmStatus: "not_configured"` | Composer streaming, corpus best-match |
| **Publish → public promotion** | ❌ candidate-only | shipping a brief |
| Version diff / history API | ✅ not needed — design retired the diff screen; versioning is client-side undo/redo | — |

### Frontend gaps

**Reuse (data-viz atoms + tokens already in the app):** `RouteBadge`, `Spark`, `HourBars`,
`BeforeAfter`, `KPI`, `SegmentRow`, `ChartFrame`, `AIDiagnosisStrip`, `Cite`, `Heatmap`,
`MapThumb`, the shadcn `ui/*` suite, and the full `BPI` token palette already ported to
`apps/web/src/global.css` as `--bp-color-*` / spacing / radii. **Do not reuse the v1 banned
chrome in any new v2 authoring/review surface**: `StrengthBars`, `ClaimList`/`ClaimRow`
evidence/caveat counts, and the tabbed `EvidenceInspector`. These still exist in legacy/current
routes while those surfaces are being ported; the rule is that v2 should replace them, not carry
them forward.

**Build new:**
- Editorial composer surface (real prose editing; `SelectedText` format/AI toolbar; ◆ gutter marks).
- React ports of the **embed figure primitives** (`EmbedSegmentCard`, `EmbedBeforeAfter`,
  `EmbedHourFigure`, `EmbedProjection`, `EmbedDataLineage`, `EmbedFinding`) + `InlineMetric`,
  rendered **from data** (no hardcoded `AV2_MADISON_SPARK`-style arrays).
- `CorpusPalette` (insert-from-corpus) over a real corpus source.
- `RF_SendToBrief` sheet (gated on backend — see decisions).
- Review margin + anchored comments (`RvAnchor`, `RvCommentCard`) and the triage queue
  (`RvTriageCard`) + progress/gated resubmit.
- `BriefPeople` (review + share variants), `ChromeUndoRedo` + a `useHistory` equivalent.

**Refactor / retire existing pages:** `brief-workflows.tsx` `BriefComposerPage` (v1 3-rail →
v2 composer); `BriefReviewPage`/`BriefHistoryPage` (v1, currently local-only/hardcoded → new
review/triage or retire); `route-annotate.tsx` (retired → replaced by Send-to-brief). Routes touched:
`/briefs/$briefId/{edit,review,history}`, `/briefs/new`.

**Constraints:** respect the bundle budget — **165 KB gzipped entry / 300 KB total**
(`apps/web/scripts/check-bundle-budget.ts`); TanStack auto code-splits routes; beware the
documented gotcha where an eager route `head`/`loader` importing a *value* from a component module
pulls the whole module into the initial bundle.

### Decisions needed before building

1. **Content model** — (A) map to claims for MVP vs (B) new block/document model. *Recommend A.*
2. **Send-to-brief scope** — defer (Composer + Corpus first) / constrained (add-claim to existing
   brief only, no new-brief / no new-evidence) / grow backend first. *Recommend defer.*
3. **Review depth** — thin (draft-level note, backed today) vs the full anchored-comment model
   (needs the backend above). The canonical design is the full model.
4. **AI "best match" / streaming** — deterministic picker over the brief's evidence + route-derived
   figures now (honest, no fake data), real AI later once a runner exists.

## Recommended build sequence

- **Phase 0 — decisions above** (esp. content model).
- **Phase 1A — existing-draft composer MVP.** Use option A (claim-as-section): edit an existing
  draft's title/dek/summary and claim title/body/evidence references against the existing evidence
  catalog. This slice is backed today by draft metadata, claim CRUD, validation, and
  `GET …/evidence`. It does **not** include arbitrary caret-placed figures, new evidence, AI
  best-match, streaming prose, or the full review model.
- **Phase 1B — data-driven figure primitives.** Port `EmbedSegmentCard`, `EmbedBeforeAfter`,
  `EmbedHourFigure`, `EmbedProjection`, `EmbedDataLineage`, `EmbedFinding`, and `InlineMetric` as
  React components rendered from real brief/evidence data. These power composer rendering, corpus
  previews, and reading views.
- **Phase 2 — constrained Insert-from-corpus.** Build a deterministic picker over existing
  brief/route evidence and route-derived figure candidates. It can re-cite existing evidence without
  backend work; inserting newly minted figures/evidence requires the evidence-mint backend above.
- **Phase 3 — Send-to-brief**, after `POST /api/v1/studio/briefs` + evidence-mint exist (or ship
  the constrained existing-brief/add-claim version).
- **Phase 4 — Review + Resolve**, after the collaboration backend (anchored comments, suggestions,
  workflow, assignment, sharing) exists.

## References

- `knowledge/wiki/engineering/studio_brief_draft_authoring_worker_plan.md` — the backend that landed.
- `knowledge/wiki/engineering/studio_design_pass_status.md` — per-page design-pass status (brief-lifecycle row).
- `knowledge/wiki/engineering/web_api_endpoint_architecture.md`
- `knowledge/wiki/engineering/ui_copy_doctrine.md`
- `docs/decisions/0014-brief-draft-live-write-serving.md`
