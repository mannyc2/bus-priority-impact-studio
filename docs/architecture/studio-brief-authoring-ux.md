# Studio Brief Authoring UX

Status: **Canonical UX direction** - implementation still in progress
Last updated: 2026-06-01

This note captures the product UX vision for authoring Studio briefs. It sits
beside the backend/content architecture notes:

- `docs/architecture/brief-markdown-primitives.md`
- `docs/architecture/studio-review-collaboration-and-promotion.md`
- `docs/architecture/studio-agent-stack.md`
- `docs/architecture/studio-agent-edit-approval-versioning.md`
- `knowledge/raw/notes/studio_authoring_review_ux_canonical.md`

The short version: authoring is not a form, a chat, or a claim/evidence admin
screen. It is a calm editorial workspace where humans and agents create the same
public brief artifact: prose, evidence figures, refs, review comments, and
publish candidates.

## Product Thesis

The brief is the output of the Studio.

Every authoring surface should feel like working directly on the public object,
not assembling metadata in a side panel. The composer, reviewer surface, triage
queue, and public reader should share the same content model and visual grammar.
When the user is editing, reviewing, or publishing, they should recognize the
same document.

AI is present, but not as a chatbot. It proposes evidence, figures, claims,
caveats, and reviewer notes through designed affordances. The attribution mark is
the quiet `◆` glyph. There are no chat bubbles, robot personas, sparkle branding,
or generic "Ask AI" surfaces in the brief authoring flow.

## UX Doctrine

1. **The document is primary.** The author edits prose in one editorial column.
   The page reads like the public brief while it is being authored.
2. **Figures are evidence.** Evidence does not live in a separate shelf or
   inspector once inserted. It becomes a real inline or embedded primitive in
   the brief.
3. **AI works through objects.** AI output must become a typed artifact: a
   primitive block, claim draft, caveat, source note, reviewer comment, or
   validation repair.
4. **Humans and agents share the same contract.** Anything the web composer can
   do should be possible through the Studio authoring API. Anything an agent can
   do should be visible and editable by a human.
5. **Review is anchored to prose.** Reviewer comments and suggestions pin to the
   phrase, claim, block, or draft they refer to. The author resolves them in the
   same document.
6. **Versioning stays lightweight.** The canonical design uses undo/redo for
   live authoring and review actions. The old autosave scrubber / diff screen is
   not the primary product model, but durable versions are useful at approval
   boundaries such as applied agent proposals, accepted suggestions, and publish
   candidates.
7. **Publishing is deliberate.** The Worker can validate and export a publish
   candidate. Public projection mutation remains an offline promotion step.
8. **Public reads stay self-contained.** Released briefs embed `bodyMd`, typed
   blocks, and refs needed to render the public page. The public reader does not
   resolve draft-private refs.

## Canonical Surfaces

| Surface | UX Role | Required Features |
|---|---|---|
| Send to brief | Universal capture sheet for any Studio object. | Preview captured object; choose new or existing brief; mark the best destination with `◆`; attach as typed block/ref; open composer at the destination. |
| Composer | The brief writes with the analyst. | One editorial column; editable headings/prose; undo/redo; saved state; share/access chrome; preview; send for review; quiet AI gutter marks; no evidence shelf. |
| Corpus palette | The unified insertion surface. | Opens at cursor/active section; type-to-filter; preselects `◆ BEST MATCH`; each row previews the exact primitive it inserts. |
| Brief primitives | The visual language of authored evidence. | Inline route/segment/metric/source/tag primitives plus embedded segment card, before-after, projection, data lineage, finding, key takeaways, mentioned routes, rich sub-brief, and hour figure. |
| Generation | Long-running authoring help. | Records a job, runs out of band, writes typed draft content, streams or materializes real primitives, and never performs heavy inference inline in the REST request. |
| Review | Reviewer reads the authored brief. | Right-margin anchored comments; change requests; suggested edits; replies; approve / request changes; reviewer assignment/readiness. |
| Triage | Author resolves review. | Queue of open items; accept suggestion into prose; resolve or dismiss comments; reopen when needed; progress gates resubmission. |
| Publish | Move approved draft toward public release. | Validate graph/review state; mark publish candidate; export candidate; offline promotion rewrites public projections; D1 records receipt. |
| Share | Draft collaboration access. | Owner / Can edit / Can comment roles, invite row, link access, copy link. Backend access roles are future work. |

## What Is Banned In V2 Authoring

These may still exist in older public or transitional pages, but they should not
be carried forward into the v2 authoring/review flow:

- chat boxes or free-form AI answer threads,
- strength bars as the main authoring UI,
- "3 evidence / 2 caveats" count chrome as a substitute for real figures,
- tabbed evidence inspectors,
- drag-to-reorder claim boards,
- autosave-history scrubbers as the core versioning model,
- fake fixture data in production authoring routes,
- public release mutation from normal Worker requests.

