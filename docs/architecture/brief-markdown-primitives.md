# Brief Markdown & Primitive Rendering

Status: **Scoped — content graph refined, ADR 0015 accepted** · Last updated: 2026-06-01

> Working architecture note for brief bodies, embeddable primitives, refs, and
> public rendering. ADR 0015 locks the high-level direction: markdown prose,
> allowlisted directives, typed `BriefBlock`s, no MDX, no raw HTML. This page is
> the implementation plan underneath that decision.
>
> Companion note: `docs/architecture/studio-review-collaboration-and-promotion.md`
> settles draft-private review threads, suggested edits, promotion validation,
> and the offline public projection flow.

---

## 1. What we're building

One renderer turns a brief's authored body into reading-order output where **the
studio's primitives are first-class content**. Inline primitives wrap with prose
(route badges, metric chips, source chips); embedded primitives break the prose
as figures (segment cards, before/after figures, projections, data-lineage
cards).

The renderer is shared by every surface that shows a brief body:

- the **published reading view** (`BriefReadingPage`, `/briefs/$briefId`),
- the **composer** (`ComposerDocument`, authoring),
- the **review** surface (`BriefReviewBody`).

The important product constraint is that both humans and AI must be able to
author the same format, and the result must be publicly viewable without private
runtime state.

## 2. What "our primitives" means

The canonical set is already designed in the handoff
(`knowledge/raw/.../project/brief-primitives.jsx`, 14 primitives in two tiers),
built on top of the lower-level component primitives that already ship in
`apps/web/src/components/`.

### 2a. Brief primitives — the embeddable layer

**Inline** (wrap with surrounding text):

| Primitive | Props (from design) | Renders |
|---|---|---|
| `InlineRoute` | route, sbs, value, unit, tone, cite | route badge + optional metric, inline |
| `InlineSegment` | name, dir, spark, mph, cite | segment name + dir + mini spark + speed |
| `InlineMetric` | value, unit, delta, deltaUnit, tone, cite | a toned number + delta, never a score bar |
| `InlineSource` | id, src, retrieved | a citation chip |
| `InlineTag` | children, tone | a small toned tag |

**Embedded** (figures that break the prose):

| Primitive | Props (from design) | Composes |
|---|---|---|
| `EmbedSegmentCard` | route, sbs, dir, from, to, mph, sched, spark, lane, ace, tsp, riderHours, note | `RouteBadge`, `DirIndicator`, `Spark`, `LaneGlyph` |
| `EmbedBeforeAfter` | intervention, when, before, after, unit, delta, caveat, cite× | `BeforeAfter` |
| `EmbedProjection` | title, sub, unit, scenarios, target | bar/scenario rows |
| `EmbedDataLineage` | metric, source, steps, retrieved, rowCount | provenance steps |
| `EmbedFinding` | confidence, title, claim, supports, route, sbs | `AIDiagnosisStrip`-style callout |
| `EmbedKeyTakeaways` | title, items | pull-out bullets |
| `EmbedMentionedRoutes` | routes | right-rail route list |
| `EmbedRichSubBrief` | title, sub, columns | multi-column themed card |
| `EmbedHourFigure` | caption, data, sched, height | `HourBars`/`HourStrip` 24h pattern |

### 2b. Component primitives — the building blocks

`Spark`, `Heatmap`, `HourBars`/`HourStrip`/`HourOverlay`, `BeforeAfter`,
`SegmentRow`, `RouteBadge`, `DirIndicator`, `KPI`, `MapThumb`, `TreatmentRow`,
`LaneGlyph`, `InterventionTimeline`, `ConfidenceBar`, `Timeline`, `Rail`, `Cite`,
`EvidenceRefMark`, `AIDiagnosisStrip`. The embeddable primitives are thin
compositions of these. We do not expose every component directly to authors; the
brief primitive registry is the public authoring surface.

## 3. Current state

- **No markdown tooling** is a dependency (`react-markdown`/`remark`/`rehype`/`mdx`
  are absent). Prose is rendered as raw strings.
- **Published brief**: `brief.sections[].body: string[]` renders as one `<p>` per
  string; `section.figure` is only `{ kind: "map" | "chart", label }`.
