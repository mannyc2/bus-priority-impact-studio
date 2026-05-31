---
title: UI Backlog For User
type: engineering
status: active
last_updated: 2026-05-25
owner: codex
tags: [ui, backlog, design-review]
---

# UI Backlog For User

Backend work can expose UI needs, but user-facing visual changes need explicit user direction and a reference design before implementation.

## 2026-05-25

- Gap: Slow-segment rows now receive sparse optional public AI notes with a required source line; the UI may need a source-line treatment for expanded notes.
- Surfaced in: `apps/web/src/studio/pages/route-detail.tsx` slow-segments route detail surface.
- Deferred change: I would have added the `Source: ...` line under expanded note prose and reviewed the note glyph/click behavior, but did not make visual/copy changes without a reference design.

- Gap: The sticky right-side segment AI note panel appears to be a recent frontend surface added without a tarbell/reference-design trail.
- Surfaced in: `apps/web/src/studio/pages/route-detail.tsx` (`SegmentAiNotePanel`) and the slow-segments experience.
- Deferred change: I would remove or redesign that panel around the established sparse-row pattern, but did not remove UI on my own.

- Gap: HTML reference for the Ladder tab (`knowledge/raw/assets/route-detail-ladder-tab.html`) shows a third right-rail ghost button "Open hour-by-hour breakdown" alongside `Send to brief →` and `Compare similar segments`. There's no destination surface for an hour-by-hour breakdown yet — neither a route in `/apps/web/src/routes/` nor a brief-composer slot.
- Surfaced in: `apps/web/src/studio/pages/route-ladder.tsx` `SelectedSegmentDetail` (the right rail of the inlined Ladder tab).
- Deferred change: Omitted the third button rather than stubbing it with a disabled state or no-op handler. Either design the destination surface or decide the two-button stack is the final shape.

- Gap: HTML reference shows a `TimeWindowPill` (12-month grid with intervention markers) above the ladder column headers, plus a 14-day per-segment sparkline in the right-rail metric card. Neither is rendered, because we don't carry per-month or per-segment-day time series on the segment payload.
- Surfaced in: `apps/web/src/studio/pages/route-ladder.tsx` `LadderTabContent` (center column header area) and `SelectedSegmentDetail` (metric card).
- Deferred change: Pill and sparkline are not rendered (no placeholders, per the doctrine). The bottom tip strip was shortened to "Click any segment to focus." so it doesn't reference the missing picker. Both surfaces should come back once the segment payload carries the underlying series.
