import type {
  RouteDossierSummaryForDetail,
  RouteSurfaceCapability,
  StudioRouteCapability,
} from "@/studio/api-contract";

export type RouteDossierArchetypeId = "flagship" | "standard" | "sparse" | "legacy";

export type RouteDossierArchetype = {
  id: RouteDossierArchetypeId;
  label: string;
  summary: string;
  badgeVariant: "good" | "accent" | "warn" | "neutral";
  completeSurfaceCount: number;
  deepSurfaceCount: number;
};

const COMPLETE_STATES = new Set<RouteSurfaceCapability["state"]>([
  "ready",
  "partial",
  "checked_clean",
]);

const EVIDENCE_QUESTION_SURFACES = [
  "condition",
  "speedHistory",
  "ridership",
  "treatment",
  "detectorFindings",
  "reliability",
  "map",
  "geometry",
  "routeGeometry",
  "scheduleBaseline",
];

export function routeDossierArchetype({
  capability,
  dossier,
}: {
  capability: StudioRouteCapability | null;
  dossier: RouteDossierSummaryForDetail | null;
}): RouteDossierArchetype {
  if (capability === null) {
    return {
      id: "legacy",
      label: "Legacy dossier",
      summary: "No capability manifest is published for this route yet.",
      badgeVariant: "neutral",
      completeSurfaceCount: 0,
      deepSurfaceCount: 0,
    };
  }

  const surfaces = Object.values(capability.surfaces);
  const completeSurfaceCount = surfaces.filter((surface) =>
    COMPLETE_STATES.has(surface.state),
  ).length;
  const deepSurfaceCount =
    surfaces.filter((surface) => (surface.depth?.monthsCovered ?? 0) >= 24).length +
    [dossier?.speed.sparkline.length ?? 0, dossier?.ridership.sparkline.length ?? 0].filter(
      (months) => months >= 24,
    ).length;
  const questionSurfaceCount = EVIDENCE_QUESTION_SURFACES.filter((key) => {
    const surface = capability.surfaces[key];
    return surface !== undefined && COMPLETE_STATES.has(surface.state);
  }).length;

  if (capability.overallState === "building" || completeSurfaceCount <= 2) {
    return {
      id: "sparse",
      label: "Sparse dossier",
      summary: `${completeSurfaceCount} evidence surface(s) are published; several sections still need route-level support.`,
      badgeVariant: "warn",
      completeSurfaceCount,
      deepSurfaceCount,
    };
  }

  if (completeSurfaceCount >= 6 && questionSurfaceCount >= 5 && deepSurfaceCount > 0) {
    return {
      id: "flagship",
      label: "Flagship dossier",
      summary: `${completeSurfaceCount} evidence surfaces are published, including ${deepSurfaceCount} multi-year surface(s).`,
      badgeVariant: "good",
      completeSurfaceCount,
      deepSurfaceCount,
    };
  }

  return {
    id: "standard",
    label: "Standard dossier",
    summary: `${completeSurfaceCount} evidence surface(s) are published; richer multi-year sections appear as they clear support gates.`,
    badgeVariant: "accent",
    completeSurfaceCount,
    deepSurfaceCount,
  };
}
