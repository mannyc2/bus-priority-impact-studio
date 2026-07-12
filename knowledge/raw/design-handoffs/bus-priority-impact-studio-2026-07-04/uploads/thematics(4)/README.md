# Thematics Design System

A design kit for **Thematics** — an **interactive knowledge base** organized around *themes* (clusters of related ideas, entries, and references) rather than flat folders. The product should feel like a **modern editorial library**: paper-white, generous, link-forward — closer to a thoughtful encyclopedia than a chat app.

> Light-first. Editorial. Hyperlink-blue. Cross-references are first-class.

Primary user: curious readers and contributors who think across topics — researchers, knowledge workers, autodidacts. The reading surface earns the same care as a printed page; the chrome stays out of the way.

---

## Sources & provenance

This design system was written from scratch for the Thematics project, with structural cues borrowed from the Cabal design kit (README + tokens + preview cards + UI kits). There is no upstream codebase yet — everything here is the source of truth.

- **Type:** Source Serif 4 + IBM Plex Sans + IBM Plex Mono, all via Google Fonts.
- **Icons:** Lucide (per-icon, via CDN or `lucide-react` once a UI kit exists).
- **Logo:** an original lowercase serif wordmark paired with an **asterism mark** (three dots in a triangle — a centuries-old typographic glyph for *grouping* or *theme break*).

---

## Index

| File | What it is |
|---|---|
| `README.md` | This file — brand, voice, visual foundations, iconography. |
| `colors_and_type.css` | All tokens and semantic type classes. Import first. |
| `SKILL.md` | Agent Skill front-matter. |
| `assets/` | Wordmark, mark, favicon. |
| `preview/` | Individual specimen cards (colors, type, logo, buttons, badges, theme tags, cards). Rendered in the **Design System** tab. |
| `ui_kits/` | Reserved for future UI kits (reader, explorer, editor). |

---

## Canonical product naming

| Product term | Meaning |
|---|---|
| **Theme** | A curated cluster of entries on a topic. The organizing unit. |
| **Entry** | A single article / atomic page. |
| **Reference** | Citation / external source. |
| **Backlink** | Another entry that links *into* this one. |
| **Crossref** | Inline link to another entry. |
| **Branch** | A reader's personal note appended to an entry (optional, scoped to a workspace). |
| **Index** | The browseable list of all entries within a theme. |

Avoid in copy: `node`, `doc`, `page` (use **entry**), `tag` (use **theme** or **subject**).

---

## CONTENT FUNDAMENTALS

Thematics writes like a **patient editor**, not a marketer or assistant.

### Voice & tone
- **Curious, careful, generous.** "12 entries — and 4 in draft." Specific, never hedging.
- **Second-person sparingly.** Prefer naming the object: "*Entry has unsaved changes*" over "*You have unsaved changes*".
- **No marketing puff inside the app.** Empty states explain what the surface is *for*, not why it's great.
- **Cross-references are surfaced, not hidden.** Sentences like "See also: *Bauhaus pedagogy*, *Black Mountain College*." appear at the bottom of every entry.
- **Time and provenance matter.** Every entry shows last-edited time and contributor count in the metadata strip.

### Casing
- **Sentence case everywhere.** Titles, buttons, menu items, entry headings, metadata labels, table column heads — all sentence case. There is no uppercase-styled label in the system.
- **Code-style mono** is reserved for things that are literally code or identifiers: slugs (`/themes/architecture-history`), DOIs, raw timestamps inside a debug surface. Never for English labels.

### Examples
- Empty state: **"No entries in this theme yet. Add the first one."**
- Save state: **"Saved 2 min ago"** — sentence-case sans, muted.
- Backlinks header: **"Linked from 14 entries"** — a sentence, not a stat chip.
- Reference footnote: **"¹ Tschichold, *Die neue Typographie* (1928), p. 17."** — italic title, page in plain serif.
- Search placeholder: **"Search entries, themes, references…"**

