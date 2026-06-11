# Studio Review Collaboration & Public Promotion

Status: **Partially implemented** - Last updated: 2026-06-01

This note settles the two backend gaps left after ADR 0014 and ADR 0015:

1. how reviewers, authors, and AI agents should collaborate on draft briefs; and
2. how an approved draft becomes an immutable public Studio projection.

The short version: review collaboration is **draft-private D1 state** with anchored
threads and suggestions; public promotion is an **offline projection step** fed by a
self-contained candidate export. The public reading view never resolves local
draft refs one-by-one, and the Worker never does heavy release promotion work in a
request path.

## Current tree facts

- `studio_brief_review_comment` now stores root review threads and replies:
  legacy reviewer/message fields plus additive parent, kind, status, anchor,
  suggestion, update, and resolution columns.
- `StudioComment` is public-history shaped: claim number, body, optional resolved
  flag, and optional replies. It is not expressive enough for text-range anchors
  or suggested edits.
- The Worker persists anchored comments, change requests, replies, resolution,
  dismissal, and body-markdown suggested edits under `.../draft/comments*`.
- `POST .../draft/publish` only marks `publish_candidate` after approval and
  deterministic validation. It does not mutate the public release.
- `GET .../draft/publish-candidate-export` now works for source-backed and
  draft-only briefs, rejects stale blocking validation, and includes a private
  candidate audit with validation, content hashes, and review-thread summaries.
- `tools/pipeline-v2/src/commands/studio/promote-publish-candidate.ts` performs
  release mutation: it reads a candidate, merges it into `studio/v1/release.json`,
  rewrites the page-shaped projections, and archives the candidate audit without
  copying private review threads into public comments.

## Decision 1: Review collaboration primitives

Review collaboration gets a dedicated draft-private model. Do not overload public
`StudioBriefResponse.comments` as the authoring collaboration store.

### Domain shapes

Add these domain schemas alongside the draft schemas:

```ts
type StudioReviewAnchor = {
  target: "body" | "claim" | "block" | "draft";
  targetId: string | null;
  quote: {
    exact: string;
    prefix?: string;
    suffix?: string;
  } | null;
  range?: {
    start: number;
    end: number;
  };
  contentHash?: string;
};

type StudioReviewSuggestion = {
  suggestFrom: string;
  suggestTo: string;
};

type StudioReviewThread = {
  id: string;
  briefId: string;
  kind: "comment" | "change-requested" | "suggested-edit";
  status: "open" | "resolved" | "dismissed";
  author: string;
  authorDisplayName: string | null;
  body: string;
  anchor: StudioReviewAnchor;
  suggestion: StudioReviewSuggestion | null;
  replies: StudioReviewReply[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};
```

Anchor rules:

1. Anchors are logical selectors, not DOM coordinates.
2. Text anchors use a W3C-style quote selector: exact selected text with optional
   prefix/suffix context.
3. Offsets are hints only. The server must prefer exact quote validation and use
   offsets only to disambiguate repeated text.
4. `contentHash` is the hash of the target body/claim/block at the time the
   thread was created. A stale hash does not hide the thread; it only forces
   accept-suggestion to revalidate before editing prose.
5. Block anchors use `target: "block"` and `targetId: blockId`; they do not point
   into rendered component pixels.

Suggestion rules:

1. Suggestions are a thread kind, not a separate document-patch type.
2. `suggestFrom` must match the anchored text when the suggestion is created, or
   the server returns `409`.
3. Accepting a suggestion performs one constrained replacement against the
   current target. If the quote is stale or ambiguous, the server returns `409`
   and leaves the draft unchanged.
4. Rejecting/dismissing a suggestion never edits draft prose.

### D1 storage

Keep the current table name for migration continuity, but extend its meaning from
"flat comment" to "review thread or reply" with additive columns:

