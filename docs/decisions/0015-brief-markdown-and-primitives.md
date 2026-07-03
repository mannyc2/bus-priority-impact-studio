# 0015 - Brief markdown rendering & embeddable primitives

Date: 2026-06-01

> **Superseded (2026-07-03).** The brief markdown/primitives surface was retired by the generation-3
> hard cutover. Public route-evidence pages now follow the canonical design handoff and mta-wiki
> cited evidence artifacts.

## Status

Accepted. Implementation phased; see `docs/architecture/brief-markdown-primitives.md`.

## Context

Brief bodies are plain strings rendered ad hoc in three separate places — the
published reading view (`BriefReadingPage`), the composer (`ComposerDocument`),
and review (`BriefReviewBody`). Published `sections[].body` is `string[]` shown as
bare `<p>`s; `section.figure` is only `{ kind, label }`; composer/review attach
evidence as generic `EvidenceFigure` cards *beside* the prose. No primitive can
sit mid-paragraph anywhere.

The canonical design (`knowledge/raw/.../project/brief-primitives.jsx`) defines 14
brief primitives in two tiers — 5 **inline** (wrap with text) and 9 **embedded**
(figures that break the prose) — built on the ~18 component primitives already in
`apps/web/src/components/` (`Spark`, `Heatmap`, `RouteBadge`, `BeforeAfter`, …).
The target reading experience weaves these into the prose in reading order.

Constraints:

- **No markdown tooling exists** in the repo today.
- `ClaimEvidence` (`{ id, kind, title, detail }`) is far too thin to carry a
  primitive payload (`EmbedSegmentCard` alone needs ~12 typed fields).
- `apps/web` holds a hard **168 KB initial-JS budget**.
- Brief content is **AI- and operator-authored → untrusted**; rendering must not
  eval code or inject raw HTML.

This ADR is the documented requirement (per CLAUDE.md) for adding the markdown
dependency and the schema change.

## Decision

**1. Add a lazy-loaded markdown pipeline.** `react-markdown` + `remark-directive`
+ `remark-gfm` (+ `unified`), imported only from the brief route chunks
(reading/composer/review are already code-split), never from the root/initial
bundle. `rehype-raw` is **excluded** — no raw HTML is rendered.

**2. Content format = markdown + typed `ref` blocks (A+B hybrid).** Prose and the
**inline** primitives are markdown with `remark-directive` text directives
(`:metric[53]{unit=% tone=warn cite=c12}`). **Embedded** primitives are container
directives that carry only a local `ref` (`:::segment-card{ref=blk_madison}`)
pointing to a typed, Zod-validated `BriefBlock`. Rich figure data lives in the
schema, not in markdown attributes or fenced JSON.

**3. Introduce `BriefBlock` and `BriefRef` (additive, optional).** `BriefBlock` is
a typed union in `packages/domain` (one variant per embedded primitive).
`BriefRef` records local block refs plus evidence, metric, source, and artifact
refs. Bodies stay markdown strings and reference blocks by `ref`. `ClaimEvidence`
is left intact for the thin number/chart/source/caveat cases. D1 storage, the R2
release projection, and the OpenAPI document are extended to carry these values
under this ADR.

**3a. Public brief payloads are render-ready.** The public
`GET /api/v1/studio/briefs/{briefId}` response embeds the blocks and ref index
needed to render the brief. The published reader should not resolve local block
refs one-by-one through a public endpoint. Blocks may still reference large R2
artifacts (GeoJSON, long hourly series, source bundles), but each block must
include a useful summary/fallback.

**3b. Ref resolution is an authoring concern.** Operator-gated draft endpoints may
resolve corpus, metric, evidence, source, and artifact refs while humans or AI are
creating content. Unresolved refs can exist in draft validation output, but cannot
be promoted into the public projection.

**4. One shared `<BriefProse>` renderer + a primitive registry.** A single
renderer in `apps/web/src/components/brief/prose/` is consumed by all three
surfaces. A registry maps `directiveName → { schema, Component }`; the renderer
validates each allowlisted directive's attrs / `ref`-payload against its Zod
schema and degrades unknown or invalid directives to inert text (never throws,
never injects HTML). The embedded primitives are the registry's renderers,
composed from the existing component primitives.

**5. Wire all three surfaces together** (reading + composer-read + review), inline
tier first, then the embedded tier once `BriefBlock` lands.

## Alternatives considered

- **Pure markdown directives (embed payloads inline in attributes or fenced
  JSON)**: rejected. Figure config becomes stringly-typed and unvalidated; large
  attribute/JSON blocks are hostile to diffing, partial D1 updates, source
  provenance, and AI output repair.
- **Pure typed structured blocks (no markdown)**: rejected as the primary format.
  Loses real markdown for prose; the ask is explicitly "markdown rendering". The
  hybrid keeps typed blocks only where they earn their keep (embeds).
- **MDX**: rejected. Compiling and running author- and model-authored JSX is an
  unacceptable security and complexity cost.
- **Overload `ClaimEvidence` with primitive fields**: rejected. A wide optional
  bag erodes the existing contract; an additive `BriefBlock` union is cleaner and
  reversible.
- **Eager-load the markdown stack**: rejected — ~30–45 KB gzip would bust the
  168 KB initial budget. Lazy into brief chunks instead.

## Consequences

### Positive

- One renderer replaces three ad-hoc prose paths; primitives finally render in
  reading order across reading/composer/review.
- Figure data stays typed and Zod-validated; markdown stays thin, diff-friendly,
  and safe (allowlist, no raw HTML, no eval).
- Public brief reads stay self-contained and cacheable because local block refs
  resolve from the brief payload.
- Bundle budget is preserved by lazy-loading into already-split brief chunks.

### Negative

- New runtime dependency and added weight in the brief chunks (must be verified
  off the initial bundle each build).
- Existing briefs (`sections[].body: string[]`, `ClaimEvidence`) need a forward
  path — backfill to markdown + blocks, or render both shapes during transition.
- **SSR is an open item**: `apps/web` ships a Worker; if `/briefs/$briefId` is
  server-rendered, the markdown pipeline must run there too. Must be confirmed
  before Phase 1 cutover.
- The directive→primitive registry is a new surface to keep in sync with the
  domain `BriefBlock` variants.
- Draft authoring now has a resolver/validation layer for D1 draft block refs,
  brief evidence/source refs, metric source evidence, and route artifact refs;
  public projection backfill and promotion validation still need to make this
  graph immutable for released briefs.
