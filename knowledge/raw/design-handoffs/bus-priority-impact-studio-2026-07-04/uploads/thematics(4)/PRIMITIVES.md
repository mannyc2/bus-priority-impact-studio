# Inline primitives — spec

A reference for the small, self-contained visual components that render inside an entry's reading column — diagrams, charts, interactive widgets, comparison cards, maps. Each primitive is an HTML or SVG fragment that fits the 720-pixel reader column, sits in the page flow like a book figure, and shares the Thematics design system.

> Inline primitives are figures, not widgets. They earn their place when an idea is faster to see than to read.

---

## 1. Where these live

Two contexts share the same primitive vocabulary:

- **Inline figures** inside an entry — a chart between two paragraphs, a flowchart that anchors a section, a comparison block that makes a choice legible. These appear in the 720-pixel reading column.
- **Chat responses** inside the explorer's ask-the-library surface. Same primitives, same rules; the chat column is the same width as the reader column.

Either way, the surrounding ink is doing the work. The primitive is a *figure* — captioned in serif italic, framed by a hairline, never decorative on its own.

---

## 2. Output modes

Two output families, auto-detected by the first character of the fragment:

- **SVG** — fragment begins with `<svg>`. Used for diagrams, illustrations, anything that's pure geometric content.
- **HTML** — anything else. Used for charts, interactive widgets, mockups, comparison cards, data records, mixed content.

Fragments are content only. No `<!DOCTYPE>`, no `<html>`, `<head>`, or `<body>`. The host wraps the fragment in a sandboxed iframe with `colors_and_type.css` pre-loaded.

The container is `display: block; width: 100%; max-width: 720px;`. Outer background is transparent; paper white shows through.

---

## 3. Design system rules

The primitive lives inside the same system as the rest of Thematics — read `colors_and_type.css` for the full token list. The notes below are what changes when you're authoring a figure rather than chrome.

### Color — categorical ramps

Six hues, each with five stops. Use the ramp tokens for figures; the `--tag-*` tokens stay reserved for chips.

| Ramp | 50 | 100 | 200 | 500 | 800 |
|---|---|---|---|---|---|
| violet | `#F5F2FC` | `#EEEAFA` | `#D6CBF1` | `#8D72D6` | `#6B4FB8` |
| emerald | `#F0F8F3` | `#E6F4ED` | `#C2E2D2` | `#4FA177` | `#1F7A55` |
| amber | `#FDF8EC` | `#FBF3E0` | `#F1DFAA` | `#B89557` | `#8C6E2D` |
| crimson | `#FCEFF2` | `#FBE8EC` | `#F2C7CF` | `#D8657A` | `#B83A4F` |
| ocean | `#EEF5FB` | `#E4EFF8` | `#C0DAEE` | `#5391C6` | `#2A6EA8` |
| slate | `#F5F5F4` | `#EBEAE7` | `#D6D3CE` | `#807D78` | `#4F4D49` |

**Stop usage**

- `50` — page-level soft background, choropleth lightest, sparkline fill.
- `100` — chip background, faint fill behind text.
- `200` — borders, dashed lines, grid emphasis.
- `500` — chart series mid-tone (bars, lines, scatter marks).
- `800` — text on a `50` / `100` fill, strong solid fill.

**Assignment rules**

- **Color encodes meaning, not sequence.** Don't rotate ramps just because there are three series. Pick the hue that fits the data.
- **Two or three hues per figure.** Six is a chart that's lost the thread.
- **Default order for general categories:** violet → emerald → amber → crimson → ocean → slate. Pick from anywhere; just don't shuffle order between adjacent figures.
- **`--primary` blue is reserved.** Hyperlink blue does not appear as a chart series unless the data literally is about links — outgoing references, crossref density, etc. In every other figure, ocean is the closest cousin.
- **Text on a colored fill** uses the `800` stop of the same hue. Never `--foreground`, never pure black.
- **Pair every color with a second cue.** Dash pattern on lines, marker shape on scatter, hatching on bars. The figure must still parse in greyscale.

