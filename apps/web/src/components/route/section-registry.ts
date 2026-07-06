import type { RouteSurfaceCapability, StudioRouteCapability } from "@/studio/api-contract";

export type RouteDetailSectionValue =
  | "overview"
  | "map"
  | "where-when"
  | "reliability"
  | "riders"
  | "treatments"
  | "evidence";

export type RouteDetailSection = {
  value: RouteDetailSectionValue;
  label: string;
  badge?: { count: number; severity: "low" | "medium" | "high" } | undefined;
  emptyState?: HonestEmptyState | undefined;
};

export const ROUTE_SECTION_TITLES = {
  overview: "Overview",
  map: "Route map",
  "where-when": "Slow segments",
  reliability: "Reliability",
  riders: "Riders",
  treatments: "Treatments & history",
  evidence: "Evidence & data notes",
} as const satisfies Record<RouteDetailSectionValue, string>;

/** The route sections share one capability/honest-empty contract. */
export const ROUTE_DETAIL_SECTIONS = [
  { value: "overview", label: ROUTE_SECTION_TITLES.overview },
  { value: "where-when", label: ROUTE_SECTION_TITLES["where-when"] },
  { value: "map", label: ROUTE_SECTION_TITLES.map },
  { value: "reliability", label: ROUTE_SECTION_TITLES.reliability },
  { value: "riders", label: ROUTE_SECTION_TITLES.riders },
  { value: "treatments", label: ROUTE_SECTION_TITLES.treatments },
  { value: "evidence", label: ROUTE_SECTION_TITLES.evidence },
] as const satisfies readonly RouteDetailSection[];

export function routeSectionTitle(sectionValue: RouteDetailSectionValue): string {
  return ROUTE_SECTION_TITLES[sectionValue];
}

export function routeSectionAnchorId(sectionValue: RouteDetailSectionValue): string {
  return `route-section-${sectionValue}`;
}

/**
 * The manifest-driven section registry (frontend §8.1): each route-detail
 * section declares which capability surfaces back it, and the manifest decides
 * whether the section renders, shows one of the four honest-empty states
 * (§8.2), or disappears entirely. This is what keeps sparse and flagship
 * routes from pretending to have the same evidence depth.
 *
 * `overview` and `evidence` are unconditional: the public summary and
 * provenance must render for every route, however thin.
 */
const SECTION_CONFIG: Record<RouteDetailSectionValue, RouteSectionConfig> = {
  overview: { surfaces: [] },
  map: { surfaces: ["map", "geometry", "routeGeometry"] },
  "where-when": { surfaces: ["speedHistory"] },
  reliability: {
    surfaces: ["reliability"],
    hiddenStates: ["building", "insufficient_data", "not_applicable"],
  },
  riders: { surfaces: ["ridership"] },
  treatments: { surfaces: ["treatment"] },
  evidence: { surfaces: [] },
};

type RouteSectionConfig = {
  surfaces: readonly string[];
  hiddenStates?: readonly RouteSurfaceCapability["state"][];
};

/** The four honest-empty visual states (§8.2). */
export type HonestEmptyState = "building" | "insufficient_data" | "checked_clean" | "blocked";
export type HiddenSectionState = Exclude<RouteSurfaceCapability["state"], "ready" | "partial">;

export type SectionPresentation =
  | { mode: "render" }
  | { mode: "empty"; state: HonestEmptyState; reason: string | null; dataAsOf: string | null }
  | {
      mode: "hidden";
      state: HiddenSectionState;
      reason: string | null;
      dataAsOf: string | null;
    };

export type HiddenRouteSectionEntry = {
  section: RouteDetailSection;
  presentation: Extract<SectionPresentation, { mode: "hidden" }>;
};

export type RouteSectionRegistry = {
  presentations: Record<RouteDetailSectionValue, SectionPresentation>;
  visibleSections: RouteDetailSection[];
  hiddenSections: HiddenRouteSectionEntry[];
};