- **Composer/review**: `claim.body` is a plain string; attached evidence renders
  as generic `EvidenceFigure` cards beside the prose.
- **Schema is too thin for rich primitives**: `ClaimEvidence` is
  `{ id, kind, title, detail }`. A real segment card needs route, direction,
  segment bounds, metrics, treatment flags, sparkline values, note text, and
  provenance.
- **Three divergent prose renderers** exist instead of one shared abstraction.

## 4. Target content model

The brief body is a **content graph**, not a single markdown blob and not a pure
array of structured blocks.

```ts
type BriefContent = {
  bodyMd: string;
  blocks: BriefBlock[];
  refs: BriefRef[];
};
```

Markdown owns prose, headings, lists, emphasis, links, and the reading-order
slots for primitives. Typed blocks own rich primitive payloads. Refs connect the
two and connect blocks back to evidence, metrics, source artifacts, and public
R2 objects.

The public brief response should be self-contained for rendering:

```ts
type StudioBrief = {
  // existing fields...
  bodyMd?: string;
  blocks?: BriefBlock[];
  refs?: BriefRef[];
};
```

The renderer should not need to call a block-ref endpoint to draw the public
page. A public page can lazy-load heavy artifact data referenced by a block
(GeoJSON, long hourly arrays, source bundles), but the block summaries needed to
draw the brief must ship with the brief response.

## 5. Storage choice: refs plus typed blocks

### 5a. Decision

Use the ADR 0015 hybrid:

- **Markdown + directives** for prose and inline primitives.
- **Block directives with local refs** for embedded primitives.
- **Typed `BriefBlock` payloads** stored alongside the brief, not inside the
  markdown text.
- **Artifact/source/evidence refs inside blocks** for provenance and optional
  heavy fetches.

Example authored markdown:

```md
The :route[M15 SBS]{route=M15 sbs=true} corridor loses
:metric[18,420 rider-hours/day]{ref=metric_m15_madison_pm tone=bad cite=ev_mta_speed}
in the PM peak.

:::segment-card{ref=blk_madison_pm}
:::
```

Matching typed block:

```json
{
  "id": "blk_madison_pm",
  "type": "segment-card",
  "title": "Madison Av, E 28 St to E 58 St",
  "routeId": "M15",
  "routeLabel": "M15 SBS",
  "direction": "NB",
  "from": "E 28 St",
  "to": "E 58 St",
  "metrics": {
    "avgSpeedMph": 4.8,
    "scheduledSpeedMph": 7.1,
    "riderHoursLostDaily": 18420
  },
  "treatments": {
    "busLane": "painted",
    "ace": false,
    "tsp": true
  },
  "spark": [5.2, 4.9, 4.8, 4.7, 5.0],
  "refs": [
    { "role": "primary_metric", "kind": "metric", "id": "metric_m15_madison_pm" },
    { "role": "source", "kind": "evidence", "id": "ev_mta_speed" }
  ]
}
```

### 5b. Why not typed blocks directly in markdown?

Do not store rich typed payloads as JSON inside markdown fences or directive
attributes. It is technically tempting, but it makes the important parts worse:

- weak validation boundary; every edit requires parsing markdown before typing,
- noisy diffs and merge conflicts for humans,
- brittle quoting/escaping for AI output,
- hard partial updates in D1,
- poor reuse when the same block is referenced from multiple paragraphs,
- no clean way to attach source/artifact refs and publish validation state.

Markdown may carry small inline display attributes. Anything with arrays,
objects, provenance, source URLs, artifact keys, review state, or more than a few
scalar props belongs in a typed `BriefBlock`.

### 5c. Why not fetch every ref at render time?

Do not make the public reading view resolve local block refs one-by-one. Public
briefs should be cacheable, SEO-friendly, and robust under partial network
failure. The public response should include all blocks referenced by the body.

Fetches are still useful in two narrower places:

- **Authoring resolver**: operator-gated draft endpoints can resolve corpus,
  metric, evidence, and artifact refs while humans or AI are composing.