### Typography in figures

- **Default font: `--font-sans`** (IBM Plex Sans). Two weights only: 400 regular, 500 medium.
- **Title:** 16 / 1.3, weight 500. Sits above the figure, sentence case.
- **Axis labels, callouts:** 12 / 1.4, weight 400, `--muted-foreground`.
- **Numbers inside the figure:** weight 500, sans, never mono unless they're code identifiers.
- **Caption:** serif italic, 14 / 1.5, `--muted-foreground`. Sits *below* the figure, exactly like a printed book.
- **Never:** uppercase-mono labels, all-caps headings, font sizes below 11px.

### Shape and rhythm

- **Hairlines, not borders.** 1px in `--border` is the default frame; 0.5px in `--border-strong` only inside dense data (axis lines).
- **Card radius:** `var(--radius-xl)` (12px) for primitives that read as a single object.
- **Vertical rhythm:** rem multiples (1rem, 1.5rem, 2rem) for figure stacks; px for internal gaps (8 / 12 / 16).
- **Rounded corners require borders on all sides.** A single-side accent (`border-left: 2px solid`) must have `border-radius: 0`.

### Banned in figures (mirror of README §Anti-patterns)

- Decorative card chrome (title-left / tag-right header strip with separator). The caption goes *below*; the figure has no title-bar.
- Uppercase-mono labels. Axes, legends, callouts — all sentence case sans.
- Metadata-slop chains under titles. If a number matters, it earns a label, not a pill row.
- Ghost buttons. Use primary, secondary, danger, or text links.
- Stat-strip "summary" rows under a hero or above a chart. The chart says the thing.
- Gradients (one exception: an illustrative diagram showing a continuous physical property — a temperature gradient, a depth fade).
- Drop shadows, blur, glow.
- Emoji. Lucide icons only. Decorative icons get `aria-hidden="true"`.

### Number formatting

Every number that reaches the screen must be rounded — `Math.round()`, `.toFixed(n)`, or `Intl.NumberFormat`. JS float math leaks artifacts (`0.1 + 0.2` is `0.30000000000000004`).

- Counts inside sentences read as English: "Linked from fourteen entries."
- Dates: `Mar 14, 2026`. ISO form (`2026-03-14`) only inside dev/debug surfaces.
- Currency: `$1.2M`, `-$5M` (sign first), never `$-5M`.
- Percentages: one decimal (`12.4%`); zero when the data is integer (`14%`).
- Missing values: em-dash `—`, never `N/A` or `null`.

---

## 4. HTML primitives

### Metric

A single number with its label. Use in grids of two to four with a 12px gap.

```html
<div style="background: var(--surface); border-radius: var(--radius-xl); padding: 16px 18px;">
  <p style="font: 400 13px var(--font-sans); color: var(--muted-foreground); margin: 0 0 6px;">Backlinks</p>
  <p style="font: 500 28px/1.1 var(--font-serif); margin: 0; letter-spacing: -0.01em;">14</p>
</div>
```

The number is in **Source Serif**, not sans. This is the one place we use serif for a non-prose number — it makes the figure feel like part of an entry, not a dashboard cell.

### Comparison cards

Side-by-side options for a real choice. Each option leads with a Lucide icon (16px, `aria-hidden`), then a sentence-case title, then a short prose explanation.