```sql
alter table studio_brief_review_comment add parent_comment_id text;
alter table studio_brief_review_comment add kind text not null default 'comment';
alter table studio_brief_review_comment add status text not null default 'open';
alter table studio_brief_review_comment add anchor_json text;
alter table studio_brief_review_comment add suggestion_json text;
alter table studio_brief_review_comment add updated_at text;
alter table studio_brief_review_comment add resolved_at text;
alter table studio_brief_review_comment add resolved_by text;
create index studio_brief_review_comment_brief_status_idx
  on studio_brief_review_comment (brief_id, status, created_at);
create index studio_brief_review_comment_parent_idx
  on studio_brief_review_comment (parent_comment_id, created_at);
```

Existing rows become root `comment` threads with `status = 'open'` and
`updated_at = created_at`. Replies are rows with `parent_comment_id` set and no
anchor/suggestion.

If reviewer assignment is needed for the canonical `BriefPeople` UI, add a small
separate table instead of smuggling assignment into comments:

```sql
create table studio_brief_review_assignment (
  brief_id text not null,
  reviewer text not null,
  reviewer_display_name text,
  state text not null, -- assigned | reviewing | approved | changes_requested
  assigned_by text not null,
  assigned_at text not null,
  reviewed_at text,
  primary key (brief_id, reviewer)
);
```

### Endpoints

All routes stay under the draft namespace and require operator auth plus
`Idempotency-Key` for mutations.

| Endpoint | Scope | Purpose |
|---|---|---|
| `GET /api/v1/studio/briefs/{id}/draft/comments` | `read:briefs` | List draft-private review threads and replies. |
| `POST /api/v1/studio/briefs/{id}/draft/comments` | `review:briefs` | Create an anchored comment, change request, or suggested edit. |
| `POST /api/v1/studio/briefs/{id}/draft/comments/{commentId}/replies` | `write:briefs` or `review:briefs` | Reply to a thread. |
| `PATCH /api/v1/studio/briefs/{id}/draft/comments/{commentId}` | `write:briefs` or `review:briefs` | Resolve, reopen, dismiss, or update a thread body. |
| `POST /api/v1/studio/briefs/{id}/draft/comments/{commentId}/accept-suggestion` | `write:briefs` | Apply `suggestTo` to the anchored draft target and resolve the thread. |
| `GET /api/v1/studio/briefs/{id}/draft/reviewers` | `read:briefs` | List assignments, if assignments are enabled. |
| `PUT /api/v1/studio/briefs/{id}/draft/reviewers/{reviewer}` | `review:briefs` | Assign or update a reviewer, if assignments are enabled. |

The existing `POST .../draft/review` remains a lifecycle action: it moves a draft
to `in_review` and may create one root thread, but it is not the general comment
write API.

### Review gates

Validation and publish-candidate marking should account for review state:

- `POST .../draft/validate` reports open blocking review items.
- `POST .../draft/verdict` with `approve` fails with `409` if open
  `change-requested` or `suggested-edit` threads remain.
- `POST .../draft/publish` fails with `409` unless the draft is `approved`,
  validation has no blocking graph issues, and no blocking review threads remain.

Plain comments can remain open without blocking publish, but the triage UI may
still encourage resolving every thread before resubmission.

## Decision 2: Public projection and promotion

Promotion is a two-phase model:

1. The Worker validates and exports a self-contained publish candidate.
2. A pipeline command promotes that candidate into immutable public R2
   projections, then the normal publish flow uploads the projection set.

This preserves the repo rule that public request paths stay lightweight.

### Candidate export requirements

`GET .../draft/publish-candidate-export` should work for both source-backed and
draft-only briefs:

- If `sourceBriefId` exists, load the source public projection and overlay the D1
  draft fields.
- If no source projection exists, synthesize the public brief from the D1 draft
  and route projection, the same way authorized draft-only `GET /briefs/{id}`
  already does.
- Embed `bodyMd`, `blocks`, and `refs` in the candidate brief. Do not require the
  public reader to call a ref resolver.
