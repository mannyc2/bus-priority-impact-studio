import type { RouteSurfaceCapability, StudioRouteCapability } from "@/studio/api-contract";

/**
 * The manifest-driven section registry (frontend §8.1): each route-detail tab
 * declares which capability surfaces back it, and the manifest decides whether
 * the tab renders its section, shows one of the four honest-empty states
 * (§8.2), or disappears entirely. This is what kills the uniform page — a
 * sparse route and a flagship route no longer pretend to have the same dossier.
 *
 * `overview` and `evidence` are unconditional: the verdict and the
 * provenance story must render for every route, however thin.
 */
const TAB_SURFACES: Record<string, readonly string[]> = {
  overview: [],
  "where-when": ["speedHistory"],
  riders: ["ridership"],
  treatments: ["treatment"],
  evidence: [],
};

/** The four honest-empty visual states (§8.2). */
export type HonestEmptyState = "building" | "insufficient_data" | "checked_clean" | "blocked";

export type SectionPresentation =
  | { mode: "render" }
  | { mode: "empty"; state: HonestEmptyState; reason: string | null; dataAsOf: string | null }
  | { mode: "hidden" };

/** Higher = closer to rendering. Governs which backing surface speaks for a tab. */
const STATE_RANK: Record<RouteSurfaceCapability["state"], number> = {
  ready: 6,
  partial: 5,
  checked_clean: 4,
  building: 3,
  insufficient_data: 2,
  blocked: 1,
  not_applicable: 0,
};

export function sectionPresentation(
  capability: StudioRouteCapability | null,
  tabValue: string,
): SectionPresentation {
  const surfaceKeys = TAB_SURFACES[tabValue] ?? [];
  // No manifest (legacy fallback) or unconditional tab: render as before.
  if (capability === null || surfaceKeys.length === 0) return { mode: "render" };

  const surfaces = surfaceKeys
    .map((key) => capability.surfaces[key])
    .filter((surface): surface is RouteSurfaceCapability => surface !== undefined);
  // Manifest exists but says nothing about these surfaces: render rather than
  // hide on missing data about the data.
  if (surfaces.length === 0) return { mode: "render" };

  const governing = surfaces.reduce((best, surface) =>
    STATE_RANK[surface.state] > STATE_RANK[best.state] ? surface : best,
  );
  switch (governing.state) {
    case "ready":
    case "partial":
      return { mode: "render" };
    case "not_applicable":
      return { mode: "hidden" };
    default:
      return {
        mode: "empty",
        state: governing.state,
        reason: governing.reason,
        dataAsOf: governing.dataAsOf,
      };
  }
}