A recommended option uses `border-color: var(--primary)` (1px, not 2px — we don't escalate weight). A small inline label — "Recommended" in primary blue, sentence case — sits inside the card, not as a floating badge.

Never put a comparison *table* inside a primitive — write the table as markdown in the surrounding prose.

### Data record

For a bounded object (an entry, an author, a citation). A single hairline-bordered card wraps a header row (avatar / monogram + title + subtitle) and a list of key-value rows separated by hairline rules.

- People use a 32px square with the initials in Source Serif 500. Never circular — circles imply social, not editorial.
- Key labels: sans 13px muted.
- Values: sans 14px foreground. If the value is an identifier or path, mono 13px.

### Slider with live readout

Range sliders are pre-styled (4px track, 18px thumb, primary fill on the played portion). Bind `input` events for live updates. `step="1"` (or `0.1`, etc.) so the input emits rounded values.

### Buttons inside primitives

Same three kinds as the rest of the system: **primary** (filled blue), **secondary** (white, hairline border), **danger** (red ink, hairline border). Quiet actions are text links.

A button that triggers `sendPrompt` (see §7) appends an em-arrow `→` to its label.

### Form elements

Bare `<input>`, `<select>`, `<textarea>`, `<button>`, `<input type="range">` are all pre-styled. Text inputs are 38px tall with a 3px primary ring on focus.

### Icons — Lucide only

```html
<i data-lucide="quote" style="width: 16px; height: 16px;"></i>
```

Lucide ships outline-only here. 14 / 16 / 20 / 24px. Inherits color via `currentColor`. Decorative icons get `aria-hidden="true"`; icon-only buttons get `aria-label`.

### Layout modes

- **Inline figure** — default. No outer card wrapper; primitive sits in flow with a serif-italic caption beneath. Use for charts, diagrams, sliders.
- **Card** — when the primitive *is* a bounded object (a data record, a comparison set). One hairline-bordered card wraps everything.
- **Stack** — multiple primitives in sequence (e.g., three metric cards in a row). Use a 12px gap; never wrap in another card.

---

## 5. SVG diagrams

### Setup

```svg
<svg width="100%" viewBox="0 0 680 H" role="img">
  <title>One sentence summary of the diagram.</title>
  <desc>Longer description for screen readers — what the diagram shows and why.</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>
  <!-- diagram content -->
</svg>
```

- **viewBox width is always 680.** The host renders SVGs at 1:1 coordinate-to-pixel inside the 720px reader column, with a 20px gutter either side.
- Safe content area: `x = 40 to 640`, `y = 40 to (H − 40)`.
- Arrow marker uses `context-stroke` so the head inherits its line's color.

### Pre-built classes (host-provided)

```css
.t  { font: 400 14px var(--font-sans); fill: var(--foreground); }
.ts { font: 400 12px var(--font-sans); fill: var(--muted-foreground); }
.th { font: 500 14px var(--font-sans); fill: var(--foreground); }
.box  { fill: var(--surface); stroke: var(--border); stroke-width: 1; }
.node { cursor: pointer; }
.node:hover { opacity: 0.85; }
.arr { stroke: var(--foreground); stroke-width: 1.5; fill: none; marker-end: url(#arrow); }
.leader { stroke: var(--muted-foreground); stroke-width: 0.5; stroke-dasharray: 2 3; fill: none; }
.r-violet, .r-emerald, .r-amber, .r-crimson, .r-ocean, .r-slate { /* ramp tokens at 100/800 */ }
```

Every `<text>` carries one of `t`, `ts`, `th`. Unclassed `<text>` inherits the default font but loses theming.

### Diagram types

**Flowchart.** Sequential steps, decisions, transformations. Single direction (top-down or left-right). Maximum four or five nodes. Arrows route around boxes with L-shaped paths; arrows never cross unrelated text.

**Structural.** Things inside other things. Prefer **one outer frame divided by hairlines** over nested rectangles — the way a printed table of contents marks its sections. When nesting is genuinely necessary: outer container rounded rect, `rx = 16-20`; inner regions smaller rect, `rx = 8-12`; 20px minimum padding inside any container; **maximum two nesting levels**. Three is a tell that the diagram wants to be a table.

**Illustrative.** A diagram that builds intuition for a concept the prose is about. Physical things get simplified cross-sections; abstract things get spatial metaphors. **One gradient permitted**, only when showing a continuous physical property. Animation permitted via CSS `@keyframes` on `transform` and `opacity`, wrapped in `@media (prefers-reduced-motion: no-preference)`.

**ERD.** Database schemas via mermaid.js, not hand-built SVG.

### When the prompt is over budget

If the figure wants six or more components, decompose into multiple diagrams with prose between them.

---

## 6. Charts (Chart.js)

### Setup

```html
<figure style="margin: 0;">
  <div style="position: relative; width: 100%; height: 320px;">
    <canvas id="chart" role="img" aria-label="One-sentence summary of what the chart shows.">
      Fallback prose describing the data for non-JS readers.
    </canvas>
  </div>
  <figcaption style="font: italic 400 14px/1.5 var(--font-serif); color: var(--muted-foreground); margin-top: 10px;">
    Figure caption in serif italic, sentence case, with the source as a sentence.
  </figcaption>
</figure>
```

### Rules

- Every canvas MUST have `role="img"`, a descriptive `aria-label`, and fallback text inside the tag.
- Height goes on the wrapper `<div>` only, never on the canvas. Set `responsive: true, maintainAspectRatio: false`.
- Canvas can't read CSS variables. **Use the hex values from the ramp table.**
- Disable the default legend and build a custom HTML legend in our type and chip language.
- Default `font-family`: IBM Plex Sans. Set it manually.

### Number formatting

Negative values are `-$5M`, not `$-5M`. Use a formatter:

```javascript
(v) => (v < 0 ? '-' : '') + '$' + Math.abs(v) + 'M'
```

---

## 7. Geographic maps (D3 choropleth)

Never invent coordinates. Always fetch real topology.

| Scope | URL | Projection | Object key |
|---|---|---|---|
| US states | `https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json` | `d3.geoAlbersUsa()` | `.states` |
| World | `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json` | `d3.geoNaturalEarth1()` | `.countries` |

For the colour scale, build a quantize from one ramp. Stroke between regions is `var(--background)` (paper white), 0.5px.

---

## 8. Interactivity

### sendPrompt(text)

Global function available in all primitives. Sends the given text to the host's reasoning surface as if the reader typed it.

When a button triggers `sendPrompt`, append `→` to its label.

### Event handlers

Standard DOM. **No `<form>` tags** inside primitives.

### Live charts

`chart.data.datasets[0].data = newSeries; chart.update('none')`. The `'none'` mode suppresses animation.

### openLink(url)

Programmatic equivalent of clicking an `<a>`.

### State and storage

Primitives are stateless. No `localStorage`. State lives in JS variables for the lifetime of the rendered primitive.

---

## 9. Sandbox constraints

### CDN allowlist

`cdnjs.cloudflare.com`, `esm.sh`, `cdn.jsdelivr.net`, `unpkg.com`. All others fail silently. Inline data at generation time as JS literals.

### Iframe sizing

The iframe sizes itself to in-flow content height. `position: fixed` collapses it. For modals build a faux viewport with a normal-flow wrapper.

---

## 10. Accessibility

- HTML primitives begin with a visually-hidden `<h2>` summarizing the figure.
- SVG primitives use `role="img"` with `<title>` and `<desc>` as first children.
- Canvas elements use `role="img"` + descriptive `aria-label` + fallback text.
- Color is never the only encoding.
- Decorative icons get `aria-hidden="true"`; icon-only interactive elements get `aria-label`.

---

## 11. Streaming behaviour

**HTML:** short `<style>` block (or inline `style="…"`) → content → `<script>` last.
**SVG:** `<defs>` (arrow marker) → visual elements immediately.

Avoid during streaming: gradients, shadows, blur, tabs, carousels, `display: none` sections.

---

## 12. Integration

The author generates the markup; the host supplies the design tokens, the Lucide icon font, and the `sendPrompt` bridge. Inline data at generation time. Primitives degrade to prose — no visual is better than a forced one.