/** Higher = closer to rendering. Governs which backing surface speaks for a section. */
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
  sectionValue: RouteDetailSectionValue,
): SectionPresentation {
  const config = SECTION_CONFIG[sectionValue];
  const surfaceKeys = config.surfaces;
  // No manifest (legacy fallback) or unconditional section: render as before.
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
      return {
        mode: "hidden",
        state: governing.state,
        reason: governing.reason,
        dataAsOf: governing.dataAsOf,
      };
    default:
      if (config.hiddenStates?.includes(governing.state)) {
        return {
          mode: "hidden",
          state: governing.state,
          reason: governing.reason,
          dataAsOf: governing.dataAsOf,
        };
      }
      return {
        mode: "empty",
        state: governing.state,
        reason: governing.reason,
        dataAsOf: governing.dataAsOf,
      };
  }
}

export function routeSectionRegistry(
  capability: StudioRouteCapability | null,
  sectionBadges: Partial<Record<RouteDetailSectionValue, RouteDetailSection["badge"]>> = {},
): RouteSectionRegistry {
  const presentations = {} as Record<RouteDetailSectionValue, SectionPresentation>;
  const visibleSections: RouteDetailSection[] = [];
  const hiddenSections: HiddenRouteSectionEntry[] = [];

  for (const section of ROUTE_DETAIL_SECTIONS) {
    const presentation = sectionPresentation(capability, section.value);
    const sourceBadge = sectionBadges[section.value];
    const badge =
      section.value === "evidence" && hiddenSections.length > 0
        ? sourceBadge === undefined
          ? { count: hiddenSections.length, severity: "medium" as const }
          : {
              count: sourceBadge.count + hiddenSections.length,
              severity: sourceBadge.severity === "low" ? "medium" : sourceBadge.severity,
            }
        : sourceBadge;
    const badgedSection = badge === undefined ? section : { ...section, badge };
    presentations[section.value] = presentation;
    if (presentation.mode === "hidden") {
      hiddenSections.push({ section: badgedSection, presentation });
      continue;
    }

    visibleSections.push(
      presentation.mode === "empty"
        ? { ...badgedSection, emptyState: presentation.state }
        : badgedSection,
    );
  }

  return { presentations, visibleSections, hiddenSections };
}

export function routeSectionCanNavigate(
  registry: Pick<RouteSectionRegistry, "presentations">,
  sectionValue: RouteDetailSectionValue,
): boolean {
  return registry.presentations[sectionValue].mode !== "hidden";
}

export function routeSectionNavigationTarget(
  registry: Pick<RouteSectionRegistry, "presentations">,
  sectionValue: RouteDetailSectionValue,
  fallback: RouteDetailSectionValue | null = "evidence",
): RouteDetailSectionValue | null {
  if (routeSectionCanNavigate(registry, sectionValue)) return sectionValue;
  if (fallback === null) return null;
  return routeSectionCanNavigate(registry, fallback) ? fallback : null;
}

/* ---------------------------------------------------------------------------
 * Tab layer (frontend §4 redesign, plan 053)
 *
 * The route-detail page groups the capability-gated sections into four real
 * `?tab=` tabs. `evidence` belongs to NO tab: it renders unconditionally as the
 * "About this data" collapsible beneath whichever tab is active.
 * ------------------------------------------------------------------------- */

export type RouteDetailTabValue = "overview" | "segments" | "riders" | "history";

export const ROUTE_DETAIL_TABS = [
  { value: "overview", label: "Overview", sections: ["overview"] },
  { value: "segments", label: "Slow segments", sections: ["where-when", "map"] },
  { value: "riders", label: "Riders & reliability", sections: ["riders", "reliability"] },
  { value: "history", label: "Treatments & history", sections: ["treatments"] },
] as const satisfies readonly {
  value: RouteDetailTabValue;
  label: string;
  sections: readonly RouteDetailSectionValue[];
}[];