Validation can still compute scores and blockers. The UI should express them as
publication readiness and repair work, not as a gamified claim-strength panel.

## Content Model

The target authored brief is a content graph:

```ts
type BriefContent = {
  bodyMd: string;
  blocks: BriefBlock[];
  refs: BriefRef[];
};
```

Markdown owns prose and reading-order slots. Typed blocks own rich figure
payloads. Refs connect prose and blocks back to evidence, metrics, sources, and
artifacts.

Claims remain useful as editorial sections during the transition. In the v2 UI,
a claim should behave like a numbered section in the document, not like a row in
a scoring table.

## Current Implementation Snapshot

This is live-tree status as of 2026-06-01, not just design intent.

| Area | Landed | UX Gap |
|---|---|---|
| Draft API | D1 draft create/update, claim CRUD, body markdown, blocks, refs, attach, validation, verdicts, review threads, candidate export, promotion receipt. | UI does not yet use every endpoint. |
| Brief prose renderer | Shared `BriefProse` exists with `react-markdown`, `remark-gfm`, allowlisted directives, no raw HTML, and embedded primitive renderers. | Public reader still renders legacy `sections[].body`; composer edits claim bodies, not the draft-level `bodyMd` graph. |
| Composer | `BriefComposer`, undo/redo, corpus palette, local share chrome, editable claim-as-section prose, and live draft metadata/claim writes exist. | `/briefs/new` still seeds from a fixed public brief instead of calling `POST /api/v1/studio/briefs`; corpus insert attaches evidence ids rather than typed blocks/refs; generation UI still needs proposal polling/preview. |
| Send to brief | `SendToBriefSheet` exists and is used from route detail slow segments; route ladder links to `/briefs/new`. Backend `draft/attach` exists. | Sheet currently navigates to new/edit; it does not yet create a draft, call attach, or persist the captured object as a block/ref. |
| Review | `BriefReview` renders the document with a right comment margin, local undo/redo, validate, and publish-candidate action. Backend anchored comments/suggestions/replies exist. | UI comments are still local and claim-shaped; it does not yet call `.../draft/comments*`, render suggested edits, accept suggestions, or show the author triage queue. |
| Sharing / people | Composer `BriefPeople` and review reviewer stack exist as chrome. | No backend access-role or reviewer-assignment model is wired to the UI. |
| Publish | Backend validates, marks publish candidates, exports candidate payloads, promotes offline, and records receipt. | UI needs clearer approve/request-changes/export/retract/receipt affordances and should not collapse "approve" and "publish" into one ambiguous button. |
| Agent/AI runner | `draft/generate` queues the Cloudflare Think `BriefAuthorAgent`, which calls Workers AI and stores valid output as a proposal when bindings exist. | Streaming composer progress, proposal preview, and AI best-match UI are not wired yet. |
| Agent approvals / versions | Proposal-first endpoints and D1 draft-version rows exist for apply/reject/restore. | UI needs proposal preview, selected-operation acceptance, and version drawer wiring. |

## UX-Critical Next Slices

1. **Make new brief and Send-to-brief real.** Wire `/briefs/new` to
   `POST /api/v1/studio/briefs`, then have `SendToBriefSheet` create/select a
   destination and call `POST .../draft/attach`.
2. **Move the composer onto the content graph.** Edit draft-level `bodyMd`, render
   typed blocks from `brief.blocks`, and use refs as the source of inserted
   primitives. Keep claim-as-section only as a transition affordance.
3. **Make corpus insertion create primitives.** The palette should call block/ref
   endpoints or `draft/attach`, not merely append evidence ids to a claim.
4. **Connect review UI to D1 collaboration.** Replace local comment history with
   `.../draft/comments*`, add suggested-edit UI, replies, resolve/dismiss/reopen,
   and author triage.
5. **Separate review lifecycle actions.** Keep request review, validate,
   approve/request changes, mark publish candidate, export, retract, and
   promotion receipt distinct in the UI.
6. **Wire the agent runner.** Think/Workers AI should generate or repair typed
   `bodyMd`/blocks/refs out of band, then the same composer UI renders and edits
   the result.
7. **Add proposal approvals and version milestones.** Agent changes should appear
   as ghost previews or staged proposals; accepting them should create durable
   draft versions with content hashes and restore support.
8. **Retire v1 claim-strength chrome from brief surfaces.** The public reader and
   authoring surfaces should converge on prose, primitives, citations, caveats,
   and validation readiness.

## Implementation Rules

- Use existing design tokens and component primitives before inventing new
  chrome.
- Keep authoring routes code-split; the markdown/primitive stack must not leak
  into the initial app bundle.
- Treat AI/operator-authored markdown as untrusted: allowlisted directives only,
  no MDX, no raw HTML.
- Do not make the public reader dependent on private draft endpoints.
- Do not add heavy analytics or LLM inference to a public request path.
- Document every durable shift in this UX model in `knowledge/log.md`.
