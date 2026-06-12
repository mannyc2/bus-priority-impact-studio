import type { RouteSurfaceCapability, StudioRouteCapability } from "@/studio/api-contract";

export type RouteDetailTabValue =
  | "overview"
  | "map"
  | "where-when"
  | "reliability"
  | "riders"
  | "treatments"
  | "evidence";

export type RouteDetailTab = {
  value: RouteDetailTabValue;
  label: string;
  question?: string;
  badge?: { count: number; severity: "low" | "medium" | "high" } | undefined;
  emptyState?: HonestEmptyState | undefined;
};

export const ROUTE_SECTION_QUESTIONS = {
  overview: "What's the story?",
  map: "Where is this route, and where does it hurt?",
  "where-when": "Where and when does it lose time?",
  reliability: "Can riders count on it?",
  riders: "Who bears it?",
  treatments: "What was tried, and what happened?",
  evidence: "What can I cite, and what did you check?",
} as const satisfies Record<RouteDetailTabValue, string>;

/** The question-shaped route-section tabs (frontend §4.3). Treatments & history
 * absorbs the old Interventions and Timeline tabs; Evidence absorbs Data notes.
 * Compare still consumes a subset until map/reliability compare sections exist. */
export const ROUTE_DETAIL_TABS = [
  { value: "overview", label: "Overview", question: ROUTE_SECTION_QUESTIONS.overview },
  { value: "map", label: "Map", question: ROUTE_SECTION_QUESTIONS.map },
  { value: "where-when", label: "Where & when", question: ROUTE_SECTION_QUESTIONS["where-when"] },
  { value: "reliability", label: "Reliability", question: ROUTE_SECTION_QUESTIONS.reliability },
  { value: "riders", label: "Riders", question: ROUTE_SECTION_QUESTIONS.riders },
  {
    value: "treatments",
    label: "Treatments & history",
    question: ROUTE_SECTION_QUESTIONS.treatments,
  },
  { value: "evidence", label: "Evidence", question: ROUTE_SECTION_QUESTIONS.evidence },
] as const satisfies readonly RouteDetailTab[];

export function routeSectionQuestion(tabValue: RouteDetailTabValue): string {
  return ROUTE_SECTION_QUESTIONS[tabValue];
}

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
const TAB_CONFIG: Record<RouteDetailTabValue, RouteSectionConfig> = {
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
  tab: RouteDetailTab;
  presentation: Extract<SectionPresentation, { mode: "hidden" }>;
};

export type RouteSectionRegistry = {
  presentations: Record<RouteDetailTabValue, SectionPresentation>;
  visibleTabs: RouteDetailTab[];
  hiddenSections: HiddenRouteSectionEntry[];
};

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
  tabValue: RouteDetailTabValue,
): SectionPresentation {
  const config = TAB_CONFIG[tabValue];
  const surfaceKeys = config.surfaces;
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
  tabBadges: Partial<Record<RouteDetailTabValue, RouteDetailTab["badge"]>> = {},
): RouteSectionRegistry {
  const presentations = {} as Record<RouteDetailTabValue, SectionPresentation>;
  const visibleTabs: RouteDetailTab[] = [];
  const hiddenSections: HiddenRouteSectionEntry[] = [];

  for (const tab of ROUTE_DETAIL_TABS) {
    const presentation = sectionPresentation(capability, tab.value);
    const sourceBadge = tabBadges[tab.value];
    const badge =
      tab.value === "evidence" && hiddenSections.length > 0
        ? sourceBadge === undefined
          ? { count: hiddenSections.length, severity: "medium" as const }
          : { count: sourceBadge.count + hiddenSections.length, severity: sourceBadge.severity }
        : sourceBadge;
    const badgedTab = badge === undefined ? tab : { ...tab, badge };
    presentations[tab.value] = presentation;
    if (presentation.mode === "hidden") {
      hiddenSections.push({ tab: badgedTab, presentation });
      continue;
    }

    visibleTabs.push(
      presentation.mode === "empty" ? { ...badgedTab, emptyState: presentation.state } : badgedTab,
    );
  }

  return { presentations, visibleTabs, hiddenSections };
}

export function routeSectionCanNavigate(
  registry: Pick<RouteSectionRegistry, "presentations">,
  tabValue: RouteDetailTabValue,
): boolean {
  return registry.presentations[tabValue].mode !== "hidden";
}

export function routeSectionNavigationTarget(
  registry: Pick<RouteSectionRegistry, "presentations">,
  tabValue: RouteDetailTabValue,
  fallback: RouteDetailTabValue | null = "evidence",
): RouteDetailTabValue | null {
  if (routeSectionCanNavigate(registry, tabValue)) return tabValue;
  if (fallback === null) return null;
  return routeSectionCanNavigate(registry, fallback) ? fallback : null;
}