- **Heavy artifacts**: a block can point at R2 or REST artifact data that is too
  large for the brief payload. The block must include a usable summary/fallback,
  while the rich component fetches the heavy artifact lazily.

## 6. Ref model

Refs are stable IDs with typed targets. They are not React component props.

```ts
type BriefRef =
  | {
      id: string;
      kind: "block";
      blockId: string;
      blockType: BriefBlock["type"];
    }
  | {
      id: string;
      kind: "evidence";
      evidenceId: string;
      role: "primary" | "counter" | "caveat" | "source";
    }
  | {
      id: string;
      kind: "metric";
      metricId: string;
      sourceEvidenceIds: string[];
    }
  | {
      id: string;
      kind: "artifact";
      artifactKey: string;
      artifactType: "geojson" | "hourly-series" | "source-bundle" | "export";
      publicUrl?: string;
    }
  | {
      id: string;
      kind: "source";
      sourceId: string;
      url?: string;
      retrievedAt?: string;
    };
```

Ref rules:

1. `block` refs are local to one brief version and must resolve from
   `brief.blocks`.
2. `evidence`, `metric`, `source`, and `artifact` refs may point outside the
   brief, but the public response should include enough label/provenance to
   render a citation without an extra fetch.
3. Draft refs can be `unresolved` during composition, but publish validation must
   reject unresolved refs.
4. Ref IDs must be stable across retries. AI and UI insertions should generate
   deterministic IDs from intent where practical (`blk_m15_madison_pm`) and fall
   back to collision-safe IDs when necessary.
5. A directive can only reference a block whose `type` matches the directive
   (`:::segment-card{ref=...}` cannot resolve to a `before-after` block).

## 7. Primitive payload placement

| Primitive | Markdown carries | Typed payload carries | Public fetch? |
|---|---|---|---|
| `InlineRoute` | route label/id, SBS flag, optional cite | none initially; route ref later if needed | No |
| `InlineSegment` | display label or `ref` to a metric/block | segment metric/provenance if more than display text | No for summary |
| `InlineMetric` | display text, tone, `ref`, cite | authoritative metric value + source refs | No |
| `InlineSource` | source/evidence ref | source title, URL, retrieved date in ref index | No |
| `InlineTag` | text + tone | none | No |
| `EmbedSegmentCard` | `ref` only | route, segment bounds, metrics, treatments, spark, refs | Optional for map/long series |
| `EmbedBeforeAfter` | `ref` only | intervention, before/after values, caveat, source refs | No |
| `EmbedProjection` | `ref` only | scenarios, target, units, assumptions, source refs | No |
| `EmbedDataLineage` | `ref` only | source, steps, row count, retrieved date, artifact refs | Optional source bundle |
| `EmbedFinding` | `ref` only | finding title, claim, confidence, support refs | No |
| `EmbedKeyTakeaways` | `ref` only | items and optional evidence refs per item | No |
| `EmbedMentionedRoutes` | `ref` only | route list and summaries | No |
| `EmbedRichSubBrief` | `ref` only | columns, child markdown, nested refs limited to local scope | No |
| `EmbedHourFigure` | `ref` only | 24h summary values, schedule overlay, caption, artifact ref | Optional long series |

Rule of thumb: if a human can safely edit it in one sentence, it can live in
markdown. If it affects validation, provenance, rendering shape, or public data
loading, it lives in a typed block/ref.

## 8. Domain, D1, and projection plan

### 8a. Domain

Add additive optional fields first so existing releases keep parsing:

```ts
StudioBriefSchema.extend({
  bodyMd: z.string().optional(),
  blocks: z.array(BriefBlockSchema).default([]),
  refs: z.array(BriefRefSchema).default([]),
});
```

`bodyMd` and `blocks` are now also part of `StudioBriefDraftSchema`. Draft body
markdown lives on `studio_brief_draft.body_md`; editable blocks live in separate
rows.

### 8b. Draft D1 storage

Use rows for editable blocks, not one giant JSON column:

```sql
studio_brief_draft (
  ...
  body_md text
)

studio_brief_draft_block (
  brief_id text not null,
  block_id text not null,
  block_type text not null,
  block_json text not null,
  created_at text not null,
  updated_at text not null,
  primary key (brief_id, block_id)
)
```