### Emoji
- **No emoji in product chrome.** Period.
- Em-dashes (`—`) for asides; the asterism (`⁂`) is reserved for section breaks within long entries (it's the brand mark, used sparingly).

### Numbers
- Counts inside sentences read as English: **“Linked from 14 entries.”** Not a row of pills.
- Dates: human, sans. `Mar 14, 2026`. Use the raw ISO form (`2026-03-14`) only inside dev surfaces.
- Reading time: only show when it's actually useful (a long-form entry), and write it like prose — **“eight-minute read”** — not as a mono chip.
- Tabular numbers belong in **tables**: data dense, aligned columns. Apply `font-variant-numeric: tabular-nums` inline on those cells. Don't make a class for it.
- Missing values: **em-dash `—`**, never `N/A`.

---

## ANTI-PATTERNS

Things the system explicitly forbids. These are out because they are the visual tells of generic, AI-generated, design-system-by-the-numbers work — they have no place in Thematics.

### 1. Metadata slop
**Banned.** The pattern of stringing mono-numeric metadata into a chain, usually under or above a card title:

> `LAST EDITED · 14 BACKLINKS · ~8 MIN READ · 2026-03-14 · 4 CONTRIBUTORS`

This is filler. It is what gets added when the author has nothing real to say. **Rule:** show at most one piece of metadata, only when it is the answer to a question the reader is asking *right now*, and write it as a sentence in plain sans — not as a tabular chain.

### 2. Uppercase-mono "overlines"
**Banned.** The small `LETTER-SPACED MONO LABEL` above a heading, on a card, or as a section opener. It's a visual trope that adds rigidity without information. If a section needs a label, use the section's actual heading; if a card needs context, show the subject chip.

### 3. Ghost buttons
**Banned.** Transparent buttons with no border read as not-buttons until hovered. We have three button kinds: **primary** (filled blue), **secondary** (white, hairline border), **danger** (red ink, hairline border). Quiet actions become **text links** (inline, primary-underlined). A row of bare-text buttons is not allowed.

### 4. Decorative card chrome
**Banned.** The "specimen card" pattern — a small rounded-top header strip with a title on the left and a tag on the right, a 1px separator, then the content below — is design-system clip-art. Specimens in this system sit in the page flow with a small sentence-case caption nearby; the specimen itself is the chrome.

### 5. Stat strips in heroes / marketing
**Banned.** Four-column rows under a hero saying things like "3 type families · 720 reading column · 4px grid." Same family as metadata slop. If a number is worth surfacing, it earns a sentence.

### 6. Emoji in product chrome
**Banned.** Em-dashes, the asterism `⋆`, and Lucide icons are the entire pictographic vocabulary.

---

## VISUAL FOUNDATIONS

### Palette

**Surface stack** — quiet, paper-feeling neutrals:

| Token | Hex | Role |
|---|---|---|
| `--background` | `#FFFFFF` | App shell, reader surface |
| `--surface` | `#FAFAF9` | Cards, panels, side rail |
| `--surface-2` | `#F4F4F2` | Code blocks, input track, wells |
| `--surface-3` | `#ECEBE7` | Row hover, soft divider |

**Ink**

| Token | Hex | Role |
|---|---|---|
| `--foreground` | `#0A0A0B` | Body, headings |
| `--muted-foreground` | `#6B6B6F` | Metadata, captions |
| `--subtle-foreground` | `#9A9A9D` | Placeholders, tertiary |

**Primary — hyperlink blue:** `#1457E6`. Used for links, primary buttons, focus rings, selection, and the one "lit" moment per surface. Text on primary is pure white.

**Subject tags** — used **only on theme chips and topic legends**, never on chrome. Pick by topic, not by hierarchy. All five share a recipe: dark ink (~`oklch(0.45 0.10 H)`) on a soft fill (~`oklch(0.96 0.04 H)`).

| Subject | Ink | Soft |
|---|---|---|
| Amber | `#8C6E2D` | `#FBF3E0` |
| Emerald | `#1F7A55` | `#E6F4ED` |
| Crimson | `#B83A4F` | `#FBE8EC` |
| Violet | `#6B4FB8` | `#EEEAFA` |
| Ocean | `#2A6EA8` | `#E4EFF8` |

**Status (utility, not chrome):** `--success`, `--caution`, `--danger`. Reserved for save/error/conflict signaling.

### Typography

A **three-family system** that maps to function:

- **Source Serif 4** — display, headings, prose reading. Optical-sizing on. Weights 400/500/600/700, with italic for asides.
- **IBM Plex Sans** — all UI chrome: buttons, menus, table cells (non-numeric), tooltips, captions.
- **IBM Plex Mono** — metadata labels, numbers in tables, IDs, slugs, timestamps, citation page numbers, the `OVERLINE` style.

Scale (px): `56 / 40 / 28 / 22 / 18 / 17 / 16 / 14 / 13 / 12 / 11`. Reading body sits at **18/1.6 in serif**; UI body at **14/1.5 in sans**. Captions and overlines are mono.

**Reading column** is the most important measurement: **720px wide**, centered, with 64px of breathing room either side. Don't break this without reason.

### Spacing & layout
- **4px grid.** `space-3` (12px) between card internals; `space-4`–`space-6` (16–24px) between sections; `space-12`+ for editorial whitespace around the reader.
- Max content widths: **1280px** for the shell, **1080px** for the explorer/index, **720px** for the reader.
- Layout postures:
  - **Reader** — centered column, generous margins, optional left TOC rail.
  - **Explorer** — three-column shell: theme nav (left, ~260px), entry list (middle), preview (right).
  - **Theme landing** — full-width grid of entry cards with a curated lede at top.

### Backgrounds & imagery
- **Flat `--background` everywhere.** No gradients. No page-level decoration.
- Imagery: **inline figures within entries** — always with a caption (mono, muted, italic-optional) and a source line below.
- Avoid stock illustrations entirely. Diagrams and schematics are the only "decorative" assets — drawn as clean black-and-blue line art.

### Animation
- **Brief and utilitarian.** Color transitions ~140ms ease-out. Layout shifts ~200ms with `cubic-bezier(0.2, 0, 0, 1)`.
- One signature motion: **hover preview** of a crossref expands inline below the link, in `~180ms`. Press-Esc or click-out to dismiss.
- No springs, no bounces, no continuous-loop animations.

### Hover / press / focus
- **Hover (interactive surfaces):** background shifts to `--surface` (on white) or `--surface-2` (on surface). Borders lift to `--border-strong`. Color does **not** change unless it's a destructive cue.
- **Press:** primary buttons darken to `--primary-hover`; ghost buttons darken background one step. No translate.
- **Focus ring:** `box-shadow: 0 0 0 3px var(--ring)` — 3px primary-blue at 35% opacity, no border tint. Applied via `:focus-visible` everywhere.
- **Selection:** text selection background is `--primary-soft` (#E6EEFD), preserving readable foreground.

### Borders
- **1px hairline** in `--border` is the default. `--border-strong` for inputs and emphasized dividers.
- **Reader content** has no top/bottom rules; structure comes from white space and type, not from lines.
- Theme cards: hairline + 12px radius; never a heavy outline.

### Shadows
- **Mostly absent.** Depth is hairlines + tint, not float.
- Allowed:
  - `--shadow-1` on hover-elevated cards (interactive ones).
  - `--shadow-2` on floating popovers and crossref previews.
  - `--shadow-3` on modals.
- **Never** on the reader, buttons, inputs, or theme cards at rest.

### Corner radii
- Cards and surfaces: **12px** (`--radius-xl`).
- Buttons and inputs: **8px** (`--radius`).
- Theme chips and subject tags: **pill** (`--radius-pill`).
- Avatars and figure thumbnails: **4–6px** — never circles for entry imagery (circles imply people, not concepts).

### Cards
- Default: `background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 20px;`.
- Header is a label row (mono overline) + serif title + sans metadata strip.
- Interactive cards (entries, themes) gain `--shadow-1` and a `--border-strong` hairline on hover; no movement.

### "Capsules" — theme chips
- The only widespread use of color outside primary is the **theme chip**: a small pill that carries the subject color (ink + soft fill).
- Stays small (h: 22px, font-size: 11px mono uppercase or 12px sans). Always paired with the theme name.

### Layout chrome
- **Top nav** — sticky, 64px, white with a 1px bottom border. Wordmark left, search center (640px max), user/right.
- **Left rail** (explorer) — `--surface` background, no right border (color does the work).
- **Right rail** (reader) — outline / TOC / backlinks. White background, hairline left border.
- **Composer / editor toolbar** — sticky top within the reader pane, white, 1px bottom border.

---

## ICONOGRAPHY

**Lucide** is canonical. Per-icon import (no full sprite). Reasons to like Lucide here: stroke geometry matches the typographic weight of Plex Sans well; the library covers everything a knowledge base needs (search, link, bookmark, history, quote, list, sidebar).

- **Sizes:** 14px inline; 16px UI body; 20px for section headers; 24px max for empty states.
- **Stroke:** Lucide default (1.5px). Do not override.
- **Color:** inherit text color (`currentColor`). Primary blue only when the icon is the affordance for a link/action (e.g., the `external-link` icon next to a primary CTA).
- **No emoji.** No custom icon font. No SVG flourishes — if an idea needs more than a Lucide icon, it needs a figure.

### The asterism (⁂)
- The brand mark **and** the section-break glyph inside long entries.
- Center it on its own line with 32px space above and below; serif, `--muted-foreground`.

### Brand marks shipped
- `assets/thematics-wordmark.svg` — full lockup (mark + "thematics").
- `assets/thematics-mark.svg` — square, mark only.
- `assets/thematics-favicon.svg` — inverted (white mark on near-black square, 12px radius).

---

## What Thematics is NOT (for framing)

Avoid positioning it as: a note-taking app, a wiki host, a chat assistant, a research tool with AI summaries pasted everywhere, a graph-view-first product (the graph is a side panel, never the home).

Thematics is **a library of themed entries**: structured reading, careful cross-referencing, plain typography, and as little chrome as possible.
