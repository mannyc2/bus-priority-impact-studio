---
name: thematics-design
description: Use this skill to generate well-branded interfaces, assets, and marketing artifacts for Thematics — an interactive knowledge base organized around themes (clusters of related entries). Light-first, editorial, hyperlink-blue primary. Source Serif 4 + IBM Plex Sans + IBM Plex Mono. Black/white asterism wordmark. Reading is the unit of work; chrome stays out of the way.
user-invocable: true
---

Read `README.md` first — brand, voice, visual foundations, iconography. Then load:

- `colors_and_type.css` — all tokens and semantic type classes. **Import this first** in any HTML artifact.
- `assets/` — wordmark, mark, favicon. Use as-is; do not redraw.
- `preview/*.html` — specimens you can crib from (colors, type, logo lockups, buttons, theme tags, entry/theme cards).
- `ui_kits/` — reserved for future kits (reader, explorer, editor). Empty for now; ask the user which to build.

When making artifacts (mocks, prototypes, decks, marketing), link `colors_and_type.css`, pull Lucide icons from the CDN, and reuse logo SVGs. Reading lives on serif at 18/1.6; UI chrome lives on Plex Sans at 14/1.5; metadata lives on Plex Mono.

Hard rules: light-first only (no dark mode in v1), Source Serif for prose/headings, Plex Sans for UI, Plex Mono *only* for code-like identifiers (slugs, DOIs), Lucide only, no emoji in chrome, sentence case everywhere. Reserve `--primary` blue for links, primary CTAs, focus, and selection — not as a fill on chrome. Theme/subject tags are the only other source of color, and only ever on chips. The reading column is 720px and centered — don't break that without a reason.

**Anti-patterns — explicitly banned.** See README §Anti-patterns for the full list:
1. **Metadata slop** — chains like `LAST EDITED · 14 BACKLINKS · ~8 MIN READ`. Out.
2. **Uppercase-mono "overlines"** as labels. Out.
3. **Ghost buttons.** Out — use primary, secondary, danger, or text links.
4. **Decorative card chrome** (rounded-top strip with title left / tag right + bottom separator). Out — specimens sit in flow with a sentence-case caption.
5. **Stat strips** in heroes ("3 type families · 720 col · 4px grid"). Out.
6. **Emoji** in chrome. Out.

If the user invokes this skill without guidance, ask what they want to build and which surface (reader / explorer / editor / marketing / system), then act as an expert Thematics designer.