Reasons: per-block idempotent writes, smaller conflict surface between AI and
human edits, easy orphan detection, and clear history snapshots. Draft-level
`body_md` owns reading order and block refs; claim bodies stay claim-scoped.

### 8c. Public projection

The published R2 brief projection embeds `brief.blocks` and `brief.refs` with the
brief. Heavy artifacts remain R2 objects addressed by artifact refs. Promotion
from D1 draft to public projection validates the graph, strips draft-only fields,
and writes a self-contained public payload.

Promotion is not a Worker-side public mutation. The Worker exports a validated,
self-contained publish candidate; the pipeline promotes that candidate into the
immutable `studio/v1` release projection set. Review-thread audit data may be
archived with the candidate, but private draft review threads are not copied into
public `comments[]`.

### 8d. OpenAPI

Expose `BriefBlock` and `BriefRef` schemas on:

- `GET /api/v1/studio/briefs/{briefId}`,
- draft claim/body responses,
- publish-candidate export,
- any future draft block CRUD endpoints.

## 9. Resolver and authoring workflow

The renderer should not be the resolver. Resolution is a write/authoring concern.

Planned draft endpoints:

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /api/v1/studio/briefs/{id}/draft/blocks` | Create a typed block and return the normalized block payload. | `write:briefs`; landed |
| `PATCH /api/v1/studio/briefs/{id}/draft/blocks/{blockId}` | Update one block payload. | `write:briefs`; landed |
| `DELETE /api/v1/studio/briefs/{id}/draft/blocks/{blockId}` | Delete one block. | `write:briefs`; landed |
| `POST /api/v1/studio/briefs/{id}/draft/refs/resolve` | Validate and normalize refs from corpus IDs or AI intents. | `write:briefs`; landed for block/evidence/metric/source/artifact refs |
| `GET /api/v1/studio/briefs/{id}/draft/refs` | List persisted draft refs. | `read:briefs`; landed |
| `PUT /api/v1/studio/briefs/{id}/draft/refs` | Replace persisted draft refs after normalization. | `write:briefs`; landed |
| `POST /api/v1/studio/briefs/{id}/draft/attach` | Store a captured Studio object as a typed block/ref and append the body directive. | `write:briefs`; landed |
| `POST /api/v1/studio/briefs/{id}/draft/validate` | Parse markdown, validate directives, validate block/ref graph, and report publish blockers. | `write:briefs`; landed for block directive presence/type checks |

Human flow:

1. Operator inserts from the corpus.
2. UI calls the resolver or block-create endpoint.
3. Worker stores a typed block row and inserts `:::primitive{ref=blockId}` at the
   cursor.
4. Preview uses the local draft graph; publish validation must pass before the
   candidate export is allowed.

AI flow:

1. Generation proposes `bodyMd`, `blocks`, and `refs` as one content graph.
2. Worker validates schemas and stores blocks separately from markdown.
3. Invalid or unresolved refs stay draft-only and visible in validation output;
   they cannot reach the public projection.

## 10. Rendering plan

- Add one lazy-loaded `<BriefProse markdown blocks refs mode />` renderer under
  `apps/web/src/components/brief/prose/`.
- Use `react-markdown`, `remark-gfm`, and `remark-directive`; do **not** use
  `rehype-raw`.
- Add a primitive registry:

```ts
type PrimitiveRegistryEntry = {
  directive: string;
  kind: "inline" | "block";
  blockType?: BriefBlock["type"];
  attrsSchema: z.ZodType;
  blockSchema?: z.ZodType;
  Component: React.ComponentType<unknown>;
};
```

- Unknown directives render as inert text in read mode and as visible validation
  chips in author/review mode.
- Invalid block refs render a compact missing-primitive fallback in author/review
  mode and fail publish validation. Public promotion should prevent invalid
  blocks from shipping.
- Links and URLs are sanitized; no raw HTML is rendered.

## 11. Migration path

1. Keep current `sections[].body: string[]` and `claim.body` rendering while
   adding optional `bodyMd`, `blocks`, and `refs`.
2. Teach `BriefProse` to render old paragraph arrays by joining them as markdown
   paragraphs when `bodyMd` is absent.
3. Convert composer/review claim bodies to markdown strings first; keep existing
   evidence cards as generated blocks during transition.
4. Backfill public brief projections to include `bodyMd` and generated blocks.
5. Retire `section.figure` labels and evidence-beside-prose once parity is
   reached.

## 12. Verification gates

- Domain tests parse old briefs with no blocks and new briefs with every block
  variant.
- Worker tests prove public brief responses include the resolved block graph and
  anonymous readers do not need draft access.
- Draft worker tests cover block CRUD, missing idempotency keys, resolver output,
  orphan-block deletion conflicts, and publish validation failures.
- Renderer tests cover every directive, unknown directives, invalid refs, and no
  raw HTML execution.
- Build check confirms the initial `index-*.js` gzip budget stays flat; markdown
  dependencies live in route chunks.
- Architecture boundary tests confirm no pipeline code is imported by public
  request handlers or the renderer.

## 13. Phasing

1. **Schema skeleton**: add optional `BriefBlock`/`BriefRef` domain schemas and
   OpenAPI output, no rendering changes -> status: landed 2026-06-01; verify:
   domain tests pass old fixtures and draft-block worker tests parse new fixtures.
2. **Renderer inline tier**: add lazy `<BriefProse>` and the five inline
   primitives -> verify: reading/composer/review render existing text unchanged
   plus inline directives in fixtures.
3. **Draft block storage**: add D1 block rows and query helpers -> status:
   landed 2026-06-01; verify: `bun --filter @bp/db test`.
4. **Embedded tier**: implement the nine block primitives through the registry ->
   verify: renderer tests cover all variants and invalid refs.
5. **Authoring resolver**: add draft block CRUD, `refs/resolve`, persisted refs,
   and send-to-brief attachment -> status: landed 2026-06-01 as block CRUD,
   draft body storage, block directive validation, resolver lookup for
   block/evidence/metric/source/artifact refs, `GET/PUT .../draft/refs`, and
   `POST .../draft/attach` -> verify: Worker FakeDb tests cover
   insert/update/delete, resolver normalization, persisted refs, attachment,
   artifact public URLs, and invalid body block refs.
6. **Public projection/promotion**: publish candidate export embeds
   `bodyMd`/`blocks`/`refs`, rejects unresolved refs, and promotion preserves the
   render-ready graph in public projections -> status: landed 2026-06-01 ->
   verify: worker export test and promotion test.
7. **Migration/retirement**: backfill generated public briefs and remove
   beside-prose evidence fallbacks only after parity -> verify: web build and
   visual review across reading/composer/review.

## 14. Risks & open questions

- **SSR in the Worker**: confirm whether `/briefs/$briefId` is server-rendered
  before adding markdown dependencies.
- **Inline metric strictness**: decide how much numeric validation is required
  for inline metrics in Phase 1. Recommendation: require `ref` for any public
  numeric claim, allow literal-only inline tags/routes.
- **Nested markdown**: `EmbedRichSubBrief` may need child markdown. Keep nested
  refs local to that block or ban nested refs in v1 to avoid graph recursion.
- **Artifact fetch policy**: define size thresholds for embedding summaries in
  `BriefBlock` vs lazy-fetching R2 artifacts.
- **Manual directive editing**: operators can hand-edit markdown, but UI insert
  flows should be the primary path. The editor should surface validation
  failures without making users memorize directive syntax.

## 15. Decisions

1. **Use refs plus typed blocks.** Markdown owns reading order; typed blocks own
   rich primitive payloads.
2. **Public brief payloads are render-ready.** Local block refs resolve from the
   brief response; no public per-block resolver is needed for v1.
3. **Fetch only heavy external artifacts.** Blocks may carry artifact refs for
   GeoJSON, long time series, source bundles, or exports, but must include a
   summary/fallback.
4. **Draft authoring gets a resolver.** Humans and AI can create refs through
   operator-gated draft endpoints; unresolved refs are draft-only.
5. **No typed JSON inside markdown.** Rich primitive payloads belong in
   `BriefBlock` rows/projections, not directive attributes or fenced JSON.