export type RouteDetailTab = (typeof ROUTE_DETAIL_TABS)[number];

/**
 * A tab's presentation is the BEST of its member sections: any member that
 * renders makes the tab render; otherwise the first honest-empty member carries
 * the tab (its state drives the trigger badge only); otherwise the tab is
 * hidden. Panels still render each member section through its own honest-empty
 * wrapper, so this collapse only governs the tab's visibility + trigger badge.
 */
export type RouteTabPresentation =
  | { mode: "render" }
  | { mode: "empty"; state: HonestEmptyState }
  | { mode: "hidden" };

export type RouteDetailTabView = {
  value: RouteDetailTabValue;
  label: string;
  presentation: RouteTabPresentation;
  badge?: RouteDetailSection["badge"];
};

export type RouteTabRegistry = {
  sectionRegistry: RouteSectionRegistry;
  visibleTabs: RouteDetailTabView[];
  presentations: Record<RouteDetailTabValue, RouteTabPresentation>;
};

export function tabPresentation(
  registry: Pick<RouteSectionRegistry, "presentations">,
  tab: RouteDetailTab,
): RouteTabPresentation {
  let empty: HonestEmptyState | null = null;
  for (const section of tab.sections) {
    const presentation = registry.presentations[section];
    if (presentation.mode === "render") return { mode: "render" };
    if (presentation.mode === "empty" && empty === null) empty = presentation.state;
  }
  return empty === null ? { mode: "hidden" } : { mode: "empty", state: empty };
}

const TAB_BADGE_SEVERITY_RANK: Record<"low" | "medium" | "high", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** A tab's badge is the sum of its member sections' notice counts, at the max
 * (most severe) severity among them. */
function tabBadge(
  tab: RouteDetailTab,
  sectionBadges: Partial<Record<RouteDetailSectionValue, RouteDetailSection["badge"]>>,
): RouteDetailSection["badge"] {
  let count = 0;
  let severity: "low" | "medium" | "high" | null = null;
  for (const section of tab.sections) {
    const badge = sectionBadges[section];
    if (badge === undefined) continue;
    count += badge.count;
    severity =
      severity === null ||
      TAB_BADGE_SEVERITY_RANK[badge.severity] < TAB_BADGE_SEVERITY_RANK[severity]
        ? badge.severity
        : severity;
  }
  return count > 0 && severity !== null ? { count, severity } : undefined;
}

export function routeTabRegistry(
  capability: StudioRouteCapability | null,
  sectionBadges: Partial<Record<RouteDetailSectionValue, RouteDetailSection["badge"]>> = {},
): RouteTabRegistry {
  const sectionRegistry = routeSectionRegistry(capability, sectionBadges);
  const presentations = {} as Record<RouteDetailTabValue, RouteTabPresentation>;
  const visibleTabs: RouteDetailTabView[] = [];

  for (const tab of ROUTE_DETAIL_TABS) {
    const presentation = tabPresentation(sectionRegistry, tab);
    presentations[tab.value] = presentation;
    // Overview is always visible; every other tab disappears only when hidden.
    if (presentation.mode === "hidden" && tab.value !== "overview") continue;
    const badge = tabBadge(tab, sectionBadges);
    visibleTabs.push({
      value: tab.value,
      label: tab.label,
      presentation,
      ...(badge === undefined ? {} : { badge }),
    });
  }

  return { sectionRegistry, visibleTabs, presentations };
}

/**
 * Maps a section to the tab that owns it; `evidence` belongs to no tab (it is
 * the always-present About-this-data collapsible). Converts the existing
 * `onNavigate(section)` callbacks into tab switches.
 */
export function routeTabForSection(section: RouteDetailSectionValue): RouteDetailTabValue | null {
  for (const tab of ROUTE_DETAIL_TABS) {
    if ((tab.sections as readonly RouteDetailSectionValue[]).includes(section)) return tab.value;
  }
  return null;
}
