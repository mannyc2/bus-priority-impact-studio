# Design Handoff Gap Scope

Source: Anthropic Design handoff `1kRVmoz-A6uPPCkDqssp4g`, downloaded 2026-05-20.

## Implemented In This Slice

- Exposed `Methods` in the primary Studio navigation.
- Rebuilt the Methods page as the handoff's Data page concept:
  - dataset cards with source grain, cadence, schema keys, row/period/citation metadata
  - metric definitions
  - publication caveats
  - qualitative/source references
- Updated route detail tabs toward the handoff structure:
  - added `Ladder` as a route-detail tab
  - renamed `Methodology` to `Data notes`
  - added an embedded ladder preview with a link to the full ladder interaction
- Updated the brief composer toward `Evidence Composer.html` / `composer-focus.html`:
  - added inline evidence search below attached evidence
  - pre-seeds search from the active claim
  - separates suggested evidence from other results
  - preserves click-to-attach behavior and a persistent strength meter
- Instantiated `states.jsx` patterns in production contexts:
  - added pending skeletons for route search, findings feed, and route detail loaders
  - replaced plain filtered-empty messages with structured empty states
  - added grouped empty states for route/finding/brief search results

## Remaining Gaps

- The design-system page exists as a dev gallery, but it is not a full production
  equivalent of the handoff's `design-system.html`.
- `tweaks-panel.jsx` is a prototype-only editing utility and is not planned for
  production unless a runtime theme/tuning panel becomes a product feature.

## Verification Notes

- Desktop and mobile screenshots were checked for `/methods`.
- Route-detail screenshot validation was blocked by a local Worker/D1 route API failure
  unrelated to this UI change: `Studio API projection artifact failed contract validation:
  studio/v1/routes.json`.