- Include a private audit section with draft validation, content hashes, and
  review-thread summaries. This audit section is archived with the candidate but
  not copied into public `comments[]`.
- Include the target public brief id:
  - `sourceBriefId` for replacement drafts,
  - `briefId` for draft-only new public briefs,
  - or an explicit publisher override supplied to the promotion command.

Candidate export must reject:

- drafts that are not `publish_candidate`,
- candidates that were not created by a `POST .../draft/publish` check from an
  `approved` draft,
- unresolved refs,
- body directives that reference missing or mismatched blocks,
- open blocking review threads,
- route slugs missing from the release,
- artifact refs that do not point at public R2 artifact keys.

### Ref index persistence

Draft `blocks` are durable today, but a public brief also needs a flattened
`refs` index for inline metric/source/artifact citations. Add
`studio_brief_draft_ref` before public promotion:

```sql
create table studio_brief_draft_ref (
  brief_id text not null,
  ref_id text not null,
  ref_kind text not null,
  ref_json text not null,
  created_at text not null,
  updated_at text not null,
  primary key (brief_id, ref_id)
);
```

`POST .../draft/refs/resolve` remains the normalizer. A follow-up write endpoint
or `PATCH .../draft/refs` stores the normalized ref index. Promotion embeds that
stored ref index plus block-local refs in `brief.refs`.

### Promotion command

Keep promotion in `tools/pipeline-v2/src/commands/studio/promote-publish-candidate.ts`.
The command should:

1. Parse the candidate with the domain schema.
2. Re-run graph/publication validation locally.
3. Determine the public target id.
4. Merge the candidate brief into `release.briefs`.
5. Rebuild `briefs.json`, per-brief `index.json`, `evidence.json`, `history.json`,
   route/search projections, and `release.json`.
6. Archive the raw candidate under `studio/v1/publish-candidates/{candidateId}.json`.
7. Write a promotion audit artifact recording candidate id, target id, old brief
   id, route slug, content hashes, and projection count.

The promotion command should not copy private review threads into public
`release.comments`. Public comments/history entries should be explicit editorial
notes only. Private review threads stay in the archived candidate audit.

### Publishing receipt

After the promoted projection set is uploaded, record a small receipt back in D1:

| Endpoint | Scope | Purpose |
|---|---|---|
| `POST /api/v1/studio/briefs/{id}/draft/promotion-receipt` | `publish:briefs` | Mark the D1 draft `published`, store candidate id, target public brief id, projection key/hash, and published timestamp. |

This endpoint is lightweight and auditable. It does not write public projections;
it only records that a deliberate offline promotion has completed.

## Implementation order

1. **Landed.** Add review thread schemas and D1 additive columns -> verify: db test parses
   old flat comments and new anchored threads.
2. **Landed.** Add draft comment list/create/reply/resolve endpoints -> verify: Worker FakeDb
   tests cover anchored create, reply, resolve, and auth scopes.
3. **Landed.** Add suggestion create/accept endpoint -> verify: exact quote replacement works
   for `bodyMd`; stale quote returns `409` with no draft mutation.
4. **Landed.** Add review gates to validate/verdict/publish -> verify: open change requests
   block approval/publish; resolved items unblock.
5. **Landed.** Add draft ref persistence -> verify: stored refs round-trip through draft and
   candidate export.
6. **Landed.** Fix candidate export for draft-only briefs and add strict graph/publication
   validation -> verify: source-backed and draft-only candidate export tests.
7. **Landed.** Update promotion command to archive private audit data while keeping public
   `release.comments` clean -> verify: pipeline promotion test asserts review
   threads are absent from public comments and candidate archive exists.
8. **Landed.** Add promotion receipt endpoint -> verify: Worker test marks a promoted draft
   `published` after a synthetic receipt.

## Non-goals

- No real-time collaborative editing protocol.
- No Durable Object document session.
- No public review-thread endpoint.
- No inline LLM generation in the Worker request path.
- No public release mutation from the Worker.
